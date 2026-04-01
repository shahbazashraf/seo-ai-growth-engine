// ─── Distribution Queue System ───────────────────────────────────────────────
// Background job queue for sequential publishing with retry, progress tracking,
// and history logging. Prevents popup blocking and handles transient failures.

import { createLogger } from './logger';

const log = createLogger('DistQueue');

// ─── Types ───────────────────────────────────────────────────────────────────

export type JobStatus = 'queued' | 'running' | 'success' | 'failed' | 'retrying' | 'cancelled';

export interface DistributionJob {
  id: string;
  contentId: string;
  platform: string;
  status: JobStatus;
  attempt: number;
  maxAttempts: number;
  result?: {
    url?: string;
    error?: string;
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface QueueProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  current: string | null;
  jobs: DistributionJob[];
}

type ProgressCallback = (progress: QueueProgress) => void;
type PlatformPublisher = (job: DistributionJob) => Promise<{ success: boolean; url?: string; error?: string }>;

// ─── Queue Implementation ────────────────────────────────────────────────────

class DistributionQueue {
  private jobs: DistributionJob[] = [];
  private running = false;
  private cancelled = false;
  private progressCallbacks: ProgressCallback[] = [];
  private publishers: Map<string, PlatformPublisher> = new Map();

  /**
   * Register a publisher function for a platform
   */
  registerPublisher(platformId: string, publisher: PlatformPublisher): void {
    this.publishers.set(platformId, publisher);
  }

  /**
   * Subscribe to progress updates
   */
  onProgress(callback: ProgressCallback): () => void {
    this.progressCallbacks.push(callback);
    return () => {
      this.progressCallbacks = this.progressCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Add jobs to the queue
   */
  enqueue(contentId: string, platforms: string[], maxAttempts = 3): string[] {
    const ids: string[] = [];

    platforms.forEach(platform => {
      const id = `dq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.jobs.push({
        id,
        contentId,
        platform,
        status: 'queued',
        attempt: 0,
        maxAttempts,
        createdAt: new Date().toISOString(),
      });
      ids.push(id);
    });

    log.info('Jobs enqueued', { contentId, platforms, count: platforms.length });
    this.notifyProgress();
    return ids;
  }

  /**
   * Process the queue sequentially
   */
  async process(): Promise<QueueProgress> {
    if (this.running) {
      log.warn('Queue already processing');
      return this.getProgress();
    }

    this.running = true;
    this.cancelled = false;
    log.info('Queue processing started', { jobCount: this.jobs.length });

    const pendingJobs = this.jobs.filter(j => j.status === 'queued' || j.status === 'retrying');

    for (const job of pendingJobs) {
      if (this.cancelled) {
        job.status = 'cancelled';
        continue;
      }

      job.status = 'running';
      job.startedAt = new Date().toISOString();
      job.attempt++;
      this.notifyProgress();

      const publisher = this.publishers.get(job.platform);
      if (!publisher) {
        job.status = 'failed';
        job.result = { error: `No publisher registered for ${job.platform}` };
        job.completedAt = new Date().toISOString();
        log.warn('No publisher for platform', { platform: job.platform });
        this.notifyProgress();
        continue;
      }

      try {
        const result = await publisher(job);

        if (result.success) {
          job.status = 'success';
          job.result = { url: result.url };
          log.info('Job succeeded', { platform: job.platform, url: result.url });
        } else {
          // Retry logic
          if (job.attempt < job.maxAttempts) {
            job.status = 'retrying';
            job.result = { error: result.error };
            log.warn('Job failed, will retry', {
              platform: job.platform,
              attempt: job.attempt,
              maxAttempts: job.maxAttempts,
              error: result.error,
            });

            // Exponential backoff
            const delay = Math.min(1000 * Math.pow(2, job.attempt - 1), 10000);
            await new Promise(r => setTimeout(r, delay));

            // Re-process this job
            job.status = 'running';
            job.attempt++;
            this.notifyProgress();

            const retryResult = await publisher(job);
            if (retryResult.success) {
              job.status = 'success';
              job.result = { url: retryResult.url };
            } else {
              job.status = 'failed';
              job.result = { error: retryResult.error };
            }
          } else {
            job.status = 'failed';
            job.result = { error: result.error };
          }
        }
      } catch (err) {
        job.status = 'failed';
        job.result = { error: err instanceof Error ? err.message : 'Unknown error' };
        log.error('Job threw exception', {
          platform: job.platform,
          error: job.result.error,
        });
      }

      job.completedAt = new Date().toISOString();
      this.notifyProgress();

      // Small delay between platforms to avoid rate limiting
      if (!this.cancelled) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    this.running = false;
    const finalProgress = this.getProgress();
    log.info('Queue processing complete', {
      succeeded: finalProgress.succeeded,
      failed: finalProgress.failed,
      total: finalProgress.total,
    });

    return finalProgress;
  }

  /**
   * Cancel the queue
   */
  cancel(): void {
    this.cancelled = true;
    this.running = false;
    log.info('Queue cancelled');

    this.jobs
      .filter(j => j.status === 'queued' || j.status === 'running')
      .forEach(j => { j.status = 'cancelled'; });

    this.notifyProgress();
  }

  /**
   * Get current progress
   */
  getProgress(): QueueProgress {
    const completed = this.jobs.filter(j =>
      j.status === 'success' || j.status === 'failed' || j.status === 'cancelled'
    ).length;

    const running = this.jobs.find(j => j.status === 'running');

    return {
      total: this.jobs.length,
      completed,
      succeeded: this.jobs.filter(j => j.status === 'success').length,
      failed: this.jobs.filter(j => j.status === 'failed').length,
      current: running?.platform || null,
      jobs: [...this.jobs],
    };
  }

  /**
   * Clear completed jobs
   */
  clear(): void {
    this.jobs = [];
    this.notifyProgress();
  }

  /**
   * Check if queue is actively processing
   */
  isRunning(): boolean {
    return this.running;
  }

  private notifyProgress(): void {
    const progress = this.getProgress();
    this.progressCallbacks.forEach(cb => {
      try { cb(progress); } catch { /* ignore callback errors */ }
    });
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const distributionQueue = new DistributionQueue();
