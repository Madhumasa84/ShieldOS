import { db } from "@workspace/db";
import { devicesTable, blockedRequestsTable, threatReportsTable } from "@workspace/db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

interface ReportRange { from: Date; to: Date; label: string }

// ── Gather all analytics data for the range ───────────────────────────────────
export async function gatherReportData(userId: number, range: ReportRange) {
  const { from, to } = range;

  const devices = await db.select({ id: devicesTable.id, name: devicesTable.name }).from(devicesTable).where(eq(devicesTable.userId, userId));
  const deviceIds = devices.map((d) => d.id);

  const hasDevices = deviceIds.length > 0;
  const idArray = hasDevices ? sql.raw(`ARRAY[${deviceIds.join(",")}]::int[]`) : sql.raw("ARRAY[]::int[]");

  const [overviewResult, topDomainsResult, categoryResult, byDeviceResult] = await Promise.all([
    hasDevices ? db.execute(sql`
      SELECT COUNT(*)::int AS total, SUM(CASE WHEN was_blocked THEN 1 ELSE 0 END)::int AS blocked
      FROM blocked_requests WHERE device_id = ANY(${idArray}) AND timestamp BETWEEN ${from} AND ${to}
    `) : { rows: [{ total: 0, blocked: 0 }] },

    hasDevices ? db.execute(sql`
      SELECT domain, category, COUNT(*)::int AS count
      FROM blocked_requests WHERE device_id = ANY(${idArray}) AND was_blocked = true AND timestamp BETWEEN ${from} AND ${to}
      GROUP BY domain, category ORDER BY count DESC LIMIT 20
    `) : { rows: [] },

    hasDevices ? db.execute(sql`
      SELECT category, COUNT(*)::int AS count FROM blocked_requests
      WHERE device_id = ANY(${idArray}) AND was_blocked = true AND timestamp BETWEEN ${from} AND ${to}
      GROUP BY category ORDER BY count DESC
    `) : { rows: [] },

    hasDevices ? db.execute(sql`
      SELECT device_id, COUNT(*)::int AS total, SUM(CASE WHEN was_blocked THEN 1 ELSE 0 END)::int AS blocked
      FROM blocked_requests WHERE device_id = ANY(${idArray}) AND timestamp BETWEEN ${from} AND ${to}
      GROUP BY device_id
    `) : { rows: [] },
  ]);

  const threats = await db.select().from(threatReportsTable)
    .where(and(eq(threatReportsTable.reporterId, userId), gte(threatReportsTable.reportedAt, from), lte(threatReportsTable.reportedAt, to)))
    .orderBy(desc(threatReportsTable.reportedAt));

  const ov: any = overviewResult.rows[0] ?? {};
  const total = Number(ov.total ?? 0);
  const blocked = Number(ov.blocked ?? 0);

  return {
    overview: { totalRequests: total, blocked, allowed: total - blocked, blockRate: total > 0 ? Math.round((blocked / total) * 1000) / 10 : 0, threats: threats.length, deviceCount: devices.length },
    topDomains: (topDomainsResult.rows as any[]).map((r) => ({ domain: r.domain, category: r.category, count: Number(r.count) })),
    categories: (categoryResult.rows as any[]).map((r) => ({ category: r.category, count: Number(r.count) })),
    devices: devices.map((d) => {
      const stats: any = (byDeviceResult.rows as any[]).find((r) => Number(r.device_id) === d.id) ?? { total: 0, blocked: 0 };
      const t = Number(stats.total ?? 0);
      const b = Number(stats.blocked ?? 0);
      return { name: d.name, total: t, blocked: b, allowed: t - b, blockRate: t > 0 ? Math.round((b / t) * 1000) / 10 : 0 };
    }),
    threats,
    range,
  };
}

