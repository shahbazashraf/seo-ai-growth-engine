import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCcw, SearchCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { localDB } from '@/lib/local-db';
import { syncRankingData } from '@/lib/ranking-tracker';
import { apiUrl } from '@/lib/api-endpoints';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface RankingDashboardProps {
  onNavigate?: (view: string) => void;
}

interface ContentRecord {
  id: string;
  title?: string;
  canonicalUrl?: string | null;
}

interface RankingSnapshot {
  id: string;
  contentId: string;
  url: string;
  snapshotDate: string;
  topKeyword?: string | null;
  avgPosition: number;
  totalClicks: number;
  totalImpressions: number;
  decayDetected: boolean;
}

interface IndexationRecord {
  id: string;
  contentId: string;
  status: 'INDEXED' | 'NOT_INDEXED' | 'EXCLUDED';
  lastChecked?: string;
}

interface ProjectRecord {
  id: string;
  siteUrl?: string;
  url?: string;
  createdAt?: string;
}

function positionClass(position: number) {
  if (position < 10) return 'text-emerald-600';
  if (position <= 30) return 'text-amber-600';
  return 'text-red-600';
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

export const RankingDashboard = ({ onNavigate }: RankingDashboardProps) => {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = React.useState(false);
  const [requestingId, setRequestingId] = React.useState<string | null>(null);

  const { data: project } = useQuery<ProjectRecord | null>({
    queryKey: ['ranking-project-site'],
    queryFn: async () => {
      const rows = await localDB.table<ProjectRecord>('projects').list({
        orderBy: { createdAt: 'desc' },
        limit: 1,
      });
      return rows[0] || null;
    },
  });

  const { data: rows = [], isLoading } = useQuery<Array<{
    contentId: string;
    title: string;
    url: string;
    topKeyword: string;
    avgPosition: number;
    totalClicks: number;
    totalImpressions: number;
    indexedStatus: 'INDEXED' | 'NOT_INDEXED' | 'EXCLUDED';
    decayDetected: boolean;
  }>>({
    queryKey: ['ranking-dashboard-rows'],
    queryFn: async () => {
      const [contentRows, snapshots, indexation] = await Promise.all([
        localDB.table<ContentRecord>('content_lab').list(),
        localDB.table<RankingSnapshot>('rankingSnapshots').list({ orderBy: { snapshotDate: 'desc' } }),
        localDB.table<IndexationRecord>('indexationRecords').list({ orderBy: { lastChecked: 'desc' } }),
      ]);

      const latestByContent = new Map<string, RankingSnapshot>();
      for (const snapshot of snapshots) {
        if (!latestByContent.has(snapshot.contentId)) {
          latestByContent.set(snapshot.contentId, snapshot);
        }
      }

      const indexByContent = new Map<string, IndexationRecord>();
      for (const item of indexation) {
        if (!indexByContent.has(item.contentId)) {
          indexByContent.set(item.contentId, item);
        }
      }

      return contentRows
        .filter((content) => Boolean(content.canonicalUrl))
        .map((content) => {
          const snap = latestByContent.get(content.id);
          const idx = indexByContent.get(content.id);
          return {
            contentId: content.id,
            title: content.title || 'Untitled page',
            url: content.canonicalUrl || '',
            topKeyword: snap?.topKeyword || '—',
            avgPosition: Number(snap?.avgPosition || 0),
            totalClicks: Number(snap?.totalClicks || 0),
            totalImpressions: Number(snap?.totalImpressions || 0),
            indexedStatus: idx?.status || 'NOT_INDEXED',
            decayDetected: Boolean(snap?.decayDetected),
          };
        });
    },
  });

  const sendPromptForRefresh = async (contentId: string, url: string, title: string) => {
    await localDB.table('seo_actions').create({
      projectId: 'workspace-default',
      type: 'refresh_article',
      title: `Refresh decaying page: ${title}`,
      summary: 'Ranking decay detected from Search Console snapshots.',
      reasoning: `This page lost average position and needs a content refresh cycle: ${url}`,
      targetUrl: url,
      source: 'measured',
      score: 90,
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      contentId,
    });
    toast.success('Refresh action added to AI action queue.');
    onNavigate?.('automation');
  };

  const handleSync = async () => {
    const siteUrl = project?.siteUrl || project?.url;
    if (!siteUrl) {
      toast.error('Add a project site URL first.');
      return;
    }
    setSyncing(true);
    try {
      await syncRankingData(siteUrl);
      await queryClient.invalidateQueries({ queryKey: ['ranking-dashboard-rows'] });
      await queryClient.invalidateQueries({ queryKey: ['overview-ranking-summary'] });
      toast.success('Ranking data synced.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to sync ranking data');
    } finally {
      setSyncing(false);
    }
  };

  const requestIndexation = async (contentId: string, url: string) => {
    setRequestingId(contentId);
    try {
      const response = await fetch(apiUrl('/api/gsc-fetch/request-indexation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl: url }),
      });
      await parseJsonResponse(response);
      toast.success('Indexation request submitted to Google.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Indexation request failed');
    } finally {
      setRequestingId(null);
    }
  };

  return (
    <Card className="border-primary/10">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Ranking Dashboard</CardTitle>
            <CardDescription>Search Console performance, indexation status, and decay detection.</CardDescription>
          </div>
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Syncing...</> : <><RefreshCcw className="h-4 w-4 mr-1.5" />Sync data</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading ranking data...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            No ranking rows yet. Connect Search Console and click Sync data.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page title</TableHead>
                <TableHead>Top keyword</TableHead>
                <TableHead>Avg position</TableHead>
                <TableHead>Clicks (28d)</TableHead>
                <TableHead>Impressions</TableHead>
                <TableHead>Indexed?</TableHead>
                <TableHead>Decay?</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.contentId}
                  className={row.decayDetected ? 'cursor-pointer hover:bg-red-50/40' : undefined}
                  onClick={() => {
                    if (row.decayDetected) {
                      void sendPromptForRefresh(row.contentId, row.url, row.title);
                    }
                  }}
                >
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell>{row.topKeyword}</TableCell>
                  <TableCell className={positionClass(row.avgPosition)}>
                    {row.avgPosition ? row.avgPosition.toFixed(1) : '—'}
                  </TableCell>
                  <TableCell>{row.totalClicks.toLocaleString()}</TableCell>
                  <TableCell>{row.totalImpressions.toLocaleString()}</TableCell>
                  <TableCell>
                    {row.indexedStatus === 'INDEXED' ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">Indexed</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 border-red-200 border">Not indexed</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.decayDetected ? (
                      <Badge className="bg-red-100 text-red-700 border-red-200 border">Decaying</Badge>
                    ) : (
                      <Badge variant="outline">Stable</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        void requestIndexation(row.contentId, row.url);
                      }}
                      disabled={requestingId === row.contentId}
                    >
                      {requestingId === row.contentId ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Sending...</>
                      ) : (
                        <><SearchCheck className="h-3.5 w-3.5 mr-1.5" />Request indexation</>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
