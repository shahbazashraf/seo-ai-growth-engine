import { localDB, uuidv4 } from '@/lib/local-db';
import { apiUrl, apiHeaders } from '@/lib/api-endpoints';

export type DistributionExecutionStatus =
  | 'queued'
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'failed'
  | 'needs_review'
  | 'skipped';

export type DistributionTargetKind =
  | 'syndication'
  | 'community'
  | 'social'
  | 'outreach'
  | 'aggregator';

export interface DistributionCampaignTarget {
  id: string;
  campaignId: string;
  contentId: string;
  platform: string;
  targetKind: DistributionTargetKind;
  targetName: string;
  targetIdentifier: string;
  mode: 'full-canonical' | 'teaser' | 'answer' | 'pitch' | 'social-snippet';
  rationale: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresReview: boolean;
  status: DistributionExecutionStatus;
  scheduledFor: string;
  executedAt?: string | null;
  publishedUrl?: string | null;
  error?: string | null;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface DistributionCampaign {
  id: string;
  contentId: string;
  title: string;
  scheduleMode: 'immediate' | 'daily' | 'custom';
  timezone: string;
  defaultTime: string;
  status: DistributionExecutionStatus;
  targetCount: number;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface DiscoveryResponseTarget {
  platform: string;
  targetKind: DistributionTargetKind;
  targetName: string;
  targetIdentifier: string;
  mode: 'full-canonical' | 'teaser' | 'answer' | 'pitch' | 'social-snippet';
  rationale: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresReview: boolean;
  metadata?: Record<string, any>;
}

function parseKeywords(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

async function buildLocalFallbackTargets(contentId: string, maxTargets: number): Promise<DiscoveryResponseTarget[]> {
  const content = await localDB.table<any>('content_lab').get(contentId);
  const keywords = parseKeywords(content?.keywords);
  const primaryTopic = keywords[0] || content?.title || 'SEO automation';
  const slugTopic = primaryTopic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'seo';

  const baseTargets: DiscoveryResponseTarget[] = [
    {
      platform: 'medium',
      targetKind: 'syndication',
      targetName: 'Medium',
      targetIdentifier: 'medium',
      mode: 'full-canonical',
      rationale: 'Canonical-friendly syndication for full article distribution.',
      riskLevel: 'low',
      requiresReview: false,
    },
    {
      platform: 'devto',
      targetKind: 'syndication',
      targetName: 'Dev.to',
      targetIdentifier: 'devto',
      mode: 'full-canonical',
      rationale: 'API-supported syndication with canonical URL support.',
      riskLevel: 'low',
      requiresReview: false,
    },
    {
      platform: 'hashnode',
      targetKind: 'syndication',
      targetName: 'Hashnode',
      targetIdentifier: 'hashnode',
      mode: 'full-canonical',
      rationale: 'Canonical-safe reposting for technical or founder audiences.',
      riskLevel: 'low',
      requiresReview: false,
    },
    {
      platform: 'reddit',
      targetKind: 'community',
      targetName: 'r/SEO',
      targetIdentifier: 'SEO',
      mode: 'answer',
      rationale: 'Discussion-style post for an SEO community with subreddit-specific framing.',
      riskLevel: 'medium',
      requiresReview: false,
    },
    {
      platform: 'quora',
      targetKind: 'community',
      targetName: 'Quora question match',
      targetIdentifier: primaryTopic,
      mode: 'answer',
      rationale: 'Answer an intent-matched question and cite the canonical source naturally.',
      riskLevel: 'medium',
      requiresReview: false,
    },
  ];

  const outreachTargets = [
    'resource pages',
    'industry blogs',
    'newsletter editors',
    'startup directories',
    'tool roundups',
    'comparison blogs',
    'community curators',
    'guest post editors',
  ].map((kind) => ({
    platform: 'outreach',
    targetKind: 'outreach' as const,
    targetName: `${primaryTopic} ${kind}`,
    targetIdentifier: `https://example.com/${slugTopic}/${kind.replace(/\s+/g, '-')}`,
    mode: 'pitch' as const,
    rationale: `Use outreach instead of blind posting; this target class can drive links or referral traffic if accepted.`,
    riskLevel: 'medium' as const,
    requiresReview: false,
    metadata: { discoverySource: 'local-fallback', targetClass: kind },
  }));

  return [...baseTargets, ...outreachTargets].slice(0, maxTargets);
}

function parseJsonResponse<T>(response: Response): Promise<T> {
  return response.json().then((payload) => {
    if (!response.ok) {
      const error = (payload as { error?: string }).error || `Request failed (${response.status})`;
      throw new Error(error);
    }
    return payload as T;
  });
}

function nextIsoForTime(timeHHMM: string) {
  const [hours, minutes] = timeHHMM.split(':').map((value) => Number(value || 0));
  const now = new Date();
  const scheduled = new Date(now);
  scheduled.setHours(hours, minutes, 0, 0);
  if (scheduled.getTime() <= now.getTime()) {
    scheduled.setDate(scheduled.getDate() + 1);
  }
  return scheduled.toISOString();
}

export async function discoverDistributionTargets(contentId: string, maxTargets = 24) {
  try {
    const response = await fetch(apiUrl('/api/distribution-orchestrator/discover'), {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ contentId, maxTargets }),
    });
    const payload = await parseJsonResponse<{ success: boolean; targets: DiscoveryResponseTarget[] }>(response);
    return payload.targets || [];
  } catch {
    return await buildLocalFallbackTargets(contentId, maxTargets);
  }
}

export async function createDistributionCampaign(input: {
  contentId: string;
  title: string;
  timezone: string;
  defaultTime: string;
  scheduleMode: 'immediate' | 'daily' | 'custom';
  targets: DiscoveryResponseTarget[];
}) {
  const campaignId = uuidv4();
  const scheduledFor = input.scheduleMode === 'immediate' ? new Date().toISOString() : nextIsoForTime(input.defaultTime);

  const campaign = await localDB.table<DistributionCampaign>('distributionCampaigns').create({
    id: campaignId,
    contentId: input.contentId,
    title: input.title,
    scheduleMode: input.scheduleMode,
    timezone: input.timezone,
    defaultTime: input.defaultTime,
    status: 'scheduled',
    targetCount: input.targets.length,
    nextRunAt: scheduledFor,
  });

  await Promise.all(input.targets.map((target) => localDB.table<DistributionCampaignTarget>('distributionCampaignTargets').create({
    id: uuidv4(),
    campaignId,
    contentId: input.contentId,
    platform: target.platform,
    targetKind: target.targetKind,
    targetName: target.targetName,
    targetIdentifier: target.targetIdentifier,
    mode: target.mode,
    rationale: target.rationale,
    riskLevel: target.riskLevel,
    requiresReview: target.requiresReview,
    status: target.requiresReview ? 'needs_review' : 'scheduled',
    scheduledFor,
    metadata: target.metadata || {},
  })));

  return campaign;
}

export async function getCampaigns() {
  return await localDB.table<DistributionCampaign>('distributionCampaigns').list({ orderBy: { createdAt: 'desc' }, limit: 100 });
}

export async function getCampaignTargets(campaignId: string) {
  return await localDB.table<DistributionCampaignTarget>('distributionCampaignTargets').list({
    where: { campaignId },
    orderBy: { scheduledFor: 'asc' },
    limit: 500,
  });
}

export async function getDueCampaignTargets() {
  const rows = await localDB.table<DistributionCampaignTarget>('distributionCampaignTargets').list({
    orderBy: { scheduledFor: 'asc' },
    limit: 500,
  });
  const now = Date.now();
  return rows.filter((row) => (row.status === 'scheduled' || row.status === 'queued') && new Date(row.scheduledFor).getTime() <= now);
}

export async function executeCampaignTarget(targetId: string) {
  const target = await localDB.table<DistributionCampaignTarget>('distributionCampaignTargets').get(targetId);
  if (!target) throw new Error('Campaign target not found.');

  await localDB.table<DistributionCampaignTarget>('distributionCampaignTargets').update(target.id, {
    status: 'running',
    error: null,
  });

  try {
    if (target.requiresReview) {
      await localDB.table<DistributionCampaignTarget>('distributionCampaignTargets').update(target.id, {
        status: 'needs_review',
        error: 'Manual review required before execution.',
      });
      return;
    }

    let result: { success?: boolean; publishedUrl?: string; error?: string } = {};

    if (['medium', 'devto', 'hashnode'].includes(target.platform)) {
      const response = await fetch(apiUrl('/api/syndication-poster'), {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          contentId: target.contentId,
          platform: target.platform,
          mode: target.mode === 'teaser' ? 'teaser' : 'full-canonical',
        }),
      });
      result = await parseJsonResponse(response);
    } else if (target.platform === 'reddit') {
      const response = await fetch(apiUrl('/api/reddit-poster'), {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          contentId: target.contentId,
          subreddit: target.targetIdentifier,
          postType: target.mode === 'answer' ? 'text' : 'link',
        }),
      });
      result = await parseJsonResponse(response);
    } else if (target.platform === 'quora') {
      const response = await fetch(apiUrl('/api/quora-agent'), {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          contentId: target.contentId,
          topic: target.targetIdentifier,
        }),
      });
      result = await parseJsonResponse(response);
    } else if (target.targetKind === 'outreach') {
      const response = await fetch(apiUrl('/api/outreach-generator/generate'), {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          contentId: target.contentId,
          targetSite: target.targetIdentifier,
          targetEmail: target.metadata?.targetEmail || `editor@${target.targetName.toLowerCase().replace(/\s+/g, '')}.com`,
          outreachType: target.mode === 'pitch' ? 'guest-post' : 'resource-page',
        }),
      });
      result = await parseJsonResponse(response);
    } else {
      throw new Error('Target route is not supported for background automation.');
    }

    const status: DistributionExecutionStatus = result.success === false ? 'failed' : 'completed';
    await localDB.table<DistributionCampaignTarget>('distributionCampaignTargets').update(target.id, {
      status,
      executedAt: new Date().toISOString(),
      publishedUrl: result.publishedUrl || null,
      error: result.error || null,
    });

    const campaignTargets = await getCampaignTargets(target.campaignId);
    const completed = campaignTargets.every((row) => ['completed', 'failed', 'needs_review', 'skipped'].includes(row.id === target.id ? status : row.status));
    await localDB.table<DistributionCampaign>('distributionCampaigns').update(target.campaignId, {
      status: completed ? 'completed' : 'running',
      lastRunAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Distribution target failed.';
    const status: DistributionExecutionStatus = message.includes('(404)') ? 'needs_review' : 'failed';
    await localDB.table<DistributionCampaignTarget>('distributionCampaignTargets').update(target.id, {
      status,
      executedAt: new Date().toISOString(),
      error: status === 'needs_review'
        ? 'Serverless posting route is not available in this local Vite session. Deploy the functions or run a functions dev server, then retry.'
        : message,
    });
  }
}
