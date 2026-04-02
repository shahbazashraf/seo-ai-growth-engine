import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CompetitorData {
  url: string;
  title: string;
  wordCount: number;
  snippet: string;
  headings: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { keyword } = await req.json();
    if (!keyword) {
      return new Response(JSON.stringify({ error: "Keyword is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const blink = createClient({
      projectId: Deno.env.get("BLINK_PROJECT_ID")!,
      secretKey: Deno.env.get("BLINK_SECRET_KEY")!,
    });

    // 1. Scrape DuckDuckGo HTML for top organic links
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}`;
    const ddgRes = await fetch(ddgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/100.0.4896.127",
      },
    });

    if (!ddgRes.ok) throw new Error("Failed to search engine");

    const html = await ddgRes.text();
    
    // Simple regex to parse DuckDuckGo organic search results
    const resultRegex = /<a class="result__url" href="([^"]+)">(.*?)<\/a>/gi;
    const snippetRegex = /<a class="result__snippet[^>]*>(.*?)<\/a>/gi;
    
    const urls: string[] = [];
    let match;
    while ((match = resultRegex.exec(html)) !== null && urls.length < 3) {
      // Decode DuckDuckGo redirect url
      const ddgHref = match[1];
      try {
        const urlParams = new URLSearchParams(ddgHref.split('?')[1]);
        if (urlParams.has('uddg')) {
          urls.push(decodeURIComponent(urlParams.get('uddg')!));
        } else if (ddgHref.startsWith('http')) {
           urls.push(ddgHref);
        }
      } catch {
        // Skip
      }
    }

    // 2. Visit Top 3 competitors and scrape their contents
    const competitors: CompetitorData[] = [];
    
    for (const url of urls) {
      try {
        let compHtml = '';
        try {
          const compRes = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
          if (!compRes.ok) continue;
          compHtml = await compRes.text();
        } catch {
          // Try cors proxy fallback
          const proxyRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
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
          snippet: bodyText.substring(0, 160).trim() + "...",
          headings,
        });

      } catch (err) {
        console.error("Failed scraping competitor: " + url);
      }
    }

    // 3. Fallback to AI generation if scraping fails
    if (competitors.length === 0) {
      throw new Error("Could not scrape competitor data. Try another keyword.");
    }

    return new Response(JSON.stringify({ competitors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("SERP Analyzer error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
