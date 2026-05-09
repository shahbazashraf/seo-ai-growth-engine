import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ContentRecord {
  id: string;
  title?: string;
  content?: string;
  metaDescription?: string;
  keywords?: string;
  canonicalUrl?: string;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callAnthropic(prompt: string, fallbackTargets: any[]) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!apiKey) return fallbackTargets;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1800,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) return fallbackTargets;
  const payload = await response.json().catch(() => ({}));
  const text = Array.isArray((payload as any).content)
    ? (payload as any).content.map((item: any) => item?.text || "").join("\n").trim()
    : "";
  try {
    const jsonBlock = text.match(/\[[\s\S]*\]/)?.[0] ?? text;
    const parsed = JSON.parse(jsonBlock);
    return Array.isArray(parsed) ? parsed : fallbackTargets;
  } catch {
    return fallbackTargets;
  }
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
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/+$/, "");
    const body = await req.json().catch(() => ({}));

    if (!pathname.endsWith("/discover")) {
      return jsonResponse({ success: false, error: "Not found." }, 404);
    }

    const contentId = String(body?.contentId || "");
    const maxTargets = Math.min(Number(body?.maxTargets || 24), 60);
    if (!contentId) {
      return jsonResponse({ success: false, error: "contentId is required." }, 400);
    }

    const rows = await blink.db.table("content_lab").list({ where: { id: contentId }, limit: 1 });
    const content = (rows?.[0] || null) as ContentRecord | null;
    if (!content) {
      return jsonResponse({ success: false, error: "Content not found." }, 404);
    }

    const keywords = String(content.keywords || "");
    const fallbackTargets = [
      { platform: "medium", targetKind: "syndication", targetName: "Medium publication", targetIdentifier: "medium", mode: "full-canonical", rationale: "High-visibility canonical-safe syndication target.", riskLevel: "low", requiresReview: false },
      { platform: "devto", targetKind: "syndication", targetName: "Dev.to", targetIdentifier: "devto", mode: "full-canonical", rationale: "Developer audience with canonical support.", riskLevel: "low", requiresReview: false },
      { platform: "hashnode", targetKind: "syndication", targetName: "Hashnode", targetIdentifier: "hashnode", mode: "full-canonical", rationale: "Strong fit for technical content.", riskLevel: "low", requiresReview: false },
      { platform: "reddit", targetKind: "community", targetName: "r/SEO", targetIdentifier: "SEO", mode: "answer", rationale: "Community discussion around SEO workflows.", riskLevel: "medium", requiresReview: false },
      { platform: "quora", targetKind: "community", targetName: "Quora question discovery", targetIdentifier: content.title || "SEO automation", mode: "answer", rationale: "Answer intent-driven questions with contextual linkback.", riskLevel: "medium", requiresReview: false },
      { platform: "resource-outreach", targetKind: "outreach", targetName: "Resource page editors", targetIdentifier: "https://example.com/resources", mode: "pitch", rationale: "Long-tail outreach target for authoritative mentions.", riskLevel: "medium", requiresReview: false },
    ];

    const prompt = `You are building a safe large-scale distribution plan for an SEO content engine. Based on this content:\nTitle: ${content.title}\nMeta: ${content.metaDescription}\nCanonical URL: ${content.canonicalUrl}\nKeywords: ${keywords}\n\nReturn a JSON array of up to ${maxTargets} targets. Each item must have: platform, targetKind, targetName, targetIdentifier, mode, rationale, riskLevel, requiresReview. Favor a mix of API-postable syndication targets, community discussion targets, and outreach targets. Never suggest blind spam networks.`;

    const generatedTargets = await callAnthropic(prompt, fallbackTargets);
    const normalized = generatedTargets.slice(0, maxTargets).map((target: any) => ({
      platform: String(target.platform || "medium"),
      targetKind: String(target.targetKind || "syndication"),
      targetName: String(target.targetName || target.platform || "Unknown target"),
      targetIdentifier: String(target.targetIdentifier || target.platform || ""),
      mode: String(target.mode || "teaser"),
      rationale: String(target.rationale || "Suggested by AI discovery."),
      riskLevel: String(target.riskLevel || "medium"),
      requiresReview: Boolean(target.requiresReview),
      metadata: target.metadata && typeof target.metadata === "object" ? target.metadata : {},
    }));

    return jsonResponse({ success: true, targets: normalized });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});

