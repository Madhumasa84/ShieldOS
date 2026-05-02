import { Router } from "express";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  devicesTable,
  blocklistEntriesTable,
  systemBlocklistTable,
  blockedRequestsTable,
  usersTable,
  refreshTokensTable,
} from "@workspace/db";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";
import PDFDocument from "pdfkit";
import archiver from "archiver";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

const router = Router();

// Helper to regenerate WireGuard config from stored private key
function buildWireGuardConfig(privateKey: string, publicKey: string): string {
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

// ─── GET /v1/devices/:deviceId/config ─────────────────────────────────────────
router.get("/v1/devices/:deviceId/config", requireAuth, async (req: AuthRequest, res) => {
  const deviceId = parseInt(String(req.params["deviceId"]), 10);
  if (isNaN(deviceId)) {
    res.status(400).json({ message: "Invalid device ID" });
    return;
  }

  const [device] = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.id, deviceId), eq(devicesTable.userId, req.userId!)))
    .limit(1);

  if (!device) {
    res.status(404).json({ message: "Device not found" });
    return;
  }

  const config = buildWireGuardConfig(device.privateKeyEncrypted, device.publicKey);
  const safeName = device.name.replace(/[^a-zA-Z0-9-_]/g, "_");

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.conf"`);
  res.send(config);
});

// ─── GET /v1/export/blocklist/hosts ───────────────────────────────────────────
router.get("/v1/export/blocklist/hosts", requireAuth, async (req: AuthRequest, res) => {
  const [customEntries, systemEntries] = await Promise.all([
    db
      .select({ domain: blocklistEntriesTable.domain })
      .from(blocklistEntriesTable)
      .where(eq(blocklistEntriesTable.userId, req.userId!))
      .orderBy(blocklistEntriesTable.domain),
    db
      .select({ domain: systemBlocklistTable.domain })
      .from(systemBlocklistTable)
      .orderBy(systemBlocklistTable.domain),
  ]);

  const dateStr = fmtDate(new Date());
  const lines: string[] = [
    `# ShieldOS Blocklist Export`,
    `# Generated: ${new Date().toISOString()}`,
    `# Total: ${customEntries.length + systemEntries.length} domains`,
    `#`,
    `# Custom rules (${customEntries.length})`,
    ...customEntries.map((e) => `0.0.0.0 ${e.domain}`),
    `#`,
    `# System blocklist (${systemEntries.length})`,
    ...systemEntries.map((e) => `0.0.0.0 ${e.domain}`),
  ];

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", `attachment; filename="shieldos-blocklist-${dateStr}.txt"`);
  res.send(lines.join("\n"));
});

