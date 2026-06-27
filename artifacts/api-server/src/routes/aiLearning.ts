import { Router, type IRouter } from "express";
import { desc, eq, sql, and, isNotNull } from "drizzle-orm";
import {
  db,
  conversations,
  messages,
  studyGroupSessions,
  studyGroupMessages,
  studyGroupArtifacts,
  flashcards,
  questions,
  quizAnswers,
  quizzes,
  topics,
  domains,
} from "@workspace/db";
import { getOrCreateSessionId } from "../lib/sessionId";

const router: IRouter = Router();

// One unified overview endpoint for the "AI Learning" page. Bundles three
// pictures of how the AI is being used + how it's performing:
//   1. conversations — recent AI tutor chats and study-group sessions
//   2. training      — what the system has captured (promoted artifacts,
//                      generated cards/questions, weak topics)
//   3. accuracy      — quiz accuracy over time + by domain, plus an
//                      AI-vs-source breakdown of the question bank
router.get("/ai-learning/overview", async (req, res): Promise<void> => {
  const userId = getOrCreateSessionId(req, res);
  // ----- CONVERSATIONS -----
  const tutorConvs = await db.execute(sql`
    SELECT c.id, c.title, c.created_at,
           CAST(COUNT(m.id) AS int) AS message_count,
           MAX(m.created_at) AS last_message_at
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.user_id = ${userId}
    GROUP BY c.id
    ORDER BY COALESCE(MAX(m.created_at), c.created_at) DESC
    LIMIT 25
  `) as unknown as {
    rows: Array<{
      id: number;
      title: string | null;
      created_at: string;
      message_count: number;
      last_message_at: string | null;
    }>;
  };

  const sgSessions = await db.execute(sql`
    SELECT s.id, s.title, s.status, s.round_count, s.created_at, s.updated_at,
           COALESCE(mc.n, 0) AS message_count,
           COALESCE(ac.n, 0) AS artifact_count,
           COALESCE(ac.promoted, 0) AS promoted_count
    FROM study_group_sessions s
    LEFT JOIN (
      SELECT session_id, CAST(COUNT(*) AS int) AS n
      FROM study_group_messages GROUP BY session_id
    ) mc ON mc.session_id = s.id
    LEFT JOIN (
      SELECT session_id,
             CAST(COUNT(*) AS int) AS n,
             CAST(COUNT(*) FILTER (WHERE promoted_at IS NOT NULL) AS int) AS promoted
      FROM study_group_artifacts GROUP BY session_id
    ) ac ON ac.session_id = s.id
    ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
    LIMIT 25
  `) as unknown as {
    rows: Array<{
      id: number;
      title: string | null;
      status: string;
      round_count: number;
      created_at: string;
      updated_at: string | null;
      message_count: number;
      artifact_count: number;
      promoted_count: number;
    }>;
  };

  // Aggregate totals (independent of the LIMIT 25 above).
  const [{ tutorTotal }] = await db
    .select({ tutorTotal: sql<number>`cast(count(*) as int)` })
    .from(conversations)
    .where(eq(conversations.userId, userId));
  const [{ tutorMsgs }] = await db
    .select({ tutorMsgs: sql<number>`cast(count(*) as int)` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(eq(conversations.userId, userId));
  const [{ sgTotal }] = await db
    .select({ sgTotal: sql<number>`cast(count(*) as int)` })
    .from(studyGroupSessions);
  const [{ sgMsgs }] = await db
    .select({ sgMsgs: sql<number>`cast(count(*) as int)` })
    .from(studyGroupMessages);

  // ----- TRAINING -----
  const [{ flashTotal }] = await db
    .select({ flashTotal: sql<number>`cast(count(*) as int)` })
    .from(flashcards);
  const flashBySource = (await db.execute(sql`
    SELECT COALESCE(source,'manual') AS source, CAST(COUNT(*) AS int) AS n
    FROM flashcards GROUP BY COALESCE(source,'manual')
  `)) as unknown as { rows: Array<{ source: string; n: number }> };

  const [{ qTotal }] = await db
    .select({ qTotal: sql<number>`cast(count(*) as int)` })
    .from(questions);
  const qBySource = (await db.execute(sql`
    SELECT COALESCE(source_kind,'manual') AS source, CAST(COUNT(*) AS int) AS n,
           CAST(COUNT(*) FILTER (WHERE pending_review = true) AS int) AS pending
    FROM questions GROUP BY COALESCE(source_kind,'manual')
  `)) as unknown as {
    rows: Array<{ source: string; n: number; pending: number }>;
  };

  const [{ artifactsTotal }] = await db
    .select({ artifactsTotal: sql<number>`cast(count(*) as int)` })
    .from(studyGroupArtifacts);
  const [{ artifactsPromoted }] = await db
    .select({ artifactsPromoted: sql<number>`cast(count(*) as int)` })
    .from(studyGroupArtifacts)
    .where(isNotNull(studyGroupArtifacts.promotedAt));
  const artifactsByKind = (await db.execute(sql`
    SELECT kind, CAST(COUNT(*) AS int) AS n,
           CAST(COUNT(*) FILTER (WHERE promoted_at IS NOT NULL) AS int) AS promoted
    FROM study_group_artifacts GROUP BY kind
  `)) as unknown as {
    rows: Array<{ kind: string; n: number; promoted: number }>;
  };

  // Recent promoted training items (the AI's "learnings" turned into
  // real study material): newest 12 promoted artifacts with topic name.
  const recentPromoted = (await db.execute(sql`
    SELECT a.id, a.kind, a.promoted_at, a.payload,
           a.session_id, s.title AS session_title,
           t.name AS topic_name
    FROM study_group_artifacts a
    LEFT JOIN study_group_sessions s ON s.id = a.session_id
    LEFT JOIN topics t ON t.id = a.topic_id
    WHERE a.promoted_at IS NOT NULL
    ORDER BY a.promoted_at DESC
    LIMIT 12
  `)) as unknown as {
    rows: Array<{
      id: number;
      kind: string;
      promoted_at: string;
      payload: Record<string, unknown> | null;
      session_id: number;
      session_title: string | null;
      topic_name: string | null;
    }>;
  };

  // ----- ACCURACY -----
  const [{ ansTotal }] = await db
    .select({ ansTotal: sql<number>`cast(count(*) as int)` })
    .from(quizAnswers)
    .innerJoin(quizzes, eq(quizzes.id, quizAnswers.quizId))
    .where(eq(quizzes.userId, userId));
  const [{ ansCorrect }] = await db
    .select({ ansCorrect: sql<number>`cast(count(*) as int)` })
    .from(quizAnswers)
    .innerJoin(quizzes, eq(quizzes.id, quizAnswers.quizId))
    .where(and(eq(quizzes.userId, userId), eq(quizAnswers.correct, true)));

  // 14-day daily accuracy series (in PT, but a UTC bucket is close enough
  // for a chart and avoids tz library churn here).
  const dailySeries = (await db.execute(sql`
    SELECT date_trunc('day', qa.answered_at) AS day,
           CAST(COUNT(*) AS int) AS attempts,
           CAST(COUNT(*) FILTER (WHERE qa.correct = true) AS int) AS correct
    FROM quiz_answers qa
    JOIN quizzes z ON z.id = qa.quiz_id
    WHERE qa.answered_at >= now() - interval '14 days' AND z.user_id = ${userId}
    GROUP BY day
    ORDER BY day ASC
  `)) as unknown as {
    rows: Array<{ day: string; attempts: number; correct: number }>;
  };

  // Per-domain accuracy from the quiz-answer history (joins through the
  // question's topic to its domain). Limit to domains with attempts.
  const domainAccuracy = (await db.execute(sql`
    SELECT d.id AS domain_id, d.name AS domain_name,
           CAST(COUNT(qa.id) AS int) AS attempts,
           CAST(COUNT(qa.id) FILTER (WHERE qa.correct = true) AS int) AS correct
    FROM quiz_answers qa
    JOIN questions q ON q.id = qa.question_id
    JOIN topics t    ON t.id = q.topic_id
    JOIN domains d   ON d.id = t.domain_id
    JOIN quizzes z   ON z.id = qa.quiz_id
    WHERE z.user_id = ${userId}
    GROUP BY d.id, d.name
    HAVING COUNT(qa.id) > 0
    ORDER BY d.name ASC
  `)) as unknown as {
    rows: Array<{
      domain_id: number;
      domain_name: string;
      attempts: number;
      correct: number;
    }>;
  };

  res.json({
    conversations: {
      tutor: {
        totalSessions: tutorTotal,
        totalMessages: tutorMsgs,
        recent: tutorConvs.rows.map((r) => ({
          id: r.id,
          title: r.title ?? "Untitled chat",
          messageCount: r.message_count,
          lastMessageAt: r.last_message_at,
          createdAt: r.created_at,
        })),
      },
      studyGroup: {
        totalSessions: sgTotal,
        totalMessages: sgMsgs,
        recent: sgSessions.rows.map((r) => ({
          id: r.id,
          title: r.title ?? "Untitled session",
          status: r.status,
          roundCount: r.round_count,
          messageCount: r.message_count,
          artifactCount: r.artifact_count,
          promotedCount: r.promoted_count,
          updatedAt: r.updated_at ?? r.created_at,
        })),
      },
    },
    training: {
      flashcards: {
        total: flashTotal,
        bySource: flashBySource.rows.map((r) => ({ source: r.source, count: r.n })),
      },
      questions: {
        total: qTotal,
        bySource: qBySource.rows.map((r) => ({
          source: r.source,
          count: r.n,
          pendingReview: r.pending,
        })),
      },
      artifacts: {
        total: artifactsTotal,
        promoted: artifactsPromoted,
        byKind: artifactsByKind.rows.map((r) => ({
          kind: r.kind,
          count: r.n,
          promoted: r.promoted,
        })),
      },
      recentPromoted: recentPromoted.rows.map((r) => {
        const payload = (r.payload ?? {}) as Record<string, unknown>;
        const front = (payload["front"] ?? payload["question"] ?? payload["prompt"] ?? "") as string;
        const back = (payload["back"] ?? payload["answer"] ?? payload["explanation"] ?? "") as string;
        return {
          id: r.id,
          kind: r.kind,
          promotedAt: r.promoted_at,
          sessionId: r.session_id,
          sessionTitle: r.session_title ?? "Untitled session",
          topicName: r.topic_name,
          preview: { front: String(front).slice(0, 240), back: String(back).slice(0, 240) },
        };
      }),
    },
    accuracy: {
      overall: {
        attempts: ansTotal,
        correct: ansCorrect,
        accuracy: ansTotal > 0 ? ansCorrect / ansTotal : null,
      },
      daily: dailySeries.rows.map((r) => ({
        day: r.day,
        attempts: r.attempts,
        correct: r.correct,
        accuracy: r.attempts > 0 ? r.correct / r.attempts : null,
      })),
      byDomain: domainAccuracy.rows.map((r) => ({
        domainId: r.domain_id,
        domainName: r.domain_name,
        attempts: r.attempts,
        correct: r.correct,
        accuracy: r.attempts > 0 ? r.correct / r.attempts : null,
      })),
    },
  });
});

export default router;
