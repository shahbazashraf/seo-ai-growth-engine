import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Zap, Play, Loader2, CheckCircle2, Clock, Copy,
  Download, ToggleLeft, ToggleRight, Calendar,
  FileText, Hash, ChevronDown, ChevronUp, RefreshCcw, Shield
} from 'lucide-react';
import { localDB } from '@/lib/local-db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import toast from 'react-hot-toast';
import { geminiGenerateJSON, generateAIImageUrl } from '@/lib/ai';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { createLogger, addBreadcrumb } from '@/lib/logger';
import { createScheduledJob } from '@/lib/scheduler';

const log = createLogger('AutomationEngine');

interface GeneratedContent {
  title: string;
  metaDescription: string;
  keywords: string[];
  content: string;
  wordCount: number;
  imagePrompt?: string;
}

interface ContentRecord {
  id: string;
  siteUrl: string;
  title: string;
  content: string;
  keywords: string;
  metaDescription: string;
  wordCount: number;
  createdAt: string;
}

interface AutomationSetting {
  id?: string;
  enabled: string | number;
  frequency: string;
  lastRun: string | null;
  nextRun: string | null;
}

const PIPELINE_STEPS = [
  'Analyzing site niche...',
  'Finding keyword gaps...',
  'Writing SEO blog post...',
  'Calculating word count...',
  'Saving to library...',
  'Done!',
];

function calcNextRun(frequency: string): string {
  const d = new Date();
  if (frequency === 'daily') d.setDate(d.getDate() + 1);
  else if (frequency === 'biweekly') d.setDate(d.getDate() + 14);
  else d.setDate(d.getDate() + 7);
  return d.toISOString();
}

