import { Router } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { threatReportsTable, threatVotesTable } from "@workspace/db";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";
import {
  ReportThreatBody,
  VoteThreatBody,
  VoteThreatParams,
  GetThreatFeedQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/v1/threats/feed", requireAuth, async (req: AuthRequest, res) => {
  const parse = GetThreatFeedQueryParams.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid query parameters" });
    return;
  }
  const { page = 1, limit = 20, category, verified } = parse.data;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (category) conditions.push(eq(threatReportsTable.category, category));
  if (verified !== undefined) conditions.push(eq(threatReportsTable.verified, verified));

  const [threats, totalResult] = await Promise.all([
    db
      .select({
        id: threatReportsTable.id,
        domain: threatReportsTable.domain,
        category: threatReportsTable.category,
        description: threatReportsTable.description,
        votes: threatReportsTable.votes,
        verified: threatReportsTable.verified,
        reportedAt: threatReportsTable.reportedAt,
        userVote: sql<number>`COALESCE((SELECT vote FROM threat_votes WHERE threat_id = ${threatReportsTable.id} AND user_id = ${req.userId!}), 0)`,
      })
      .from(threatReportsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(threatReportsTable.reportedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(threatReportsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  res.json({ threats, total: totalResult[0]?.count ?? 0, page, limit });
});

router.post("/v1/threats/report", requireAuth, async (req: AuthRequest, res) => {
  const parse = ReportThreatBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { domain, category, description } = parse.data;

  const [report] = await db
    .insert(threatReportsTable)
    .values({
      domain: domain.toLowerCase(),
      category,
      description,
      reporterId: req.userId!,
      votes: 0,
      verified: false,
    })
    .returning();

  res.status(201).json({
    ...report,
    userVote: 0,
  });
});

router.post("/v1/threats/vote/:threatId", requireAuth, async (req: AuthRequest, res) => {
  const paramParse = VoteThreatParams.safeParse({ threatId: Number(req.params["threatId"]) });
  const bodyParse = VoteThreatBody.safeParse(req.body);
  if (!paramParse.success || !bodyParse.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { threatId } = paramParse.data;
  const { vote } = bodyParse.data;

  const [threat] = await db
    .select()
    .from(threatReportsTable)
    .where(eq(threatReportsTable.id, threatId))
    .limit(1);

  if (!threat) {
    res.status(404).json({ message: "Threat not found" });
    return;
  }

  const [existing] = await db
    .select()
    .from(threatVotesTable)
    .where(
      and(
        eq(threatVotesTable.threatId, threatId),
        eq(threatVotesTable.userId, req.userId!)
      )
    )
    .limit(1);

  if (existing) {
    const diff = vote - existing.vote;
    await db
      .update(threatVotesTable)
      .set({ vote })
      .where(eq(threatVotesTable.id, existing.id));
    await db
      .update(threatReportsTable)
      .set({ votes: threat.votes + diff })
      .where(eq(threatReportsTable.id, threatId));
  } else {
    await db.insert(threatVotesTable).values({
      threatId,
      userId: req.userId!,
      vote,
    });
    await db
      .update(threatReportsTable)
      .set({ votes: threat.votes + vote })
      .where(eq(threatReportsTable.id, threatId));
  }

  const updatedVotes = threat.votes + (existing ? vote - existing.vote : vote);
  const shouldVerify = updatedVotes >= 10;
  if (shouldVerify && !threat.verified) {
    await db
      .update(threatReportsTable)
      .set({ verified: true, votes: updatedVotes })
      .where(eq(threatReportsTable.id, threatId));
  }

  const [updated] = await db
    .select()
    .from(threatReportsTable)
    .where(eq(threatReportsTable.id, threatId))
    .limit(1);

  res.json({ ...updated, userVote: vote });
});

router.get("/v1/threats/stats", requireAuth, async (_req: AuthRequest, res) => {
  const [total, verified, topCategories] = await Promise.all([
    db.select({ count: count() }).from(threatReportsTable),
    db
      .select({ count: count() })
      .from(threatReportsTable)
      .where(eq(threatReportsTable.verified, true)),
    db
      .select({
        category: threatReportsTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(threatReportsTable)
      .groupBy(threatReportsTable.category)
      .orderBy(sql`count(*) DESC`)
      .limit(5),
  ]);

  const totalCount = total[0]?.count ?? 0;
  const verifiedCount = verified[0]?.count ?? 0;

  res.json({
    totalReports: totalCount,
    verifiedThreats: verifiedCount,
    pendingReview: totalCount - verifiedCount,
    topCategories,
  });
});

export default router;
