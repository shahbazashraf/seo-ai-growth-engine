import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { blink } from '@/blink/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Search, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Info, Globe, FileText, History, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';

const AUDIT_URL = 'https://gbqxp58q--seo-audit.functions.blink.new';

interface AuditIssue {
  check: string;
  severity: 'critical' | 'warning' | 'info';
  detail: string;
  passed: boolean;
}

interface AuditResult {
  score: number;
  issues: AuditIssue[];
  recommendations: string[];
  responseTime: number;
  wordCount: number;
}

const STEPS = [
  'Fetching page...',
  'Analyzing SEO signals...',
  'Generating recommendations...',
  'Saving results...',
];

const severityConfig = {
  critical: { color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle, iconClass: 'text-red-500' },
  warning:  { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertTriangle, iconClass: 'text-amber-500' },
  info:     { color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2, iconClass: 'text-green-500' },
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#0d9488' : score >= 50 ? '#f59e0b' : '#ef4444';
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <svg width="104" height="104" viewBox="0 0 104 104">
        <circle cx="52" cy="52" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="10" />
        <circle
          cx="52" cy="52" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 52 52)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="52" y="52" dominantBaseline="middle" textAnchor="middle"
          fontSize="22" fontWeight="700" fill="currentColor">
          {score}
        </text>
      </svg>
      <span className="text-xs font-semibold text-muted-foreground">/ 100</span>
    </div>
  );
}

export const SiteAudit = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AuditResult | null>(null);

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['audit-history'],
    queryFn: async () => {
      const rows = await blink.db.table<any>('audits').list({
        orderBy: { createdAt: 'desc' },
        limit: 10,
      });
      return rows;
    },
  });

  const runAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    setStepIndex(0);
    setProgress(0);

    // Animate progress — use ref-based counter to avoid stale closure
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 1.5, 92);
      setProgress(currentProgress);
      setStepIndex(Math.min(Math.floor((currentProgress / 100) * STEPS.length), STEPS.length - 1));
      if (currentProgress >= 92) clearInterval(interval);
    }, 200);

    try {
      const res = await fetch(AUDIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      clearInterval(interval);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Audit failed');
      }

      const data: AuditResult = await res.json();
      setProgress(100);
      setStepIndex(STEPS.length - 1);
      setResult(data);
      refetchHistory();
      toast.success(`Audit complete — Score: ${data.score}/100`);
    } catch (err: any) {
      clearInterval(interval);
      setProgress(0);
      toast.error(err.message || 'Audit failed');
    } finally {
      setLoading(false);
    }
  };

  const criticalCount = result?.issues.filter(i => i.severity === 'critical' && !i.passed).length ?? 0;
  const warningCount = result?.issues.filter(i => i.severity === 'warning' && !i.passed).length ?? 0;

  return (
    <div className="space-y-8">
      {/* Input Card */}
      <Card className="border-primary/20 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            SEO Site Audit
          </CardTitle>
          <CardDescription>Enter any URL to run a full SEO analysis with an AI-powered score and recommendations.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={runAudit} className="flex flex-col sm:flex-row gap-3">
            <Input
              type="url"
              placeholder="https://yourwebsite.com"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
              disabled={loading}
              className="flex-1 h-12 text-base"
            />
            <Button size="lg" className="h-12 px-8 shrink-0" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Analyzing...</> : <><Search className="mr-2 h-5 w-5" />Start Audit</>}
            </Button>
          </form>

          {/* Progress */}
          {loading && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {STEPS[Math.min(stepIndex, STEPS.length - 1)]}
                </span>
                <span className="font-semibold text-primary">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-6 animate-fade-in">
          {/* Score + summary */}
          <div className="grid md:grid-cols-4 gap-4">
            <Card className="md:col-span-1 flex items-center justify-center p-6 bg-secondary/30">
              <div className="text-center space-y-2">
                <ScoreRing score={result.score} />
                <p className="font-semibold text-sm">
                  {result.score >= 80 ? '🟢 Good' : result.score >= 50 ? '🟡 Needs Work' : '🔴 Poor'}
                </p>
              </div>
            </Card>
            <div className="md:col-span-3 grid grid-cols-3 gap-4">
              <Card className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Critical Issues</span>
                <span className="text-3xl font-bold text-red-500">{criticalCount}</span>
              </Card>
              <Card className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Warnings</span>
                <span className="text-3xl font-bold text-amber-500">{warningCount}</span>
              </Card>
              <Card className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Response Time</span>
                <span className="text-3xl font-bold">{result.responseTime}ms</span>
              </Card>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Issues */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  SEO Checks ({result.issues.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {result.issues.map((issue, i) => {
                  const cfg = severityConfig[issue.severity];
                  const Icon = cfg.icon;
                  return (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${cfg.color}`}>
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.iconClass}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{issue.check}</span>
                          <Badge variant="outline" className={`text-[10px] uppercase ${cfg.color}`}>
                            {issue.severity}
                          </Badge>
                        </div>
                        <p className="text-xs mt-0.5 opacity-90">{issue.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  AI Recommendations
                </CardTitle>
                <CardDescription>Actionable steps to improve your score</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-secondary/40 rounded-lg border border-primary/5">
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                      {i + 1}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{rec}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Audit History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No audits yet. Run your first audit above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">URL</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Score</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row: any) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-secondary/20 transition-colors">
                      <td className="py-2.5 px-3">
                        <a href={row.url} target="_blank" rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1 max-w-[280px] truncate">
                          {row.url} <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`font-bold ${row.score >= 80 ? 'text-green-600' : row.score >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                          {row.score}/100
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {new Date(row.createdAt || row.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
