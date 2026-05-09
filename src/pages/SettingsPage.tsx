import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart2,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Key,
  Link2,
  Loader2,
  Plug,
  Plus,
  Save,
  Star,
  TestTube2,
  Trash2,
  Unplug,
  User,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { localDB } from '@/lib/local-db';
import { saveAIKeys, getAIKeys, hasAIKeys } from '@/lib/ai';
import { getPlatformStatuses, revokePlatformToken, savePlatformToken } from '@/lib/platform-tokens';
import { redirectToApi } from '@/lib/api-endpoints';
import type { PlatformKey, PlatformStatus } from '@/types/platforms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';

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

type PlatformAuthType = 'token' | 'oauth';

interface PlatformDefinition {
  name: PlatformKey;
  label: string;
  description: string;
  authType: PlatformAuthType;
  tokenLabel?: string;
  oauthButtonLabel?: string;
  oauthPhase?: string;
}

const CONNECTED_PLATFORMS: PlatformDefinition[] = [
  { name: 'medium', label: 'Medium', description: 'Token based connection', authType: 'token', tokenLabel: 'Integration token' },
  { name: 'devto', label: 'Dev.to', description: 'Token based connection', authType: 'token', tokenLabel: 'API key' },
  { name: 'hashnode', label: 'Hashnode', description: 'Token based connection', authType: 'token', tokenLabel: 'Personal Access Token' },
  { name: 'github', label: 'GitHub', description: 'Token based connection', authType: 'token', tokenLabel: 'Personal Access Token' },
  { name: 'reddit', label: 'Reddit', description: 'OAuth required', authType: 'oauth', oauthButtonLabel: 'Connect with Reddit', oauthPhase: 'Phase 3' },
  {
    name: 'google-search-console',
    label: 'Google Search Console',
    description: 'OAuth required',
    authType: 'oauth',
    oauthButtonLabel: 'Connect with Google',
    oauthPhase: 'Phase 4',
  },
  { name: 'gmail', label: 'Gmail', description: 'OAuth required', authType: 'oauth', oauthButtonLabel: 'Connect with Google', oauthPhase: 'Phase 5' },
];

