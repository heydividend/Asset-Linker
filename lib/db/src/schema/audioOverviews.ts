import { customType, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { notebooks } from "./notebooks";
import { studyGuides } from "./studyGuides";

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const audioOverviews = pgTable("audio_overviews", {
  id: serial("id").primaryKey(),
  notebookId: integer("notebook_id").notNull().references(() => notebooks.id, { onDelete: "cascade" }),
  studyGuideId: integer("study_guide_id").references(() => studyGuides.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"),
  voice: text("voice").notNull().default("nova"),
  style: text("style").notNull().default("lecture"),
  durationSec: integer("duration_sec"),
  transcript: text("transcript"),
  audioData: bytea("audio_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AudioOverview = typeof audioOverviews.$inferSelect;
