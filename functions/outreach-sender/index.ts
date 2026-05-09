import { createClient } from "npm:@blinkdotnew/sdk";
import { loadToken, saveToken, type TokenData } from "../_shared/token-store.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface OutreachRecord {
  id: string;
  contentId: string;
  targetSite: string;
  targetEmail: string;
  targetName?: string;
  subject: string;
  bodyHtml: string;
  status: "draft" | "sent" | "replied" | "won" | "lost";
  sentAt?: string;
  repliedAt?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  generatedAt?: string;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapGoogleError(status: number, fallback: string): string {
  if (status === 401) return "Token invalid or expired. Please reconnect in Settings.";
  if (status === 429) return "Rate limited. Try again in 1 hour.";
  return fallback;
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getValidGmailToken(): Promise<{ token?: TokenData; error?: string }> {
  const token = await loadToken("gmail");
  if (!token) {
    return { error: "Platform not connected. Please add your API token in Settings." };
  }

  const expiresAtMs = token.expiresAt ? new Date(token.expiresAt).getTime() : 0;
  const stillValid = !expiresAtMs || Date.now() < expiresAtMs - 60_000;
  if (stillValid) return { token };

  if (!token.refreshToken) {
    return { error: "Token invalid or expired. Please reconnect in Settings." };
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")?.trim() || "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")?.trim() || "";
  if (!clientId || !clientSecret) {
    return { error: "Google OAuth is not configured." };
  }

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    }),
  });

  const refreshPayload = await refreshRes.json().catch(() => ({}));
  if (!refreshRes.ok || !refreshPayload.access_token) {
    return { error: mapGoogleError(refreshRes.status, "Failed to refresh Gmail token.") };
  }

  const refreshed: TokenData = {
    ...token,
    accessToken: String(refreshPayload.access_token),
    refreshToken: token.refreshToken,
    expiresAt: new Date(Date.now() + Number(refreshPayload.expires_in || 3600) * 1000).toISOString(),
  };
  await saveToken("gmail", refreshed);
  return { token: refreshed };
}

async function fetchGmailProfile(token: TokenData) {
  const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  const profilePayload = await profileRes.json().catch(() => ({}));
  if (!profileRes.ok) {
    throw new Error(mapGoogleError(profileRes.status, "Failed to fetch Gmail profile."));
  }
  return { emailAddress: String(profilePayload?.emailAddress || "") };
}

async function sendOutreachEmail(token: TokenData, outreach: OutreachRecord) {
  const profile = await fetchGmailProfile(token);

  const rfc2822 = [
    `To: ${outreach.targetEmail}`,
    `From: ${profile.emailAddress}`,
    `Subject: ${outreach.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    `X-SEO-Tool: true`,
    ``,
    outreach.bodyHtml,
  ].join("\r\n");

  const raw = base64UrlEncode(rfc2822);
  const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.accessToken}`,
    },
    body: JSON.stringify({ raw }),
  });
  const sendPayload = await sendRes.json().catch(() => ({}));
  if (!sendRes.ok) {
    throw new Error(mapGoogleError(sendRes.status, "Failed to send outreach email."));
  }

  return {
    messageId: String(sendPayload?.id || ""),
    threadId: String(sendPayload?.threadId || ""),
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
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/+$/, "");
    const body = await req.json().catch(() => ({}));

    const tokenResult = await getValidGmailToken();
    if (!tokenResult.token) {
      return jsonResponse({ success: false, error: tokenResult.error }, 401);
    }
    const token = tokenResult.token;

    if (pathname.endsWith("/send")) {
      const outreachId = String(body?.outreachId || "");
      if (!outreachId) {
        return jsonResponse({ success: false, error: "outreachId is required." }, 400);
      }

      const rows = await blink.db.table("outreach_records").list({ where: { id: outreachId }, limit: 1 });
      const outreach = (rows?.[0] || null) as OutreachRecord | null;
      if (!outreach) {
        return jsonResponse({ success: false, error: "Outreach record not found." }, 404);
      }
      if (!outreach.targetEmail || !outreach.subject || !outreach.bodyHtml) {
        return jsonResponse({ success: false, error: "Outreach record is incomplete." }, 400);
      }

      const sent = await sendOutreachEmail(token, outreach);
      const sentAt = new Date().toISOString();

      await blink.db.table("outreach_records").update(outreach.id, {
        status: "sent",
        sentAt,
        gmailMessageId: sent.messageId,
        gmailThreadId: sent.threadId,
      });

      return jsonResponse({ success: true, messageId: sent.messageId, threadId: sent.threadId });
    }

    if (pathname.endsWith("/check-replies")) {
      const outreachIds = Array.isArray(body?.outreachIds)
        ? body.outreachIds.map((v: unknown) => String(v))
        : [];

      const rows = await blink.db.table("outreach_records").list({ where: { status: "sent" }, limit: 500 });
      const now = Date.now();
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

      const eligible = (rows as OutreachRecord[])
        .filter((row) => Boolean(row.gmailThreadId))
        .filter((row) => outreachIds.length === 0 || outreachIds.includes(row.id))
        .filter((row) => {
          const sentAtMs = row.sentAt ? new Date(row.sentAt).getTime() : 0;
          return sentAtMs === 0 || now - sentAtMs <= ninetyDaysMs;
        });

      const updated: OutreachRecord[] = [];
      for (const record of eligible) {
        const threadRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${record.gmailThreadId}`, {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        });
        const threadPayload = await threadRes.json().catch(() => ({}));
        if (!threadRes.ok) continue;
        const messages = Array.isArray(threadPayload?.messages) ? threadPayload.messages : [];
        if (messages.length > 1) {
          const repliedAt = new Date().toISOString();
          const next = {
            ...record,
            status: "replied" as const,
            repliedAt,
          };
          await blink.db.table("outreach_records").update(record.id, { status: "replied", repliedAt });
          updated.push(next);
        }
      }

      return jsonResponse({ success: true, updatedRecords: updated });
    }

    return jsonResponse({ success: false, error: "Not found." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});