// ─── GET /v1/export/blocklist/csv ─────────────────────────────────────────────
router.get("/v1/export/blocklist/csv", requireAuth, async (req: AuthRequest, res) => {
  const [customEntries, systemEntries] = await Promise.all([
    db
      .select()
      .from(blocklistEntriesTable)
      .where(eq(blocklistEntriesTable.userId, req.userId!))
      .orderBy(blocklistEntriesTable.domain),
    db
      .select()
      .from(systemBlocklistTable)
      .orderBy(systemBlocklistTable.domain),
  ]);

  const dateStr = fmtDate(new Date());
  const rows: string[] = ["domain,category,source,added_at"];

  for (const e of customEntries) {
    rows.push(`${e.domain},${e.category},custom,${new Date(e.addedAt).toISOString()}`);
  }
  for (const e of systemEntries) {
    rows.push(`${e.domain},${e.category},${e.source},${new Date(e.addedAt).toISOString()}`);
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="shieldos-blocklist-${dateStr}.csv"`);
  res.send(rows.join("\n"));
});

// ─── GET /v1/export/report/pdf ────────────────────────────────────────────────
router.get("/v1/export/report/pdf", requireAuth, async (req: AuthRequest, res) => {
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sinceToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const devices = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.userId, req.userId!));

  const deviceIds = devices.map((d) => d.id);

  const [user] = await db
    .select({ username: usersTable.username, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  let totalBlocked = 0;
  let blockedToday = 0;
  let topDomains: { domain: string; count: number }[] = [];
  let byCategory: { category: string; count: number }[] = [];
  let byHour: { hour: number; count: number }[] = [];

  if (deviceIds.length > 0) {
    const deviceIdArray = sql`ARRAY[${sql.join(deviceIds, sql`, `)}]::int[]`;
    const deviceFilter = sql`${blockedRequestsTable.deviceId} = ANY(${deviceIdArray})`;

    const [totalRes, todayRes, topDomainsRes, byCategoryRes, byHourRes] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(blockedRequestsTable)
        .where(sql`${deviceFilter} AND ${blockedRequestsTable.wasBlocked} = true AND ${blockedRequestsTable.timestamp} >= ${since30d}`),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(blockedRequestsTable)
        .where(sql`${deviceFilter} AND ${blockedRequestsTable.wasBlocked} = true AND ${blockedRequestsTable.timestamp} >= ${sinceToday}`),
      db
        .select({
          domain: blockedRequestsTable.domain,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(blockedRequestsTable)
        .where(sql`${deviceFilter} AND ${blockedRequestsTable.wasBlocked} = true AND ${blockedRequestsTable.timestamp} >= ${since30d}`)
        .groupBy(blockedRequestsTable.domain)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(20),
      db
        .select({
          category: blockedRequestsTable.category,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(blockedRequestsTable)
        .where(sql`${deviceFilter} AND ${blockedRequestsTable.wasBlocked} = true AND ${blockedRequestsTable.timestamp} >= ${since30d}`)
        .groupBy(blockedRequestsTable.category)
        .orderBy(desc(sql`COUNT(*)`)),
      db
        .select({
          hour: sql<number>`EXTRACT(HOUR FROM ${blockedRequestsTable.timestamp})::int`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(blockedRequestsTable)
        .where(sql`${deviceFilter} AND ${blockedRequestsTable.wasBlocked} = true AND ${blockedRequestsTable.timestamp} >= ${since30d}`)
        .groupBy(sql`EXTRACT(HOUR FROM ${blockedRequestsTable.timestamp})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${blockedRequestsTable.timestamp})`),
    ]);

    totalBlocked = totalRes[0]?.count ?? 0;
    blockedToday = todayRes[0]?.count ?? 0;
    topDomains = topDomainsRes;
    byCategory = byCategoryRes;
    byHour = byHourRes;
  }

  const dateStr = fmtDate(now);
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="ShieldOS-Report-${dateStr}.pdf"`);
  doc.pipe(res);

  const W = 595 - 100; // usable width
  const CYAN = "#00E5FF";
  const DARK = "#0A0A1A";
  const GRAY = "#888888";
  const WHITE = "#FFFFFF";
  const RED = "#FF4D4D";
  const YELLOW = "#FFD166";
  const PURPLE = "#A066FF";
  const GREEN = "#00FF87";

  const CATEGORY_PDF_COLORS: Record<string, string> = {
    ads: YELLOW,
    tracking: CYAN,
    malware: RED,
    social: PURPLE,
    unknown: GRAY,
  };

  // ── Header band ──────────────────────────────────────────────────────────────
  doc.rect(0, 0, 595, 80).fill(DARK);
  doc.fontSize(22).font("Helvetica-Bold").fillColor(CYAN).text("SHIELDOS", 50, 22);
  doc.fontSize(10).font("Helvetica").fillColor(GRAY).text("Privacy Intelligence Report", 50, 50);
  doc.fontSize(9).fillColor(GRAY).text(`Generated: ${now.toISOString()}`, 350, 32, { align: "right", width: 195 });
  doc.fontSize(9).fillColor(GRAY).text(`Operator: ${user?.username ?? "unknown"}`, 350, 46, { align: "right", width: 195 });

  // ── Date range label ─────────────────────────────────────────────────────────
  doc.rect(50, 95, W, 28).fill("#111122");
  doc.fontSize(9).font("Helvetica").fillColor(GRAY).text(
    `Report period: ${fmtDate(since30d)} → ${dateStr}  (Last 30 days)`,
    58, 104
  );

  // ── Key stats row ─────────────────────────────────────────────────────────────
  let y = 140;
  const statBoxW = (W - 20) / 3;
  const stats = [
    { label: "BLOCKED (30 DAYS)", value: totalBlocked.toLocaleString(), color: CYAN },
    { label: "BLOCKED TODAY", value: blockedToday.toLocaleString(), color: GREEN },
    { label: "ACTIVE DEVICES", value: devices.filter((d) => d.isActive).length.toString(), color: YELLOW },
  ];
  stats.forEach((s, i) => {
    const x = 50 + i * (statBoxW + 10);
    doc.rect(x, y, statBoxW, 60).fill("#111122");
    doc.rect(x, y, statBoxW, 3).fill(s.color);
    doc.fontSize(8).font("Helvetica").fillColor(GRAY).text(s.label, x + 10, y + 12);
    doc.fontSize(22).font("Helvetica-Bold").fillColor(s.color).text(s.value, x + 10, y + 25);
  });

  y += 80;

  // ── Bar chart: blocked by hour ────────────────────────────────────────────────
  const hourMap = new Map(byHour.map((h) => [h.hour, h.count]));
  const hourData = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: hourMap.get(i) ?? 0 }));
  const maxCount = Math.max(...hourData.map((h) => h.count), 1);

  doc.fontSize(10).font("Helvetica-Bold").fillColor(WHITE).text("Interceptions by Hour (30-day aggregate)", 50, y);
  y += 18;

  const chartH = 80;
  const chartW = W;
  const barW = chartW / 24 - 2;

  doc.rect(50, y, chartW, chartH).fill("#0D0D1E");

  hourData.forEach((h, i) => {
    const barH = (h.count / maxCount) * (chartH - 10);
    const bx = 50 + i * (chartW / 24) + 1;
    const by = y + chartH - barH - 2;
    doc.rect(bx, by, barW, barH).fill(CYAN);
  });

  // hour labels for every 4 hours
  doc.fontSize(7).font("Helvetica").fillColor(GRAY);
  for (let i = 0; i < 24; i += 4) {
    const lx = 50 + i * (chartW / 24) + barW / 2 - 5;
    doc.text(`${String(i).padStart(2, "0")}h`, lx, y + chartH + 3);
  }

  y += chartH + 22;

  // ── Category breakdown ────────────────────────────────────────────────────────
  doc.fontSize(10).font("Helvetica-Bold").fillColor(WHITE).text("Blocked by Category", 50, y);
  y += 14;

  const totalCat = byCategory.reduce((s, c) => s + c.count, 0) || 1;
  const catBarW = W - 120;

  byCategory.forEach((c) => {
    const pct = Math.round((c.count / totalCat) * 100);
    const color = CATEGORY_PDF_COLORS[c.category] ?? GRAY;
    const fillW = (c.count / totalCat) * catBarW;

    doc.rect(50, y, catBarW, 14).fill("#0D0D1E");
    doc.rect(50, y, fillW, 14).fill(color);
    doc.fontSize(8).font("Helvetica").fillColor(WHITE).text(c.category.toUpperCase(), 50, y + 3);
    doc.fontSize(8).fillColor(GRAY).text(`${c.count.toLocaleString()} (${pct}%)`, 50 + catBarW + 8, y + 3);
    y += 20;
  });

  y += 10;

  // ── Top 20 blocked domains ────────────────────────────────────────────────────
  if (doc.y > 650) doc.addPage();
  else y = Math.max(y, doc.y);

  doc.fontSize(10).font("Helvetica-Bold").fillColor(WHITE).text("Top 20 Blocked Domains", 50, y);
  y += 14;

  doc.rect(50, y, W, 16).fill("#0D0D1E");
  doc.fontSize(7).font("Helvetica-Bold").fillColor(GRAY)
    .text("#", 52, y + 5)
    .text("DOMAIN", 70, y + 5)
    .text("COUNT", 460, y + 5);
  y += 16;

  const maxDomain = topDomains[0]?.count ?? 1;
  topDomains.forEach((d, i) => {
    const rowBg = i % 2 === 0 ? "#0A0A1A" : "#0D0D1E";
    doc.rect(50, y, W, 14).fill(rowBg);
    const barFill = (d.count / maxDomain) * (W - 120);
    doc.rect(68, y + 1, barFill, 12).fillOpacity(0.15).fill(CYAN);
    doc.fillOpacity(1);
    doc.fontSize(7).font("Helvetica").fillColor(GRAY).text(String(i + 1), 52, y + 4);
    doc.fillColor(WHITE).text(d.domain, 70, y + 4, { width: 380, ellipsis: true });
    doc.fillColor(CYAN).text(d.count.toLocaleString(), 460, y + 4);
    y += 14;
  });

  y += 16;

  // ── Active devices table ──────────────────────────────────────────────────────
  if (y > 650) doc.addPage();

  doc.fontSize(10).font("Helvetica-Bold").fillColor(WHITE).text("Active Devices", 50, y);
  y += 14;

  doc.rect(50, y, W, 16).fill("#0D0D1E");
  doc.fontSize(7).font("Helvetica-Bold").fillColor(GRAY)
    .text("DEVICE NAME", 52, y + 5)
    .text("STATUS", 300, y + 5)
    .text("PROVISIONED", 390, y + 5);
  y += 16;

  devices.forEach((d, i) => {
    const rowBg = i % 2 === 0 ? "#0A0A1A" : "#0D0D1E";
    doc.rect(50, y, W, 14).fill(rowBg);
    doc.fontSize(7).font("Helvetica").fillColor(WHITE).text(d.name, 52, y + 4, { width: 240 });
    const statusColor = d.isActive ? GREEN : RED;
    doc.fillColor(statusColor).text(d.isActive ? "ACTIVE" : "REVOKED", 300, y + 4);
    doc.fillColor(GRAY).text(fmtDate(new Date(d.createdAt)), 390, y + 4);
    y += 14;
  });

  // ── Footer ─────────────────────────────────────────────────────────────────
  const pageHeight = 842;
  doc.rect(0, pageHeight - 40, 595, 40).fill(DARK);
  doc.fontSize(8).font("Helvetica").fillColor(GRAY)
    .text("ShieldOS — Confidential Privacy Report", 50, pageHeight - 26)
    .text(`Page 1 of 1  ·  ${dateStr}`, 400, pageHeight - 26);

  doc.end();
});

