import { Router } from "express";
import { eq, and, desc, sql, count, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import { blockedRequestsTable, devicesTable, dnsAllowlistTable } from "@workspace/db";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";
import {
  checkDomain,
  flushCache,
  getCacheStats,
  invalidateUserAllowlist,
} from "../services/dns-engine";

const router = Router();

// ─── POST /v1/dns/query ───────────────────────────────────────────────────────
router.post("/v1/dns/query", requireAuth, async (req: AuthRequest, res) => {
  const { domain, device_id } = req.body as { domain?: string; device_id?: string };
  if (!domain || typeof domain !== "string") {
    res.status(400).json({ message: "domain is required" });
    return;
  }

  const t0 = Date.now();
  const result = await checkDomain(req.userId!, domain);
  const responseTimeMs = Date.now() - t0;

  // Async log — never block the response
  if (result.blocked) {
    setImmediate(async () => {
      try {
        const deviceIdNum = device_id ? parseInt(device_id, 10) : null;
        let resolvedDeviceId: number | null = deviceIdNum && !isNaN(deviceIdNum) ? deviceIdNum : null;

        // If no explicit device_id, use the user's first device
        if (!resolvedDeviceId) {
          const [dev] = await db
            .select({ id: devicesTable.id })
            .from(devicesTable)
            .where(eq(devicesTable.userId, req.userId!))
            .limit(1);
          resolvedDeviceId = dev?.id ?? null;
        }

        if (resolvedDeviceId) {
          await db.insert(blockedRequestsTable).values({
            deviceId: resolvedDeviceId,
            domain: domain.toLowerCase(),
            category: result.category,
            wasBlocked: result.blocked,
          });
        }
      } catch {
        // Swallow — logging must never affect the response
      }
    });
  }

  res.json({ blocked: result.blocked, category: result.category, rule: result.rule, response_time_ms: responseTimeMs });
});

// ─── POST /v1/dns/batch ───────────────────────────────────────────────────────
router.post("/v1/dns/batch", requireAuth, async (req: AuthRequest, res) => {
  const { domains, device_id } = req.body as { domains?: string[]; device_id?: string };
  if (!Array.isArray(domains) || domains.length === 0) {
    res.status(400).json({ message: "domains array is required" });
    return;
  }
  if (domains.length > 100) {
    res.status(400).json({ message: "Maximum 100 domains per batch request" });
    return;
  }

  const results: Record<string, boolean> = {};
  const blockedToLog: string[] = [];

  await Promise.all(
    domains.map(async (domain) => {
      if (typeof domain !== "string") return;
      const r = await checkDomain(req.userId!, domain);
      results[domain] = r.blocked;
      if (r.blocked) blockedToLog.push(domain.toLowerCase());
    })
  );

  // Async log blocked domains
  if (blockedToLog.length > 0) {
    setImmediate(async () => {
      try {
        const deviceIdNum = device_id ? parseInt(device_id, 10) : null;
        let resolvedDeviceId: number | null = deviceIdNum && !isNaN(deviceIdNum) ? deviceIdNum : null;
        if (!resolvedDeviceId) {
          const [dev] = await db
            .select({ id: devicesTable.id })
            .from(devicesTable)
            .where(eq(devicesTable.userId, req.userId!))
            .limit(1);
          resolvedDeviceId = dev?.id ?? null;
        }
        if (resolvedDeviceId) {
          await db.insert(blockedRequestsTable).values(
            blockedToLog.map((domain) => ({
              deviceId: resolvedDeviceId!,
              domain,
              category: "batch",
              wasBlocked: true,
            }))
          );
        }
      } catch {
        // Swallow
      }
    });
  }

  res.json({ results });
});

// ─── GET /v1/dns/stats/:deviceId ─────────────────────────────────────────────
router.get("/v1/dns/stats/:deviceId", requireAuth, async (req: AuthRequest, res) => {
  const deviceId = parseInt(req.params["deviceId"]!, 10);
  if (isNaN(deviceId)) {
    res.status(400).json({ message: "Invalid deviceId" });
    return;
  }

  // Verify device belongs to user
  const [device] = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.id, deviceId), eq(devicesTable.userId, req.userId!)))
    .limit(1);

  if (!device) {
    res.status(404).json({ message: "Device not found" });
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [totalToday, blockedToday, topBlocked, byHour, mostRecent] = await Promise.all([
    db
      .select({ count: count() })
      .from(blockedRequestsTable)
      .where(and(eq(blockedRequestsTable.deviceId, deviceId), gte(blockedRequestsTable.timestamp, todayStart))),

    db
      .select({ count: count() })
      .from(blockedRequestsTable)
      .where(
        and(
          eq(blockedRequestsTable.deviceId, deviceId),
          eq(blockedRequestsTable.wasBlocked, true),
          gte(blockedRequestsTable.timestamp, todayStart)
        )
      ),

    db
      .select({
        domain: blockedRequestsTable.domain,
        count: sql<number>`count(*)::int`,
      })
      .from(blockedRequestsTable)
      .where(
        and(
          eq(blockedRequestsTable.deviceId, deviceId),
          eq(blockedRequestsTable.wasBlocked, true),
          gte(blockedRequestsTable.timestamp, todayStart)
        )
      )
      .groupBy(blockedRequestsTable.domain)
      .orderBy(sql`count(*) DESC`)
      .limit(10),

    db
      .select({
        hour: sql<number>`extract(hour from timestamp)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(blockedRequestsTable)
      .where(
        and(
          eq(blockedRequestsTable.deviceId, deviceId),
          eq(blockedRequestsTable.wasBlocked, true),
          gte(blockedRequestsTable.timestamp, todayStart)
        )
      )
      .groupBy(sql`extract(hour from timestamp)`)
      .orderBy(sql`extract(hour from timestamp)`),

    db
      .select({ timestamp: blockedRequestsTable.timestamp })
      .from(blockedRequestsTable)
      .where(
        and(eq(blockedRequestsTable.deviceId, deviceId), eq(blockedRequestsTable.wasBlocked, true))
      )
      .orderBy(desc(blockedRequestsTable.timestamp))
      .limit(1),
  ]);

  const totalQueriesNum = totalToday[0]?.count ?? 0;
  const blockedNum = blockedToday[0]?.count ?? 0;
  const blockRate =
    totalQueriesNum === 0 ? "0.0%" : `${((blockedNum / totalQueriesNum) * 100).toFixed(1)}%`;

  // Build 24-hour array
  const hourMap = new Map(byHour.map((r) => [r.hour, r.count]));
  const queriesByHour = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: hourMap.get(h) ?? 0,
  }));

  let mostRecentBlock: string | null = null;
  if (mostRecent[0]?.timestamp) {
    const diffMs = Date.now() - new Date(mostRecent[0].timestamp).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) mostRecentBlock = "just now";
    else if (diffMin < 60) mostRecentBlock = `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
    else {
      const diffHr = Math.floor(diffMin / 60);
      mostRecentBlock = `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
    }
  }

  res.json({
    total_queries_today: totalQueriesNum,
    blocked_today: blockedNum,
    block_rate: blockRate,
    top_blocked: topBlocked,
    queries_by_hour: queriesByHour,
    most_recent_block: mostRecentBlock,
  });
});

// ─── GET /v1/dns/allow ────────────────────────────────────────────────────────
router.get("/v1/dns/allow", requireAuth, async (req: AuthRequest, res) => {
  const entries = await db
    .select()
    .from(dnsAllowlistTable)
    .where(eq(dnsAllowlistTable.userId, req.userId!))
    .orderBy(desc(dnsAllowlistTable.addedAt));

  res.json({
    allowlist: entries.map((e) => ({
      id: e.id,
      domain: e.domain,
      addedAt: e.addedAt.toISOString(),
    })),
  });
});

// ─── POST /v1/dns/allow ───────────────────────────────────────────────────────
router.post("/v1/dns/allow", requireAuth, async (req: AuthRequest, res) => {
  const { domain } = req.body as { domain?: string };
  if (!domain || typeof domain !== "string") {
    res.status(400).json({ message: "domain is required" });
    return;
  }

  const normalized = domain.toLowerCase().trim();

  const [existing] = await db
    .select()
    .from(dnsAllowlistTable)
    .where(and(eq(dnsAllowlistTable.userId, req.userId!), eq(dnsAllowlistTable.domain, normalized)))
    .limit(1);

  if (existing) {
    res.status(409).json({ message: "Domain already in allowlist" });
    return;
  }

  const [entry] = await db
    .insert(dnsAllowlistTable)
    .values({ userId: req.userId!, domain: normalized })
    .returning();

  invalidateUserAllowlist(req.userId!);

  res.status(201).json({ id: entry!.id, domain: entry!.domain, addedAt: entry!.addedAt.toISOString() });
});

// ─── DELETE /v1/dns/allow/:domain ─────────────────────────────────────────────
router.delete("/v1/dns/allow/:domain", requireAuth, async (req: AuthRequest, res) => {
  const domain = decodeURIComponent(req.params["domain"]!).toLowerCase();

  const deleted = await db
    .delete(dnsAllowlistTable)
    .where(and(eq(dnsAllowlistTable.userId, req.userId!), eq(dnsAllowlistTable.domain, domain)))
    .returning();

  if (deleted.length === 0) {
    res.status(404).json({ message: "Domain not found in allowlist" });
    return;
  }

  invalidateUserAllowlist(req.userId!);
  res.json({ message: `${domain} removed from allowlist` });
});

// ─── POST /v1/dns/cache/flush (admin only) ────────────────────────────────────
router.post("/v1/dns/cache/flush", requireAuth, async (req: AuthRequest, res) => {
  if ((req as any).userRole !== "admin") {
    res.status(403).json({ message: "Admin access required" });
    return;
  }
  const entriesCleared = flushCache();
  res.json({ entries_cleared: entriesCleared });
});

// ─── GET /v1/dns/cache/stats ──────────────────────────────────────────────────
router.get("/v1/dns/cache/stats", requireAuth, async (_req: AuthRequest, res) => {
  const stats = getCacheStats();
  res.json(stats);
});

export default router;
