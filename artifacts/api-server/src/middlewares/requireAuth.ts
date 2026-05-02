import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/auth";

export interface AuthRequest extends Request {
  userId?: number;
  username?: string;
  role?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
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
