import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  range: text("range").notNull(),
  format: text("format").notNull(),
  fileName: text("file_name"),
  fileContent: text("file_content"),
  fileSize: integer("file_size"),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reportSchedulesTable = pgTable("report_schedules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  frequency: text("frequency").notNull().default("weekly"),
  format: text("format").notNull().default("pdf"),
  range: text("range").notNull().default("30d"),
  webhookUrl: text("webhook_url"),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Report = typeof reportsTable.$inferSelect;
export type ReportSchedule = typeof reportSchedulesTable.$inferSelect;
