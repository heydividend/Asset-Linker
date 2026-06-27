// Stable, shared catalog of games available in the app. Kept in sync with
// `artifacts/boc-notebook/src/data/games.json` — when new games are added
// there, also append them here so the daily plan rotation can include them.
export interface GameMeta {
  id: string;
  title: string;
  estMinutes: number;
}

export const GAMES_CATALOG: GameMeta[] = [
  { id: "mmt", title: "Manual Muscle Tests", estMinutes: 12 },
  { id: "gon", title: "Goniometric ROM Measurements", estMinutes: 12 },
  { id: "ch7-equipment", title: "Ch 7: Protective Equipment", estMinutes: 10 },
  { id: "ch8-taping", title: "Ch 8: Wrapping & Taping", estMinutes: 10 },
  { id: "ch12-acute-care", title: "Ch 12: Acute Care & Emergency Procedures", estMinutes: 10 },
  { id: "ch13-evaluation", title: "Ch 13: Off-the-Field Injury Evaluation", estMinutes: 10 },
  { id: "ch15-modalities", title: "Ch 15: Therapeutic Modalities", estMinutes: 10 },
  { id: "ch16-rehab", title: "Ch 16: Therapeutic Exercise & Rehabilitation", estMinutes: 10 },
  { id: "ch18-foot", title: "Ch 18: The Foot", estMinutes: 10 },
  { id: "ch19-ankle", title: "Ch 19: The Ankle & Lower Leg", estMinutes: 10 },
  { id: "ch20-knee", title: "Ch 20: The Knee", estMinutes: 10 },
  { id: "ch21-hip", title: "Ch 21: Thigh, Hip, Groin & Pelvis", estMinutes: 10 },
  { id: "ch22-shoulder", title: "Ch 22: The Shoulder Complex", estMinutes: 10 },
  { id: "ch23-elbow", title: "Ch 23: The Elbow", estMinutes: 10 },
  { id: "ch24-wrist", title: "Ch 24: Forearm, Wrist, Hand & Fingers", estMinutes: 10 },
  { id: "ch25-spine", title: "Ch 25: The Spine", estMinutes: 10 },
  { id: "ch27-thorax", title: "Ch 27: The Thorax & Abdomen", estMinutes: 10 },
  { id: "ch28-skin", title: "Ch 28: The Skin", estMinutes: 10 },
  // Question-driven games (not matching decks) — drill the weakest domains.
  { id: "code-blue", title: "Code Blue: Emergency Triage", estMinutes: 8 },
  { id: "survivor", title: "Survivor: Streak Gauntlet", estMinutes: 8 },
  { id: "spot-contraindication", title: "Spot the Contraindication", estMinutes: 8 },
];

export function gameForDayIndex(i: number): GameMeta {
  return GAMES_CATALOG[((i % GAMES_CATALOG.length) + GAMES_CATALOG.length) % GAMES_CATALOG.length];
}
