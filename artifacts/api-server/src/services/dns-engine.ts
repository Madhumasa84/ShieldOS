import { db } from "@workspace/db";
import { systemBlocklistTable, dnsAllowlistTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

// ─── LRU Cache ────────────────────────────────────────────────────────────────
class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.maxSize) {
      this.map.delete(this.map.keys().next().value!);
    }
    this.map.set(key, value);
  }

  clear(): number {
    const count = this.map.size;
    this.map.clear();
    return count;
  }

  get size(): number {
    return this.map.size;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type DnsResult = {
  blocked: boolean;
  category: string;
  rule: string;
};

type BlocklistEntry = { category: string; source: string };

// ─── Global State ─────────────────────────────────────────────────────────────
// Full blocklist in memory for O(1) exact lookups
const blocklistMap = new Map<string, BlocklistEntry>();

// Result LRU cache: key = `${userId}:${domain}`
const resultCache = new LRUCache<string, DnsResult>(50_000);

// Per-user allowlist cache: userId -> Set<domain>
const allowlistCache = new Map<number, Set<string>>();

// Cache hit/miss counters
let cacheHits = 0;
let cacheMisses = 0;

// ─── Blocklist Loading ────────────────────────────────────────────────────────
let blocklistLoaded = false;

export async function warmBlocklist(): Promise<void> {
  try {
    const rows = await db
      .select({
        domain: systemBlocklistTable.domain,
        category: systemBlocklistTable.category,
        source: systemBlocklistTable.source,
      })
      .from(systemBlocklistTable);

    blocklistMap.clear();
    for (const row of rows) {
      blocklistMap.set(row.domain.toLowerCase(), {
        category: row.category,
        source: row.source,
      });
    }
    blocklistLoaded = true;
    logger.info({ count: blocklistMap.size }, "DNS engine: blocklist warmed");
  } catch (err) {
    logger.error({ err }, "DNS engine: failed to warm blocklist");
  }
}

// Called after a blocklist sync completes — reload and invalidate cache
export async function onBlocklistSynced(): Promise<void> {
  resultCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  await warmBlocklist();
}

// ─── Subdomain Matching ───────────────────────────────────────────────────────
function findBlocklistMatch(domain: string): BlocklistEntry | null {
  const normalized = domain.toLowerCase();

  // 1. Exact match
  const exact = blocklistMap.get(normalized);
  if (exact) return exact;

  // 2. Wildcard: *.parent.com
  const wildcardKey = `*.${normalized}`;
  if (blocklistMap.has(wildcardKey)) return blocklistMap.get(wildcardKey)!;

  // 3. Walk up parent domains (subdomain matching)
  const parts = normalized.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join(".");
    const parentEntry = blocklistMap.get(parent);
    if (parentEntry) return parentEntry;

    // Also check wildcard for each parent level
    const wildcard = `*.${parent}`;
    if (blocklistMap.has(wildcard)) return blocklistMap.get(wildcard)!;
  }

  return null;
}

// ─── Allowlist ────────────────────────────────────────────────────────────────
export async function getUserAllowlist(userId: number): Promise<Set<string>> {
  const cached = allowlistCache.get(userId);
  if (cached) return cached;

  const rows = await db
    .select({ domain: dnsAllowlistTable.domain })
    .from(dnsAllowlistTable)
    .where(eq(dnsAllowlistTable.userId, userId));

  const set = new Set(rows.map((r) => r.domain.toLowerCase()));
  allowlistCache.set(userId, set);
  return set;
}

export function invalidateUserAllowlist(userId: number): void {
  allowlistCache.delete(userId);
  // Evict all cached results for this user
  for (const key of [...resultCache["map"].keys()]) {
    if (key.startsWith(`${userId}:`)) {
      resultCache["map"].delete(key);
    }
  }
}

// ─── Main Check ───────────────────────────────────────────────────────────────
export async function checkDomain(
  userId: number,
  domain: string
): Promise<DnsResult> {
  if (!blocklistLoaded) await warmBlocklist();

  const normalized = domain.toLowerCase().replace(/\.$/, ""); // strip trailing dot
  const cacheKey = `${userId}:${normalized}`;

  // Cache hit
  const cached = resultCache.get(cacheKey);
  if (cached) {
    cacheHits++;
    return cached;
  }
  cacheMisses++;

  // Check allowlist first
  const allowlist = await getUserAllowlist(userId);
  if (allowlist.has(normalized)) {
    const result: DnsResult = { blocked: false, category: "allowed", rule: "allowlist" };
    resultCache.set(cacheKey, result);
    return result;
  }

  // Check blocklist
  const match = findBlocklistMatch(normalized);
  const result: DnsResult = match
    ? { blocked: true, category: match.category, rule: match.source }
    : { blocked: false, category: "none", rule: "none" };

  resultCache.set(cacheKey, result);
  return result;
}

// ─── Cache Management ─────────────────────────────────────────────────────────
export function flushCache(): number {
  const count = resultCache.clear();
  allowlistCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  return count;
}

export function getCacheStats(): { size: number; hitRate: string; missRate: string; blocklistSize: number } {
  const total = cacheHits + cacheMisses;
  const hitRate = total === 0 ? "0.0%" : `${((cacheHits / total) * 100).toFixed(1)}%`;
  const missRate = total === 0 ? "0.0%" : `${((cacheMisses / total) * 100).toFixed(1)}%`;
  return { size: resultCache.size, hitRate, missRate, blocklistSize: blocklistMap.size };
}

export function getBlocklistSize(): number {
  return blocklistMap.size;
}
