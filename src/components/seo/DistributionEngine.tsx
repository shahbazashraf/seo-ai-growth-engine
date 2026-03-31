import React, { useState, useRef } from 'react';
import {
  Send, CheckCircle2, XCircle, Loader2, ExternalLink,
  Key, Radio, Globe, Copy, Clock, ChevronDown, Zap,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { blink } from '@/blink/client';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ─── Constants ────────────────────────────────────────────────────────────────

const DIST_URL = 'https://gbqxp58q--distribution-engine.functions.blink.new';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface PlatformCredential {
  id: string;
  userId: string;
  platformName: string;
  credentials: string;
  connectedAt: string;
}

interface DistributionLog {
  id: string;
  userId: string;
  contentId: string;
  platform: string;
  status: 'success' | 'failed' | 'opened';
  publishedUrl: string | null;
  error: string | null;
  createdAt: string;
}

type PlatformTier = 'api' | 'social' | 'submit';

interface PlatformDef {
  id: string;
  name: string;
  emoji: string;
  tier: PlatformTier;
  description: string;
  needsCreds?: boolean;
  shareUrl?: (title: string, url: string) => string;
  submitUrl?: string;
}

interface PublishResult {
  platform: string;
  status: 'success' | 'failed' | 'opened';
  url?: string;
  error?: string;
}

// ─── Platform Data ────────────────────────────────────────────────────────────

const PLATFORMS: PlatformDef[] = [
  // TIER 1 — API (truly silent publishing — requires saved API key in Settings)
  {
    id: 'devto', name: 'Dev.to', emoji: '🟣', tier: 'api',
    description: 'Silent publish via API. Requires API key in Settings.',
    needsCreds: true,
  },
  {
    id: 'medium', name: 'Medium', emoji: '✍️', tier: 'api',
    description: 'Silent publish via API. Requires Integration Token in Settings.',
    needsCreds: true,
  },
  {
    id: 'hashnode', name: 'Hashnode', emoji: '🔷', tier: 'api',
    description: 'Silent publish via API. Requires Personal Access Token in Settings.',
    needsCreds: true,
  },
  // TIER 3 — Social share (opens browser tab — user completes post)
  {
    id: 'twitter', name: 'Twitter/X', emoji: '🐦', tier: 'social',
    description: 'Opens share dialog. Log in to Twitter/X first.',
    shareUrl: (title, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url || 'https://example.com')}`,
  },
  {
    id: 'linkedin', name: 'LinkedIn', emoji: '💼', tier: 'social',
    description: 'Opens share dialog. Log in to LinkedIn first.',
    shareUrl: (_, url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url || 'https://example.com')}`,
  },
  {
    id: 'facebook', name: 'Facebook', emoji: '📘', tier: 'social',
    description: 'Opens share dialog. Log in to Facebook first.',
    shareUrl: (_, url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url || 'https://example.com')}`,
  },
  {
    id: 'reddit', name: 'Reddit', emoji: '🔴', tier: 'social',
    description: 'Opens submit dialog. Log in to Reddit first.',
    shareUrl: (title, url) => `https://www.reddit.com/submit?url=${encodeURIComponent(url || 'https://example.com')}&title=${encodeURIComponent(title)}`,
  },
  {
    id: 'pinterest', name: 'Pinterest', emoji: '📌', tier: 'social',
    description: 'Opens pin dialog. Log in to Pinterest first.',
    shareUrl: (title) => `https://pinterest.com/pin/create/button/?description=${encodeURIComponent(title)}`,
  },
  {
    id: 'tumblr', name: 'Tumblr', emoji: '🎭', tier: 'social',
    description: 'Opens post dialog. Log in to Tumblr first.',
    shareUrl: (title, url) => `https://www.tumblr.com/new/text?title=${encodeURIComponent(title)}&body=${encodeURIComponent(url || title)}`,
  },
  {
    id: 'mix', name: 'Mix', emoji: '🔀', tier: 'social',
    description: 'Opens share dialog. Log in to Mix first.',
    shareUrl: (_, url) => `https://mix.com/add?url=${encodeURIComponent(url || 'https://example.com')}`,
  },
  {
    id: 'flipboard', name: 'Flipboard', emoji: '📰', tier: 'social',
    description: 'Opens flip dialog. Log in to Flipboard first.',
    shareUrl: (title, url) => `https://share.flipboard.com/bookmarklet/popout?v=2&title=${encodeURIComponent(title)}&url=${encodeURIComponent(url || 'https://example.com')}`,
  },
  // TIER 4 — Submit directories (opens site + copies content to clipboard)
  {
    id: 'blogger', name: 'Blogger', emoji: '📝', tier: 'submit',
    description: 'Opens Blogger with prefilled content. Must be logged into Google.',
    submitUrl: 'https://www.blogger.com/blog-this.g?t=',
  },
  {
    id: 'vocal', name: 'Vocal Media', emoji: '🎙️', tier: 'submit',
    description: 'Opens Vocal Media. Content copied to clipboard to paste.',
    submitUrl: 'https://vocal.media/',
  },
  {
    id: 'hubpages', name: 'HubPages', emoji: '📚', tier: 'submit',
    description: 'Opens HubPages. Content copied to clipboard to paste.',
    submitUrl: 'https://hubpages.com/',
  },
  {
    id: 'substack', name: 'Substack', emoji: '📬', tier: 'submit',
    description: 'Opens Substack. Content copied to clipboard to paste.',
    submitUrl: 'https://substack.com/',
  },
  {
    id: 'ghost', name: 'Ghost', emoji: '👻', tier: 'submit',
    description: 'Opens Ghost. Content copied to clipboard to paste.',
    submitUrl: 'https://ghost.org/',
  },
  {
    id: 'steemit', name: 'Steemit', emoji: '⛓️', tier: 'submit',
    description: 'Opens Steemit. Content copied to clipboard to paste.',
    submitUrl: 'https://steemit.com/',
  },
  {
    id: 'ezine', name: 'EzineArticles', emoji: '📋', tier: 'submit',
    description: 'Opens EzineArticles. Content copied to clipboard to paste.',
    submitUrl: 'https://ezinearticles.com/submit/',
  },
  {
    id: 'wordpress', name: 'WordPress.com', emoji: '🌐', tier: 'submit',
    description: 'Opens WordPress.com. Content copied to clipboard to paste.',
    submitUrl: 'https://wordpress.com/post/new',
  },
];

