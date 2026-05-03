import { Router } from "express";
import { db } from "@workspace/db";
import { reportsTable, reportSchedulesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";
import { gatherReportData, generateCsv, generateJson, generatePdf, parseReportRange } from "../services/report-generator";

const router = Router();

// ── Generate + download report (on-demand) ────────────────────────────────────
router.get("/v1/reports/generate", requireAuth, async (req: AuthRequest, res) => {
  const format = (req.query["format"] as string) ?? "json";
  const range = (req.query["range"] as string) ?? "7d";
  const fromQ = req.query["from"] as string | undefined;
  const toQ = req.query["to"] as string | undefined;

  if (!["pdf", "csv", "json"].includes(format)) {
    res.status(400).json({ error: "format must be pdf, csv, or json" });
    return;
  }

  try {
    const rangeObj = parseReportRange(range, fromQ, toQ);
    const data = await gatherReportData(req.userId!, rangeObj);

    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `shieldos-report-${timestamp}-${range}.${format}`;

    if (format === "json") {
      const json = generateJson(data);
      // Store in DB
      await db.insert(reportsTable).values({
        userId: req.userId!, range, format, fileName,
        fileContent: Buffer.from(json).toString("base64"),
        fileSize: json.length, status: "completed",
      });
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(json);
      return;
    }

    if (format === "csv") {
      const csv = generateCsv(data);
      await db.insert(reportsTable).values({
        userId: req.userId!, range, format, fileName,
        fileContent: Buffer.from(csv).toString("base64"),
        fileSize: csv.length, status: "completed",
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(csv);
      return;
    }

    // PDF
    const pdf = await generatePdf(data);
    await db.insert(reportsTable).values({
      userId: req.userId!, range, format, fileName,
      fileContent: pdf.toString("base64"),
      fileSize: pdf.length, status: "completed",
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdf);
  } catch (err: any) {
    res.status(500).json({ error: "Report generation failed", detail: err?.message ?? String(err) });
  }
});

// ── Report history ────────────────────────────────────────────────────────────
router.get("/v1/reports/history", requireAuth, async (req: AuthRequest, res) => {
  const reports = await db
    .select({
      id: reportsTable.id,
      range: reportsTable.range,
      format: reportsTable.format,
      fileName: reportsTable.fileName,
      fileSize: reportsTable.fileSize,
      status: reportsTable.status,
      createdAt: reportsTable.createdAt,
    })
    .from(reportsTable)
    .where(eq(reportsTable.userId, req.userId!))
    .orderBy(desc(reportsTable.createdAt))
    .limit(50);

  res.json({ reports });
});

// ── Download specific report ──────────────────────────────────────────────────
router.get("/v1/reports/:id/download", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }

  const [report] = await db
    .select()
    .from(reportsTable)
    .where(and(eq(reportsTable.id, id), eq(reportsTable.userId, req.userId!)));

  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  if (!report.fileContent) { res.status(404).json({ error: "Report content not available" }); return; }

  const buf = Buffer.from(report.fileContent, "base64");
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    csv: "text/csv",
    json: "application/json",
  };

  res.setHeader("Content-Type", mimeMap[report.format] ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${report.fileName ?? `report.${report.format}`}"`);
  res.send(buf);
});

// ── Delete report ─────────────────────────────────────────────────────────────
router.delete("/v1/reports/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params["id"]);
  await db.delete(reportsTable).where(and(eq(reportsTable.id, id), eq(reportsTable.userId, req.userId!)));
  res.json({ ok: true });
});

// ── Get schedule ──────────────────────────────────────────────────────────────
router.get("/v1/reports/schedule", requireAuth, async (req: AuthRequest, res) => {
  const [schedule] = await db
    .select()
    .from(reportSchedulesTable)
    .where(eq(reportSchedulesTable.userId, req.userId!))
    .limit(1);
  res.json({ schedule: schedule ?? null });
});

// ── Create / update schedule ──────────────────────────────────────────────────
router.post("/v1/reports/schedule", requireAuth, async (req: AuthRequest, res) => {
  const { frequency, format, range, webhook_url, enabled } = req.body ?? {};

  const existing = await db
    .select()
    .from(reportSchedulesTable)
    .where(eq(reportSchedulesTable.userId, req.userId!))
    .limit(1);

  const nextRun = computeNextRun(frequency ?? "weekly");

  if (existing.length > 0) {
    const [updated] = await db
      .update(reportSchedulesTable)
      .set({
        frequency: frequency ?? "weekly",
        format: format ?? "pdf",
        range: range ?? "30d",
        webhookUrl: webhook_url ?? null,
        enabled: enabled !== undefined ? Boolean(enabled) : true,
        nextRunAt: nextRun,
      })
      .where(eq(reportSchedulesTable.userId, req.userId!))
      .returning();
    res.json({ schedule: updated });
  } else {
    const [created] = await db
      .insert(reportSchedulesTable)
      .values({
        userId: req.userId!,
        frequency: frequency ?? "weekly",
        format: format ?? "pdf",
        range: range ?? "30d",
        webhookUrl: webhook_url ?? null,
        enabled: enabled !== undefined ? Boolean(enabled) : true,
        nextRunAt: nextRun,
      })
      .returning();
    res.json({ schedule: created });
  }
});

// ── Delete schedule ───────────────────────────────────────────────────────────
router.delete("/v1/reports/schedule", requireAuth, async (req: AuthRequest, res) => {
  await db.delete(reportSchedulesTable).where(eq(reportSchedulesTable.userId, req.userId!));
  res.json({ ok: true });
});

// ── Next run calculator ───────────────────────────────────────────────────────
function computeNextRun(frequency: string): Date {
  const now = new Date();
  if (frequency === "monthly") {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0);
    return next;
  }
  // weekly: next Monday at 9am
  const next = new Date(now);
  const daysUntilMonday = ((8 - next.getDay()) % 7) || 7;
  next.setDate(next.getDate() + daysUntilMonday);
  next.setHours(9, 0, 0, 0);
  return next;
}

export default router;
