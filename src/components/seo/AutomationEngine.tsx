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
import { buildSeoActionQueue, type SeoAction } from '@/lib/seo-action-engine';
import { getPlatformStatuses } from '@/lib/platform-tokens';
import { apiUrl } from '@/lib/api-endpoints';

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
  canonicalUrl?: string | null;
  publishedUrl?: string | null;
  publishTargetType?: 'cms' | 'syndication' | 'social' | null;
  verificationStatus?: 'pending' | 'verified' | 'failed' | 'manual-review' | null;
  createdAt: string;
}

interface AutomationSetting {
  id?: string;
  enabled: string | number;
  frequency: string;
  lastRun: string | null;
  nextRun: string | null;
}

interface ActionResult {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
}

interface RunLog {
  id: string;
  runAt: string;
  actions: ActionResult[];
  totalPlatformsPosted: number;
  outreachGenerated: number;
  outreachSent: number;
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
  const [lastRunLog, setLastRunLog] = useState<RunLog | null>(null);

  const DIST_PLATFORMS = [
    { id: 'wordpress', name: 'WordPress', emoji: '📰' },
    { id: 'custom_webhook', name: 'Custom Webhook', emoji: '🪝' },
    { id: 'devto', name: 'Dev.to', emoji: '🟣' },
    { id: 'medium', name: 'Medium', emoji: '✍️' },
    { id: 'hashnode', name: 'Hashnode', emoji: '🔷' },
  ];

