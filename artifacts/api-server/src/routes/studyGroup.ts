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
  alive: () => boolean;
}

function startSseStream(res: import("express").Response): StreamHandle {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  let alive = true;
  res.on("close", () => {
    alive = false;
  });
  return {
    push: (event) => {
      if (!alive) return;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        alive = false;
      }
    },
    end: () => {
      if (!alive) return;
      try {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch {
        // client gone
      }
      alive = false;
    },
    alive: () => alive,
  };
}

// ---- Per-session in-flight handler tracking (so a reconnect can supersede) ----
// Exported for tests; production code should not mutate this directly outside
// of takeOverSession()/releaseSession().
export const sessionAborters = new Map<number, AbortController>();

// Startup sweep: heal any rows left in 'streaming' from a previous process
// (crash/redeploy mid-round). Flipping them to 'failed' makes the round show
// up as resumable on the dashboard without the user clicking anything.
export async function recoverStuckStudyGroupRounds(): Promise<number> {
  const updated = await db
    .update(studyGroupMessages)
    .set({ status: "failed", reason: "sweeper_timeout", updatedAt: new Date() })
    .where(eq(studyGroupMessages.status, "streaming"))
    .returning({ id: studyGroupMessages.id });
  return updated.length;
}

// Periodic sweep: while the server is alive, a single round can still hang
// (network blip to Anthropic, dropped client connection that the server didn't
// notice). Every minute, flip rows that have been 'streaming' for longer than
// STALE_STREAMING_MS to 'failed' — but only if no in-process handler is
// actively owning that session (sessionAborters), to avoid clobbering a real
// in-flight stream.
const STALE_STREAMING_MS = 2 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

export async function sweepStaleStudyGroupRounds(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_STREAMING_MS);
  const candidates = await db
    .select({
      id: studyGroupMessages.id,
      sessionId: studyGroupMessages.sessionId,
    })
    .from(studyGroupMessages)
    .where(
      and(
        eq(studyGroupMessages.status, "streaming"),
        sql`${studyGroupMessages.updatedAt} < ${cutoff}`,
      ),
    );
  const stale = candidates.filter((row) => !sessionAborters.has(row.sessionId));
  if (stale.length === 0) return 0;
  const updated = await db
    .update(studyGroupMessages)
    .set({ status: "failed", reason: "sweeper_timeout", updatedAt: new Date() })
    .where(
      and(
        inArray(
          studyGroupMessages.id,
          stale.map((r) => r.id),
        ),
        eq(studyGroupMessages.status, "streaming"),
        sql`${studyGroupMessages.updatedAt} < ${cutoff}`,
      ),
    )
    .returning({ id: studyGroupMessages.id });
  return updated.length;
}

let sweepTimer: NodeJS.Timeout | null = null;
export function startStudyGroupStaleSweeper(
  onError: (err: unknown) => void = () => {},
): () => void {
  if (sweepTimer) return () => stopStudyGroupStaleSweeper();
  const tick = async () => {
    try {
      await sweepStaleStudyGroupRounds();
    } catch (err) {
      onError(err);
    }
  };
  sweepTimer = setInterval(() => {
    void tick();
  }, SWEEP_INTERVAL_MS);
  // Don't keep the process alive solely for the sweep timer.
  sweepTimer.unref?.();
  return () => stopStudyGroupStaleSweeper();
}

export function stopStudyGroupStaleSweeper(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

async function takeOverSession(sessionId: number): Promise<AbortController> {
  const prev = sessionAborters.get(sessionId);
  if (prev) {
    prev.abort();
  }
  const ac = new AbortController();
  sessionAborters.set(sessionId, ac);
  // Reset any rows still marked 'streaming' from an older handler — they
  // will be treated as 'failed' (resumable) by the planner below.
  await db
    .update(studyGroupMessages)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(studyGroupMessages.sessionId, sessionId),
        eq(studyGroupMessages.status, "streaming"),
      ),
    );
  return ac;
}

