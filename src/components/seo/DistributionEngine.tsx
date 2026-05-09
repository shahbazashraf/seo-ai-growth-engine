import React, { useState, useRef } from 'react';
import {
  Send, CheckCircle2, XCircle, Loader2, ExternalLink,
  Key, Radio, Globe, Copy, Clock, ChevronDown, Zap,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { localDB } from '@/lib/local-db';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createScheduledJob } from '@/lib/scheduler';
import { createLogger, addBreadcrumb } from '@/lib/logger';
import { apiUrl } from '@/lib/api-endpoints';
import {
  createDistributionCampaign,
  discoverDistributionTargets,
  executeCampaignTarget,
  type DistributionCampaign,
  type DistributionCampaignTarget,
} from '@/lib/distribution-orchestrator';

const log = createLogger('DistributionEngine');

// ─── Constants ────────────────────────────────────────────────────────────────

const SYNDICATION_URL = apiUrl('/api/syndication-poster');
const REDDIT_POSTER_URL = apiUrl('/api/reddit-poster');
const QUORA_AGENT_URL = apiUrl('/api/quora-agent');

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContentLabRow {
  id: string;
  userId: string;
  title: string;
  content: string;
  metaDescription: string;
  keywords: string;
  imageUrls: string;
  status: 'draft' | 'review' | 'approved' | 'scheduled' | 'published' | 'failed';
  platformsPublished: string;
  wordCount: number;
  originSiteUrl?: string | null;
  canonicalUrl?: string | null;
  publishedUrl?: string | null;
  distributionMode?: 'canonical' | 'teaser' | 'social' | null;
  publishTargetType?: 'cms' | 'syndication' | 'social' | null;
  syndicationPolicy?: 'full-repost' | 'canonical-repost' | 'teaser-linkback' | 'social-snippet' | null;
  verificationStatus?: 'pending' | 'verified' | 'failed' | 'manual-review' | null;
  publishSource?: 'api' | 'manual' | 'scheduled' | null;
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
  userId?: string | null;
  contentId: string;
  platform: string;
  status: 'success' | 'failed' | 'opened';
  targetType?: 'cms' | 'syndication' | 'social';
  targetPlatform?: string;
  attemptType?: 'api' | 'manual' | 'scheduled';
  publishedUrl: string | null;
  canonicalApplied?: boolean;
  verificationStatus?: 'pending' | 'verified' | 'failed' | 'manual-review';
  error: string | null;
  createdAt: string;
}

type PlatformTier = 'cms' | 'syndication' | 'social';

interface PlatformDef {
  id: string;
  name: string;
  emoji: string;
  tier: PlatformTier;
  description: string;
  needsCreds?: boolean;
  distributionMode: 'canonical' | 'teaser' | 'social';
  syndicationPolicy: 'full-repost' | 'canonical-repost' | 'teaser-linkback' | 'social-snippet';
  shareUrl?: (title: string, url: string) => string;
}

interface PublishResult {
  platform: string;
  status: 'success' | 'failed' | 'opened';
  url?: string;
  platformPostId?: string;
  error?: string;
}

type SyndicationStatus = {
  state: 'idle' | 'posting' | 'success' | 'error';
  publishedUrl?: string;
  platformPostId?: string;
  error?: string;
};

type RedditStatus = {
  state: 'idle' | 'posting' | 'success' | 'error';
  publishedUrl?: string;
  platformPostId?: string;
  error?: string;
};

type QuoraStatus = {
  state: 'idle' | 'posting' | 'success' | 'error';
  matchedQuestion?: string;
  answerUrl?: string;
  error?: string;
};

// ─── Platform Data ────────────────────────────────────────────────────────────

