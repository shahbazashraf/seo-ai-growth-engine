import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Helper to add timeout to fetch calls
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const blink = createClient({
    projectId: Deno.env.get("BLINK_PROJECT_ID")!,
    secretKey: Deno.env.get("BLINK_SECRET_KEY")!,
  });

  try {
    const body = await req.json();
    const { contentId, platforms } = body;
    if (!contentId || !platforms) throw new Error("Missing contentId or platforms");

    // Fetch content — try content_lab first, fall back to generated_content
    let content: any = null;
    
    try {
      const rows = await blink.db.table("content_lab").list({ where: { id: contentId }, limit: 1 });
      if (rows && rows.length > 0) content = rows[0];
    } catch (e: any) {
      console.log("content_lab lookup failed:", e.message);
    }

    if (!content) {
      try {
        const rows = await blink.db.table("generated_content").list({ where: { id: contentId }, limit: 1 });
        if (rows && rows.length > 0) content = rows[0];
      } catch (e: any) {
        console.log("generated_content lookup failed:", e.message);
      }
    }

    if (!content) throw new Error("Content not found");

    const contentTitle = content.title || "Untitled";
    const contentBody = content.content || "";
    const metaDesc = content.metaDescription || content.meta_description || "";

    const results: any[] = [];

    // Process each platform (continue on individual failures)
    for (const platform of platforms) {
      const { name, config, credentials } = platform;
      let success = false;
      let publishedUrl = "";
      let error = "";

      try {
        if (name === "devto") {
          const tags = config?.tags
            ? config.tags.split(",").map((t: string) => t.trim().toLowerCase().replace(/\s+/g, "")).slice(0, 4)
            : [];

          const res = await fetchWithTimeout(
            "https://dev.to/api/articles",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "api-key": credentials?.apiKey || "",
              },
              body: JSON.stringify({
                article: {
                  title: contentTitle,
                  body_markdown: contentBody,
                  tags,
                  description: metaDesc,
                  published: true,
                },
              }),
            },
            30000
          );
          
          const data = await res.json();
          if (res.ok) {
            success = true;
            publishedUrl = data.url || "https://dev.to";
          } else {
            error = data.error || data.message || `Dev.to responded with ${res.status}`;
          }
        } else if (name === "medium") {
          const token = credentials?.token || credentials?.apiKey || "";
          
          const userRes = await fetchWithTimeout(
            "https://api.medium.com/v1/me",
            {
              headers: { Authorization: `Bearer ${token}` },
            },
            15000
          );
          
          const userData = await userRes.json();

          if (userRes.ok && userData.data?.id) {
            const res = await fetchWithTimeout(
              `https://api.medium.com/v1/users/${userData.data.id}/posts`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  title: contentTitle,
                  contentFormat: "markdown",
                  content: contentBody,
                  publishStatus: "public",
                  tags: [],
                }),
              },
              30000
            );
            
            const data = await res.json();
            if (res.ok && data.data?.url) {
              success = true;
              publishedUrl = data.data.url;
            } else {
              error = "Failed to publish to Medium: " + (data.errors?.[0]?.message || JSON.stringify(data).slice(0, 100));
            }
          } else {
            error = "Invalid Medium token — could not fetch user ID";
          }
        } else if (name === "hashnode") {
          const publicationId = credentials?.publicationId || credentials?.blogId;
          if (!publicationId) {
            error = "Hashnode requires a Publication ID. Add it in Settings.";
          } else {
            const res = await fetchWithTimeout(
              "https://gql.hashnode.com",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: credentials?.apiKey || "",
                },
                body: JSON.stringify({
                  query: `mutation PublishPost($input: PublishPostInput!) {
                    publishPost(input: $input) {
                      post { url title }
                    }
                  }`,
                  variables: {
                    input: {
                      title: contentTitle,
                      contentMarkdown: contentBody,
                      publicationId,
                      tags: [],
                    },
                  },
                }),
              },
              30000
            );
            
            const data = await res.json();
            if (data.data?.publishPost?.post?.url) {
              success = true;
              publishedUrl = data.data.publishPost.post.url;
            } else {
              error = data.errors?.[0]?.message || "Failed to publish to Hashnode";
            }
          }
        } else {
          // Social / submit platforms — client handles opening URLs
          success = true;
          publishedUrl = "";
        }
      } catch (err: any) {
        error = err.name === "AbortError" ? "Request timeout (>30s)" : err.message || "Unknown error";
        console.error(`Distribution error for ${name}:`, error);
      }

      // Log the distribution attempt (don't fail on log errors)
      try {
        await blink.db.table("distribution_logs").create({
          contentId,
          platform: name,
          status: success ? "success" : "failed",
          publishedUrl: publishedUrl || "",
          error: error || "",
        });
      } catch (logErr: any) {
        console.error("Failed to log distribution:", logErr.message);
        // Don't throw — continue to next platform
      }

      results.push({ platform: name, success, url: publishedUrl, error });
    }

    // Update content_lab status when at least one platform succeeded
    const successCount = results.filter(r => r.success && r.platform !== "twitter" && r.platform !== "linkedin").length;
    if (successCount > 0) {
      try {
        const successfulPlatforms = results
          .filter(r => r.success)
          .reduce((acc: any, curr) => ({ ...acc, [curr.platform]: curr.url || true }), {});

        let currentPublished: Record<string, any> = {};
        try {
          currentPublished = JSON.parse(content.platformsPublished || content.platforms_published || "{}");
        } catch { /* ignore */ }

        await blink.db.table("content_lab").update(contentId, {
          status: "published",
          platformsPublished: JSON.stringify({ ...currentPublished, ...successfulPlatforms }),
        });
      } catch (updateErr: any) {
        console.error("Failed to update content_lab status:", updateErr.message);
        // Don't throw — partial success is still valid
      }
    }

    return new Response(JSON.stringify({ results, successCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Distribution Error:", errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
