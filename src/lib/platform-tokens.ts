import type { PlatformKey, PlatformStatus, TokenData } from '@/types/platforms';
import { apiUrl, apiHeaders } from '@/lib/api-endpoints';

const PLATFORM_AUTH_BASE = apiUrl('/api/platform-auth');

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (payload as { error?: string }).error || `Request failed with ${response.status}`;
    throw new Error(error);
  }
  return payload as T;
}

export async function savePlatformToken(platform: PlatformKey, tokenData: TokenData): Promise<void> {
  const response = await fetch(`${PLATFORM_AUTH_BASE}/save`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ platform, tokenData }),
  });
  await parseResponse(response);
}

export async function revokePlatformToken(platform: PlatformKey): Promise<void> {
  const response = await fetch(`${PLATFORM_AUTH_BASE}/revoke`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ platform }),
  });
  await parseResponse(response);
}

export async function getPlatformStatuses(): Promise<PlatformStatus[]> {
  const response = await fetch(`${PLATFORM_AUTH_BASE}/status`, {
    method: 'GET',
    headers: apiHeaders(),
  });
  const payload = await parseResponse<{ statuses: PlatformStatus[] }>(response);
  return payload.statuses;
}
