import { logger } from "./logger";

interface EnvRule {
  key: string;
  required: boolean;
  minLength?: number;
  warnOnly?: boolean;
}

const ENV_RULES: EnvRule[] = [
  { key: "CLERK_SECRET_KEY", required: true },
  { key: "DATABASE_URL", required: true },
  { key: "NODE_ENV", required: true },
  { key: "PORT", required: true },
  // JWT_SECRET is used for Android device auth tokens — warn but don't exit
  // if missing since Clerk is the primary auth method.
  { key: "JWT_SECRET", required: false, minLength: 32, warnOnly: true },
];

export function validateEnv(): void {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const rule of ENV_RULES) {
    const val = process.env[rule.key];

    if (!val) {
      if (rule.warnOnly) {
        logger.warn({ key: rule.key }, `Optional env var ${rule.key} is not set — some features may be unavailable`);
      } else {
        missing.push(rule.key);
      }
      continue;
    }

    if (rule.minLength && val.length < rule.minLength) {
      if (rule.warnOnly) {
        logger.warn(`${rule.key} is shorter than recommended (${val.length} < ${rule.minLength} chars)`);
      } else {
        invalid.push(`${rule.key} must be at least ${rule.minLength} characters (got ${val.length})`);
      }
    }
  }

  if (missing.length > 0) {
    logger.error(
      { missing },
      `Missing required environment variables: ${missing.join(", ")}. Set them and restart.`,
    );
    process.exit(1);
  }

  if (invalid.length > 0) {
    logger.error(
      { invalid },
      `Invalid environment variables:\n${invalid.map(m => `  - ${m}`).join("\n")}`,
    );
    process.exit(1);
  }

  logger.info("Environment validation passed");
}
