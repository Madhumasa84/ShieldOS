import { Router } from "express";
import { db } from "@workspace/db";
import { devicesTable, blockedRequestsTable, threatReportsTable } from "@workspace/db";
import { eq, sql, and, gte, lte, count, sum, desc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";

const router = Router();

// ── Range parser ──────────────────────────────────────────────────────────────
function parseRange(query: any): { from: Date; to: Date; granularity: string } {
  const to = new Date();
  const { range, from: fromQ, to: toQ, granularity } = query;

  if (fromQ && toQ) {
    const from = new Date(fromQ as string);
    const toDate = new Date(toQ as string);
    const diffDays = (toDate.getTime() - from.getTime()) / 86_400_000;
    return { from, to: toDate, granularity: (granularity as string) ?? (diffDays <= 2 ? "hour" : "day") };
  }

  let from: Date;
  let defaultGranularity: string;
  switch (range) {
    case "1d":
      from = new Date(Date.now() - 86_400_000);
      defaultGranularity = "hour";
      break;
    case "30d":
      from = new Date(Date.now() - 30 * 86_400_000);
      defaultGranularity = "day";
      break;
    case "90d":
      from = new Date(Date.now() - 90 * 86_400_000);
      defaultGranularity = "day";
      break;
    default: // 7d
      from = new Date(Date.now() - 7 * 86_400_000);
      defaultGranularity = "day";
  }

  return { from, to, granularity: (granularity as string) ?? defaultGranularity };
}

// ── Overview ──────────────────────────────────────────────────────────────────
router.get("/v1/analytics/overview", requireAuth, async (req: AuthRequest, res) => {
  const { from, to } = parseRange(req.query);
  const userId = req.userId!;

  const devices = await db.select({ id: devicesTable.id }).from(devicesTable).where(eq(devicesTable.userId, userId));
  const deviceIds = devices.map((d) => d.id);

  if (deviceIds.length === 0) {
    res.json({ totalRequests: 0, blocked: 0, allowed: 0, blockRate: 0, threats: 0, deviceCount: 0 });
    return;
  }

  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_requests,
      SUM(CASE WHEN was_blocked THEN 1 ELSE 0 END)::int AS blocked
    FROM blocked_requests
    WHERE device_id = ANY(${sql.raw(`ARRAY[${deviceIds.join(",")}]::int[]`)})
      AND timestamp BETWEEN ${from} AND ${to}
  `);

  const row: any = result.rows[0] ?? {};
  const total = Number(row.total_requests ?? 0);
  const blocked = Number(row.blocked ?? 0);

  const [{ threatCount }] = await db
    .select({ threatCount: count() })
    .from(threatReportsTable)
    .where(and(eq(threatReportsTable.reporterId, userId), gte(threatReportsTable.reportedAt, from), lte(threatReportsTable.reportedAt, to)));

  res.json({
    totalRequests: total,
    blocked,
    allowed: total - blocked,
    blockRate: total > 0 ? Math.round((blocked / total) * 1000) / 10 : 0,
    threats: Number(threatCount),
    deviceCount: deviceIds.length,
  });
});

// ── Blocked over time ─────────────────────────────────────────────────────────
router.get("/v1/analytics/blocked-over-time", requireAuth, async (req: AuthRequest, res) => {
  const { from, to, granularity } = parseRange(req.query);
  const userId = req.userId!;

  const devices = await db.select({ id: devicesTable.id }).from(devicesTable).where(eq(devicesTable.userId, userId));
  const deviceIds = devices.map((d) => d.id);

  if (deviceIds.length === 0) { res.json({ data: [] }); return; }

  const g = ["hour", "day", "week"].includes(granularity) ? granularity : "day";
  const result = await db.execute(sql`
    SELECT
      date_trunc(${g}, timestamp) AS bucket,
      COUNT(*)::int AS total,
      SUM(CASE WHEN was_blocked THEN 1 ELSE 0 END)::int AS blocked
    FROM blocked_requests
    WHERE device_id = ANY(${sql.raw(`ARRAY[${deviceIds.join(",")}]::int[]`)})
      AND timestamp BETWEEN ${from} AND ${to}
    GROUP BY bucket
    ORDER BY bucket
  `);

  const data = (result.rows as any[]).map((r) => ({
    bucket: r.bucket,
    total: Number(r.total),
    blocked: Number(r.blocked),
    allowed: Number(r.total) - Number(r.blocked),
    blockRate: Number(r.total) > 0 ? Math.round((Number(r.blocked) / Number(r.total)) * 1000) / 10 : 0,
  }));

  res.json({ data, granularity: g });
});

// ── Top domains ───────────────────────────────────────────────────────────────
router.get("/v1/analytics/top-domains", requireAuth, async (req: AuthRequest, res) => {
  const { from, to } = parseRange(req.query);
  const limit = Math.min(50, Math.max(1, Number(req.query["limit"] ?? 20)));
  const userId = req.userId!;

  const devices = await db.select({ id: devicesTable.id }).from(devicesTable).where(eq(devicesTable.userId, userId));
  const deviceIds = devices.map((d) => d.id);
  if (deviceIds.length === 0) { res.json({ domains: [] }); return; }

  const result = await db.execute(sql`
    SELECT domain, category, COUNT(*)::int AS count
    FROM blocked_requests
    WHERE device_id = ANY(${sql.raw(`ARRAY[${deviceIds.join(",")}]::int[]`)})
      AND was_blocked = true
      AND timestamp BETWEEN ${from} AND ${to}
    GROUP BY domain, category
    ORDER BY count DESC
    LIMIT ${limit}
  `);

  res.json({ domains: (result.rows as any[]).map((r) => ({ domain: r.domain, category: r.category, count: Number(r.count) })) });
});

// ── By category ───────────────────────────────────────────────────────────────
router.get("/v1/analytics/by-category", requireAuth, async (req: AuthRequest, res) => {
  const { from, to } = parseRange(req.query);
  const userId = req.userId!;

  const devices = await db.select({ id: devicesTable.id }).from(devicesTable).where(eq(devicesTable.userId, userId));
  const deviceIds = devices.map((d) => d.id);
  if (deviceIds.length === 0) { res.json({ categories: [] }); return; }

  const result = await db.execute(sql`
    SELECT category, COUNT(*)::int AS count
    FROM blocked_requests
    WHERE device_id = ANY(${sql.raw(`ARRAY[${deviceIds.join(",")}]::int[]`)})
      AND was_blocked = true
      AND timestamp BETWEEN ${from} AND ${to}
    GROUP BY category
    ORDER BY count DESC
  `);

  const total = (result.rows as any[]).reduce((s: number, r: any) => s + Number(r.count), 0);
  const categories = (result.rows as any[]).map((r) => ({
    category: r.category,
    count: Number(r.count),
    percent: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
  }));

  res.json({ categories, total });
});

// ── By device ─────────────────────────────────────────────────────────────────
router.get("/v1/analytics/by-device", requireAuth, async (req: AuthRequest, res) => {
  const { from, to } = parseRange(req.query);
  const userId = req.userId!;

  const devices = await db.select({ id: devicesTable.id, name: devicesTable.name }).from(devicesTable).where(eq(devicesTable.userId, userId));
  if (devices.length === 0) { res.json({ devices: [] }); return; }

  const deviceIds = devices.map((d) => d.id);

  const result = await db.execute(sql`
    SELECT
      device_id,
      COUNT(*)::int AS total,
      SUM(CASE WHEN was_blocked THEN 1 ELSE 0 END)::int AS blocked
    FROM blocked_requests
    WHERE device_id = ANY(${sql.raw(`ARRAY[${deviceIds.join(",")}]::int[]`)})
      AND timestamp BETWEEN ${from} AND ${to}
    GROUP BY device_id
  `);

  const statsMap = new Map((result.rows as any[]).map((r) => [Number(r.device_id), r]));

  const deviceStats = devices.map((d) => {
    const stats: any = statsMap.get(d.id) ?? { total: 0, blocked: 0 };
    const total = Number(stats.total ?? 0);
    const blocked = Number(stats.blocked ?? 0);
    return {
      deviceId: d.id,
      name: d.name,
      total,
      blocked,
      allowed: total - blocked,
      blockRate: total > 0 ? Math.round((blocked / total) * 1000) / 10 : 0,
    };
  });

  res.json({ devices: deviceStats });
});

// ── Threats timeline ──────────────────────────────────────────────────────────
router.get("/v1/analytics/threats", requireAuth, async (req: AuthRequest, res) => {
  const { from, to } = parseRange(req.query);
  const userId = req.userId!;

  const threats = await db
    .select()
    .from(threatReportsTable)
    .where(
      and(
        eq(threatReportsTable.reporterId, userId),
        gte(threatReportsTable.reportedAt, from),
        lte(threatReportsTable.reportedAt, to)
      )
    )
    .orderBy(desc(threatReportsTable.reportedAt));

  res.json({ threats });
});

export default router;
