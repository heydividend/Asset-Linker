import { buildTodayItems } from "../routes/plan";
import type { PushPayload } from "./webPush";

// Builds the daily-reminder notification payload for a session, summarizing
// today's plan: how many study tasks remain, due flashcards, and a mock-exam
// day call-out. Tapping the notification deep-links to the dashboard (the
// service worker resolves "/" against the app's registration scope).
export async function buildReminderPayload(
  sessionId: string,
): Promise<PushPayload> {
  const plan = await buildTodayItems(sessionId);

  const remainingMandatory = Math.max(
    0,
    plan.mandatoryCount - plan.completedMandatoryCount,
  );
  const isMockExamDay = plan.items.some(
    (it) => it.kind === "mock_exam" && !it.completed,
  );
  const dueFlashItem = plan.items.find(
    (it) => it.kind === "flashcards" && !it.completed,
  );

  const parts: string[] = [];
  if (isMockExamDay) {
    parts.push("📝 Mock exam day — block out time for a full simulation.");
  }
  if (remainingMandatory > 0) {
    parts.push(
      `${remainingMandatory} study ${
        remainingMandatory === 1 ? "task" : "tasks"
      } left today.`,
    );
  } else if (plan.dayComplete) {
    parts.push("You're on track — review anything you'd like to lock in.");
  } else {
    parts.push("Open your plan to see what's on deck.");
  }
  if (dueFlashItem) {
    parts.push(dueFlashItem.title + ".");
  }

  const title = isMockExamDay
    ? "BOC mock exam day"
    : remainingMandatory > 0
      ? "Time for today's study"
      : "Keep your BOC streak going";

  return {
    title,
    body: parts.join(" "),
    url: "/",
    tag: `daily-reminder-${plan.date}`,
  };
}
