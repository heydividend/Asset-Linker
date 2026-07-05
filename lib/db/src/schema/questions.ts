import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { topics } from "./topics";
import { tasks } from "./tasks";
import { testlets } from "./testlets";

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  stem: text("stem").notNull(),
  choices: jsonb("choices").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  multiSelect: boolean("multi_select").notNull().default(false),
  correctIndices: jsonb("correct_indices").$type<number[] | null>(),
  // Item type: "mc" (single-answer), "multi" (multi-select), or "ordering"
  // (drag-and-drop sequencing). Testlet sub-items are ordinary "mc" rows that
  // also carry a testletId. Defaults to "mc" so every existing row is unchanged.
  itemType: text("item_type").notNull().default("mc"),
  // For "ordering" items only: the correct sequence expressed as choice indices,
  // e.g. [2,0,1,3] means choices[2] comes first. `choices` are stored SCRAMBLED;
  // this array is the answer key. Null for all other item types.
  correctOrder: jsonb("correct_order").$type<number[] | null>(),
  // Links sub-items that share a testlet scenario (see the testlets table).
  testletId: integer("testlet_id").references(() => testlets.id, { onDelete: "set null" }),
  rationale: text("rationale").notNull(),
  domainId: integer("domain_id").references(() => domains.id, { onDelete: "set null" }),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
  difficulty: integer("difficulty").notNull().default(2),
  sourceKind: text("source_kind").notNull().default("ai"),
  sourceUrl: text("source_url"),
  imageUrl: text("image_url"),
  enabled: boolean("enabled").notNull().default(true),
  pendingReview: boolean("pending_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Question = typeof questions.$inferSelect;
