// ─── Structured Logging System ────────────────────────────────────────────────
// Centralized logging with levels, timestamps, breadcrumbs, and performance tracking.
// Replaces scattered console.log/error calls throughout the codebase.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
  duration?: number;
}

interface Breadcrumb {
  action: string;
  module: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Configuration
const config = {
  minLevel: (import.meta.env?.DEV ? 'debug' : 'info') as LogLevel,
  maxBreadcrumbs: 50,
  enableConsole: true,
  enableStorage: true,
  maxStoredLogs: 200,
};

// In-memory stores
const breadcrumbs: Breadcrumb[] = [];
const storedLogs: LogEntry[] = [];

// ─── Core Logger ──────────────────────────────────────────────────────────────

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[config.minLevel];
}

function formatEntry(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}]`;
  const duration = entry.duration ? ` (${entry.duration}ms)` : '';
  return `${prefix} ${entry.message}${duration}`;
}

function emit(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return;

  // Console output with colors
  if (config.enableConsole) {
    const formatted = formatEntry(entry);
    const consoleFn = entry.level === 'error' ? console.error
      : entry.level === 'warn' ? console.warn
      : entry.level === 'debug' ? console.debug
      : console.log;

    if (entry.data && Object.keys(entry.data).length > 0) {
      consoleFn(formatted, entry.data);
    } else {
      consoleFn(formatted);
    }
  }

  // Store in memory for debugging
  if (config.enableStorage) {
    storedLogs.push(entry);
    if (storedLogs.length > config.maxStoredLogs) {
      storedLogs.splice(0, storedLogs.length - config.maxStoredLogs);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a scoped logger for a specific module
 */
export function createLogger(module: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    emit({
      level,
      module,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  };

  return {
    debug: (msg: string, data?: Record<string, unknown>) => log('debug', msg, data),
    info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log('warn', msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data),

    /**
     * Time an async operation and log the duration
     */
    async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try {
        const result = await fn();
        const duration = Math.round(performance.now() - start);
        emit({
          level: 'info',
          module,
          message: `${label} completed`,
          timestamp: new Date().toISOString(),
          duration,
        });
        return result;
      } catch (err) {
        const duration = Math.round(performance.now() - start);
        emit({
          level: 'error',
          module,
          message: `${label} failed`,
          data: { error: err instanceof Error ? err.message : String(err) },
          timestamp: new Date().toISOString(),
          duration,
        });
        throw err;
      }
    },
  };
}

// ─── Breadcrumbs ──────────────────────────────────────────────────────────────

/**
 * Add a breadcrumb for tracking user flow through the app
 */
export function addBreadcrumb(action: string, module: string, data?: Record<string, unknown>): void {
  breadcrumbs.push({
    action,
    module,
    timestamp: new Date().toISOString(),
    data,
  });
  if (breadcrumbs.length > config.maxBreadcrumbs) {
    breadcrumbs.splice(0, breadcrumbs.length - config.maxBreadcrumbs);
  }
}

/**
 * Get all breadcrumbs (for debugging / error reports)
 */
export function getBreadcrumbs(): readonly Breadcrumb[] {
  return breadcrumbs;
}

// ─── Debug Utilities ──────────────────────────────────────────────────────────

/**
 * Get stored logs (useful for built-in debug panel)
 */
export function getStoredLogs(): readonly LogEntry[] {
  return storedLogs;
}

/**
 * Export logs as JSON string (for support/debugging)
 */
export function exportLogs(): string {
  return JSON.stringify({
    logs: storedLogs,
    breadcrumbs,
    exportedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
  }, null, 2);
}

/**
 * Clear all stored logs and breadcrumbs
 */
export function clearLogs(): void {
  storedLogs.length = 0;
  breadcrumbs.length = 0;
}