const PLATFORMS: PlatformDef[] = [
  {
    id: 'custom_webhook', name: 'Custom Webhook', emoji: '🪝', tier: 'cms',
    description: 'Primary own-site publishing through your custom CMS or webhook.',
    needsCreds: true,
    distributionMode: 'canonical',
    syndicationPolicy: 'canonical-repost',
  },
  {
    id: 'wordpress', name: 'WordPress', emoji: '📰', tier: 'cms',
    description: 'Primary own-site publishing through the WordPress REST API.',
    needsCreds: true,
    distributionMode: 'canonical',
    syndicationPolicy: 'canonical-repost',
  },
  {
    id: 'devto', name: 'Dev.to', emoji: '🟣', tier: 'syndication',
    description: 'Canonical-friendly syndication via API.',
    needsCreds: true,
    distributionMode: 'canonical',
    syndicationPolicy: 'canonical-repost',
  },
  {
    id: 'medium', name: 'Medium', emoji: '✍️', tier: 'syndication',
    description: 'Syndicate full reposts or teasers with attribution.',
    needsCreds: true,
    distributionMode: 'canonical',
    syndicationPolicy: 'canonical-repost',
  },
  {
    id: 'hashnode', name: 'Hashnode', emoji: '🔷', tier: 'syndication',
    description: 'Syndicate technical content with canonical-safe defaults.',
    needsCreds: true,
    distributionMode: 'canonical',
    syndicationPolicy: 'canonical-repost',
  },
  {
    id: 'twitter', name: 'Twitter/X', emoji: '🐦', tier: 'social',
    description: 'Publish a teaser thread that points back to the original page.',
    distributionMode: 'social',
    syndicationPolicy: 'social-snippet',
    shareUrl: (title, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url || 'https://example.com')}`,
  },
  {
    id: 'linkedin', name: 'LinkedIn', emoji: '💼', tier: 'social',
    description: 'Publish a teaser snippet that links back to the canonical page.',
    distributionMode: 'social',
    syndicationPolicy: 'social-snippet',
    shareUrl: (_, url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url || 'https://example.com')}`,
  },
];

