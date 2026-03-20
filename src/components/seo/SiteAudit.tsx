import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Info, Globe, ArrowRight, Clock, RotateCcw
} from 'lucide-react';
import { blink } from '@/blink/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

interface AuditRecord {
  id: string;
  url: string;
  score: number;
  issues: string;
  recommendations: string;
  createdAt: string;
}

const STEPS = [
  'Fetching page...',
  'Analyzing SEO signals...',
  'Checking meta tags & structure...',
  'Generating AI recommendations...',
  'Saving results...',
];

const severityConfig = {
  critical: { color: 'bg-red-100 text-red-700 border-red-200', icon: <XCircle className="h-4 w-4 text-red-500" />, label: 'Critical' },
  warning:  { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, label: 'Warning' },
  info:     { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, label: 'Pass' },
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="70" y="70" textAnchor="middle" dominantBaseline="central" fontSize="28" fontWeight="bold" fill={color}>
          {score}
        </text>
        <text x="70" y="94" textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))">/ 100</text>
      </svg>
      <p className="text-sm font-semibold mt-1" style={{ color }}>
        {score >= 80 ? 'Excellent' : score >= 60 ? 'Needs Work' : 'Poor'}
      </p>
    </div>
  );
}

export const SiteAudit = () => {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState('');

  const { data: history = [], refetch: refetchHistory } = useQuery<AuditRecord[]>({
    queryKey: ['audits-history'],
    queryFn: async () => {
      const rows = await blink.db.table<AuditRecord>('audits').list({
        orderBy: { createdAt: 'desc' },
        limit: 10,
      });
      return rows;
    },
  });

  const runAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setError('');
    setResult(null);
    setLoading(true);
    setStep(0);

    // Simulate progressive steps with real timing
    const stepDurations = [600, 800, 700, 1200, 400];
    let stepIndex = 0;

    const advanceStep = () => {
      if (stepIndex < STEPS.length - 1) {
        stepIndex++;
        setStep(stepIndex);
      }
    };

    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 1; i < STEPS.length; i++) {
      elapsed += stepDurations[i - 1];
      const t = setTimeout(() => advanceStep(), elapsed);
      timers.push(t);
    }

    try {
      const token = await blink.auth.getValidToken();
      const res = await fetch(AUDIT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      timers.forEach(clearTimeout);
      setStep(STEPS.length - 1);

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Audit failed');

      setResult(data);
      await refetchHistory();
      toast.success('Audit complete!');
    } catch (err: any) {
      timers.forEach(clearTimeout);
      setError(err.message || 'Something went wrong. Please try again.');
      toast.error(err.message || 'Audit failed');
    } finally {
      setLoading(false);
    }
  };

  const progressPct = loading ? Math.round(((step + 1) / STEPS.length) * 100) : 0;

  const criticalCount = result?.issues.filter(i => i.severity === 'critical' && !i.passed).length ?? 0;
  const warningCount = result?.issues.filter(i => i.severity === 'warning' && !i.passed).length ?? 0;

  return (
    <div className="space-y-8">
      {/* Input */}
      <Card className="border-primary/20 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Site SEO Audit
          </CardTitle>
          <CardDescription>
            Paste any URL and our engine will fetch, parse, and score your on-page SEO in real time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={runAudit} className="flex flex-col sm:flex-row gap-3">
            <Input
              type="url"
              placeholder="https://yoursite.com"
              value={url}
              onChange={e => setUrl(e.target.value)}
              disabled={loading}
              required
              className="flex-1 h-12 text-base"
            />
            <Button type="submit" disabled={loading} className="h-12 px-8 shadow-md shadow-primary/20">
              {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Search className="h-5 w-5 mr-2" />}
              {loading ? 'Analyzing...' : 'Start Audit'}
            </Button>
          </form>

          {/* Progress */}
          {loading && (
            <div className="mt-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground font-medium">{STEPS[step]}</span>
                <span className="text-primary font-semibold">{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-2" />
              <div className="flex gap-2 flex-wrap">
                {STEPS.map((s, i) => (
                  <span
                    key={i}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                      i < step ? 'bg-primary/10 border-primary/20 text-primary' :
                      i === step ? 'bg-primary text-primary-foreground border-primary animate-pulse' :
                      'bg-muted border-border text-muted-foreground'
                    }`}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Score + Summary */}
          <Card className="flex flex-col items-center p-6 gap-4 border-primary/10">
            <ScoreRing score={result.score} />
            <div className="w-full space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-red-600 font-semibold">{criticalCount} Critical</span>
                <span className="text-amber-600 font-semibold">{warningCount} Warnings</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Response: {result.responseTime}ms</span>
                <span>Words: ~{result.wordCount}</span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => { setResult(null); setUrl(''); }}
            >
              <RotateCcw className="h-3 w-3 mr-2" /> New Audit
            </Button>
          </Card>

          {/* Issues */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Issues Found</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {result.issues.map((issue, idx) => {
                const cfg = severityConfig[issue.severity];
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      issue.passed ? 'bg-emerald-50/50 border-emerald-100' : cfg.color.replace('text-', 'border-').split(' ')[0] + ' ' + 'border-opacity-50 bg-opacity-30'
                    } ${!issue.passed ? cfg.color : ''}`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {issue.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{issue.check}</span>
                        {!issue.passed && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{issue.detail}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                AI Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {result.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">{rec}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Audit History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Globe className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>No audits yet. Run your first audit above.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(row => {
                    const score = Number(row.score);
                    const scoreColor = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';
                    return (
                      <TableRow key={row.id} className="hover:bg-secondary/20 transition-colors">
                        <TableCell className="font-medium max-w-[220px] truncate">{row.url}</TableCell>
                        <TableCell>
                          <span className={`font-bold ${scoreColor}`}>{score}</span>
                          <span className="text-muted-foreground text-xs">/100</span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                          {new Date(row.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setUrl(row.url);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            Re-audit <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
