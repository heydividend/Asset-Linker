import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  db,
  studyGroupSessions,
  studyGroupMessages,
  studyGroupArtifacts,
  topics,
  domains,
  topicMastery,
  questions,
  flashcards,
  notebooks,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { parseId } from "../lib/parseId";
import { chatJson } from "../lib/openaiHelpers";

const router: IRouter = Router();

const STUDY_GROUP_NOTEBOOK_TITLE = "Study Group";

async function getOrCreateStudyGroupNotebook(): Promise<number> {
  const [existing] = await db
    .select({ id: notebooks.id })
    .from(notebooks)
    .where(eq(notebooks.title, STUDY_GROUP_NOTEBOOK_TITLE))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(notebooks)
    .values({
      title: STUDY_GROUP_NOTEBOOK_TITLE,
      description: "Flashcards and questions promoted from Study Group sessions.",
    })
    .returning({ id: notebooks.id });
  return created.id;
}

interface ResolvedTopic {
  topicId: number;
  topicName: string;
  domainId: number | null;
  domainName: string | null;
  mastery: number | null;
}

async function pickWeakestTopic(): Promise<ResolvedTopic | null> {
  const mastery = await db.select().from(topicMastery);
  const tRows = await db
    .select({
      id: topics.id,
      name: topics.name,
      domainId: topics.domainId,
      domainName: domains.name,
    })
    .from(topics)
    .leftJoin(domains, eq(topics.domainId, domains.id));
  if (tRows.length === 0) return null;
  // Prefer attempted-but-weak; fall back to least-attempted/random.
  const attempted = mastery
    .filter((m) => m.attempts >= 1)
    .sort((a, b) => a.mastery - b.mastery);
  if (attempted[0]) {
    const t = tRows.find((r) => r.id === attempted[0].topicId);
    if (t) {
      return {
        topicId: t.id,
        topicName: t.name,
        domainId: t.domainId ?? null,
        domainName: t.domainName ?? null,
        mastery: attempted[0].mastery,
      };
    }
  }
  const random = tRows[Math.floor(Math.random() * tRows.length)];
  return {
    topicId: random.id,
    topicName: random.name,
    domainId: random.domainId ?? null,
    domainName: random.domainName ?? null,
    mastery: null,
  };
}

async function resolveTopic(topicId: number | null | undefined): Promise<ResolvedTopic | null> {
  if (topicId == null) return pickWeakestTopic();
  const [t] = await db
    .select({
      id: topics.id,
      name: topics.name,
      domainId: topics.domainId,
      domainName: domains.name,
    })
    .from(topics)
    .leftJoin(domains, eq(topics.domainId, domains.id))
    .where(eq(topics.id, topicId));
  if (!t) return pickWeakestTopic();
  const [m] = await db
    .select()
    .from(topicMastery)
    .where(eq(topicMastery.topicId, topicId));
  return {
    topicId: t.id,
    topicName: t.name,
    domainId: t.domainId ?? null,
    domainName: t.domainName ?? null,
    mastery: m?.mastery ?? null,
  };
}

async function pickQuestionForTopic(topicId: number): Promise<{
  id: number | null;
  stem: string;
  choices: string[] | null;
  correctIndex: number | null;
  rationale: string | null;
}> {
  const [q] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.enabled, true), eq(questions.topicId, topicId)))
    .orderBy(sql`random()`)
    .limit(1);
  if (q) {
    return {
      id: q.id,
      stem: q.stem,
      choices: q.choices,
      correctIndex: q.correctIndex,
      rationale: q.rationale ?? null,
    };
  }
  return { id: null, stem: "", choices: null, correctIndex: null, rationale: null };
}

const MENTOR_PERSONA = `You are Dr. Mentor, a graduate professor of Athletic Training and a long-time BOC item writer. You lead a small study group. Voice: precise, warm, Socratic. You frame the question, probe reasoning, correct misconceptions, and finish with a verdict that names the correct answer and the single most important "why".`;
const ALEX_PERSONA = `You are Alex — a recently BOC-certified athletic trainer (passed last year). You think out loud, lean on test-taking strategy (eliminate distractors, watch for absolutes, identify answer-choice families). You are confident but humble.`;
const JORDAN_PERSONA = `You are Jordan — a BOC-certified athletic trainer with 4 years of clinic + secondary-school experience. Bring real clinical anchors (mechanism, red flags, return-to-play). You will sometimes respectfully challenge Alex when the strategy answer differs from the clinical picture.`;

