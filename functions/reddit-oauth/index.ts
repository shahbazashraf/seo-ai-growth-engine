import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { saveToken } from "../_shared/token-store.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SERVICE_ROLE_KEY") || ""
  );
}

function buildBasicAuth(clientId: string, clientSecret: string) {
  return btoa(`${clientId}:${clientSecret}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/+$/, "");
    const supabase = getSupabase();

    const clientId = Deno.env.get("REDDIT_CLIENT_ID")?.trim() || "";
    const clientSecret = Deno.env.get("REDDIT_CLIENT_SECRET")?.trim() || "";
    const redirectUri = Deno.env.get("REDDIT_REDIRECT_URI")?.trim() || "";

    if (!clientId || !redirectUri) {
      return jsonResponse({ error: "Reddit OAuth is not configured." }, 500);
    }

    if (pathname.endsWith("/start")) {
      const accessToken = url.searchParams.get("access_token");
      if (!accessToken) return jsonResponse({ error: "access_token is required" }, 401);

      const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
      if (authError || !user) return jsonResponse({ error: "Invalid session" }, 401);

      const { data: stateData, error: stateError } = await supabase
        .from("oauth_states")
        .insert({ user_id: user.id })
        .select()
        .single();
      
      if (stateError) throw stateError;

      const authUrl = new URL("https://www.reddit.com/api/v1/authorize");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("state", stateData.state);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("duration", "permanent");
      authUrl.searchParams.set("scope", "submit identity read");
      return Response.redirect(authUrl.toString(), 302);
    }

    if (pathname.endsWith("/callback")) {
      const state = url.searchParams.get("state") || "";
      const code = url.searchParams.get("code") || "";
      if (!state || !code) return jsonResponse({ error: "Missing OAuth state or code." }, 400);

      const { data: stateRecord, error: stateError } = await supabase
        .from("oauth_states")
        .delete()
        .match({ state })
        .select()
        .single();
      
      if (stateError || !stateRecord) {
        return jsonResponse({ error: "OAuth state mismatch or expired. Please try connecting again." }, 400);
      }

      const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${buildBasicAuth(clientId, clientSecret)}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenPayload = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenPayload.access_token) {
        return jsonResponse({ error: "Failed to exchange Reddit OAuth code." }, 400);
      }

      const meRes = await fetch("https://oauth.reddit.com/api/v1/me", {
        headers: {
          Authorization: `Bearer ${tokenPayload.access_token}`,
          "User-Agent": Deno.env.get("REDDIT_USER_AGENT") || "SEOAIAutomation/1.0",
        },
      });
      const mePayload = await meRes.json().catch(() => ({}));
      const username = mePayload?.name ? String(mePayload.name) : undefined;

      const expiresIn = Number(tokenPayload.expires_in || 3600);
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      await saveToken(stateRecord.user_id, "reddit", {
        accessToken: String(tokenPayload.access_token),
        refreshToken: tokenPayload.refresh_token ? String(tokenPayload.refresh_token) : undefined,
        expiresAt,
        username,
      });

      // Redirect back to frontend settings page
      const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:3000";
      return Response.redirect(`${siteUrl}/settings?connected=reddit`, 302);
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
