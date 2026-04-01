/**
 * Security utilities for enforcing Row-Level Security (RLS) and auth checks
 */

export interface AuthState {
  user: { id: string } | null;
  isAuthenticated: boolean;
}

/**
 * Enforces that userId is present and not empty
 * Throws error if userId is missing or empty
 */
export function enforceUserId(userId: string | null | undefined): string {
  if (!userId || userId.trim() === '') {
    throw new Error('User authentication required - userId is missing or empty');
  }
  return userId;
}

/**
 * Validates multiple required fields
 */
export function enforceFields(
  data: Record<string, any>,
  requiredFields: string[]
): void {
  for (const field of requiredFields) {
    if (data[field] == null || data[field] === '') {
      throw new Error(`Required field missing: ${field}`);
    }
  }
}

/**
 * Ensures data ownership by checking userId
 */
export function ensureOwnership(
  recordUserId: string | null | undefined,
  currentUserId: string
): void {
  if (recordUserId !== currentUserId) {
    throw new Error('Access denied: record does not belong to current user');
  }
}
