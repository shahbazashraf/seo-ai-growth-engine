import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const PLATFORM_KEYS = [
  "medium",
  "devto",
  "hashnode",
  "reddit",
  "github",
  "gmail",
  "google-search-console",
  "quora",
] as const;

export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  userId?: string;
  username?: string;
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
  return await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptTokenData(tokenData: TokenData): Promise<{ iv: string; ciphertext: string }> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = utf8Encode(JSON.stringify(tokenData));
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
  };
}

export async function decryptTokenData(ivHex: string, ciphertextHex: string): Promise<TokenData> {
  const key = await getEncryptionKey();
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const plaintextBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(utf8Decode(new Uint8Array(plaintextBuffer))) as TokenData;
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SERVICE_ROLE_KEY") || ""
  );
}

export async function saveToken(userId: string, platform: PlatformKey, tokenData: TokenData): Promise<void> {
  const encrypted = await encryptTokenData(tokenData);
  const supabase = getSupabase();
  
  const { error } = await supabase
    .from("platform_credentials")
    .upsert({
      user_id: userId,
      platform,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      created_at: new Date().toISOString(),
    }, { onConflict: "user_id, platform" });

  if (error) throw error;
}

export async function loadToken(userId: string, platform: PlatformKey): Promise<TokenData | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("platform_credentials")
    .select("*")
    .match({ user_id: userId, platform })
    .single();

  if (error || !data) return null;

  try {
    return await decryptTokenData(data.iv, data.ciphertext);
  } catch {
    return null;
  }
}
