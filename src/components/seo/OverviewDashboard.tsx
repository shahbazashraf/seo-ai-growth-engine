import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe, FileText, Zap, Activity, ArrowRight, Loader2 } from 'lucide-react';
import { blink } from '@/blink/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface OverviewProps {
  onNavigate: (view: string) => void;
}

export const OverviewDashboard = ({ onNavigate }: OverviewProps) => {
  const { data: auditCount, isLoading: loadingAudits } = useQuery<number>({
    queryKey: ['audit-count'],
    queryFn: async () => {
      const rows = await blink.db.table('audits').list({ limit: 1000 });
      return rows.length;
    },
  });

  const { data: avgScore, isLoading: loadingScore } = useQuery<number | null>({
    queryKey: ['avg-score'],
    queryFn: async () => {
      const rows = await blink.db.table<{ score: number }>('audits').list({ limit: 1000 });
      if (!rows.length) return null;
      const sum = rows.reduce((acc, r) => acc + Number(r.score), 0);
      return Math.round(sum / rows.length);
    },
  });

  const { data: contentCount, isLoading: loadingContent } = useQuery<number>({
    queryKey: ['content-count'],
    queryFn: async () => {
      const rows = await blink.db.table('generated_content').list({ limit: 1000 });
      return rows.length;
    },
  });

  const { data: automationSettings } = useQuery<{ enabled: string | number; frequency: string } | null>({
    queryKey: ['automation-settings'],
    queryFn: async () => {
      const rows = await blink.db.table<{ enabled: string | number; frequency: string }>('automation_settings').list({ limit: 1 });
      return rows[0] ?? null;
    },
  });

  const { data: recentActivity = [], isLoading: loadingActivity } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: async () => {
      const [audits, content] = await Promise.all([
        blink.db.table<{ id: string; url: string; score: number; createdAt: string }>('audits').list({
          orderBy: { createdAt: 'desc' }, limit: 5,
        }),
        blink.db.table<{ id: string; title: string; wordCount: number; createdAt: string }>('generated_content').list({
          orderBy: { createdAt: 'desc' }, limit: 5,
        }),
      ]);

      const combined = [
        ...audits.map(a => ({ type: 'audit' as const, label: a.url, meta: `Score: ${a.score}/100`, date: a.createdAt })),
        ...content.map(c => ({ type: 'content' as const, label: c.title, meta: `${Number(c.wordCount).toLocaleString()} words`, date: c.createdAt })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

      return combined;
    },
  });

  const automationActive = automationSettings?.enabled === '1' || automationSettings?.enabled === 1;

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Globe className="h-5 w-5 text-primary" />}
          label="Total Audits"
          value={loadingAudits ? null : String(auditCount ?? 0)}
          cta="Run Audit"
          onCta={() => onNavigate('audit')}
        />
        <StatCard
          icon={<Activity className="h-5 w-5 text-amber-500" />}
          label="Avg SEO Score"
          value={loadingScore ? null : avgScore != null ? `${avgScore}/100` : '—'}
          sub={avgScore == null ? 'No audits yet' : undefined}
          onCta={avgScore == null ? () => onNavigate('audit') : undefined}
          cta={avgScore == null ? 'Start auditing' : undefined}
        />
        <StatCard
          icon={<FileText className="h-5 w-5 text-primary" />}
          label="Content Generated"
          value={loadingContent ? null : String(contentCount ?? 0)}
          cta="Generate Post"
          onCta={() => onNavigate('automation')}
        />
        <StatCard
          icon={<Zap className={`h-5 w-5 ${automationActive ? 'text-emerald-500' : 'text-muted-foreground'}`} />}
          label="Automation"
          value={automationActive ? 'Active' : 'Paused'}
          sub={automationSettings?.frequency ?? '—'}
          cta={automationActive ? undefined : 'Enable'}
          onCta={automationActive ? undefined : () => onNavigate('automation')}
        />
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest audits and generated content across your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingActivity ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
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
              {recentActivity.map((item, idx) => (
                <div key={idx} className="flex items-center gap-4 py-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                    item.type === 'audit' ? 'bg-blue-100' : 'bg-primary/10'
                  }`}>
                    {item.type === 'audit'
                      ? <Globe className="h-4 w-4 text-blue-600" />
                      : <FileText className="h-4 w-4 text-primary" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.meta}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${item.type === 'audit' ? 'text-blue-600 border-blue-200' : 'text-primary border-primary/20'}`}>
                      {item.type === 'audit' ? 'Audit' : 'Content'}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(item.date).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Action CTA grid */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card
          className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group"
          onClick={() => onNavigate('audit')}
        >
          <CardContent className="flex items-center gap-4 py-5">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Globe className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">Run a Site Audit</p>
              <p className="text-sm text-muted-foreground">Analyze any URL for SEO issues in seconds.</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group"
          onClick={() => onNavigate('automation')}
        >
          <CardContent className="flex items-center gap-4 py-5">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">Generate SEO Content</p>
              <p className="text-sm text-muted-foreground">Create an 800+ word optimized blog post with AI.</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const StatCard = ({
  icon, label, value, sub, cta, onCta
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
      {value === null ? (
        <Skeleton className="h-8 w-20 rounded" />
      ) : (
        <p className="text-2xl font-bold">{value}</p>
      )}
      {sub && <p className="text-xs text-muted-foreground mt-0.5 capitalize">{sub}</p>}
      {cta && onCta && (
        <Button variant="link" size="sm" className="p-0 h-auto mt-1 text-xs text-primary" onClick={onCta}>
          {cta} <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      )}
    </CardContent>
  </Card>
);
