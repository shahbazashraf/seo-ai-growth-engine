import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Globe, FileText, Zap, Activity, ArrowRight,
  Link2, Share2, Settings, Plug, CheckCircle2,
} from 'lucide-react';
import { blink } from '@/blink/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface OverviewProps { onNavigate: (view: string) => void }

type ActivityItem = { type: 'audit' | 'content' | 'publish' | 'dist'; label: string; meta: string; date: string };

const TYPE_STYLE: Record<ActivityItem['type'], { bg: string; icon: React.ReactNode; badge: string }> = {
  audit:   { bg: 'bg-blue-100',       icon: <Globe className="h-4 w-4 text-blue-600" />,       badge: 'text-blue-600 border-blue-200' },
  content: { bg: 'bg-primary/10',     icon: <FileText className="h-4 w-4 text-primary" />,      badge: 'text-primary border-primary/20' },
  publish: { bg: 'bg-emerald-100',    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />, badge: 'text-emerald-600 border-emerald-200' },
  dist:    { bg: 'bg-amber-100',      icon: <Share2 className="h-4 w-4 text-amber-600" />,      badge: 'text-amber-600 border-amber-200' },
};
const TYPE_LABEL: Record<ActivityItem['type'], string> = {
  audit: 'Audit', content: 'Content', publish: 'Published', dist: 'Distribution',
};