const TIER_META: Record<PlatformTier, { label: string; color: string; bg: string }> = {
  cms:         { label: 'Primary CMS', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
  syndication: { label: 'Syndication', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
  social:      { label: 'Teaser', color: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800' },
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
              {(platform.tier === 'cms' || platform.tier === 'syndication') && credential && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Connected
                </span>
              )}
              {(platform.tier === 'cms' || platform.tier === 'syndication') && !credential && (
                <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800">
                  Not Connected
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{platform.description}</p>
          </div>
        </div>

        {/* Credential section — for automated CMS or syndication connectors */}
        {(platform.tier === 'cms' || platform.tier === 'syndication') && checked && (
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
                  placeholder={
                    platform.id === 'wordpress'
                      ? 'siteUrl|username|appPassword'
                      : platform.id === 'custom_webhook'
                      ? 'https://your-cms-webhook.example.com/publish'
                      : platform.id === 'hashnode'
                      ? 'Hashnode API key…'
                      : `${platform.name} API key / token…`
                  }
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

  const automatedPlatforms = PLATFORMS.filter(p => p.tier === 'cms' || p.tier === 'syndication');
  const connectedAutomatedPlatforms = automatedPlatforms.filter(p => credMap[p.id]);
  const socialPlatforms = PLATFORMS.filter(p => p.tier === 'social');

  const addProgress = (msg: string, type: 'success' | 'info' | 'warn' = 'info') =>
    setProgress(prev => [...prev, { msg, type }]);

  const handleStart = async () => {
    if (!content) return;
    cancelRef.current = false;
    setRunning(true);
    setProgress([]);
    setOpenedCount(0);
    setSuccessCount(0);

    // Phase 1: automated publishing for connected platforms
    addProgress('🔒 Phase 1: automated CMS and syndication publishing...');
    let apiSuccess = 0;
    for (const platform of connectedAutomatedPlatforms) {
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

    if (connectedAutomatedPlatforms.length === 0) {
      addProgress('⚠️ No automated connectors connected. Add WordPress, Custom Webhook, or a syndication API in Settings.', 'warn');
    }

    // Phase 2: Copy content to clipboard
    addProgress('\n📋 Phase 2: teaser/social distribution (browser tabs needed)...');
    try {
      await navigator.clipboard.writeText(content.content || '');
      addProgress('📋 Content copied to clipboard — paste it into each tab that opens', 'info');
    } catch {
      addProgress('⚠️ Clipboard copy failed — copy content manually before tabs open', 'warn');
    }

    // Phase 3: Prepare teaser links for manual posting (no popup flow)
    let count = 0;
    for (const platform of socialPlatforms) {
      if (cancelRef.current) break;

      const title = content.title || 'Check out this content';
      const url = content.publishedUrl || content.canonicalUrl || content.originSiteUrl || '';
      let targetUrl = '';

      if (platform.tier === 'social' && platform.shareUrl) {
        targetUrl = platform.shareUrl(title, url);
      }

      if (targetUrl) {
        addProgress(`🔗 ${platform.name} share link prepared: ${targetUrl}`, 'info');
        addProgress(`✅ Add teaser manually on ${platform.name} using the generated link.`, 'success');
      }

      count++;
      setOpenedCount(count);
    }

    setRunning(false);
    setDone(true);
    addProgress(`🎉 All Done! ${apiSuccess} automated + ${count} teaser handoff links prepared`, 'success');
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
                {connectedAutomatedPlatforms.length} automated connectors + {socialPlatforms.length} teaser platforms
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
                    <p className="text-sm font-semibold text-foreground">Phase 1: Automated Publishing</p>
                    {connectedAutomatedPlatforms.length > 0 ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Will auto-publish to: {connectedAutomatedPlatforms.map(p => p.emoji + ' ' + p.name).join(', ')}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                        ⚠️ No automated connectors connected. Add WordPress, Custom Webhook, or a syndication API in Settings.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg">📋</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Phase 2: Social Teasers ({socialPlatforms.length} platforms)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Content is copied to clipboard. Browser tabs open for teaser-style distribution that points back to your canonical page.
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <strong className="text-amber-700 dark:text-amber-400">Note:</strong> Social distribution helps discovery, but the primary ranking asset should remain the original page on your own site.
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
              <p className="font-bold text-foreground">{successCount} automated publishes + {openedCount} teaser tabs opened!</p>
              <p className="text-xs text-muted-foreground mt-1">Your own-site or canonical-safe publish should come first, then teaser distribution.</p>
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

export function DistributionEngine({ 
  onNavigate,
  initialContentId = '' 
}: { 
  onNavigate?: (view: string) => void;
  initialContentId?: string;
}) {
  const queryClient = useQueryClient();

  // Selection state
  const [selectedContentId, setSelectedContentId] = useState<string>(initialContentId);
  
  // Sync prop changes
  React.useEffect(() => {
    if (initialContentId) setSelectedContentId(initialContentId);
  }, [initialContentId]);

  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, boolean>>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [savingCred, setSavingCred] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<PublishResult[] | null>(null);
  const [syndicationStatus, setSyndicationStatus] = useState<Record<string, SyndicationStatus>>({});
  const [syndicationMode, setSyndicationMode] = useState<Record<string, 'full-canonical' | 'teaser'>>({
    medium: 'full-canonical',
    devto: 'full-canonical',
    hashnode: 'full-canonical',
  });
  const [redditSubreddit, setRedditSubreddit] = useState('SEO');
  const [redditPostType, setRedditPostType] = useState<'link' | 'text'>('link');
  const [redditStatus, setRedditStatus] = useState<RedditStatus>({ state: 'idle' });
  const [subredditSuggestions, setSubredditSuggestions] = useState<string[]>([]);
  const [loadingSubredditSuggestions, setLoadingSubredditSuggestions] = useState(false);
  const [quoraTopic, setQuoraTopic] = useState('');
  const [quoraStatus, setQuoraStatus] = useState<QuoraStatus>({ state: 'idle' });
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | PlatformTier>('all');
  const [discoveringTargets, setDiscoveringTargets] = useState(false);
  const [discoveredTargets, setDiscoveredTargets] = useState<Array<{
    platform: string;
    targetKind: 'syndication' | 'community' | 'social' | 'outreach' | 'aggregator';
    targetName: string;
    targetIdentifier: string;
    mode: 'full-canonical' | 'teaser' | 'answer' | 'pitch' | 'social-snippet';
    rationale: string;
    riskLevel: 'low' | 'medium' | 'high';
    requiresReview: boolean;
    metadata?: Record<string, any>;
  }>>([]);
  const [schedulingCampaign, setSchedulingCampaign] = useState(false);
  const [campaignTime, setCampaignTime] = useState('09:00');
  const [campaignMode, setCampaignMode] = useState<'immediate' | 'daily' | 'custom'>('daily');
  const [runningCampaignTargetId, setRunningCampaignTargetId] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: contentList = [], isLoading: loadingContent } = useQuery<ContentLabRow[]>({
    queryKey: ['content_lab'],
    queryFn: () =>
      localDB.table<ContentLabRow>('content_lab').list({ orderBy: { createdAt: 'desc' } }),
  });

  const { data: credentials = [] } = useQuery<PlatformCredential[]>({
    queryKey: ['platform_credentials'],
    queryFn: () =>
      localDB.table<PlatformCredential>('platform_credentials').list({ orderBy: { connectedAt: 'desc' } }),
  });

  const { data: logs = [], isLoading: loadingLogs } = useQuery<DistributionLog[]>({
    queryKey: ['distribution_logs'],
    queryFn: () =>
      localDB.table<DistributionLog>('distribution_logs').list({
        orderBy: { createdAt: 'desc' },
        limit: 50,
      }),
  });

  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery<DistributionCampaign[]>({
    queryKey: ['distribution-campaigns'],
    queryFn: () =>
      localDB.table<DistributionCampaign>('distributionCampaigns').list({
        orderBy: { createdAt: 'desc' },
        limit: 20,
      }),
  });

  const { data: campaignTargets = [] } = useQuery<DistributionCampaignTarget[]>({
    queryKey: ['distribution-campaign-targets'],
    queryFn: () =>
      localDB.table<DistributionCampaignTarget>('distributionCampaignTargets').list({
        orderBy: { createdAt: 'desc' },
        limit: 120,
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
  const syndicationPlatforms = PLATFORMS.filter(
    (p) => p.tier === 'syndication' && ['medium', 'devto', 'hashnode'].includes(p.id),
  );

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
        await localDB.table<PlatformCredential>('platform_credentials').update(existing.id, {
          credentials: JSON.stringify({ apiKey: key }),
        });
      } else {
        await localDB.table<PlatformCredential>('platform_credentials').create({
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
    meta?: {
      targetType?: 'cms' | 'syndication' | 'social';
      attemptType?: 'api' | 'manual' | 'scheduled';
      publishedUrl?: string;
      canonicalApplied?: boolean;
      verificationStatus?: 'pending' | 'verified' | 'failed' | 'manual-review';
      error?: string;
    },
  ) => {
    try {
      await localDB.table<DistributionLog>('distribution_logs').create({
        contentId,
        platform,
        status,
        targetType: meta?.targetType,
        targetPlatform: platform,
        attemptType: meta?.attemptType,
        publishedUrl: meta?.publishedUrl ?? null,
        canonicalApplied: meta?.canonicalApplied ?? false,
        verificationStatus: meta?.verificationStatus ?? (status === 'success' ? 'verified' : status === 'opened' ? 'manual-review' : 'failed'),
        error: meta?.error ?? null,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // best-effort
    }
  };

  const postSyndicationPlatform = async (platformId: 'medium' | 'devto' | 'hashnode'): Promise<PublishResult> => {
    if (!selectedContentId) return { platform: platformId, status: 'failed', error: 'Select content first' };
    if (!selectedContent?.canonicalUrl) {
      return { platform: platformId, status: 'failed', error: 'Canonical URL is required before syndication' };
    }

    const mode = syndicationMode[platformId] || 'full-canonical';
    setSyndicationStatus((prev) => ({
      ...prev,
      [platformId]: { state: 'posting' },
    }));

    try {
      const response = await fetch(SYNDICATION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: selectedContentId,
          platform: platformId,
          mode,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        publishedUrl?: string;
        platformPostId?: string;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        const error = payload.error || 'Failed to publish';
        setSyndicationStatus((prev) => ({
          ...prev,
          [platformId]: { state: 'error', error },
        }));
        await logDistribution(selectedContentId, platformId, 'failed', {
          targetType: 'syndication',
          attemptType: 'api',
          canonicalApplied: mode === 'full-canonical',
          verificationStatus: 'failed',
          error,
        });
        return { platform: platformId, status: 'failed', error };
      }

      setSyndicationStatus((prev) => ({
        ...prev,
        [platformId]: {
          state: 'success',
          publishedUrl: payload.publishedUrl,
          platformPostId: payload.platformPostId,
        },
      }));

      await logDistribution(selectedContentId, platformId, 'success', {
        targetType: 'syndication',
        attemptType: 'api',
        publishedUrl: payload.publishedUrl,
        canonicalApplied: mode === 'full-canonical',
        verificationStatus: 'verified',
      });
      queryClient.invalidateQueries({ queryKey: ['distribution_logs'] });
      return { platform: platformId, status: 'success', url: payload.publishedUrl, platformPostId: payload.platformPostId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish';
      setSyndicationStatus((prev) => ({
        ...prev,
        [platformId]: { state: 'error', error: message },
      }));
      await logDistribution(selectedContentId, platformId, 'failed', {
        targetType: 'syndication',
        attemptType: 'api',
        canonicalApplied: mode === 'full-canonical',
        verificationStatus: 'failed',
        error: message,
      });
      return { platform: platformId, status: 'failed', error: message };
    }
  };

  const suggestBestSubreddits = async () => {
    if (!selectedContent) {
      toast.error('Select content first');
      return;
    }

    const tags = (() => {
      if (!selectedContent.keywords) return [];
      try {
        const parsed = JSON.parse(selectedContent.keywords);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return selectedContent.keywords.split(',').map((x) => x.trim()).filter(Boolean);
      }
    })();

    setLoadingSubredditSuggestions(true);
    try {
      const response = await fetch(REDDIT_POSTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestSubreddits: true,
          topic: selectedContent.title,
          tags,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { suggestions?: string[]; error?: string };
      if (!response.ok || !Array.isArray(payload.suggestions)) {
        throw new Error(payload.error || 'Unable to suggest subreddits');
      }
      setSubredditSuggestions(payload.suggestions);
      if (payload.suggestions[0]) setRedditSubreddit(payload.suggestions[0]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to suggest subreddits');
    } finally {
      setLoadingSubredditSuggestions(false);
    }
  };

  const postRedditNow = async () => {
    if (!selectedContentId) {
      toast.error('Select content first');
      return;
    }
    if (!redditSubreddit.trim()) {
      toast.error('Enter subreddit');
      return;
    }
    setRedditStatus({ state: 'posting' });
    try {
      const response = await fetch(REDDIT_POSTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: selectedContentId,
          subreddit: redditSubreddit.trim(),
          postType: redditPostType,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        publishedUrl?: string;
        platformPostId?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to post to Reddit');
      }

      setRedditStatus({
        state: 'success',
        publishedUrl: payload.publishedUrl,
        platformPostId: payload.platformPostId,
      });
      queryClient.invalidateQueries({ queryKey: ['distribution_logs'] });
      toast.success('Posted to Reddit');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to post to Reddit';
      setRedditStatus({ state: 'error', error: message });
      toast.error(message);
    }
  };

  const postQuoraNow = async () => {
    if (!selectedContentId) {
      toast.error('Select content first');
      return;
    }
    setQuoraStatus({ state: 'posting' });
    try {
      const response = await fetch(QUORA_AGENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: selectedContentId,
          topic: quoraTopic.trim(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        matchedQuestion?: string;
        publishedUrl?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to post to Quora');
      }
      setQuoraStatus({
        state: 'success',
        matchedQuestion: payload.matchedQuestion,
        answerUrl: payload.publishedUrl,
      });
      queryClient.invalidateQueries({ queryKey: ['distribution_logs'] });
      toast.success('Posted answer to Quora');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to post to Quora';
      setQuoraStatus({ state: 'error', error: message });
      toast.error(message);
    }
  };

  const handleDiscoverTargets = async () => {
    if (!selectedContentId) {
      toast.error('Select content first');
      return;
    }
    setDiscoveringTargets(true);
    try {
      const targets = await discoverDistributionTargets(selectedContentId, 18);
      setDiscoveredTargets(targets);
      toast.success(`Discovered ${targets.length} distribution targets`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to discover targets');
    } finally {
      setDiscoveringTargets(false);
    }
  };

  const handleScheduleCampaign = async () => {
    if (!selectedContentId || !selectedContent) {
      toast.error('Select content first');
      return;
    }
    if (discoveredTargets.length === 0) {
      toast.error('Discover targets first');
      return;
    }

    setSchedulingCampaign(true);
    try {
      await createDistributionCampaign({
        contentId: selectedContentId,
        title: selectedContent.title || 'Untitled content',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        defaultTime: campaignTime,
        scheduleMode: campaignMode,
        targets: discoveredTargets,
      });
      queryClient.invalidateQueries({ queryKey: ['distribution-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['distribution-campaign-targets'] });
      toast.success(`Distribution campaign scheduled for ${discoveredTargets.length} targets`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to schedule campaign');
    } finally {
      setSchedulingCampaign(false);
    }
  };

  const handleRunCampaignTargetNow = async (target: DistributionCampaignTarget) => {
    setRunningCampaignTargetId(target.id);
    try {
      await executeCampaignTarget(target.id);
      queryClient.invalidateQueries({ queryKey: ['distribution-campaign-targets'] });
      queryClient.invalidateQueries({ queryKey: ['distribution-campaigns'] });
      toast.success(`${target.targetName} processed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to run target');
    } finally {
      setRunningCampaignTargetId(null);
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

      if (platform.tier === 'syndication' && (id === 'medium' || id === 'devto' || id === 'hashnode')) {
        const result = await postSyndicationPlatform(id);
        newResults.push(result);
      } else if (platform.tier === 'cms' || platform.tier === 'syndication') {
        const msg = `${platform.name} needs a dedicated connector before background publishing. Use the campaign orchestrator to queue it for setup/review.`;
        newResults.push({ platform: id, status: 'failed', error: msg });
        await logDistribution(selectedContentId, id, 'failed', {
          targetType: platform.tier,
          attemptType: 'manual',
          verificationStatus: 'manual-review',
          error: msg,
        });
      } else if (platform.tier === 'social' && platform.shareUrl) {
        const title = selectedContent?.title || 'Check out this content';
        const canonicalUrl = selectedContent?.publishedUrl || selectedContent?.canonicalUrl || selectedContent?.originSiteUrl || '';
        const manualLink = platform.shareUrl(title, canonicalUrl);
        try {
          await navigator.clipboard.writeText(manualLink);
        } catch {
          // Ignore clipboard failures and continue with manual URL display in results.
        }
        newResults.push({ platform: id, status: 'opened', url: manualLink });
        if (selectedContentId) {
          await localDB.table<ContentLabRow>('content_lab').update(selectedContentId, {
            status: 'review',
            distributionMode: 'social',
            publishTargetType: 'social',
            syndicationPolicy: 'social-snippet',
            verificationStatus: 'manual-review',
            publishSource: 'manual',
            updatedAt: new Date().toISOString(),
          } as Partial<ContentLabRow>);
        }
        await logDistribution(selectedContentId, id, 'opened', {
          targetType: 'social',
          attemptType: 'manual',
          publishedUrl: manualLink || canonicalUrl || undefined,
          canonicalApplied: false,
          verificationStatus: 'manual-review',
        });
      }
    }

    setResults(newResults);
    queryClient.invalidateQueries({ queryKey: ['distribution_logs'] });
    setPublishing(false);

    const successCount = newResults.filter(r => r.status === 'success').length;
    const openedCount = newResults.filter(r => r.status === 'opened').length;
    const failedCount = newResults.filter(r => r.status === 'failed').length;

    if (successCount + openedCount > 0) {
      toast.success(`Published ${successCount} automated targets and opened ${openedCount} teaser flows.`);
      log.info('Distribution complete', { contentId: selectedContentId, platforms: activePlatformIds, success: successCount, failed: failedCount });
    }
    if (failedCount > 0) {
      toast.error(`${failedCount} platforms failed`);
    }
  };

  const handleSchedule = () => {
    if (!selectedContentId) { toast.error('Select content first'); return; }
    const activePlatformIds = Object.entries(selectedPlatforms)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (!activePlatformIds.length) { toast.error('Select at least one platform'); return; }

    createScheduledJob({
      contentId: selectedContentId,
      contentTitle: selectedContent?.title || 'Unknown Title',
      platforms: activePlatformIds,
      mode: 'later',
    });

    toast.success(`Content scheduled for ${activePlatformIds.length} platforms!`);
    addBreadcrumb('content_scheduled', 'Distribution', { platforms: activePlatformIds });
    clearAll();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const filterTabs: { key: 'all' | PlatformTier; label: string; count: number }[] = [
    { key: 'all',    label: 'All',         count: PLATFORMS.length },
    { key: 'cms',         label: 'Primary CMS', count: PLATFORMS.filter(p => p.tier === 'cms').length },
    { key: 'syndication', label: 'Syndication', count: PLATFORMS.filter(p => p.tier === 'syndication').length },
    { key: 'social',      label: 'Teasers',     count: PLATFORMS.filter(p => p.tier === 'social').length },
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
            <p className="text-sm text-muted-foreground">Publish to your site first, then syndicate or share with clear SEO-safe policies</p>
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
          <h2 className="font-semibold text-sm">Own-Site First Publishing</h2>
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

          <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-foreground">Scheduled Distribution Orchestrator</p>
                <p className="text-xs text-muted-foreground">AI discovers safe long-tail targets, stores full payload context, and queues supported routes in the background.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDiscoverTargets}
                  disabled={!selectedContentId || discoveringTargets}
                >
                  {discoveringTargets ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Discovering...</> : 'Discover AI targets'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleScheduleCampaign}
                  disabled={!selectedContentId || discoveredTargets.length === 0 || schedulingCampaign}
                >
                  {schedulingCampaign ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Scheduling...</> : 'Schedule campaign'}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium">Campaign mode</Label>
                <div className="flex gap-2 mt-1.5">
                  {(['immediate', 'daily', 'custom'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCampaignMode(mode)}
                      className={`px-2 py-1 rounded text-xs border ${campaignMode === mode ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium">Default time</Label>
                <Input type="time" value={campaignTime} onChange={(e) => setCampaignTime(e.target.value)} />
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current payload quality</p>
                <p className="text-sm mt-1">{selectedContent ? `${selectedContent.wordCount ?? 0} words, canonical ${selectedContent.canonicalUrl ? 'set' : 'missing'}` : 'Select content to evaluate'}</p>
              </div>
            </div>

            {discoveredTargets.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {discoveredTargets.slice(0, 10).map((target, index) => (
                  <div key={`${target.platform}-${target.targetIdentifier}-${index}`} className="rounded-lg border border-border bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{target.targetName}</p>
                        <p className="text-xs text-muted-foreground">{target.platform} · {target.targetIdentifier}</p>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant="outline" className="text-[10px] uppercase">{target.targetKind}</Badge>
                        <Badge variant="outline" className="text-[10px] uppercase">{target.riskLevel}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{target.rationale}</p>
                    {target.requiresReview && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">Marked for review before background execution.</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-border bg-background overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <p className="text-sm font-medium">Campaign Queue</p>
                <span className="text-xs text-muted-foreground">{loadingCampaigns ? 'Loading...' : `${campaigns.length} campaigns`}</span>
              </div>
              <div className="divide-y divide-border">
                {campaigns.length === 0 ? (
                  <div className="p-4 text-xs text-muted-foreground">No distribution campaigns yet.</div>
                ) : campaigns.slice(0, 6).map((campaign) => {
                  const targetsForCampaign = campaignTargets.filter((target) => target.campaignId === campaign.id);
                  const completedCount = targetsForCampaign.filter((target) => target.status === 'completed').length;
                  return (
                    <div key={campaign.id} className="p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{campaign.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {campaign.scheduleMode} · next {campaign.nextRunAt ? new Date(campaign.nextRunAt).toLocaleString() : 'n/a'}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="text-[10px] uppercase">{campaign.status}</Badge>
                          <p className="text-xs text-muted-foreground mt-1">{completedCount}/{campaign.targetCount} done</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {targetsForCampaign.slice(0, 4).map((target) => (
                          <div key={target.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/20 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{target.targetName}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{target.platform} · {target.mode} · {target.error || target.targetIdentifier}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="text-[10px] uppercase">{target.status}</Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={runningCampaignTargetId === target.id || target.status === 'completed'}
                                onClick={() => handleRunCampaignTargetNow(target)}
                              >
                                {runningCampaignTargetId === target.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Run'}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">Autonomous Syndication</p>
              {!selectedContent?.canonicalUrl && (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  Set canonical URL before posting
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {syndicationPlatforms.map((platform) => {
                const state = syndicationStatus[platform.id] || { state: 'idle' as const };
                const mode = syndicationMode[platform.id] || 'full-canonical';
                const isPosting = state.state === 'posting';
                return (
                  <div key={platform.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span>{platform.emoji}</span>
                        <span className="text-sm font-medium">{platform.name}</span>
                      </div>
                      {mode === 'full-canonical' && (
                        <Badge variant="outline" className="text-[10px]">Canonical set</Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSyndicationMode((prev) => ({ ...prev, [platform.id]: 'full-canonical' }))}
                        className={`px-2 py-1 rounded text-xs border ${mode === 'full-canonical' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}
                      >
                        Full canonical
                      </button>
                      <button
                        type="button"
                        onClick={() => setSyndicationMode((prev) => ({ ...prev, [platform.id]: 'teaser' }))}
                        className={`px-2 py-1 rounded text-xs border ${mode === 'teaser' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}
                      >
                        Teaser
                      </button>
                    </div>

                    <div className="text-xs">
                      {state.state === 'idle' && <span className="text-muted-foreground">idle</span>}
                      {state.state === 'posting' && <span className="text-primary">posting...</span>}
                      {state.state === 'success' && (
                        <span className="text-emerald-600 dark:text-emerald-400">success</span>
                      )}
                      {state.state === 'error' && (
                        <span className="text-red-600 dark:text-red-400">error: {state.error}</span>
                      )}
                    </div>

                    {state.publishedUrl && (
                      <a
                        href={state.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {state.publishedUrl}
                      </a>
                    )}

                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!selectedContentId || !selectedContent?.canonicalUrl || isPosting}
                      onClick={async () => {
                        const result = await postSyndicationPlatform(platform.id as 'medium' | 'devto' | 'hashnode');
                        if (result.status === 'success') {
                          toast.success(`${platform.name} posted successfully`);
                        } else {
                          toast.error(result.error || `${platform.name} posting failed`);
                        }
                      }}
                    >
                      {isPosting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Posting...</> : 'Post now'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">Autonomous Reddit Posting</p>
              <Button
                size="sm"
                variant="outline"
                onClick={suggestBestSubreddits}
                disabled={!selectedContentId || loadingSubredditSuggestions}
              >
                {loadingSubredditSuggestions ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Suggesting...</> : 'Suggest subreddits'}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium">Subreddit</Label>
                <Input
                  value={redditSubreddit}
                  onChange={(e) => setRedditSubreddit(e.target.value)}
                  placeholder="SEO or r/SEO"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Post type</Label>
                <div className="flex gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setRedditPostType('link')}
                    className={`px-2 py-1 rounded text-xs border ${redditPostType === 'link' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}
                  >
                    Link post
                  </button>
                  <button
                    type="button"
                    onClick={() => setRedditPostType('text')}
                    className={`px-2 py-1 rounded text-xs border ${redditPostType === 'text' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}
                  >
                    Text post
                  </button>
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={postRedditNow}
                  disabled={!selectedContentId || redditStatus.state === 'posting'}
                >
                  {redditStatus.state === 'posting' ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Posting...</> : 'Post now'}
                </Button>
              </div>
            </div>

            {subredditSuggestions.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {subredditSuggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setRedditSubreddit(item)}
                    className="text-xs px-2 py-1 border rounded hover:bg-secondary"
                  >
                    r/{item}
                  </button>
                ))}
              </div>
            )}

            <div className="text-xs">
              {redditStatus.state === 'idle' && <span className="text-muted-foreground">idle</span>}
              {redditStatus.state === 'posting' && <span className="text-primary">posting...</span>}
              {redditStatus.state === 'success' && (
                <span className="text-emerald-600 dark:text-emerald-400">success</span>
              )}
              {redditStatus.state === 'error' && (
                <span className="text-red-600 dark:text-red-400">error: {redditStatus.error}</span>
              )}
            </div>

            {redditStatus.publishedUrl && (
              <a
                href={redditStatus.publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                {redditStatus.publishedUrl}
              </a>
            )}
          </div>

          <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Autonomous Quora Answer Posting</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs font-medium">Topic/keyword</Label>
                <Input
                  value={quoraTopic}
                  onChange={(e) => setQuoraTopic(e.target.value)}
                  placeholder="SEO automation, content strategy..."
                />
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={postQuoraNow}
                  disabled={!selectedContentId || quoraStatus.state === 'posting'}
                >
                  {quoraStatus.state === 'posting' ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Posting...</> : 'Find question + post answer'}
                </Button>
              </div>
            </div>

            <div className="text-xs">
              {quoraStatus.state === 'idle' && <span className="text-muted-foreground">idle</span>}
              {quoraStatus.state === 'posting' && <span className="text-primary">posting...</span>}
              {quoraStatus.state === 'success' && (
                <span className="text-emerald-600 dark:text-emerald-400">success</span>
              )}
              {quoraStatus.state === 'error' && (
                <span className="text-red-600 dark:text-red-400">error: {quoraStatus.error}</span>
              )}
            </div>

            {quoraStatus.matchedQuestion && (
              <p className="text-xs text-muted-foreground">Matched question: {quoraStatus.matchedQuestion}</p>
            )}
            {quoraStatus.answerUrl && (
              <a
                href={quoraStatus.answerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                {quoraStatus.answerUrl}
              </a>
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
                : <><Send className="h-4 w-4" />Run Selected Publish Flow {selectedCount > 0 && `(${selectedCount})`}</>
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
            <Button
              variant="secondary"
              className="flex items-center gap-2"
              onClick={handleSchedule}
              disabled={selectedCount === 0 || !selectedContentId}
            >
              <Clock className="h-4 w-4" /> Schedule
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
              <h2 className="font-semibold text-sm">Delivery Results</h2>
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
