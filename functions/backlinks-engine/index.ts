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

      // 1. Fetch from Common Crawl index
      // CC-MAIN-2024-10 is an example index
      const ccUrl = `https://index.commoncrawl.org/CC-MAIN-2024-10-index?url=${domain}&output=json&filter=status:200&limit=20`;
      
      const ccRes = await fetch(ccUrl);
      const ccText = await ccRes.text();
      const ccResults = ccText.split("\n").filter(Boolean).map(line => JSON.parse(line));

      // 2. Simple DA estimation lookup
      const highDA = ["github.com", "medium.com", "dev.to", "reddit.com", "twitter.com", "linkedin.com", "wikipedia.org", "producthunt.com"];
      
      const backlinks = [];
      for (const res of ccResults) {
        const sourceUrl = res.url;
        const sourceDomain = new URL(sourceUrl).hostname;
        const isHigh = highDA.some(d => sourceDomain.includes(d));
        
        const backlink = {
          site_url: siteUrl,
          source_url: sourceUrl,
          anchor_text: "Visit Site", // Simplified
          domain_authority: isHigh ? 80 + Math.floor(Math.random() * 15) : 20 + Math.floor(Math.random() * 30),
          status: "active"
        };
        
        await blink.db.table("backlinks").create(backlink);
        backlinks.push(backlink);
      }

      // 3. Generate opportunities via Claude
      const { text: oppsText } = await blink.ai.generateText({
        model: "google/gemini-3-flash",
        prompt: `For a website about ${siteUrl}, suggest 8 specific link-building opportunities. Return ONLY JSON array:
[{
  "siteName": "...",
  "url": "...",
  "reason": "why they would link to you",
  "domainAuthority": 45,
  "type": "guest post / resource page / directory"
}]`,
      });

      const jsonMatch = oppsText.match(/\[[\s\S]*\]/);
      const opportunities = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

      await blink.db.table("backlink_opportunities").create({
        site_url: siteUrl,
        opportunity_data: JSON.stringify(opportunities)
      });

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
  } catch (error) {
    console.error("Backlinks Engine Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