  const handleAutoDistribute = (val: boolean) => {
    setAutoDistribute(val);
    toast.success(val ? 'Own-site-first publishing enabled' : 'Own-site-first publishing disabled');
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

  const { data: persistedRunLog } = useQuery<RunLog | null>({
    queryKey: ['automation-last-run-log'],
    queryFn: async () => {
      const rows = await localDB.table<RunLog>('runLogs').list({ orderBy: { runAt: 'desc' }, limit: 1 });
      return rows[0] ?? null;
    },
  });

  const { data: nextActions = [] } = useQuery<SeoAction[]>({
    queryKey: ['automation-next-actions', siteUrl],
    queryFn: async () => {
      const [audits, keywords, content, backlinks, rankingRows, indexationRows, outreachRows] = await Promise.all([
        localDB.table<any>('audits').list({ orderBy: { createdAt: 'desc' }, limit: 10 }),
        localDB.table<any>('keywords').list({ orderBy: { createdAt: 'desc' }, limit: 20 }),
        localDB.table<any>('content_lab').list({ orderBy: { updatedAt: 'desc' }, limit: 20 }),
        localDB.table<any>('backlinks').list({ orderBy: { createdAt: 'desc' }, limit: 20 }),
        localDB.table<any>('rankingSnapshots').list({ orderBy: { snapshotDate: 'desc' }, limit: 50 }),
        localDB.table<any>('indexationRecords').list({ orderBy: { lastChecked: 'desc' }, limit: 50 }),
        localDB.table<any>('outreachRecords').list({ orderBy: { createdAt: 'desc' }, limit: 100 }),
      ]);

      const latestRankingByContent = new Map<string, any>();
      rankingRows.forEach((row: any) => {
        if (!latestRankingByContent.has(row.contentId)) latestRankingByContent.set(row.contentId, row);
      });
      const latestIndexationByContent = new Map<string, any>();
      indexationRows.forEach((row: any) => {
        if (!latestIndexationByContent.has(row.contentId)) latestIndexationByContent.set(row.contentId, row);
      });

      return buildSeoActionQueue({
        projectId: 'workspace-default',
        projectName: siteUrl || 'your site',
        siteUrl,
        audits,
        keywords,
        content: content.map((item: any) => ({
          ...item,
          publishedAt: item.publishedAt || item.createdAt,
          authorityScore: Number(item.authorityScore || 60),
          contentQualityScore: Number(item.contentQualityScore || (Number(item.wordCount || 0) > 1000 ? 70 : 48)),
          backlinkCount: Number(item.backlinkCount || 0),
        })),
        backlinks,
        ranking: Array.from(latestRankingByContent.values()).map((row: any) => ({
          contentId: row.contentId,
          url: row.url,
          avgPosition: Number(row.avgPosition || 0),
          decayDetected: Boolean(row.decayDetected),
        })),
        indexation: Array.from(latestIndexationByContent.values()).map((row: any) => ({
          contentId: row.contentId,
          url: row.url,
          status: row.status,
        })),
        outreach: outreachRows.map((row: any) => ({
          contentId: row.contentId,
          status: row.status,
          sentAt: row.sentAt,
        })),
      }).slice(0, 3);
    },
    enabled: !!siteUrl.trim(),
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
      const actionResults: ActionResult[] = [];
      let totalPlatformsPosted = 0;
      let outreachGenerated = 0;
      let outreachSent = 0;

      let targetUrl = siteUrl.trim();
      if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

      // Call Gemini directly from the browser
      const highestPriorityAction = nextActions[0];
      const data = await geminiGenerateJSON<GeneratedContent>(
        `You are an expert SEO content strategist. Based on this website URL: ${targetUrl}\n\nPriority SEO action: ${highestPriorityAction?.title || 'Create a new article for the site'}.\nReasoning: ${highestPriorityAction?.reasoning || 'Focus on the highest-leverage own-site SEO action first.'}\n\nGenerate a high-quality, SEO-optimized blog post or refresh draft that would attract organic traffic to this site.\n\nRequirements:\n- Title: Compelling, SEO-optimized, includes a primary keyword\n- Meta description: 140-155 characters, includes call to action\n- Keywords: 5-7 relevant SEO keywords\n- Content: Full blog post in Markdown, minimum 1000 words, with proper H2/H3 structure, introduction, body sections, and conclusion. Include at least 2 relevant sub-headings.\n- Image Prompt: Provide a highly descriptive AI image prompt for a hero image related to this topic.\n- Word count: Count actual words in the content field.\n\nRespond STRICTLY with a JSON object with these properties: "title" (string), "metaDescription" (string), "keywords" (array of strings), "content" (string), "imagePrompt" (string), and "wordCount" (number).`
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
      let createdContentId = '';
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

        const createdContent = await localDB.table<any>('content_lab').create({
          originSiteUrl: targetUrl,
          title: data.title,
          content: data.content,
          metaDescription: data.metaDescription,
          keywords: JSON.stringify(data.keywords || []),
          imageUrls: '[]',
          status: 'draft',
          platformsPublished: '{}',
          wordCount: actualWordCount,
          canonicalUrl: null,
          publishedUrl: null,
          distributionMode: 'canonical',
          publishTargetType: 'cms',
          syndicationPolicy: 'canonical-repost',
          verificationStatus: 'pending',
          publishSource: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        createdContentId = createdContent.id;
        actionResults.push({ step: 'content-generation', status: 'success', message: 'Generated and stored content draft.' });
      } catch (dbErr) {
        console.error('DB save error:', dbErr);
        actionResults.push({ step: 'content-generation', status: 'failed', message: 'Failed to store generated content.' });
      }

      await refetchHistory();

      // Auto-publish prep if enabled
      if (autoDistribute) {
        const activePlatforms = Object.entries(distPlatforms)
          .filter(([, v]) => v)
          .map(([k]) => k);
        if (activePlatforms.length > 0) {
          setLastDistributed(activePlatforms.join(', '));
          toast.success(`Prepared for automated publish targets: ${activePlatforms.join(', ')}`);
        }
      }

      if (createdContentId) {
        const syndicationPlatforms: Array<'medium' | 'devto' | 'hashnode'> = ['medium', 'devto', 'hashnode'];
        for (const platform of syndicationPlatforms) {
          try {
            const response = await fetch(apiUrl('/api/syndication-poster'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contentId: createdContentId,
                platform,
                mode: 'full-canonical',
              }),
            });
            const payload = await response.json().catch(() => ({}));
            if (response.ok && payload?.success) {
              totalPlatformsPosted += 1;
              actionResults.push({ step: `syndication-${platform}`, status: 'success', message: `Posted to ${platform}.` });
            } else {
              actionResults.push({ step: `syndication-${platform}`, status: 'failed', message: payload?.error || `Failed ${platform} syndication.` });
            }
          } catch (error) {
            actionResults.push({ step: `syndication-${platform}`, status: 'failed', message: error instanceof Error ? error.message : 'Syndication error.' });
          }
        }
      }

      try {
        const statuses = await getPlatformStatuses();
        const redditConnected = statuses.find((status) => status.platform === 'reddit')?.connected;
        if (redditConnected && createdContentId) {
          const redditResponse = await fetch(apiUrl('/api/reddit-poster'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contentId: createdContentId,
              subreddit: 'SEO',
              postType: 'link',
            }),
          });
          const redditPayload = await redditResponse.json().catch(() => ({}));
          if (redditResponse.ok && redditPayload?.success) {
            totalPlatformsPosted += 1;
            actionResults.push({ step: 'reddit-post', status: 'success', message: 'Posted to Reddit.' });
          } else {
            actionResults.push({ step: 'reddit-post', status: 'failed', message: redditPayload?.error || 'Reddit post failed.' });
          }
        } else {
          actionResults.push({ step: 'reddit-post', status: 'skipped', message: 'Reddit not connected.' });
        }
      } catch (error) {
        actionResults.push({ step: 'reddit-post', status: 'failed', message: error instanceof Error ? error.message : 'Reddit integration failed.' });
      }

      const highValueExisting = await localDB.table<any>('content_lab').list({ orderBy: { createdAt: 'desc' }, limit: 50 });
      const outreachCandidate = highValueExisting.find((row) => {
        const ageDays = (Date.now() - new Date(row.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        return ageDays >= 7 && Number(row.wordCount || 0) >= 1200 && row.canonicalUrl;
      });

      if (outreachCandidate) {
        try {
          const opportunities = await localDB.table<any>('backlink_opportunities').list({ orderBy: { createdAt: 'desc' }, limit: 1 });
          let targetSite = 'https://example.com/resources';
          if (opportunities[0]?.opportunityData) {
            try {
              const parsed = JSON.parse(opportunities[0].opportunityData);
              if (Array.isArray(parsed) && parsed[0]?.url) {
                targetSite = String(parsed[0].url);
              }
            } catch {
              // Ignore malformed opportunity payloads.
            }
          }
          const targetDomain = (() => {
            try { return new URL(targetSite).hostname; } catch { return 'example.com'; }
          })();
          const targetEmail = `editor@${targetDomain}`;

          const outreachResponse = await fetch(apiUrl('/api/outreach-generator/generate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contentId: outreachCandidate.id,
              targetSite,
              targetEmail,
              outreachType: 'resource-page',
            }),
          });
          const outreachPayload = await outreachResponse.json().catch(() => ({}));
          if (outreachResponse.ok && outreachPayload?.success) {
            outreachGenerated += 1;
            actionResults.push({ step: 'outreach-generation', status: 'success', message: 'Generated outreach draft.' });
          } else {
            actionResults.push({ step: 'outreach-generation', status: 'failed', message: outreachPayload?.error || 'Failed to generate outreach.' });
          }
        } catch (error) {
          actionResults.push({ step: 'outreach-generation', status: 'failed', message: error instanceof Error ? error.message : 'Outreach generation failed.' });
        }
      } else {
        actionResults.push({ step: 'outreach-generation', status: 'skipped', message: 'No 7+ day high-value page available for outreach.' });
      }

      // Persist last/next run
      const now = new Date().toISOString();
      const freq = settings?.frequency ?? 'weekly';
      await saveSettings.mutateAsync({ lastRun: now, nextRun: calcNextRun(freq) });

      const runLog = await localDB.table<RunLog>('runLogs').create({
        runAt: now,
        actions: actionResults,
        totalPlatformsPosted,
        outreachGenerated,
        outreachSent,
      });
      setLastRunLog(runLog);
      queryClient.invalidateQueries({ queryKey: ['automation-last-run-log'] });

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
            Guided SEO Engine
            <Badge className={`border-none ${isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-muted-foreground'}`}>
              {isEnabled ? 'ACTIVE' : 'PAUSED'}
            </Badge>
          </h2>
          <p className="text-muted-foreground mt-1">Choose the next best SEO action, create or refresh content, and prepare own-site publishing before syndication.</p>
        </div>
      </div>

      {(lastRunLog || persistedRunLog) && (
        <Card className="border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Last automation run</CardTitle>
            <CardDescription>
              {(lastRunLog || persistedRunLog)?.runAt ? new Date((lastRunLog || persistedRunLog)!.runAt).toLocaleString() : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">Platforms posted: <span className="font-semibold">{(lastRunLog || persistedRunLog)?.totalPlatformsPosted ?? 0}</span></div>
              <div className="rounded-lg border p-3">Outreach generated: <span className="font-semibold">{(lastRunLog || persistedRunLog)?.outreachGenerated ?? 0}</span></div>
              <div className="rounded-lg border p-3">Outreach sent: <span className="font-semibold">{(lastRunLog || persistedRunLog)?.outreachSent ?? 0}</span></div>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Run steps</p>
              <div className="space-y-1">
                {(lastRunLog || persistedRunLog)?.actions?.map((action, index) => (
                  <div key={`${action.step}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                    <span>{action.step}</span>
                    <Badge variant="outline" className="uppercase">{action.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                <p className="font-medium text-sm">Own-Site First Publish Prep</p>
                <p className="text-xs text-muted-foreground">Queue CMS or syndication connectors after draft generation</p>
              </div>
              <Switch
                checked={autoDistribute}
                onCheckedChange={handleAutoDistribute}
                disabled={!isEnabled}
              />
            </div>

            {autoDistribute && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Publish Targets</label>
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
                    Last prepared targets: {lastDistributed}
                  </p>
                )}
              </div>
            )}

            {nextActions.length > 0 && (
              <div className="space-y-2 rounded-lg border border-primary/10 bg-secondary/30 p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Best Next Actions</p>
                {nextActions.map(action => (
                  <div key={action.id} className="flex items-start justify-between gap-3 rounded-lg bg-background/80 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{action.title}</p>
                      <p className="text-xs text-muted-foreground">{action.summary}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase shrink-0">{action.source}</Badge>
                  </div>
                ))}
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
              <Play className="h-4 w-4 text-primary" /> Run Best SEO Action
            </CardTitle>
            <CardDescription>Enter your site URL and the AI will generate the next best own-site SEO draft or refresh candidate with workflow tracking.</CardDescription>
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
