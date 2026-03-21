import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Link2, Loader2, Search, ExternalLink, CheckCircle2, XCircle,
  Copy, TrendingUp, Shield, Target, Mail, Globe, BarChart2, Zap
} from 'lucide-react';
import { blink } from '@/blink/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import toast from 'react-hot-toast';

const BACKLINKS_URL = 'https://gbqxp58q--backlinks-engine.functions.blink.new';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BacklinkRecord {
  id: string;
  userId: string;
  siteUrl: string;
  sourceUrl: string;
  anchorText: string;
  domainAuthority: number;
  status: 'active' | 'broken';
  foundAt: string;
}

interface OpportunityData {
  siteName: string;
  url: string;
  reason: string;
  domainAuthority: number;
  type: string;
}

interface OpportunityRecord {
  id: string;
  userId: string;
  siteUrl: string;
  opportunityData: string; // JSON string of OpportunityData[]
  createdAt: string;
}

interface SiteRecord {
  id: string;
  userId: string;
  url: string;
  isPrimary: number;
  lastAuditAt: string | null;
  createdAt: string;
}

interface ApiBacklink {
  siteUrl: string;
  sourceUrl: string;
  anchorText: string;
  domainAuthority: number;
  status: 'active' | 'broken';
}

interface ApiOpportunity {
  siteName: string;
  url: string;
  reason: string;
  domainAuthority: number;
  type: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncateUrl(url: string, max = 55): string {
  try {
    const u = new URL(url);
    const clean = u.hostname + u.pathname;
    return clean.length > max ? clean.slice(0, max) + '…' : clean;
  } catch {
    return url.length > max ? url.slice(0, max) + '…' : url;
  }
}

function DaBadge({ score }: { score: number }) {
  const s = Number(score);
  const cls =
    s >= 70 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    s >= 40 ? 'bg-amber-100 text-amber-700 border-amber-200' :
              'bg-red-100 text-red-700 border-red-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-bold ${cls}`}>
      {s}
    </span>
  );
}

function StatusBadge({ status }: { status: 'active' | 'broken' }) {
  return status === 'active' ? (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border gap-1 text-xs font-medium">
      <CheckCircle2 className="h-3 w-3" /> Active
    </Badge>
  ) : (
    <Badge className="bg-red-100 text-red-700 border-red-200 border gap-1 text-xs font-medium">
      <XCircle className="h-3 w-3" /> Broken
    </Badge>
  );
}

const ANALYZE_STEPS = [
  'Crawling backlink sources…',
  'Scoring domain authority…',
  'Finding link opportunities…',
  'Saving results…',
];

// ─── Component ────────────────────────────────────────────────────────────────

