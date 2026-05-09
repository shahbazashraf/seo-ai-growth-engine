import { getDueJobs, addJobHistory, completeJob, ScheduledJob } from './scheduler';
import { createLogger } from './logger';
import { localDB } from './local-db';
import { apiUrl, apiHeaders } from './api-endpoints';

const log = createLogger('SchedulerWorker');

let isWorkerRunning = false;
let pollingInterval: ReturnType<typeof setInterval> | null = null;

// Endpoints used for distribution (from DistributionEngine)
const SYNDICATION_URL = apiUrl('/api/syndication-poster');
const REDDIT_POSTER_URL = apiUrl('/api/reddit-poster');
const QUORA_AGENT_URL = apiUrl('/api/quora-agent');

/**
 * Sleeps for a given number of milliseconds
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Process a single job across its specified platforms
 */
async function processJob(job: ScheduledJob) {
  log.info(`Processing due job: ${job.id} for content: ${job.contentId}`, { platforms: job.platforms });
  
  // Try to find the associated content in localDB (used to pass down payload details if endpoints expect them)
  const content = await localDB.table('content_lab').get(job.contentId).catch(() => null);

  for (const platform of job.platforms) {
    try {
      log.info(`Job ${job.id} - Posting to ${platform}...`);
      
      let endpoint = '';
      let payload: any = {
        contentId: job.contentId,
        platform: platform,
        mode: 'full-canonical' // default mode
      };

      if (['medium', 'devto', 'hashnode'].includes(platform)) {
        endpoint = SYNDICATION_URL;
      } else if (platform === 'reddit') {
        endpoint = REDDIT_POSTER_URL;
        payload = { ...payload, subreddit: 'SEO', postType: 'link' }; // Defaults for testing
      } else if (platform === 'quora') {
        endpoint = QUORA_AGENT_URL;
        payload = { ...payload, topic: 'SEO' }; // Defaults for testing
      } else {
        // Social or unsupported automated tier
        addJobHistory(job.id, {
          timestamp: new Date().toISOString(),
          platform,
          status: 'failed',
          error: `Platform ${platform} does not support background automation yet.`
        });
        continue;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.success !== false) {
        log.info(`Job ${job.id} - Successfully posted to ${platform}`);
        addJobHistory(job.id, {
          timestamp: new Date().toISOString(),
          platform,
          status: 'success',
          url: result.publishedUrl || result.answerUrl || result.url
        });
      } else {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

    } catch (error: any) {
      log.error(`Job ${job.id} - Failed to post to ${platform}`, error);
      addJobHistory(job.id, {
        timestamp: new Date().toISOString(),
        platform,
        status: 'failed',
        error: error.message
      });
    }

    // Rate limiting: sleep for 5 seconds between platforms to avoid spam flags
    await sleep(5000);
  }

  // Finalize job status
  completeJob(job.id);
  log.info(`Finished processing job: ${job.id}`);
}

/**
 * Background worker loop
 */
async function workerTick() {
  const dueJobs = getDueJobs();
  
  if (dueJobs.length > 0) {
    log.info(`Found ${dueJobs.length} due jobs. Processing...`);
    for (const job of dueJobs) {
      await processJob(job);
      // Wait a bit before processing the next job entirely
      await sleep(10000);
    }
  }
}

/**
 * Starts the local scheduling worker. Should only be called once globally.
 */
export function startLocalScheduler(pollIntervalMs = 60000) {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  
  log.info('Starting local scheduler background worker...');
  
  // Initial tick after a short delay to let app load
  setTimeout(() => workerTick(), 5000);

  pollingInterval = setInterval(() => {
    workerTick();
  }, pollIntervalMs);
}

export function stopLocalScheduler() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  isWorkerRunning = false;
  log.info('Stopped local scheduler background worker.');
}
