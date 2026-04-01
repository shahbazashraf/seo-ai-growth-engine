/**
 * In-memory cache for audit results with TTL
 * Prevents re-auditing same URL within 1 hour
 */

interface CachedAudit {
  data: any;
  timestamp: number;
}

const CACHE_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour
const auditCache = new Map<string, CachedAudit>();

/**
 * Normalizes URL for caching
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http')) {
    normalized = 'https://' + normalized;
  }
  return normalized.toLowerCase();
}

/**
 * Get cached audit result if still valid (< 1 hour old)
 */
export function getCachedAudit(url: string): any | null {
  const key = normalizeUrl(url);
  const cached = auditCache.get(key);

  if (!cached) return null;

  const ageMs = Date.now() - cached.timestamp;
  if (ageMs > CACHE_TTL_MS) {
    // Expired
    auditCache.delete(key);
    return null;
  }

  return cached.data;
}

/**
 * Cache an audit result
 */
export function setCachedAudit(url: string, data: any): void {
  const key = normalizeUrl(url);
  auditCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Invalidate cache for a URL
 */
export function invalidateAuditCache(url: string): void {
  const key = normalizeUrl(url);
  auditCache.delete(key);
}

/**
 * Clear entire cache (admin use)
 */
export function clearAuditCache(): void {
  auditCache.clear();
}

/**
 * Get cache stats
 */
export function getAuditCacheStats() {
  return {
    size: auditCache.size,
    ttlMs: CACHE_TTL_MS,
  };
}
