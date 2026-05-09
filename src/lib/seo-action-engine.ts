export type RecommendationSource = 'measured' | 'scraped' | 'estimated' | 'ai-suggested';
export type SeoActionType =
  | 'create_article'
  | 'refresh_article'
  | 'improve_metadata'
  | 'improve-content'
  | 'build_internal_links'
  | 'syndicate_content'
  | 'backlink_outreach'
  | 'request-indexation'
  | 'outreach';

export interface SeoAction {
  id: string;
  projectId: string;
  type: SeoActionType;
  title: string;
  summary: string;
  reasoning: string;
  targetUrl?: string | null;
  targetKeyword?: string | null;
  score: number;
  source: RecommendationSource;
  status: 'queued' | 'in_progress' | 'done' | 'skipped';
  createdAt: string;
  updatedAt: string;
}

interface AuditSignal {
  url?: string;
  score?: number;
}

interface KeywordSignal {
  keyword: string;
  volume?: number | null;
  difficulty?: number | null;
}

interface ContentSignal {
  id?: string;
  title?: string | null;
  status?: string | null;
  canonicalUrl?: string | null;
  updatedAt?: string;
  createdAt?: string;
  publishedAt?: string;
  publishTargetType?: 'cms' | 'syndication' | 'social' | null;
  wordCount?: number | null;
  authorityScore?: number | null;
  contentQualityScore?: number | null;
  backlinkCount?: number | null;
}

interface BacklinkSignal {
  source?: RecommendationSource;
}

interface RankingSignal {
  contentId?: string;
  url?: string;
  avgPosition?: number;
  decayDetected?: boolean;
}

interface IndexationSignal {
  contentId?: string;
  url?: string;
  status?: 'INDEXED' | 'NOT_INDEXED' | 'EXCLUDED';
}

interface OutreachSignal {
  contentId?: string;
  status?: 'draft' | 'sent' | 'replied' | 'won' | 'lost';
  sentAt?: string;
}

interface BuildActionInput {
  projectId: string;
  projectName: string;
  siteUrl?: string | null;
  audits?: AuditSignal[];
  keywords?: KeywordSignal[];
  content?: ContentSignal[];
  backlinks?: BacklinkSignal[];
  ranking?: RankingSignal[];
  indexation?: IndexationSignal[];
  outreach?: OutreachSignal[];
}

function clampScore(value: number) {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function recencyScore(updatedAt?: string) {
  if (!updatedAt) return 30;
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays > 180) return 95;
  if (ageDays > 90) return 80;
  if (ageDays > 30) return 60;
  return 30;
}

function daysSince(dateLike?: string) {
  if (!dateLike) return Number.POSITIVE_INFINITY;
  const ageMs = Date.now() - new Date(dateLike).getTime();
  return ageMs / (1000 * 60 * 60 * 24);
}

