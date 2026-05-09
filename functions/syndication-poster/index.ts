import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORTED_PLATFORMS = ["medium", "devto", "hashnode"] as const;
type PlatformKey = (typeof SUPPORTED_PLATFORMS)[number];
type PostMode = "full-canonical" | "teaser";

interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  userId?: string;
  username?: string;
}

interface EncryptedTokenRecord {
  iv: string;
  ciphertext: string;
  createdAt: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[a-fA-F0-9]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

function utf8Decode(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const rawKey = Deno.env.get("ENCRYPTION_KEY")?.trim() || "";
  if (!rawKey || rawKey.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte hex string");
  }

  const keyBytes = hexToBytes(rawKey);
  if (keyBytes.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to 32 bytes");
  }

  return await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
}

async function decryptTokenData(record: EncryptedTokenRecord): Promise<TokenData> {
  const key = await getEncryptionKey();
  const iv = hexToBytes(record.iv);
  const ciphertext = hexToBytes(record.ciphertext);
  const plaintextBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(utf8Decode(new Uint8Array(plaintextBuffer))) as TokenData;
}

function getSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") || "";
  return createClient(url, serviceKey);
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


interface ContentRecord {
  id: string;
  user_id: string;
  title?: string;
  content?: string;
  meta_description?: string;
  excerpt?: string;
  canonical_url?: string;
  keywords?: string;
  tags?: string[];
}

interface PostResult {
  success: boolean;
  platformPostId?: string;
  publishedUrl?: string;
  error?: string;
  postedAt?: string;
}

function normalizeTags(content: ContentRecord): string[] {
  if (Array.isArray(content.tags) && content.tags.length) {
    return content.tags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (!content.keywords) return [];
  try {
    const parsed = JSON.parse(content.keywords);
    if (Array.isArray(parsed)) {
      return parsed.map((tag) => String(tag).trim()).filter(Boolean);
    }
  } catch {
    return content.keywords.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
}

function buildExcerpt(content: ContentRecord): string {
  if (content.excerpt?.trim()) return content.excerpt.trim();
  if (content.meta_description?.trim()) return content.meta_description.trim();
  return (content.content || "").replace(/[#*_`>\[\]\(\)]/g, "").replace(/\s+/g, " ").slice(0, 220).trim();
}

async function generateTeaser(
  platform: PlatformKey,
  title: string,
  excerpt: string,
  canonicalUrl: string,
): Promise<string> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!anthropicKey) {
    return `${excerpt}\n\nRead the full article: ${canonicalUrl}`;
  }

  const prompt = `Rewrite this article intro for ${platform} readers. Be engaging. End with a clear link to the full article. Article title: ${title}. Article excerpt: ${excerpt}. Full canonical URL: ${canonicalUrl}. Return only the teaser text, no preamble.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 500,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    return `${excerpt}\n\nRead the full article: ${canonicalUrl}`;
  }

  const data = await response.json().catch(() => ({}));
  const text = Array.isArray((data as any).content)
    ? (data as any).content.map((item: any) => item?.text || "").join("\n").trim()
    : "";

  if (!text) return `${excerpt}\n\nRead the full article: ${canonicalUrl}`;
  return text;
}

function mapApiError(status: number, fallback: string): string {
  if (status === 401) return "Token invalid or expired. Please reconnect in Settings.";
  if (status === 429) return "Rate limited. Try again in 1 hour.";
  return fallback;
}

// ... (postToMedium, postToDevTo, postToHashnode remain same as before but uses tokenData.accessToken)
async function postToMedium(
  tokenData: TokenData,
  title: string,
  htmlBody: string,
  canonicalUrl: string,
  tags: string[],
): Promise<PostResult> {
  const meRes = await fetch("https://api.medium.com/v1/me", {
    headers: { Authorization: `Bearer ${tokenData.accessToken}` },
  });

  if (!meRes.ok) {
    return {
      success: false,
      error: mapApiError(meRes.status, "Failed to fetch Medium profile."),
    };
  }

  const meData = await meRes.json().catch(() => ({}));
  const userId = meData?.data?.id;
  if (!userId) {
    return { success: false, error: "Failed to resolve Medium user ID." };
  }

  const publishRes = await fetch(`https://api.medium.com/v1/users/${userId}/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenData.accessToken}`,
    },
    body: JSON.stringify({
      title,
      contentFormat: "html",
      content: htmlBody,
      canonicalUrl,
      publishStatus: "public",
      tags: tags.slice(0, 5),
    }),
  });

  const payload = await publishRes.json().catch(() => ({}));
  if (!publishRes.ok) {
    return {
      success: false,
      error: mapApiError(publishRes.status, "Failed to publish to Medium."),
    };
  }

  return {
    success: true,
    platformPostId: payload?.data?.id,
    publishedUrl: payload?.data?.url,
    postedAt: new Date().toISOString(),
  };
}

