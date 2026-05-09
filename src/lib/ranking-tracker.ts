import { localDB } from '@/lib/local-db';
import { apiUrl } from '@/lib/api-endpoints';

type IndexedStatus = 'INDEXED' | 'NOT_INDEXED' | 'EXCLUDED';

interface ContentRecord {
  id: string;
  title?: string;
  canonicalUrl?: string | null;
  lastRefreshedAt?: string | null;
}

interface IndexationRecord {
  id?: string;
  contentId: string;
  url: string;
  status: IndexedStatus;
  lastChecked: string;
  nextCheckAt: string;
  crawledAs?: string | null;
  lastCrawlTime?: string | null;
}

interface RankingSnapshot {
  id?: string;
  contentId: string;
  url: string;
  snapshotDate: string;
  topKeyword: string | null;
  topPosition: number | null;
  avgPosition: number;
  totalClicks: number;
  totalImpressions: number;
  decayDetected: boolean;
}

interface PerformanceRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function plusHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function parseJsonResponse<T>(response: Response): Promise<T> {
  return response.json().then((payload) => {
    if (!response.ok) {
      const err = (payload as { error?: string }).error || `Request failed (${response.status})`;
      throw new Error(err);
    }
    return payload as T;
  });
}

export async function trackPublishedPage(contentId: string, canonicalUrl: string, siteUrl: string): Promise<void> {
  const response = await fetch(apiUrl('/api/gsc-fetch/indexation'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteUrl, pageUrl: canonicalUrl }),
  });

  const payload = await parseJsonResponse<{
    indexedStatus: IndexedStatus;
    crawledAs?: string;
    lastCrawlTime?: string;
  }>(response);

  const now = new Date().toISOString();
  const existing = await localDB.table<IndexationRecord>('indexationRecords').list({
    where: { contentId, url: canonicalUrl },
    limit: 1,
  });

  const record: IndexationRecord = {
    contentId,
    url: canonicalUrl,
    status: payload.indexedStatus,
    lastChecked: now,
    nextCheckAt: plusHours(24),
    crawledAs: payload.crawledAs || '',
    lastCrawlTime: payload.lastCrawlTime || '',
  };

  if (existing[0]?.id) {
    await localDB.table<IndexationRecord>('indexationRecords').update(existing[0].id!, record);
  } else {
    await localDB.table<IndexationRecord>('indexationRecords').create(record);
  }
}

export async function syncRankingData(siteUrl: string): Promise<void> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 28);

  const response = await fetch(apiUrl('/api/gsc-fetch/performance'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteUrl,
      startDate: toIsoDate(start),
      endDate: toIsoDate(end),
    }),
  });

  const payload = await parseJsonResponse<{ rows: PerformanceRow[] }>(response);
  const rows = payload.rows || [];
  const contentItems = await localDB.table<ContentRecord>('content_lab').list();
  const snapshotDate = new Date().toISOString();

  for (const content of contentItems) {
    const url = content.canonicalUrl?.trim();
    if (!url) continue;

    const matches = rows.filter((row) => row.page === url);
    if (matches.length === 0) continue;

    const totalClicks = matches.reduce((sum, row) => sum + Number(row.clicks || 0), 0);
    const totalImpressions = matches.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
    const weightedPositionDenominator = matches.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
    const weightedPositionNumerator = matches.reduce(
      (sum, row) => sum + Number(row.position || 0) * Number(row.impressions || 0),
      0,
    );
    const avgPosition = weightedPositionDenominator > 0
      ? weightedPositionNumerator / weightedPositionDenominator
      : matches.reduce((sum, row) => sum + Number(row.position || 0), 0) / matches.length;

    const topRow = [...matches].sort((a, b) => Number(a.position || 999) - Number(b.position || 999))[0];
    const previous = await localDB.table<RankingSnapshot>('rankingSnapshots').list({
      where: { contentId: content.id, url },
      orderBy: { snapshotDate: 'desc' },
      limit: 1,
    });
    const previousAvg = Number(previous[0]?.avgPosition || 0);
    const decayDetected = previousAvg > 0 && avgPosition - previousAvg > 3;

    const snapshot: RankingSnapshot = {
      contentId: content.id,
      url,
      snapshotDate,
      topKeyword: topRow?.query || null,
      topPosition: topRow ? Number(topRow.position || 0) : null,
      avgPosition,
      totalClicks,
      totalImpressions,
      decayDetected,
    };

    await localDB.table<RankingSnapshot>('rankingSnapshots').create(snapshot);
  }
}

export async function getDecayingPages(): Promise<ContentRecord[]> {
  const snapshots = await localDB.table<RankingSnapshot>('rankingSnapshots').list({
    where: { decayDetected: true },
    orderBy: { snapshotDate: 'desc' },
  });

  if (snapshots.length === 0) return [];

  const seen = new Set<string>();
  const now = Date.now();
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  const results: ContentRecord[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot.contentId || seen.has(snapshot.contentId)) continue;
    const content = await localDB.table<ContentRecord>('content_lab').get(snapshot.contentId);
    if (!content) continue;

    const refreshedAt = content.lastRefreshedAt ? new Date(content.lastRefreshedAt).getTime() : 0;
    const staleEnough = !refreshedAt || now - refreshedAt > maxAgeMs;
    if (!staleEnough) continue;

    seen.add(snapshot.contentId);
    results.push(content);
  }

  return results;
}
