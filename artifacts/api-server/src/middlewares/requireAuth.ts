import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/auth";

export interface AuthRequest extends Request {
  userId?: number;
  username?: string;
  role?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  // Cookie-first: httpOnly `at` cookie for browser clients
  // Fallback to Authorization header for Android / non-browser clients
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
