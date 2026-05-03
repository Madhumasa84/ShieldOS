import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? "ERR_INTERNAL";

  // Always log the full error internally
  logger.error(
    {
      err,
      req: { method: req.method, url: req.url, id: (req as any).id },
    },
    "Unhandled error",
  );

  // Never expose stack traces in production
  const isProd = process.env["NODE_ENV"] === "production";

  if (isProd || statusCode >= 500) {
    res.status(statusCode).json({
      error: statusCode >= 500 ? "Internal server error" : err.message,
      code,
    });
  } else {
    res.status(statusCode).json({
      error: err.message,
      code,
    });
  }
}

/** Helper to create typed AppErrors */
export function createError(
  message: string,
  statusCode: number,
  code: string,
): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

export const Errors = {
  notFound: (msg = "Not found") => createError(msg, 404, "ERR_NOT_FOUND"),
  unauthorized: (msg = "Unauthorized") => createError(msg, 401, "ERR_UNAUTHORIZED"),
  rateLimited: (msg = "Too many requests") => createError(msg, 429, "ERR_RATE_LIMITED"),
  validation: (msg = "Validation error") => createError(msg, 400, "ERR_VALIDATION"),
  deviceNotFound: (msg = "Device not found") => createError(msg, 404, "ERR_DEVICE_NOT_FOUND"),
};
