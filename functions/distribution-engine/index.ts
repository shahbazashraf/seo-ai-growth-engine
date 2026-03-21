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

    // Fetch content from DB
    const content = await blink.db.table("content_lab").get(contentId);
    if (!content) throw new Error("Content not found");

    const results = [];

    for (const platform of platforms) {
      const { name, config, credentials } = platform;
      let success = false;
      let publishedUrl = "";
      let error = "";

      try {
        if (name === "devto") {
          const res = await fetch("https://dev.to/api/articles", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "api-key": credentials.apiKey 
            },
            body: JSON.stringify({
              article: {
                title: content.title,
                body_markdown: content.content,
                tags: config.tags ? config.tags.split(",").map((t: string) => t.trim()) : [],
                description: content.meta_description,
                published: true
              }
            })
          });
          const data = await res.json();
          if (res.ok) {
            success = true;
            publishedUrl = data.url;
          } else {
            error = data.message || "Failed to publish to Dev.to";
          }
        } else if (name === "medium") {
          // Medium requires an authorId first
          const userRes = await fetch("https://api.medium.com/v1/me", {
            headers: { "Authorization": `Bearer ${credentials.token}` }
          });
          const userData = await userRes.json();
          if (userRes.ok) {
            const res = await fetch(`https://api.medium.com/v1/users/${userData.data.id}/posts`, {
              method: "POST", 
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${credentials.token}`
              },
              body: JSON.stringify({
                title: content.title,
                contentFormat: "markdown",
                content: content.content,
                publishStatus: "public"
              })
            });
            const data = await res.json();
            if (res.ok) {
              success = true;
              publishedUrl = data.data.url;
            } else {
              error = "Failed to publish to Medium";
            }
          } else {
            error = "Invalid Medium token";
          }
        } else if (name === "hashnode") {
          const res = await fetch("https://gql.hashnode.com", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": credentials.apiKey 
            },
            body: JSON.stringify({
              query: `mutation PublishPost($input: PublishPostInput!) {
                publishPost(input: $input) {
                  post {
                    url
                  }
                }
              }`,
              variables: {
                input: {
                  title: content.title,
                  contentMarkdown: content.content,
                  tags: [],
                  // We would need the publicationId here for Hashnode's new API
                  // publicationId: credentials.publicationId
                }
              }
            })
          });
          const data = await res.json();
          if (data.data?.publishPost?.post?.url) {
            success = true;
            publishedUrl = data.data.publishPost.post.url;
          } else {
            error = data.errors?.[0]?.message || "Failed to publish to Hashnode";
          }
        } else if (name === "reddit") {
          // Reddit logic would need OAuth token from credentials
          error = "Reddit distribution is currently in sandbox mode (credentials only)";
        } else {
          error = `Platform ${name} not yet fully implemented`;
        }
      } catch (err) {
        error = err.message;
      }

      // Log distribution
      await blink.db.table("distribution_logs").create({
        userId: '',
        contentId,
        platform: name,
        status: success ? "success" : "failed",
        publishedUrl: publishedUrl || '',
        error: error || ''
      });

      results.push({ platform: name, success, url: publishedUrl, error });
    }

    // Update content_lab row if any success
    const successfulPlatforms = results
      .filter(r => r.success)
      .reduce((acc, curr) => ({ ...acc, [curr.platform]: curr.url }), {});

    if (Object.keys(successfulPlatforms).length > 0) {
      const currentPublished = JSON.parse(content.platforms_published || "{}");
      await blink.db.table("content_lab").update(contentId, {
        status: "published",
        platforms_published: JSON.stringify({ ...currentPublished, ...successfulPlatforms })
      });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Distribution Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
