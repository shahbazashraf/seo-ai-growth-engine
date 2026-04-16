import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localDB } from '@/lib/local-db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Loader2, CheckCircle2, RefreshCcw, Sparkles, Calendar,
  Clock, Shield, Copy, Download, History, FileText
} from 'lucide-react';
import toast from 'react-hot-toast';

const AUTOMATION_URL = 'https://gbqxp58q--automation-run.functions.blink.new';

interface GeneratedContent {
  title: string;
  metaDescription: string;
  keywords: string[];
  content: string;
  wordCount: number;
}

const PIPELINE_STEPS = [
  'Analyzing site content...',
  'Identifying keyword gaps...',
  'Writing SEO blog post...',
  'Saving to library...',
  'Done!',
];

function calculateNextRun(frequency: string): Date {
  const next = new Date();
  if (frequency === 'daily') next.setDate(next.getDate() + 1);
  else if (frequency === 'biweekly') next.setDate(next.getDate() + 14);
  else next.setDate(next.getDate() + 7);
  return next;
}

export function AutomationSettings({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [siteUrl, setSiteUrl] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [generated, setGenerated] = useState<GeneratedContent | null>(null);

  // Load automation settings (single global record per user)
  const { data: settings, isLoading } = useQuery({
    queryKey: ['automation-settings'],
    queryFn: async () => {
      const rows = await localDB.table<any>('automation_settings').list({
        orderBy: { createdAt: 'asc' },
        limit: 1,
      });
      return rows[0] || null;
    },
  });

  // Content history
  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['generated-content-history'],
    queryFn: async () => {
      const rows = await localDB.table<any>('generated_content').list({
        orderBy: { createdAt: 'desc' },
        limit: 10,
      });
      return rows;
    },
  });

  const settingsMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      if (settings?.id) {
        return await localDB.table('automation_settings').update(settings.id, updates);
      }
      return await localDB.table('automation_settings').create({ ...updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-settings'] });
      queryClient.invalidateQueries({ queryKey: ['overview-automation'] });
    },
  });

  const handleToggle = (checked: boolean) => {
    settingsMutation.mutate({
      enabled: checked ? '1' : '0',
      ...(checked && { nextRun: calculateNextRun(settings?.frequency || 'weekly').toISOString() }),
    });
    toast.success(checked ? 'Automation engine activated' : 'Automation engine paused');
  };

  const handleFrequency = (value: string) => {
    settingsMutation.mutate({
      frequency: value,
      nextRun: calculateNextRun(value).toISOString(),
    });
    toast.success(`Frequency set to ${value}`);
  };

  const handleRunNow = async () => {
    if (!siteUrl.trim()) {
      toast.error('Enter a site URL to generate content for');
      return;
    }
    setIsRunning(true);
    setGenerated(null);
    setPipelineStep(0);

    // Animate pipeline steps with realistic timing
    const stepDelays = [1200, 3000, 6000, 10000];
    const timers: ReturnType<typeof setTimeout>[] = [];
    stepDelays.forEach((delay, i) => {
      timers.push(setTimeout(() => setPipelineStep(i + 1), delay));
    });

    try {
      const res = await fetch(AUTOMATION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl: siteUrl.trim() }),
      });

      timers.forEach(t => clearTimeout(t));

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Content generation failed');
      }

      const data: GeneratedContent = await res.json();
      setPipelineStep(4); // Done
      setGenerated(data);

      // Update last run time
      await settingsMutation.mutateAsync({
        lastRun: new Date().toISOString(),
        nextRun: calculateNextRun(settings?.frequency || 'weekly').toISOString(),
      });

      refetchHistory();
      toast.success(`Content generated: "${data.title}"`);
    } catch (err: any) {
      timers.forEach(t => clearTimeout(t));
      toast.error(err.message || 'Generation failed');
      setPipelineStep(-1);
    } finally {
      setIsRunning(false);
    }
  };

  const copyContent = () => {
    if (!generated) return;
    const text = `# ${generated.title}\n\n**Meta Description:** ${generated.metaDescription}\n\n**Keywords:** ${generated.keywords.join(', ')}\n\n---\n\n${generated.content}`;
    navigator.clipboard.writeText(text);
    toast.success('Content copied to clipboard');
  };

  const exportMarkdown = () => {
    if (!generated) return;
    const md = `---\ntitle: "${generated.title}"\ndescription: "${generated.metaDescription}"\nkeywords: [${generated.keywords.map(k => `"${k}"`).join(', ')}]\n---\n\n${generated.content}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${generated.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.md`;
    a.click();
    toast.success('Markdown file downloaded');
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const isEnabled = settings?.enabled === '1' || settings?.enabled === 1;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            Autonomous SEO Engine
            {isEnabled && <Badge className="bg-primary/10 text-primary border-none text-xs">ACTIVE</Badge>}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">AI generates and manages your SEO content automatically.</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-secondary/50 rounded-full border border-primary/10">
          <span className="text-sm font-medium">{isEnabled ? 'Engine Online' : 'Engine Offline'}</span>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            className="data-[state=checked]:bg-primary"
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Config + Run */}
        <div className="lg:col-span-2 space-y-6">
          {/* Configuration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Configuration</CardTitle>
              <CardDescription>Set frequency and target site for automated generation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-primary/5">
                <div>
                  <p className="font-medium text-sm">Publishing Frequency</p>
                  <p className="text-xs text-muted-foreground mt-0.5">How often to generate a new post</p>
                </div>
                <Select value={settings?.frequency || 'weekly'} onValueChange={handleFrequency}>
                  <SelectTrigger className="w-[160px] bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-secondary/30 rounded-xl border border-primary/5">
                  <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase mb-1">
                    <Calendar className="h-3.5 w-3.5" /> Next Run
                  </div>
                  <p className="font-bold text-lg">
                    {settings?.nextRun
                      ? new Date(settings.nextRun).toLocaleDateString()
                      : isEnabled ? calculateNextRun(settings?.frequency || 'weekly').toLocaleDateString() : 'Pending'}
                  </p>
                </div>
                <div className="p-4 bg-secondary/30 rounded-xl border border-primary/5">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase mb-1">
                    <Clock className="h-3.5 w-3.5" /> Last Run
                  </div>
                  <p className="font-bold text-lg">
                    {settings?.lastRun
                      ? new Date(settings.lastRun).toLocaleDateString()
                      : 'Never'}
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-secondary/10 border-t py-3">
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Shield className="h-3 w-3" /> E-E-A-T compliant content generation
              </p>
            </CardFooter>
          </Card>

          {/* Run Now */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Generate Content Now
              </CardTitle>
              <CardDescription>Enter a site URL to immediately generate SEO-optimized content.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Input
                  type="url"
                  placeholder="https://yourwebsite.com"
                  value={siteUrl}
                  onChange={e => setSiteUrl(e.target.value)}
                  disabled={isRunning}
                  className="flex-1"
                />
                <Button onClick={handleRunNow} disabled={isRunning} className="shrink-0">
                  {isRunning
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Running...</>
                    : <><RefreshCcw className="h-4 w-4 mr-2" />Run Now</>
                  }
                </Button>
              </div>

              {/* Pipeline steps */}
              {pipelineStep >= 0 && (
                <div className="space-y-2 p-4 bg-secondary/30 rounded-xl border border-primary/5">
                  {PIPELINE_STEPS.map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center border shrink-0 ${
                        i < pipelineStep ? 'bg-primary/10 border-primary text-primary' :
                        i === pipelineStep ? 'border-primary bg-primary/5' :
                        'border-muted bg-secondary'
                      }`}>
                        {i < pipelineStep
                          ? <CheckCircle2 className="h-3 w-3 text-primary" />
                          : i === pipelineStep
                          ? <Loader2 className="h-3 w-3 animate-spin text-primary" />
                          : <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />}
                      </div>
                      <span className={`text-sm ${i <= pipelineStep ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generated Content Preview */}
          {generated && (
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base leading-snug">{generated.title}</CardTitle>
                    <CardDescription className="mt-1 text-xs">{generated.metaDescription}</CardDescription>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-4">
                    <Button size="sm" variant="outline" onClick={copyContent}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
                    </Button>
                    <Button size="sm" variant="outline" onClick={exportMarkdown}>
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Export
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap mt-2">
                  <Badge variant="secondary" className="text-xs">{generated.wordCount} words</Badge>
                  {generated.keywords.slice(0, 5).map((kw, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-primary/5 border-primary/20 text-primary">{kw}</Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-72 overflow-y-auto p-4 bg-secondary/20 rounded-lg border border-primary/5 text-sm leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground">
                  {generated.content}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: History */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="h-4 w-4 text-primary" /> Content History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs">No content generated yet.</p>
                  <p className="text-xs mt-1 opacity-70">Run the engine above to get started.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((row: any) => (
                    <div key={row.id} className="p-3 bg-secondary/30 rounded-lg border border-primary/5 space-y-1">
                      <p className="font-medium text-sm leading-tight line-clamp-2">{row.title}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{row.wordCount || row.word_count || '—'} words</span>
                        <span>{new Date(row.createdAt || row.created_at).toLocaleDateString()}</span>
                      </div>
                      {row.siteUrl || row.site_url ? (
                        <p className="text-xs text-primary truncate">{row.siteUrl || row.site_url}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
