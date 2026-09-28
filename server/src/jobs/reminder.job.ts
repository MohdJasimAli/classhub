import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env.js';
import { runReminderSweep, pruneStaleReminders } from '../services/deadlineReminder.service.js';

/**
 * ---------------------------------------------------------------------------
 * Scheduled jobs (node-cron)
 *
 * The reminder sweep runs on a short interval. Because the sweep is fully
 * idempotent and database-driven, this interval is a liveness knob, not a
 * correctness one: running it more or less often can never produce duplicates
 * or lose a reminder.
 *
 * A sweep is also executed once at boot, so a server that was down across a
 * reminder window catches up as soon as it comes back.
 * ---------------------------------------------------------------------------
 */

let reminderTask: ScheduledTask | null = null;
let sweepRunning = false;

/** Guards against overlapping sweeps if a run overruns the interval. */
async function guardedSweep(trigger: string): Promise<void> {
  if (sweepRunning) {
     
    console.warn('[jobs] previous sweep still running, skipping this tick');
    return;
  }
  sweepRunning = true;
  const startedAt = Date.now();
  try {
    const summary = await runReminderSweep();
     
    console.log(
      `[jobs] sweep (${trigger}) finished in ${Date.now() - startedAt}ms | ` +
        `resources=${summary.resourcesConsidered} ` +
        `reminders=${summary.remindersCreated} sent=${summary.emailsSent} ` +
        `dupesBlocked=${summary.duplicatesPrevented} errors=${summary.errors.length}`,
    );
  } catch (error) {
     
    console.error('[jobs] reminder sweep failed:', error);
  } finally {
    sweepRunning = false;
  }
}

export function startJobs(): void {
  if (!cron.validate(env.REMINDER_CRON)) {
     
    console.error(`[jobs] invalid REMINDER_CRON "${env.REMINDER_CRON}" - jobs not started`);
    return;
  }

  reminderTask = cron.schedule(env.REMINDER_CRON, () => void guardedSweep('cron'), {
    timezone: env.isProd ? 'UTC' : undefined,
  });

   
  console.log(`[jobs] deadline reminder sweep scheduled (cron: "${env.REMINDER_CRON}")`);

  // Boot sweep: restart-safety. Anything that fell in the window while the
  // process was down is picked up here.
  setTimeout(() => void guardedSweep('boot'), 3_000);

  // Daily housekeeping.
  cron.schedule('17 4 * * *', () => {
    void (async () => {
      try {
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const removed = await pruneStaleReminders(cutoff);
         
        console.log(`[jobs] pruned ${removed} stale reminder rows`);
      } catch (error) {
         
        console.error('[jobs] prune failed:', error);
      }
    })();
  });
}

export function stopJobs(): void {
  reminderTask?.stop();
  reminderTask = null;
}
