/**
 * Retry logic with exponential backoff for network operations
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  timeoutMs: 30000, // 30 second timeout per attempt
};

/**
 * Exponential backoff delay calculator
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  const delay = initialDelay * Math.pow(multiplier, attempt - 1);
  return Math.min(delay, maxDelay);
}

/**
 * Wraps fetch with retry logic and timeout
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit & { retryOptions?: RetryOptions }
): Promise<Response> {
  const retryOptions = { ...DEFAULT_OPTIONS, ...options?.retryOptions };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retryOptions.maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), retryOptions.timeoutMs);

      const fetchOptions: RequestInit = {
        ...options,
        signal: controller.signal,
      };

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // Retry on 5xx errors, but not 4xx client errors
      if (response.status >= 500 && attempt < retryOptions.maxAttempts) {
        lastError = new Error(
          `Server error (${response.status}) - attempt ${attempt}/${retryOptions.maxAttempts}`
        );
        const delay = calculateDelay(
          attempt,
          retryOptions.initialDelayMs,
          retryOptions.maxDelayMs,
          retryOptions.backoffMultiplier
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(0); // Safety clear
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retryOptions.maxAttempts) {
        const delay = calculateDelay(
          attempt,
          retryOptions.initialDelayMs,
          retryOptions.maxDelayMs,
          retryOptions.backoffMultiplier
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed after ${retryOptions.maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Generic retry wrapper for any async function
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= mergedOptions.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < mergedOptions.maxAttempts) {
        const delay = calculateDelay(
          attempt,
          mergedOptions.initialDelayMs,
          mergedOptions.maxDelayMs,
          mergedOptions.backoffMultiplier
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Async operation failed after ${mergedOptions.maxAttempts} attempts: ${lastError?.message}`
  );
}
