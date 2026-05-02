import { Router } from "express";
import { eq, sql, count, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  blocklistEntriesTable,
  blockedRequestsTable,
  devicesTable,
  threatReportsTable,
} from "@workspace/db";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";

const router = Router();

router.get("/v1/dashboard/summary", requireAuth, async (req: AuthRequest, res) => {
  const userDevices = await db
    .select({ id: devicesTable.id, isActive: devicesTable.isActive })
    .from(devicesTable)
    .where(eq(devicesTable.userId, req.userId!));

  const deviceIds = userDevices.map((d) => d.id);
  const activeDevices = userDevices.filter((d) => d.isActive).length;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [domainsResult, threatsResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(blocklistEntriesTable)
      .where(eq(blocklistEntriesTable.userId, req.userId!)),
    db
      .select({ count: count() })
      .from(threatReportsTable)
      .where(eq(threatReportsTable.verified, true)),
  ]);

  if (deviceIds.length === 0) {
    res.json({
      trackersBlockedTotal: 0,
      domainsInBlocklist: domainsResult[0]?.count ?? 0,
      activeDevices,
      threatsDetected: threatsResult[0]?.count ?? 0,
      blockedLast24h: 0,
      topBlockedDomain: "none",
    });
    return;
  }

  const deviceIdArray = sql`ARRAY[${sql.join(deviceIds, sql`, `)}]::int[]`;

  const [totalBlocked, blockedLast24h, topDomain] = await Promise.all([
    db
      .select({ count: count() })
      .from(blockedRequestsTable)
      .where(sql`${blockedRequestsTable.deviceId} = ANY(${deviceIdArray})`),
    db
      .select({ count: count() })
      .from(blockedRequestsTable)
      .where(
        sql`${blockedRequestsTable.deviceId} = ANY(${deviceIdArray}) AND ${blockedRequestsTable.timestamp} >= ${since24h}`
      ),
    db
      .select({
        domain: blockedRequestsTable.domain,
        cnt: sql<number>`count(*)::int`,
      })
      .from(blockedRequestsTable)
      .where(sql`${blockedRequestsTable.deviceId} = ANY(${deviceIdArray})`)
      .groupBy(blockedRequestsTable.domain)
      .orderBy(desc(sql`count(*)`))
      .limit(1),
  ]);

  res.json({
    trackersBlockedTotal: totalBlocked[0]?.count ?? 0,
    domainsInBlocklist: domainsResult[0]?.count ?? 0,
    activeDevices,
    threatsDetected: threatsResult[0]?.count ?? 0,
    blockedLast24h: blockedLast24h[0]?.count ?? 0,
    topBlockedDomain: topDomain[0]?.domain ?? "none",
  });
});

router.get("/v1/dashboard/blocked-chart", requireAuth, async (req: AuthRequest, res) => {
  const userDevices = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(eq(devicesTable.userId, req.userId!));

  const deviceIds = userDevices.map((d) => d.id);

  if (deviceIds.length === 0) {
    const data = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, "0")}:00`,
      count: 0,
    }));
    res.json({ data });
    return;
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deviceIdArray = sql`ARRAY[${sql.join(deviceIds, sql`, `)}]::int[]`;

  const rows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${blockedRequestsTable.timestamp})::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(blockedRequestsTable)
    .where(
      sql`${blockedRequestsTable.deviceId} = ANY(${deviceIdArray}) AND ${blockedRequestsTable.timestamp} >= ${since24h}`
    )
    .groupBy(sql`EXTRACT(HOUR FROM ${blockedRequestsTable.timestamp})`);

  const hourMap = new Map(rows.map((r) => [r.hour, r.count]));
  const data = Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, "0")}:00`,
    count: hourMap.get(i) ?? 0,
  }));

  res.json({ data });
});

router.get("/v1/dashboard/category-breakdown", requireAuth, async (req: AuthRequest, res) => {
  const userDevices = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(eq(devicesTable.userId, req.userId!));

  const deviceIds = userDevices.map((d) => d.id);

  if (deviceIds.length === 0) {
    res.json({ data: [] });
    return;
  }

  const deviceIdArray = sql`ARRAY[${sql.join(deviceIds, sql`, `)}]::int[]`;

  const rows = await db
    .select({
      category: blockedRequestsTable.category,
      count: sql<number>`count(*)::int`,
    })
    .from(blockedRequestsTable)
    .where(sql`${blockedRequestsTable.deviceId} = ANY(${deviceIdArray})`)
    .groupBy(blockedRequestsTable.category);

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const data = rows.map((r) => ({
    category: r.category,
    count: r.count,
    percentage: total > 0 ? Math.round((r.count / total) * 100 * 10) / 10 : 0,
  }));

  res.json({ data });
});

export default router;
