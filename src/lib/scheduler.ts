// ─── Scheduling System ───────────────────────────────────────────────────────
// Client-side scheduling for content publishing with persist to localStorage.
// Supports: publish now, schedule later, recurring publishing.

import { createLogger } from './logger';

const log = createLogger('Scheduler');

const STORAGE_KEY = 'seo_scheduled_jobs';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScheduleMode = 'now' | 'later' | 'recurring';
export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type ScheduleStatus = 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScheduledJob {
  id: string;
  contentId: string;
  contentTitle: string;
  platforms: string[];
  mode: ScheduleMode;
  scheduledAt: string; // ISO string
  recurringFrequency?: RecurringFrequency;
  status: ScheduleStatus;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  history: ScheduleHistoryEntry[];
}

export interface ScheduleHistoryEntry {
  timestamp: string;
  platform: string;
  status: 'success' | 'failed' | 'opened';
  url?: string;
  error?: string;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

function loadJobs(): ScheduledJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveJobs(jobs: ScheduledJob[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a new scheduled job
 */
export function createScheduledJob(params: {
  contentId: string;
  contentTitle: string;
  platforms: string[];
  mode: ScheduleMode;
  scheduledAt?: string;
  recurringFrequency?: RecurringFrequency;
}): ScheduledJob {
  const id = `sj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let scheduledAt: string;
  if (params.mode === 'now') {
    scheduledAt = new Date().toISOString();
  } else if (params.scheduledAt) {
    scheduledAt = params.scheduledAt;
  } else {
    scheduledAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
  }

  const job: ScheduledJob = {
    id,
    contentId: params.contentId,
    contentTitle: params.contentTitle,
    platforms: params.platforms,
    mode: params.mode,
    scheduledAt,
    recurringFrequency: params.recurringFrequency,
    status: params.mode === 'now' ? 'running' : 'scheduled',
    createdAt: new Date().toISOString(),
    nextRunAt: params.mode === 'recurring' ? scheduledAt : undefined,
    history: [],
  };

  const jobs = loadJobs();
  jobs.unshift(job);
  saveJobs(jobs);

  log.info('Scheduled job created', {
    id,
    mode: params.mode,
    platforms: params.platforms,
    scheduledAt,
  });

  return job;
}

/**
 * Get all scheduled jobs
 */
export function getScheduledJobs(): ScheduledJob[] {
  return loadJobs();
}

/**
 * Get one scheduled job by ID
 */
export function getScheduledJob(id: string): ScheduledJob | null {
  return loadJobs().find(j => j.id === id) || null;
}

/**
 * Update a scheduled job
 */
export function updateScheduledJob(id: string, updates: Partial<ScheduledJob>): ScheduledJob | null {
  const jobs = loadJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return null;

  jobs[idx] = { ...jobs[idx], ...updates };
  saveJobs(jobs);
  return jobs[idx];
}

/**
 * Add a history entry to a job
 */
export function addJobHistory(jobId: string, entry: ScheduleHistoryEntry): void {
  const jobs = loadJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job) return;

  job.history.push(entry);
  job.lastRunAt = entry.timestamp;

  // Calculate next run for recurring jobs
  if (job.mode === 'recurring' && job.recurringFrequency) {
    const nextDate = calculateNextRun(new Date(), job.recurringFrequency);
    job.nextRunAt = nextDate.toISOString();
  }

  saveJobs(jobs);
}

/**
 * Mark a job as completed
 */
export function completeJob(jobId: string): void {
  const jobs = loadJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job) return;

  if (job.mode === 'recurring') {
    job.status = 'scheduled'; // Stay scheduled for next occurrence
  } else {
    job.status = 'completed';
  }

  job.lastRunAt = new Date().toISOString();
  saveJobs(jobs);

  log.info('Job completed', { id: jobId, mode: job.mode });
}

/**
 * Cancel a scheduled job
 */
export function cancelScheduledJob(id: string): boolean {
  const jobs = loadJobs();
  const job = jobs.find(j => j.id === id);
  if (!job) return false;

  job.status = 'cancelled';
  saveJobs(jobs);

  log.info('Job cancelled', { id });
  return true;
}

/**
 * Delete a scheduled job
 */
export function deleteScheduledJob(id: string): boolean {
  const jobs = loadJobs();
  const filtered = jobs.filter(j => j.id !== id);
  if (filtered.length === jobs.length) return false;

  saveJobs(filtered);
  log.info('Job deleted', { id });
  return true;
}

/**
 * Get jobs that are due to run (for polling)
 */
export function getDueJobs(): ScheduledJob[] {
  const now = new Date();
  return loadJobs().filter(job => {
    if (job.status !== 'scheduled') return false;

    const scheduledTime = new Date(job.mode === 'recurring' && job.nextRunAt
      ? job.nextRunAt
      : job.scheduledAt);

    return scheduledTime <= now;
  });
}

/**
 * Get publishing history across all jobs
 */
export function getPublishingHistory(limit = 50): Array<{
  jobId: string;
  contentTitle: string;
  platform: string;
  status: string;
  timestamp: string;
  url?: string;
}> {
  const allHistory: Array<{
    jobId: string;
    contentTitle: string;
    platform: string;
    status: string;
    timestamp: string;
    url?: string;
  }> = [];

  const jobs = loadJobs();
  jobs.forEach(job => {
    job.history.forEach(entry => {
      allHistory.push({
        jobId: job.id,
        contentTitle: job.contentTitle,
        platform: entry.platform,
        status: entry.status,
        timestamp: entry.timestamp,
        url: entry.url,
      });
    });
  });

  return allHistory
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calculateNextRun(from: Date, frequency: RecurringFrequency): Date {
  const next = new Date(from);
  switch (frequency) {
    case 'daily': next.setDate(next.getDate() + 1); break;
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'biweekly': next.setDate(next.getDate() + 14); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
  }
  return next;
}
