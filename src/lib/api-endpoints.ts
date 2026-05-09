import { supabase } from './local-db';

const rawApiBase = (import.meta.env.VITE_API_BASE_URL || 'https://sbfgglpjbeyvsoylqcdb.supabase.co/functions/v1').trim().replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  // Supabase functions are at the root of /functions/v1/, so we strip /api if present
  const normalizedPath = cleanPath.startsWith('/api/') ? cleanPath.substring(4) : cleanPath;
  return `${rawApiBase}${normalizedPath}`;
}

export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (anonKey) {
    headers['apikey'] = anonKey;
  }

  // Get current session synchronously from local storage if possible
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const projectRef = supabaseUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1] || 'sbfgglpjbeyvsoylqcdb';
  const storageKey = `sb-${projectRef}-auth-token`;

  const sessionStr = localStorage.getItem(storageKey);
  if (sessionStr) {
    try {
      const session = JSON.parse(sessionStr);
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch {
      // Fallback to anon key if session parse fails
      if (anonKey) headers['Authorization'] = `Bearer ${anonKey}`;
    }
  } else if (anonKey) {
    headers['Authorization'] = `Bearer ${anonKey}`;
  }

  return headers;
}

export function redirectToApi(path: string): void {
  window.location.href = apiUrl(path);
}
