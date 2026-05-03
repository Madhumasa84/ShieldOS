import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const dnsAllowlistTable = pgTable(
  "dns_allowlist",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    addedAt: timestamp("added_at").notNull().defaultNow(),
  },
  (t) => [unique("dns_allowlist_user_domain").on(t.userId, t.domain)]
);

export const insertDnsAllowlistSchema = createInsertSchema(dnsAllowlistTable).omit({
  id: true,
  addedAt: true,
});

export type InsertDnsAllowlist = z.infer<typeof insertDnsAllowlistSchema>;
export type DnsAllowlistEntry = typeof dnsAllowlistTable.$inferSelect;