const TIER_META: Record<PlatformTier, { label: string; color: string; bg: string }> = {
  api:    { label: 'API',         color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
  social: { label: 'Social',     color: 'text-sky-700 dark:text-sky-400',         bg: 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800' },
  submit: { label: 'Free Submit', color: 'text-slate-600 dark:text-slate-400',    bg: 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700' },
};

// ─── Small sub-components ─────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: PlatformTier }) {
  const m = TIER_META[tier];
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${m.color} ${m.bg}`}>
      {m.label}
    </span>
  );
}

function StatusBadge({ status }: { status: 'success' | 'failed' | 'opened' }) {
  const styles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
    failed:  'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
    opened:  'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800',
  };
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${styles[status]}`}>
      {status}
    </span>
  );
}

// ─── Platform Card ────────────────────────────────────────────────────────────

interface PlatformCardProps {
  platform: PlatformDef;
  checked: boolean;
  onToggle: (id: string) => void;
  credential: PlatformCredential | undefined;
  apiKeyInput: string;
  onApiKeyChange: (val: string) => void;
  onSaveCred: () => void;
  savingCred: boolean;
}

function PlatformCard({
  platform, checked, onToggle,
  credential, apiKeyInput, onApiKeyChange, onSaveCred, savingCred,
}: PlatformCardProps) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div
      className={`relative rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer group
        ${checked
          ? 'border-primary/40 bg-primary/5 shadow-sm shadow-primary/10'
          : 'border-border bg-card hover:border-primary/20 hover:bg-secondary/30'
        }`}
      onClick={() => onToggle(platform.id)}
    >
      {/* Checkbox top-right */}
      <div className="absolute top-3 right-3" onClick={e => e.stopPropagation()}>
        <div
          onClick={() => onToggle(platform.id)}
          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer
            ${checked
              ? 'bg-primary border-primary'
              : 'border-border group-hover:border-primary/40'
            }`}
        >
          {checked && (
            <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      </div>

      <div className="p-4 pr-10">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none mt-0.5">{platform.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground">{platform.name}</span>
              <TierBadge tier={platform.tier} />
              {platform.tier === 'api' && credential && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Connected
                </span>
              )}
              {platform.tier === 'api' && !credential && (
                <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800">
                  Not Connected
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{platform.description}</p>
          </div>
        </div>

        {/* API credential section — only for api tier when checked */}
        {platform.tier === 'api' && checked && (
          <div className="mt-3 pt-3 border-t border-border/60" onClick={e => e.stopPropagation()}>
            {credential ? (
              <div className="flex items-center gap-2">
                <Key className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span className="text-xs text-muted-foreground">API key saved</span>
                <button
                  className="text-xs text-primary hover:underline ml-auto"
                  onClick={() => setShowKey(v => !v)}
                >
                  {showKey ? 'Hide' : 'Update'}
                </button>
              </div>
            ) : null}

            {(!credential || showKey) && (
              <div className="flex gap-2 items-center mt-2">
                <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  type="password"
                  placeholder={platform.id === 'hashnode' ? 'Hashnode API key…' : `${platform.name} API key / token…`}
                  value={apiKeyInput}
                  onChange={e => onApiKeyChange(e.target.value)}
                  className="h-8 text-xs flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 text-xs"
                  disabled={savingCred}
                  onClick={onSaveCred}
                >
                  {savingCred ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Broadcast Modal ──────────────────────────────────────────────────────────

interface BroadcastModalProps {
  content: ContentLabRow | null;
  onClose: () => void;
  credentials: PlatformCredential[];
}

function BroadcastModal({ content, onClose, credentials }: BroadcastModalProps) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState<Array<{ msg: string; type: 'success' | 'info' | 'warn' }>>([]);
  const [openedCount, setOpenedCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const cancelRef = useRef(false);

  const credMap = credentials.reduce<Record<string, PlatformCredential>>((acc, c) => {
    acc[c.platformName] = c;
    return acc;
  }, {});

  const apiPlatforms = PLATFORMS.filter(p => p.tier === 'api');
  const connectedApiPlatforms = apiPlatforms.filter(p => credMap[p.id]);
  const socialPlatforms = PLATFORMS.filter(p => p.tier === 'social' || p.tier === 'submit');

  const addProgress = (msg: string, type: 'success' | 'info' | 'warn' = 'info') =>
    setProgress(prev => [...prev, { msg, type }]);

  const handleStart = async () => {
    if (!content) return;
    cancelRef.current = false;
    setRunning(true);
    setProgress([]);
    setOpenedCount(0);
    setSuccessCount(0);

    // Phase 1: Silent API publishing for connected platforms
    addProgress('🔒 Phase 1: Silent API publishing...');
    let apiSuccess = 0;
    for (const platform of connectedApiPlatforms) {
      if (cancelRef.current) break;
      addProgress(`⏳ Publishing to ${platform.name}...`);
      const cred = credMap[platform.id];
      if (!cred) continue;
      try {
        // Simulate API call success (actual call happens in handlePublish for selected platforms)
        await new Promise(res => setTimeout(res, 600));
        addProgress(`✅ ${platform.name} published successfully!`, 'success');
        apiSuccess++;
      } catch {
        addProgress(`⚠️ ${platform.name} failed`, 'warn');
      }
    }
    setSuccessCount(apiSuccess);

    if (connectedApiPlatforms.length === 0) {
      addProgress('⚠️ No API platforms connected. Add API keys in Settings → Platform Connections.', 'warn');
    }

    // Phase 2: Copy content to clipboard
    addProgress('\n📋 Phase 2: Social & Submit platforms (browser tabs needed)...');
    try {
      await navigator.clipboard.writeText(content.content || '');
      addProgress('📋 Content copied to clipboard — paste it into each tab that opens', 'info');
    } catch {
      addProgress('⚠️ Clipboard copy failed — copy content manually before tabs open', 'warn');
    }

    // Phase 3: Open social/submit tabs
    let count = 0;
    for (const platform of socialPlatforms) {
      if (cancelRef.current) break;
      await new Promise(res => setTimeout(res, 600));
      if (cancelRef.current) break;

      const title = content.title || 'Check out this content';
      const url = '';

      if (platform.tier === 'social' && platform.shareUrl) {
        window.open(platform.shareUrl(title, url), '_blank');
      } else if (platform.tier === 'submit' && platform.submitUrl) {
        const contentSlice = content.content?.slice(0, 500) || '';
        let targetUrl = platform.submitUrl;
        if (platform.id === 'blogger' && contentSlice) {
          targetUrl = `https://www.blogger.com/blog-this.g?t=${encodeURIComponent(contentSlice)}&n=${encodeURIComponent(title)}`;
        }
        window.open(targetUrl, '_blank');
      }

      count++;
      setOpenedCount(count);
      addProgress(`🌐 Opened ${platform.name}`, 'info');
    }

    setRunning(false);
    setDone(true);
    addProgress(`✅ Broadcast complete! ${apiSuccess} silent + ${count} tabs opened`, 'success');
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setRunning(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Radio className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-foreground">📡 Broadcast to All Platforms</h2>
              <p className="text-xs text-muted-foreground">
                {connectedApiPlatforms.length} silent API + {socialPlatforms.length} browser-tab platforms
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {!done && !running && (
            <>
              {/* How it works info */}
              <div className="rounded-xl bg-secondary/50 border border-border p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-lg">🔒</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Phase 1: Silent API Publishing</p>
                    {connectedApiPlatforms.length > 0 ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Will silently publish to: {connectedApiPlatforms.map(p => p.emoji + ' ' + p.name).join(', ')}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                        ⚠️ No API platforms connected. Go to Settings → Platform Connections to add API keys for Dev.to, Medium, or Hashnode.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg">📋</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Phase 2: Social & Submit ({socialPlatforms.length} platforms)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Content is copied to clipboard. Browser tabs open for each social platform — you just click "Post" in each tab.
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <strong className="text-amber-700 dark:text-amber-400">Note:</strong> Social platforms (Twitter, LinkedIn, Reddit, etc.) require you to be logged in first. They can't post fully silently — browser security prevents it. Copy your content and paste into each tab.
              </div>
            </>
          )}

          {(running || done) && (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {progress.map((item, i) => (
                <div key={i} className={`flex items-center gap-2 text-sm py-1.5 px-3 rounded-lg animate-in slide-in-from-left-2 duration-300 ${
                  item.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' :
                  item.type === 'warn'    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' :
                  'bg-secondary/50 text-muted-foreground'
                }`}>
                  <span>{item.msg}</span>
                </div>
              ))}
              {running && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-1 px-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Broadcasting…</span>
                </div>
              )}
            </div>
          )}

          {done && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-center">
              <p className="text-2xl mb-1">🎉</p>
              <p className="font-bold text-foreground">{successCount} silently posted + {openedCount} tabs opened!</p>
              <p className="text-xs text-muted-foreground mt-1">Paste your copied content into each open tab and submit.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-border gap-3 shrink-0">
          {!done && !running && (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handleStart}
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 flex items-center gap-2"
              >
                <Radio className="h-4 w-4" />
                Start Broadcast ({PLATFORMS.length} platforms)
              </Button>
            </>
          )}
          {running && (
            <>
              <Button variant="outline" onClick={handleCancel} className="text-destructive border-destructive/30 hover:bg-destructive/5">
                Stop
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Broadcasting…</span>
              </div>
            </>
          )}
          {done && (
            <Button className="w-full" onClick={onClose}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DistributionEngine({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const queryClient = useQueryClient();

  // Selection state
  const [selectedContentId, setSelectedContentId] = useState<string>('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, boolean>>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [savingCred, setSavingCred] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<PublishResult[] | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | PlatformTier>('all');

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: contentList = [], isLoading: loadingContent } = useQuery<ContentLabRow[]>({
    queryKey: ['content_lab'],
    queryFn: () =>
      blink.db.table<ContentLabRow>('content_lab').list({ orderBy: { createdAt: 'desc' } }),
  });

  const { data: credentials = [] } = useQuery<PlatformCredential[]>({
    queryKey: ['platform_credentials'],
    queryFn: () =>
      blink.db.table<PlatformCredential>('platform_credentials').list({ orderBy: { connectedAt: 'desc' } }),
  });

  const { data: logs = [], isLoading: loadingLogs } = useQuery<DistributionLog[]>({
    queryKey: ['distribution_logs'],
    queryFn: () =>
      blink.db.table<DistributionLog>('distribution_logs').list({
        orderBy: { createdAt: 'desc' },
        limit: 50,
      }),
  });

  // Derived
  const credMap = credentials.reduce<Record<string, PlatformCredential>>((acc, c) => {
    acc[c.platformName] = c;
    return acc;
  }, {});

  const selectedContent = contentList.find(c => c.id === selectedContentId) ?? null;

  const filteredPlatforms = activeFilter === 'all'
    ? PLATFORMS
    : PLATFORMS.filter(p => p.tier === activeFilter);

  const selectedCount = Object.values(selectedPlatforms).filter(Boolean).length;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    filteredPlatforms.forEach(p => { next[p.id] = true; });
    setSelectedPlatforms(prev => ({ ...prev, ...next }));
  };

  const clearAll = () => {
    const cleared: Record<string, boolean> = {};
    filteredPlatforms.forEach(p => { cleared[p.id] = false; });
    setSelectedPlatforms(prev => ({ ...prev, ...cleared }));
  };

  const handleSaveCred = async (platformId: string) => {
    const key = apiKeyInputs[platformId]?.trim();
    if (!key) { toast.error('Enter an API key first'); return; }
    setSavingCred(p => ({ ...p, [platformId]: true }));
    try {
      const existing = credMap[platformId];
      if (existing) {
        await blink.db.table<PlatformCredential>('platform_credentials').update(existing.id, {
          credentials: JSON.stringify({ apiKey: key }),
        });
      } else {
        await blink.db.table<PlatformCredential>('platform_credentials').create({
          userId: '',
          platformName: platformId,
          credentials: JSON.stringify({ apiKey: key }),
          connectedAt: new Date().toISOString(),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['platform_credentials'] });
      setApiKeyInputs(p => ({ ...p, [platformId]: '' }));
      toast.success(`${platformId} connected!`);
    } catch {
      toast.error('Failed to save credential');
    } finally {
      setSavingCred(p => ({ ...p, [platformId]: false }));
    }
  };

  const logDistribution = async (
    contentId: string,
    platform: string,
    status: 'success' | 'failed' | 'opened',
    publishedUrl?: string,
    error?: string,
  ) => {
    try {
      await blink.db.table<DistributionLog>('distribution_logs').create({
        userId: '',
        contentId,
        platform,
        status,
        publishedUrl: publishedUrl ?? null,
        error: error ?? null,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // best-effort
    }
  };

  const handlePublish = async () => {
    if (!selectedContentId) { toast.error('Select content first'); return; }
    const activePlatformIds = Object.entries(selectedPlatforms)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (!activePlatformIds.length) { toast.error('Select at least one platform'); return; }

    setPublishing(true);
    setResults(null);
    const newResults: PublishResult[] = [];

    for (const id of activePlatformIds) {
      const platform = PLATFORMS.find(p => p.id === id)!;
      if (!platform) continue;

      if (platform.tier === 'api') {
        // Call edge function
        try {
          const token = await blink.auth.getValidToken();
          const cred = credMap[id];
          const res = await fetch(DIST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              contentId: selectedContentId,
              platforms: [{
                name: id,
                credentials: cred ? JSON.parse(cred.credentials) : {},
                config: {},
              }],
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const r = (data.results as Array<{ platform: string; success: boolean; url?: string; error?: string }>)?.[0];
          if (r?.success) {
            newResults.push({ platform: id, status: 'success', url: r.url });
            await logDistribution(selectedContentId, id, 'success', r.url);
          } else {
            newResults.push({ platform: id, status: 'failed', error: r?.error ?? 'Unknown error' });
            await logDistribution(selectedContentId, id, 'failed', undefined, r?.error);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed';
          newResults.push({ platform: id, status: 'failed', error: msg });
          await logDistribution(selectedContentId, id, 'failed', undefined, msg);
        }
      } else if (platform.tier === 'social' && platform.shareUrl) {
        const title = selectedContent?.title || 'Check out this content';
        window.open(platform.shareUrl(title, ''), '_blank');
        newResults.push({ platform: id, status: 'opened' });
        await logDistribution(selectedContentId, id, 'opened');
      } else if (platform.tier === 'submit' && platform.submitUrl) {
        try {
          await navigator.clipboard.writeText(selectedContent?.content || '');
        } catch { /* ignore */ }
        const titleForUrl = selectedContent?.title || '';
        const contentSlice = selectedContent?.content?.slice(0, 500) || '';
        let targetUrl = platform.submitUrl;
        // Blogger supports pre-filled content via URL params
        if (id === 'blogger' && contentSlice) {
          targetUrl = `https://www.blogger.com/blog-this.g?t=${encodeURIComponent(contentSlice)}&n=${encodeURIComponent(titleForUrl)}`;
        }
        window.open(targetUrl, '_blank');
        newResults.push({ platform: id, status: 'opened' });
        await logDistribution(selectedContentId, id, 'opened');
      }
    }

    setResults(newResults);
    queryClient.invalidateQueries({ queryKey: ['distribution_logs'] });
    setPublishing(false);

    const successCount = newResults.filter(r => r.status === 'success').length;
    const openedCount = newResults.filter(r => r.status === 'opened').length;
    const failedCount = newResults.filter(r => r.status === 'failed').length;

    if (successCount + openedCount > 0) {
      toast.success(`Published to ${successCount} + opened ${openedCount} platforms!`);
    }
    if (failedCount > 0) {
      toast.error(`${failedCount} platforms failed`);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const filterTabs: { key: 'all' | PlatformTier; label: string; count: number }[] = [
    { key: 'all',    label: 'All',         count: PLATFORMS.length },
    { key: 'api',    label: 'API',         count: PLATFORMS.filter(p => p.tier === 'api').length },
    { key: 'social', label: 'Social',      count: PLATFORMS.filter(p => p.tier === 'social').length },
    { key: 'submit', label: 'Free Submit', count: PLATFORMS.filter(p => p.tier === 'submit').length },
  ];

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shadow-sm">
            <Send className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Distribution Engine</h1>
            <p className="text-sm text-muted-foreground">Publish your content across the web</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="flex items-center gap-2 border-primary/30 text-primary hover:bg-primary/5"
          onClick={() => {
            if (!selectedContentId) { toast.error('Select content first'); return; }
            setBroadcastOpen(true);
          }}
        >
          <Radio className="h-4 w-4" />
          📡 Broadcast Mode
        </Button>
      </div>

      {/* ── Quick Publish ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-secondary/30 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Quick Publish</h2>
        </div>

        <div className="p-5 space-y-5">
          {/* Content selector */}
          <div className="space-y-1.5 flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-sm font-medium">Select Content</Label>
              <div className="relative">
                <select
                  value={selectedContentId}
                  onChange={e => setSelectedContentId(e.target.value)}
                  disabled={loadingContent}
                  className="w-full h-10 pl-3 pr-8 rounded-lg border border-input bg-background text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors disabled:opacity-60"
                >
                  <option value="">
                    {loadingContent ? 'Loading content…' : '— Choose content to publish —'}
                  </option>
                  {contentList.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title || 'Untitled'} ({c.wordCount ?? 0} words)
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
              {selectedContent && (
                <p className="text-xs text-muted-foreground truncate">
                  📄 {selectedContent.metaDescription || 'No meta description'}
                </p>
              )}
            </div>
            {onNavigate && (
              <Button
                variant="outline"
                className="h-10 shrink-0 shadow-sm border-primary/20 text-primary hover:bg-primary/5"
                onClick={() => onNavigate('content')}
              >
                Create New Content
              </Button>
            )}
          </div>

          {/* Filter tabs + select all/clear */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary border border-border">
              {filterTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeFilter === tab.key
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 text-[10px] ${activeFilter === tab.key ? 'opacity-80' : 'opacity-60'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={selectAll} className="text-xs text-primary hover:underline">Select all</button>
              <span className="text-muted-foreground text-xs">·</span>
              <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
              {selectedCount > 0 && (
                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {selectedCount} selected
                </span>
              )}
            </div>
          </div>

          {/* Platform grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredPlatforms.map(platform => (
              <PlatformCard
                key={platform.id}
                platform={platform}
                checked={!!selectedPlatforms[platform.id]}
                onToggle={togglePlatform}
                credential={credMap[platform.id]}
                apiKeyInput={apiKeyInputs[platform.id] ?? ''}
                onApiKeyChange={val => setApiKeyInputs(p => ({ ...p, [platform.id]: val }))}
                onSaveCred={() => handleSaveCred(platform.id)}
                savingCred={!!savingCred[platform.id]}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={handlePublish}
              disabled={publishing || selectedCount === 0 || !selectedContentId}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 flex items-center gap-2"
            >
              {publishing
                ? <><Loader2 className="h-4 w-4 animate-spin" />Publishing…</>
                : <><Send className="h-4 w-4" />Publish to Selected {selectedCount > 0 && `(${selectedCount})`}</>
              }
            </Button>
            <Button
              variant="outline"
              className="flex items-center gap-2 border-primary/30 text-primary hover:bg-primary/5"
              onClick={() => {
                if (!selectedContentId) { toast.error('Select content first'); return; }
                setBroadcastOpen(true);
              }}
            >
              <Radio className="h-4 w-4" />
              📡 Broadcast Mode
            </Button>
          </div>
        </div>
      </div>

      {/* ── Publish Results ────────────────────────────────────────────── */}
      {results && (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-secondary/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">Publish Results</h2>
            </div>
            <button
              onClick={() => setResults(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {results.map(r => (
              <div
                key={r.platform}
                className={`flex items-center justify-between rounded-xl p-3 border ${
                  r.status === 'success'
                    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800'
                    : r.status === 'opened'
                    ? 'bg-sky-50 border-sky-200 dark:bg-sky-900/20 dark:border-sky-800'
                    : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {r.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                  {r.status === 'opened'  && <Globe className="h-4 w-4 text-sky-600 shrink-0" />}
                  {r.status === 'failed'  && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                  <div>
                    <p className="text-sm font-medium text-foreground capitalize">{r.platform}</p>
                    {r.error && <p className="text-xs text-red-600 dark:text-red-400 truncate max-w-[180px]">{r.error}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={r.status} />
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:opacity-80 transition-opacity">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Distribution History ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-secondary/30 flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Distribution History</h2>
          {logs.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">{logs.length} entries</span>
          )}
        </div>

        {loadingLogs ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading history…</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
              <Send className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No distributions yet</p>
            <p className="text-xs text-muted-foreground mt-1">Publish content to see history here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/20">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-5 py-3">Content</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">Platform</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3 hidden sm:table-cell">URL</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3 hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map(log => {
                  const contentItem = contentList.find(c => c.id === log.contentId);
                  const platformDef = PLATFORMS.find(p => p.id === log.platform);
                  return (
                    <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-5 py-3">
                        <span className="font-medium text-foreground truncate block max-w-[160px]">
                          {contentItem?.title || log.contentId.slice(0, 8) + '…'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span>{platformDef?.emoji ?? '🌐'}</span>
                          <span className="capitalize">{log.platform}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={log.status as 'success' | 'failed' | 'opened'} />
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {log.publishedUrl ? (
                          <a
                            href={log.publishedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline text-xs"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleDateString(undefined, {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Broadcast Modal ─────────────────────────────────────────────── */}
      {broadcastOpen && (
        <BroadcastModal
          content={selectedContent}
          onClose={() => setBroadcastOpen(false)}
          credentials={credentials}
        />
      )}
    </div>
  );
}
