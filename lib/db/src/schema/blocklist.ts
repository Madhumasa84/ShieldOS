import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { devicesTable } from "./devices";

export const blocklistEntriesTable = pgTable("blocklist_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  category: text("category").notNull().default("tracking"),
  source: text("source").notNull().default("custom"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const insertBlocklistEntrySchema = createInsertSchema(
  blocklistEntriesTable
).omit({ id: true, addedAt: true });

export type InsertBlocklistEntry = z.infer<typeof insertBlocklistEntrySchema>;
export type BlocklistEntry = typeof blocklistEntriesTable.$inferSelect;

export const blockedRequestsTable = pgTable("blocked_requests", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devicesTable.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  category: text("category").notNull().default("unknown"),
  wasBlocked: boolean("was_blocked").notNull().default(true),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertBlockedRequestSchema = createInsertSchema(
  blockedRequestsTable
).omit({ id: true, timestamp: true });

export type InsertBlockedRequest = z.infer<typeof insertBlockedRequestSchema>;
export type BlockedRequest = typeof blockedRequestsTable.$inferSelect;