function releaseSession(sessionId: number, ac: AbortController) {
  if (sessionAborters.get(sessionId) === ac) {
    sessionAborters.delete(sessionId);
  }
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
  abortSignal?: AbortSignal;
}

async function runAgentTurn(input: AgentTurnInput): Promise<{ messageId: number; content: string }> {
  const { sessionId, roundIndex, speaker, kind, questionId, systemPrompt, userPrompt, stream, history, abortSignal } = input;
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
    if (abortSignal) {
      const onAbort = () => {
        try { stream$.abort?.(); } catch { /* ignore */ }
      };
      if (abortSignal.aborted) onAbort();
      else abortSignal.addEventListener("abort", onAbort, { once: true });
    }
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
      status: "done",
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

// ---- Planned-turn runner (updates an existing pending row, supports resume) ----
type PlannedSpeaker = "mentor" | "alex" | "jordan";
type PlannedKind = "question" | "answer" | "verdict" | "takeaway";
interface PlannedTurnSpec {
  speaker: PlannedSpeaker;
  kind: PlannedKind;
  turnOrder: number;
}
const ROUND_PLAN: PlannedTurnSpec[] = [
  { speaker: "mentor", kind: "question", turnOrder: 0 },
  { speaker: "alex", kind: "answer", turnOrder: 1 },
  { speaker: "jordan", kind: "answer", turnOrder: 2 },
  { speaker: "mentor", kind: "verdict", turnOrder: 3 },
  { speaker: "mentor", kind: "takeaway", turnOrder: 4 },
];

interface RunPlannedTurnInput {
  row: typeof studyGroupMessages.$inferSelect;
  systemPrompt: string;
  userPrompt: string;
  stream: StreamHandle;
  abortSignal: AbortSignal;
}

async function runPlannedTurn(
  input: RunPlannedTurnInput,
): Promise<{ ok: boolean; content: string; aborted: boolean }> {
  const { row, systemPrompt, userPrompt, stream, abortSignal } = input;
  await db
    .update(studyGroupMessages)
    .set({ status: "streaming", content: "", reason: null, updatedAt: new Date() })
    .where(eq(studyGroupMessages.id, row.id));
  stream.push({
    type: "message_start",
    messageId: row.id,
    speaker: row.speaker,
    speakerLabel: speakerLabel(row.speaker),
    kind: row.kind,
    roundIndex: row.roundIndex,
  });
  let full = "";
  let streamFailed = false;
  // Throttle DB writes for partial text so a reconnecting client can see the
  // in-progress turn via the GET endpoint without thrashing the database.
  // Partial writes are gated on status='streaming' so a late-arriving partial
  // can NEVER overwrite the final 'done'/'failed' row written below. We also
  // track the in-flight write so the terminal write awaits it before running.
  let lastPersistAt = 0;
  let lastPersistedLen = 0;
  let inFlightPersist: Promise<void> = Promise.resolve();
  const PARTIAL_PERSIST_INTERVAL_MS = 400;
  const schedulePartialPersist = () => {
    if (abortSignal.aborted) return;
    const now = Date.now();
    if (
      now - lastPersistAt < PARTIAL_PERSIST_INTERVAL_MS ||
      full.length === lastPersistedLen
    ) {
      return;
    }
    lastPersistAt = now;
    lastPersistedLen = full.length;
    const snapshot = full;
    inFlightPersist = inFlightPersist
      .catch(() => {})
      .then(async () => {
        try {
          // Conditional update: only patch while still streaming. Once the
          // terminal write below sets status to 'done' or 'failed', this
          // becomes a no-op and cannot clobber the final content.
          await db
            .update(studyGroupMessages)
            .set({ content: snapshot })
            .where(
              and(
                eq(studyGroupMessages.id, row.id),
                eq(studyGroupMessages.status, "streaming"),
              ),
            );
        } catch {
          // Best-effort checkpoint; don't crash the stream on a transient DB hiccup.
        }
      });
  };
  try {
    const stream$ = anthropic.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const onAbort = () => {
      try { stream$.abort?.(); } catch { /* ignore */ }
    };
    if (abortSignal.aborted) onAbort();
    else abortSignal.addEventListener("abort", onAbort, { once: true });
    for await (const event of stream$) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const delta = event.delta.text;
        if (delta) {
          full += delta;
          stream.push({ type: "message_delta", speaker: row.speaker, content: delta });
          // Fire-and-forget; the helper internally throttles to ~400ms and
          // serializes via inFlightPersist so the terminal write below can
          // safely await it.
          schedulePartialPersist();
        }
      }
    }
  } catch {
    streamFailed = true;
  }
  // Drain any in-flight throttled partial write before the terminal write so
  // a late partial cannot land after we set status='done'/'failed'. The
  // status-gated WHERE on partial writes is the primary safety net; this
  // await eliminates the ordering ambiguity entirely.
  await inFlightPersist.catch(() => {});
  if (abortSignal.aborted) {
    // Superseded by a newer handler — leave as 'failed' so resume picks it up.
    await db
      .update(studyGroupMessages)
      .set({ status: "failed", content: full, updatedAt: new Date() })
      .where(eq(studyGroupMessages.id, row.id));
    return { ok: false, content: full, aborted: true };
  }
  if (streamFailed || !full.trim()) {
    await db
      .update(studyGroupMessages)
      .set({ status: "failed", content: full, updatedAt: new Date() })
      .where(eq(studyGroupMessages.id, row.id));
    stream.push({
      type: "error",
      messageId: row.id,
      speaker: row.speaker,
      error: "agent stream failed",
    });
    return { ok: false, content: full, aborted: false };
  }
  await db
    .update(studyGroupMessages)
    .set({ status: "done", content: full, updatedAt: new Date() })
    .where(eq(studyGroupMessages.id, row.id));
  stream.push({
    type: "message_end",
    messageId: row.id,
    speaker: row.speaker,
    kind: row.kind,
    roundIndex: row.roundIndex,
    content: full,
  });
  return { ok: true, content: full, aborted: false };
}

