import { Router, Request, Response } from "express";
import { eq, and, sql, desc, ilike, count, or } from "drizzle-orm";
import multer from "multer";
import { db } from "@workspace/db";
import {
  blocklistEntriesTable,
  blockedRequestsTable,
  devicesTable,
  systemBlocklistTable,
  blocklistSyncStatusTable,
} from "@workspace/db";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";
import {
  CheckDomainBody,
  AddCustomDomainBody,
  RemoveCustomDomainParams,
  ListCustomBlocklistQueryParams,
  ListBlockedRequestsQueryParams,
} from "@workspace/api-zod";
import {
  runBlocklistSync,
  isSyncRunning,
  parseHostsFile,
  categorizeDomain,
} from "../services/blocklist-sync";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /v1/blocklist/check — checks custom + system blocklist
router.post("/v1/blocklist/check", requireAuth, async (req: AuthRequest, res: Response) => {
  const parse = CheckDomainBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { domain } = parse.data;
  const normalized = domain.toLowerCase();

  // Check user's custom blocklist first
  const [customEntry] = await db
    .select()
    .from(blocklistEntriesTable)
    .where(
      and(
        eq(blocklistEntriesTable.userId, req.userId!),
        eq(blocklistEntriesTable.domain, normalized)
      )
    )
    .limit(1);

  if (customEntry) {
    res.json({
      domain,
      blocked: true,
      category: customEntry.category,
      source: customEntry.source,
      addedAt: customEntry.addedAt.toISOString(),
    });
    return;
  }

  // Check system blocklist
  const [systemEntry] = await db
    .select()
    .from(systemBlocklistTable)
    .where(eq(systemBlocklistTable.domain, normalized))
    .limit(1);

  res.json({
    domain,
    blocked: !!systemEntry,
    category: systemEntry?.category ?? "none",
    source: systemEntry?.source ?? "none",
    addedAt: systemEntry?.addedAt?.toISOString() ?? null,
  });
});

// GET /v1/blocklist/stats — custom + system counts + sync info
router.get("/v1/blocklist/stats", requireAuth, async (req: AuthRequest, res: Response) => {
  const [customTotal, customByCategory, systemTotal, systemByCategory, lastSync] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(blocklistEntriesTable)
        .where(eq(blocklistEntriesTable.userId, req.userId!)),
      db
        .select({
          category: blocklistEntriesTable.category,
          count: sql<number>`count(*)::int`,
        })
        .from(blocklistEntriesTable)
        .where(eq(blocklistEntriesTable.userId, req.userId!))
        .groupBy(blocklistEntriesTable.category),
      db.select({ count: count() }).from(systemBlocklistTable),
      db
        .select({
          category: systemBlocklistTable.category,
          count: sql<number>`count(*)::int`,
        })
        .from(systemBlocklistTable)
        .groupBy(systemBlocklistTable.category),
      db
        .select()
        .from(blocklistSyncStatusTable)
        .orderBy(desc(blocklistSyncStatusTable.startedAt))
        .limit(1),
    ]);

  const sync = lastSync[0];
  res.json({
    total: customTotal[0]?.count ?? 0,
    byCategory: customByCategory,
    systemTotal: systemTotal[0]?.count ?? 0,
    systemByCategory,
    lastSyncAt: sync?.completedAt?.toISOString() ?? null,
    syncStatus: isSyncRunning() ? "running" : (sync?.status ?? "never"),
  });
});

// GET /v1/blocklist/custom — user's custom domains
router.get("/v1/blocklist/custom", requireAuth, async (req: AuthRequest, res: Response) => {
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

  res.json({ entries, total: totalResult[0]?.count ?? 0, page, limit });
});

// POST /v1/blocklist/custom — add custom domain
router.post("/v1/blocklist/custom", requireAuth, async (req: AuthRequest, res: Response) => {
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
    .values({ userId: req.userId!, domain: domain.toLowerCase(), category, source: "custom" })
    .returning();

  res.status(201).json(entry);
});

// DELETE /v1/blocklist/custom/:domain
router.delete("/v1/blocklist/custom/:domain", requireAuth, async (req: AuthRequest, res: Response) => {
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

// GET /v1/blocklist/system — paginated system blocklist
router.get("/v1/blocklist/system", requireAuth, async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query["limit"]) || 50));
  const offset = (page - 1) * limit;
  const search = req.query["search"] as string | undefined;
  const category = req.query["category"] as string | undefined;
  const source = req.query["source"] as string | undefined;

  const conditions = [];
  if (search) conditions.push(ilike(systemBlocklistTable.domain, `%${search}%`));
  if (category) conditions.push(eq(systemBlocklistTable.category, category));
  if (source) conditions.push(eq(systemBlocklistTable.source, source));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [entries, totalResult] = await Promise.all([
    db
      .select()
      .from(systemBlocklistTable)
      .where(where)
      .orderBy(systemBlocklistTable.domain)
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(systemBlocklistTable).where(where),
  ]);

  res.json({ entries, total: totalResult[0]?.count ?? 0, page, limit });
});

// GET /v1/blocklist/sync-status
router.get("/v1/blocklist/sync-status", requireAuth, async (_req: Request, res: Response) => {
  const [latest] = await db
    .select()
    .from(blocklistSyncStatusTable)
    .orderBy(desc(blocklistSyncStatusTable.startedAt))
    .limit(1);

  if (!latest) {
    res.json({
      id: 0,
      status: isSyncRunning() ? "running" : "never",
      totalDomains: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    });
    return;
  }

  res.json({
    id: latest.id,
    status: isSyncRunning() ? "running" : latest.status,
    totalDomains: latest.totalDomains,
    startedAt: latest.startedAt.toISOString(),
    completedAt: latest.completedAt?.toISOString() ?? null,
    error: latest.error ?? null,
  });
});

// POST /v1/blocklist/sync — trigger manual sync
router.post("/v1/blocklist/sync", requireAuth, async (_req: Request, res: Response) => {
  if (isSyncRunning()) {
    res.json({ message: "Sync already in progress" });
    return;
  }
  // Run async, don't await
  runBlocklistSync().catch(() => {});
  res.json({ message: "Blocklist sync started" });
});

// POST /v1/blocklist/import — upload hosts .txt file
router.post(
  "/v1/blocklist/import",
  requireAuth,
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ message: "No file uploaded. Send a multipart/form-data request with field 'file'." });
      return;
    }

    const content = req.file.buffer.toString("utf-8");
    const domains = parseHostsFile(content);

    if (domains.length === 0) {
      res.status(400).json({ message: "No valid domains found in file" });
      return;
    }

    const BATCH_SIZE = 500;
    let added = 0;
    let skipped = 0;

    // Get existing custom domains for this user to deduplicate
    const existingRows = await db
      .select({ domain: blocklistEntriesTable.domain })
      .from(blocklistEntriesTable)
      .where(eq(blocklistEntriesTable.userId, req.userId!));
    const existingSet = new Set(existingRows.map((r) => r.domain));

    const toInsert = domains
      .filter((d) => {
        if (existingSet.has(d)) { skipped++; return false; }
        return true;
      })
      .map((domain) => ({
        userId: req.userId!,
        domain,
        category: categorizeDomain(domain),
        source: "import",
      }));

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      try {
        await db.insert(blocklistEntriesTable).values(batch).onConflictDoNothing();
        added += batch.length;
      } catch {
        skipped += batch.length;
      }
    }

    res.json({ added, skipped, total: domains.length });
  }
);

// GET /v1/blocklist/blocked-requests
router.get("/v1/blocklist/blocked-requests", requireAuth, async (req: AuthRequest, res: Response) => {
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
