import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable, alertRulesTable } from "@workspace/db";
import { eq, and, desc, gte, count, sql } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";
import { addSseClient, removeSseClient, createNotification, fireWebhook } from "../services/notifications";

const router = Router();

// ── SSE stream ────────────────────────────────────────────────────────────────
router.get("/v1/notifications/stream", requireAuth, (req: AuthRequest, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write("event: connected\ndata: {\"ok\":true}\n\n");
  addSseClient(req.userId!, res);

  const keepAlive = setInterval(() => {
    try {
      res.write("event: ping\ndata: {}\n\n");
    } catch {
      clearInterval(keepAlive);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeSseClient(req.userId!, res);
  });
});

// ── List notifications ────────────────────────────────────────────────────────
router.get("/v1/notifications", requireAuth, async (req: AuthRequest, res) => {
  const page = Math.max(1, Number(req.query["page"] ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query["limit"] ?? 20)));
  const offset = (page - 1) * limit;
  const typeFilter = req.query["type"] as string | undefined;
  const severityFilter = req.query["severity"] as string | undefined;
  const readFilter = req.query["read"] as string | undefined;

  const conditions: any[] = [eq(notificationsTable.userId, req.userId!)];
  if (typeFilter) conditions.push(eq(notificationsTable.type, typeFilter));
  if (severityFilter) conditions.push(eq(notificationsTable.severity, severityFilter));
  if (readFilter === "true") conditions.push(eq(notificationsTable.read, true));
  if (readFilter === "false") conditions.push(eq(notificationsTable.read, false));

  const where = and(...conditions);

  const [notifications, [{ total }]] = await Promise.all([
    db
      .select()
      .from(notificationsTable)
      .where(where)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(notificationsTable).where(where),
  ]);

  res.json({ notifications, total: Number(total), page, limit });
});

// ── Unread count ──────────────────────────────────────────────────────────────
router.get("/v1/notifications/unread-count", requireAuth, async (req: AuthRequest, res) => {
  const [row] = await db
    .select({ count: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, req.userId!), eq(notificationsTable.read, false)));
  res.json({ count: Number(row?.count ?? 0) });
});

// ── Mark single as read ───────────────────────────────────────────────────────
router.patch("/v1/notifications/:id/read", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.userId!)));
  res.json({ ok: true });
});

// ── Mark all as read ──────────────────────────────────────────────────────────
router.patch("/v1/notifications/read-all", requireAuth, async (req: AuthRequest, res) => {
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.userId, req.userId!), eq(notificationsTable.read, false)));
  res.json({ ok: true });
});

// ── Delete all notifications ──────────────────────────────────────────────────
router.delete("/v1/notifications", requireAuth, async (req: AuthRequest, res) => {
  await db.delete(notificationsTable).where(eq(notificationsTable.userId, req.userId!));
  res.json({ ok: true });
});

// ── Alert rules: list ─────────────────────────────────────────────────────────
router.get("/v1/notifications/rules", requireAuth, async (req: AuthRequest, res) => {
  const rules = await db
    .select()
    .from(alertRulesTable)
    .where(eq(alertRulesTable.userId, req.userId!))
    .orderBy(desc(alertRulesTable.createdAt));
  res.json({ rules });
});

// ── Alert rules: create ───────────────────────────────────────────────────────
router.post("/v1/notifications/rules", requireAuth, async (req: AuthRequest, res) => {
  const { rule_type, threshold_value, threshold_window_minutes, channel, webhook_url } = req.body ?? {};
  const valid = ["THREAT_SPIKE", "NEW_DEVICE", "BLOCKLIST_UPDATED", "DEVICE_OFFLINE", "HIGH_BLOCK_RATE"];
  if (!rule_type || !valid.includes(rule_type)) {
    res.status(400).json({ error: `rule_type must be one of: ${valid.join(", ")}` });
    return;
  }
  const [rule] = await db
    .insert(alertRulesTable)
    .values({
      userId: req.userId!,
      ruleType: rule_type,
      thresholdValue: Number(threshold_value ?? 10),
      thresholdWindowMinutes: Number(threshold_window_minutes ?? 60),
      channel: channel ?? "in_app",
      webhookUrl: webhook_url ?? null,
      enabled: true,
    })
    .returning();
  res.status(201).json({ rule });
});

// ── Alert rules: update (toggle enabled, webhook_url, etc.) ──────────────────
router.patch("/v1/notifications/rules/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }
  const { enabled, webhook_url, threshold_value, threshold_window_minutes, channel } = req.body ?? {};
  const updates: Record<string, any> = {};
  if (enabled !== undefined) updates["enabled"] = Boolean(enabled);
  if (webhook_url !== undefined) updates["webhookUrl"] = webhook_url;
  if (threshold_value !== undefined) updates["thresholdValue"] = Number(threshold_value);
  if (threshold_window_minutes !== undefined) updates["thresholdWindowMinutes"] = Number(threshold_window_minutes);
  if (channel !== undefined) updates["channel"] = channel;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "nothing to update" }); return; }
  const [rule] = await db
    .update(alertRulesTable)
    .set(updates)
    .where(and(eq(alertRulesTable.id, id), eq(alertRulesTable.userId, req.userId!)))
    .returning();
  if (!rule) { res.status(404).json({ error: "Rule not found" }); return; }
  res.json({ rule });
});

// ── Alert rules: delete ───────────────────────────────────────────────────────
router.delete("/v1/notifications/rules/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }
  await db
    .delete(alertRulesTable)
    .where(and(eq(alertRulesTable.id, id), eq(alertRulesTable.userId, req.userId!)));
  res.json({ ok: true });
});

// ── Webhook: test ─────────────────────────────────────────────────────────────
router.post("/v1/notifications/webhook/test", requireAuth, async (req: AuthRequest, res) => {
  const { url } = req.body ?? {};
  if (!url || typeof url !== "string") { res.status(400).json({ error: "url is required" }); return; }
  try {
    await fireWebhook(url, "TEST", "LOW", "ShieldOS webhook test — connection verified!", {
      test: true,
      user_id: req.userId!,
    });
    res.json({ ok: true, message: "Webhook delivered successfully" });
  } catch (err: any) {
    res.status(502).json({ error: "Webhook delivery failed", detail: err?.message ?? String(err) });
  }
});

// ── Test: create sample notification (dev/admin helper) ──────────────────────
router.post("/v1/notifications/test", requireAuth, async (req: AuthRequest, res) => {
  const notif = await createNotification(
    req.userId!,
    "TEST",
    "MEDIUM",
    "Test Notification",
    "This is a test notification from ShieldOS.",
    { test: true },
    "/notifications"
  );
  res.json({ notification: notif });
});

export default router;
