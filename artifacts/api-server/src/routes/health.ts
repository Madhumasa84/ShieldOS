import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { systemBlocklistTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";
import { getCacheStats } from "../services/dns-engine";

const router: IRouter = Router();

const startTime = Date.now();

/** GET /api/v1/health — lightweight liveness probe */
router.get("/v1/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

/** Backward compat alias */
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptime: Math.floor((Date.now() - startTime) / 1000) });
});

/** GET /api/v1/health/detailed — admin only detailed health */
router.get("/v1/health/detailed", requireAuth, async (req: AuthRequest, res) => {
  try {
    // DB connectivity check
    await db.execute(sql`SELECT 1`);

    // Blocklist entry count
    const [{ value: blocklistEntries }] = await db
      .select({ value: count() })
      .from(systemBlocklistTable);

    const memMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    res.json({
      status: "ok",
      database: "connected",
      blocklist_entries: Number(blocklistEntries),
      cache_size: getCacheStats().size,
      memory_mb: memMb,
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      version: "1.0.0",
      node_env: process.env["NODE_ENV"],
    });
  } catch (err: any) {
    res.status(503).json({
      status: "degraded",
      database: "error",
      error: "ERR_HEALTH_CHECK",
    });
  }
});

export default router;
