import { createClient } from "npm:@blinkdotnew/sdk";
import { loadToken, saveToken } from "../_shared/token-store.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PostType = "link" | "text";

interface ContentRecord {
  id: string;
  title?: string;
  excerpt?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  keywords?: string;
}

interface PostResult {
  success: boolean;
  platformPostId?: string;
  publishedUrl?: string;
  error?: string;
  postedAt?: string;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapRedditError(status: number, fallback: string): string {
  if (status === 401) return "Token invalid or expired. Please reconnect in Settings.";
  if (status === 429) return "Rate limited. Try again in 1 hour.";
  return fallback;
}

function safeExcerpt(content: ContentRecord): string {
  const raw = (content.excerpt || content.metaDescription || "").trim();
  return raw || "Article summary unavailable.";
}

function normalizeTags(content: ContentRecord): string[] {
  if (!content.keywords) return [];
  try {
    const parsed = JSON.parse(content.keywords);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
  } catch {
    return content.keywords.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

async function callAnthropicJSON<T>(prompt: string, fallback: T): Promise<T> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!apiKey) return fallback;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) return fallback;
  const data = await res.json().catch(() => ({}));
  const text = Array.isArray((data as any).content)
    ? (data as any).content.map((c: any) => c?.text || "").join("\n").trim()
    : "";
  if (!text) return fallback;

  try {
    const block = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return JSON.parse(block ? block[0] : text) as T;
  } catch {
    return fallback;
  }
}

async function refreshRedditTokenIfNeeded() {
  const token = await loadToken("reddit");
  if (!token) return { error: "Platform not connected. Please add your API token in Settings." } as const;

  const expiresAt = token.expiresAt ? new Date(token.expiresAt).getTime() : 0;
  const stillValid = !expiresAt || Date.now() < (expiresAt - 60_000);
  if (stillValid) return { token } as const;

  if (!token.refreshToken) {
    return { error: "Token invalid or expired. Please reconnect in Settings." } as const;
  }

  const clientId = Deno.env.get("REDDIT_CLIENT_ID")?.trim() || "";
  const clientSecret = Deno.env.get("REDDIT_CLIENT_SECRET")?.trim() || "";
  const auth = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.access_token) {
    return { error: mapRedditError(res.status, "Failed to refresh Reddit token.") } as const;
  }

  const refreshed = {
    ...token,
    accessToken: String(payload.access_token),
    expiresAt: new Date(Date.now() + Number(payload.expires_in || 3600) * 1000).toISOString(),
  };
  await saveToken("reddit", refreshed);
  return { token: refreshed } as const;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  const blink = createClient({
    projectId: Deno.env.get("BLINK_PROJECT_ID")!,
    secretKey: Deno.env.get("BLINK_SECRET_KEY")!,
  });

  try {
    const body = await req.json().catch(() => ({}));

    if (body?.suggestSubreddits) {
      const topic = String(body?.topic || "");
      const tags = Array.isArray(body?.tags) ? body.tags : [];
      const prompt = `Given this article about ${topic} with tags ${JSON.stringify(tags)}, which 3 subreddits would be most appropriate to post in? Return JSON array of subreddit names without the r/ prefix.`;
      const suggestions = await callAnthropicJSON<string[]>(prompt, ["SEO", "content_marketing", "Entrepreneur"]);
      return jsonResponse({ success: true, suggestions });
    }

    const contentId = String(body?.contentId || "");
    const rawSubreddit = String(body?.subreddit || "");
    const postType = String(body?.postType || "") as PostType;
    if (!contentId || !rawSubreddit || (postType !== "link" && postType !== "text")) {
      return jsonResponse({ success: false, error: "Invalid contentId, subreddit, or postType." }, 400);
    }
    const subreddit = rawSubreddit.replace(/^r\//i, "").trim();

    const rows = await blink.db.table("content_lab").list({ where: { id: contentId }, limit: 1 });
    const content = (rows?.[0] || null) as ContentRecord | null;
    if (!content) {
      return jsonResponse({ success: false, error: "Content not found." }, 404);
    }

    const canonicalUrl = (content.canonicalUrl || "").trim();
    if (!canonicalUrl) {
      return jsonResponse({ success: false, error: "Canonical URL is required before posting." }, 400);
    }

    const tokenResult = await refreshRedditTokenIfNeeded();
    if ("error" in tokenResult) {
      return jsonResponse({ success: false, error: tokenResult.error });
    }
    const token = tokenResult.token;

    const title = content.title || "Untitled";
    const excerpt = safeExcerpt(content);

    const aiPrompt = `You are posting to Reddit r/${subreddit}. Write a ${postType} post about this article. Article title: ${title}. Article summary: ${excerpt}. Canonical URL: ${canonicalUrl}. Rules: no obvious self-promotion language, provide genuine value, match subreddit culture, keep title under 300 chars. Return JSON: { redditTitle: string, textBody?: string }`;
    const aiGenerated = await callAnthropicJSON<{ redditTitle: string; textBody?: string }>(aiPrompt, {
      redditTitle: `${title}`.slice(0, 280),
      textBody: `Here are the key points from this topic:\n\n${excerpt}\n\nRead the full article: ${canonicalUrl}`,
    });

    const redditTitle = String(aiGenerated.redditTitle || title).slice(0, 300);
    const textBody = aiGenerated.textBody || `Read the full article: ${canonicalUrl}`;

    const submitPayload = new URLSearchParams({
      api_type: "json",
      sr: subreddit,
      kind: postType === "link" ? "link" : "self",
      title: redditTitle,
      resubmit: "false",
    });
    if (postType === "link") submitPayload.set("url", canonicalUrl);
    if (postType === "text") submitPayload.set("text", textBody);

    const submitRes = await fetch("https://oauth.reddit.com/api/submit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": Deno.env.get("REDDIT_USER_AGENT") || "SEOAIAutomation/1.0",
      },
      body: submitPayload,
    });

    const submitJson = await submitRes.json().catch(() => ({}));
    if (!submitRes.ok) {
      const error = mapRedditError(submitRes.status, "Failed to publish to Reddit.");
      await blink.db.table("distribution_logs").create({
        contentId,
        platform: "reddit",
        mode: "social-snippet",
        status: "failed",
        publishedUrl: "",
        platformPostId: "",
        canonicalApplied: 0,
        postedAt: "",
        error,
      });
      return jsonResponse({ success: false, error });
    }

    const errors = submitJson?.json?.errors;
    if (Array.isArray(errors) && errors.length) {
      const readable = errors[0]?.[1] ? String(errors[0][1]) : "Reddit rejected the submission.";
      await blink.db.table("distribution_logs").create({
        contentId,
        platform: "reddit",
        mode: "social-snippet",
        status: "failed",
        publishedUrl: "",
        platformPostId: "",
        canonicalApplied: 0,
        postedAt: "",
        error: readable,
      });
      return jsonResponse({ success: false, error: readable });
    }

    const postId = String(submitJson?.json?.data?.id || "");
    const permalink = String(submitJson?.json?.data?.url || submitJson?.json?.data?.permalink || "");
    const publishedUrl = permalink.startsWith("http") ? permalink : permalink ? `https://www.reddit.com${permalink}` : "";
    const postedAt = new Date().toISOString();

    await blink.db.table("distribution_logs").create({
      contentId,
      platform: "reddit",
      mode: "social-snippet",
      status: "posted",
      publishedUrl,
      platformPostId: postId,
      canonicalApplied: 0,
      postedAt,
      error: "",
    });

    const result: PostResult = {
      success: true,
      platformPostId: postId,
      publishedUrl,
      postedAt,
    };
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