export const AutomationEngine = () => {
  const queryClient = useQueryClient();

  const [siteUrl, setSiteUrl] = useState('');
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<GeneratedContent | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [autoDistribute, setAutoDistribute] = useState(false);
  const [distPlatforms, setDistPlatforms] = useState<Record<string, boolean>>({});
  const [lastDistributed, setLastDistributed] = useState<string | null>(null);

  const DIST_PLATFORMS = [
    { id: 'devto', name: 'Dev.to', emoji: '🟣' },
    { id: 'medium', name: 'Medium', emoji: '✍️' },
    { id: 'hashnode', name: 'Hashnode', emoji: '🔷' },
    { id: 'twitter', name: 'Twitter/X', emoji: '🐦' },
    { id: 'linkedin', name: 'LinkedIn', emoji: '💼' },
  ];

  const handleAutoDistribute = (val: boolean) => {
    setAutoDistribute(val);
    toast.success(val ? 'Auto-distribute enabled' : 'Auto-distribute disabled');
  };

  // ── Load settings ──────────────────────────────────────────────
  const { data: settings, isLoading: settingsLoading } = useQuery<AutomationSetting | null>({
    queryKey: ['automation-settings'],
    queryFn: async () => {
      const rows = await localDB.table<AutomationSetting>('automation_settings').list({ limit: 1 });
      return rows[0] ?? null;
    },
  });

  // ── Load content history ────────────────────────────────────────
  const { data: history = [], refetch: refetchHistory } = useQuery<ContentRecord[]>({
    queryKey: ['generated-content'],
    queryFn: async () => {
      return await localDB.table<ContentRecord>('generated_content').list({
        orderBy: { createdAt: 'desc' },
        limit: 10,
      });
    },
  });

  // ── Upsert settings ─────────────────────────────────────────────
  const saveSettings = useMutation({
    mutationFn: async (patch: Partial<AutomationSetting>) => {
      if (settings?.id) {
        return localDB.table('automation_settings').update(settings.id, patch);
      }
      return localDB.table('automation_settings').create({
        enabled: '0',
        frequency: 'weekly',
        lastRun: null,
        nextRun: null,
        ...patch,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-settings'] });
    },
  });

  const isEnabled = settings?.enabled === '1' || settings?.enabled === 1;

  const handleToggle = (val: boolean) => {
    saveSettings.mutate({ enabled: val ? '1' : '0' });
    toast.success(val ? 'Automation engine enabled' : 'Automation engine paused');
  };

  const handleFrequency = (freq: string) => {
    saveSettings.mutate({ frequency: freq, nextRun: calcNextRun(freq) });
    toast.success('Schedule updated');
  };

  // ── Run Now ─────────────────────────────────────────────────────
  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteUrl.trim()) { toast.error('Enter a site URL first'); return; }

    setRunning(true);
    setResult(null);
    setPipelineStep(0);
    addBreadcrumb('automation_run', 'AutomationEngine', { siteUrl: siteUrl.trim() });

    const stepMs = [800, 1000, 2000, 400, 500, 300];
    let idx = 0;
    const advance = () => {
      if (idx < PIPELINE_STEPS.length - 1) { idx++; setPipelineStep(idx); }
    };
    let elapsed = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < PIPELINE_STEPS.length - 1; i++) {
      elapsed += stepMs[i - 1];
      timers.push(setTimeout(advance, elapsed));
    }

    try {
      let targetUrl = siteUrl.trim();
      if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

      // Call Gemini directly from the browser
      const data = await geminiGenerateJSON<GeneratedContent>(
        `You are an expert SEO content strategist. Based on this website URL: ${targetUrl}\n\nGenerate a high-quality, SEO-optimized blog post that would attract organic traffic to this site.\n\nRequirements:\n- Title: Compelling, SEO-optimized, includes a primary keyword\n- Meta description: 140-155 characters, includes call to action\n- Keywords: 5-7 relevant SEO keywords\n- Content: Full blog post in Markdown, minimum 1000 words, with proper H2/H3 structure, introduction, body sections, and conclusion. Include at least 2 relevant sub-headings.\n- Image Prompt: Provide a highly descriptive AI image prompt for a hero image related to this topic.\n- Word count: Count actual words in the content field.\n\nRespond STRICTLY with a JSON object with these properties: "title" (string), "metaDescription" (string), "keywords" (array of strings), "content" (string), "imagePrompt" (string), and "wordCount" (number).`
      );

      timers.forEach(clearTimeout);
      setPipelineStep(PIPELINE_STEPS.length - 1);

      // Calculate actual word count
      const actualWordCount = data.content
        ? data.content.replace(/[#*`\[\]]/g, '').split(/\s+/).filter((w: string) => w.length > 0).length
        : data.wordCount || 0;

      const heroUrl = generateAIImageUrl(data.imagePrompt || data.title, 1200, 630);
      const contentWithImage = `\n\n![${data.title}](${heroUrl})\n\n${data.content}`;
      const resultData = { ...data, content: contentWithImage, wordCount: actualWordCount };
      setResult(resultData);

      // Save to DB
      try {
        await localDB.table('generated_content').create({
          siteUrl: targetUrl,
          title: data.title,
          content: data.content,
          keywords: JSON.stringify(data.keywords || []),
          metaDescription: data.metaDescription,
          wordCount: actualWordCount,
          createdAt: new Date().toISOString(),
        });

        await localDB.table('content_lab').create({
          title: data.title,
          content: data.content,
          metaDescription: data.metaDescription,
          keywords: JSON.stringify(data.keywords || []),
          imageUrls: '[]',
          status: 'draft',
          platformsPublished: '{}',
          wordCount: actualWordCount,
          userId: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (dbErr) {
        console.error('DB save error:', dbErr);
      }

      await refetchHistory();

      // Auto-distribute if enabled
      if (autoDistribute) {
        const activePlatforms = Object.entries(distPlatforms)
          .filter(([, v]) => v)
          .map(([k]) => k);
        if (activePlatforms.length > 0) {
          setLastDistributed(activePlatforms.join(', '));
          toast.success(`Auto-distributing to: ${activePlatforms.join(', ')}`);
          activePlatforms.forEach(p => {
            if (p === 'twitter') {
              window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(data.title)}`, '_blank');
            } else if (p === 'linkedin') {
              window.open(`https://www.linkedin.com/sharing/share-offsite/?url=https://example.com`, '_blank');
            }
          });
        }
      }

      // Persist last/next run
      const now = new Date().toISOString();
      const freq = settings?.frequency ?? 'weekly';
      await saveSettings.mutateAsync({ lastRun: now, nextRun: calcNextRun(freq) });

      toast.success('Content generated successfully!');
      addBreadcrumb('automation_success', 'AutomationEngine', { title: data.title, wordCount: actualWordCount });
      log.info('Content generated', { title: data.title, wordCount: actualWordCount, siteUrl: targetUrl });
    } catch (err: any) {
      timers.forEach(clearTimeout);
      setPipelineStep(-1);
      toast.error(err.message || 'Generation failed');
    } finally {
      setRunning(false);
    }
  };

  const copyContent = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.content);
    toast.success('Content copied to clipboard!');
  };

  const exportMarkdown = () => {
    if (!result) return;
    const md = `# ${result.title}\n\n> ${result.metaDescription}\n\n**Keywords:** ${result.keywords.join(', ')}\n\n---\n\n${result.content}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${result.title.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    toast.success('Markdown file downloaded!');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            Autonomous SEO Engine
            <Badge className={`border-none ${isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-muted-foreground'}`}>
              {isEnabled ? 'ACTIVE' : 'PAUSED'}
            </Badge>
          </h2>
          <p className="text-muted-foreground mt-1">Generate SEO blog posts and run on a schedule.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Settings */}
        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Engine Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between p-3 bg-secondary/40 rounded-lg">
              <div>
                <p className="font-medium text-sm">Engine Status</p>
                <p className="text-xs text-muted-foreground">{isEnabled ? 'Running on schedule' : 'Manual mode only'}</p>
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={handleToggle}
                disabled={saveSettings.isPending || settingsLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Frequency</label>
              <Select
                value={settings?.frequency ?? 'weekly'}
                onValueChange={handleFrequency}
                disabled={!isEnabled}
              >
                <SelectTrigger className="bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Auto-Distribute Section */}
            <div className="flex items-center justify-between p-3 bg-secondary/40 rounded-lg">
              <div>
                <p className="font-medium text-sm">Auto-Distribute</p>
                <p className="text-xs text-muted-foreground">Publish content after generation</p>
              </div>
              <Switch
                checked={autoDistribute}
                onCheckedChange={handleAutoDistribute}
                disabled={!isEnabled}
              />
            </div>

            {autoDistribute && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Distribution Platforms</label>
                <div className="space-y-2">
                  {DIST_PLATFORMS.map(p => (
                    <label key={p.id} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={!!distPlatforms[p.id]}
                        onChange={e => setDistPlatforms(prev => ({ ...prev, [p.id]: e.target.checked }))}
                        className="rounded border-border"
                      />
                      <span className="text-sm">{p.emoji} {p.name}</span>
                    </label>
                  ))}
                </div>
                {lastDistributed && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last distributed to: {lastDistributed}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Last Run</span>
                <span className="font-medium">
                  {settings?.lastRun ? new Date(settings.lastRun).toLocaleDateString() : 'Never'}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Next Run</span>
                <span className="font-medium">
                  {settings?.nextRun ? new Date(settings.nextRun).toLocaleDateString() : '—'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Run Form */}
        <Card className="lg:col-span-2 border-primary/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Play className="h-4 w-4 text-primary" /> Generate Content Now
            </CardTitle>
            <CardDescription>Enter your site URL and the AI will write a full SEO blog post for it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleRun} className="flex gap-3">
              <Input
                type="url"
                placeholder="https://yoursite.com"
                value={siteUrl}
                onChange={e => setSiteUrl(e.target.value)}
                disabled={running}
                required
                className="flex-1"
              />
              <Button type="submit" disabled={running} className="shadow-md shadow-primary/20 px-6">
                {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                {running ? 'Running...' : 'Run Now'}
              </Button>
            </form>

            {/* Pipeline */}
            {running && (
              <div className="space-y-3 p-4 bg-secondary/30 rounded-lg border border-primary/5">
                <p className="text-sm font-semibold text-primary">
                  {pipelineStep >= 0 ? PIPELINE_STEPS[pipelineStep] : ''}
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {PIPELINE_STEPS.map((s, i) => (
                    <div key={i} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-all ${
                      i < pipelineStep ? 'bg-primary/10 border-primary/20 text-primary' :
                      i === pipelineStep ? 'bg-primary text-primary-foreground border-primary' :
                      'bg-muted border-border text-muted-foreground'
                    }`}>
                      {i < pipelineStep && <CheckCircle2 className="h-3 w-3" />}
                      {i === pipelineStep && <Loader2 className="h-3 w-3 animate-spin" />}
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Result Preview */}
            {result && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-secondary/40 rounded-lg border border-primary/5">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><FileText className="h-3 w-3" /> Title</p>
                    <p className="text-sm font-semibold leading-snug line-clamp-2">{result.title}</p>
                  </div>
                  <div className="p-3 bg-secondary/40 rounded-lg border border-primary/5">
                    <p className="text-xs text-muted-foreground mb-1">Words</p>
                    <p className="text-2xl font-bold text-primary">{result.wordCount.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-secondary/40 rounded-lg border border-primary/5">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Hash className="h-3 w-3" /> Keywords</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.keywords.slice(0, 3).map((k, i) => (
                        <span key={i} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-secondary/20 rounded-lg border text-xs text-muted-foreground italic">
                  <span className="font-semibold text-foreground">Meta:</span> {result.metaDescription}
                </div>

                <div className="rounded-lg border overflow-hidden">
                  <div
                    className="flex items-center justify-between p-3 bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors"
                    onClick={() => setExpanded(!expanded)}
                  >
                    <span className="text-sm font-medium">Full Content Preview</span>
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                  {expanded && (
                    <ScrollArea className="h-[400px]">
                      <div className="p-6">
                        <MarkdownRenderer content={result.content} />
                      </div>
                    </ScrollArea>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={copyContent} className="flex-1">
                    <Copy className="h-4 w-4 mr-2" /> Copy Content
                  </Button>
                  <Button variant="outline" onClick={exportMarkdown} className="flex-1">
                    <Download className="h-4 w-4 mr-2" /> Export Markdown
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Content History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Content History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>No content generated yet. Run the engine above.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden sm:table-cell">Site</TableHead>
                    <TableHead>Words</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(row => (
                    <TableRow key={row.id} className="hover:bg-secondary/20 transition-colors">
                      <TableCell className="font-medium max-w-[200px] truncate">{row.title}</TableCell>
                      <TableCell className="hidden sm:table-cell max-w-[140px] truncate text-muted-foreground text-sm">
                        {row.siteUrl}
                      </TableCell>
                      <TableCell className="text-primary font-semibold">{Number(row.wordCount).toLocaleString()}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-none text-[10px]">
                          Saved
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