// ── CSV generator ─────────────────────────────────────────────────────────────
export function generateCsv(data: Awaited<ReturnType<typeof gatherReportData>>): string {
  const lines: string[] = [];
  lines.push("# ShieldOS Privacy Report");
  lines.push(`# Range: ${data.range.label}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Overview");
  lines.push("Metric,Value");
  lines.push(`Total Requests,${data.overview.totalRequests}`);
  lines.push(`Blocked,${data.overview.blocked}`);
  lines.push(`Allowed,${data.overview.allowed}`);
  lines.push(`Block Rate,${data.overview.blockRate}%`);
  lines.push(`Threats Detected,${data.overview.threats}`);
  lines.push(`Devices,${data.overview.deviceCount}`);
  lines.push("");

  lines.push("## Top Blocked Domains");
  lines.push("Rank,Domain,Category,Count");
  data.topDomains.forEach((d, i) => {
    lines.push(`${i + 1},${d.domain},${d.category},${d.count}`);
  });
  lines.push("");

  lines.push("## Category Breakdown");
  lines.push("Category,Count");
  data.categories.forEach((c) => lines.push(`${c.category},${c.count}`));
  lines.push("");

  lines.push("## Device Activity");
  lines.push("Device,Total,Blocked,Allowed,Block Rate");
  data.devices.forEach((d) => lines.push(`${d.name},${d.total},${d.blocked},${d.allowed},${d.blockRate}%`));
  lines.push("");

  lines.push("## Threat Reports");
  lines.push("Domain,Category,Verified,Reported At");
  data.threats.forEach((t) => lines.push(`${t.domain},${t.category},${t.verified},${t.reportedAt?.toISOString()}`));

  return lines.join("\n");
}

// ── JSON generator ────────────────────────────────────────────────────────────
export function generateJson(data: Awaited<ReturnType<typeof gatherReportData>>): string {
  return JSON.stringify(
    {
      meta: {
        generatedAt: new Date().toISOString(),
        range: data.range.label,
        generator: "ShieldOS v1.0",
      },
      ...data,
      range: undefined,
    },
    null,
    2
  );
}

// ── PDF generator (pdfkit) ────────────────────────────────────────────────────
export async function generatePdf(data: Awaited<ReturnType<typeof gatherReportData>>): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 100;
    const PRI = "#00bcd4";
    const GRAY = "#6b7280";
    const DARK = "#111827";

    // ── Header ────────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 90).fill(DARK);
    doc.fill(PRI).fontSize(28).font("Helvetica-Bold").text("SHIELD_OS", 50, 24);
    doc.fill("#e5e7eb").fontSize(12).font("Helvetica").text("Privacy Analytics Report", 50, 56);
    doc.fill(GRAY).fontSize(9).text(`Generated: ${new Date().toLocaleString()} | Range: ${data.range.label}`, 50, 72);
    doc.moveDown(2);

    // ── Executive Summary ─────────────────────────────────────────────────────
    doc.y = 110;
    doc.fill(DARK).fontSize(14).font("Helvetica-Bold").text("EXECUTIVE SUMMARY", 50);
    doc.moveDown(0.4);
    doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).stroke(PRI);
    doc.moveDown(0.6);

    const stats = [
      ["Total Queries", String(data.overview.totalRequests)],
      ["Blocked Requests", String(data.overview.blocked)],
      ["Allowed Requests", String(data.overview.allowed)],
      ["Block Rate", `${data.overview.blockRate}%`],
      ["Threats Detected", String(data.overview.threats)],
      ["Active Devices", String(data.overview.deviceCount)],
    ];

    const colW = W / 3;
    let col = 0;
    let rowStartY = doc.y;
    for (const [label, value] of stats) {
      const x = 50 + (col % 3) * colW;
      const y = rowStartY + Math.floor(col / 3) * 48;
      doc.rect(x, y, colW - 8, 42).fill("#f9fafb");
      doc.fill(GRAY).fontSize(8).font("Helvetica").text(label.toUpperCase(), x + 8, y + 7);
      doc.fill(DARK).fontSize(18).font("Helvetica-Bold").text(value, x + 8, y + 18);
      col++;
    }
    doc.y = rowStartY + Math.ceil(stats.length / 3) * 48 + 16;
    doc.moveDown(1);

    // ── Top Blocked Domains ───────────────────────────────────────────────────
    doc.fill(DARK).fontSize(14).font("Helvetica-Bold").text("TOP BLOCKED DOMAINS", 50);
    doc.moveDown(0.4);
    doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).stroke(PRI);
    doc.moveDown(0.5);

    // Table header
    doc.rect(50, doc.y, W, 20).fill("#1f2937");
    doc.fill("#e5e7eb").fontSize(9).font("Helvetica-Bold");
    doc.text("RANK", 56, doc.y - 14);
    doc.text("DOMAIN", 90, doc.y - 14);
    doc.text("CATEGORY", 370, doc.y - 14);
    doc.text("COUNT", 460, doc.y - 14);
    doc.moveDown(0.3);

    for (let i = 0; i < Math.min(data.topDomains.length, 20); i++) {
      const d = data.topDomains[i]!;
      const rowY = doc.y;
      if (i % 2 === 0) doc.rect(50, rowY, W, 18).fill("#f9fafb");
      doc.fill(DARK).fontSize(8).font("Helvetica");
      doc.text(`${i + 1}`, 56, rowY + 5);
      doc.text(d.domain.length > 40 ? d.domain.slice(0, 40) + "…" : d.domain, 90, rowY + 5);
      doc.text(d.category, 370, rowY + 5);
      doc.text(String(d.count), 460, rowY + 5);
      doc.moveDown(0.55);
    }

    doc.moveDown(1);

    // ── Device Activity ───────────────────────────────────────────────────────
    if (doc.y > 650) doc.addPage();
    doc.fill(DARK).fontSize(14).font("Helvetica-Bold").text("DEVICE ACTIVITY", 50);
    doc.moveDown(0.4);
    doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).stroke(PRI);
    doc.moveDown(0.5);

    doc.rect(50, doc.y, W, 20).fill("#1f2937");
    doc.fill("#e5e7eb").fontSize(9).font("Helvetica-Bold");
    doc.text("DEVICE", 56, doc.y - 14);
    doc.text("TOTAL", 260, doc.y - 14);
    doc.text("BLOCKED", 320, doc.y - 14);
    doc.text("ALLOWED", 390, doc.y - 14);
    doc.text("RATE", 460, doc.y - 14);
    doc.moveDown(0.3);

    for (let i = 0; i < data.devices.length; i++) {
      const d = data.devices[i]!;
      const rowY = doc.y;
      if (i % 2 === 0) doc.rect(50, rowY, W, 18).fill("#f9fafb");
      doc.fill(DARK).fontSize(8).font("Helvetica");
      doc.text(d.name.length > 28 ? d.name.slice(0, 28) + "…" : d.name, 56, rowY + 5);
      doc.text(String(d.total), 260, rowY + 5);
      doc.text(String(d.blocked), 320, rowY + 5);
      doc.text(String(d.allowed), 390, rowY + 5);
      doc.text(`${d.blockRate}%`, 460, rowY + 5);
      doc.moveDown(0.55);
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const pageBottom = doc.page.height - 40;
    doc.moveTo(50, pageBottom).lineTo(50 + W, pageBottom).stroke("#e5e7eb");
    doc.fill(GRAY).fontSize(8).font("Helvetica").text("Generated by ShieldOS Privacy Platform — Confidential", 50, pageBottom + 6, { align: "center", width: W });

    doc.end();
  });
}

// ── Range label helper ────────────────────────────────────────────────────────
export function parseReportRange(rangeStr: string, fromStr?: string, toStr?: string): ReportRange {
  const to = toStr ? new Date(toStr) : new Date();
  if (fromStr) {
    const from = new Date(fromStr);
    return { from, to, label: `${from.toLocaleDateString()} – ${to.toLocaleDateString()}` };
  }
  switch (rangeStr) {
    case "1d": return { from: new Date(Date.now() - 86_400_000), to, label: "Last 24 Hours" };
    case "30d": return { from: new Date(Date.now() - 30 * 86_400_000), to, label: "Last 30 Days" };
    case "90d": return { from: new Date(Date.now() - 90 * 86_400_000), to, label: "Last 90 Days" };
    default: return { from: new Date(Date.now() - 7 * 86_400_000), to, label: "Last 7 Days" };
  }
}
