import { db } from "@workspace/db";
import { devicesTable, blockedRequestsTable, alertRulesTable, notificationsTable } from "@workspace/db";
import { eq, and, gte, lt, count } from "drizzle-orm";
import { createNotification, fireWebhook } from "./notifications";
import { logger } from "../lib/logger";

// ── Dedup: skip if same alert type fired in the last 4 hours ─────────────────
async function isDedupClear(userId: number, type: string) {
  const since = new Date(Date.now() - 4 * 60 * 60 * 1000);
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
  return (row?.c ?? 0) === 0;
}

// ── DEVICE_OFFLINE check ──────────────────────────────────────────────────────
async function checkDeviceOffline() {
  const rules = await db
    .select()
    .from(alertRulesTable)
    .where(and(eq(alertRulesTable.ruleType, "DEVICE_OFFLINE"), eq(alertRulesTable.enabled, true)));

  for (const rule of rules) {
    if (!(await isDedupClear(rule.userId, "DEVICE_OFFLINE"))) continue;

    const cutoff = new Date(Date.now() - rule.thresholdWindowMinutes * 60 * 1000);

    const offlineDevices = await db
      .select({ id: devicesTable.id, name: devicesTable.name, lastSeen: devicesTable.lastSeen })
      .from(devicesTable)
      .where(
        and(
          eq(devicesTable.userId, rule.userId),
          eq(devicesTable.isActive, true),
          lt(devicesTable.lastSeen, cutoff)
        )
      );

    for (const device of offlineDevices) {
      const hoursOffline = device.lastSeen
        ? Math.round((Date.now() - device.lastSeen.getTime()) / 3_600_000)
        : Math.round(rule.thresholdWindowMinutes / 60);

      await createNotification(
        rule.userId,
        "DEVICE_OFFLINE",
        "HIGH",
        "Device Went Offline",
        `Device "${device.name}" has not been seen for ${hoursOffline}h.`,
        { deviceId: device.id, name: device.name, hoursOffline },
        "/devices"
      );

      if (rule.channel === "webhook" && rule.webhookUrl) {
        fireWebhook(
          rule.webhookUrl,
          "DEVICE_OFFLINE",
          "HIGH",
          `Device "${device.name}" has not been seen for ${hoursOffline}h.`,
          { deviceId: device.id, name: device.name, hoursOffline }
        ).catch(() => {});
      }
    }
  }
}

// ── THREAT_SPIKE check ────────────────────────────────────────────────────────
async function checkThreatSpike() {
  const rules = await db
    .select()
    .from(alertRulesTable)
    .where(and(eq(alertRulesTable.ruleType, "THREAT_SPIKE"), eq(alertRulesTable.enabled, true)));

  for (const rule of rules) {
    if (!(await isDedupClear(rule.userId, "THREAT_SPIKE"))) continue;

    const since = new Date(Date.now() - rule.thresholdWindowMinutes * 60 * 1000);

    const userDevices = await db
      .select({ id: devicesTable.id })
      .from(devicesTable)
      .where(eq(devicesTable.userId, rule.userId));

    if (userDevices.length === 0) continue;

    let totalBlocked = 0;
    for (const { id: deviceId } of userDevices) {
      const [row] = await db
        .select({ c: count() })
        .from(blockedRequestsTable)
        .where(
          and(
            eq(blockedRequestsTable.deviceId, deviceId),
            eq(blockedRequestsTable.wasBlocked, true),
            gte(blockedRequestsTable.timestamp, since)
          )
        );
      totalBlocked += Number(row?.c ?? 0);
    }

    if (totalBlocked >= rule.thresholdValue) {
      await createNotification(
        rule.userId,
        "THREAT_SPIKE",
        "HIGH",
        "Threat Spike Detected",
        `${totalBlocked} threats blocked in the last ${rule.thresholdWindowMinutes} minutes.`,
        { count: totalBlocked, windowMinutes: rule.thresholdWindowMinutes },
        "/threats"
      );

      if (rule.channel === "webhook" && rule.webhookUrl) {
        fireWebhook(
          rule.webhookUrl,
          "THREAT_SPIKE",
          "HIGH",
          `${totalBlocked} threats blocked in the last ${rule.thresholdWindowMinutes} minutes.`,
          { count: totalBlocked }
        ).catch(() => {});
      }
    }
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
export function startAlertEngine() {
  const run = async () => {
    try {
      await checkDeviceOffline();
      await checkThreatSpike();
    } catch (err) {
      logger.error({ err }, "Alert engine check failed");
    }
  };

  // First check 2 minutes after startup, then every 5 minutes
  setTimeout(() => {
    run();
    setInterval(run, 5 * 60 * 1000);
  }, 2 * 60 * 1000);

  logger.info("Alert engine started");
}
