import { Router } from "express";
import { sql, count, desc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  blocklistEntriesTable,
  blockedRequestsTable,
  devicesTable,
  threatReportsTable,
  systemBlocklistTable,
} from "@workspace/db";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";

const router = Router();

// GET /v1/stats/dashboard — comprehensive live stats
// Admin sees ALL users' data; regular user sees only their own
router.get("/v1/stats/dashboard", requireAuth, async (req: AuthRequest, res) => {
  const isAdmin = req.role === "admin";
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sinceToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since5min = new Date(now.getTime() - 5 * 60 * 1000);

  // Fetch devices — admin gets all, user gets own
  const allDevices = await db
    .select({ id: devicesTable.id, lastSeen: devicesTable.lastSeen, isActive: devicesTable.isActive })
    .from(devicesTable)
    .where(isAdmin ? undefined : eq(devicesTable.userId, req.userId!));

  const deviceIds = allDevices.map((d) => d.id);

  const activeDevices = allDevices.filter(
    (d) => d.lastSeen != null ? d.lastSeen >= since24h : d.isActive
  ).length;
  const onlineDevices = allDevices.filter(
    (d) => d.lastSeen != null && d.lastSeen >= since5min
  ).length;

  // Domain counts — admin sees all custom, user sees own
  const [customDomainsResult, systemDomainsResult, threatsResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(blocklistEntriesTable)
      .where(isAdmin ? undefined : eq(blocklistEntriesTable.userId, req.userId!)),
    db.select({ count: count() }).from(systemBlocklistTable),
    db
      .select({ count: count() })
      .from(threatReportsTable)
      .where(eq(threatReportsTable.verified, true)),
  ]);

  const domainsInBlocklist =
    (customDomainsResult[0]?.count ?? 0) + (systemDomainsResult[0]?.count ?? 0);

  const emptyHours = Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, "0")}:00`,
    count: 0,
  }));

  if (deviceIds.length === 0) {
    res.json({
      trackers_blocked_today: 0,
      trackers_blocked_total: 0,
      domains_in_blocklist: domainsInBlocklist,
      active_devices: activeDevices,
      online_devices: onlineDevices,
      threats_detected: threatsResult[0]?.count ?? 0,
      blocked_by_hour: emptyHours,
      blocked_by_category: [],
      top_blocked_domains: [],
      is_admin: isAdmin,
    });
    return;
  }

  const deviceIdArray = sql`ARRAY[${sql.join(deviceIds, sql`, `)}]::int[]`;
  const deviceFilter = sql`${blockedRequestsTable.deviceId} = ANY(${deviceIdArray})`;
  const blockedFilter = sql`${blockedRequestsTable.wasBlocked} = true`;

  const [totalBlocked, todayBlocked, byHour, byCategory, topDomains] = await Promise.all([
    db
      .select({ count: count() })
      .from(blockedRequestsTable)
      .where(sql`${deviceFilter} AND ${blockedFilter}`),
    db
      .select({ count: count() })
      .from(blockedRequestsTable)
      .where(sql`${deviceFilter} AND ${blockedFilter} AND ${blockedRequestsTable.timestamp} >= ${sinceToday}`),
    db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${blockedRequestsTable.timestamp})::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(blockedRequestsTable)
      .where(sql`${deviceFilter} AND ${blockedFilter} AND ${blockedRequestsTable.timestamp} >= ${since24h}`)
      .groupBy(sql`EXTRACT(HOUR FROM ${blockedRequestsTable.timestamp})`),
    db
      .select({
        category: blockedRequestsTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(blockedRequestsTable)
      .where(sql`${deviceFilter} AND ${blockedFilter}`)
      .groupBy(blockedRequestsTable.category)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        domain: blockedRequestsTable.domain,
        count: sql<number>`count(*)::int`,
      })
      .from(blockedRequestsTable)
      .where(sql`${deviceFilter} AND ${blockedFilter}`)
      .groupBy(blockedRequestsTable.domain)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
  ]);

  const hourMap = new Map(byHour.map((r) => [r.hour, r.count]));
  const blocked_by_hour = Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, "0")}:00`,
    count: hourMap.get(i) ?? 0,
  }));

  const totalCat = byCategory.reduce((s, r) => s + r.count, 0);
  const blocked_by_category = byCategory.map((r) => ({
    category: r.category,
    count: r.count,
    percentage: totalCat > 0 ? Math.round((r.count / totalCat) * 1000) / 10 : 0,
  }));

  res.json({
    trackers_blocked_today: todayBlocked[0]?.count ?? 0,
    trackers_blocked_total: totalBlocked[0]?.count ?? 0,
    domains_in_blocklist: domainsInBlocklist,
    active_devices: activeDevices,
    online_devices: onlineDevices,
    threats_detected: threatsResult[0]?.count ?? 0,
    blocked_by_hour,
    blocked_by_category,
    top_blocked_domains: topDomains,
    is_admin: isAdmin,
  });
});

export default router;
