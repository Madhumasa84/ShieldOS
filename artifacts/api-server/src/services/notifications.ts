import { Response } from "express";
import { db } from "@workspace/db";
import { notificationsTable, alertRulesTable } from "@workspace/db";
import { eq, and, desc, gte, count } from "drizzle-orm";

// ── SSE client registry ───────────────────────────────────────────────────────
const sseClients = new Map<number, Set<Response>>();

export function addSseClient(userId: number, res: Response) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId)!.add(res);
}

export function removeSseClient(userId: number, res: Response) {
  const set = sseClients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseClients.delete(userId);
}

function pushSse(userId: number, eventName: string, data: object) {
  const clients = sseClients.get(userId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

// ── Notification creation ─────────────────────────────────────────────────────
export async function createNotification(
  userId: number,
  type: string,
  severity: string,
  title: string,
  message: string,
  data?: object | null,
  link?: string | null
) {
  const [notif] = await db
    .insert(notificationsTable)
    .values({ userId, type, severity, title, message, data: data ?? null, link })
    .returning();
  if (notif) pushSse(userId, "notification", notif);
  return notif;
}

// ── Dedup: avoid creating the same notification type in the last hour ─────────
async function recentlyNotified(userId: number, type: string, windowMs = 60 * 60 * 1000) {
  const since = new Date(Date.now() - windowMs);
  const [row] = await db
    .select({ c: count() })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.type, type),
        gte(notificationsTable.createdAt, since)
      )
    );
  return (row?.c ?? 0) > 0;
}

// ── Rule evaluation — called at event trigger points ─────────────────────────
export async function evaluateRules(
  userId: number,
  event: string,
  eventData: object = {},
  notifOverride?: { severity: string; title: string; message: string; link?: string }
) {
  const rules = await db
    .select()
    .from(alertRulesTable)
    .where(
      and(
        eq(alertRulesTable.userId, userId),
        eq(alertRulesTable.ruleType, event),
        eq(alertRulesTable.enabled, true)
      )
    );

  if (rules.length === 0) return;
  if (await recentlyNotified(userId, event, 30 * 60 * 1000)) return;

  const defaults = getDefaults(event, eventData);
  const { severity, title, message, link } = notifOverride ?? defaults;

  const notif = await createNotification(userId, event, severity, title, message, eventData, link ?? null);

  // Fire webhooks
  for (const rule of rules) {
    if (rule.channel === "webhook" && rule.webhookUrl) {
      fireWebhook(rule.webhookUrl, event, severity, message, eventData).catch(() => {});
    }
  }

  return notif;
}

// ── Broadcast system event to ALL users with matching rule ────────────────────
export async function broadcastEvent(event: string, eventData: object = {}) {
  const rules = await db
    .select()
    .from(alertRulesTable)
    .where(and(eq(alertRulesTable.ruleType, event), eq(alertRulesTable.enabled, true)));

  const seen = new Set<number>();
  for (const rule of rules) {
    if (seen.has(rule.userId)) continue;
    seen.add(rule.userId);
    if (await recentlyNotified(rule.userId, event, 60 * 60 * 1000)) continue;
    const defaults = getDefaults(event, eventData);
    await createNotification(
      rule.userId, event, defaults.severity, defaults.title, defaults.message, eventData, defaults.link ?? null
    );
    if (rule.channel === "webhook" && rule.webhookUrl) {
      fireWebhook(rule.webhookUrl, event, defaults.severity, defaults.message, eventData).catch(() => {});
    }
  }
}

// ── Webhook delivery ──────────────────────────────────────────────────────────
export async function fireWebhook(
  url: string,
  event: string,
  severity: string,
  message: string,
  data: object = {}
) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "ShieldOS/1.0" },
    body: JSON.stringify({
      event,
      severity,
      message,
      timestamp: new Date().toISOString(),
      data,
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

// ── Default notification content per event type ───────────────────────────────
function getDefaults(event: string, data: any): { severity: string; title: string; message: string; link?: string } {
  switch (event) {
    case "THREAT_SPIKE":
      return {
        severity: "HIGH",
        title: "Threat Spike Detected",
        message: `${data?.count ?? "Multiple"} threats blocked in the last hour.`,
        link: "/threats",
      };
    case "NEW_DEVICE":
      return {
        severity: "MEDIUM",
        title: "New Device Registered",
        message: `Device "${data?.name ?? "unknown"}" was registered to your account.`,
        link: "/devices",
      };
    case "BLOCKLIST_UPDATED":
      return {
        severity: "LOW",
        title: "Blocklist Updated",
        message: `Blocklist sync completed. ${data?.total ?? 0} domains loaded.`,
        link: "/blocklist",
      };
    case "DEVICE_OFFLINE":
      return {
        severity: "HIGH",
        title: "Device Went Offline",
        message: `Device "${data?.name ?? "unknown"}" has not been seen for ${data?.hoursOffline ?? "?"}h.`,
        link: "/devices",
      };
    case "HIGH_BLOCK_RATE":
      return {
        severity: "MEDIUM",
        title: "High Block Rate",
        message: `Block rate reached ${data?.rate ?? "?"}% on device "${data?.device ?? "unknown"}".`,
        link: "/dashboard",
      };
    default:
      return { severity: "LOW", title: event, message: JSON.stringify(data) };
  }
}
