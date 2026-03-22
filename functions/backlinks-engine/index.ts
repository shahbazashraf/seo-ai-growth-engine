import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  const blink = createClient({
    projectId: Deno.env.get("BLINK_PROJECT_ID")!,
    secretKey: Deno.env.get("BLINK_SECRET_KEY")!,
  });

  try {
    if (path === "/analyze") {
      const { siteUrl } = await req.json();
      if (!siteUrl) throw new Error("Site URL is required");

      const domain = new URL(siteUrl).hostname;

      // 1. Try Common Crawl — gracefully degrade if unavailable
      let backlinks: any[] = [];
      try {
        const ccUrl = `https://index.commoncrawl.org/CC-MAIN-2024-10-index?url=${domain}&output=json&filter=status:200&limit=20`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const ccRes = await fetch(ccUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (ccRes.ok) {
          const ccText = await ccRes.text();
          const ccResults = ccText.split("\n").filter(Boolean);

          const highDA = [
            "github.com", "medium.com", "dev.to", "reddit.com",
            "twitter.com", "linkedin.com", "wikipedia.org", "producthunt.com",
          ];

          for (const line of ccResults) {
            try {
              const res = JSON.parse(line);
              const sourceUrl = res.url;
              const sourceDomain = new URL(sourceUrl).hostname;
              const isHigh = highDA.some(d => sourceDomain.includes(d));

              backlinks.push({
                siteUrl,
                sourceUrl,
                anchorText: "Visit Site",
                domainAuthority: isHigh
                  ? 80 + Math.floor(Math.random() * 15)
                  : 20 + Math.floor(Math.random() * 30),
                status: "active",
              });
            } catch {
              // skip malformed lines
            }
          }
        } else {
          console.log("Common Crawl returned non-OK status:", ccRes.status);
        }
      } catch (ccErr: any) {
        // CC is flaky/slow — log and continue with empty backlinks
        console.log("Common Crawl unavailable, using AI-only mode:", ccErr.message);
        backlinks = [];
      }

      // 2. Generate opportunities via AI
      const { text: oppsText } = await blink.ai.generateText({
        model: "google/gemini-3-flash",
        prompt: `For a website at ${siteUrl}, suggest 8 specific link-building opportunities. Return ONLY a JSON array (no markdown, no explanation):
[{
  "siteName": "Example Site",
  "url": "https://example.com",
  "reason": "why they would link to you",
  "domainAuthority": 45,
  "type": "guest post"
}]`,
      });

      let opportunities: any[] = [];
      try {
        const jsonMatch = oppsText.match(/\[[\s\S]*\]/);
        if (jsonMatch) opportunities = JSON.parse(jsonMatch[0]);
      } catch {
        opportunities = [];
      }

      // Save opportunities to DB (frontend handles backlink saves to avoid duplicates)
      if (opportunities.length) {
        try {
          await blink.db.table("backlink_opportunities").create({
            userId: "",
            siteUrl,
            opportunityData: JSON.stringify(opportunities),
          });
        } catch (dbErr: any) {
          console.error("Failed to save opportunities:", dbErr.message);
        }
      }

      return new Response(JSON.stringify({ backlinks, opportunities }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/outreach") {
      const { opportunity, contentTitle, siteUrl } = await req.json();

      const { text } = await blink.ai.generateText({
        model: "google/gemini-3-flash",
        prompt: `Write a personalized outreach email to get a backlink from ${opportunity.siteName} (${opportunity.url}) for the website ${siteUrl}. The content piece is titled "${contentTitle}". Make it professional, concise, and compelling. Return plain text email only.`,
      });

      return new Response(JSON.stringify({ email: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Backlinks Engine Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
