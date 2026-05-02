import { db } from "@workspace/db";
import {
  systemBlocklistTable,
  blocklistSyncStatusTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const BLOCKLIST_SOURCES = [
  {
    name: "StevenBlack",
    url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
  },
  {
    name: "AdAway",
    url: "https://adaway.org/hosts.txt",
  },
  {
    name: "NiceHash",
    url: "https://raw.githubusercontent.com/nicehash/NiceHashQuarryIsDown/master/hosts.txt",
  },
];

const AD_PATTERNS =
  /doubleclick|adnxs|googlesyndication|adserver|adtech|advertising|\.ads\.|[.-]ads[.-]|adnetwork|adsystem|adservice|banner[.-]|[.-]banner|pagead|rubiconproject|openx|pubmatic|appnexus|criteo|taboola|outbrain|revcontent|moatads|adsafeprotected|doubleverify|mediamath|spotxchange|smartadserver|adform|bidswitch|lijit|springserve|triplelift|sharethrough|sovrn|adsrvr|casalemedia|contextweb|4dsply|adroll|justpremium|indexexchange|yieldmo|conversantmedia|advertising\.com|ads\.yahoo|ads\.google/;

const TRACKING_PATTERNS =
  /analytics|tracking|telemetry|metrics|stats\.|\.stats|pixel\.|[.-]pixel|beacon|[.-]collect\.|tag\.|[.-]tag\.|measurement|clickstream|heatmap|sessioncam|hotjar|mixpanel|amplitude|segment\.|heap\.|fullstory|logrocket|mouseflow|crazyegg|quantserve|scorecard|comscore|nielsen|chartbeat|parsely|newrelic|datadog|dynatrace|appsflyer|branch\.|adjust\.|kochava|singular\.|tune\.|attribution|[.-]tracker[.-]/;

const MALWARE_PATTERNS =
  /malware|phish|ransomware|botnet|c2\.|exploit|trojan|virus|spyware|rootkit|keylogger|cryptominer|coinhive|cryptojack|crypt0[.-]|darkweb|tor2web|onion\.|evil|hack[.-]/;

const SOCIAL_PATTERNS =
  /facebook\.|fb\.|instagram\.|twitter\.|tiktok\.|snapchat\.|pinterest\.|linkedin\.|reddit\.|tumblr\.|social\.|fbcdn\.|whatsapp\.|messenger\.|wechat\.|weibo\.|vk\.|telegram\./;

export function categorizeDomain(domain: string): string {
  const d = domain.toLowerCase();
  if (SOCIAL_PATTERNS.test(d)) return "social";
  if (MALWARE_PATTERNS.test(d)) return "malware";
  if (AD_PATTERNS.test(d)) return "ads";
  if (TRACKING_PATTERNS.test(d)) return "tracking";
  return "tracking";
}

export function parseHostsFile(content: string): string[] {
  const domains: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Strip inline comments
    const withoutComment = trimmed.split("#")[0]!.trim();
    if (!withoutComment) continue;

    const parts = withoutComment.split(/\s+/);
    if (
      parts.length >= 2 &&
      (parts[0] === "0.0.0.0" || parts[0] === "127.0.0.1")
    ) {
      const domain = parts[1]!.toLowerCase();
      // Skip localhost, broadcast, invalid entries
      if (
        domain &&
        domain !== "localhost" &&
        domain !== "0.0.0.0" &&
        domain !== "127.0.0.1" &&
        domain !== "::1" &&
        !domain.startsWith("#") &&
        domain.includes(".") &&
        domain.length <= 253
      ) {
        domains.push(domain);
      }
    }
  }

  return domains;
}

async function fetchWithTimeout(url: string, timeoutMs = 30000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function bulkUpsert(
  domains: Array<{ domain: string; category: string; source: string }>
): Promise<number> {
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < domains.length; i += BATCH_SIZE) {
    const batch = domains.slice(i, i + BATCH_SIZE);
    try {
      await db
        .insert(systemBlocklistTable)
        .values(batch)
        .onConflictDoUpdate({
          target: systemBlocklistTable.domain,
          set: {
            category: sql`excluded.category`,
            source: sql`excluded.source`,
          },
        });
      inserted += batch.length;
    } catch (err) {
      logger.error({ err }, "Batch upsert error");
    }
  }

  return inserted;
}

let syncRunning = false;
let syncInterval: ReturnType<typeof setInterval> | null = null;

export async function runBlocklistSync(): Promise<void> {
  if (syncRunning) {
    logger.info("Blocklist sync already running, skipping");
    return;
  }
  syncRunning = true;

  const [syncRecord] = await db
    .insert(blocklistSyncStatusTable)
    .values({ status: "running", totalDomains: 0 })
    .returning();

  logger.info({ syncId: syncRecord.id }, "Blocklist sync started");

  try {
    const allDomains = new Map<string, { category: string; source: string }>();

    for (const source of BLOCKLIST_SOURCES) {
      logger.info({ source: source.name, url: source.url }, "Fetching blocklist");
      try {
        const content = await fetchWithTimeout(source.url, 60000);
        const domains = parseHostsFile(content);
        logger.info({ source: source.name, count: domains.length }, "Parsed domains");

        for (const domain of domains) {
          if (!allDomains.has(domain)) {
            allDomains.set(domain, {
              category: categorizeDomain(domain),
              source: source.name,
            });
          }
        }
      } catch (err) {
        logger.warn({ err, source: source.name }, "Failed to fetch blocklist source");
      }
    }

    const toInsert = Array.from(allDomains.entries()).map(([domain, meta]) => ({
      domain,
      category: meta.category,
      source: meta.source,
    }));

    logger.info({ total: toInsert.length }, "Upserting domains into system_blocklist");
    const inserted = await bulkUpsert(toInsert);

    await db
      .update(blocklistSyncStatusTable)
      .set({
        status: "completed",
        totalDomains: inserted,
        completedAt: new Date(),
      })
      .where(eq(blocklistSyncStatusTable.id, syncRecord.id));

    logger.info({ syncId: syncRecord.id, total: inserted }, "Blocklist sync completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(blocklistSyncStatusTable)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: message,
      })
      .where(eq(blocklistSyncStatusTable.id, syncRecord.id));
    logger.error({ err, syncId: syncRecord.id }, "Blocklist sync failed");
  } finally {
    syncRunning = false;
  }
}

export function startBlocklistSyncScheduler(): void {
  // Run immediately on startup (non-blocking)
  setImmediate(() => {
    runBlocklistSync().catch((err) =>
      logger.error({ err }, "Initial blocklist sync error")
    );
  });

  // Re-sync every 24 hours
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  syncInterval = setInterval(() => {
    runBlocklistSync().catch((err) =>
      logger.error({ err }, "Scheduled blocklist sync error")
    );
  }, INTERVAL_MS);

  logger.info("Blocklist sync scheduler started (every 24h)");
}

export function stopBlocklistSyncScheduler(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export function isSyncRunning(): boolean {
  return syncRunning;
}