export const BacklinksManager = () => {
  const queryClient = useQueryClient();
  const [siteUrl, setSiteUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(0);

  // Outreach dialog
  const [outreachEmail, setOutreachEmail] = useState<string | null>(null);
  const [outreachDialogOpen, setOutreachDialogOpen] = useState(false);
  const [generatingEmailFor, setGeneratingEmailFor] = useState<string | null>(null);

  // ── DB queries ──────────────────────────────────────────────────────────────

  const { data: backlinks = [], refetch: refetchBacklinks } = useQuery<BacklinkRecord[]>({
    queryKey: ['backlinks'],
    queryFn: async () => {
      return await blink.db.table<BacklinkRecord>('backlinks').list({
        orderBy: { foundAt: 'desc' },
      });
    },
  });

  const { data: opportunityRows = [], refetch: refetchOpportunities } = useQuery<OpportunityRecord[]>({
    queryKey: ['backlink-opportunities'],
    queryFn: async () => {
      return await blink.db.table<OpportunityRecord>('backlink_opportunities').list({
        orderBy: { createdAt: 'desc' },
        limit: 20,
      });
    },
  });

  // ── Parsed opportunities (most recent set for the current siteUrl) ──────────

  const opportunities: OpportunityData[] = React.useMemo(() => {
    const filtered = siteUrl.trim()
      ? opportunityRows.filter(r => r.siteUrl === siteUrl.trim())
      : opportunityRows;
    if (!filtered.length) return [];
    try { return JSON.parse(filtered[0].opportunityData) as OpportunityData[]; } catch { return []; }
  }, [opportunityRows, siteUrl]);

  // ── Stats ───────────────────────────────────────────────────────────────────

  const displayBacklinks = siteUrl.trim()
    ? backlinks.filter(b => b.siteUrl === siteUrl.trim())
    : backlinks;

  const totalBacklinks = displayBacklinks.length;
  const avgDA = totalBacklinks
    ? Math.round(displayBacklinks.reduce((s, b) => s + Number(b.domainAuthority), 0) / totalBacklinks)
    : 0;
  const activeCount = displayBacklinks.filter(b => b.status === 'active').length;
  const brokenCount = displayBacklinks.filter(b => b.status === 'broken').length;

  // ── Analyze mutation ────────────────────────────────────────────────────────

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = siteUrl.trim();
    if (!url) { toast.error('Enter a site URL first'); return; }

    setAnalyzing(true);
    setAnalyzeStep(0);

    // Animate steps over ~12 seconds
    const durations = [2500, 4000, 3500];
    let elapsed = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    durations.forEach((d, i) => {
      elapsed += d;
      timers.push(setTimeout(() => setAnalyzeStep(i + 1), elapsed));
    });

    try {
      const token = await blink.auth.getValidToken();

      // Ensure site exists in sites table
      const existingSites = await blink.db.table<SiteRecord>('sites').list({
        where: { url },
        limit: 1,
      });
      if (!existingSites.length) {
        await blink.db.table<SiteRecord>('sites').create({
          url,
          isPrimary: 0,
          lastAuditAt: null,
        });
      }

      // Call edge function
      const res = await fetch(`${BACKLINKS_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ siteUrl: url }),
      });

      timers.forEach(clearTimeout);
      setAnalyzeStep(3);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Analysis failed');
      }

      const data: { backlinks: ApiBacklink[]; opportunities: ApiOpportunity[] } = await res.json();

      // Save backlinks to DB
      await Promise.all(
        (data.backlinks || []).map(bl =>
          blink.db.table<BacklinkRecord>('backlinks').create({
            siteUrl: url,
            sourceUrl: bl.sourceUrl,
            anchorText: bl.anchorText,
            domainAuthority: bl.domainAuthority,
            status: bl.status,
            foundAt: new Date().toISOString(),
          })
        )
      );

      // Save opportunities as single record (JSON array)
      if (data.opportunities?.length) {
        await blink.db.table<OpportunityRecord>('backlink_opportunities').create({
          siteUrl: url,
          opportunityData: JSON.stringify(data.opportunities),
        });
      }

      await Promise.all([refetchBacklinks(), refetchOpportunities()]);
      toast.success(`Found ${data.backlinks?.length ?? 0} backlinks & ${data.opportunities?.length ?? 0} opportunities`);
    } catch (err: any) {
      timers.forEach(clearTimeout);
      toast.error(err.message || 'Analysis failed. Try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Generate outreach email ─────────────────────────────────────────────────

  const generateOutreach = async (opportunity: OpportunityData) => {
    setGeneratingEmailFor(opportunity.url);
    try {
      const token = await blink.auth.getValidToken();
      const res = await fetch(`${BACKLINKS_URL}/outreach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          opportunity,
          contentTitle: `Content from ${siteUrl || 'my site'}`,
          siteUrl: siteUrl || '',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate email');
      }

      const data: { email: string } = await res.json();
      setOutreachEmail(data.email);
      setOutreachDialogOpen(true);
      toast.success('Outreach email generated!');
    } catch (err: any) {
      toast.error(err.message || 'Email generation failed');
    } finally {
      setGeneratingEmailFor(null);
    }
  };

  const copyEmail = () => {
    if (!outreachEmail) return;
    navigator.clipboard.writeText(outreachEmail);
    toast.success('Email copied to clipboard');
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Analyze Input ── */}
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Backlinks Analysis Engine
          </CardTitle>
          <CardDescription>
            Enter your site URL to discover existing backlinks and AI-generated link opportunities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAnalyze} className="flex flex-col sm:flex-row gap-3">
            <Input
              type="url"
              placeholder="https://yoursite.com"
              value={siteUrl}
              onChange={e => setSiteUrl(e.target.value)}
              disabled={analyzing}
              required
              className="flex-1 h-11 text-base"
            />
            <Button
              type="submit"
              disabled={analyzing}
              className="h-11 px-7 shadow-md shadow-primary/20 shrink-0"
            >
              {analyzing
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyzing…</>
                : <><Search className="h-4 w-4 mr-2" />Analyze Backlinks</>}
            </Button>
          </form>

          {/* Progress steps */}
          {analyzing && (
            <div className="mt-5 p-4 bg-secondary/40 rounded-xl border border-primary/10 space-y-3">
              <p className="text-sm font-medium text-primary">
                {ANALYZE_STEPS[analyzeStep]}
              </p>
              <div className="flex gap-2">
                {ANALYZE_STEPS.map((s, i) => (
                  <div
                    key={i}
                    className={`flex-1 h-1.5 rounded-full transition-all duration-700 ${
                      i < analyzeStep
                        ? 'bg-primary'
                        : i === analyzeStep
                        ? 'bg-primary/50 animate-pulse'
                        : 'bg-border'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                This may take 10–15 seconds — hang tight…
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs defaultValue="backlinks">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="backlinks" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Your Backlinks
            {totalBacklinks > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
                {totalBacklinks}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="opportunities" className="gap-1.5">
            <Target className="h-3.5 w-3.5" />
            Opportunities
            {opportunities.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
                {opportunities.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Your Backlinks Tab ─── */}
        <TabsContent value="backlinks" className="mt-6 space-y-5">
          {/* Stats */}
          {totalBacklinks > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-primary/10">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Link2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalBacklinks}</p>
                    <p className="text-xs text-muted-foreground">Total Backlinks</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-primary/10">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <BarChart2 className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{avgDA}</p>
                    <p className="text-xs text-muted-foreground">Avg Domain Authority</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-primary/10">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      <span className="text-emerald-600">{activeCount}</span>
                      <span className="text-muted-foreground text-base font-normal"> / </span>
                      <span className="text-red-500">{brokenCount}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Active / Broken</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Table */}
          {displayBacklinks.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Link2 className="h-12 w-12 mx-auto mb-4 text-primary/20" />
                <p className="font-semibold text-foreground mb-1">No backlinks analyzed yet</p>
                <p className="text-sm text-muted-foreground">
                  Enter your site URL above and click "Analyze Backlinks" to get started.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/30">
                        <TableHead className="pl-4">Source URL</TableHead>
                        <TableHead>Anchor Text</TableHead>
                        <TableHead className="text-center">DA</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-right pr-4">Found</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayBacklinks.map(bl => (
                        <TableRow key={bl.id} className="hover:bg-secondary/20 transition-colors">
                          <TableCell className="pl-4 max-w-[260px]">
                            <a
                              href={bl.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-primary hover:underline text-sm font-medium"
                            >
                              <span className="truncate">{truncateUrl(bl.sourceUrl)}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                            </a>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-foreground">{bl.anchorText || '—'}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <DaBadge score={bl.domainAuthority} />
                          </TableCell>
                          <TableCell className="text-center">
                            <StatusBadge status={bl.status} />
                          </TableCell>
                          <TableCell className="text-right pr-4 text-xs text-muted-foreground">
                            {bl.foundAt ? new Date(bl.foundAt).toLocaleDateString() : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Opportunities Tab ─── */}
        <TabsContent value="opportunities" className="mt-6">
          {opportunities.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Target className="h-12 w-12 mx-auto mb-4 text-primary/20" />
                <p className="font-semibold text-foreground mb-1">No opportunities found yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Run a backlink analysis to discover AI-identified link building opportunities.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.querySelector<HTMLInputElement>('input[type="url"]')?.focus()}
                >
                  <Search className="h-4 w-4 mr-2" /> Analyze Your Site
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {opportunities.map((opp, idx) => (
                <Card
                  key={idx}
                  className="border-primary/10 hover:border-primary/30 hover:shadow-md transition-all duration-200"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight mb-0.5">
                          {opp.siteName}
                        </p>
                        <a
                          href={opp.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
                        >
                          <span className="truncate">{truncateUrl(opp.url, 42)}</span>
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                        </a>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <DaBadge score={opp.domainAuthority} />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-primary/5 border-primary/20 text-primary font-medium capitalize"
                      >
                        {opp.type}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                      {opp.reason}
                    </p>

                    <Button
                      size="sm"
                      className="w-full shadow-sm shadow-primary/10"
                      disabled={generatingEmailFor === opp.url}
                      onClick={() => generateOutreach(opp)}
                    >
                      {generatingEmailFor === opp.url
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Generating…</>
                        : <><Mail className="h-3.5 w-3.5 mr-2" />Generate Outreach Email</>}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Outreach Email Dialog ── */}
      <Dialog open={outreachDialogOpen} onOpenChange={setOutreachDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Outreach Email
            </DialogTitle>
            <DialogDescription>
              AI-crafted personalised email for your link building outreach.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <div className="relative">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed p-5 bg-secondary/30 rounded-xl border border-primary/10 max-h-80 overflow-y-auto font-sans text-foreground">
                {outreachEmail}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-3 right-3"
                onClick={copyEmail}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
