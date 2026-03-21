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
    if (path === "/generate") {
      const { topic } = await req.json();
      if (!topic) throw new Error("Topic is required");

      const { text } = await blink.ai.generateText({
        model: "google/gemini-3-flash",
        prompt: `Write a complete SEO-optimized blog post about: "${topic}"
      
Return ONLY valid JSON:
{
  "title": "...",
  "metaDescription": "160 char max",
  "keywords": ["kw1","kw2","kw3"],
  "content": "full post in markdown, min 800 words with ## headings, bullet points, and natural paragraph flow",
  "imagePrompts": ["descriptive prompt for hero image", "prompt for inline image"]
}`,
      });

      // Simple extraction of JSON if AI wraps it in markdown
      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
      return new Response(jsonStr, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/image") {
      const { prompt } = await req.json();
      if (!prompt) throw new Error("Prompt is required");

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
    console.error("Content Engine Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
