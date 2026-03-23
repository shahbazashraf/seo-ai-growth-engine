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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { siteUrl } = await req.json();
    if (!siteUrl) {
      return new Response(JSON.stringify({ error: "siteUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let targetUrl = siteUrl.trim();
    if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl;

    const blink = createClient({
      projectId: Deno.env.get("BLINK_PROJECT_ID")!,
      secretKey: Deno.env.get("BLINK_SECRET_KEY")!,
    });

    // Try to scrape site for context
    let siteContext = `Website: ${targetUrl}`;
    try {
      const scrapeResult = await blink.data.scrape(targetUrl);
      if (scrapeResult?.markdown) {
        // Use first 2000 chars of scraped content as context
        siteContext = scrapeResult.markdown.substring(0, 2000);
      }
    } catch (e) {
      console.log("Scrape failed, using URL as context:", e);
    }

    // Generate SEO-optimized blog post using Blink AI
    const { object: generated } = await blink.ai.generateObject({
      model: "google/gemini-3-flash",
      prompt: `You are an expert SEO content strategist. Based on this website content/URL: ${targetUrl}

Here is some content from the site for context:
${siteContext}

Generate a high-quality, SEO-optimized blog post that would attract organic traffic to this site. The post should be highly relevant to the site's niche and target audience.

Requirements:
- Title: Compelling, SEO-optimized, includes a primary keyword
- Meta description: 140-155 characters, includes call to action
- Keywords: 5-7 relevant SEO keywords
- Content: Full blog post in Markdown, minimum 800 words, with proper H2/H3 structure, introduction, body sections, and conclusion
- Word count: Count actual words in the content field`,
      schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "SEO-optimized blog post title" },
          metaDescription: { type: "string", description: "Meta description 140-155 characters" },
          keywords: {
            type: "array",
            items: { type: "string" },
            description: "5-7 target SEO keywords",
          },
          content: { type: "string", description: "Full blog post in Markdown, minimum 800 words" },
          wordCount: { type: "number", description: "Approximate word count of the content" },
        },
        required: ["title", "metaDescription", "keywords", "content", "wordCount"],
      },
    });

    if (!generated) {
      throw new Error("AI failed to generate content");
    }

    // Calculate actual word count
    const actualWordCount = generated.content
      ? generated.content.replace(/[#*`\[\]]/g, "").split(/\s+/).filter((w: string) => w.length > 0).length
      : generated.wordCount || 0;

    // Save to generated_content table and content_lab
    try {
      await blink.db.table("generated_content").create({
        siteUrl: targetUrl,
        title: generated.title,
        content: generated.content,
        keywords: JSON.stringify(generated.keywords || []),
        metaDescription: generated.metaDescription,
        wordCount: actualWordCount,
      });

      await blink.db.table("content_lab").create({
        title: generated.title,
        content: generated.content,
        metaDescription: generated.metaDescription,
        keywords: JSON.stringify(generated.keywords || []),
        imageUrls: "[]",
        status: "draft",
        platformsPublished: "{}",
        wordCount: actualWordCount,
      });
    } catch (dbErr) {
      console.error("DB save error:", dbErr);
    }

    return new Response(
      JSON.stringify({
        title: generated.title,
        metaDescription: generated.metaDescription,
        keywords: generated.keywords || [],
        content: generated.content,
        wordCount: actualWordCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Automation run error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Content generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
