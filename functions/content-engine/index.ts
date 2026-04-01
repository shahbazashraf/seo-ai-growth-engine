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

  const url = new URL(req.url);
  const path = url.pathname;

  const blink = createClient({
    projectId: Deno.env.get("BLINK_PROJECT_ID")!,
    secretKey: Deno.env.get("BLINK_SECRET_KEY")!,
  });

  try {
    if (path === "/generate") {
      const { topic } = await req.json();
      if (!topic || topic.trim() === "") {
        throw new Error("Topic is required and cannot be empty");
      }

      const prompt = `Write a complete SEO-optimized blog post about: "${topic}"
      
Return ONLY valid JSON:
{
  "title": "...",
  "metaDescription": "160 char max",
  "keywords": ["kw1","kw2","kw3"],
  "content": "full post in markdown, min 800 words with ## headings, bullet points, and natural paragraph flow",
  "imagePrompts": ["descriptive prompt for hero image", "prompt for inline image"]
}`;

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
        const errorText = await openRouterRes.text();
        throw new Error(
          `OpenRouter API error (${openRouterRes.status}): ${errorText.substring(0, 200)}`
        );
      }

      const aiData = await openRouterRes.json();
      const contentStr = aiData.choices?.[0]?.message?.content;
      
      if (!contentStr) {
        throw new Error("OpenRouter API returned no content");
      }

      // Simple extraction of JSON if AI wraps it in markdown
      const jsonStr = contentStr.replace(/```json\n?|\n?```/g, "").trim();
      return new Response(jsonStr, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/image") {
      const { prompt } = await req.json();
      if (!prompt || prompt.trim() === "") {
        throw new Error("Prompt is required and cannot be empty");
      }

      // Using Unsplash Source API (redirects to a real image)
      const imageUrl = `https://source.unsplash.com/800x400/?${encodeURIComponent(prompt)}`;
      
      return new Response(JSON.stringify({ url: imageUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Content Engine Error:", errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
