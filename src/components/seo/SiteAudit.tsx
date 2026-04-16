import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Info, Globe, ArrowRight, Clock, RotateCcw, Zap,
  Link2, Image, Code2, FileText, TrendingUp, BarChart3,
  ChevronDown, ChevronUp, Shield, Gauge, Layers
} from 'lucide-react';
import { localDB } from '@/lib/local-db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import toast from 'react-hot-toast';
import { geminiGenerateJSON } from '@/lib/ai';
import { getCachedAudit, setCachedAudit, invalidateAuditCache } from '@/lib/audit-cache';
import { runDeepAudit, type DeepAuditResult, type AuditIssue } from '@/lib/deep-audit';
import { createLogger, addBreadcrumb } from '@/lib/logger';

const log = createLogger('SiteAudit');

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
  'Analyzing meta tags & structure...',
  'Checking headings, links & images...',
  'Analyzing structured data & keywords...',
  'Generating AI recommendations...',
  'Saving results...',
];

const severityConfig = {
  critical: { color: 'bg-red-100 text-red-700 border-red-200', icon: <XCircle className="h-4 w-4 text-red-500" />, label: 'Critical' },
  warning:  { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, label: 'Warning' },
  info:     { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, label: 'Pass' },
};

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  const r = size * 0.385;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={size * 0.086} />
        <circle
          cx={center} cy={center} r={r} fill="none"
          stroke={color} strokeWidth={size * 0.086}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x={center} y={center} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.2} fontWeight="bold" fill={color}>
          {score}
        </text>
        <text x={center} y={center + size * 0.17} textAnchor="middle" fontSize={size * 0.079} fill="hsl(var(--muted-foreground))">/ 100</text>
      </svg>
      <p className="text-sm font-semibold mt-1" style={{ color }}>
        {score >= 80 ? 'Excellent' : score >= 60 ? 'Needs Work' : 'Poor'}
      </p>
    </div>
  );
}

// ─── Sub-Score Bar ───────────────────────────────────────────────────────────

