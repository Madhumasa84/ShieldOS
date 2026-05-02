import { Router } from "express";
import { eq, sql, count, desc, and } from "drizzle-orm";
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

// GET /v1/stats/dashboard — comprehensive live stats, single endpoint
router.get("/v1/stats/dashboard", requireAuth, async (req: AuthRequest, res) => {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sinceToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since5min = new Date(now.getTime() - 5 * 60 * 1000);

  // Fetch user devices
  const userDevices = await db
    .select({ id: devicesTable.id, lastSeen: devicesTable.lastSeen, isActive: devicesTable.isActive })
    .from(devicesTable)
    .where(eq(devicesTable.userId, req.userId!));

  const deviceIds = userDevices.map((d) => d.id);

  // Active in last 24h = seen in last 24h (or isActive if never called API)
  const activeDevices = userDevices.filter(
    (d) => d.lastSeen != null ? d.lastSeen >= since24h : d.isActive
  ).length;

  // Online = seen in last 5 min
  const onlineDevices = userDevices.filter(
    (d) => d.lastSeen != null && d.lastSeen >= since5min
  ).length;

  // Parallel fetches that don't need device IDs
  const [customDomainsResult, systemDomainsResult, threatsResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(blocklistEntriesTable)
      .where(eq(blocklistEntriesTable.userId, req.userId!)),
    db.select({ count: count() }).from(systemBlocklistTable),
    db
      .select({ count: count() })
      .from(threatReportsTable)
      .where(eq(threatReportsTable.verified, true)),
  ]);

  const domainsInBlocklist =
    (customDomainsResult[0]?.count ?? 0) + (systemDomainsResult[0]?.count ?? 0);

  if (deviceIds.length === 0) {
    const emptyHours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, "0")}:00`,
      count: 0,
    }));
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
    });
    return;
  }

  const deviceIdArray = sql`ARRAY[${sql.join(deviceIds, sql`, `)}]::int[]`;
  const deviceFilter = sql`${blockedRequestsTable.deviceId} = ANY(${deviceIdArray})`;
  const blockedFilter = sql`${blockedRequestsTable.wasBlocked} = true`;

  const [totalBlocked, todayBlocked, byHour, byCategory, topDomains] = await Promise.all([
    // All-time total blocked
    db
      .select({ count: count() })
      .from(blockedRequestsTable)
      .where(sql`${deviceFilter} AND ${blockedFilter}`),

    // Blocked today (since midnight)
    db
      .select({ count: count() })
      .from(blockedRequestsTable)
      .where(
        sql`${deviceFilter} AND ${blockedFilter} AND ${blockedRequestsTable.timestamp} >= ${sinceToday}`
      ),

    // By hour (last 24h)
    db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${blockedRequestsTable.timestamp})::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(blockedRequestsTable)
      .where(
        sql`${deviceFilter} AND ${blockedFilter} AND ${blockedRequestsTable.timestamp} >= ${since24h}`
      )
      .groupBy(sql`EXTRACT(HOUR FROM ${blockedRequestsTable.timestamp})`),

    // By category (all time, blocked only)
    db
      .select({
        category: blockedRequestsTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(blockedRequestsTable)
      .where(sql`${deviceFilter} AND ${blockedFilter}`)
      .groupBy(blockedRequestsTable.category)
      .orderBy(desc(sql`count(*)`)),

    // Top 10 blocked domains (all time)
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
  });
});

export default router;
