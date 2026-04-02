import { createLogger } from './logger';

const log = createLogger('SerpAnalyzer');

export interface CompetitorData {
  url: string;
  title: string;
  wordCount: number;
  snippet: string;
  headings: string[];
}

export async function runSerpScrape(keyword: string): Promise<CompetitorData[]> {
  log.info('Running genuine SERP scrape for', { keyword });

  // 1. Scrape DuckDuckGo HTML for top organic links using a CORS proxy
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}`;
  let html = '';
  try {
    const proxyRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(ddgUrl)}`);
    html = await proxyRes.text();
  } catch (error) {
    throw new Error("Failed to fetch SERP engine via proxy");
  }

  // 2. Parse DuckDuckGo organic search results
  const resultRegex = /<a class="result__url" href="([^"]+)">(.*?)<\/a>/gi;
  const urls: string[] = [];
  let match;
  while ((match = resultRegex.exec(html)) !== null && urls.length < 5) { // get top 5
    const ddgHref = match[1];
    try {
      if (ddgHref.includes('uddg=')) {
        const urlParams = new URL(ddgHref, 'https://example.com').searchParams;
        if (urlParams.has('uddg')) {
          urls.push(decodeURIComponent(urlParams.get('uddg')!));
        }
      } else if (ddgHref.startsWith('http')) {
        urls.push(ddgHref);
      }
    } catch {
      // Skip invalid urls
    }
  }

  // 3. Visit Top 3-5 competitors and scrape their contents
  const competitors: CompetitorData[] = [];
  log.info('Found SERP urls, scraping individual targets', { urls });

  for (const url of urls) {
    if (competitors.length >= 3) break; // Limit to Top 3 to save time

    try {
      let compHtml = '';
      try {
        const compRes = await fetch(url, { signal: AbortSignal.timeout(6000) });
        compHtml = await compRes.text();
      } catch {
        // Proxy fallback
        const proxyRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
        compHtml = await proxyRes.text();
      }

      const titleMatch = compHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : url;
      
      const bodyText = compHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
        
      const wordCount = bodyText.split(/\s+/).filter(w => w.length > 2).length;

      const hRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
      const headings: string[] = [];
      let hMatch;
      while ((hMatch = hRegex.exec(compHtml)) !== null && headings.length < 15) {
         headings.push(hMatch[1].replace(/<[^>]+>/g, '').trim());
      }

      competitors.push({
        url,
        title,
        wordCount,
        snippet: bodyText.substring(0, 300).trim(),
        headings,
      });

    } catch (err) {
      log.error('Failed scraping competitor', { url });
    }
  }

  if (competitors.length === 0) {
    throw new Error('Failed to scrape any competitor data.');
  }

  return competitors;
}
