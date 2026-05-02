import { Router } from "express";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  refreshTokensTable,
} from "@workspace/db";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  getRefreshExpiresAt,
} from "../lib/auth";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";
import {
  RegisterBody,
  LoginBody,
  RefreshTokenBody,
  LogoutBody,
} from "@workspace/api-zod";

const router = Router();

router.post("/v1/auth/register", async (req, res) => {
  const parse = RegisterBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { username, password } = parse.data;

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ message: "Username already taken" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ username, passwordHash, isActive: true })
    .returning();

  const accessToken = signAccessToken(user.id, user.username);
  const refreshToken = generateRefreshToken();
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: getRefreshExpiresAt(),
  });

  res.status(201).json({
    userId: user.id,
    username: user.username,
    accessToken,
    refreshToken,
  });
});

router.post("/v1/auth/login", async (req, res) => {
  const parse = LoginBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { username, password } = parse.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const accessToken = signAccessToken(user.id, user.username);
  const refreshToken = generateRefreshToken();
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: getRefreshExpiresAt(),
  });

  res.json({
    userId: user.id,
    username: user.username,
    accessToken,
    refreshToken,
  });
});

router.post("/v1/auth/refresh", async (req, res) => {
  const parse = RefreshTokenBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { refreshToken } = parse.data;

  const [stored] = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.token, refreshToken),
        isNull(refreshTokensTable.revokedAt),
        gt(refreshTokensTable.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!stored) {
    res.status(401).json({ message: "Invalid or expired refresh token" });
    return;
  }

  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokensTable.id, stored.id));

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, stored.userId))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ message: "User not found" });
    return;
  }

  const newAccessToken = signAccessToken(user.id, user.username);
  const newRefreshToken = generateRefreshToken();
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: newRefreshToken,
    expiresAt: getRefreshExpiresAt(),
  });

  res.json({
    userId: user.id,
    username: user.username,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });
});

router.post("/v1/auth/logout", requireAuth, async (req: AuthRequest, res) => {
  const parse = LogoutBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { refreshToken } = parse.data;
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokensTable.token, refreshToken));

  res.json({ message: "Logged out" });
});

router.get("/v1/auth/me", requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    isActive: user.isActive,
  });
});

export default router;
