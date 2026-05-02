import { Response, NextFunction } from "express";
import { AuthRequest } from "./requireAuth";

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.role !== "admin") {
    res.status(403).json({ message: "Admin access required" });
    return;
  }
  next();
}