function buildTopicBlock(topicName: string, domainName: string | null, focus: string | null): string {
  const focusBlock = focus ? `Group focus from the user: ${focus}\n\n` : "";
  return `Topic: ${topicName}${domainName ? ` (Domain: ${domainName})` : ""}.\n${focusBlock}`;
}

function buildPlannedPrompt(
  spec: PlannedTurnSpec,
  ctx: {
    topicBlock: string;
    roundIndex: number;
    question: {
      id: number | null;
      stem: string;
      choices: string[] | null;
      correctIndex: number | null;
      rationale: string | null;
    };
    doneByOrder: Map<number, string>;
  },
): { systemPrompt: string; userPrompt: string } {
  const { topicBlock, roundIndex, question: q, doneByOrder } = ctx;
  if (spec.kind === "question") {
    let userPrompt: string;
    if (q.id != null && q.choices) {
      const choicesText = q.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`).join("\n");
      userPrompt = `${topicBlock}Open round ${roundIndex} of the study group. Restate this real BOC-style question in your own words and pose it to Alex and Jordan. Add a brief framing sentence about WHY this concept matters clinically. Do NOT reveal the answer yet. Keep it under 120 words.\n\nQuestion stem: ${q.stem}\nChoices:\n${choicesText}`;
    } else {
      userPrompt = `${topicBlock}Open round ${roundIndex} of the study group. Pose a single high-yield BOC-style multiple-choice question on this topic with 4 lettered choices (A–D). Add a brief framing sentence about why the concept matters clinically. Do NOT reveal the answer yet. Keep the whole turn under 160 words.`;
    }
    return { systemPrompt: MENTOR_PERSONA, userPrompt };
  }
  const mentorOpen = doneByOrder.get(0) ?? "";
  const alexAnswer = doneByOrder.get(1) ?? "";
  const jordanAnswer = doneByOrder.get(2) ?? "";
  const verdict = doneByOrder.get(3) ?? "";
  if (spec.kind === "answer" && spec.speaker === "alex") {
    return {
      systemPrompt: ALEX_PERSONA,
      userPrompt: `Dr. Mentor just posed this in our study group:\n\n${mentorOpen}\n\nAnswer the question. Pick a letter, then in 3–5 sentences walk through the test-taking moves you used (eliminate distractors, name the answer family, flag any extreme-statement traps). Stay under 130 words.`,
    };
  }
  if (spec.kind === "answer" && spec.speaker === "jordan") {
    return {
      systemPrompt: JORDAN_PERSONA,
      userPrompt: `Dr. Mentor posed this:\n\n${mentorOpen}\n\nAlex just said:\n\n${alexAnswer}\n\nGive your own answer with a clinical anchor (mechanism, red flag, RTP criterion, contraindication). If Alex was wrong or used a strategy that misfires here, respectfully challenge it in one sentence. Stay under 130 words.`,
    };
  }
  if (spec.kind === "verdict") {
    const verdictPrompt = q.id != null && q.correctIndex != null && q.choices
      ? `Adjudicate the round. Correct answer is **${String.fromCharCode(65 + q.correctIndex)}. ${q.choices[q.correctIndex]}**. Reference rationale (use as ground truth, do not quote verbatim): ${q.rationale ?? "(none provided)"}\n\nIn 4–6 sentences: name the correct letter; say which peer (or both) reasoned correctly and which trap any miss fell into; close with a one-line clinical pearl. Use **bold** for the correct answer.`
      : `Adjudicate the round you posed. Reveal the correct letter you had in mind, evaluate Alex's and Jordan's reasoning, name any traps, and close with a one-line clinical pearl. 4–6 sentences. Use **bold** for the correct answer.`;
    return {
      systemPrompt: MENTOR_PERSONA,
      userPrompt: `${verdictPrompt}\n\nAlex said:\n${alexAnswer}\n\nJordan said:\n${jordanAnswer}`,
    };
  }
  // takeaway
  return {
    systemPrompt: MENTOR_PERSONA,
    userPrompt: `Wrap the round (which closed with this verdict: "${verdict}") with a "**Key takeaway:**" line (≤ 30 words) the group should remember. Then a separate "**Watch out for:**" line naming the single most likely trap a BOC test-taker falls for here.`,
  };
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

async function runExtractionForRound(
  sessionId: number,
  roundIndex: number,
  topicId: number,
  topicName: string,
  rows: (typeof studyGroupMessages.$inferSelect)[],
): Promise<{ kind: string; id: number; payload: Record<string, unknown> }[]> {
  // Per-kind idempotency: only re-extract kinds that don't already exist for this round.
  const existing = await db
    .select()
    .from(studyGroupArtifacts)
    .where(
      and(
        eq(studyGroupArtifacts.sessionId, sessionId),
        eq(studyGroupArtifacts.roundIndex, roundIndex),
      ),
    );
  const haveKind = new Set(existing.map((a) => a.kind));
  if (haveKind.size >= 4) {
    return existing.map((a) => ({ kind: a.kind, id: a.id, payload: a.payload }));
  }
  const byKey = new Map(rows.map((r) => [`${r.speaker}:${r.kind}:${r.turnOrder}`, r.content]));
  const mentorOpen = byKey.get("mentor:question:0") ?? "";
  const alexAns = byKey.get("alex:answer:1") ?? "";
  const jordanAns = byKey.get("jordan:answer:2") ?? "";
  const verdict = byKey.get("mentor:verdict:3") ?? "";
  const takeaway = byKey.get("mentor:takeaway:4") ?? "";
  const transcript = `Q: ${mentorOpen}\nAlex: ${alexAns}\nJordan: ${jordanAns}\nMentor verdict: ${verdict}\nTakeaway: ${takeaway}`;
  type Extracted = {
    flashcard?: { front?: string; back?: string };
    reasoning_pattern?: string;
    question?: { stem?: string; choices?: string[]; correctIndex?: number; rationale?: string };
    mastery_signal?: { direction?: "up" | "down" | "neutral"; note?: string };
  };
  let extracted: Extracted = {};
  try {
    extracted = await chatJson<Extracted>(
      `From the following BOC Athletic Training study-group round on "${topicName}", extract structured artifacts.\n\nReturn JSON of the form:\n{\n  "flashcard": {"front": "<concise question>", "back": "<answer with one clinical anchor>"},\n  "reasoning_pattern": "<one sentence naming the test-taking pattern this round reinforced>",\n  "question": {"stem": "<new BOC-style stem>", "choices": ["A","B","C","D"], "correctIndex": <int 0-3>, "rationale": "<short rationale>"},\n  "mastery_signal": {"direction": "up|down|neutral", "note": "<short note>"}\n}\n\nROUND TRANSCRIPT:\n${transcript.slice(0, 5000)}`,
      "You extract structured study artifacts. Reply with strict JSON only.",
    );
  } catch {
    extracted = {};
  }
  const created: { kind: string; id: number; payload: Record<string, unknown> }[] = existing.map(
    (a) => ({ kind: a.kind, id: a.id, payload: a.payload }),
  );
  if (!haveKind.has("flashcard_candidate") && extracted.flashcard?.front && extracted.flashcard?.back) {
    const [a] = await db
      .insert(studyGroupArtifacts)
      .values({
        sessionId,
        roundIndex,
        kind: "flashcard_candidate",
        topicId,
        payload: { front: extracted.flashcard.front, back: extracted.flashcard.back },
      })
      .returning();
    created.push({ kind: a.kind, id: a.id, payload: a.payload });
  }
  if (!haveKind.has("reasoning_pattern") && extracted.reasoning_pattern) {
    const [a] = await db
      .insert(studyGroupArtifacts)
      .values({
        sessionId,
        roundIndex,
        kind: "reasoning_pattern",
        topicId,
        payload: { note: extracted.reasoning_pattern },
      })
      .returning();
    created.push({ kind: a.kind, id: a.id, payload: a.payload });
  }
  if (
    !haveKind.has("question_candidate") &&
    extracted.question?.stem &&
    Array.isArray(extracted.question.choices) &&
    extracted.question.choices.length >= 2 &&
    typeof extracted.question.correctIndex === "number"
  ) {
    const [a] = await db
      .insert(studyGroupArtifacts)
      .values({
        sessionId,
        roundIndex,
        kind: "question_candidate",
        topicId,
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
  if (!haveKind.has("mastery_signal") && extracted.mastery_signal?.direction) {
    const [a] = await db
      .insert(studyGroupArtifacts)
      .values({
        sessionId,
        roundIndex,
        kind: "mastery_signal",
        topicId,
        payload: {
          direction: extracted.mastery_signal.direction,
          note: extracted.mastery_signal.note ?? "",
        },
      })
      .returning();
    created.push({ kind: a.kind, id: a.id, payload: a.payload });
  }
  return created;
}

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

  const isRetry = req.body?.retry === true;

  // Take over the session: abort any older handler and reset orphaned 'streaming' rows.
  const ac = await takeOverSession(id);
  const stream = startSseStream(res);
  res.on("close", () => {
    // We do NOT abort on client disconnect — the server keeps running so the
    // round always reaches a checkpointed state. The new POST that supersedes
    // us will call takeOverSession() and abort our anthropic streams.
  });

  try {
    // Decide which round to run: resume an unfinished one, or start a new one.
    const incompleteRows = await db
      .select()
      .from(studyGroupMessages)
      .where(
        and(
          eq(studyGroupMessages.sessionId, id),
          inArray(studyGroupMessages.status, ["pending", "failed"]),
          inArray(studyGroupMessages.kind, ["question", "answer", "verdict", "takeaway"]),
        ),
      )
      .orderBy(asc(studyGroupMessages.roundIndex), asc(studyGroupMessages.turnOrder));

    let roundIndex: number;
    let questionId: number | null;
    let resuming = false;

    if (incompleteRows.length > 0) {
      // Resume the earliest incomplete round.
      roundIndex = incompleteRows[0].roundIndex;
      questionId = incompleteRows.find((r) => r.questionId != null)?.questionId ?? null;
      resuming = true;
      if (isRetry) {
        await db
          .update(studyGroupMessages)
          .set({ status: "pending", content: "", reason: null, updatedAt: new Date() })
          .where(
            and(
              eq(studyGroupMessages.sessionId, id),
              eq(studyGroupMessages.roundIndex, roundIndex),
              eq(studyGroupMessages.status, "failed"),
            ),
          );
      }
    } else if (session.pendingExtractionRound != null) {
      // All turns done; only extraction is pending.
      roundIndex = session.pendingExtractionRound;
      const anyRow = await db
        .select()
        .from(studyGroupMessages)
        .where(
          and(
            eq(studyGroupMessages.sessionId, id),
            eq(studyGroupMessages.roundIndex, roundIndex),
          ),
        )
        .limit(1);
      questionId = anyRow[0]?.questionId ?? null;
      resuming = true;
    } else {
      // Start a new round: plan turns and persist placeholder rows up-front.
      roundIndex = session.roundCount + 1;
      const q = await pickQuestionForTopic(t.topicId);
      questionId = q.id;
      await db.insert(studyGroupMessages).values(
        ROUND_PLAN.map((p) => ({
          sessionId: id,
          speaker: p.speaker,
          kind: p.kind,
          content: "",
          roundIndex,
          questionId: q.id,
          status: "pending" as const,
          turnOrder: p.turnOrder,
        })),
      );
      await db
        .update(studyGroupSessions)
        .set({ status: "active", pendingExtractionRound: roundIndex, updatedAt: new Date() })
        .where(eq(studyGroupSessions.id, id));
    }

    // Load (or reload) the round's planned turn rows.
    let plannedRows = await db
      .select()
      .from(studyGroupMessages)
      .where(
        and(
          eq(studyGroupMessages.sessionId, id),
          eq(studyGroupMessages.roundIndex, roundIndex),
          inArray(studyGroupMessages.kind, ["question", "answer", "verdict", "takeaway"]),
        ),
      )
      .orderBy(asc(studyGroupMessages.turnOrder));

    // Resolve question metadata (so we can rebuild prompts on resume).
    let qMeta: {
      id: number | null;
      stem: string;
      choices: string[] | null;
      correctIndex: number | null;
      rationale: string | null;
    };
    if (questionId != null) {
      const [qrow] = await db.select().from(questions).where(eq(questions.id, questionId));
      qMeta = qrow
        ? {
            id: qrow.id,
            stem: qrow.stem,
            choices: qrow.choices,
            correctIndex: qrow.correctIndex,
            rationale: qrow.rationale ?? null,
          }
        : { id: null, stem: "", choices: null, correctIndex: null, rationale: null };
    } else {
      qMeta = { id: null, stem: "", choices: null, correctIndex: null, rationale: null };
    }

    const topicBlock = buildTopicBlock(t.topicName, t.domainName, session.focus);

    // Send a "round_resume" event so the client can render the round's existing
    // state immediately (re-emit message_end for already-done turns).
    if (resuming) {
      stream.push({ type: "round_resume", roundIndex, retry: isRetry });
      for (const r of plannedRows.filter((r) => r.status === "done")) {
        stream.push({
          type: "message_end",
          messageId: r.id,
          speaker: r.speaker,
          kind: r.kind,
          roundIndex: r.roundIndex,
          content: r.content,
        });
      }
    }

    // Run remaining turns sequentially.
    for (const spec of ROUND_PLAN) {
      const row = plannedRows.find((r) => r.turnOrder === spec.turnOrder);
      if (!row) continue;
      if (row.status === "done") continue;
      const doneByOrder = new Map<number, string>();
      for (const r of plannedRows) {
        if (r.status === "done") doneByOrder.set(r.turnOrder, r.content);
      }
      const { systemPrompt, userPrompt } = buildPlannedPrompt(spec, {
        topicBlock,
        roundIndex,
        question: qMeta,
        doneByOrder,
      });
      const result = await runPlannedTurn({
        row,
        systemPrompt,
        userPrompt,
        stream,
        abortSignal: ac.signal,
      });
      if (!result.ok) {
        if (result.aborted) {
          // Client disconnected & a new handler took over; just stop.
          return;
        }
        // The turn failed — leave this round resumable, stop here.
        stream.end();
        return;
      }
      // Refresh local cache so subsequent prompts see the just-completed content.
      plannedRows = plannedRows.map((r) =>
        r.id === row.id ? { ...r, status: "done", content: result.content } : r,
      );
    }

    // All planned turns done — run extraction (idempotent).
    const created = await runExtractionForRound(
      id,
      roundIndex,
      t.topicId,
      t.topicName,
      plannedRows,
    );

    // Mark the round complete.
    const [{ maxRound }] = await db
      .select({ maxRound: sql<number>`coalesce(max(${studyGroupSessions.roundCount}), 0)` })
      .from(studyGroupSessions)
      .where(eq(studyGroupSessions.id, id));
    await db
      .update(studyGroupSessions)
      .set({
        roundCount: Math.max(roundIndex, Number(maxRound) || 0),
        pendingExtractionRound: null,
        updatedAt: new Date(),
      })
      .where(eq(studyGroupSessions.id, id));

    for (const a of created) {
      stream.push({ type: "artifact", artifact: a });
    }
    stream.end();
  } finally {
    releaseSession(id, ac);
  }
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

// Small health stat for the Study Group session header. We tag sweeper-healed
// rounds with reason='sweeper_timeout' on the offending message; this endpoint
// rolls those up to the round level so the UI can show "3 of your last 20
// rounds timed out". A spike in this rate is a signal that the AI/network is
// flaky, not the user's flow.
router.get("/study-group/sessions/:id/timeout-stats", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const limitParam = Number(req.query.limit);
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 100
    ? Math.floor(limitParam)
    : 20;
  const [session] = await db
    .select({ id: studyGroupSessions.id, roundCount: studyGroupSessions.roundCount })
    .from(studyGroupSessions)
    .where(eq(studyGroupSessions.id, id));
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Round 0 is reserved for the system welcome message; real rounds are >= 1.
  const recentRounds = await db
    .selectDistinct({ roundIndex: studyGroupMessages.roundIndex })
    .from(studyGroupMessages)
    .where(
      and(
        eq(studyGroupMessages.sessionId, id),
        sql`${studyGroupMessages.roundIndex} >= 1`,
      ),
    )
    .orderBy(desc(studyGroupMessages.roundIndex))
    .limit(limit);
  const windowRounds = recentRounds.map((r) => r.roundIndex);
  let timedOutRounds = 0;
  if (windowRounds.length > 0) {
    const timedOut = await db
      .selectDistinct({ roundIndex: studyGroupMessages.roundIndex })
      .from(studyGroupMessages)
      .where(
        and(
          eq(studyGroupMessages.sessionId, id),
          // Match the task semantics literally: only FAILED turns flagged by
          // the sweeper count toward the timeout rate. In practice every
          // sweeper_timeout row is also status='failed' (that's the whole
          // point of the sweeper), but this keeps the query self-documenting
          // and immune to any future code path that might write the reason
          // without flipping the status.
          eq(studyGroupMessages.status, "failed"),
          eq(studyGroupMessages.reason, "sweeper_timeout"),
          inArray(studyGroupMessages.roundIndex, windowRounds),
        ),
      );
    timedOutRounds = timedOut.length;
  }
  res.json({
    window: windowRounds.length,
    limit,
    timedOutRounds,
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
