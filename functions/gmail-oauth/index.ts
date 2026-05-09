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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/+$/, "");
    const supabase = getSupabase();

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")?.trim() || "";
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")?.trim() || "";
    const redirectUri = Deno.env.get("GOOGLE_GMAIL_REDIRECT_URI")?.trim() || Deno.env.get("GOOGLE_REDIRECT_URI")?.trim() || "";

    if (!clientId || !redirectUri) {
      return jsonResponse({ error: "Google OAuth is not configured." }, 500);
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

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
      ].join(" "));
      authUrl.searchParams.set("state", stateData.state);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("include_granted_scopes", "true");
      authUrl.searchParams.set("prompt", "consent");
      return Response.redirect(authUrl.toString(), 302);
    }

    if (pathname.endsWith("/callback")) {
      if (!clientSecret) {
        return jsonResponse({ error: "Google OAuth client secret is not configured." }, 500);
      }

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

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenPayload = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenPayload.access_token) {
        return jsonResponse({ error: "Failed to exchange Google OAuth code." }, 400);
      }

      const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${String(tokenPayload.access_token)}` },
      });
      const profilePayload = await profileRes.json().catch(() => ({}));

      const expiresIn = Number(tokenPayload.expires_in || 3600);
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      await saveToken(stateRecord.user_id, "gmail", {
        accessToken: String(tokenPayload.access_token),
        refreshToken: tokenPayload.refresh_token ? String(tokenPayload.refresh_token) : undefined,
        expiresAt,
        username: profilePayload?.emailAddress ? String(profilePayload.emailAddress) : undefined,
      });

      const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:3000";
      return Response.redirect(`${siteUrl}/settings?connected=gmail`, 302);
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
