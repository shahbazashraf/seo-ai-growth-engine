// ─── Input Validation & Sanitization ──────────────────────────────────────────
// Zod-based validation schemas for all user inputs across the platform.
// Prevents XSS, enforces formats, and provides user-friendly error messages.

import { z } from 'zod';

// ─── URL Validation ───────────────────────────────────────────────────────────

export const urlSchema = z
  .string()
  .min(1, 'URL is required')
  .transform((val) => {
    let url = val.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    return url;
  })
  .refine(
    (val) => {
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid URL format. Example: https://example.com' }
  );

// ─── API Key Validation ──────────────────────────────────────────────────────

export const openRouterKeySchema = z
  .string()
  .min(1, 'API key is required')
  .refine((val) => val.startsWith('sk-or-'), {
    message: 'OpenRouter keys start with "sk-or-"',
  });

export const geminiKeySchema = z
  .string()
  .min(1, 'API key is required')
  .refine((val) => val.startsWith('AIza'), {
    message: 'Gemini keys start with "AIza"',
  });

export const apiKeySchema = z
  .string()
  .min(10, 'API key is too short')
  .max(500, 'API key is too long');

// ─── Content Validation ──────────────────────────────────────────────────────

export const contentTopicSchema = z
  .string()
  .min(3, 'Topic must be at least 3 characters')
  .max(200, 'Topic must be under 200 characters')
  .transform((val) => sanitizeText(val));

export const contentTitleSchema = z
  .string()
  .min(5, 'Title must be at least 5 characters')
  .max(200, 'Title must be under 200 characters')
  .transform((val) => sanitizeText(val));

export const metaDescriptionSchema = z
  .string()
  .max(300, 'Meta description must be under 300 characters')
  .transform((val) => sanitizeText(val));

export const contentBodySchema = z
  .string()
  .min(50, 'Content must be at least 50 characters')
  .max(100000, 'Content exceeds maximum length');

export const imageUrlSchema = z
  .string()
  .url('Invalid image URL')
  .refine(
    (val) => {
      const lower = val.toLowerCase();
      return (
        lower.startsWith('https://') ||
        lower.startsWith('http://') ||
        lower.startsWith('data:image/')
      );
    },
    { message: 'Image URL must use http(s):// or data:image/' }
  );

// ─── Site Audit Schema ───────────────────────────────────────────────────────

export const auditInputSchema = z.object({
  url: urlSchema,
  skipCache: z.boolean().optional().default(false),
});

// ─── Content Generation Schema ───────────────────────────────────────────────

export type ContentType = 'blog' | 'landing-page' | 'product-description';

export const contentGenerationSchema = z.object({
  topic: contentTopicSchema,
  contentType: z.enum(['blog', 'landing-page', 'product-description']).default('blog'),
  wordCount: z.number().min(300).max(5000).default(1200),
  tone: z.enum(['professional', 'casual', 'technical', 'persuasive']).default('professional'),
  includeImages: z.boolean().default(true),
  includeFAQ: z.boolean().default(true),
});

// ─── Backlink Analysis Schema ────────────────────────────────────────────────

export const backlinkAnalysisSchema = z.object({
  siteUrl: urlSchema,
});

// ─── Schedule Schema ─────────────────────────────────────────────────────────

export const scheduleSchema = z.object({
  contentId: z.string().min(1, 'Content ID is required'),
  publishAt: z.string().datetime({ message: 'Invalid date/time format' }).optional(),
  platforms: z.array(z.string()).min(1, 'Select at least one platform'),
  recurring: z.enum(['none', 'daily', 'weekly', 'biweekly', 'monthly']).default('none'),
});

// ─── Sanitization Helpers ────────────────────────────────────────────────────

/**
 * Remove potential XSS vectors from text input
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript\s*:/gi, '')
    .trim();
}

/**
 * Sanitize HTML content (allows safe markdown-generated HTML)
 */
export function sanitizeHtml(input: string): string {
  const dangerousTags = /<(script|iframe|object|embed|form|input|button|select|textarea)\b[^>]*>/gi;
  const eventHandlers = /\s+on\w+\s*=\s*["'][^"']*["']/gi;
  const jsUrls = /href\s*=\s*["']javascript:[^"']*["']/gi;

  return input
    .replace(dangerousTags, '')
    .replace(eventHandlers, '')
    .replace(jsUrls, '');
}

// ─── Validation Helper ──────────────────────────────────────────────────────

/**
 * Validate input against a schema and return result
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => e.message),
  };
}

/**
 * Validate and throw on failure (for mutations)
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = validate(schema, data);
  if (!result.success) {
    throw new Error(result.errors[0]);
  }
  return result.data;
}
