import React, { useState } from 'react';
import {
  CheckCircle2, XCircle, Loader2, ExternalLink,
  Key, ChevronDown, ChevronUp
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blink } from '@/blink/client';
import toast from 'react-hot-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const DIST_URL = 'https://gbqxp58q--distribution-engine.functions.blink.new';

interface PlatformCredential {
  id: string;
  userId: string;
  platformName: string;
  credentials: string;
  connectedAt: string;
}

interface ContentLabRow {
  id: string;
  userId: string;
  title: string;
  content: string;
  metaDescription: string;
  keywords: string;
  imageUrls: string;
  status: 'draft' | 'published';
  platformsPublished: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PlatformDef {
  name: string;
  label: string;
  emoji: string;
  comingSoon?: boolean;
  configFields?: { key: string; label: string; placeholder: string }[];
}

const PLATFORMS: PlatformDef[] = [
  { name: 'devto', label: 'Dev.to', emoji: '👨‍💻', configFields: [{ key: 'tags', label: 'Tags', placeholder: 'javascript, react, webdev' }] },
  { name: 'medium', label: 'Medium', emoji: '📝' },
  { name: 'hashnode', label: 'Hashnode', emoji: '🔷' },
  { name: 'reddit', label: 'Reddit', emoji: '🤖', configFields: [{ key: 'subreddit', label: 'Subreddit', placeholder: 'r/programming' }] },
  { name: 'linkedin', label: 'LinkedIn', emoji: '💼', comingSoon: true },
  { name: 'twitter', label: 'Twitter / X', emoji: '🐦', comingSoon: true },
];

interface PublishResult {
  platform: string;
  success: boolean;
  url?: string;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean, ...args: unknown[]) => void;
  contentId: string | null;
  onPublished?: () => void;
}