function speakerLabel(speaker: string): string {
  switch (speaker) {
    case "mentor":
      return "Dr. Mentor (Graduate Professor)";
    case "alex":
      return "Alex (BOC-certified peer)";
    case "jordan":
      return "Jordan (BOC-certified peer)";
    case "student":
      return "Student";
    default:
      return speaker;
  }
}

interface StreamHandle {
  push: (event: Record<string, unknown>) => void;
  end: () => void;
}

function startSseStream(res: import("express").Response): StreamHandle {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  return {
    push: (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    end: () => {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    },
  };
}

interface AgentTurnInput {
  sessionId: number;
  roundIndex: number;
  speaker: "mentor" | "alex" | "jordan";
  kind: string;
  questionId: number | null;
  systemPrompt: string;
  userPrompt: string;
  stream: StreamHandle;
  history: { role: "user" | "assistant"; content: string }[];
}

async function runAgentTurn(input: AgentTurnInput): Promise<{ messageId: number; content: string }> {
  const { sessionId, roundIndex, speaker, kind, questionId, systemPrompt, userPrompt, stream, history } = input;
  stream.push({
    type: "message_start",
    speaker,
    speakerLabel: speakerLabel(speaker),
    kind,
    roundIndex,
  });
  let full = "";
  try {
    const messages: { role: "user" | "assistant"; content: string }[] = [
      ...history,
      { role: "user", content: userPrompt },
    ];
    const stream$ = anthropic.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
    for await (const event of stream$) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const delta = event.delta.text;
        if (delta) {
          full += delta;
          stream.push({ type: "message_delta", speaker, content: delta });
        }
      }
    }
  } catch (err) {
    full = full || "(The agent had trouble responding — please try the round again.)";
    stream.push({ type: "error", speaker, error: "agent stream failed" });
  }
  const [saved] = await db
    .insert(studyGroupMessages)
    .values({
      sessionId,
      speaker,
      kind,
      content: full,
      roundIndex,
      questionId,
    })
    .returning();
  stream.push({
    type: "message_end",
    messageId: saved.id,
    speaker,
    kind,
    roundIndex,
    content: full,
  });
  return { messageId: saved.id, content: full };
}

// ---------- Routes ----------

router.get("/study-group/sessions", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(studyGroupSessions)
    .orderBy(desc(studyGroupSessions.createdAt))
    .limit(50);
  res.json(rows);
});

router.post("/study-group/sessions", async (req, res): Promise<void> => {
  const { topicId, focus } = req.body ?? {};
  const t = await resolveTopic(typeof topicId === "number" ? topicId : null);
  if (!t) {
    res.status(400).json({ error: "No topics available — seed the topic catalog first." });
    return;
  }
  const title = focus
    ? `${t.topicName} — ${String(focus).slice(0, 80)}`
    : t.topicName;
  const [session] = await db
    .insert(studyGroupSessions)
    .values({
      title,
      topicId: t.topicId,
      domainId: t.domainId,
      focus: typeof focus === "string" && focus.trim() ? focus.trim() : null,
      status: "active",
    })
    .returning();
  // Welcome system message so the transcript is never empty.
  await db.insert(studyGroupMessages).values({
    sessionId: session.id,
    speaker: "system",
    kind: "system",
    content: `Study group opened on **${t.topicName}**${t.domainName ? ` (${t.domainName})` : ""}. Click "Start round" when you're ready — Dr. Mentor will pose the first question.`,
    roundIndex: 0,
  });
  res.status(201).json(session);
});

router.get("/study-group/sessions/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [session] = await db.select().from(studyGroupSessions).where(eq(studyGroupSessions.id, id));
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const messages = await db
    .select()
    .from(studyGroupMessages)
    .where(eq(studyGroupMessages.sessionId, id))
    .orderBy(asc(studyGroupMessages.createdAt));
  const artifacts = await db
    .select()
    .from(studyGroupArtifacts)
    .where(eq(studyGroupArtifacts.sessionId, id))
    .orderBy(asc(studyGroupArtifacts.createdAt));
  res.json({ session, messages, artifacts });
});

