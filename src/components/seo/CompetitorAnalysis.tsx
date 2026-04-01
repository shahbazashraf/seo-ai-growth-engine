import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Target, BarChart3, Loader2, Link2, 
  FileText, TrendingUp, Sparkles, ChevronRight, 
  Zap, BrainCircuit, Globe, ArrowRight, Layers
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import toast from 'react-hot-toast';
import { geminiGenerateJSON } from '@/lib/ai';
import { createLogger, addBreadcrumb } from '@/lib/logger';

const log = createLogger('CompetitorAnalysis');

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetitorResult {
  keyword: string;
  searchIntent: 'informational' | 'navigational' | 'transactional' | 'commercial';
  searchVolumeEstimate: string;
  difficultyScore: number;
  averageWordCount: number;
  targetReadability: string;
  topCompetitors: Array<{
    rank: number;
    url: string;
    domainAuthority: number;
    wordCount: number;
    contentGaps: string[];
  }>;
  recommendedHeadings: Array<{ level: 'H2' | 'H3', text: string }>;
  nlpKeywords: Array<{ word: string, importance: number }>;
}

export function CompetitorAnalysis() {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompetitorResult | null>(null);

  const runAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    setLoading(true);
    setResult(null);
    addBreadcrumb('competitor_analysis_start', 'CompetitorAnalysis', { keyword });

    try {
      log.info('Starting competitor analysis', { keyword });
      
      const prompt = `Perform a deep SEO topic and competitor SERP analysis for the keyword: "${keyword}".
      
Analyze the current likely top-ranking pages on Google for this query. Provide realistic estimations of what is required to rank on page 1.

Return ONLY a valid JSON object matching this exact structure:
{
  "keyword": "${keyword}",
  "searchIntent": "informational", // strictly one of: informational, navigational, transactional, commercial
  "searchVolumeEstimate": "10k - 50k/mo",
  "difficultyScore": 65, // out of 100
  "averageWordCount": 2400,
  "targetReadability": "High School",
  "topCompetitors": [
    {
      "rank": 1,
      "url": "https://example.com/topic",
      "domainAuthority": 88,
      "wordCount": 3100,
      "contentGaps": ["Lacks video format", "Doesn't explain pricing clearly"]
    },
    // exactly 5 competitors
  ],
  "recommendedHeadings": [
    { "level": "H2", "text": "What is ${keyword}?" },
    // provide 6-8 structured headings
  ],
  "nlpKeywords": [
    { "word": "related term", "importance": 90 },
    // provide exactly 10 terms with importance (1-100)
  ]
}`;

      const aiData = await geminiGenerateJSON<CompetitorResult>(prompt);
      
      setResult(aiData);
      toast.success('Competitor intelligence gathered!');
      addBreadcrumb('competitor_analysis_complete', 'CompetitorAnalysis', { keyword });
    } catch (err: any) {
      toast.error(err.message || 'Failed to analyze competitors');
      log.error('Competitor analysis failed', { error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center shadow-sm">
            <Target className="h-5 w-5 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Competitor SERP Engine</h1>
            <p className="text-sm text-muted-foreground">Reverse-engineer page 1 of Google to find content gaps.</p>
          </div>
        </div>
      </div>

      {/* ── Input Card ──────────────────────────────────────────────────── */}
      <Card className="border-indigo-500/20 shadow-md shadow-indigo-500/5 relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-500" />
        <CardContent className="pt-6">
          <form onSubmit={runAnalysis} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
              <Input 
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="Enter a target keyword (e.g. 'best ai seo tools', 'how to rank fast')..."
                className="pl-11 h-14 text-base bg-secondary/30 border-secondary focus:border-indigo-500/50 focus:ring-indigo-500/20 transition-all rounded-xl"
                disabled={loading}
              />
            </div>
            <Button 
              type="submit" 
              disabled={loading || !keyword.trim()} 
              className="h-14 px-8 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/25 transition-all w-full sm:w-auto text-base font-semibold"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <BrainCircuit className="h-5 w-5 mr-2" />}
              {loading ? 'Analyzing SERP...' : 'Analyze Market'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12 animate-in fade-in zoom-in-95 duration-500">
          
          {/* Main Stats Column */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <div className="p-2 bg-blue-500/10 rounded-lg mb-2"><BarChart3 className="h-4 w-4 text-blue-500" /></div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Intent</p>
                  <p className="text-lg font-bold capitalize">{result.searchIntent}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <div className="p-2 bg-rose-500/10 rounded-lg mb-2"><TrendingUp className="h-4 w-4 text-rose-500" /></div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Difficulty</p>
                  <div className="flex items-center gap-2">
                    <p className={`text-lg font-bold ${result.difficultyScore > 70 ? 'text-rose-500' : result.difficultyScore > 40 ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {result.difficultyScore}/100
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <div className="p-2 bg-emerald-500/10 rounded-lg mb-2"><FileText className="h-4 w-4 text-emerald-500" /></div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Avg Words</p>
                  <p className="text-lg font-bold">{result.averageWordCount.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <div className="p-2 bg-amber-500/10 rounded-lg mb-2"><Globe className="h-4 w-4 text-amber-500" /></div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Volume Est.</p>
                  <p className="text-lg font-bold">{result.searchVolumeEstimate}</p>
                </CardContent>
              </Card>
            </div>

            {/* Top Competitors Table */}
            <Card className="border-indigo-500/10">
              <CardHeader className="pb-3 border-b border-border/50 bg-secondary/10">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-indigo-500" /> Competitor Landscape
                </CardTitle>
                <CardDescription>The profiles of pages currently ranking on page 1.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-secondary/30">
                    <TableRow>
                      <TableHead className="w-12 text-center">Rank</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead className="text-center">Domain Auth</TableHead>
                      <TableHead className="text-right">Words</TableHead>
                      <TableHead>Top Content Gap</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.topCompetitors.map((comp) => (
                      <TableRow key={comp.rank} className="hover:bg-indigo-500/5">
                        <TableCell className="text-center font-bold text-muted-foreground">#{comp.rank}</TableCell>
                        <TableCell className="font-medium text-sm truncate max-w-[200px]">
                          <a href={comp.url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-500 hover:underline flex items-center gap-1.5">
                            {new URL(comp.url).hostname} <ArrowRight className="h-3 w-3 opacity-50" />
                          </a>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`font-mono text-[10px] ${comp.domainAuthority > 80 ? 'bg-rose-500/10 text-rose-600 border-rose-200' : 'bg-secondary'}`}>
                            DR {comp.domainAuthority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm">{comp.wordCount.toLocaleString()}</TableCell>
                        <TableCell className="text-sm">
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold">
                            <Zap className="h-3 w-3" /> {comp.contentGaps[0]}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Structure Recommendations */}
            <Card className="border-purple-500/10 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <Layers className="h-40 w-40 text-purple-500" />
              </div>
              <CardHeader className="pb-3 border-b border-border/50 bg-secondary/10">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-purple-500" /> Winning Content Structure
                </CardTitle>
                <CardDescription>Recommended heading hierarchy to satisfy user intent and comprehensively cover the topic.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 relative z-10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-purple-500/10 text-purple-700 font-bold text-sm">
                    <Badge className="bg-purple-500 hover:bg-purple-600 text-[10px]">H1</Badge>
                    [Your Catchy Title About {result.keyword}]
                  </div>
                  {result.recommendedHeadings.map((heading, idx) => (
                    <div key={idx} className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-secondary/50 transition-colors" style={{ marginLeft: heading.level === 'H3' ? '24px' : '0' }}>
                      <Badge variant="outline" className={`text-[10px] ${heading.level === 'H2' ? 'border-primary/50 text-foreground' : 'border-muted text-muted-foreground'}`}>{heading.level}</Badge>
                      <span className={`text-sm ${heading.level === 'H2' ? 'font-semibold' : ''}`}>{heading.text}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* NLP Entities / Keywords */}
            <Card className="border-border/50">
              <CardHeader className="pb-3 bg-secondary/10 border-b border-border/50">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" /> Semantic NLP Entities
                </CardTitle>
                <CardDescription>Terms you absolutely must include to build topical authority.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {result.nlpKeywords.map((kw, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium text-foreground">{kw.word}</span>
                      <span className="text-xs text-muted-foreground">{kw.importance}% Rel.</span>
                    </div>
                    <Progress value={kw.importance} className={`h-1.5 ${kw.importance > 80 ? '[&>div]:bg-amber-500' : '&>div]:bg-primary'}`} />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Content Brief CTA */}
            <Card className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white border-none shadow-xl shadow-indigo-500/20">
              <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <Zap className="h-6 w-6 text-indigo-200" />
                </div>
                <h3 className="font-bold text-lg">Generate Full Brief</h3>
                <p className="text-indigo-100 text-sm opacity-90 leading-relaxed">
                  Turn these competitor insights into an actionable SEO brief for the Automation Engine.
                </p>
                <Button className="w-full bg-white text-indigo-600 hover:bg-indigo-50 font-bold shadow-md">
                  Send to Content Lab <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
            
          </div>
        </div>
      )}
    </div>
  );
}