function createAction(
  projectId: string,
  type: SeoActionType,
  score: number,
  source: RecommendationSource,
  title: string,
  summary: string,
  reasoning: string,
  extras?: Pick<SeoAction, 'targetUrl' | 'targetKeyword'>,
): SeoAction {
  const now = new Date().toISOString();
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 10)}`,
    projectId,
    type,
    title,
    summary,
    reasoning,
    score: clampScore(score),
    source,
    status: 'queued',
    targetUrl: extras?.targetUrl ?? null,
    targetKeyword: extras?.targetKeyword ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildSeoActionQueue(input: BuildActionInput): SeoAction[] {
  const audits = input.audits ?? [];
  const keywords = input.keywords ?? [];
  const content = input.content ?? [];
  const backlinks = input.backlinks ?? [];
  const ranking = input.ranking ?? [];
  const indexation = input.indexation ?? [];
  const outreach = input.outreach ?? [];

  const lowestAudit = [...audits].sort((a, b) => (a.score ?? 100) - (b.score ?? 100))[0];
  const bestKeyword = [...keywords].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];
  const publishedCmsContent = content.filter(item => item.publishTargetType === 'cms' || item.canonicalUrl);
  const staleContent = [...publishedCmsContent].sort((a, b) => recencyScore(b.updatedAt) - recencyScore(a.updatedAt))[0];
  const opportunityBacklinks = backlinks.filter(link => link.source === 'ai-suggested').length;
  const decayingPages = ranking.filter((row) => row.decayDetected);
  const notIndexedPages = indexation.filter((row) => row.status === 'NOT_INDEXED');

  const actions: SeoAction[] = [];

  const outreachByContentId = new Map<string, OutreachSignal[]>();
  outreach.forEach((record) => {
    if (!record.contentId) return;
    const bucket = outreachByContentId.get(record.contentId) || [];
    bucket.push(record);
    outreachByContentId.set(record.contentId, bucket);
  });

  const outreachCandidates = publishedCmsContent.filter((item) => {
    const contentId = item.id;
    if (!contentId) return false;
    const ageDays = daysSince(item.publishedAt || item.createdAt || item.updatedAt);
    const sentRecords = (outreachByContentId.get(contentId) || []).filter((row) => row.status === 'sent' || row.status === 'replied' || row.status === 'won');
    return ageDays >= 7 && sentRecords.length === 0;
  });

  if (bestKeyword) {
    actions.push(createAction(
      input.projectId,
      'create_article',
      78 + Math.min((bestKeyword.volume ?? 0) / 200, 12),
      bestKeyword.volume ? 'estimated' : 'ai-suggested',
      `Create a money page around "${bestKeyword.keyword}"`,
      `Publish a primary article on ${input.projectName} before spending time on syndication.`,
      'Uncovered keyword demand is usually a stronger lift than posting summaries on third-party sites first.',
      { targetKeyword: bestKeyword.keyword, targetUrl: input.siteUrl ?? null },
    ));
  }

  if (notIndexedPages.length > 0) {
    const target = notIndexedPages[0];
    actions.push(createAction(
      input.projectId,
      'request-indexation',
      98,
      'measured',
      'Page not indexed — submit to Google',
      'Request indexation for a published page that is not currently indexed.',
      'Indexing blockers can suppress all ranking gains, so this action gets top priority.',
      { targetUrl: target.url ?? input.siteUrl ?? null },
    ));
  }

  if (decayingPages.length > 0) {
    const decayingTarget = decayingPages.sort((a, b) => (b.avgPosition ?? 0) - (a.avgPosition ?? 0))[0];
    actions.push(createAction(
      input.projectId,
      'refresh_article',
      70 + 30,
      'measured',
      'Refresh a decaying page from ranking data',
      'This page has lost average ranking position and needs a content refresh cycle.',
      'Measured decay from Search Console snapshots indicates this URL is slipping and should be updated now.',
      { targetUrl: decayingTarget.url ?? input.siteUrl ?? null },
    ));
  }

  if (staleContent?.canonicalUrl || staleContent?.title) {
    actions.push(createAction(
      input.projectId,
      'refresh_article',
      recencyScore(staleContent.updatedAt),
      'estimated',
      `Refresh ${staleContent.title || 'your older published page'}`,
      'Update an existing page before writing another net-new post if freshness is drifting.',
      'Refreshes often convert faster than net-new content because the page may already have impressions and internal links.',
      { targetUrl: staleContent.canonicalUrl ?? input.siteUrl ?? null },
    ));
  }

  if (lowestAudit && (lowestAudit.score ?? 100) < 80) {
    actions.push(createAction(
      input.projectId,
      'improve_metadata',
      82 - ((lowestAudit.score ?? 60) / 4),
      'measured',
      'Tighten on-page SEO on your weakest audited page',
      'Improve title, meta description, and heading structure before adding more distribution.',
      `Your lowest observed audit score is ${lowestAudit.score ?? 'unknown'}, so cleanup work is likely blocking rank improvements.`,
      { targetUrl: lowestAudit.url ?? input.siteUrl ?? null },
    ));
  }

  if (publishedCmsContent.length >= 2) {
    actions.push(createAction(
      input.projectId,
      'build_internal_links',
      74,
      'estimated',
      'Add contextual internal links across your published cluster',
      'Strengthen topical authority by linking newer and older pages together.',
      'Internal linking is one of the highest-leverage changes once you already have more than one page live.',
      { targetUrl: input.siteUrl ?? null },
    ));
  }

  if (publishedCmsContent.length > 0) {
    actions.push(createAction(
      input.projectId,
      'syndicate_content',
      62,
      'ai-suggested',
      'Create canonical-safe syndication derivatives',
      'Repurpose your strongest own-site page into teaser, canonical repost, and social variants.',
      'Syndication should support the original URL, not replace it, so it ranks below own-site publishing and on-page fixes.',
      { targetUrl: publishedCmsContent[0].canonicalUrl ?? input.siteUrl ?? null },
    ));
  }

  if (publishedCmsContent.length > 0) {
    actions.push(createAction(
      input.projectId,
      'backlink_outreach',
      58 + Math.min(opportunityBacklinks * 2, 14),
      opportunityBacklinks > 0 ? 'ai-suggested' : 'estimated',
      'Prepare outreach for your strongest published page',
      'Generate link angles, email drafts, and target lists only after the page is publish-ready.',
      'Backlink promotion works better after your core page is live, internally linked, and worth citing.',
      { targetUrl: publishedCmsContent[0].canonicalUrl ?? input.siteUrl ?? null },
    ));
  }

  if (outreachCandidates.length > 0) {
    const scoredCandidates = outreachCandidates.map((item) => {
      const authority = Number(item.authorityScore ?? 55);
      const quality = Number(item.contentQualityScore ?? (item.wordCount && item.wordCount > 1000 ? 65 : 45));
      const backlinksCount = Number(item.backlinkCount ?? 0);
      const score = Math.min(100, Math.round(authority * 0.45 + quality * 0.4 + Math.min(backlinksCount * 4, 20)));
      return { item, authority, quality, backlinksCount, score };
    }).sort((a, b) => b.score - a.score);

    const best = scoredCandidates[0];
    if (best.score > 70) {
      actions.push(createAction(
        input.projectId,
        'outreach',
        Math.min(100, best.score + 20),
        'estimated',
        `Start outreach for ${best.item.title || 'your strongest published page'}`,
        'This page has enough authority and quality to justify immediate backlink outreach.',
        `Scored by authority (${best.authority}), quality (${best.quality}), and backlink baseline (${best.backlinksCount}).`,
        { targetUrl: best.item.canonicalUrl ?? input.siteUrl ?? null },
      ));
    } else {
      actions.push(createAction(
        input.projectId,
        'improve-content',
        Math.max(60, best.score + 15),
        'estimated',
        `Improve content quality before outreach: ${best.item.title || 'target page'}`,
        'This page is currently too thin or weak for efficient outreach conversion.',
        `Outreach is suppressed until quality improves (authority ${best.authority}, quality ${best.quality}, backlinks ${best.backlinksCount}).`,
        { targetUrl: best.item.canonicalUrl ?? input.siteUrl ?? null },
      ));
    }
  }

  return actions.sort((a, b) => b.score - a.score);
}