// ─── GET /v1/export/all  (ZIP export) ─────────────────────────────────────────
router.get("/v1/export/all", requireAuth, async (req: AuthRequest, res) => {
  const [devices, customList, blockedReqs, userInfo] = await Promise.all([
    db.select().from(devicesTable).where(eq(devicesTable.userId, req.userId!)),
    db.select().from(blocklistEntriesTable).where(eq(blocklistEntriesTable.userId, req.userId!)),
    db
      .select()
      .from(blockedRequestsTable)
      .where(
        inArray(
          blockedRequestsTable.deviceId,
          db.select({ id: devicesTable.id }).from(devicesTable).where(eq(devicesTable.userId, req.userId!))
        )
      )
      .orderBy(desc(blockedRequestsTable.timestamp))
      .limit(50000),
    db
      .select({ id: usersTable.id, username: usersTable.username, createdAt: usersTable.createdAt, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1),
  ]);

  const dateStr = fmtDate(new Date());

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="ShieldOS-Data-${dateStr}.zip"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(res);

  archive.append(JSON.stringify(userInfo[0] ?? {}, null, 2), { name: "profile.json" });
  archive.append(JSON.stringify(devices, null, 2), { name: "devices.json" });
  archive.append(JSON.stringify(customList, null, 2), { name: "custom_blocklist.json" });

  // CSV version of custom blocklist
  const csvRows = ["domain,category,source,added_at"];
  for (const e of customList) {
    csvRows.push(`${e.domain},${e.category},${e.source},${new Date(e.addedAt).toISOString()}`);
  }
  archive.append(csvRows.join("\n"), { name: "custom_blocklist.csv" });

  archive.append(JSON.stringify(blockedReqs, null, 2), { name: "blocked_requests.json" });

  archive.finalize();
});

// ─── DELETE /v1/export/account ────────────────────────────────────────────────
router.delete("/v1/export/account", requireAuth, async (req: AuthRequest, res) => {
  // Delete in dependency order; cascade handles most of it, but we also wipe refresh tokens
  await db.delete(refreshTokensTable).where(eq(refreshTokensTable.userId, req.userId!));
  // devices / blocklist_entries / blocked_requests cascade from users delete
  await db.delete(usersTable).where(eq(usersTable.id, req.userId!));
  res.json({ message: "Account and all associated data deleted." });
});

export default router;
