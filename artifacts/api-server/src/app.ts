import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { authLimiter, apiLimiter, dnsLimiter, reportLimiter } from "./middlewares/rateLimiter";
import { errorHandler } from "./middlewares/errorHandler";
import router from "./routes";
import { logger } from "./lib/logger";
import { startBlocklistSyncScheduler } from "./services/blocklist-sync";
import { startAlertEngine } from "./services/alert-engine";

const app: Express = express();

// Remove X-Powered-By before any middleware can add it back
app.disable("x-powered-by");

// ── Security headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    hsts: {
      maxAge: 31_536_000,
      includeSubDomains: true,
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],  // Clerk injects inline styles
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://clerk.accounts.dev", "https://*.clerk.accounts.dev"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "no-referrer" },
    xPoweredBy: false,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Permissions-Policy: restrict sensitive APIs
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
});

// Clerk proxy must come before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({
  credentials: true,
  origin: (origin, callback) => callback(null, origin ?? true),
}));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Clerk middleware — resolves publishable key from request host
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env["CLERK_PUBLISHABLE_KEY"],
    ),
  })),
);

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Auth endpoints: 10 req / 15 min per IP
app.use("/api/v1/auth", authLimiter);
app.use("/api/v1/users/login", authLimiter);
app.use("/api/v1/users/register", authLimiter);

// Report generation: 10 req / hour per user
app.use("/api/v1/reports/generate", reportLimiter);

// DNS query endpoint: 10,000 req / min per device
app.use("/api/v1/dns", dnsLimiter);
app.use("/api/v1/android/query", dnsLimiter);

// General API: 300 req / min per user
app.use("/api", apiLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Global error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

// ── Background services ───────────────────────────────────────────────────────
startBlocklistSyncScheduler();
startAlertEngine();

export default app;