export function DistributionDialog({ open, onOpenChange, contentId, onPublished }: Props) {
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [savingCred, setSavingCred] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<PublishResult[] | null>(null);
  const [publishing, setPublishing] = useState(false);

  const { data: credentials = [] } = useQuery<PlatformCredential[]>({
    queryKey: ['platform_credentials'],
    queryFn: () => blink.db.table<PlatformCredential>('platform_credentials').list({ orderBy: { connectedAt: 'desc' } }),
    enabled: open,
  });

  const credMap = credentials.reduce<Record<string, PlatformCredential>>((acc, c) => {
    acc[c.platformName] = c;
    return acc;
  }, {});

  const handleSaveCred = async (platformName: string) => {
    const key = apiKeyInputs[platformName]?.trim();
    if (!key) { toast.error('Enter an API key first'); return; }
    setSavingCred(p => ({ ...p, [platformName]: true }));
    try {
      const existing = credMap[platformName];
      if (existing) {
        await blink.db.table<PlatformCredential>('platform_credentials').update(existing.id, {
          credentials: JSON.stringify({ apiKey: key }),
        });
      } else {
        await blink.db.table<PlatformCredential>('platform_credentials').create({
          platformName,
          credentials: JSON.stringify({ apiKey: key }),
          connectedAt: new Date().toISOString(),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['platform_credentials'] });
      setApiKeyInputs(p => ({ ...p, [platformName]: '' }));
      toast.success(`${platformName} connected!`);
    } catch {
      toast.error('Failed to save credential');
    } finally {
      setSavingCred(p => ({ ...p, [platformName]: false }));
    }
  };

  const handlePublish = async () => {
    if (!contentId) return;
    const activePlatforms = PLATFORMS.filter(p => !p.comingSoon && selected[p.name]);
    if (!activePlatforms.length) { toast.error('Select at least one platform'); return; }

    setPublishing(true);
    setResults(null);
    try {
      const token = await blink.auth.getValidToken();
      const platformsPayload = activePlatforms.map(p => ({
        name: p.name,
        config: configs[p.name] || {},
        credentials: credMap[p.name] ? JSON.parse(credMap[p.name].credentials) : {},
      }));

      const res = await fetch(DIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contentId, platforms: platformsPayload }),
      });

      if (!res.ok) throw new Error(`Distribution failed: ${res.status}`);
      const data = await res.json();
      setResults(data.results ?? []);

      const publishedNames = (data.results as PublishResult[])
        .filter(r => r.success).map(r => r.platform);

      if (publishedNames.length > 0) {
        const existing = await blink.db.table<ContentLabRow>('content_lab').get(contentId);
        if (existing) {
          const prev = existing.platformsPublished ? JSON.parse(existing.platformsPublished) : {};
          const merged: Record<string, boolean> = { ...prev };
          publishedNames.forEach(n => { merged[n] = true; });
          await blink.db.table<ContentLabRow>('content_lab').update(contentId, {
            status: 'published',
            platformsPublished: JSON.stringify(merged),
            updatedAt: new Date().toISOString(),
          });
          queryClient.invalidateQueries({ queryKey: ['content_lab'] });
          onPublished?.();
        }
        toast.success(`Published to ${publishedNames.join(', ')}`);
      }

      const errors = (data.results as PublishResult[]).filter(r => !r.success);
      if (errors.length) toast.error(`Failed: ${errors.map(e => e.platform).join(', ')}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const resetAndClose = () => {
    setResults(null);
    setSelected({});
    setConfigs({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            🚀 Distribute Content
          </DialogTitle>
          <DialogDescription>
            Select platforms and publish your content in one click.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium text-foreground mb-4">Publish Results</p>
            {results.map(r => (
              <div key={r.platform} className={`flex items-center justify-between rounded-lg p-3 border ${r.success ? 'bg-primary/5 border-primary/20' : 'bg-destructive/5 border-destructive/20'}`}>
                <div className="flex items-center gap-3">
                  {r.success
                    ? <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    : <XCircle className="h-5 w-5 text-destructive shrink-0" />}
                  <span className="font-medium capitalize">{r.platform}</span>
                </div>
                {r.success && r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline">
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {!r.success && r.error && (
                  <span className="text-xs text-destructive truncate max-w-[200px]">{r.error}</span>
                )}
              </div>
            ))}
            <Button className="w-full mt-4" variant="outline" onClick={resetAndClose}>Done</Button>
          </div>
        ) : (
          <>
            <div className="space-y-3 py-2">
              {PLATFORMS.map(platform => {
                const isOn = !!selected[platform.name];
                const cred = credMap[platform.name];
                return (
                  <div key={platform.name} className={`rounded-xl border transition-all ${isOn && !platform.comingSoon ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'} ${platform.comingSoon ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{platform.emoji}</span>
                        <span className="font-medium">{platform.label}</span>
                        {platform.comingSoon && (
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">Coming Soon</Badge>
                        )}
                        {!platform.comingSoon && cred && (
                          <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                            Connected ✓
                          </Badge>
                        )}
                      </div>
                      <Switch
                        checked={isOn}
                        disabled={!!platform.comingSoon}
                        onCheckedChange={v => setSelected(p => ({ ...p, [platform.name]: v }))}
                      />
                    </div>

                    {isOn && !platform.comingSoon && (
                      <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                        {/* Credential section */}
                        {cred ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Key className="h-3 w-3" /> API key saved
                          </p>
                        ) : (
                          <div className="flex gap-2 items-center">
                            <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Input
                              type="password"
                              placeholder="Paste API key…"
                              value={apiKeyInputs[platform.name] ?? ''}
                              onChange={e => setApiKeyInputs(p => ({ ...p, [platform.name]: e.target.value }))}
                              className="h-8 text-sm flex-1"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 shrink-0"
                              disabled={savingCred[platform.name]}
                              onClick={() => handleSaveCred(platform.name)}
                            >
                              {savingCred[platform.name] ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                            </Button>
                          </div>
                        )}
                        {/* Config fields */}
                        {platform.configFields?.map(field => (
                          <div key={field.key} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{field.label}</Label>
                            <Input
                              placeholder={field.placeholder}
                              className="h-8 text-sm"
                              value={configs[platform.name]?.[field.key] ?? ''}
                              onChange={e => setConfigs(p => ({
                                ...p,
                                [platform.name]: { ...(p[platform.name] || {}), [field.key]: e.target.value }
                              }))}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose} disabled={publishing}>Cancel</Button>
              <Button
                onClick={handlePublish}
                disabled={publishing || !Object.values(selected).some(Boolean)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
              >
                {publishing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Publishing…</> : '🚀 Publish to Selected'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
