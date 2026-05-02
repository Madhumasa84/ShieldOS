import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { verifyAccessToken } from "../lib/auth";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthRequest extends Request {
  userId?: number;
  username?: string;
  role?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  // 1. Try Clerk session (web browser via Clerk SDK)
  const clerkAuth = getAuth(req);
  if (clerkAuth?.userId) {
    // Map Clerk userId → internal numeric userId via username stored in Clerk metadata
    // Clerk userId is stored as externalId; we look up by clerkId column if it exists,
    // or fall back to the username from session claims.
    const clerkUserId = clerkAuth.userId;
    const username = (clerkAuth.sessionClaims as any)?.username as string | undefined
      ?? (clerkAuth.sessionClaims as any)?.preferred_username as string | undefined;

    // Try to find or create the user record for this Clerk identity
    let user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkUserId))
      .limit(1)
      .then((rows) => rows[0] ?? null)
      .catch(() => null);

    if (!user && username) {
      user = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.username, username))
        .limit(1)
        .then((rows) => rows[0] ?? null)
        .catch(() => null);
    }

    if (user && user.isActive) {
      // Persist clerkId mapping if not already set
      if (!user.clerkId) {
        await db
          .update(usersTable)
          .set({ clerkId: clerkUserId })
          .where(eq(usersTable.id, user.id))
          .catch(() => null);
      }
      req.userId = user.id;
      req.username = user.username;
      req.role = user.role ?? "user";
      next();
      return;
    }

    // Clerk user exists but no matching DB record yet — auto-provision
    if (username) {
      try {
        const { hashPassword } = await import("../lib/auth");
        const tempHash = await hashPassword(crypto.randomUUID());
        const [newUser] = await db
          .insert(usersTable)
          .values({
            username,
            passwordHash: tempHash,
            role: "user",
            isActive: true,
            clerkId: clerkUserId,
          })
          .returning();
        req.userId = newUser.id;
        req.username = newUser.username;
        req.role = newUser.role ?? "user";
        next();
        return;
      } catch {
        // fall through to other auth methods
      }
    }
  }

  // 2. Cookie-first JWT: httpOnly `at` cookie for browser clients
  // 3. Authorization header: Bearer token for Android / non-browser clients
  const cookieToken = (req as any).cookies?.at as string | undefined;
  const authHeader = req.headers["authorization"];

  let token: string | undefined;
  if (cookieToken) {
    token = cookieToken;
  } else if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    req.username = payload.username;
    req.role = payload.role ?? "user";
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}
