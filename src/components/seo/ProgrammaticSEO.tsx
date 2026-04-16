import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Zap, Copy, Database, Play, CheckCircle2,
  AlertTriangle, Settings, FileText, ChevronRight, Wand2, Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import toast from 'react-hot-toast';
import { geminiGenerateJSON } from '@/lib/ai';
import { createLogger, addBreadcrumb } from '@/lib/logger';
import { localDB } from '@/lib/local-db';

const log = createLogger('ProgrammaticSEO');

// ─── Types ────────────────────────────────────────────────────────────────────

interface BulkResult {
  title: string;
  metaDescription: string;
  content: string;
  wordCount: number;
}

export function ProgrammaticSEO() {
  const queryClient = useQueryClient();
  const [templatePrompt, setTemplatePrompt] = useState('Create a complete landing page for [Service] in [Location]. Focus on local SEO.');
  const [variablesInput, setVariablesInput] = useState('Plumber, New York\nElectrician, Chicago\nRoofing, Austin');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedJobs, setCompletedJobs] = useState<Array<{ params: string, status: 'success' | 'failed', title?: string, error?: string }>>([]);

  const parsedVariables = variablesInput.split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const runBulkGeneration = async () => {
    if (parsedVariables.length === 0) {
      toast.error('Add at least one set of variables');
      return;
    }
    if (!templatePrompt.includes('[') || !templatePrompt.includes(']')) {
      toast.error('Template must include variables in [brackets]');
      return;
    }

    setRunning(true);
    setProgress(0);
    setCompletedJobs([]);
    addBreadcrumb('programmatic_seo_start', 'ProgrammaticSEO', { count: parsedVariables.length });
    log.info('Starting programmatic multi-generation', { count: parsedVariables.length });

    let successCount = 0;
    
    // We process sequentially to avoid rate limits
    for (let i = 0; i < parsedVariables.length; i++) {
      const variableSet = parsedVariables[i];
      let currentPrompt = templatePrompt;
      
      // Basic substitution map (we split by comma and replace sequentially for simplicity, or we can just pass the whole string context to AI)
      const aiPrompt = `Here is a template prompt: "${templatePrompt}"\nApply these variables: ${variableSet}\n\nReturn ONLY a valid JSON object:
{
  "title": "Optimized Page Title",
  "metaDescription": "160 char max meta description",
  "content": "Full markdown content, minimum 800 words, highly optimized based on the template and variables",
  "wordCount": 850
}`;

      try {
        const data = await geminiGenerateJSON<BulkResult>(aiPrompt);
        
        // Save to DB
        await localDB.table('content_lab').create({
          userId: '',
          title: data.title,
          content: data.content,
          metaDescription: data.metaDescription,
          keywords: JSON.stringify(variableSet.split(',').map(s => s.trim())),
          imageUrls: '[]',
          status: 'draft',
          platformsPublished: '[]',
          wordCount: data.wordCount || data.content.split(' ').length,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        
        setCompletedJobs(prev => [...prev, { params: variableSet, status: 'success', title: data.title }]);
        successCount++;
        
      } catch (err: any) {
        setCompletedJobs(prev => [...prev, { params: variableSet, status: 'failed', error: err.message }]);
        log.error('Programmatic gen failed', { variables: variableSet, error: err.message });
      }
      
      setProgress(((i + 1) / parsedVariables.length) * 100);
      
      // Artificial delay to prevent API throttling
      if (i < parsedVariables.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setRunning(false);
    queryClient.invalidateQueries({ queryKey: ['content_lab'] });
    addBreadcrumb('programmatic_seo_end', 'ProgrammaticSEO', { successCount });
    if (successCount > 0) {
      toast.success(`Successfully generated ${successCount} pages!`);
    } else {
      toast.error('All generations failed. Check your prompt or API limits.');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-sky-500/20 border border-blue-500/30 flex items-center justify-center shadow-sm">
            <Database className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Programmatic SEO</h1>
            <p className="text-sm text-muted-foreground">Bulk generate variations of landing pages based on localized or categorical variables.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Input Configuration */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-blue-500/20 shadow-md">
            <CardHeader className="pb-3 border-b border-border/50 bg-secondary/10">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4 text-blue-500" /> Engine Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-5">
              
              <div className="space-y-2">
                <Label className="flex items-center justify-between">
                  <span>Template Prompt</span>
                  <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-none">Use [brackets] for variables</Badge>
                </Label>
                <Textarea 
                  className="min-h-[120px] resize-y font-mono text-sm bg-secondary/20"
                  value={templatePrompt}
                  onChange={e => setTemplatePrompt(e.target.value)}
                  disabled={running}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center justify-between">
                  <span>Variable Combinations</span>
                  <span className="text-xs text-muted-foreground">{parsedVariables.length} rows detected</span>
                </Label>
                <p className="text-[10px] text-muted-foreground mb-1 -mt-1">Enter one combination per line (comma separated)</p>
                <Textarea 
                  className="min-h-[150px] resize-y font-mono text-sm bg-secondary/20"
                  value={variablesInput}
                  onChange={e => setVariablesInput(e.target.value)}
                  disabled={running}
                />
              </div>

              <Button 
                onClick={runBulkGeneration}
                disabled={running || parsedVariables.length === 0}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-bold tracking-wide shadow-md shadow-blue-500/20"
              >
                {running ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Generating {parsedVariables.length} Pages...</>
                ) : (
                  <><Play className="h-5 w-5 mr-2 fill-current" /> Run Bulk Generation</>
                )}
              </Button>
            </CardContent>
          </Card>
          
          <div className="rounded-xl border border-border bg-amber-500/5 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <strong className="text-amber-700 dark:text-amber-500 block">Performance Notice</strong>
              <p>Bulk generation consumes significant AI quota. Processing is artificially delayed between entries to prevent rate limits.</p>
              <p>Generated content is saved directly to your <strong>Content Lab</strong> as drafts.</p>
            </div>
          </div>
        </div>

        {/* Real-time Processing Console */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="h-full border-slate-500/10 bg-slate-950 text-slate-300 overflow-hidden flex flex-col">
            <CardHeader className="pb-3 border-b border-white/10 bg-black/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-white">
                  <Zap className="h-4 w-4 text-sky-400" /> Output Console
                </CardTitle>
                {running && (
                  <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                    </span>
                    Processing
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 p-0 flex-1 flex flex-col">
              
              {/* Progress Bar */}
              {(running || progress > 0) && (
                <div className="px-5 py-4 bg-black/20 border-b border-white/5 space-y-2">
                  <div className="flex justify-between text-xs text-slate-400 font-mono">
                    <span>Batch Progress</span>
                    <span>{Math.round(progress)}% ({completedJobs.length}/{parsedVariables.length})</span>
                  </div>
                  <Progress value={progress} className="h-1.5 bg-slate-800 [&>div]:bg-sky-500" />
                </div>
              )}

              {/* Log Window */}
              <div className="flex-1 p-5 min-h-[300px] max-h-[500px] overflow-y-auto font-mono text-xs space-y-2">
                {completedJobs.length === 0 && !running && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3 pt-12">
                    <Wand2 className="h-8 w-8 opacity-20" />
                    <p>Ready to generate programmatic pages.</p>
                  </div>
                )}
                
                {completedJobs.map((job, idx) => (
                  <div key={idx} className="flex flex-col gap-1 py-1.5 border-b border-white/5 last:border-0 animate-in fade-in slide-in-from-left-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {job.status === 'success' 
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          : <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                        }
                        <span className="text-slate-200">Processing: <span className="text-sky-300">[{job.params}]</span></span>
                      </div>
                      <span className="text-[9px] text-slate-500">Job #{idx + 1}</span>
                    </div>
                    {job.status === 'success' && (
                      <div className="pl-5.5 ml-1.5 border-l-2 border-slate-800 py-1">
                        <span className="text-slate-400">↳ Saved to Content Lab:</span> <span className="text-slate-300 italic">"{job.title}"</span>
                      </div>
                    )}
                    {job.status === 'failed' && (
                      <div className="pl-5.5 ml-1.5 border-l-2 border-rose-900/50 py-1">
                        <span className="text-rose-400">↳ Error: {job.error}</span>
                      </div>
                    )}
                  </div>
                ))}
                
                {running && (
                  <div className="flex items-center gap-2 py-2 text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Awaiting next generation cycle...</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
