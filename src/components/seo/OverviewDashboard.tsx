import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, FileText, Globe, Gauge, Layers, Link2, Send, Shield, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { localDB } from '@/lib/local-db';
import { buildSeoActionQueue, type SeoAction } from '@/lib/seo-action-engine';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface OverviewProps {
  onNavigate: (view: string) => void;
}

type ActivityItem = {
  type: 'audit' | 'content' | 'distribution';
  label: string;
  meta: string;
  date: string;
};

const TYPE_STYLE: Record<ActivityItem['type'], { bg: string; icon: React.ReactNode; badge: string }> = {
  audit: { bg: 'bg-blue-100', icon: <Globe className="h-4 w-4 text-blue-600" />, badge: 'text-blue-600 border-blue-200' },
  content: { bg: 'bg-primary/10', icon: <FileText className="h-4 w-4 text-primary" />, badge: 'text-primary border-primary/20' },
  distribution: { bg: 'bg-amber-100', icon: <Send className="h-4 w-4 text-amber-600" />, badge: 'text-amber-600 border-amber-200' },
};

const TYPE_LABEL: Record<ActivityItem['type'], string> = {
  audit: 'Audit',
  content: 'Content',
  distribution: 'Publish',
};

export const OverviewDashboard = ({ onNavigate }: OverviewProps) => {
  const { data: auditCount, isLoading: l1 } = useQuery<number>({
    queryKey: ['audit-count'],
    queryFn: async () => await localDB.table('audits').count(),
  });

  const { data: avgScore, isLoading: l2 } = useQuery<number | null>({
    queryKey: ['avg-score'],
    queryFn: async () => {
      const rows = await localDB.table<{ score: number }>('audits').list({ select: ['score'] });
      if (!rows.length) return null;
      return Math.round(rows.reduce((sum, row) => sum + Number(row.score), 0) / rows.length);
    },
  });

  const { data: contentCount, isLoading: l3 } = useQuery<number>({
    queryKey: ['content-count'],
    queryFn: async () => await localDB.table('generated_content').count(),
  });

  const { data: automationSettings } = useQuery<{ enabled: string | number; frequency: string } | null>({
    queryKey: ['automation-settings'],
    queryFn: async () => {
      const rows = await localDB.table<{ enabled: string | number; frequency: string }>('automation_settings').list({ limit: 1 });
      return rows[0] ?? null;
    },
  });

  const { data: backlinksCount, isLoading: l5 } = useQuery<number>({
    queryKey: ['backlink-count'],
    queryFn: async () => await localDB.table('backlinks').count(),
  });

  const { data: publishedCount, isLoading: l6 } = useQuery<number>({
    queryKey: ['published-count'],
    queryFn: async () => await localDB.table('content_lab').count({ where: { status: 'published' } }),
  });

  const { data: distRate, isLoading: l8 } = useQuery<string>({
    queryKey: ['distribution-rate'],
    queryFn: async () => {
      const total = await localDB.table('distribution_logs').count();
      if (total === 0) return '-';
      const success = await localDB.table('distribution_logs').count({ where: { status: 'success' } });
      return `${Math.round((success / total) * 100)}%`;
    },
  });

  const { data: rankingSummary, isLoading: loadingRankingSummary } = useQuery<{
    avgPosition: number | null;
    totalClicks: number;
    totalImpressions: number;
    indexedPages: number;
  }>({
    queryKey: ['overview-ranking-summary'],
    queryFn: async () => {
      const [snapshots, indexation] = await Promise.all([
        localDB.table<any>('rankingSnapshots').list({ orderBy: { snapshotDate: 'desc' } }),
        localDB.table<any>('indexationRecords').list({ orderBy: { lastChecked: 'desc' } }),
      ]);

      const latestByContent = new Map<string, any>();
      snapshots.forEach((row) => {
        if (!latestByContent.has(row.contentId)) latestByContent.set(row.contentId, row);
      });
      const latestIdxByContent = new Map<string, any>();
      indexation.forEach((row) => {
        if (!latestIdxByContent.has(row.contentId)) latestIdxByContent.set(row.contentId, row);
      });

      const snapshotRows = Array.from(latestByContent.values());
      return {
        avgPosition: snapshotRows.length
          ? snapshotRows.reduce((sum, row) => sum + Number(row.avgPosition || 0), 0) / snapshotRows.length
          : null,
        totalClicks: snapshotRows.reduce((sum, row) => sum + Number(row.totalClicks || 0), 0),
        totalImpressions: snapshotRows.reduce((sum, row) => sum + Number(row.totalImpressions || 0), 0),
        indexedPages: Array.from(latestIdxByContent.values()).filter((row) => row.status === 'INDEXED').length,
      };
    },
  });

  const { data: recentActivity = [], isLoading: loadingActivity } = useQuery<ActivityItem[]>({
    queryKey: ['recent-activity-v2'],
    queryFn: async () => {
      const [audits, content, distLogs] = await Promise.all([
        localDB.table<{ url: string; score: number; createdAt: string }>('audits').list({ orderBy: { createdAt: 'desc' }, limit: 5 }),
        localDB.table<{ title: string; wordCount: number; createdAt: string }>('generated_content').list({ orderBy: { createdAt: 'desc' }, limit: 5 }),
        localDB.table<{ platform: string; status: string; createdAt: string }>('distribution_logs').list({ orderBy: { createdAt: 'desc' }, limit: 5 }),
      ]);

      return [
        ...audits.map((row) => ({ type: 'audit' as const, label: row.url, meta: `Score: ${row.score}/100`, date: row.createdAt })),
        ...content.map((row) => ({ type: 'content' as const, label: row.title, meta: `${Number(row.wordCount).toLocaleString()} words`, date: row.createdAt })),
        ...distLogs.map((row) => ({ type: 'distribution' as const, label: `Published to ${row.platform}`, meta: row.status === 'success' ? 'Success' : 'Failed', date: row.createdAt })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);
    },
  });

  const { data: actionQueue = [], isLoading: loadingActions } = useQuery<SeoAction[]>({
    queryKey: ['seo-actions-dashboard'],
    queryFn: async () => {
      const [projects, audits, keywords, content, backlinks, rankingRows, indexationRows, outreachRows] = await Promise.all([
        localDB.table<any>('projects').list({ orderBy: { createdAt: 'desc' }, limit: 1 }),
        localDB.table<any>('audits').list({ orderBy: { createdAt: 'desc' }, limit: 10 }),
        localDB.table<any>('keywords').list({ orderBy: { createdAt: 'desc' }, limit: 20 }),
        localDB.table<any>('content_lab').list({ orderBy: { updatedAt: 'desc' }, limit: 20 }),
        localDB.table<any>('backlinks').list({ orderBy: { createdAt: 'desc' }, limit: 20 }),
        localDB.table<any>('rankingSnapshots').list({ orderBy: { snapshotDate: 'desc' }, limit: 50 }),
        localDB.table<any>('indexationRecords').list({ orderBy: { lastChecked: 'desc' }, limit: 50 }),
        localDB.table<any>('outreachRecords').list({ orderBy: { createdAt: 'desc' }, limit: 100 }),
      ]);

      const project = projects[0];
      if (!project) return [];

      const latestRankingByContent = new Map<string, any>();
      rankingRows.forEach((row: any) => {
        if (!latestRankingByContent.has(row.contentId)) latestRankingByContent.set(row.contentId, row);
      });
      const latestIndexationByContent = new Map<string, any>();
      indexationRows.forEach((row: any) => {
        if (!latestIndexationByContent.has(row.contentId)) latestIndexationByContent.set(row.contentId, row);
      });

      const queue = buildSeoActionQueue({
        projectId: project.id,
        projectName: project.name || project.url || 'your site',
        siteUrl: project.siteUrl || project.url,
        audits,
        keywords,
        content: content.map((item: any) => ({
          ...item,
          publishedAt: item.publishedAt || item.createdAt,
          authorityScore: Number(item.authorityScore || 60),
          contentQualityScore: Number(item.contentQualityScore || (Number(item.wordCount || 0) > 1000 ? 70 : 48)),
          backlinkCount: Number(item.backlinkCount || 0),
        })),
        backlinks,
        ranking: Array.from(latestRankingByContent.values()).map((row: any) => ({
          contentId: row.contentId,
          url: row.url,
          avgPosition: Number(row.avgPosition || 0),
          decayDetected: Boolean(row.decayDetected),
        })),
        indexation: Array.from(latestIndexationByContent.values()).map((row: any) => ({
          contentId: row.contentId,
          url: row.url,
          status: row.status,
        })),
        outreach: outreachRows.map((row: any) => ({
          contentId: row.contentId,
          status: row.status,
          sentAt: row.sentAt,
        })),
      }).slice(0, 4);

      const existing = await localDB.table<any>('seo_actions').list({ where: { projectId: project.id } });
      await Promise.all(existing.map((row: any) => localDB.table('seo_actions').delete(row.id)));
      await Promise.all(queue.map((action) => localDB.table<SeoAction>('seo_actions').create(action)));
      return queue;
    },
  });

  const { data: lastRunLog } = useQuery<any | null>({
    queryKey: ['overview-last-automation-run'],
    queryFn: async () => {
      const rows = await localDB.table<any>('runLogs').list({ orderBy: { runAt: 'desc' }, limit: 1 });
      return rows[0] ?? null;
    },
  });

  const automationActive = automationSettings?.enabled === '1' || automationSettings?.enabled === 1;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Globe className="h-5 w-5 text-primary" />} label="Total Audits" value={l1 ? null : String(auditCount ?? 0)} cta="Run Audit" onCta={() => onNavigate('audit')} />
        <StatCard icon={<Activity className="h-5 w-5 text-amber-500" />} label="Avg SEO Score" value={l2 ? null : avgScore != null ? `${avgScore}/100` : '-'} sub={avgScore == null ? 'No audits yet' : undefined} cta={avgScore == null ? 'Start auditing' : undefined} onCta={avgScore == null ? () => onNavigate('audit') : undefined} />
        <StatCard icon={<FileText className="h-5 w-5 text-primary" />} label="Content Generated" value={l3 ? null : String(contentCount ?? 0)} cta="Generate Post" onCta={() => onNavigate('automation')} />
        <StatCard icon={<Zap className={`h-5 w-5 ${automationActive ? 'text-emerald-500' : 'text-muted-foreground'}`} />} label="SEO Engine" value={automationActive ? 'Active' : 'Paused'} sub={automationSettings?.frequency ?? '-'} cta={automationActive ? undefined : 'Enable'} onCta={automationActive ? undefined : () => onNavigate('automation')} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Link2 className="h-5 w-5 text-blue-500" />} label="Total Backlinks" value={l5 ? null : String(backlinksCount ?? 0)} cta={!backlinksCount ? 'Analyze' : undefined} onCta={!backlinksCount ? () => onNavigate('backlinks') : undefined} />
        <StatCard icon={<Send className="h-5 w-5 text-emerald-500" />} label="Published" value={l6 ? null : String(publishedCount ?? 0)} />
        <StatCard icon={<Layers className="h-5 w-5 text-violet-500" />} label="Queue Items" value={loadingActions ? null : String(actionQueue.length)} />
        <StatCard icon={<TrendingUp className="h-5 w-5 text-amber-500" />} label="Dist. Rate" value={l8 ? null : (distRate ?? '-')} />
      </div>

      <Card className="border-primary/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Ranking Summary</CardTitle>
          <CardDescription>Average position, clicks, impressions, and indexation status from GSC snapshots.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Gauge className="h-5 w-5 text-emerald-500" />} label="Avg Position" value={loadingRankingSummary ? null : rankingSummary?.avgPosition != null ? rankingSummary.avgPosition.toFixed(1) : '-'} />
            <StatCard icon={<Activity className="h-5 w-5 text-blue-500" />} label="Clicks (28d)" value={loadingRankingSummary ? null : String(rankingSummary?.totalClicks ?? 0)} />
            <StatCard icon={<Layers className="h-5 w-5 text-violet-500" />} label="Impressions" value={loadingRankingSummary ? null : String(rankingSummary?.totalImpressions ?? 0)} />
            <StatCard icon={<Shield className="h-5 w-5 text-amber-500" />} label="Pages Indexed" value={loadingRankingSummary ? null : String(rankingSummary?.indexedPages ?? 0)} cta="Open Ranking Dashboard" onCta={() => onNavigate('ranking')} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/15">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Best Next Actions</CardTitle>
          <CardDescription>Prioritized actions with provenance labels.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingActions ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
          ) : actionQueue.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">Create a project, run an audit, or add keywords to generate an action queue.</div>
          ) : (
            <div className="space-y-3">
              {actionQueue.map((action) => (
                <div key={action.id} className="rounded-xl border border-primary/10 bg-secondary/20 p-4 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">{action.score}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{action.title}</p>
                      <Badge variant="outline" className="text-[10px] uppercase">{action.source}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{action.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {lastRunLog && (
        <Card className="border-primary/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Last Automation Run</CardTitle>
            <CardDescription>{new Date(lastRunLog.runAt).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-sm">Platforms posted: <span className="font-semibold">{lastRunLog.totalPlatformsPosted ?? 0}</span></div>
              <div className="rounded-lg border p-3 text-sm">Outreach generated: <span className="font-semibold">{lastRunLog.outreachGenerated ?? 0}</span></div>
              <div className="rounded-lg border p-3 text-sm">Outreach sent: <span className="font-semibold">{lastRunLog.outreachSent ?? 0}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Recent Activity</CardTitle>
          <CardDescription>Latest audits, generated content, and distribution events.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingActivity ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
          ) : recentActivity.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No activity yet.</div>
          ) : (
            <div className="divide-y">
              {recentActivity.map((item, idx) => {
                const style = TYPE_STYLE[item.type];
                return (
                  <div key={idx} className="flex items-center gap-4 py-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>{style.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.meta}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="outline" className={`text-[10px] ${style.badge}`}>{TYPE_LABEL[item.type]}</Badge>
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(item.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {([
          { view: 'audit', icon: <Globe className="h-6 w-6 text-primary" />, title: 'Run a Site Audit', desc: 'Analyze any URL for SEO issues.' },
          { view: 'automation', icon: <Zap className="h-6 w-6 text-primary" />, title: 'Run SEO Engine', desc: 'Generate the next best action.' },
          { view: 'ranking', icon: <TrendingUp className="h-6 w-6 text-amber-500" />, title: 'Ranking Dashboard', desc: 'Track rankings and decay.' },
          { view: 'distribution', icon: <Send className="h-6 w-6 text-emerald-500" />, title: 'Own-Site Publishing', desc: 'Publish first, syndicate safely.' },
          { view: 'backlinks', icon: <Link2 className="h-6 w-6 text-violet-500" />, title: 'Backlink Promotion', desc: 'Launch outreach from strong pages.' },
        ] as const).map(({ view, icon, title, desc }) => (
          <Card key={view} className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group" onClick={() => onNavigate(view)}>
            <CardContent className="flex items-center gap-4 py-5">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">{icon}</div>
              <div className="flex-1">
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

const StatCard = ({
  icon,
  label,
  value,
  sub,
  cta,
  onCta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  sub?: string;
  cta?: string;
  onCta?: () => void;
}) => (
  <Card className="border-primary/10">
    <CardContent className="pt-5 pb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="p-1.5 bg-primary/5 rounded-lg">{icon}</div>
      </div>
      {value === null ? <Skeleton className="h-8 w-20 rounded" /> : <p className="text-2xl font-bold">{value}</p>}
      {sub && <p className="text-xs text-muted-foreground mt-0.5 capitalize">{sub}</p>}
      {cta && onCta && (
        <Button variant="link" size="sm" className="p-0 h-auto mt-1 text-xs text-primary" onClick={onCta}>
          {cta} <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      )}
    </CardContent>
  </Card>
);
