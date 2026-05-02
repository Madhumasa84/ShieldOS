import { Router } from "express";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, refreshTokensTable } from "@workspace/db";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  getRefreshExpiresAt,
} from "../lib/auth";
import { requireAuth, AuthRequest } from "../middlewares/requireAuth";
import { RegisterBody, LoginBody } from "@workspace/api-zod";

const router = Router();

const isProduction = process.env["NODE_ENV"] === "production";

const ACCESS_COOKIE_OPTS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  maxAge: 15 * 60 * 1000,
  path: "/",
};

const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

const CLEAR_COOKIE_OPTS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
};

router.post("/v1/auth/register", async (req, res) => {
  const parse = RegisterBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { username, password } = parse.data;

  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    res.status(400).json({ message: "Username must be 3-32 alphanumeric characters (underscores allowed)" });
    return;
  }

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
    .values({ username, passwordHash, role: "user", isActive: true })
    .returning();

  const accessToken = signAccessToken(user.id, user.username, user.role);
  const refreshToken = generateRefreshToken();
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: getRefreshExpiresAt(),
  });

  res.cookie("at", accessToken, ACCESS_COOKIE_OPTS);
  res.cookie("rt", refreshToken, REFRESH_COOKIE_OPTS);

  res.status(201).json({
    userId: user.id,
    username: user.username,
    role: user.role,
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

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const accessToken = signAccessToken(user.id, user.username, user.role);
  const refreshToken = generateRefreshToken();
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: getRefreshExpiresAt(),
  });

  res.cookie("at", accessToken, ACCESS_COOKIE_OPTS);
  res.cookie("rt", refreshToken, REFRESH_COOKIE_OPTS);

  res.json({
    userId: user.id,
    username: user.username,
    role: user.role,
    accessToken,
    refreshToken,
  });
});

router.post("/v1/auth/refresh", async (req, res) => {
  // Accept refresh token from httpOnly cookie or request body (backward compat)
  const cookieToken = (req as any).cookies?.rt as string | undefined;
  const bodyToken = req.body?.refreshToken as string | undefined;
  const refreshToken = cookieToken || bodyToken;

  if (!refreshToken) {
    res.status(401).json({ message: "Invalid or expired refresh token" });
    return;
  }

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
    res.status(401).json({ message: "User not found or suspended" });
    return;
  }

  const newAccessToken = signAccessToken(user.id, user.username, user.role);
  const newRefreshToken = generateRefreshToken();
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: newRefreshToken,
    expiresAt: getRefreshExpiresAt(),
  });

  res.cookie("at", newAccessToken, ACCESS_COOKIE_OPTS);
  res.cookie("rt", newRefreshToken, REFRESH_COOKIE_OPTS);

  res.json({
    userId: user.id,
    username: user.username,
    role: user.role,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });
});

router.post("/v1/auth/logout", requireAuth, async (req: AuthRequest, res) => {
  // Accept refresh token from cookie or body
  const cookieToken = (req as any).cookies?.rt as string | undefined;
  const bodyToken = req.body?.refreshToken as string | undefined;
  const refreshToken = cookieToken || bodyToken;

  if (refreshToken) {
    await db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokensTable.token, refreshToken));
  }

  res.clearCookie("at", CLEAR_COOKIE_OPTS);
  res.clearCookie("rt", CLEAR_COOKIE_OPTS);
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
    role: user.role,
    createdAt: user.createdAt,
    isActive: user.isActive,
  });
});

export default router;
