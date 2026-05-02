import { Router, Response } from "express";
import { eq, count } from "drizzle-orm";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, devicesTable } from "@workspace/db";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";
import { requireAdmin } from "../middlewares/requireAdmin";
import { hashPassword } from "../lib/auth";

const router = Router();

// GET /v1/admin/users — list all users with device count + last login
router.get("/v1/admin/users", requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const rows = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      lastLoginAt: usersTable.lastLoginAt,
      deviceCount: count(devicesTable.id),
    })
    .from(usersTable)
    .leftJoin(devicesTable, eq(devicesTable.userId, usersTable.id))
    .groupBy(
      usersTable.id,
      usersTable.username,
      usersTable.role,
      usersTable.isActive,
      usersTable.createdAt,
      usersTable.lastLoginAt
    )
    .orderBy(usersTable.createdAt);

  res.json({
    users: rows.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    })),
  });
});

// PATCH /v1/admin/users/:id/role — promote or demote
router.patch("/v1/admin/users/:id/role", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const userId = parseInt(String(req.params["id"] ?? "0"), 10);
  if (!userId) { res.status(400).json({ message: "Invalid user id" }); return; }

  if (userId === req.userId) {
    res.status(400).json({ message: "Cannot change your own role" });
    return;
  }

  const { role } = req.body as { role?: string };
  if (role !== "admin" && role !== "user") {
    res.status(400).json({ message: "Role must be 'admin' or 'user'" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ role })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id });

  if (!updated) { res.status(404).json({ message: "User not found" }); return; }
  res.json({ message: "Role updated", role });
});

// PATCH /v1/admin/users/:id/status — activate or deactivate
router.patch("/v1/admin/users/:id/status", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const userId = parseInt(String(req.params["id"] ?? "0"), 10);
  if (!userId) { res.status(400).json({ message: "Invalid user id" }); return; }

  if (userId === req.userId) {
    res.status(400).json({ message: "Cannot deactivate your own account" });
    return;
  }

  const { isActive } = req.body as { isActive?: boolean };
  if (typeof isActive !== "boolean") {
    res.status(400).json({ message: "isActive must be a boolean" });
    return;
  }

  // Protect admin accounts from deactivation
  const [target] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!target) { res.status(404).json({ message: "User not found" }); return; }
  if (target.role === "admin" && !isActive) {
    res.status(400).json({ message: "Cannot deactivate an admin account" });
    return;
  }

  await db.update(usersTable).set({ isActive }).where(eq(usersTable.id, userId));
  res.json({ message: isActive ? "User activated" : "User deactivated", isActive });
});

// POST /v1/admin/users/:id/reset-password — generates a temp password
router.post("/v1/admin/users/:id/reset-password", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const userId = parseInt(String(req.params["id"] ?? "0"), 10);
  if (!userId) { res.status(400).json({ message: "Invalid user id" }); return; }

  const [target] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!target) { res.status(404).json({ message: "User not found" }); return; }

  const tempPassword = crypto.randomBytes(6).toString("hex"); // 12-char hex
  const passwordHash = await hashPassword(tempPassword);

  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));
  res.json({ tempPassword });
});

export default router;
