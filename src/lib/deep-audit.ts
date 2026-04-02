// ─── Deep Audit Engine ───────────────────────────────────────────────────────
// Enhanced SEO audit with sub-scores, structured data detection, keyword density,
// heading hierarchy analysis, internal/external link analysis, and competitor comparison.

import { createLogger } from './logger';

const log = createLogger('DeepAudit');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuditSubScores {
  technical: number;   // 0-100
  content: number;     // 0-100
  performance: number; // 0-100
  onPage: number;      // 0-100
}

export interface HeadingInfo {
  tag: string;
  text: string;
  level: number;
}

export interface LinkInfo {
  href: string;
  text: string;
  type: 'internal' | 'external';
  nofollow: boolean;
}

export interface MetaTagInfo {
  title: string;
  titleLength: number;
  description: string;
  descriptionLength: number;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterCard: string;
  twitterTitle: string;
  canonical: string;
  viewport: boolean;
  robots: string;
  charset: string;
}

export interface StructuredDataInfo {
  hasJsonLd: boolean;
  schemas: string[];  // e.g. ["Article", "Organization", "BreadcrumbList"]
  rawJsonLd: string[];
}

export interface ImageInfo {
  src: string;
  alt: string;
  hasAlt: boolean;
  isLazy: boolean;
}

export interface KeywordDensity {
  word: string;
  count: number;
  density: number; // percentage
}

export interface DeepAuditResult {
  url: string;
  score: number;
  subScores: AuditSubScores;
  meta: MetaTagInfo;
  headings: HeadingInfo[];
  headingHierarchyValid: boolean;
  links: {
    internal: number;
    external: number;
    broken: number;
    nofollow: number;
    items: LinkInfo[];
  };
  images: {
    total: number;
    withAlt: number;
    withoutAlt: number;
    lazy: number;
    items: ImageInfo[];
  };
  structuredData: StructuredDataInfo;
  keywordDensity: KeywordDensity[];
  wordCount: number;
  responseTime: number;
  issues: AuditIssue[];
  recommendations: string[];
  pageSpeedHints: string[];
  screenshots: {
    desktop: string;
    mobile: string;
  };
}

export interface AuditIssue {
  check: string;
  severity: 'critical' | 'warning' | 'info';
  detail: string;
  passed: boolean;
  category: 'technical' | 'content' | 'performance' | 'on-page';
}

// ─── HTML Parsing Utilities ──────────────────────────────────────────────────

function extractMetaTags(html: string, url: string): MetaTagInfo {
  const get = (pattern: RegExp): string => {
    const match = html.match(pattern);
    return match ? match[1]?.trim() || '' : '';
  };

  const title = get(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);

  return {
    title,
    titleLength: title.length,
    description,
    descriptionLength: description.length,
    ogTitle: get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i),
    ogDescription: get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i),
    ogImage: get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i),
    twitterCard: get(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']+)["']/i),
    twitterTitle: get(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i),
    canonical: get(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i),
    viewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    robots: get(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i),
    charset: /<meta[^>]+charset=/i.test(html) ? 'detected' : '',
  };
}

function extractHeadings(html: string): HeadingInfo[] {
  const headingRegex = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  const headings: HeadingInfo[] = [];
  let match;

  while ((match = headingRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    headings.push({
      tag,
      text,
      level: parseInt(tag[1]),
    });
  }

  return headings;
}

function validateHeadingHierarchy(headings: HeadingInfo[]): boolean {
  if (headings.length === 0) return false;

  // Check: exactly one H1
  const h1Count = headings.filter(h => h.level === 1).length;
  if (h1Count !== 1) return false;

  // Check: H1 comes first
  if (headings[0]?.level !== 1) return false;

  // Check: no level skipping (e.g., H1 → H3 without H2)
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      return false;
    }
  }

  return true;
}

function extractLinks(html: string, baseUrl: string): LinkInfo[] {
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links: LinkInfo[] = [];
  let match;
  let baseDomain = '';
  try { baseDomain = new URL(baseUrl).hostname; } catch { /* ignore */ }

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    const fullTag = match[0];

    let type: 'internal' | 'external' = 'external';
    try {
      const linkUrl = new URL(href, baseUrl);
      if (linkUrl.hostname === baseDomain) type = 'internal';
    } catch {
      if (href.startsWith('/') || href.startsWith('#')) type = 'internal';
    }

    links.push({
      href,
      text: text.substring(0, 100),
      type,
      nofollow: /rel=["'][^"']*nofollow/i.test(fullTag),
    });
  }

  return links;
}

