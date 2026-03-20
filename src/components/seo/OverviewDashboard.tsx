import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { blink } from '@/blink/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3, Search, FileText, Zap, TrendingUp,
  ArrowUpRight, AlertTriangle, Clock
} from 'lucide-react';

interface OverviewDashboardProps {
  onNavigate: (view: string) => void;
}

export function OverviewDashboard({ onNavigate }: OverviewDashboardProps) {
  const { data: auditStats, isLoading: loadingAudits } = useQuery({
    queryKey: ['overview-audits'],
    queryFn: async () => {
      const rows = await blink.db.table<any>('audits').list({ orderBy: { createdAt: 'desc' } });
      const count = rows.length;
      const avgScore = count > 0 ? Math.round(rows.reduce((sum: number, r: any) => sum + (r.score || 0), 0) / count) : 0;
      return { count, avgScore, recent: rows.slice(0, 5) };
    },
  });

  const { data: contentStats, isLoading: loadingContent } = useQuery({
    queryKey: ['overview-content'],
    queryFn: async () => {
      const rows = await blink.db.table<any>('generated_content').list({ orderBy: { createdAt: 'desc' } });
      return { count: rows.length, recent: rows.slice(0, 5) };
    },
  });

  const { data: autoSettings, isLoading: loadingAuto } = useQuery({
    queryKey: ['overview-automation'],
    queryFn: async () => {
      const rows = await blink.db.table<any>('automation_settings').list();
      const active = rows.filter((r: any) => r.enabled === '1' || r.enabled === 1);
      return { totalEngines: rows.length, activeEngines: active.length };
    },
  });

  // Combined recent activity
  const recentActivity = React.useMemo(() => {
    const audits = (auditStats?.recent || []).map((r: any) => ({
      type: 'audit' as const,
      label: `Audited: ${r.url}`,
      score: r.score,
      date: r.createdAt || r.created_at,
    }));
    const content = (contentStats?.recent || []).map((r: any) => ({
      type: 'content' as const,
      label: r.title,
      words: r.wordCount || r.word_count,
      date: r.createdAt || r.created_at,
    }));
    return [...audits, ...content]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);
  }, [auditStats, contentStats]);

  const isLoading = loadingAudits || loadingContent || loadingAuto;

  return (
    <div className="space-y-8">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Audits"
          value={isLoading ? null : auditStats?.count ?? 0}
          icon={<Search className="h-5 w-5 text-primary" />}
          cta={auditStats?.count === 0 ? 'Run First Audit' : undefined}
          onCta={() => onNavigate('audit')}
        />
        <StatCard
          title="Avg SEO Score"
          value={isLoading ? null : auditStats?.avgScore ? `${auditStats.avgScore}/100` : '—'}
          icon={<BarChart3 className="h-5 w-5 text-primary" />}
          sub={auditStats?.avgScore
            ? (auditStats.avgScore >= 80 ? '🟢 Good' : auditStats.avgScore >= 50 ? '🟡 Needs Work' : '🔴 Poor')
            : undefined}
        />
        <StatCard
          title="Content Generated"
          value={isLoading ? null : contentStats?.count ?? 0}
          icon={<FileText className="h-5 w-5 text-primary" />}
          cta={contentStats?.count === 0 ? 'Generate Content' : undefined}
          onCta={() => onNavigate('automation')}
        />
        <StatCard
          title="Automation"
          value={isLoading ? null : autoSettings?.activeEngines
            ? `${autoSettings.activeEngines} Active`
            : 'Offline'}
          icon={<Zap className="h-5 w-5 text-primary" />}
          cta={!autoSettings?.activeEngines ? 'Activate Engine' : undefined}
          onCta={() => onNavigate('automation')}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Recent Activity
            </CardTitle>
            <CardDescription>Latest audits and generated content</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground opacity-20" />
                <p className="text-muted-foreground text-sm">No activity yet.</p>
                <div className="flex justify-center gap-3">
                  <Button size="sm" onClick={() => onNavigate('audit')}>Run First Audit</Button>
                  <Button size="sm" variant="outline" onClick={() => onNavigate('automation')}>Generate Content</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                        item.type === 'audit' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                      }`}>
                        {item.type === 'audit' ? <Search className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                      </div>
                      <span className="text-sm font-medium truncate">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      {item.type === 'audit' && (
                        <span className={`text-sm font-bold ${(item as any).score >= 80 ? 'text-green-600' : (item as any).score >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                          {(item as any).score}/100
                        </span>
                      )}
                      {item.type === 'content' && (
                        <span className="text-xs text-muted-foreground">{(item as any).words} words</span>
                      )}
                      <span className="text-xs text-muted-foreground">{new Date(item.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full justify-between group"
              onClick={() => onNavigate('audit')}
            >
              <span className="flex items-center gap-2"><Search className="h-4 w-4" />Run SEO Audit</span>
              <ArrowUpRight className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Button>
            <Button
              className="w-full justify-between group"
              variant="outline"
              onClick={() => onNavigate('automation')}
            >
              <span className="flex items-center gap-2"><FileText className="h-4 w-4" />Generate Content</span>
              <ArrowUpRight className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Button>
            <Button
              className="w-full justify-between group"
              variant="outline"
              onClick={() => onNavigate('content')}
            >
              <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />Content Lab</span>
              <ArrowUpRight className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Button>

            {/* Tips if no data */}
            {!isLoading && (auditStats?.count ?? 0) === 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Getting Started
                </p>
                <p className="text-xs text-amber-600">Run a Site Audit first to see your current SEO health score.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, sub, cta, onCta }: {
  title: string;
  value: string | number | null;
  icon: React.ReactNode;
  sub?: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <div className="p-1.5 bg-primary/10 rounded-lg">{icon}</div>
        </div>
        {value === null ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div>
            <h3 className="text-2xl font-bold">{value}</h3>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            {cta && onCta && (
              <Button size="sm" variant="link" className="p-0 h-auto text-primary text-xs mt-1" onClick={onCta}>
                {cta} →
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
