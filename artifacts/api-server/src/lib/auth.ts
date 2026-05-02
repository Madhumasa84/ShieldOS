import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "shieldos-dev-secret-change-in-prod";
const JWT_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(userId: number, username: string): string {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyAccessToken(token: string): { userId: number; username: string } {
  return jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

export function getRefreshExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_EXPIRES_IN_MS);
}
