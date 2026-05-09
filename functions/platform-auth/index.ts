import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const PLATFORMS = [
  "medium",
  "devto",
  "hashnode",
  "reddit",
  "github",
  "gmail",
  "google-search-console",
  "quora",
] as const;

type PlatformKey = typeof PLATFORMS[number];

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

function assertPlatform(value: string): PlatformKey {
  if (!PLATFORMS.includes(value as PlatformKey)) {
    throw new Error(`Unsupported platform: ${value}`);
  }
  return value as PlatformKey;
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

function utf8Encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
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
    ["encrypt", "decrypt"],
  );
}

async function encryptTokenData(tokenData: TokenData): Promise<{ iv: string; ciphertext: string }> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = utf8Encode(JSON.stringify(tokenData));
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
  };
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
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") || ""; // Renamed from SUPABASE_SERVICE_ROLE_KEY
  return createClient(url, serviceKey);
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();
    const authHeader = request.headers.get("Authorization") || "";
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userId = user.id;
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");

    if (pathname.endsWith("/save")) {
      if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
      const body = await request.json() as { platform?: string; tokenData?: TokenData };
      const platform = assertPlatform(body.platform || "");
      const tokenData = body.tokenData;

      if (!tokenData?.accessToken) {
        return jsonResponse({ error: "tokenData.accessToken is required" }, 400);
      }

      const encrypted = await encryptTokenData(tokenData);
      
      const { error: dbError } = await supabase
        .from("platform_credentials")
        .upsert({
          user_id: userId,
          platform,
          iv: encrypted.iv,
          ciphertext: encrypted.ciphertext,
          created_at: new Date().toISOString(),
        }, { onConflict: "user_id, platform" });

      if (dbError) throw dbError;
      return jsonResponse({ success: true });
    }

    if (pathname.endsWith("/revoke")) {
      if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
      const body = await request.json() as { platform?: string };
      const platform = assertPlatform(body.platform || "");

      const { error: dbError } = await supabase
        .from("platform_credentials")
        .delete()
        .match({ user_id: userId, platform });

      if (dbError) throw dbError;
      return jsonResponse({ success: true });
    }

    if (pathname.endsWith("/status")) {
      if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);
      
      const { data: records, error: dbError } = await supabase
        .from("platform_credentials")
        .select("*")
        .eq("user_id", userId);

      if (dbError) throw dbError;

      const recordMap = new Map(records.map(r => [r.platform, r]));

      const statuses = await Promise.all(
        PLATFORMS.map(async (platform) => {
          const record = recordMap.get(platform);
          if (!record) return { platform, connected: false };

          try {
            const tokenData = await decryptTokenData(record);
            return {
              platform,
              connected: true,
              ...(tokenData.username ? { username: tokenData.username } : {}),
            };
          } catch {
            return { platform, connected: false };
          }
        }),
      );

      return jsonResponse({ statuses });
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
