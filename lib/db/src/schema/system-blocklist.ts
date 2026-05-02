import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const systemBlocklistTable = pgTable("system_blocklist", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  category: text("category").notNull().default("tracking"),
  source: text("source").notNull().default("StevenBlack"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const insertSystemBlocklistSchema = createInsertSchema(
  systemBlocklistTable
).omit({ id: true, addedAt: true });

export type InsertSystemBlocklist = z.infer<typeof insertSystemBlocklistSchema>;
export type SystemBlocklist = typeof systemBlocklistTable.$inferSelect;

export const blocklistSyncStatusTable = pgTable("blocklist_sync_status", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("pending"),
  totalDomains: integer("total_domains").notNull().default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  error: text("error"),
});

export type BlocklistSyncStatus = typeof blocklistSyncStatusTable.$inferSelect;
