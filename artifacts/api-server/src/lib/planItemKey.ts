import type { PlanItem, PlanItemKind } from "./scheduleBuilder";

// Stable identifier for a plan item that lets us record completion against it
// idempotently. Computed deterministically from kind + the most-specific
// identifier the item carries (gameId, notebookId, topicId, domainId), so the
// same item produces the same key whether it shows up in /plan/today or in a
// later auto-completion call (e.g. finishing a quiz).
export function planItemKey(item: PlanItem): string {
  switch (item.kind) {
    case "game":
      return item.gameId ? `game:${item.gameId}` : "game:any";
    case "quiz":
      if (item.topicId) return `quiz:topic:${item.topicId}`;
      if (item.domainId) return `quiz:domain:${item.domainId}`;
      return "quiz:any";
    case "flashcards":
      return "flashcards:due";
    case "study_guide":
      if (item.notebookId) return `study_guide:notebook:${item.notebookId}`;
      if (item.domainId) return `study_guide:domain:${item.domainId}`;
      return "study_guide:any";
    case "review":
      if (item.notebookId) return `review:notebook:${item.notebookId}`;
      if (item.domainId) return `review:domain:${item.domainId}`;
      return "review:any";
    case "audio":
      if (item.notebookId) return `audio:notebook:${item.notebookId}`;
      return "audio:any";
    case "mock_exam":
      return "mock_exam:session";
    case "resource":
      return "resource:any";
    case "rest":
      return "rest:any";
  }
}

// Mandatory items contribute to the "Day complete" gate. Rest is purely
// optional; everything else is required so the user always plays at least
// one game and reviews at least one round of flashcards per study day.
export function isMandatoryKind(kind: PlanItemKind): boolean {
  return kind !== "rest";
}
