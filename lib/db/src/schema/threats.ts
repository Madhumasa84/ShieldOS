import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const threatReportsTable = pgTable("threat_reports", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  reporterId: integer("reporter_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  votes: integer("votes").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
});

export const insertThreatReportSchema = createInsertSchema(
  threatReportsTable
).omit({ id: true, reportedAt: true, votes: true, verified: true });

export type InsertThreatReport = z.infer<typeof insertThreatReportSchema>;
export type ThreatReport = typeof threatReportsTable.$inferSelect;

export const threatVotesTable = pgTable("threat_votes", {
  id: serial("id").primaryKey(),
  threatId: integer("threat_id")
    .notNull()
    .references(() => threatReportsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  vote: integer("vote").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ThreatVote = typeof threatVotesTable.$inferSelect;
