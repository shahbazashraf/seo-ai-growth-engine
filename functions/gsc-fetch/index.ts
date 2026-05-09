import { loadToken, saveToken, type TokenData } from "../_shared/token-store.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type IndexedStatus = "INDEXED" | "NOT_INDEXED" | "EXCLUDED";

interface PerformanceRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
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

function normalizeIndexedStatus(value: string): IndexedStatus {
  const upper = value.toUpperCase();
  if (upper.includes("INDEXED")) return "INDEXED";
  if (upper.includes("EXCLUDED")) return "EXCLUDED";
  return "NOT_INDEXED";
}

async function getValidGscToken(): Promise<{ token?: TokenData; error?: string }> {
  const token = await loadToken("google-search-console");
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
    return { error: mapGoogleError(refreshRes.status, "Failed to refresh Google token.") };
  }

  const refreshed: TokenData = {
    ...token,
    accessToken: String(refreshPayload.access_token),
    refreshToken: token.refreshToken,
    expiresAt: new Date(Date.now() + Number(refreshPayload.expires_in || 3600) * 1000).toISOString(),
  };
  await saveToken("google-search-console", refreshed);
  return { token: refreshed };
}

async function fetchPerformance(
  token: TokenData,
  siteUrl: string,
  startDate: string,
  endDate: string,
  urls?: string[],
) {
  const requestBody: Record<string, unknown> = {
    startDate,
    endDate,
    dimensions: ["query", "page"],
    rowLimit: 500,
    dataState: "final",
  };

  if (Array.isArray(urls) && urls.length > 0) {
    requestBody.dimensionFilterGroups = [
      {
        filters: urls.map((url) => ({
          dimension: "page",
          operator: "equals",
          expression: url,
        })),
      },
    ];
  }

  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.accessToken}`,
      },
      body: JSON.stringify(requestBody),
    },
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: mapGoogleError(res.status, "Failed to fetch Search Console performance data.") };
  }

  const rows = Array.isArray((payload as any).rows) ? (payload as any).rows : [];
  const normalized: PerformanceRow[] = rows.map((row: any) => ({
    query: String(row?.keys?.[0] || ""),
    page: String(row?.keys?.[1] || ""),
    clicks: Number(row?.clicks || 0),
    impressions: Number(row?.impressions || 0),
    ctr: Number(row?.ctr || 0),
    position: Number(row?.position || 0),
  }));
  return { rows: normalized };
}

async function inspectUrl(token: TokenData, siteUrl: string, pageUrl: string) {
  const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.accessToken}`,
    },
    body: JSON.stringify({
      inspectionUrl: pageUrl,
      siteUrl,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: mapGoogleError(res.status, "Failed to inspect URL indexation status.") };
  }

  const indexResult = (payload as any)?.inspectionResult?.indexStatusResult || {};
  const coverageState = String(indexResult.coverageState || "");

  return {
    result: {
      indexedStatus: normalizeIndexedStatus(coverageState),
      crawledAs: indexResult.googleCanonical || indexResult.userCanonical || "",
      lastCrawlTime: indexResult.lastCrawlTime || "",
      verdict: indexResult.verdict || "",
    },
  };
}

async function requestIndexation(token: TokenData, pageUrl: string) {
  const res = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.accessToken}`,
    },
    body: JSON.stringify({ url: pageUrl, type: "URL_UPDATED" }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: mapGoogleError(res.status, "Failed to request indexation.") };
  }
  return { payload };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/+$/, "");
    const body = await req.json().catch(() => ({}));

    const tokenResult = await getValidGscToken();
    if (!tokenResult.token) {
      return jsonResponse({ success: false, error: tokenResult.error }, 401);
    }
    const token = tokenResult.token;

    if (pathname.endsWith("/performance")) {
      const siteUrl = String((body as any)?.siteUrl || "").trim();
      const startDate = String((body as any)?.startDate || "").trim();
      const endDate = String((body as any)?.endDate || "").trim();
      const urls = Array.isArray((body as any)?.urls) ? (body as any).urls.map((v: unknown) => String(v)) : undefined;

      if (!siteUrl || !startDate || !endDate) {
        return jsonResponse({ success: false, error: "siteUrl, startDate, and endDate are required." }, 400);
      }

      const result = await fetchPerformance(token, siteUrl, startDate, endDate, urls);
      if ("error" in result) {
        return jsonResponse({ success: false, error: result.error }, 400);
      }
      return jsonResponse({ success: true, rows: result.rows });
    }

    if (pathname.endsWith("/indexation")) {
      const siteUrl = String((body as any)?.siteUrl || "").trim();
      const pageUrl = String((body as any)?.pageUrl || "").trim();
      if (!siteUrl || !pageUrl) {
        return jsonResponse({ success: false, error: "siteUrl and pageUrl are required." }, 400);
      }

      const result = await inspectUrl(token, siteUrl, pageUrl);
      if ("error" in result) {
        return jsonResponse({ success: false, error: result.error }, 400);
      }
      return jsonResponse({ success: true, ...result.result });
    }

    if (pathname.endsWith("/request-indexation")) {
      const pageUrl = String((body as any)?.pageUrl || "").trim();
      if (!pageUrl) {
        return jsonResponse({ success: false, error: "pageUrl is required." }, 400);
      }

      const result = await requestIndexation(token, pageUrl);
      if ("error" in result) {
        return jsonResponse({ success: false, error: result.error }, 400);
      }
      return jsonResponse({ success: true, data: result.payload });
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});

