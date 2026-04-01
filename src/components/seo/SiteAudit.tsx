import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Info, Globe, ArrowRight, Clock, RotateCcw, Zap
} from 'lucide-react';
import { blink } from '@/blink/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import toast from 'react-hot-toast';
import { geminiGenerateJSON } from '@/lib/ai';
import { getCachedAudit, setCachedAudit, invalidateAuditCache } from '@/lib/audit-cache';

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
  const [skipCache, setSkipCache] = useState(false);
  const [cachedResult, setCachedResult] = useState<string | null>(null);

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

  const viewAuditDetails = (row: AuditRecord) => {
    setUrl(row.url);
    try {
      setResult({
        score: row.score,
        issues: JSON.parse(row.issues || '[]'),
        recommendations: JSON.parse(row.recommendations || '[]'),
        responseTime: 0,
        wordCount: 0,
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

    // Check cache first (unless skipped)
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

    const stepDurations = [600, 800, 700, 1200, 400];
    let stepIndex = 0;
    const advanceStep = () => {
      if (stepIndex < STEPS.length - 1) { stepIndex++; setStep(stepIndex); }
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 1; i < STEPS.length; i++) {
      elapsed += stepDurations[i - 1];
      timers.push(setTimeout(advanceStep, elapsed));
    }

    try {
      let targetUrl = url.trim();
      if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

      const issues: AuditIssue[] = [];
      let score = 100;

      // Fetch page HTML
      const startTime = Date.now();
      let html = '';
      let fetchOk = false;
      try {
        const pageRes = await fetch(targetUrl, { signal: AbortSignal.timeout(12000), redirect: 'follow' });
        html = await pageRes.text();
        fetchOk = pageRes.ok;
      } catch (e: any) {
        // Try via a CORS proxy fallback
        try {
          const proxyRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, { signal: AbortSignal.timeout(12000) });
          html = await proxyRes.text();
          fetchOk = proxyRes.ok;
        } catch {
          issues.push({ check: 'Page Reachability', severity: 'critical', detail: `Could not fetch URL: ${(e as Error).message}`, passed: false });
          score -= 30;
        }
      }
      const responseTime = Date.now() - startTime;

      // HTTPS check
      if (!targetUrl.startsWith('https://')) {
        issues.push({ check: 'HTTPS', severity: 'critical', detail: 'Site is not using HTTPS. This hurts rankings and user trust.', passed: false });
        score -= 15;
      } else {
        issues.push({ check: 'HTTPS', severity: 'info', detail: 'Site uses HTTPS. Good for security and rankings.', passed: true });
      }

      // Response time
      if (responseTime > 3000) {
        issues.push({ check: 'Page Speed', severity: 'critical', detail: `Page loaded in ${responseTime}ms (>3s is too slow).`, passed: false });
        score -= 12;
      } else if (responseTime > 1500) {
        issues.push({ check: 'Page Speed', severity: 'warning', detail: `Page loaded in ${responseTime}ms (aim for under 1.5s).`, passed: false });
        score -= 5;
      } else {
        issues.push({ check: 'Page Speed', severity: 'info', detail: `Page loaded in ${responseTime}ms. Fast!`, passed: true });
      }

      let wordCount = 0;
      if (fetchOk && html) {
        // Title
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';
        if (!title) { issues.push({ check: 'Title Tag', severity: 'critical', detail: 'No <title> tag found.', passed: false }); score -= 15; }
        else if (title.length < 30) { issues.push({ check: 'Title Length', severity: 'warning', detail: `Title is too short (${title.length} chars). Aim for 30-60.`, passed: false }); score -= 6; }
        else if (title.length > 60) { issues.push({ check: 'Title Length', severity: 'warning', detail: `Title is too long (${title.length} chars). Keep under 60.`, passed: false }); score -= 4; }
        else { issues.push({ check: 'Title Tag', severity: 'info', detail: `Title "${title.substring(0, 60)}" is well-optimized (${title.length} chars).`, passed: true }); }

        // Meta description
        const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
        const metaDesc = metaDescMatch ? metaDescMatch[1].trim() : '';
        if (!metaDesc) { issues.push({ check: 'Meta Description', severity: 'critical', detail: 'No meta description found.', passed: false }); score -= 12; }
        else if (metaDesc.length < 120) { issues.push({ check: 'Meta Description Length', severity: 'warning', detail: `Meta description is short (${metaDesc.length} chars). Aim for 120-160.`, passed: false }); score -= 4; }
        else if (metaDesc.length > 160) { issues.push({ check: 'Meta Description Length', severity: 'warning', detail: `Meta description may be truncated (${metaDesc.length} chars).`, passed: false }); score -= 3; }
        else { issues.push({ check: 'Meta Description', severity: 'info', detail: `Meta description is well-optimized (${metaDesc.length} chars).`, passed: true }); }

        // H1
        const h1Matches = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi) || [];
        if (h1Matches.length === 0) { issues.push({ check: 'H1 Tag', severity: 'critical', detail: 'No H1 tag found.', passed: false }); score -= 10; }
        else if (h1Matches.length > 1) { issues.push({ check: 'H1 Count', severity: 'warning', detail: `Found ${h1Matches.length} H1 tags. Use exactly one.`, passed: false }); score -= 6; }
        else { issues.push({ check: 'H1 Tag', severity: 'info', detail: 'Page has exactly one H1 tag.', passed: true }); }

        // Images alt text
        const allImages = html.match(/<img[^>]+>/gi) || [];
        const imagesWithoutAlt = allImages.filter(img => !/alt=["'][^"']*["']/i.test(img) || /alt=["']["']/i.test(img));
        if (imagesWithoutAlt.length > 0) {
          issues.push({ check: 'Image Alt Text', severity: imagesWithoutAlt.length >= 5 ? 'critical' : 'warning', detail: `${imagesWithoutAlt.length} of ${allImages.length} images missing alt text.`, passed: false });
          score -= Math.min(imagesWithoutAlt.length * 2, 10);
        } else if (allImages.length > 0) {
          issues.push({ check: 'Image Alt Text', severity: 'info', detail: `All ${allImages.length} images have alt text.`, passed: true });
        }

        // Canonical, viewport, OG
        if (!/<link[^>]+rel=["']canonical["']/i.test(html)) { issues.push({ check: 'Canonical Tag', severity: 'warning', detail: 'No canonical tag found.', passed: false }); score -= 5; }
        else { issues.push({ check: 'Canonical Tag', severity: 'info', detail: 'Canonical tag present.', passed: true }); }

        if (!/<meta[^>]+name=["']viewport["']/i.test(html)) { issues.push({ check: 'Mobile Viewport', severity: 'warning', detail: 'No viewport meta tag.', passed: false }); score -= 5; }
        else { issues.push({ check: 'Mobile Viewport', severity: 'info', detail: 'Viewport meta tag present.', passed: true }); }

        if (!/<meta[^>]+property=["']og:/i.test(html)) { issues.push({ check: 'Open Graph Tags', severity: 'warning', detail: 'No Open Graph tags found.', passed: false }); score -= 4; }
        else { issues.push({ check: 'Open Graph Tags', severity: 'info', detail: 'Open Graph tags found.', passed: true }); }

        // Word count
        const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        wordCount = bodyText.split(/\s+/).filter(w => w.length > 2).length;
        if (wordCount < 300) { issues.push({ check: 'Content Length', severity: 'warning', detail: `~${wordCount} words. Thin content hurts rankings.`, passed: false }); score -= 8; }
        else { issues.push({ check: 'Content Length', severity: 'info', detail: `~${wordCount} words. Good depth.`, passed: true }); }
      }

      score = Math.max(0, Math.min(100, score));

      // AI Recommendations via Gemini
      let recommendations: string[] = [];
      const failedIssues = issues.filter(i => !i.passed);
      try {
        const issuesSummary = failedIssues.map(i => `[${i.severity.toUpperCase()}] ${i.check}: ${i.detail}`).join('\n');
        recommendations = await geminiGenerateJSON<string[]>(
          `You are an SEO expert. A website audit for "${targetUrl}" produced these issues:\n\n${issuesSummary}\n\nScore: ${score}/100.\n\nProvide EXACTLY 4 specific, actionable recommendations. Return ONLY a JSON array of strings:\n["recommendation 1", "recommendation 2", "recommendation 3", "recommendation 4"]`
        );
      } catch {
        recommendations = [
          'Fix all critical issues first — title, meta description, and H1 have the highest ranking impact.',
          'Enable HTTPS if not already active to secure your site and improve rankings.',
          'Add alt text to all images to improve accessibility and image search visibility.',
          'Create and submit an XML sitemap to Google Search Console for faster indexing.',
        ];
      }

      timers.forEach(clearTimeout);
      setStep(STEPS.length - 1);

      const auditResult = { score, issues, recommendations, responseTime, wordCount };
      setResult(auditResult);

      // Cache the result locally
      setCachedAudit(targetUrl, auditResult);

      // Save to DB
      try {
        await blink.db.table('audits').create({
          url: targetUrl,
          score,
          issues: JSON.stringify(issues),
          recommendations: JSON.stringify(recommendations),
          createdAt: new Date().toISOString(),
        });
      } catch (dbErr) {
        console.error('DB save error:', dbErr);
      }

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
            {cachedResult && (
              <div className="w-full text-xs bg-blue-50 border border-blue-200 rounded p-2 text-blue-700 flex items-start gap-1.5">
                <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{cachedResult}<button onClick={() => { setSkipCache(true); runAudit({ preventDefault: () => {} } as any); }} className="underline hover:no-underline ml-0.5">Refresh</button></span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => { setResult(null); setUrl(''); invalidateAuditCache(url); }}
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
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => viewAuditDetails(row)}
                            >
                              View Details
                            </Button>
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
