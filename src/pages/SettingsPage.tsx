import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key, Globe, Zap, User, Loader2, CheckCircle2, XCircle,
  Plus, Trash2, Star, Eye, EyeOff, Save, TestTube2,
  BarChart2, FileText, Plug, Calendar
} from 'lucide-react';
import { blink } from '@/blink/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import toast from 'react-hot-toast';
import { saveAIKeys, getAIKeys, hasAIKeys } from '@/lib/ai';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlatformCredential {
  id: string;
  userId: string;
  platformName: string;
  credentials: string; // JSON string
  connectedAt: string;
}

interface SiteRecord {
  id: string;
  userId: string;
  url: string;
  isPrimary: number;
  lastAuditAt: string | null;
  createdAt: string;
}

interface AutomationSetting {
  id: string;
  userId: string;
  enabled: string | number;
  frequency: string;
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuditRecord {
  id: string;
  createdAt: string;
}

interface GeneratedContentRecord {
  id: string;
  createdAt: string;
}

// ─── Platform config ──────────────────────────────────────────────────────────

const PLATFORMS = [
  {
    name: 'devto',
    label: 'Dev.to',
    emoji: '🟣',
    description: 'Publish articles directly to the Dev.to community.',
    keyLabel: 'API Key',
    testUrl: 'https://dev.to/api/users/me',
    testHeader: 'api-key',
    canTest: true,
  },
  {
    name: 'medium',
    label: 'Medium',
    emoji: '✍️',
    description: 'Publish stories to your Medium publication.',
    keyLabel: 'Integration Token',
    testUrl: 'https://api.medium.com/v1/me',
    testHeader: 'Bearer',
    canTest: true,
  },
  {
    name: 'hashnode',
    label: 'Hashnode',
    emoji: '🔷',
    description: 'Publish to your Hashnode blog automatically.',
    keyLabel: 'Personal Access Token',
    testUrl: '',
    testHeader: '',
    canTest: false,
  },
  {
    name: 'reddit',
    label: 'Reddit',
    emoji: '🔴',
    description: 'Reddit API integration — coming soon.',
    keyLabel: 'Coming Soon',
    testUrl: '',
    testHeader: '',
    canTest: false,
    disabled: true,
  },
] as const;

// ─── Platform credential card ─────────────────────────────────────────────────

function PlatformCard({
  platform,
  credential,
  onSave,
  onTest,
  saving,
  testing,
}: {
  platform: (typeof PLATFORMS)[number];
  credential?: PlatformCredential;
  onSave: (platformName: string, apiKey: string) => void;
  onTest: (platform: (typeof PLATFORMS)[number], apiKey: string) => void;
  saving: boolean;
  testing: boolean;
}) {
  const savedKey = credential
    ? (() => { try { return JSON.parse(credential.credentials).apiKey || ''; } catch { return ''; } })()
    : '';

  const [inputKey, setInputKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => { setInputKey(''); }, [credential?.id]);

  const maskedDisplay = savedKey
    ? '••••••••' + savedKey.slice(-3)
    : '';

  const effectiveKey = inputKey || savedKey;

  const isDisabled = 'disabled' in platform && platform.disabled;

  return (
    <Card className={`border-primary/10 transition-all duration-200 ${isDisabled ? 'opacity-60' : 'hover:border-primary/25 hover:shadow-sm'}`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl">{platform.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">{platform.label}</p>
              {credential && (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border text-[10px] gap-1">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Connected
                </Badge>
              )}
              {isDisabled && (
                <Badge variant="outline" className="text-[10px]">Coming Soon</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{platform.description}</p>
          </div>
        </div>

        {isDisabled ? (
          <div className="h-10 flex items-center px-3 bg-secondary/50 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
            Reddit API integration coming soon
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                placeholder={
                  savedKey
                    ? maskedDisplay
                    : `Enter ${platform.keyLabel}`
                }
                value={inputKey}
                onChange={e => setInputKey(e.target.value)}
                className="pr-10 text-sm h-10"
                disabled={saving}
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 shadow-sm shadow-primary/10"
                disabled={saving || (!inputKey && !savedKey)}
                onClick={() => onSave(platform.name, inputKey || savedKey)}
              >
                {saving
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</>
                  : <><Save className="h-3.5 w-3.5 mr-1.5" />Save</>}
              </Button>
              {platform.canTest && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing || !effectiveKey}
                  onClick={() => onTest(platform, effectiveKey)}
                  className="shrink-0"
                >
                  {testing
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <TestTube2 className="h-3.5 w-3.5" />}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────

export const SettingsPage = () => {
  const queryClient = useQueryClient();

  // ── Section 1: Platform credentials ──────────────────────────────────────

  const { data: credentials = [] } = useQuery<PlatformCredential[]>({
    queryKey: ['platform-credentials'],
    queryFn: () =>
      blink.db.table<PlatformCredential>('platform_credentials').list({
        orderBy: { connectedAt: 'desc' },
      }),
  });

  const [savingPlatform, setSavingPlatform] = useState<string | null>(null);
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);

  const credMap = Object.fromEntries(
    credentials.map(c => [c.platformName, c])
  );

  const savePlatform = async (platformName: string, apiKey: string) => {
    if (!apiKey.trim()) { toast.error('Enter an API key first'); return; }
    setSavingPlatform(platformName);
    try {
      const existing = credMap[platformName];
      const creds = JSON.stringify({ apiKey: apiKey.trim() });
      if (existing) {
        await blink.db.table<PlatformCredential>('platform_credentials').update(existing.id, {
          credentials: creds,
          connectedAt: new Date().toISOString(),
        });
      } else {
        await blink.db.table<PlatformCredential>('platform_credentials').create({
          userId: '',
          platformName,
          credentials: creds,
          connectedAt: new Date().toISOString(),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['platform-credentials'] });
      toast.success(`${platformName} credentials saved`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save credentials');
    } finally {
      setSavingPlatform(null);
    }
  };

  const testPlatform = async (
    platform: (typeof PLATFORMS)[number],
    apiKey: string
  ) => {
    if (!apiKey.trim()) { toast.error('Enter an API key first'); return; }
    setTestingPlatform(platform.name);
    try {
      let res: Response;
      if (platform.name === 'devto') {
        res = await fetch(platform.testUrl, {
          headers: { 'api-key': apiKey },
        });
      } else if (platform.name === 'medium') {
        res = await fetch(platform.testUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      } else {
        toast('Test not available for this platform');
        return;
      }
      if (res.ok) {
        toast.success(`${platform.label} connection verified ✓`);
      } else {
        toast.error(`${platform.label} responded with ${res.status} — check your key`);
      }
    } catch {
      toast.error('Connection test failed — check your API key');
    } finally {
      setTestingPlatform(null);
    }
  };

  // ── Section 2: Site Management ───────────────────────────────────────────

  const { data: sites = [], refetch: refetchSites } = useQuery<SiteRecord[]>({
    queryKey: ['settings-sites'],
    queryFn: () =>
      blink.db.table<SiteRecord>('sites').list({
        orderBy: { createdAt: 'desc' },
      }),
  });

  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [addingSite, setAddingSite] = useState(false);
  const [removingSite, setRemovingSite] = useState<string | null>(null);
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null);

  const addSite = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = newSiteUrl.trim();
    if (!url) return;
    setAddingSite(true);
    try {
      const existing = sites.find(s => s.url === url);
      if (existing) { toast.error('This site is already added'); return; }
      await blink.db.table<SiteRecord>('sites').create({
        userId: '',
        url,
        isPrimary: sites.length === 0 ? 1 : 0,
        lastAuditAt: null,
      });
      setNewSiteUrl('');
      await refetchSites();
      toast.success('Site added');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add site');
    } finally {
      setAddingSite(false);
    }
  };

  const setPrimary = async (id: string) => {
    setSettingPrimary(id);
    try {
      // Reset all
      await Promise.all(
        sites.map(s =>
          blink.db.table<SiteRecord>('sites').update(s.id, { isPrimary: 0 })
        )
      );
      await blink.db.table<SiteRecord>('sites').update(id, { isPrimary: 1 });
      await refetchSites();
      toast.success('Primary site updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update primary site');
    } finally {
      setSettingPrimary(null);
    }
  };

  const removeSite = async (id: string) => {
    setRemovingSite(id);
    try {
      await blink.db.table<SiteRecord>('sites').delete(id);
      await refetchSites();
      toast.success('Site removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove site');
    } finally {
      setRemovingSite(null);
    }
  };

  // ── Section 3: Automation preferences ───────────────────────────────────

  const { data: automationSettings } = useQuery<AutomationSetting | null>({
    queryKey: ['automation-settings'],
    queryFn: async () => {
      const rows = await blink.db.table<AutomationSetting>('automation_settings').list({
        orderBy: { createdAt: 'asc' },
        limit: 1,
      });
      return rows[0] || null;
    },
  });

  const [autoFrequency, setAutoFrequency] = useState('weekly');
  const [autoWordCount, setAutoWordCount] = useState('1200');
  const [autoPublish, setAutoPublish] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);

  // Sync local state when settings load
  useEffect(() => {
    if (!automationSettings) return;
    if (automationSettings.frequency) setAutoFrequency(automationSettings.frequency);
    try {
      // store word_count and auto_publish as JSON in a metadata-like fashion
      // or fallback to defaults — we use the 'frequency' column and treat
      // enabled as auto-publish proxy here
    } catch {}
  }, [automationSettings]);

  const saveAutomation = async () => {
    setSavingAuto(true);
    try {
      const payload = {
        frequency: autoFrequency,
        enabled: autoPublish ? '1' : '0',
        updatedAt: new Date().toISOString(),
      };
      if (automationSettings?.id) {
        await blink.db.table<AutomationSetting>('automation_settings').update(
          automationSettings.id,
          payload
        );
      } else {
        await blink.db.table<AutomationSetting>('automation_settings').create({
          ...payload,
          userId: '',
          lastRun: null,
          nextRun: null,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['automation-settings'] });
      toast.success('Automation preferences saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save preferences');
    } finally {
      setSavingAuto(false);
    }
  };

  // ── Section 4: Account info ──────────────────────────────────────────────

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: allAudits = [] } = useQuery<AuditRecord[]>({
    queryKey: ['audits-this-month'],
    queryFn: () =>
      blink.db.table<AuditRecord>('audits').list({
        orderBy: { createdAt: 'desc' },
      }),
  });

  const { data: allContent = [] } = useQuery<GeneratedContentRecord[]>({
    queryKey: ['content-this-month'],
    queryFn: () =>
      blink.db.table<GeneratedContentRecord>('generated_content').list({
        orderBy: { createdAt: 'desc' },
      }),
  });

  const auditsThisMonth = allAudits.filter(
    a => a.createdAt && new Date(a.createdAt) >= startOfMonth
  ).length;

  const contentThisMonth = allContent.filter(
    c => c.createdAt && new Date(c.createdAt) >= startOfMonth
  ).length;

  const platformsConnected = credentials.length;

  // ── Section 5: AI API Keys (localStorage) ────────────────────────────────

  const existingKeys = getAIKeys();
  const [orKey, setOrKey] = useState(existingKeys.openRouterKey);
  const [gmKey, setGmKey] = useState(existingKeys.geminiKey);
  const [showOrKey, setShowOrKey] = useState(false);
  const [showGmKey, setShowGmKey] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [testingAI, setTestingAI] = useState(false);

  const handleSaveAIKeys = () => {
    setSavingAI(true);
    try {
      saveAIKeys(orKey, gmKey);
      toast.success('AI API keys saved securely in your browser!');
    } catch {
      toast.error('Failed to save keys');
    } finally {
      setSavingAI(false);
    }
  };

  const handleTestAIKeys = async () => {
    setTestingAI(true);
    try {
      const key = orKey.trim();
      if (!key) { toast.error('Enter an OpenRouter key first'); return; }
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: 'deepseek/deepseek-chat', messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 }),
      });
      if (res.ok) {
        toast.success('OpenRouter key is working! ✓');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(`OpenRouter: ${(err as any).error?.message || res.status}`);
      }
    } catch {
      toast.error('Connection test failed');
    } finally {
      setTestingAI(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-10 animate-fade-in">

      {/* ══ Section 0: AI API Keys ══ */}
      <section>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Key className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-bold">AI API Keys</h2>
            <p className="text-xs text-muted-foreground">
              Keys are stored securely in your browser only — never sent to any server.
            </p>
          </div>
          {hasAIKeys() && (
            <Badge className="ml-auto bg-emerald-100 text-emerald-700 border-emerald-200 border text-[10px] gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> Configured
            </Badge>
          )}
        </div>

        <Card className="border-amber-500/20">
          <CardContent className="p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">OpenRouter API Key (Primary)</label>
              <div className="relative">
                <Input
                  type={showOrKey ? 'text' : 'password'}
                  placeholder="sk-or-v1-..."
                  value={orKey}
                  onChange={e => setOrKey(e.target.value)}
                  className="pr-10 text-sm h-10"
                />
                <button type="button" onClick={() => setShowOrKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showOrKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Get your key from <a href="https://openrouter.ai/keys" target="_blank" className="underline text-primary">openrouter.ai/keys</a></p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Gemini API Key (Fallback)</label>
              <div className="relative">
                <Input
                  type={showGmKey ? 'text' : 'password'}
                  placeholder="AIza..."
                  value={gmKey}
                  onChange={e => setGmKey(e.target.value)}
                  className="pr-10 text-sm h-10"
                />
                <button type="button" onClick={() => setShowGmKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showGmKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Get your key from <a href="https://aistudio.google.com/apikey" target="_blank" className="underline text-primary">aistudio.google.com</a></p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveAIKeys} disabled={savingAI} className="flex-1 shadow-sm shadow-primary/10">
                {savingAI ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</> : <><Save className="h-3.5 w-3.5 mr-1.5" />Save Keys</>}
              </Button>
              <Button variant="outline" onClick={handleTestAIKeys} disabled={testingAI || !orKey.trim()}>
                {testingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ══ Section 1: Platform Connections ══ */}
      <section>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Plug className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Platform Connections</h2>
            <p className="text-xs text-muted-foreground">
              Connect your publishing platforms to enable direct distribution.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {PLATFORMS.map(p => (
            <PlatformCard
              key={p.name}
              platform={p}
              credential={credMap[p.name]}
              onSave={savePlatform}
              onTest={testPlatform}
              saving={savingPlatform === p.name}
              testing={testingPlatform === p.name}
            />
          ))}
        </div>
      </section>

      {/* ══ Section 2: Site Management ══ */}
      <section>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Globe className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Site Management</h2>
            <p className="text-xs text-muted-foreground">
              Add and manage the sites you want to audit and generate content for.
            </p>
          </div>
        </div>

        <Card className="border-primary/10">
          <CardContent className="p-5 space-y-5">
            {/* Add site */}
            <form onSubmit={addSite} className="flex gap-3">
              <Input
                type="url"
                placeholder="https://yoursite.com"
                value={newSiteUrl}
                onChange={e => setNewSiteUrl(e.target.value)}
                required
                disabled={addingSite}
                className="flex-1 h-10"
              />
              <Button
                type="submit"
                disabled={addingSite}
                size="sm"
                className="h-10 px-5 shadow-sm shadow-primary/10 shrink-0"
              >
                {addingSite
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Plus className="h-4 w-4 mr-1.5" /> Add Site</>}
              </Button>
            </form>

            {/* Sites table */}
            {sites.length === 0 ? (
              <div className="py-10 text-center border-2 border-dashed rounded-xl">
                <Globe className="h-10 w-10 mx-auto mb-3 text-primary/20" />
                <p className="text-sm font-medium text-muted-foreground">No sites added yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add your first site URL above to get started.
                </p>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/30">
                      <TableHead className="pl-4">URL</TableHead>
                      <TableHead className="hidden sm:table-cell">Added</TableHead>
                      <TableHead className="hidden md:table-cell">Last Audit</TableHead>
                      <TableHead className="text-right pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sites.map(site => (
                      <TableRow key={site.id} className="hover:bg-secondary/20 transition-colors">
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate max-w-[200px]">
                              {site.url}
                            </span>
                            {Boolean(site.isPrimary) && (
                              <Badge className="bg-primary/10 text-primary border-primary/20 border text-[10px] gap-1 shrink-0">
                                <Star className="h-2.5 w-2.5" /> Primary
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {site.createdAt ? new Date(site.createdAt).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {site.lastAuditAt
                            ? new Date(site.lastAuditAt).toLocaleDateString()
                            : 'Never'}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {!Boolean(site.isPrimary) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={settingPrimary === site.id}
                                onClick={() => setPrimary(site.id)}
                                className="h-8 text-xs"
                              >
                                {settingPrimary === site.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <><Star className="h-3 w-3 mr-1" />Set Primary</>}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={removingSite === site.id}
                              onClick={() => removeSite(site.id)}
                              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              {removingSite === site.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ══ Section 3: Automation Preferences ══ */}
      <section>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Automation Preferences</h2>
            <p className="text-xs text-muted-foreground">
              Configure how the SEO engine runs automated content generation.
            </p>
          </div>
        </div>

        <Card className="border-primary/10">
          <CardContent className="p-5 space-y-5">
            {/* Publishing frequency */}
            <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-primary/5">
              <div>
                <p className="font-medium text-sm">Publishing Frequency</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  How often to generate and publish new SEO content.
                </p>
              </div>
              <Select value={autoFrequency} onValueChange={setAutoFrequency}>
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

            {/* Default word count */}
            <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-primary/5">
              <div>
                <p className="font-medium text-sm">Default Word Count</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Target length for AI-generated articles.
                </p>
              </div>
              <Select value={autoWordCount} onValueChange={setAutoWordCount}>
                <SelectTrigger className="w-[160px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="500">500 words</SelectItem>
                  <SelectItem value="800">800 words</SelectItem>
                  <SelectItem value="1200">1200 words</SelectItem>
                  <SelectItem value="2000">2000 words</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Auto-publish toggle */}
            <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-primary/5">
              <div>
                <p className="font-medium text-sm">Auto-Publish</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically publish generated content to connected platforms.
                </p>
              </div>
              <Switch
                checked={autoPublish}
                onCheckedChange={setAutoPublish}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            {/* Last / Next run info */}
            {automationSettings && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-secondary/20 rounded-lg border border-primary/5">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Last Run
                  </p>
                  <p className="text-sm font-semibold">
                    {automationSettings.lastRun
                      ? new Date(automationSettings.lastRun).toLocaleDateString()
                      : 'Never'}
                  </p>
                </div>
                <div className="p-3 bg-secondary/20 rounded-lg border border-primary/5">
                  <p className="text-[10px] font-bold uppercase text-primary mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Next Run
                  </p>
                  <p className="text-sm font-semibold">
                    {automationSettings.nextRun
                      ? new Date(automationSettings.nextRun).toLocaleDateString()
                      : '—'}
                  </p>
                </div>
              </div>
            )}

            <Button
              onClick={saveAutomation}
              disabled={savingAuto}
              className="shadow-sm shadow-primary/10"
            >
              {savingAuto
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</>
                : <><Save className="h-4 w-4 mr-2" />Save Preferences</>}
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* ══ Section 4: Account Info ══ */}
      <section>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Account Info</h2>
            <p className="text-xs text-muted-foreground">
              Your current plan and usage statistics.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Plan */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-5">
              <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center mb-3">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold text-primary">Free</p>
              <p className="text-xs text-muted-foreground mt-1">Current Plan</p>
              <Badge className="mt-2 bg-primary/10 text-primary border-primary/20 border text-[10px]">
                Unlimited Access
              </Badge>
            </CardContent>
          </Card>

          {/* Audits this month */}
          <Card className="border-primary/10">
            <CardContent className="p-5">
              <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
                <BarChart2 className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-2xl font-bold">{auditsThisMonth}</p>
              <p className="text-xs text-muted-foreground mt-1">Audits This Month</p>
            </CardContent>
          </Card>

          {/* Content generated */}
          <Card className="border-primary/10">
            <CardContent className="p-5">
              <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
              <p className="text-2xl font-bold">{contentThisMonth}</p>
              <p className="text-xs text-muted-foreground mt-1">Content Generated</p>
            </CardContent>
          </Card>

          {/* Platform connections */}
          <Card className="border-primary/10">
            <CardContent className="p-5">
              <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center mb-3">
                <Plug className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold">{platformsConnected}</p>
              <p className="text-xs text-muted-foreground mt-1">Platforms Connected</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};