router.delete("/study-group/sessions/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(studyGroupSessions).where(eq(studyGroupSessions.id, id));
  res.sendStatus(204);
});

router.patch("/study-group/sessions/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { status } = req.body ?? {};
  if (typeof status !== "string" || !["active", "paused", "finished"].includes(status)) {
    res.status(400).json({ error: "status must be active|paused|finished" });
    return;
  }
  const [updated] = await db
    .update(studyGroupSessions)
    .set({ status, updatedAt: new Date() })
    .where(eq(studyGroupSessions.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

router.post("/study-group/sessions/:id/round", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [session] = await db.select().from(studyGroupSessions).where(eq(studyGroupSessions.id, id));
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (session.topicId == null) {
    res.status(400).json({ error: "Session has no topic" });
    return;
  }
  const t = await resolveTopic(session.topicId);
  if (!t) {
    res.status(400).json({ error: "Topic missing" });
    return;
  }
  const stream = startSseStream(res);
  const roundIndex = session.roundCount + 1;

  // Mark active
  await db
    .update(studyGroupSessions)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(studyGroupSessions.id, id));

  // Pick a question or generate a topic-anchored prompt
  const q = await pickQuestionForTopic(t.topicId);
  const focusBlock = session.focus ? `Group focus from the user: ${session.focus}\n\n` : "";
  const topicBlock = `Topic: ${t.topicName}${t.domainName ? ` (Domain: ${t.domainName})` : ""}.\n${focusBlock}`;

  // Round 1: Mentor opens with the question
  let mentorPrompt: string;
  if (q.id != null && q.choices) {
    const choicesText = q.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`).join("\n");
    mentorPrompt = `${topicBlock}Open round ${roundIndex} of the study group. Restate this real BOC-style question in your own words and pose it to Alex and Jordan. Add a brief framing sentence about WHY this concept matters clinically. Do NOT reveal the answer yet. Keep it under 120 words.\n\nQuestion stem: ${q.stem}\nChoices:\n${choicesText}`;
  } else {
    mentorPrompt = `${topicBlock}Open round ${roundIndex} of the study group. Pose a single high-yield BOC-style multiple-choice question on this topic with 4 lettered choices (A–D). Add a brief framing sentence about why the concept matters clinically. Do NOT reveal the answer yet. Keep the whole turn under 160 words.`;
  }

  const mentorOpen = await runAgentTurn({
    sessionId: id,
    roundIndex,
    speaker: "mentor",
    kind: "question",
    questionId: q.id,
    systemPrompt: MENTOR_PERSONA,
    userPrompt: mentorPrompt,
    stream,
    history: [],
  });

  // Alex answers
  const alexAns = await runAgentTurn({
    sessionId: id,
    roundIndex,
    speaker: "alex",
    kind: "answer",
    questionId: q.id,
    systemPrompt: ALEX_PERSONA,
    userPrompt: `Dr. Mentor just posed this in our study group:\n\n${mentorOpen.content}\n\nAnswer the question. Pick a letter, then in 3–5 sentences walk through the test-taking moves you used (eliminate distractors, name the answer family, flag any extreme-statement traps). Stay under 130 words.`,
    stream,
    history: [],
  });

  // Jordan answers and may challenge Alex
  const jordanAns = await runAgentTurn({
    sessionId: id,
    roundIndex,
    speaker: "jordan",
    kind: "answer",
    questionId: q.id,
    systemPrompt: JORDAN_PERSONA,
    userPrompt: `Dr. Mentor posed this:\n\n${mentorOpen.content}\n\nAlex just said:\n\n${alexAns.content}\n\nGive your own answer with a clinical anchor (mechanism, red flag, RTP criterion, contraindication). If Alex was wrong or used a strategy that misfires here, respectfully challenge it in one sentence. Stay under 130 words.`,
    stream,
    history: [],
  });

  // Mentor verdict
  const verdictPrompt = q.id != null && q.correctIndex != null && q.choices
    ? `Adjudicate the round. Correct answer is **${String.fromCharCode(65 + q.correctIndex)}. ${q.choices[q.correctIndex]}**. Reference rationale (use as ground truth, do not quote verbatim): ${q.rationale ?? "(none provided)"}\n\nIn 4–6 sentences: name the correct letter; say which peer (or both) reasoned correctly and which trap any miss fell into; close with a one-line clinical pearl. Use **bold** for the correct answer.`
    : `Adjudicate the round you posed. Reveal the correct letter you had in mind, evaluate Alex's and Jordan's reasoning, name any traps, and close with a one-line clinical pearl. 4–6 sentences. Use **bold** for the correct answer.`;
  const verdict = await runAgentTurn({
    sessionId: id,
    roundIndex,
    speaker: "mentor",
    kind: "verdict",
    questionId: q.id,
    systemPrompt: MENTOR_PERSONA,
    userPrompt: `${verdictPrompt}\n\nAlex said:\n${alexAns.content}\n\nJordan said:\n${jordanAns.content}`,
    stream,
    history: [],
  });

  // Takeaway (group-extracted)
  const takeaway = await runAgentTurn({
    sessionId: id,
    roundIndex,
    speaker: "mentor",
    kind: "takeaway",
    questionId: q.id,
    systemPrompt: MENTOR_PERSONA,
    userPrompt: `Wrap the round with a "**Key takeaway:**" line (≤ 30 words) the group should remember. Then a separate "**Watch out for:**" line naming the single most likely trap a BOC test-taker falls for here.`,
    stream,
    history: [],
  });

  // Extract structured artifacts (flashcard candidate + reasoning pattern + question candidate)
  const transcript = `Q: ${mentorOpen.content}\nAlex: ${alexAns.content}\nJordan: ${jordanAns.content}\nMentor verdict: ${verdict.content}\nTakeaway: ${takeaway.content}`;
  type Extracted = {
    flashcard?: { front?: string; back?: string };
    reasoning_pattern?: string;
    question?: { stem?: string; choices?: string[]; correctIndex?: number; rationale?: string };
    mastery_signal?: { direction?: "up" | "down" | "neutral"; note?: string };
  };
  let extracted: Extracted = {};
  try {
    extracted = await chatJson<Extracted>(
      `From the following BOC Athletic Training study-group round on "${t.topicName}", extract structured artifacts.\n\nReturn JSON of the form:\n{\n  "flashcard": {"front": "<concise question>", "back": "<answer with one clinical anchor>"},\n  "reasoning_pattern": "<one sentence naming the test-taking pattern this round reinforced>",\n  "question": {"stem": "<new BOC-style stem>", "choices": ["A","B","C","D"], "correctIndex": <int 0-3>, "rationale": "<short rationale>"},\n  "mastery_signal": {"direction": "up|down|neutral", "note": "<short note>"}\n}\n\nROUND TRANSCRIPT:\n${transcript.slice(0, 5000)}`,
      "You extract structured study artifacts. Reply with strict JSON only.",
    );
  } catch {
    extracted = {};
  }
  const created: { kind: string; id: number; payload: Record<string, unknown> }[] = [];
  if (extracted.flashcard?.front && extracted.flashcard?.back) {
    const [a] = await db
      .insert(studyGroupArtifacts)
      .values({
        sessionId: id,
        roundIndex,
        kind: "flashcard_candidate",
        topicId: t.topicId,
        payload: { front: extracted.flashcard.front, back: extracted.flashcard.back },
      })
      .returning();
    created.push({ kind: a.kind, id: a.id, payload: a.payload });
  }
  if (extracted.reasoning_pattern) {
    const [a] = await db
      .insert(studyGroupArtifacts)
      .values({
        sessionId: id,
        roundIndex,
        kind: "reasoning_pattern",
        topicId: t.topicId,
        payload: { note: extracted.reasoning_pattern },
      })
      .returning();
    created.push({ kind: a.kind, id: a.id, payload: a.payload });
  }
  if (
    extracted.question?.stem &&
    Array.isArray(extracted.question.choices) &&
    extracted.question.choices.length >= 2 &&
    typeof extracted.question.correctIndex === "number"
  ) {
    const [a] = await db
      .insert(studyGroupArtifacts)
      .values({
        sessionId: id,
        roundIndex,
        kind: "question_candidate",
        topicId: t.topicId,
        payload: {
          stem: extracted.question.stem,
          choices: extracted.question.choices,
          correctIndex: extracted.question.correctIndex,
          rationale: extracted.question.rationale ?? "",
        },
      })
      .returning();
    created.push({ kind: a.kind, id: a.id, payload: a.payload });
  }
  if (extracted.mastery_signal?.direction) {
    const [a] = await db
      .insert(studyGroupArtifacts)
      .values({
        sessionId: id,
        roundIndex,
        kind: "mastery_signal",
        topicId: t.topicId,
        payload: {
          direction: extracted.mastery_signal.direction,
          note: extracted.mastery_signal.note ?? "",
        },
      })
      .returning();
    created.push({ kind: a.kind, id: a.id, payload: a.payload });
  }

  // Bump round counter
  await db
    .update(studyGroupSessions)
    .set({ roundCount: roundIndex, updatedAt: new Date() })
    .where(eq(studyGroupSessions.id, id));

  for (const a of created) {
    stream.push({ type: "artifact", artifact: a });
  }
  stream.end();
});

router.post("/study-group/sessions/:id/interject", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const content = req.body?.content;
  if (typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content required" });
    return;
  }
  const [session] = await db.select().from(studyGroupSessions).where(eq(studyGroupSessions.id, id));
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Persist student message
  await db.insert(studyGroupMessages).values({
    sessionId: id,
    speaker: "student",
    kind: "interjection",
    content: content.trim(),
    roundIndex: session.roundCount,
  });
  const stream = startSseStream(res);
  stream.push({
    type: "message_end",
    speaker: "student",
    kind: "interjection",
    roundIndex: session.roundCount,
    content: content.trim(),
  });

  const t = session.topicId ? await resolveTopic(session.topicId) : null;
  const topicLine = t ? `Topic under discussion: ${t.topicName}.` : "";

  // Mentor responds first, then one peer chimes in.
  const mentorReply = await runAgentTurn({
    sessionId: id,
    roundIndex: session.roundCount,
    speaker: "mentor",
    kind: "response",
    questionId: null,
    systemPrompt: MENTOR_PERSONA,
    userPrompt: `${topicLine}\n\nThe student just chimed in: "${content.trim()}"\n\nRespond directly to the student in 3–5 sentences. Correct any misconceptions, name the underlying concept, and end with a one-line cue they can use on a real exam item.`,
    stream,
    history: [],
  });
  // Pick peer based on simple alternation
  const peer: "alex" | "jordan" = session.roundCount % 2 === 0 ? "alex" : "jordan";
  await runAgentTurn({
    sessionId: id,
    roundIndex: session.roundCount,
    speaker: peer,
    kind: "response",
    questionId: null,
    systemPrompt: peer === "alex" ? ALEX_PERSONA : JORDAN_PERSONA,
    userPrompt: `Student asked: "${content.trim()}"\n\nDr. Mentor replied:\n${mentorReply.content}\n\nAdd ONE concrete example, mnemonic, or recent-exam analogue (≤ 80 words) that helps the student lock this in.`,
    stream,
    history: [],
  });
  stream.end();
});

router.post("/study-group/artifacts/:id/promote", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [a] = await db.select().from(studyGroupArtifacts).where(eq(studyGroupArtifacts.id, id));
  if (!a) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (a.promotedRefId) {
    res.status(409).json({ error: "Already promoted", refId: a.promotedRefId });
    return;
  }
  if (a.kind === "flashcard_candidate") {
    const payload = a.payload as { front?: string; back?: string };
    if (!payload.front || !payload.back) {
      res.status(400).json({ error: "Invalid flashcard payload" });
      return;
    }
    const notebookId = await getOrCreateStudyGroupNotebook();
    const [card] = await db
      .insert(flashcards)
      .values({
        notebookId,
        front: payload.front,
        back: payload.back,
        topicId: a.topicId ?? null,
        source: "study_group",
      })
      .returning();
    await db
      .update(studyGroupArtifacts)
      .set({ promotedRefId: card.id, promotedAt: new Date() })
      .where(eq(studyGroupArtifacts.id, id));
    res.status(201).json({ kind: "flashcard", id: card.id });
    return;
  }
  if (a.kind === "question_candidate") {
    const payload = a.payload as {
      stem?: string;
      choices?: string[];
      correctIndex?: number;
      rationale?: string;
    };
    if (
      !payload.stem ||
      !Array.isArray(payload.choices) ||
      payload.choices.length < 2 ||
      typeof payload.correctIndex !== "number"
    ) {
      res.status(400).json({ error: "Invalid question payload" });
      return;
    }
    // Look up domain for the question via topic
    let domainId: number | null = null;
    if (a.topicId) {
      const [t] = await db.select({ domainId: topics.domainId }).from(topics).where(eq(topics.id, a.topicId));
      domainId = t?.domainId ?? null;
    }
    const [qRow] = await db
      .insert(questions)
      .values({
        stem: payload.stem,
        choices: payload.choices,
        correctIndex: payload.correctIndex,
        rationale: payload.rationale ?? "(Promoted from study group — review pending.)",
        topicId: a.topicId ?? null,
        domainId,
        sourceKind: "study_group",
        enabled: true,
        pendingReview: true,
      })
      .returning();
    await db
      .update(studyGroupArtifacts)
      .set({ promotedRefId: qRow.id, promotedAt: new Date() })
      .where(eq(studyGroupArtifacts.id, id));
    res.status(201).json({ kind: "question", id: qRow.id });
    return;
  }
  res.status(400).json({ error: `Cannot promote ${a.kind}` });
});

router.get("/study-group/library", async (req, res): Promise<void> => {
  const pendingOnly = req.query.pendingReview === "true" || req.query.pendingReview === "1";

  // Promoted flashcards (artifact -> session -> flashcard, optional topic).
  const fcRows = await db
    .select({
      artifactId: studyGroupArtifacts.id,
      flashcardId: flashcards.id,
      sessionId: studyGroupSessions.id,
      sessionTitle: studyGroupSessions.title,
      roundIndex: studyGroupArtifacts.roundIndex,
      topicId: flashcards.topicId,
      topicName: topics.name,
      front: flashcards.front,
      back: flashcards.back,
      createdAt: flashcards.createdAt,
      promotedAt: studyGroupArtifacts.promotedAt,
    })
    .from(studyGroupArtifacts)
    .innerJoin(flashcards, eq(flashcards.id, studyGroupArtifacts.promotedRefId))
    .innerJoin(studyGroupSessions, eq(studyGroupSessions.id, studyGroupArtifacts.sessionId))
    .leftJoin(topics, eq(topics.id, flashcards.topicId))
    .where(
      and(
        eq(studyGroupArtifacts.kind, "flashcard_candidate"),
        isNotNull(studyGroupArtifacts.promotedRefId),
        eq(flashcards.source, "study_group"),
      ),
    )
    .orderBy(desc(studyGroupArtifacts.promotedAt));

  // Promoted questions
  const qConditions = [
    eq(studyGroupArtifacts.kind, "question_candidate"),
    isNotNull(studyGroupArtifacts.promotedRefId),
    eq(questions.sourceKind, "study_group"),
  ];
  if (pendingOnly) qConditions.push(eq(questions.pendingReview, true));
  const qRows = await db
    .select({
      artifactId: studyGroupArtifacts.id,
      questionId: questions.id,
      sessionId: studyGroupSessions.id,
      sessionTitle: studyGroupSessions.title,
      roundIndex: studyGroupArtifacts.roundIndex,
      topicId: questions.topicId,
      topicName: topics.name,
      stem: questions.stem,
      choices: questions.choices,
      correctIndex: questions.correctIndex,
      rationale: questions.rationale,
      pendingReview: questions.pendingReview,
      createdAt: questions.createdAt,
      promotedAt: studyGroupArtifacts.promotedAt,
    })
    .from(studyGroupArtifacts)
    .innerJoin(questions, eq(questions.id, studyGroupArtifacts.promotedRefId))
    .innerJoin(studyGroupSessions, eq(studyGroupSessions.id, studyGroupArtifacts.sessionId))
    .leftJoin(topics, eq(topics.id, questions.topicId))
    .where(and(...qConditions))
    .orderBy(desc(studyGroupArtifacts.promotedAt));

  // Pending-review count is a global view of the study-group queue, not affected by the filter.
  const [{ pending }] = await db
    .select({ pending: sql<number>`cast(count(*) as int)` })
    .from(questions)
    .where(and(eq(questions.sourceKind, "study_group"), eq(questions.pendingReview, true)));

  res.json({
    flashcards: fcRows,
    questions: qRows,
    pendingReviewCount: Number(pending) || 0,
  });
});

router.get("/study-group/learning-signal", async (_req, res): Promise<void> => {
  const [{ sessions }] = await db
    .select({ sessions: sql<number>`cast(count(*) as int)` })
    .from(studyGroupSessions);
  const counts = await db
    .select({ kind: studyGroupArtifacts.kind, n: sql<number>`cast(count(*) as int)` })
    .from(studyGroupArtifacts)
    .groupBy(studyGroupArtifacts.kind);
  const promoted = await db
    .select({ kind: studyGroupArtifacts.kind, n: sql<number>`cast(count(*) as int)` })
    .from(studyGroupArtifacts)
    .where(isNotNull(studyGroupArtifacts.promotedRefId))
    .groupBy(studyGroupArtifacts.kind);

  const byKind = new Map(counts.map((c) => [c.kind, Number(c.n) || 0]));
  const promotedByKind = new Map(promoted.map((c) => [c.kind, Number(c.n) || 0]));

  // Last few mastery_signal notes for the human readable summary
  const recentSignals = await db
    .select()
    .from(studyGroupArtifacts)
    .where(eq(studyGroupArtifacts.kind, "mastery_signal"))
    .orderBy(desc(studyGroupArtifacts.createdAt))
    .limit(3);

  const signalNotes = recentSignals
    .map((s) => {
      const p = s.payload as { direction?: string; note?: string };
      return p.note ? `${p.direction ? `[${p.direction}] ` : ""}${p.note}` : null;
    })
    .filter(Boolean) as string[];

  // Look up topic names for those signals
  const topicIds = recentSignals.map((s) => s.topicId).filter((t): t is number => t != null);
  const topicNames =
    topicIds.length > 0
      ? await db.select({ id: topics.id, name: topics.name }).from(topics).where(inArray(topics.id, topicIds))
      : [];
  const topicNameById = new Map(topicNames.map((t) => [t.id, t.name]));

  const summaryLines: string[] = [];
  if (byKind.get("reasoning_pattern")) {
    summaryLines.push(
      `${byKind.get("reasoning_pattern")} reasoning pattern${byKind.get("reasoning_pattern") === 1 ? "" : "s"} captured`,
    );
  }
  const fcQueued = (byKind.get("flashcard_candidate") ?? 0) - (promotedByKind.get("flashcard_candidate") ?? 0);
  if (fcQueued > 0) summaryLines.push(`${fcQueued} candidate flashcard${fcQueued === 1 ? "" : "s"} queued`);
  const qQueued = (byKind.get("question_candidate") ?? 0) - (promotedByKind.get("question_candidate") ?? 0);
  if (qQueued > 0) summaryLines.push(`${qQueued} candidate question${qQueued === 1 ? "" : "s"} queued`);

  res.json({
    sessions: Number(sessions) || 0,
    reasoningPatterns: byKind.get("reasoning_pattern") ?? 0,
    flashcardCandidates: byKind.get("flashcard_candidate") ?? 0,
    flashcardsPromoted: promotedByKind.get("flashcard_candidate") ?? 0,
    questionCandidates: byKind.get("question_candidate") ?? 0,
    questionsPromoted: promotedByKind.get("question_candidate") ?? 0,
    masterySignals: byKind.get("mastery_signal") ?? 0,
    summary: summaryLines.length > 0 ? summaryLines.join(" · ") : "No sessions yet — start a round to begin teaching the system.",
    recentSignalNotes: signalNotes.map((note, i) => ({
      note,
      topic: topicNameById.get(recentSignals[i]?.topicId ?? -1) ?? null,
    })),
  });
});

export default router;