function extractImages(html: string): ImageInfo[] {
  const imgRegex = /<img[^>]+>/gi;
  const images: ImageInfo[] = [];
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    const altMatch = tag.match(/alt=["']([^"']*)["']/i);

    images.push({
      src: srcMatch?.[1] || '',
      alt: altMatch?.[1] || '',
      hasAlt: altMatch != null && altMatch[1].length > 0,
      isLazy: /loading=["']lazy["']/i.test(tag) || /data-src/i.test(tag),
    });
  }

  return images;
}

function extractStructuredData(html: string): StructuredDataInfo {
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const schemas: string[] = [];
  const rawJsonLd: string[] = [];
  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    const raw = match[1].trim();
    rawJsonLd.push(raw);
    try {
      const parsed = JSON.parse(raw);
      if (parsed['@type']) schemas.push(parsed['@type']);
      if (Array.isArray(parsed['@graph'])) {
        parsed['@graph'].forEach((item: any) => {
          if (item['@type']) schemas.push(item['@type']);
        });
      }
    } catch { /* invalid JSON-LD */ }
  }

  return {
    hasJsonLd: rawJsonLd.length > 0,
    schemas: [...new Set(schemas)],
    rawJsonLd,
  };
}

function calculateKeywordDensity(html: string): KeywordDensity[] {
  // Strip HTML tags, scripts, styles
  const textOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const words = textOnly.split(/\s+/).filter(w => w.length > 3);
  const totalWords = words.length;
  if (totalWords === 0) return [];

  // Count word frequency
  const freq: Record<string, number> = {};
  const stopWords = new Set([
    'that', 'this', 'with', 'from', 'your', 'have', 'will', 'been', 'they',
    'their', 'what', 'when', 'where', 'which', 'would', 'could', 'should',
    'there', 'about', 'more', 'also', 'than', 'very', 'just', 'into',
    'over', 'some', 'other', 'were', 'them', 'does', 'each', 'here',
  ]);

  words.forEach(w => {
    const clean = w.replace(/[^a-z0-9]/g, '');
    if (clean.length > 3 && !stopWords.has(clean)) {
      freq[clean] = (freq[clean] || 0) + 1;
    }
  });

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({
      word,
      count,
      density: Math.round((count / totalWords) * 10000) / 100,
    }));
}

// ─── Page Speed Hints ────────────────────────────────────────────────────────

