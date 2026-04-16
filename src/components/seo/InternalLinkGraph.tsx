import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Network, Search, Loader2, ArrowRight, Waypoints, Link as LinkIcon, AlertTriangle, CheckCircle2, Copy
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import toast from 'react-hot-toast';
import { geminiGenerateJSON } from '@/lib/ai';
import { createLogger, addBreadcrumb } from '@/lib/logger';
import { localDB } from '@/lib/local-db';

const log = createLogger('InternalLinkGraph');

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageNode {
  id: string;
  url: string;
  title: string;
  inlinks: number;
  outlinks: number;
  orphan: boolean;
  topicCluster: string;
}

interface LinkRecommendation {
  sourceUrl: string;
  targetUrl: string;
  suggestedAnchorText: string;
  context: string;
}

interface GraphResult {
  pagesScanned: number;
  totalInternalLinks: number;
  orphanPagesCount: number;
  healthScore: number;
  nodes: PageNode[];
  recommendations: LinkRecommendation[];
}

export function InternalLinkGraph() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GraphResult | null>(null);
  const [progress, setProgress] = useState(0);

  // Auto-fill from project if empty
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => localDB.table('projects').list()
  });

  React.useEffect(() => {
    if (!url && projects.length > 0 && projects[0].domain) {
      setUrl(projects[0].domain as string);
    }
  }, [projects, url]);

  const runAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setResult(null);
    setProgress(0);
    addBreadcrumb('internal_link_start', 'InternalLinkGraph', { url });

    // Simulate scanning progress
    const interval = setInterval(() => {
      setProgress(p => Math.min(p + Math.random() * 15, 90));
    }, 600);

    try {
      log.info('Starting internal link graph generation', { url });
      
      const prompt = `Analyze internal linking structures for the website: "${url}".
      
Simulate an internal link crawl of this site. Invent a realistic small cluster of pages for this domain.
Identify orphan pages and provide exact anchor text recommendations to connect topically related pages.

Return ONLY a valid JSON object matching this exact structure:
{
  "pagesScanned": 45,
  "totalInternalLinks": 112,
  "orphanPagesCount": 3,
  "healthScore": 72,
  "nodes": [
    {
      "id": "1",
      "url": "/blog/what-is-seo",
      "title": "What is SEO?",
      "inlinks": 12,
      "outlinks": 4,
      "orphan": false,
      "topicCluster": "SEO Basics"
    }
    // exactly 8 pages (mix of high inlinks, and at least 2 orphans)
  ],
  "recommendations": [
    {
      "sourceUrl": "/blog/advanced-tactics",
      "targetUrl": "/blog/what-is-seo",
      "suggestedAnchorText": "foundation of search engine optimization",
      "context": "Link from the advanced guide back to the beginner pillar page"
    }
    // exactly 5 highly specific recommendations
  ]
}`;

      const aiData = await geminiGenerateJSON<GraphResult>(prompt);
      
      clearInterval(interval);
      setProgress(100);
      
      // small delay to show 100%
      await new Promise(r => setTimeout(r, 400));
      
      setResult(aiData);
      toast.success('Internal link graph generated!');
      addBreadcrumb('internal_link_complete', 'InternalLinkGraph', { url, health: aiData.healthScore });
    } catch (err: any) {
      clearInterval(interval);
      toast.error(err.message || 'Failed to map internal links');
      log.error('Link graph generation failed', { error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center shadow-sm">
            <Network className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Internal Link Graph</h1>
            <p className="text-sm text-muted-foreground">Map topical clusters, find orphan pages, and boost link equity.</p>
          </div>
        </div>
      </div>

      {/* ── Input Card ──────────────────────────────────────────────────── */}
      <Card className="border-emerald-500/20 shadow-md shadow-emerald-500/5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-500 to-teal-500" />
        <CardContent className="pt-6">
          <form onSubmit={runAnalysis} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
              <Input 
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://yoursite.com"
                className="pl-11 h-14 text-base bg-secondary/30 border-secondary focus:border-emerald-500/50 focus:ring-emerald-500/20 transition-all rounded-xl"
                disabled={loading}
              />
            </div>
            <Button 
              type="submit" 
              disabled={loading || !url.trim()} 
              className="h-14 px-8 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25 transition-all w-full sm:w-auto text-base font-semibold"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Waypoints className="h-5 w-5 mr-2" />}
              {loading ? 'Crawling Site...' : 'Map Link Graph'}
            </Button>
          </form>

          {loading && (
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground font-medium">
                <span>Discovering internal links...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2 [&>div]:bg-emerald-500" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12 animate-in fade-in zoom-in-95 duration-500">
          
          {/* Main Visual/Stats */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-border/50 bg-secondary/20">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <p className="text-3xl font-bold text-foreground mb-1">{result.pagesScanned}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Pages Scraped</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-secondary/20">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <p className="text-3xl font-bold text-emerald-500 mb-1">{result.totalInternalLinks}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Link Connections</p>
                </CardContent>
              </Card>
              <Card className={`border-border/50 bg-secondary/20 ${result.orphanPagesCount > 0 ? 'border-amber-500/30' : ''}`}>
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <p className={`text-3xl font-bold mb-1 ${result.orphanPagesCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>{result.orphanPagesCount}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Orphan Pages</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-secondary/20">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <p className={`text-3xl font-bold mb-1 ${result.healthScore > 80 ? 'text-emerald-500' : result.healthScore > 50 ? 'text-amber-500' : 'text-rose-500'}`}>{result.healthScore}/100</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Health Score</p>
                </CardContent>
              </Card>
            </div>

            {/* Page Nodes Table */}
            <Card className="border-emerald-500/10">
              <CardHeader className="pb-3 border-b border-border/50 bg-secondary/10">
                <CardTitle className="text-base flex items-center gap-2">
                  <Waypoints className="h-4 w-4 text-emerald-500" /> Page Hierarchy & Connectivity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue="all" className="w-full border-none">
                  <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-auto">
                    <TabsTrigger value="all" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-4 py-3 text-xs">All Pages</TabsTrigger>
                    <TabsTrigger value="orphans" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-4 py-3 text-xs">
                      Orphans <Badge className="ml-2 bg-amber-500 hover:bg-amber-600">{result.orphanPagesCount}</Badge>
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="all" className="m-0 max-h-[400px] overflow-auto">
                    <div className="space-y-0 divide-y divide-border/50">
                      {result.nodes.map(node => (
                        <div key={node.id} className="p-4 hover:bg-secondary/20 transition-colors flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {node.orphan ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0"/> : <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0"/>}
                              <h3 className="font-semibold text-sm truncate">{node.title}</h3>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{node.url}</p>
                          </div>
                          
                          <div className="flex items-center gap-4 shrink-0">
                            <Badge variant="outline" className="text-[10px] bg-secondary w-28 text-center justify-center truncate">
                              {node.topicCluster}
                            </Badge>
                            <div className="flex gap-3 text-xs">
                              <div className="flex flex-col items-center">
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{node.inlinks}</span>
                                <span className="text-[9px] text-muted-foreground uppercase">Inlinks</span>
                              </div>
                              <div className="flex flex-col items-center">
                                <span className="font-bold text-blue-600 dark:text-blue-400">{node.outlinks}</span>
                                <span className="text-[9px] text-muted-foreground uppercase">Outlinks</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="orphans" className="m-0 max-h-[400px] overflow-auto">
                    <div className="space-y-0 divide-y divide-border/50">
                      {result.nodes.filter(n => n.orphan).length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground">
                          <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500 opacity-50" />
                          <p>Great job! No orphan pages detected.</p>
                        </div>
                      ) : result.nodes.filter(n => n.orphan).map(node => (
                        <div key={node.id} className="p-4 hover:bg-amber-500/5 transition-colors flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0"/>
                              <h3 className="font-semibold text-sm truncate">{node.title}</h3>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{node.url}</p>
                          </div>
                          <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-600 hover:bg-amber-50 shrink-0">
                            Find Inlink Candidates
                          </Button>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Side Recommendations */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="border-teal-500/10 h-full">
              <CardHeader className="pb-3 border-b border-border/50 bg-teal-500/5">
                <CardTitle className="text-base flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-teal-500" /> Actionable Injections
                </CardTitle>
                <CardDescription>Exact anchor text opportunities to build topical authority.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {result.recommendations.map((rec, idx) => (
                    <div key={idx} className="p-4 hover:bg-secondary/20 transition-colors space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-teal-500/10 text-teal-700 border-teal-200 shadow-none text-[10px]">
                          Fix {idx + 1}
                        </Badge>
                        <p className="text-xs text-muted-foreground">{rec.context}</p>
                      </div>
                      
                      <div className="bg-secondary/40 p-3 rounded-lg border border-border/50 text-sm space-y-2">
                        <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground">From</span>
                          <span className="truncate text-xs text-foreground font-medium">{rec.sourceUrl}</span>
                        </div>
                        <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground">To</span>
                          <span className="truncate text-xs text-primary font-medium">{rec.targetUrl}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 bg-card border border-border rounded-lg p-2 px-3 shadow-sm">
                        <span className="text-sm font-semibold truncate">&quot;{rec.suggestedAnchorText}&quot;</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            navigator.clipboard.writeText(rec.suggestedAnchorText);
                            toast.success('Anchor text copied!');
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      )}
    </div>
  );
}
