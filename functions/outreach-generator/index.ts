import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OutreachType = "resource-page" | "guest-post" | "broken-link" | "mention";

interface ContentRecord {
  id: string;
  title?: string;
  canonicalUrl?: string;
  excerpt?: string;
  metaDescription?: string;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function generateEmail(
  outreachType: OutreachType,
  title: string,
  canonicalUrl: string,
  targetSite: string,
) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim() || "";
  if (!apiKey) {
    return {
      subject: `Quick collaboration idea for ${targetSite}`,
      bodyHtml: `<p>Hi there,</p><p>I wanted to share our article "<strong>${title}</strong>" (${canonicalUrl}) because it may be useful for your readers.</p><p>If relevant, we'd love to collaborate.</p><p>Best regards,</p>`,
      reasoning: "Fallback template used because ANTHROPIC_API_KEY is not configured.",
    };
  }

  const userPrompt = `Write a ${outreachType} backlink outreach email. Our article: '${title}' at ${canonicalUrl}. Target website: ${targetSite}. Email type context: resource-page = we want to be added to their resource list; guest-post = we want to write for them; broken-link = we found a broken link on their site; mention = they mentioned us without linking. Return JSON: { subject: string, bodyHtml: string, reasoning: string }`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 900,
      temperature: 0.4,
      system: "You are an expert SEO outreach specialist. Write emails that are genuine, specific, non-spammy, and provide clear value to the recipient.",
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate outreach email.");
  }

  const payload = await response.json().catch(() => ({}));
  const text = Array.isArray((payload as any).content)
    ? (payload as any).content.map((item: any) => item?.text || "").join("\n").trim()
    : "";
  const jsonBlock = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  const parsed = JSON.parse(jsonBlock);

  return {
    subject: String(parsed.subject || `Quick collaboration idea for ${targetSite}`),
    bodyHtml: String(parsed.bodyHtml || `<p>Hi there,</p><p>I wanted to share "${title}" (${canonicalUrl}).</p>`),
    reasoning: String(parsed.reasoning || ""),
  };
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
    const contentId = String(body?.contentId || "");
    const targetSite = String(body?.targetSite || "");
    const targetEmail = String(body?.targetEmail || "");
    const outreachType = String(body?.outreachType || "") as OutreachType;

    if (!contentId || !targetSite || !targetEmail || !["resource-page", "guest-post", "broken-link", "mention"].includes(outreachType)) {
      return jsonResponse({ success: false, error: "Invalid contentId, targetSite, targetEmail, or outreachType." }, 400);
    }

    const rows = await blink.db.table("content_lab").list({ where: { id: contentId }, limit: 1 });
    const content = (rows?.[0] || null) as ContentRecord | null;
    if (!content) {
      return jsonResponse({ success: false, error: "Content not found." }, 404);
    }
    if (!content.canonicalUrl) {
      return jsonResponse({ success: false, error: "Content must have a canonical URL before outreach generation." }, 400);
    }

    const generated = await generateEmail(
      outreachType,
      content.title || "Untitled",
      content.canonicalUrl,
      targetSite,
    );

    const outreachRecord = await blink.db.table("outreach_records").create({
      contentId,
      targetSite,
      targetEmail,
      targetName: String(body?.targetName || ""),
      outreachType,
      subject: generated.subject,
      bodyHtml: generated.bodyHtml,
      reasoning: generated.reasoning,
      status: "draft",
      generatedAt: new Date().toISOString(),
      sentAt: "",
      repliedAt: "",
      wonAt: "",
      gmailMessageId: "",
      gmailThreadId: "",
    });

    return jsonResponse({ success: true, outreachRecord });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});