export const OverviewDashboard = ({ onNavigate }: OverviewProps) => {
  /* ── Row 1 stats ── */
  const { data: auditCount,  isLoading: l1 } = useQuery<number>({ queryKey: ['audit-count'],
    queryFn: async () => (await blink.db.table('audits').list({ limit: 1000 })).length });

  const { data: avgScore,    isLoading: l2 } = useQuery<number | null>({ queryKey: ['avg-score'],
    queryFn: async () => {
      const rows = await blink.db.table<{ score: number }>('audits').list({ limit: 1000 });
      if (!rows.length) return null;
      return Math.round(rows.reduce((a, r) => a + Number(r.score), 0) / rows.length);
    } });

  const { data: contentCount, isLoading: l3 } = useQuery<number>({ queryKey: ['content-count'],
    queryFn: async () => (await blink.db.table('generated_content').list({ limit: 1000 })).length });

  const { data: automationSettings } = useQuery<{ enabled: string | number; frequency: string } | null>({
    queryKey: ['automation-settings'],
    queryFn: async () => {
      const rows = await blink.db.table<{ enabled: string | number; frequency: string }>('automation_settings').list({ limit: 1 });
      return rows[0] ?? null;
    } });

  /* ── Row 2 stats ── */
  const { data: backlinksCount, isLoading: l5 } = useQuery<number>({ queryKey: ['backlinks-count'],
    queryFn: async () => (await blink.db.table('backlinks').list({ limit: 2000 })).length });

  const { data: publishedCount, isLoading: l6 } = useQuery<number>({ queryKey: ['published-count'],
    queryFn: async () => (await blink.db.table('content_lab').list({ where: { status: 'published' }, limit: 1000 })).length });

  const { data: platformsCount, isLoading: l7 } = useQuery<number>({ queryKey: ['platforms-count'],
    queryFn: async () => (await blink.db.table('platform_credentials').list({ limit: 200 })).length });

  const { data: distRate, isLoading: l8 } = useQuery<string>({ queryKey: ['dist-rate'],
    queryFn: async () => {
      const logs = await blink.db.table<{ status: string }>('distribution_logs').list({ limit: 1000 });
      if (!logs.length) return '—';
      const success = logs.filter(l => l.status === 'success').length;
      return `${Math.round((success / logs.length) * 100)}%`;
    } });

  /* ── Recent activity ── */
  const { data: recentActivity = [], isLoading: loadingActivity } = useQuery<ActivityItem[]>({
    queryKey: ['recent-activity-v2'],
    queryFn: async () => {
      const [audits, generated, published, distLogs] = await Promise.all([
        blink.db.table<{ id: string; url: string; score: number; createdAt: string }>('audits').list({ orderBy: { createdAt: 'desc' }, limit: 5 }),
        blink.db.table<{ id: string; title: string; wordCount: number; createdAt: string }>('generated_content').list({ orderBy: { createdAt: 'desc' }, limit: 5 }),
        blink.db.table<{ id: string; title: string; createdAt: string }>('content_lab').list({ where: { status: 'published' }, orderBy: { createdAt: 'desc' }, limit: 4 }),
        blink.db.table<{ id: string; platform: string; status: string; createdAt: string }>('distribution_logs').list({ orderBy: { createdAt: 'desc' }, limit: 4 }),
      ]);
      return [
        ...audits.map(a => ({ type: 'audit'   as const, label: a.url,                meta: `Score: ${a.score}/100`,    date: a.createdAt })),
        ...generated.map(c => ({ type: 'content' as const, label: c.title,             meta: `${Number(c.wordCount).toLocaleString()} words`, date: c.createdAt })),
        ...published.map(p => ({ type: 'publish' as const, label: p.title,             meta: 'Published to platforms',  date: p.createdAt })),
        ...distLogs.map(d => ({ type: 'dist'    as const, label: `Distributed: ${d.platform}`, meta: d.status,         date: d.createdAt })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
    },
  });

  const automationActive = automationSettings?.enabled === '1' || automationSettings?.enabled === 1;

  return (
    <div className="space-y-8">
      {/* Row 1 — Core stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Globe className="h-5 w-5 text-primary" />}        label="Total Audits"       value={l1 ? null : String(auditCount ?? 0)}          cta="Run Audit"      onCta={() => onNavigate('audit')} />
        <StatCard icon={<Activity className="h-5 w-5 text-amber-500" />}   label="Avg SEO Score"      value={l2 ? null : avgScore != null ? `${avgScore}/100` : '—'} sub={avgScore == null ? 'No audits yet' : undefined} cta={avgScore == null ? 'Start auditing' : undefined} onCta={avgScore == null ? () => onNavigate('audit') : undefined} />
        <StatCard icon={<FileText className="h-5 w-5 text-primary" />}     label="Content Generated"  value={l3 ? null : String(contentCount ?? 0)}         cta="Generate Post"  onCta={() => onNavigate('automation')} />
        <StatCard icon={<Zap className={`h-5 w-5 ${automationActive ? 'text-emerald-500' : 'text-muted-foreground'}`} />} label="Automation" value={automationActive ? 'Active' : 'Paused'} sub={automationSettings?.frequency ?? '—'} cta={automationActive ? undefined : 'Enable'} onCta={automationActive ? undefined : () => onNavigate('automation')} />
      </div>

      {/* Row 2 — Extended stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Link2 className="h-5 w-5 text-violet-500" />}     label="Backlinks Found"    value={l5 ? null : String(backlinksCount ?? 0)}       cta="View Backlinks" onCta={() => onNavigate('backlinks')} />
        <StatCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Content Published" value={l6 ? null : String(publishedCount ?? 0)}     cta="Go to Lab"      onCta={() => onNavigate('content')} />
        <StatCard icon={<Plug className="h-5 w-5 text-primary" />}         label="Platforms Connected" value={l7 ? null : String(platformsCount ?? 0)}      cta="Settings"       onCta={() => onNavigate('settings')} />
        <StatCard icon={<Share2 className="h-5 w-5 text-amber-500" />}     label="Distribution Rate"  value={l8 ? null : String(distRate ?? '—')}           cta="Distribution"   onCta={() => onNavigate('distribution')} />
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> Recent Activity
          </CardTitle>
          <CardDescription>Latest audits, content, publications and distributions across your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingActivity ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">
              <Activity className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="mb-4">Nothing yet. Run your first audit or generate content to see activity here.</p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Button variant="outline" size="sm" onClick={() => onNavigate('audit')}>
                  <Globe className="h-3.5 w-3.5 mr-2" /> Run Site Audit
                </Button>
                <Button variant="outline" size="sm" onClick={() => onNavigate('automation')}>
                  <Zap className="h-3.5 w-3.5 mr-2" /> Generate Content
                </Button>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {recentActivity.map((item, idx) => {
                const s = TYPE_STYLE[item.type];
                return (
                  <div key={idx} className="flex items-center gap-4 py-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${s.bg}`}>{s.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.meta}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="outline" className={`text-[10px] ${s.badge}`}>{TYPE_LABEL[item.type]}</Badge>
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(item.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        {([
          { view: 'audit',      icon: <Globe className="h-6 w-6 text-primary" />,       title: 'Run a Site Audit',        desc: 'Analyze any URL for SEO issues in seconds.' },
          { view: 'automation', icon: <Zap className="h-6 w-6 text-primary" />,         title: 'Generate SEO Content',    desc: 'Create an 800+ word optimized blog post with AI.' },
          { view: 'backlinks',  icon: <Link2 className="h-6 w-6 text-violet-500" />,    title: 'Analyze Backlinks',       desc: 'View and monitor backlinks discovered during audits.' },
          { view: 'settings',   icon: <Settings className="h-6 w-6 text-primary" />,    title: 'Settings',                desc: 'Configure platforms, automation, and notifications.' },
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

const StatCard = ({ icon, label, value, sub, cta, onCta }: {
  icon: React.ReactNode; label: string; value: string | null;
  sub?: string; cta?: string; onCta?: () => void;
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
