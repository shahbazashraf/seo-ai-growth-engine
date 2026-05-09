import { executeCampaignTarget, getDueCampaignTargets } from './distribution-orchestrator';
import { createLogger } from './logger';

const log = createLogger('DistributionCampaignWorker');

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const dueTargets = await getDueCampaignTargets();
    for (const target of dueTargets) {
      log.info('Executing scheduled distribution target', {
        targetId: target.id,
        platform: target.platform,
        targetIdentifier: target.targetIdentifier,
      });
      await executeCampaignTarget(target.id);
    }
  } catch (error) {
    log.error('Distribution campaign worker failed', error);
  } finally {
    running = false;
  }
}

export function startDistributionCampaignWorker(pollMs = 60_000) {
  if (intervalHandle) return;
  setTimeout(() => {
    void tick();
  }, 5_000);
  intervalHandle = setInterval(() => {
    void tick();
  }, pollMs);
}

export function stopDistributionCampaignWorker() {
  if (!intervalHandle) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
}

