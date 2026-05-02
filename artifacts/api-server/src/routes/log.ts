import { Router, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  blockedRequestsTable,
  blocklistEntriesTable,
  systemBlocklistTable,
  devicesTable,
} from "@workspace/db";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";

const router = Router();

// POST /v1/log/request — called by Android app for every DNS query
// Checks domain against blocklist, logs the request, returns result
router.post("/v1/log/request", requireAuth, async (req: AuthRequest, res: Response) => {
  const { device_id, domain, timestamp } = req.body as {
    device_id?: unknown;
    domain?: unknown;
    timestamp?: unknown;
  };

  if (
    typeof device_id !== "number" ||
    !Number.isInteger(device_id) ||
    device_id <= 0 ||
    typeof domain !== "string" ||
    domain.trim().length === 0 ||
    domain.length > 253
  ) {
    res.status(400).json({ message: "Invalid input: device_id (int) and domain (string) required" });
    return;
  }

  const normalized = domain.toLowerCase().trim();

  // Verify device belongs to this user
  const [device] = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(and(eq(devicesTable.id, device_id), eq(devicesTable.userId, req.userId!)))
    .limit(1);

  if (!device) {
    res.status(403).json({ message: "Device not found or not owned by user" });
    return;
  }

  // Check custom blocklist first, then system
  const [customEntry] = await db
    .select({ category: blocklistEntriesTable.category })
    .from(blocklistEntriesTable)
    .where(
      and(
        eq(blocklistEntriesTable.userId, req.userId!),
        eq(blocklistEntriesTable.domain, normalized)
      )
    )
    .limit(1);

  let blocked = false;
  let category = "unknown";

  if (customEntry) {
    blocked = true;
    category = customEntry.category;
  } else {
    const [systemEntry] = await db
      .select({ category: systemBlocklistTable.category })
      .from(systemBlocklistTable)
      .where(eq(systemBlocklistTable.domain, normalized))
      .limit(1);

    if (systemEntry) {
      blocked = true;
      category = systemEntry.category;
    }
  }

  // Parse optional timestamp, fall back to now
  let ts: Date;
  if (typeof timestamp === "string" && timestamp.length > 0) {
    ts = new Date(timestamp);
    if (isNaN(ts.getTime())) ts = new Date();
  } else {
    ts = new Date();
  }

  // Log request + update device last_seen concurrently
  await Promise.all([
    db.insert(blockedRequestsTable).values({
      deviceId: device_id,
      domain: normalized,
      category,
      wasBlocked: blocked,
      timestamp: ts,
    }),
    db
      .update(devicesTable)
      .set({ lastSeen: new Date() })
      .where(eq(devicesTable.id, device_id)),
  ]);

  res.json({ blocked, category });
});

export default router;
