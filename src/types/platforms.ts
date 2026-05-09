export type PlatformKey =
  | 'medium'
  | 'devto'
  | 'hashnode'
  | 'reddit'
  | 'github'
  | 'gmail'
  | 'google-search-console'
  | 'quora';

export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  userId?: string;
  username?: string;
}

export interface PlatformStatus {
  platform: PlatformKey;
  connected: boolean;
  username?: string;
}

export type PostResult = {
  success: boolean;
  platformPostId?: string;
  publishedUrl?: string;
  error?: string;
  postedAt?: string;
};

export type SyndicationTarget = {
  platform: PlatformKey;
  mode: 'full-canonical' | 'teaser' | 'social-snippet';
};
