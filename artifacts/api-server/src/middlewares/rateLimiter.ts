import rateLimit from "express-rate-limit";

const retryAfterHandler = (_req: any, res: any) => {
  res.setHeader("Retry-After", "60");
  res.status(429).json({
    error: "Too many requests",
    code: "ERR_RATE_LIMITED",
  });
};

// Disable the IPv6 keyGenerator validation — Replit's reverse proxy normalises
// all client IPs before they reach us, so req.ip is already a simple string.
const BASE_OPTS = {
  validate: {
    // Suppress ERR_ERL_KEY_GEN_IPV6 — not applicable behind Replit's proxy
    keyGeneratorIpFallback: false,
  },
} as const;

/** Auth endpoints: 10 req / 15 min per IP */
export const authLimiter = rateLimit({
  ...BASE_OPTS,
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: retryAfterHandler,
  keyGenerator: (req) => req.ip ?? "unknown",
});

/** General API endpoints: 300 req / min per user (falls back to IP) */
export const apiLimiter = rateLimit({
  ...BASE_OPTS,
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: retryAfterHandler,
  keyGenerator: (req: any) => (req.auth?.userId ?? req.userId ?? req.ip ?? "anon") as string,
  skip: (req) => req.method === "OPTIONS",
});

/** DNS query endpoint: 10,000 req / min per device */
export const dnsLimiter = rateLimit({
  ...BASE_OPTS,
  windowMs: 60 * 1000,
  max: 10_000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: retryAfterHandler,
  keyGenerator: (req) =>
    (req.headers["x-device-id"] as string | undefined) ?? req.ip ?? "unknown",
});

/** Report generation: 10 req / hour per user */
export const reportLimiter = rateLimit({
  ...BASE_OPTS,
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: any, res: any) => {
    res.setHeader("Retry-After", "3600");
    res.status(429).json({
      error: "Report generation limit reached. Try again in an hour.",
      code: "ERR_RATE_LIMITED",
    });
  },
  keyGenerator: (req: any) => (req.auth?.userId ?? req.userId ?? req.ip ?? "anon") as string,
});