function getPageSpeedHints(html: string, responseTime: number): string[] {
  const hints: string[] = [];

  // Large inline styles
  const styleBlocks = html.match(/<style[\s\S]*?<\/style>/gi) || [];
  const totalStyleLength = (styleBlocks as string[]).reduce((acc: number, s: string) => acc + s.length, 0);
  if (totalStyleLength > 50000) {
    hints.push('Large inline CSS detected — consider extracting to external stylesheet');
  }

  // Inline scripts
  const scriptBlocks = html.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi) || [];
  if (scriptBlocks.length > 5) {
    hints.push(`${scriptBlocks.length} inline scripts found — consider bundling or deferring`);
  }

  // Render-blocking resources
  const blockingCss = (html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || [])
    .filter(l => !/media=["']print["']/i.test(l));
  if (blockingCss.length > 3) {
    hints.push(`${blockingCss.length} render-blocking CSS files — consider critical CSS inlining`);
  }

  // Image optimization
  const images = html.match(/<img[^>]+>/gi) || [];
  const nonLazy = images.filter(img => !/loading=["']lazy["']/i.test(img));
  if (nonLazy.length > 5) {
    hints.push(`${nonLazy.length} images without lazy loading — add loading="lazy" attribute`);
  }

  // Response time
  if (responseTime > 2000) {
    hints.push(`Slow server response (${responseTime}ms) — consider CDN or server optimization`);
  }

  // Large HTML
  if (html.length > 500000) {
    hints.push(`Large HTML size (${Math.round(html.length / 1024)}KB) — consider code splitting`);
  }

  // No compression hint
  if (!/<meta[^>]+content-encoding/i.test(html)) {
    hints.push('Enable gzip/brotli compression for faster transfer');
  }

  return hints;
}

// ─── Sub-Score Calculation ───────────────────────────────────────────────────

function calculateSubScores(issues: AuditIssue[]): AuditSubScores {
  const calculate = (category: AuditIssue['category']): number => {
    const categoryIssues = issues.filter(i => i.category === category);
    if (categoryIssues.length === 0) return 100;

    let score = 100;
    categoryIssues.forEach(issue => {
      if (!issue.passed) {
        if (issue.severity === 'critical') score -= 20;
        else if (issue.severity === 'warning') score -= 8;
      }
    });
    return Math.max(0, Math.min(100, score));
  };

  return {
    technical: calculate('technical'),
    content: calculate('content'),
    performance: calculate('performance'),
    onPage: calculate('on-page'),
  };
}

// ─── Main Deep Audit Function ────────────────────────────────────────────────

export async function runDeepAudit(targetUrl: string): Promise<DeepAuditResult> {
  log.info('Starting deep audit', { url: targetUrl });
  const startTime = performance.now();

  let html = '';
  let fetchOk = false;
  let responseTime = 0;

  // Fetch the page
  const fetchStart = Date.now();
  try {
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    html = await res.text();
    fetchOk = res.ok;
  } catch {
    try {
      const proxyRes = await fetch(
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        { signal: AbortSignal.timeout(15000) }
      );
      html = await proxyRes.text();
      fetchOk = proxyRes.ok;
    } catch {
      fetchOk = false;
    }
  }
  responseTime = Date.now() - fetchStart;

  // Extract all data
  const meta = extractMetaTags(html, targetUrl);
  const headings = extractHeadings(html);
  const headingHierarchyValid = validateHeadingHierarchy(headings);
  const linkItems = extractLinks(html, targetUrl);
  const imageItems = extractImages(html);
  const structuredData = extractStructuredData(html);
  const keywordDensity = calculateKeywordDensity(html);
  const pageSpeedHints = getPageSpeedHints(html, responseTime);

  // Calculate word count
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = bodyText.split(/\s+/).filter(w => w.length > 2).length;

  // ── Run all checks ──────────────────────────────────────────────────────

  const issues: AuditIssue[] = [];

  // TECHNICAL CHECKS
  if (!targetUrl.startsWith('https://')) {
    issues.push({ check: 'HTTPS', severity: 'critical', detail: 'Site is not using HTTPS.', passed: false, category: 'technical' });
  } else {
    issues.push({ check: 'HTTPS', severity: 'info', detail: 'Site uses HTTPS.', passed: true, category: 'technical' });
  }

  if (!fetchOk) {
    issues.push({ check: 'Page Reachability', severity: 'critical', detail: 'Could not fetch the page.', passed: false, category: 'technical' });
  }

  if (!meta.canonical) {
    issues.push({ check: 'Canonical Tag', severity: 'warning', detail: 'No canonical tag found.', passed: false, category: 'technical' });
  } else {
    issues.push({ check: 'Canonical Tag', severity: 'info', detail: `Canonical: ${meta.canonical}`, passed: true, category: 'technical' });
  }

  if (!meta.viewport) {
    issues.push({ check: 'Mobile Viewport', severity: 'warning', detail: 'No viewport meta tag.', passed: false, category: 'technical' });
  } else {
    issues.push({ check: 'Mobile Viewport', severity: 'info', detail: 'Viewport meta tag present.', passed: true, category: 'technical' });
  }

  if (!meta.charset) {
    issues.push({ check: 'Character Encoding', severity: 'warning', detail: 'No charset meta tag detected.', passed: false, category: 'technical' });
  } else {
    issues.push({ check: 'Character Encoding', severity: 'info', detail: 'Charset declared.', passed: true, category: 'technical' });
  }

  if (meta.robots && /noindex/i.test(meta.robots)) {
    issues.push({ check: 'Robots Noindex', severity: 'critical', detail: 'Page has noindex directive — it will NOT appear in search.', passed: false, category: 'technical' });
  }

  // Structured data
  if (!structuredData.hasJsonLd) {
    issues.push({ check: 'Structured Data', severity: 'warning', detail: 'No JSON-LD structured data found. Add Schema.org markup.', passed: false, category: 'technical' });
  } else {
    issues.push({ check: 'Structured Data', severity: 'info', detail: `Found schemas: ${structuredData.schemas.join(', ')}`, passed: true, category: 'technical' });
  }

  // ON-PAGE CHECKS
  if (!meta.title) {
    issues.push({ check: 'Title Tag', severity: 'critical', detail: 'No <title> tag found.', passed: false, category: 'on-page' });
  } else if (meta.titleLength < 30) {
    issues.push({ check: 'Title Length', severity: 'warning', detail: `Title too short (${meta.titleLength} chars). Aim for 30-60.`, passed: false, category: 'on-page' });
  } else if (meta.titleLength > 60) {
    issues.push({ check: 'Title Length', severity: 'warning', detail: `Title may be truncated (${meta.titleLength} chars). Keep under 60.`, passed: false, category: 'on-page' });
  } else {
    issues.push({ check: 'Title Tag', severity: 'info', detail: `"${meta.title.substring(0, 60)}" (${meta.titleLength} chars)`, passed: true, category: 'on-page' });
  }

  if (!meta.description) {
    issues.push({ check: 'Meta Description', severity: 'critical', detail: 'No meta description found.', passed: false, category: 'on-page' });
  } else if (meta.descriptionLength < 120) {
    issues.push({ check: 'Meta Description Length', severity: 'warning', detail: `Too short (${meta.descriptionLength} chars). Aim for 120-160.`, passed: false, category: 'on-page' });
  } else if (meta.descriptionLength > 160) {
    issues.push({ check: 'Meta Description Length', severity: 'warning', detail: `May be truncated (${meta.descriptionLength} chars).`, passed: false, category: 'on-page' });
  } else {
    issues.push({ check: 'Meta Description', severity: 'info', detail: `Well-optimized (${meta.descriptionLength} chars).`, passed: true, category: 'on-page' });
  }

  // OG Tags
  if (!meta.ogTitle) {
    issues.push({ check: 'Open Graph Title', severity: 'warning', detail: 'No og:title tag. Social shares will look bare.', passed: false, category: 'on-page' });
  } else {
    issues.push({ check: 'Open Graph Tags', severity: 'info', detail: 'OG tags present.', passed: true, category: 'on-page' });
  }

  if (!meta.ogImage) {
    issues.push({ check: 'OG Image', severity: 'warning', detail: 'No og:image. Social shares need a preview image.', passed: false, category: 'on-page' });
  }

  // Twitter Card
  if (!meta.twitterCard) {
    issues.push({ check: 'Twitter Card', severity: 'warning', detail: 'No twitter:card meta tag.', passed: false, category: 'on-page' });
  } else {
    issues.push({ check: 'Twitter Card', severity: 'info', detail: `Card type: ${meta.twitterCard}`, passed: true, category: 'on-page' });
  }

  // Heading hierarchy
  const h1Count = headings.filter(h => h.level === 1).length;
  if (h1Count === 0) {
    issues.push({ check: 'H1 Tag', severity: 'critical', detail: 'No H1 tag found.', passed: false, category: 'on-page' });
  } else if (h1Count > 1) {
    issues.push({ check: 'H1 Count', severity: 'warning', detail: `${h1Count} H1 tags found. Use exactly one.`, passed: false, category: 'on-page' });
  } else {
    issues.push({ check: 'H1 Tag', severity: 'info', detail: `H1: "${headings.find(h => h.level === 1)?.text.substring(0, 60)}"`, passed: true, category: 'on-page' });
  }

  if (!headingHierarchyValid) {
    issues.push({ check: 'Heading Hierarchy', severity: 'warning', detail: 'Heading levels skip (e.g., H1→H3). Use sequential hierarchy.', passed: false, category: 'on-page' });
  } else {
    issues.push({ check: 'Heading Hierarchy', severity: 'info', detail: `${headings.length} headings in proper order.`, passed: true, category: 'on-page' });
  }

  // CONTENT CHECKS
  if (wordCount < 300) {
    issues.push({ check: 'Content Length', severity: 'warning', detail: `~${wordCount} words. Thin content hurts rankings.`, passed: false, category: 'content' });
  } else if (wordCount > 1000) {
    issues.push({ check: 'Content Length', severity: 'info', detail: `~${wordCount} words. Great depth.`, passed: true, category: 'content' });
  } else {
    issues.push({ check: 'Content Length', severity: 'info', detail: `~${wordCount} words. Decent coverage.`, passed: true, category: 'content' });
  }

  // Images
  const withoutAlt = imageItems.filter(img => !img.hasAlt);
  if (withoutAlt.length > 0) {
    const sev = withoutAlt.length >= 5 ? 'critical' : 'warning';
    issues.push({ check: 'Image Alt Text', severity: sev, detail: `${withoutAlt.length}/${imageItems.length} images missing alt text.`, passed: false, category: 'content' });
  } else if (imageItems.length > 0) {
    issues.push({ check: 'Image Alt Text', severity: 'info', detail: `All ${imageItems.length} images have alt text.`, passed: true, category: 'content' });
  }

  // Internal links
  const internalLinks = linkItems.filter(l => l.type === 'internal');
  const externalLinks = linkItems.filter(l => l.type === 'external');
  if (internalLinks.length < 2) {
    issues.push({ check: 'Internal Links', severity: 'warning', detail: `Only ${internalLinks.length} internal links. Add more for SEO.`, passed: false, category: 'content' });
  } else {
    issues.push({ check: 'Internal Links', severity: 'info', detail: `${internalLinks.length} internal links found.`, passed: true, category: 'content' });
  }

  // PERFORMANCE CHECKS
  if (responseTime > 3000) {
    issues.push({ check: 'Server Response', severity: 'critical', detail: `${responseTime}ms (>3s is too slow).`, passed: false, category: 'performance' });
  } else if (responseTime > 1500) {
    issues.push({ check: 'Server Response', severity: 'warning', detail: `${responseTime}ms (aim for under 1.5s).`, passed: false, category: 'performance' });
  } else {
    issues.push({ check: 'Server Response', severity: 'info', detail: `${responseTime}ms. Fast!`, passed: true, category: 'performance' });
  }

  const nonLazyImages = imageItems.filter(img => !img.isLazy);
  if (nonLazyImages.length > 3) {
    issues.push({ check: 'Lazy Loading', severity: 'warning', detail: `${nonLazyImages.length} images not lazy-loaded.`, passed: false, category: 'performance' });
  } else if (imageItems.length > 0) {
    issues.push({ check: 'Lazy Loading', severity: 'info', detail: 'Images use lazy loading.', passed: true, category: 'performance' });
  }

  if (html.length > 300000) {
    issues.push({ check: 'Page Size', severity: 'warning', detail: `HTML is ${Math.round(html.length / 1024)}KB. Consider optimization.`, passed: false, category: 'performance' });
  }

  // Calculate scores
  const subScores = calculateSubScores(issues);
  const overallScore = Math.round(
    subScores.technical * 0.3 +
    subScores.content * 0.25 +
    subScores.performance * 0.2 +
    subScores.onPage * 0.25
  );

  const duration = Math.round(performance.now() - startTime);
  log.info('Deep audit complete', { url: targetUrl, score: overallScore, duration });

  return {
    url: targetUrl,
    score: Math.max(0, Math.min(100, overallScore)),
    subScores,
    meta,
    headings,
    headingHierarchyValid,
    links: {
      internal: internalLinks.length,
      external: externalLinks.length,
      broken: 0, // Would need async checking
      nofollow: linkItems.filter(l => l.nofollow).length,
      items: linkItems.slice(0, 50),
    },
    images: {
      total: imageItems.length,
      withAlt: imageItems.filter(i => i.hasAlt).length,
      withoutAlt: withoutAlt.length,
      lazy: imageItems.filter(i => i.isLazy).length,
      items: imageItems.slice(0, 30),
    },
    structuredData,
    keywordDensity,
    wordCount,
    responseTime,
    issues,
    recommendations: [], // Will be filled by AI
    pageSpeedHints,
    screenshots: {
      desktop: `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&screenshot=true&embed=screenshot.url`,
      mobile: `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&screenshot=true&embed=screenshot.url&viewport.width=375&viewport.height=812&viewport.isMobile=true`,
    }
  };
}