export const SettingsPage = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const { data: platformStatuses = [], isLoading: loadingPlatformStatuses, refetch: refetchPlatformStatuses } = useQuery<PlatformStatus[]>({
    queryKey: ['platform-token-statuses'],
    queryFn: async () => getPlatformStatuses(),
  });

  const platformStatusMap = useMemo(
    () => new Map(platformStatuses.map((status) => [status.platform, status])),
    [platformStatuses],
  );

  const [savingPlatform, setSavingPlatform] = useState<PlatformKey | null>(null);
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<PlatformKey | null>(null);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenModalPlatform, setTokenModalPlatform] = useState<PlatformDefinition | null>(null);
  const [tokenValue, setTokenValue] = useState('');
  const [tokenUsername, setTokenUsername] = useState('');
  const [quoraEmail, setQuoraEmail] = useState('');
  const [quoraPassword, setQuoraPassword] = useState('');
  const [savingQuora, setSavingQuora] = useState(false);

  const openTokenModal = (platform: PlatformDefinition) => {
    setTokenModalPlatform(platform);
    setTokenValue('');
    setTokenUsername('');
    setTokenModalOpen(true);
  };

  const handleSaveToken = async () => {
    if (!tokenModalPlatform || !tokenValue.trim()) {
      toast.error('Token is required');
      return;
    }

    setSavingPlatform(tokenModalPlatform.name);
    try {
      await savePlatformToken(tokenModalPlatform.name, {
        accessToken: tokenValue.trim(),
        username: tokenUsername.trim() || undefined,
      });
      await refetchPlatformStatuses();
      setTokenModalOpen(false);
      toast.success(`${tokenModalPlatform.label} connected`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect platform';
      toast.error(message);
    } finally {
      setSavingPlatform(null);
    }
  };

  const handleDisconnectPlatform = async (platform: PlatformDefinition) => {
    setDisconnectingPlatform(platform.name);
    try {
      await revokePlatformToken(platform.name);
      await refetchPlatformStatuses();
      toast.success(`${platform.label} disconnected`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to disconnect platform';
      toast.error(message);
    } finally {
      setDisconnectingPlatform(null);
    }
  };

  const handleOAuthConnect = (platform: PlatformDefinition) => {
    if (!session?.access_token) {
      toast.error('You must be logged in to connect platforms');
      return;
    }

    const tokenParam = `?access_token=${encodeURIComponent(session.access_token)}`;

    if (platform.name === 'reddit') {
      redirectToApi(`/reddit-oauth/start${tokenParam}`);
      return;
    }
    if (platform.name === 'google-search-console') {
      redirectToApi(`/gsc-oauth/start${tokenParam}`);
      return;
    }
    if (platform.name === 'gmail') {
      redirectToApi(`/gmail-oauth/start${tokenParam}`);
      return;
    }
    toast(`OAuth flow for ${platform.label} will be implemented in ${platform.oauthPhase}.`);
  };

  const saveQuoraCredentials = async () => {
    if (!quoraEmail.trim() || !quoraPassword.trim()) {
      toast.error('Enter both Quora email and password');
      return;
    }
    setSavingQuora(true);
    try {
      await savePlatformToken('quora', {
        accessToken: quoraEmail.trim(),
        refreshToken: quoraPassword.trim(),
        username: quoraEmail.trim(),
      });
      await refetchPlatformStatuses();
      setQuoraPassword('');
      toast.success('Quora credentials saved');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save Quora credentials';
      toast.error(message);
    } finally {
      setSavingQuora(false);
    }
  };

  const { data: sites = [], refetch: refetchSites } = useQuery<SiteRecord[]>({
    queryKey: ['settings-sites'],
    queryFn: () =>
      localDB.table<SiteRecord>('sites').list({
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
      const existing = sites.find((s) => s.url === url);
      if (existing) {
        toast.error('This site is already added');
        return;
      }
      await localDB.table<SiteRecord>('sites').create({
        userId: '',
        url,
        isPrimary: sites.length === 0 ? 1 : 0,
        lastAuditAt: null,
      });
      setNewSiteUrl('');
      await refetchSites();
      toast.success('Site added');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add site';
      toast.error(message);
    } finally {
      setAddingSite(false);
    }
  };

  const setPrimary = async (id: string) => {
    setSettingPrimary(id);
    try {
      await Promise.all(
        sites.map((s) =>
          localDB.table<SiteRecord>('sites').update(s.id, { isPrimary: 0 }),
        ),
      );
      await localDB.table<SiteRecord>('sites').update(id, { isPrimary: 1 });
      await refetchSites();
      toast.success('Primary site updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update primary site';
      toast.error(message);
    } finally {
      setSettingPrimary(null);
    }
  };

  const removeSite = async (id: string) => {
    setRemovingSite(id);
    try {
      await localDB.table<SiteRecord>('sites').delete(id);
      await refetchSites();
      toast.success('Site removed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove site';
      toast.error(message);
    } finally {
      setRemovingSite(null);
    }
  };

  const { data: automationSettings } = useQuery<AutomationSetting | null>({
    queryKey: ['automation-settings'],
    queryFn: async () => {
      const rows = await localDB.table<AutomationSetting>('automation_settings').list({
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

  useEffect(() => {
    if (!automationSettings) return;
    if (automationSettings.frequency) setAutoFrequency(automationSettings.frequency);
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
        await localDB.table<AutomationSetting>('automation_settings').update(automationSettings.id, payload);
      } else {
        await localDB.table<AutomationSetting>('automation_settings').create({
          ...payload,
          userId: '',
          lastRun: null,
          nextRun: null,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['automation-settings'] });
      toast.success('Automation preferences saved');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save preferences';
      toast.error(message);
    } finally {
      setSavingAuto(false);
    }
  };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: allAudits = [] } = useQuery<AuditRecord[]>({
    queryKey: ['audits-this-month'],
    queryFn: () =>
      localDB.table<AuditRecord>('audits').list({
        orderBy: { createdAt: 'desc' },
      }),
  });

  const { data: allContent = [] } = useQuery<GeneratedContentRecord[]>({
    queryKey: ['content-this-month'],
    queryFn: () =>
      localDB.table<GeneratedContentRecord>('generated_content').list({
        orderBy: { createdAt: 'desc' },
      }),
  });

  const auditsThisMonth = allAudits.filter(
    (a) => a.createdAt && new Date(a.createdAt) >= startOfMonth,
  ).length;
  const contentThisMonth = allContent.filter(
    (c) => c.createdAt && new Date(c.createdAt) >= startOfMonth,
  ).length;
  const platformsConnected = platformStatuses.filter((s) => s.connected).length;
  const quoraConnected = Boolean(platformStatusMap.get('quora')?.connected);

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
      if (!key) {
        toast.error('Enter an OpenRouter key first');
        return;
      }
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 5,
        }),
      });
      if (res.ok) {
        toast.success('OpenRouter key is working!');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(`OpenRouter: ${(err as { error?: { message?: string } }).error?.message || res.status}`);
      }
    } catch {
      toast.error('Connection test failed');
    } finally {
      setTestingAI(false);
    }
  };

  return (
    <div className="space-y-10 animate-fade-in">
      <section>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Key className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-bold">AI API Keys</h2>
            <p className="text-xs text-muted-foreground">Keys are stored in your browser only.</p>
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
                  onChange={(e) => setOrKey(e.target.value)}
                  className="pr-10 text-sm h-10"
                />
                <button type="button" onClick={() => setShowOrKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showOrKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Gemini API Key (Fallback)</label>
              <div className="relative">
                <Input
                  type={showGmKey ? 'text' : 'password'}
                  placeholder="AIza..."
                  value={gmKey}
                  onChange={(e) => setGmKey(e.target.value)}
                  className="pr-10 text-sm h-10"
                />
                <button type="button" onClick={() => setShowGmKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showGmKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveAIKeys} disabled={savingAI} className="flex-1 shadow-sm shadow-primary/10">
                {savingAI ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving...</> : <><Save className="h-3.5 w-3.5 mr-1.5" />Save Keys</>}
              </Button>
              <Button variant="outline" onClick={handleTestAIKeys} disabled={testingAI || !orKey.trim()}>
                {testingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Key className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Quora Credentials</h2>
            <p className="text-xs text-muted-foreground">Credentials are encrypted server-side and never shown in plaintext.</p>
          </div>
          {quoraConnected && (
            <Badge className="ml-auto bg-emerald-100 text-emerald-700 border-emerald-200 border text-[10px] gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> Credentials saved
            </Badge>
          )}
        </div>
        <Card className="border-primary/10">
          <CardContent className="p-5 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Quora Email</label>
              <Input
                type="email"
                value={quoraEmail}
                onChange={(e) => setQuoraEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Quora Password</label>
              <Input
                type="password"
                value={quoraPassword}
                onChange={(e) => setQuoraPassword(e.target.value)}
                placeholder="Password"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={saveQuoraCredentials} disabled={savingQuora}>
                {savingQuora ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : <><Save className="h-4 w-4 mr-1.5" />Save credentials</>}
              </Button>
              {quoraConnected && (
                <Button
                  variant="outline"
                  onClick={() => handleDisconnectPlatform({ name: 'quora', label: 'Quora', description: 'Credentials', authType: 'token' })}
                  disabled={disconnectingPlatform === 'quora'}
                >
                  {disconnectingPlatform === 'quora' ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Unplug className="h-4 w-4 mr-1.5" />}
                  Disconnect
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Link2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Connected Platforms</h2>
            <p className="text-xs text-muted-foreground">Tokens are stored server-side only and never returned in plaintext.</p>
          </div>
        </div>

        <Card className="border-primary/10">
          <CardContent className="p-0">
            {loadingPlatformStatuses ? (
              <div className="p-6 flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading connected platform status...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/30">
                    <TableHead className="pl-4">Platform</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead className="text-right pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {CONNECTED_PLATFORMS.map((platform) => {
                    const status = platformStatusMap.get(platform.name);
                    const connected = Boolean(status?.connected);
                    const username = status?.username;
                    const pending = savingPlatform === platform.name || disconnectingPlatform === platform.name;
                    return (
                      <TableRow key={platform.name} className="hover:bg-secondary/20 transition-colors">
                        <TableCell className="pl-4">
                          <div>
                            <p className="font-medium text-sm">{platform.label}</p>
                            <p className="text-xs text-muted-foreground">{platform.description}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {connected ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border text-[10px] gap-1">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Connected
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Disconnected</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {username || '-'}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          {connected ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pending}
                              onClick={() => handleDisconnectPlatform(platform)}
                              className="h-8"
                            >
                              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Unplug className="h-3.5 w-3.5 mr-1" />}
                              Disconnect
                            </Button>
                          ) : platform.authType === 'token' ? (
                            <Button
                              size="sm"
                              disabled={pending}
                              onClick={() => openTokenModal(platform)}
                              className="h-8"
                            >
                              <Plug className="h-3.5 w-3.5 mr-1" />
                              Connect
                            </Button>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <Badge variant="outline" className="text-[10px]">OAuth required</Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() => handleOAuthConnect(platform)}
                                className="h-8"
                              >
                                <Plug className="h-3.5 w-3.5 mr-1" />
                                {platform.oauthButtonLabel}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Globe className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Site Management</h2>
            <p className="text-xs text-muted-foreground">Add and manage the sites you want to audit and generate content for.</p>
          </div>
        </div>

        <Card className="border-primary/10">
          <CardContent className="p-5 space-y-5">
            <form onSubmit={addSite} className="flex gap-3">
              <Input
                type="url"
                placeholder="https://yoursite.com"
                value={newSiteUrl}
                onChange={(e) => setNewSiteUrl(e.target.value)}
                required
                disabled={addingSite}
                className="flex-1 h-10"
              />
              <Button type="submit" disabled={addingSite} size="sm" className="h-10 px-5 shadow-sm shadow-primary/10 shrink-0">
                {addingSite ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1.5" /> Add Site</>}
              </Button>
            </form>

            {sites.length === 0 ? (
              <div className="py-10 text-center border-2 border-dashed rounded-xl">
                <Globe className="h-10 w-10 mx-auto mb-3 text-primary/20" />
                <p className="text-sm font-medium text-muted-foreground">No sites added yet</p>
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
                    {sites.map((site) => (
                      <TableRow key={site.id} className="hover:bg-secondary/20 transition-colors">
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate max-w-[200px]">{site.url}</span>
                            {Boolean(site.isPrimary) && (
                              <Badge className="bg-primary/10 text-primary border-primary/20 border text-[10px] gap-1 shrink-0">
                                <Star className="h-2.5 w-2.5" /> Primary
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {site.createdAt ? new Date(site.createdAt).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {site.lastAuditAt ? new Date(site.lastAuditAt).toLocaleDateString() : 'Never'}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {!Boolean(site.isPrimary) && (
                              <Button variant="ghost" size="sm" disabled={settingPrimary === site.id} onClick={() => setPrimary(site.id)} className="h-8 text-xs">
                                {settingPrimary === site.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Star className="h-3 w-3 mr-1" />Set Primary</>}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={removingSite === site.id}
                              onClick={() => removeSite(site.id)}
                              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              {removingSite === site.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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

      <section>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Automation Preferences</h2>
            <p className="text-xs text-muted-foreground">Configure how the SEO engine runs automated content generation.</p>
          </div>
        </div>

        <Card className="border-primary/10">
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-primary/5">
              <div>
                <p className="font-medium text-sm">Publishing Frequency</p>
                <p className="text-xs text-muted-foreground mt-0.5">How often to generate and publish new SEO content.</p>
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

            <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-primary/5">
              <div>
                <p className="font-medium text-sm">Default Word Count</p>
                <p className="text-xs text-muted-foreground mt-0.5">Target length for AI-generated articles.</p>
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

            <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-primary/5">
              <div>
                <p className="font-medium text-sm">Auto-Publish</p>
                <p className="text-xs text-muted-foreground mt-0.5">Automatically publish generated content to connected platforms.</p>
              </div>
              <Switch checked={autoPublish} onCheckedChange={setAutoPublish} className="data-[state=checked]:bg-primary" />
            </div>

            {automationSettings && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-secondary/20 rounded-lg border border-primary/5">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Last Run
                  </p>
                  <p className="text-sm font-semibold">{automationSettings.lastRun ? new Date(automationSettings.lastRun).toLocaleDateString() : 'Never'}</p>
                </div>
                <div className="p-3 bg-secondary/20 rounded-lg border border-primary/5">
                  <p className="text-[10px] font-bold uppercase text-primary mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Next Run
                  </p>
                  <p className="text-sm font-semibold">{automationSettings.nextRun ? new Date(automationSettings.nextRun).toLocaleDateString() : '-'}</p>
                </div>
              </div>
            )}

            <Button onClick={saveAutomation} disabled={savingAuto} className="shadow-sm shadow-primary/10">
              {savingAuto ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Preferences</>}
            </Button>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Account Info</h2>
            <p className="text-xs text-muted-foreground">Your current plan and usage statistics.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-5">
              <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center mb-3">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold text-primary">Free</p>
              <p className="text-xs text-muted-foreground mt-1">Current Plan</p>
            </CardContent>
          </Card>

          <Card className="border-primary/10">
            <CardContent className="p-5">
              <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
                <BarChart2 className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-2xl font-bold">{auditsThisMonth}</p>
              <p className="text-xs text-muted-foreground mt-1">Audits This Month</p>
            </CardContent>
          </Card>

          <Card className="border-primary/10">
            <CardContent className="p-5">
              <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
                <BarChart2 className="h-4 w-4 text-blue-600" />
              </div>
              <p className="text-2xl font-bold">{contentThisMonth}</p>
              <p className="text-xs text-muted-foreground mt-1">Content Generated</p>
            </CardContent>
          </Card>

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

      <Dialog open={tokenModalOpen} onOpenChange={setTokenModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect {tokenModalPlatform?.label}</DialogTitle>
            <DialogDescription>
              Token will be sent to the secure platform-auth endpoint and stored encrypted server-side.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                {tokenModalPlatform?.tokenLabel || 'Token'}
              </label>
              <Input
                type="password"
                value={tokenValue}
                onChange={(e) => setTokenValue(e.target.value)}
                placeholder="Paste token"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Username (optional)</label>
              <Input
                value={tokenUsername}
                onChange={(e) => setTokenUsername(e.target.value)}
                placeholder="username"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveToken}
              disabled={!tokenValue.trim() || savingPlatform === tokenModalPlatform?.name}
            >
              {savingPlatform === tokenModalPlatform?.name ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plug className="h-4 w-4 mr-1.5" />}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
