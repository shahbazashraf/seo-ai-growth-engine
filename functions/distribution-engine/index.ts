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

  const blink = createClient({
    projectId: Deno.env.get("BLINK_PROJECT_ID")!,
    secretKey: Deno.env.get("BLINK_SECRET_KEY")!,
  });

  try {
    const { contentId, platforms } = await req.json();
    if (!contentId || !platforms) throw new Error("Missing parameters");

    // Fetch content — try content_lab first, fall back to generated_content
    let content: any = null;
    try {
      content = await blink.db.table("content_lab").get(contentId);
    } catch {
      // not found in content_lab
    }

    if (!content) {
      try {
        content = await blink.db.table("generated_content").get(contentId);
      } catch {
        // not found in generated_content either
      }
    }

    if (!content) throw new Error("Content not found in any table");

    // Normalise field names — SDK returns camelCase; DB columns are snake_case
    const contentTitle = content.title || "Untitled";
    const contentBody = content.content || "";
    const metaDesc = content.metaDescription || content.meta_description || "";

    const results: any[] = [];

    for (const platform of platforms) {
      const { name, config, credentials } = platform;
      let success = false;
      let publishedUrl = "";
      let error = "";

      try {
        if (name === "devto") {
          // Dev.to tags must be lowercase, no spaces, max 4
          const tags = config?.tags
            ? config.tags
                .split(",")
                .map((t: string) => t.trim().toLowerCase().replace(/\s+/g, ""))
                .slice(0, 4)
            : [];

          const res = await fetch("https://dev.to/api/articles", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": credentials.apiKey,
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
          });
          const data = await res.json();
          if (res.ok) {
            success = true;
            publishedUrl = data.url || `https://dev.to/api/articles/${data.id}`;
          } else {
            error = data.error || data.message || "Failed to publish to Dev.to";
          }
        } else if (name === "medium") {
          // Medium needs the author ID from /me before posting
          const userRes = await fetch("https://api.medium.com/v1/me", {
            headers: {
              Authorization: `Bearer ${credentials.token || credentials.apiKey}`,
            },
          });
          const userData = await userRes.json();

          if (userRes.ok && userData.data?.id) {
            const res = await fetch(
              `https://api.medium.com/v1/users/${userData.data.id}/posts`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${credentials.token || credentials.apiKey}`,
                },
                body: JSON.stringify({
                  title: contentTitle,
                  contentFormat: "markdown",
                  content: contentBody,
                  publishStatus: "public",
                  tags: [],
                }),
              }
            );
            const data = await res.json();
            if (res.ok && data.data?.url) {
              success = true;
              publishedUrl = data.data.url;
            } else {
              error =
                "Failed to publish to Medium: " +
                (data.errors?.[0]?.message || JSON.stringify(data));
            }
          } else {
            error = "Invalid Medium token — could not fetch user ID";
          }
        } else if (name === "hashnode") {
          // Hashnode v2 API requires a publicationId
          const publicationId = credentials.publicationId || credentials.blogId;
          if (!publicationId) {
            error = "Hashnode requires a Publication ID. Add it in Settings.";
          } else {
            const res = await fetch("https://gql.hashnode.com", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: credentials.apiKey,
              },
              body: JSON.stringify({
                query: `mutation PublishPost($input: PublishPostInput!) {
                  publishPost(input: $input) {
                    post {
                      url
                      title
                    }
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
            });
            const data = await res.json();
            if (data.data?.publishPost?.post?.url) {
              success = true;
              publishedUrl = data.data.publishPost.post.url;
            } else {
              error =
                data.errors?.[0]?.message || "Failed to publish to Hashnode";
            }
          }
        } else {
          // Social / unsupported platforms — mark as handled so callers can
          // open the share URL on the client side without a hard error
          success = true;
          publishedUrl = "";
          error = "";
        }
      } catch (err: any) {
        error = err.message;
      }

      // Log the distribution attempt
      try {
        await blink.db.table("distribution_logs").create({
          userId: "",
          contentId,
          platform: name,
          status: success ? "success" : "failed",
          publishedUrl: publishedUrl || "",
          error: error || "",
        });
      } catch (logErr: any) {
        console.error("Failed to log distribution:", logErr.message);
      }

      results.push({ platform: name, success, url: publishedUrl, error });
    }

    // Update content_lab status when at least one platform succeeded
    const successCount = results.filter(r => r.success).length;
    if (successCount > 0) {
      try {
        const successfulPlatforms = results
          .filter(r => r.success)
          .reduce(
            (acc, curr) => ({ ...acc, [curr.platform]: curr.url || true }),
            {} as Record<string, any>
          );

        let currentPublished: Record<string, any> = {};
        try {
          currentPublished = JSON.parse(
            content.platformsPublished || content.platforms_published || "{}"
          );
        } catch { /* ignore parse error */ }

        await blink.db.table("content_lab").update(contentId, {
          status: "published",
          platformsPublished: JSON.stringify({
            ...currentPublished,
            ...successfulPlatforms,
          }),
        });
      } catch (updateErr: any) {
        console.error("Failed to update content_lab status:", updateErr.message);
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Distribution Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
