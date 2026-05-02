import { Router } from "express";
import { eq, and, sql, desc, ilike, count } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  blocklistEntriesTable,
  blockedRequestsTable,
  devicesTable,
} from "@workspace/db";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";
import {
  CheckDomainBody,
  AddCustomDomainBody,
  RemoveCustomDomainParams,
  ListCustomBlocklistQueryParams,
  ListBlockedRequestsQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.post("/v1/blocklist/check", requireAuth, async (req: AuthRequest, res) => {
  const parse = CheckDomainBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { domain } = parse.data;

  const [entry] = await db
    .select()
    .from(blocklistEntriesTable)
    .where(
      and(
        eq(blocklistEntriesTable.userId, req.userId!),
        eq(blocklistEntriesTable.domain, domain.toLowerCase())
      )
    )
    .limit(1);

  res.json({
    domain,
    blocked: !!entry,
    category: entry?.category ?? "none",
    source: entry?.source ?? "none",
  });
});

router.get("/v1/blocklist/stats", requireAuth, async (req: AuthRequest, res) => {
  const totalResult = await db
    .select({ count: count() })
    .from(blocklistEntriesTable)
    .where(eq(blocklistEntriesTable.userId, req.userId!));

  const categoryBreakdown = await db
    .select({
      category: blocklistEntriesTable.category,
      count: sql<number>`count(*)::int`,
    })
    .from(blocklistEntriesTable)
    .where(eq(blocklistEntriesTable.userId, req.userId!))
    .groupBy(blocklistEntriesTable.category);

  res.json({
    total: totalResult[0]?.count ?? 0,
    byCategory: categoryBreakdown,
  });
});

router.get("/v1/blocklist/custom", requireAuth, async (req: AuthRequest, res) => {
  const parse = ListCustomBlocklistQueryParams.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid query parameters" });
    return;
  }
  const { category, search, page = 1, limit = 50 } = parse.data;
  const offset = (page - 1) * limit;

  const conditions = [eq(blocklistEntriesTable.userId, req.userId!)];
  if (category && category !== "all") {
    conditions.push(eq(blocklistEntriesTable.category, category));
  }
  if (search) {
    conditions.push(ilike(blocklistEntriesTable.domain, `%${search}%`));
  }

  const [entries, totalResult] = await Promise.all([
    db
      .select()
      .from(blocklistEntriesTable)
      .where(and(...conditions))
      .orderBy(desc(blocklistEntriesTable.addedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(blocklistEntriesTable)
      .where(and(...conditions)),
  ]);

  res.json({
    entries,
    total: totalResult[0]?.count ?? 0,
    page,
    limit,
  });
});

router.post("/v1/blocklist/custom", requireAuth, async (req: AuthRequest, res) => {
  const parse = AddCustomDomainBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { domain, category = "tracking" } = parse.data;

  const existing = await db
    .select()
    .from(blocklistEntriesTable)
    .where(
      and(
        eq(blocklistEntriesTable.userId, req.userId!),
        eq(blocklistEntriesTable.domain, domain.toLowerCase())
      )
    )
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ message: "Domain already in blocklist" });
    return;
  }

  const [entry] = await db
    .insert(blocklistEntriesTable)
    .values({
      userId: req.userId!,
      domain: domain.toLowerCase(),
      category,
      source: "custom",
    })
    .returning();

  res.status(201).json(entry);
});

router.delete("/v1/blocklist/custom/:domain", requireAuth, async (req: AuthRequest, res) => {
  const parse = RemoveCustomDomainParams.safeParse({ domain: req.params["domain"] });
  if (!parse.success) {
    res.status(400).json({ message: "Invalid domain" });
    return;
  }

  await db
    .delete(blocklistEntriesTable)
    .where(
      and(
        eq(blocklistEntriesTable.userId, req.userId!),
        eq(blocklistEntriesTable.domain, parse.data.domain)
      )
    );

  res.json({ message: "Domain removed" });
});

router.get("/v1/blocklist/blocked-requests", requireAuth, async (req: AuthRequest, res) => {
  const parse = ListBlockedRequestsQueryParams.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid query parameters" });
    return;
  }
  const { hours = 24, page = 1, limit = 50 } = parse.data;
  const offset = (page - 1) * limit;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const userDevices = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(eq(devicesTable.userId, req.userId!));

  const deviceIds = userDevices.map((d) => d.id);
  if (deviceIds.length === 0) {
    res.json({ requests: [], total: 0, page, limit });
    return;
  }

  const [requests, totalResult] = await Promise.all([
    db
      .select({
        id: blockedRequestsTable.id,
        domain: blockedRequestsTable.domain,
        category: blockedRequestsTable.category,
        timestamp: blockedRequestsTable.timestamp,
        deviceId: blockedRequestsTable.deviceId,
        deviceName: devicesTable.name,
      })
      .from(blockedRequestsTable)
      .innerJoin(devicesTable, eq(devicesTable.id, blockedRequestsTable.deviceId))
      .where(
        and(
          sql`${blockedRequestsTable.deviceId} = ANY(ARRAY[${sql.join(deviceIds, sql`, `)}]::int[])`,
          sql`${blockedRequestsTable.timestamp} >= ${since}`
        )
      )
      .orderBy(desc(blockedRequestsTable.timestamp))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(blockedRequestsTable)
      .where(
        and(
          sql`${blockedRequestsTable.deviceId} = ANY(ARRAY[${sql.join(deviceIds, sql`, `)}]::int[])`,
          sql`${blockedRequestsTable.timestamp} >= ${since}`
        )
      ),
  ]);

  res.json({ requests, total: totalResult[0]?.count ?? 0, page, limit });
});

export default router;
