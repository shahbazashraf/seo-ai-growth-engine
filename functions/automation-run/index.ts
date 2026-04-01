import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Validates required environment variables at startup
 */
function validateEnv() {
  const required = ["BLINK_PROJECT_ID", "BLINK_SECRET_KEY", "OPENROUTER_API_KEY"];
  const missing = required.filter(key => !Deno.env.get(key));
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
      `Please add them to your project settings.`
    );
  }
}

/**
 * Retry wrapper for fetch with exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxAttempts = 3
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      // Retry on 5xx errors only
      if (response.status >= 500 && attempt < maxAttempts) {
        lastError = new Error(`Server error (${response.status}) on attempt ${attempt}`);
        const delay = 100 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        const delay = 100 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Failed after ${maxAttempts} attempts: ${lastError?.message}`);
}

// Validate env at module load
try {
  validateEnv();
} catch (error) {
  console.error("FATAL: Environment validation failed:", error);
  throw error;
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
    const { siteUrl } = await req.json();
    if (!siteUrl || siteUrl.trim() === "") {
      return new Response(JSON.stringify({ error: "siteUrl is required and cannot be empty" }), {
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

    // Generate SEO-optimized blog post using OpenRouter (DeepSeek)
    const prompt = `You are an expert SEO content strategist. Based on this website content/URL: ${targetUrl}

Here is some content from the site for context:
${siteContext}

Generate a high-quality, SEO-optimized blog post that would attract organic traffic to this site. The post should be highly relevant to the site's niche and target audience.

Requirements:
- Title: Compelling, SEO-optimized, includes a primary keyword
- Meta description: 140-155 characters, includes call to action
- Keywords: 5-7 relevant SEO keywords
- Content: Full blog post in Markdown, minimum 800 words, with proper H2/H3 structure, introduction, body sections, and conclusion
- Word count: Count actual words in the content field.

Respond STRICTLY with a JSON object. Ensure the JSON is valid and has exactly the following properties: "title" (string), "metaDescription" (string), "keywords" (array of strings), "content" (string), and "wordCount" (number). Do not include any markdown formatting like \`\`\`json around the response.`;

    const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openRouterApiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is not set");
    }

    const openRouterRes = await fetchWithRetry(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-chat",
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }]
        })
      }
    );

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text();
      throw new Error(
        `OpenRouter API error (${openRouterRes.status}): ${errText.substring(0, 200)}`
      );
    }

    const aiData = await openRouterRes.json();
    let generated;
    try {
      const contentStr = aiData.choices?.[0]?.message?.content;
      if (!contentStr) {
        throw new Error("OpenRouter API returned no content");
      }
      // Strip markdown json blocks if the model still outputs them
      const cleanJsonStr = contentStr.replace(/```json\n?|\n?```/g, "").trim();
      generated = JSON.parse(cleanJsonStr);
    } catch (e) {
      console.error("Failed to parse AI response:", aiData.choices?.[0]?.message?.content);
      throw new Error("AI failed to generate valid JSON content");
    }

    if (!generated || !generated.title) {
      throw new Error("AI failed to generate complete content with required fields");
    }

    // Calculate actual word count
    const actualWordCount = generated.content
      ? generated.content.replace(/[#*`\[\]]/g, "").split(/\s+/).filter((w: string) => w.length > 0).length
      : generated.wordCount || 0;

    // Save to generated_content table (no userId in this flow)
    try {
      await blink.db.table("generated_content").create({
        siteUrl: targetUrl,
        title: generated.title,
        content: generated.content,
        keywords: JSON.stringify(generated.keywords || []),
        metaDescription: generated.metaDescription,
        wordCount: actualWordCount,
      });
    } catch (dbErr) {
      console.error("DB save error:", dbErr);
      // Don't fail the entire operation if DB save fails
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
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Automation run error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg || "Content generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