function SubScoreBar({ label, score, icon }: { label: string; score: number; icon: React.ReactNode }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {icon}{label}
        </span>
        <span className={`text-xs font-bold ${textColor}`}>{score}/100</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const SiteAudit = () => {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeepAuditResult | null>(null);
  const [error, setError] = useState('');
  const [skipCache, setSkipCache] = useState(false);
  const [cachedResult, setCachedResult] = useState<string | null>(null);
  const [issueFilter, setIssueFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [detailsTab, setDetailsTab] = useState<'issues' | 'headings' | 'links' | 'images' | 'keywords' | 'schema'>('issues');

  const { data: history = [], refetch: refetchHistory } = useQuery<AuditRecord[]>({
    queryKey: ['audits-history'],
    queryFn: async () => {
      return await localDB.table<AuditRecord>('audits').list({
        orderBy: { createdAt: 'desc' },
        limit: 10,
      });
    },
  });

  const viewAuditDetails = (row: AuditRecord) => {
    setUrl(row.url);
    try {
      const issues = JSON.parse(row.issues || '[]');
      const recommendations = JSON.parse(row.recommendations || '[]');
      // Create a minimal deep audit result from history
      setResult({
        url: row.url,
        score: row.score,
        subScores: { technical: 0, content: 0, performance: 0, onPage: 0 },
        meta: { title: '', titleLength: 0, description: '', descriptionLength: 0, ogTitle: '', ogDescription: '', ogImage: '', twitterCard: '', twitterTitle: '', canonical: '', viewport: false, robots: '', charset: '' },
        headings: [],
        headingHierarchyValid: false,
        links: { internal: 0, external: 0, broken: 0, nofollow: 0, items: [] },
        images: { total: 0, withAlt: 0, withoutAlt: 0, lazy: 0, items: [] },
        structuredData: { hasJsonLd: false, schemas: [], rawJsonLd: [] },
        keywordDensity: [],
        wordCount: 0,
        responseTime: 0,
        issues: issues.map((i: any) => ({ ...i, category: i.category || 'technical' })),
        recommendations,
        pageSpeedHints: [],
        screenshots: { desktop: '', mobile: '' }
      });
      toast.success('Loaded audit details from history');
    } catch {
      toast.error('Failed to parse audit details');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const runAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setError('');
    setResult(null);
    setLoading(true);
    setStep(0);
    setCachedResult(null);
    addBreadcrumb('audit_started', 'SiteAudit', { url });

    // Check cache first
    if (!skipCache) {
      const cached = getCachedAudit(url);
      if (cached) {
        setResult(cached);
        setCachedResult('This result was cached less than 1 hour ago. ');
        setLoading(false);
        toast.success('Loaded from cache (< 1h old)');
        return;
      }
    }
    setSkipCache(false);

    // Animated step progression
    const stepDurations = [600, 800, 700, 900, 1200, 400];
    let stepIndex = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 1; i < STEPS.length; i++) {
      elapsed += stepDurations[i - 1];
      timers.push(setTimeout(() => { stepIndex = i; setStep(i); }, elapsed));
    }

    try {
      let targetUrl = url.trim();
      if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

      // Run deep audit
      log.info('Running deep audit', { url: targetUrl });
      const auditResult = await runDeepAudit(targetUrl);

      // Get AI recommendations
      const failedIssues = auditResult.issues.filter(i => !i.passed);
      try {
        const issuesSummary = failedIssues.map(i => `[${i.severity.toUpperCase()}] [${i.category}] ${i.check}: ${i.detail}`).join('\n');
        auditResult.recommendations = await geminiGenerateJSON<string[]>(
          `You are an SEO expert. A deep website audit for "${targetUrl}" produced these issues:\n\n${issuesSummary}\n\nSub-scores: Technical=${auditResult.subScores.technical}, Content=${auditResult.subScores.content}, Performance=${auditResult.subScores.performance}, On-Page=${auditResult.subScores.onPage}\nOverall Score: ${auditResult.score}/100\n\nProvide EXACTLY 6 specific, actionable recommendations covering:\n1. Most critical fix\n2. Technical SEO improvement\n3. Content improvement\n4. Performance optimization\n5. Schema/structured data suggestion\n6. Quick win for immediate ranking improvement\n\nReturn ONLY a JSON array of strings:\n["recommendation 1", "recommendation 2", ...]`
        );
      } catch {
        auditResult.recommendations = [
          'Fix all critical issues first — title, meta description, and H1 have the highest ranking impact.',
          'Add JSON-LD structured data (Article, Organization, BreadcrumbList) to help Google understand your content.',
          'Improve heading hierarchy — use exactly one H1, followed by H2s and H3s in proper order.',
          'Add alt text to all images and implement lazy loading for below-the-fold images.',
          'Create and submit an XML sitemap to Google Search Console for faster indexing.',
          'Add Open Graph and Twitter Card meta tags to improve social sharing appearance.',
        ];
      }

      timers.forEach(clearTimeout);
      setStep(STEPS.length - 1);
      setResult(auditResult);

      // Cache result
      setCachedAudit(targetUrl, auditResult);

      // Save to DB (with 4 second timeout fallback to prevent hanging)
      try {
        await Promise.race([
          localDB.table('audits').create({
            url: targetUrl,
            score: auditResult.score,
            issues: JSON.stringify(auditResult.issues),
            recommendations: JSON.stringify(auditResult.recommendations),
            createdAt: new Date().toISOString(),
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('DB Save timeout')), 4000))
        ]);
      } catch (dbErr) {
        log.error('DB save error or timeout', { error: String(dbErr) });
      }

      try {
        await Promise.race([
          refetchHistory(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('History fetch timeout')), 4000))
        ]);
      } catch (histErr) {
        log.error('History fetch timed out', { error: String(histErr) });
      }
      toast.success('Deep audit complete!');
      addBreadcrumb('audit_completed', 'SiteAudit', { url: targetUrl, score: auditResult.score });
    } catch (err: any) {
      timers.forEach(clearTimeout);
      setError(err.message || 'Something went wrong. Please try again.');
      toast.error(err.message || 'Audit failed');
      log.error('Audit failed', { url, error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const progressPct = loading ? Math.round(((step + 1) / STEPS.length) * 100) : 0;
  const criticalCount = result?.issues.filter(i => i.severity === 'critical' && !i.passed).length ?? 0;
  const warningCount = result?.issues.filter(i => i.severity === 'warning' && !i.passed).length ?? 0;
  const passedCount = result?.issues.filter(i => i.passed).length ?? 0;

  const filteredIssues = result?.issues.filter(i => {
    if (issueFilter === 'all') return true;
    if (issueFilter === 'info') return i.passed;
    return i.severity === issueFilter && !i.passed;
  }) ?? [];

  return (
    <div className="space-y-8">
      {/* Input */}
      <Card className="border-primary/20 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Deep SEO Audit
            <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px]">Enhanced</Badge>
          </CardTitle>
          <CardDescription>
            Comprehensive audit with sub-scores for technical SEO, content quality, performance, and on-page optimization.
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
              {loading ? 'Analyzing...' : 'Start Deep Audit'}
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
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

          {/* Score + Sub-scores Row */}
          <div className="grid lg:grid-cols-4 gap-4">
            {/* Overall Score */}
            <Card className="flex flex-col items-center p-6 gap-4 border-primary/10">
              <ScoreRing score={result.score} />
              <div className="w-full space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-red-600 font-semibold">{criticalCount} Critical</span>
                  <span className="text-amber-600 font-semibold">{warningCount} Warnings</span>
                  <span className="text-emerald-600 font-semibold">{passedCount} Passed</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Response: {result.responseTime}ms</span>
                  <span>Words: ~{result.wordCount}</span>
                </div>
              </div>
              {cachedResult && (
                <div className="w-full text-xs bg-blue-50 border border-blue-200 rounded p-2 text-blue-700 flex items-start gap-1.5">
                  <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{cachedResult}<button onClick={() => { setSkipCache(true); runAudit({ preventDefault: () => {} } as any); }} className="underline hover:no-underline ml-0.5">Refresh</button></span>
                </div>
              )}
              <Button
                variant="outline" size="sm" className="w-full"
                onClick={() => { setResult(null); setUrl(''); invalidateAuditCache(url); }}
              >
                <RotateCcw className="h-3 w-3 mr-2" /> New Audit
              </Button>
            </Card>

            {/* Sub-Scores */}
            <Card className="lg:col-span-3 border-primary/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> SEO Sub-Scores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <SubScoreBar label="Technical SEO" score={result.subScores.technical} icon={<Shield className="h-3 w-3" />} />
                  <SubScoreBar label="Content Quality" score={result.subScores.content} icon={<FileText className="h-3 w-3" />} />
                  <SubScoreBar label="Performance" score={result.subScores.performance} icon={<Gauge className="h-3 w-3" />} />
                  <SubScoreBar label="On-Page SEO" score={result.subScores.onPage} icon={<Layers className="h-3 w-3" />} />
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 bg-secondary/40 rounded-lg text-center">
                    <p className="text-lg font-bold text-primary">{result.headings.length}</p>
                    <p className="text-[10px] text-muted-foreground">Headings</p>
                  </div>
                  <div className="p-3 bg-secondary/40 rounded-lg text-center">
                    <p className="text-lg font-bold text-primary">{result.links.internal + result.links.external}</p>
                    <p className="text-[10px] text-muted-foreground">Links</p>
                  </div>
                  <div className="p-3 bg-secondary/40 rounded-lg text-center">
                    <p className="text-lg font-bold text-primary">{result.images.total}</p>
                    <p className="text-[10px] text-muted-foreground">Images</p>
                  </div>
                  <div className="p-3 bg-secondary/40 rounded-lg text-center">
                    <p className="text-lg font-bold text-primary">{result.structuredData.schemas.length}</p>
                    <p className="text-[10px] text-muted-foreground">Schemas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Analysis Tabs */}
          <Card>
            <Tabs value={detailsTab} onValueChange={v => setDetailsTab(v as any)}>
              <CardHeader className="pb-0">
                <TabsList className="bg-transparent border-b border-border rounded-none p-0 h-auto w-full justify-start gap-0 flex-wrap">
                  <TabsTrigger value="issues" className="gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 pb-3 pt-1 text-muted-foreground text-xs">
                    <AlertTriangle className="h-3 w-3" /> Issues ({result.issues.filter(i => !i.passed).length})
                  </TabsTrigger>
                  <TabsTrigger value="headings" className="gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 pb-3 pt-1 text-muted-foreground text-xs">
                    <FileText className="h-3 w-3" /> Headings ({result.headings.length})
                  </TabsTrigger>
                  <TabsTrigger value="links" className="gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 pb-3 pt-1 text-muted-foreground text-xs">
                    <Link2 className="h-3 w-3" /> Links ({result.links.internal + result.links.external})
                  </TabsTrigger>
                  <TabsTrigger value="images" className="gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 pb-3 pt-1 text-muted-foreground text-xs">
                    <Image className="h-3 w-3" /> Images ({result.images.total})
                  </TabsTrigger>
                  <TabsTrigger value="keywords" className="gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 pb-3 pt-1 text-muted-foreground text-xs">
                    <TrendingUp className="h-3 w-3" /> Keywords
                  </TabsTrigger>
                  <TabsTrigger value="schema" className="gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 pb-3 pt-1 text-muted-foreground text-xs">
                    <Code2 className="h-3 w-3" /> Schema
                  </TabsTrigger>
                  <TabsTrigger value="screenshots" className="gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 pb-3 pt-1 text-muted-foreground text-xs">
                    <Image className="h-3 w-3" /> Visuals
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent className="pt-4">
                {/* Visuals Tab */}
                <TabsContent value="screenshots" className="mt-0">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-slate-300">Desktop View</h3>
                      <div className="rounded-lg border border-slate-800 overflow-hidden bg-black/40 aspect-video relative flex items-center justify-center group shadow-xl">
                        {result.screenshots?.desktop ? (
                          <img src={result.screenshots.desktop} alt="Desktop View" className="w-full h-full object-cover object-top transition-transform duration-700 hover:scale-[1.02]" loading="lazy" />
                        ) : (
                          <div className="text-muted-foreground text-xs flex flex-col items-center gap-2">
                            <Image className="h-5 w-5 opacity-50" />
                            <span>Preview unavailable</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-slate-300">Mobile View</h3>
                      <div className="rounded-[2.5rem] border-[8px] border-slate-900 overflow-hidden bg-black/40 mx-auto w-[280px] h-[550px] relative flex items-center justify-center shadow-2xl">
                        <div className="absolute top-0 inset-x-0 h-6 bg-slate-900 rounded-b-xl z-20 flex justify-center w-1/2 mx-auto" />
                        {result.screenshots?.mobile ? (
                          <img src={result.screenshots.mobile} alt="Mobile View" className="w-full h-full object-cover object-top" loading="lazy" />
                        ) : (
                          <div className="text-muted-foreground text-xs flex flex-col items-center gap-2">
                            <Image className="h-5 w-5 opacity-50" />
                            <span>Preview unavailable</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Issues Tab */}
                <TabsContent value="issues" className="mt-0">
                  <div className="flex gap-2 mb-4 flex-wrap">
                    {(['all', 'critical', 'warning', 'info'] as const).map(f => (
                      <Button
                        key={f}
                        size="sm"
                        variant={issueFilter === f ? 'default' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => setIssueFilter(f)}
                      >
                        {f === 'all' ? 'All' : f === 'info' ? 'Passed' : f.charAt(0).toUpperCase() + f.slice(1)}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                    {filteredIssues.map((issue, idx) => {
                      const cfg = severityConfig[issue.severity];
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${
                            issue.passed ? 'bg-emerald-50/50 border-emerald-100' : `${cfg.color}`
                          }`}
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
                              <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 bg-secondary/50">
                                {issue.category}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{issue.detail}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>

                {/* Headings Tab */}
                <TabsContent value="headings" className="mt-0">
                  <div className="mb-3">
                    <Badge variant={result.headingHierarchyValid ? 'outline' : 'destructive'} className={result.headingHierarchyValid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}>
                      {result.headingHierarchyValid ? '✓ Heading hierarchy is valid' : '✗ Heading hierarchy has issues'}
                    </Badge>
                  </div>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {result.headings.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No headings found on this page.</p>
                    ) : (
                      result.headings.map((h, idx) => (
                        <div key={idx} className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${(h.level - 1) * 20}px` }}>
                          <Badge variant="outline" className={`text-[10px] font-mono shrink-0 ${h.level === 1 ? 'bg-primary/10 text-primary border-primary/20' : ''}`}>
                            {h.tag.toUpperCase()}
                          </Badge>
                          <span className={`text-sm truncate ${h.level === 1 ? 'font-semibold' : ''}`}>{h.text || '(empty)'}</span>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                {/* Links Tab */}
                <TabsContent value="links" className="mt-0">
                  <div className="flex gap-3 mb-4 flex-wrap">
                    <div className="px-3 py-1.5 bg-primary/5 rounded-lg border border-primary/10 text-xs">
                      <span className="font-bold text-primary">{result.links.internal}</span> Internal
                    </div>
                    <div className="px-3 py-1.5 bg-secondary/50 rounded-lg border text-xs">
                      <span className="font-bold">{result.links.external}</span> External
                    </div>
                    <div className="px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-200 text-xs">
                      <span className="font-bold text-amber-700">{result.links.nofollow}</span> Nofollow
                    </div>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary/30">
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">URL</TableHead>
                          <TableHead className="text-xs">Anchor Text</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.links.items.slice(0, 30).map((link, idx) => (
                          <TableRow key={idx} className="hover:bg-secondary/20">
                            <TableCell>
                              <Badge variant="outline" className={`text-[9px] ${link.type === 'internal' ? 'bg-primary/5 text-primary border-primary/20' : 'bg-secondary/50'}`}>
                                {link.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[250px] truncate text-xs">
                              <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                {link.href}
                              </a>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{link.text || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* Images Tab */}
                <TabsContent value="images" className="mt-0">
                  <div className="flex gap-3 mb-4 flex-wrap">
                    <div className="px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100 text-xs">
                      <span className="font-bold text-emerald-600">{result.images.withAlt}</span> With Alt
                    </div>
                    <div className="px-3 py-1.5 bg-red-50 rounded-lg border border-red-100 text-xs">
                      <span className="font-bold text-red-600">{result.images.withoutAlt}</span> Missing Alt
                    </div>
                    <div className="px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100 text-xs">
                      <span className="font-bold text-blue-600">{result.images.lazy}</span> Lazy Loaded
                    </div>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary/30">
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Alt Text</TableHead>
                          <TableHead className="text-xs">Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.images.items.map((img, idx) => (
                          <TableRow key={idx} className="hover:bg-secondary/20">
                            <TableCell>
                              {img.hasAlt
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                            </TableCell>
                            <TableCell className="text-xs max-w-[200px] truncate">{img.alt || <span className="text-red-500 italic">missing</span>}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{img.src}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* Keywords Tab */}
                <TabsContent value="keywords" className="mt-0">
                  {result.keywordDensity.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No keyword data available.</p>
                  ) : (
                    <div className="max-h-[400px] overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-secondary/30">
                            <TableHead className="text-xs">#</TableHead>
                            <TableHead className="text-xs">Keyword</TableHead>
                            <TableHead className="text-xs text-right">Count</TableHead>
                            <TableHead className="text-xs text-right">Density</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.keywordDensity.map((kw, idx) => (
                            <TableRow key={idx} className="hover:bg-secondary/20">
                              <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell className="text-sm font-medium">{kw.word}</TableCell>
                              <TableCell className="text-sm text-right font-semibold text-primary">{kw.count}</TableCell>
                              <TableCell className="text-sm text-right">{kw.density}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* Schema Tab */}
                <TabsContent value="schema" className="mt-0">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge variant={result.structuredData.hasJsonLd ? 'outline' : 'destructive'}
                        className={result.structuredData.hasJsonLd ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}>
                        {result.structuredData.hasJsonLd ? '✓ JSON-LD Found' : '✗ No JSON-LD'}
                      </Badge>
                    </div>
                    {result.structuredData.schemas.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Detected Schema Types:</p>
                        <div className="flex flex-wrap gap-2">
                          {result.structuredData.schemas.map((s, idx) => (
                            <Badge key={idx} variant="outline" className="bg-primary/5 text-primary border-primary/20">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.pageSpeedHints.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Page Speed Hints:</p>
                        <ul className="space-y-1.5">
                          {result.pageSpeedHints.map((hint, idx) => (
                            <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                              <Zap className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                              {hint}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>

          {/* AI Recommendations */}
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
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => viewAuditDetails(row)}>
                              View Details
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => { setUrl(row.url); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            >
                              Re-audit <ArrowRight className="h-3 w-3 ml-1" />
                            </Button>
                          </div>
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
