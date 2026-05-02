import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { devicesTable, blockedRequestsTable } from "@workspace/db";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";
import { ProvisionDeviceBody, RevokeDeviceParams } from "@workspace/api-zod";
import crypto from "crypto";

const router = Router();

function generateWireGuardKeys(): { privateKey: string; publicKey: string } {
  const privateKeyBytes = crypto.randomBytes(32);
  privateKeyBytes[0] &= 248;
  privateKeyBytes[31] &= 127;
  privateKeyBytes[31] |= 64;
  const privateKey = privateKeyBytes.toString("base64");
  const publicKey = crypto.createHash("sha256").update(privateKeyBytes).digest("base64");
  return { privateKey, publicKey };
}

function generateWireGuardConfig(privateKey: string, publicKey: string): string {
  const serverPublicKey = process.env["WG_SERVER_PUBLIC_KEY"] ?? "SERVER_PUBLIC_KEY_HERE";
  const serverEndpoint = process.env["WG_SERVER_ENDPOINT"] ?? "vpn.shieldos.app:51820";
  return `[Interface]
PrivateKey = ${privateKey}
Address = 10.8.0.2/24
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = ${serverPublicKey}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${serverEndpoint}
PersistentKeepalive = 25
`;
}

router.post("/v1/vpn/provision", requireAuth, async (req: AuthRequest, res) => {
  const parse = ProvisionDeviceBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { deviceName } = parse.data;
  const { privateKey, publicKey } = generateWireGuardKeys();

  const [device] = await db
    .insert(devicesTable)
    .values({
      userId: req.userId!,
      name: deviceName,
      publicKey,
      privateKeyEncrypted: privateKey,
      isActive: true,
    })
    .returning();

  const configContent = generateWireGuardConfig(privateKey, publicKey);

  res.status(201).json({
    device: {
      id: device.id,
      name: device.name,
      publicKey: device.publicKey,
      createdAt: device.createdAt,
      isActive: device.isActive,
      blockedCount: 0,
    },
    configContent,
  });
});

router.get("/v1/vpn/configs", requireAuth, async (req: AuthRequest, res) => {
  const devices = await db
    .select({
      id: devicesTable.id,
      name: devicesTable.name,
      publicKey: devicesTable.publicKey,
      createdAt: devicesTable.createdAt,
      isActive: devicesTable.isActive,
      blockedCount: sql<number>`COUNT(${blockedRequestsTable.id})::int`,
    })
    .from(devicesTable)
    .leftJoin(
      blockedRequestsTable,
      eq(blockedRequestsTable.deviceId, devicesTable.id)
    )
    .where(eq(devicesTable.userId, req.userId!))
    .groupBy(devicesTable.id);

  res.json({ devices, total: devices.length });
});

router.delete("/v1/vpn/revoke/:deviceId", requireAuth, async (req: AuthRequest, res) => {
  const parse = RevokeDeviceParams.safeParse({ deviceId: Number(req.params["deviceId"]) });
  if (!parse.success) {
    res.status(400).json({ message: "Invalid device ID" });
    return;
  }

  const [device] = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.id, parse.data.deviceId))
    .limit(1);

  if (!device || device.userId !== req.userId!) {
    res.status(404).json({ message: "Device not found" });
    return;
  }

  await db
    .update(devicesTable)
    .set({ isActive: false })
    .where(eq(devicesTable.id, parse.data.deviceId));

  res.json({ message: "Device revoked" });
});

router.get("/v1/vpn/status", requireAuth, async (req: AuthRequest, res) => {
  const devices = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.userId, req.userId!));

  const activeDevices = devices.filter((d) => d.isActive).length;

  res.json({
    activeDevices,
    totalDevices: devices.length,
    serverUptime: "99.9% (30 days)",
  });
});

export default router;