async function postToDevTo(
  tokenData: TokenData,
  title: string,
  markdownBody: string,
  canonicalUrl: string,
  tags: string[],
): Promise<PostResult> {
  const response = await fetch("https://dev.to/api/articles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": tokenData.accessToken,
    },
    body: JSON.stringify({
      article: {
        title,
        body_markdown: markdownBody,
        published: true,
        canonical_url: canonicalUrl,
        tags: tags.slice(0, 4),
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: false,
      error: mapApiError(response.status, "Failed to publish to Dev.to."),
    };
  }

  return {
    success: true,
    platformPostId: payload?.id ? String(payload.id) : undefined,
    publishedUrl: payload?.url,
    postedAt: new Date().toISOString(),
  };
}

async function postToHashnode(
  tokenData: TokenData,
  title: string,
  markdownBody: string,
  canonicalUrl: string,
  tags: string[],
): Promise<PostResult> {
  const response = await fetch("https://gql.hashnode.com/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: tokenData.accessToken,
    },
    body: JSON.stringify({
      query: `mutation PublishPost($input: PublishPostInput!) {
        publishPost(input: $input) {
          post {
            id
            url
          }
        }
      }`,
      variables: {
        input: {
          title,
          contentMarkdown: markdownBody,
          tags: tags.slice(0, 5).map((name) => ({ name })),
          originalArticleURL: canonicalUrl,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: false,
      error: mapApiError(response.status, "Failed to publish to Hashnode."),
    };
  }

  if (payload?.errors?.[0]?.message) {
    return { success: false, error: String(payload.errors[0].message) };
  }

  return {
    success: true,
    platformPostId: payload?.data?.publishPost?.post?.id,
    publishedUrl: payload?.data?.publishPost?.post?.url,
    postedAt: new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabase = getSupabaseClient();

  try {
    const body = await req.json().catch(() => ({}));
    const contentId = String(body?.contentId || "");
    const platform = String(body?.platform || "") as PlatformKey;
    const mode = String(body?.mode || "") as PostMode;

    if (!contentId || !SUPPORTED_PLATFORMS.includes(platform)) {
      return jsonResponse({ success: false, error: "Invalid contentId or platform." }, 400);
    }

    // Fetch content from Supabase
    const { data: content, error: contentError } = await supabase
      .from("content_lab")
      .select("*")
      .eq("id", contentId)
      .single();

    if (contentError || !content) {
      return jsonResponse({ success: false, error: "Content not found." }, 404);
    }

    const userId = content.user_id;
    const canonicalUrl = (content.canonical_url || "").trim();
    if (!canonicalUrl) {
      return jsonResponse({ success: false, error: "Canonical URL is required before syndication." }, 400);
    }

    // Fetch platform token from Supabase
    const { data: credential, error: credError } = await supabase
      .from("platform_credentials")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", platform)
      .single();

    if (credError || !credential) {
      return jsonResponse({
        success: false,
        error: "Platform not connected. Please add your API token in Settings.",
      });
    }

    const tokenData = await decryptTokenData(credential);
    const title = content.title || "Untitled";
    const excerpt = buildExcerpt(content);
    const tags = normalizeTags(content);
    const fullMarkdown = content.content || "";
    const teaser = mode === "teaser"
      ? await generateTeaser(platform, title, excerpt, canonicalUrl)
      : "";

    const markdownBody = mode === "teaser"
      ? `${teaser}\n\nRead the full article: ${canonicalUrl}`
      : fullMarkdown;
    const htmlBody = mode === "teaser"
      ? `<p>${teaser.replace(/\n/g, "<br/>")}</p><p>Read the full article: <a href="${canonicalUrl}">${canonicalUrl}</a></p>`
      : fullMarkdown; // Simplification for now, usually content is markdown or HTML

    // Log the start
    const { data: existingLogs } = await supabase
      .from("distribution_logs")
      .select("id")
      .match({ content_id: contentId, platform, mode });

    const baseLog = {
      user_id: userId,
      content_id: contentId,
      platform,
      mode,
      status: "pending",
      published_url: "",
      platform_post_id: "",
      canonical_applied: mode === "full-canonical",
      posted_at: null,
      error: "",
      updated_at: new Date().toISOString()
    };

    let logId = existingLogs?.[0]?.id;
    if (logId) {
      await supabase.from("distribution_logs").update(baseLog).eq("id", logId);
    } else {
      const { data: created } = await supabase.from("distribution_logs").insert(baseLog).select().single();
      logId = created.id;
    }

    let result: PostResult;
    if (platform === "medium") {
      result = await postToMedium(tokenData, title, htmlBody, canonicalUrl, tags);
    } else if (platform === "devto") {
      result = await postToDevTo(tokenData, title, markdownBody, canonicalUrl, tags);
    } else {
      result = await postToHashnode(tokenData, title, markdownBody, canonicalUrl, tags);
    }

    const postedAt = result.postedAt || new Date().toISOString();
    if (result.success) {
      await supabase.from("distribution_logs").update({
        status: "posted",
        published_url: result.publishedUrl || "",
        platform_post_id: result.platformPostId || "",
        posted_at: postedAt,
        error: "",
        updated_at: new Date().toISOString()
      }).eq("id", logId);
    } else {
      await supabase.from("distribution_logs").update({
        status: "failed",
        error: result.error || "Failed to publish.",
        updated_at: new Date().toISOString()
      }).eq("id", logId);
    }

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});

