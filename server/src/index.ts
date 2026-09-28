import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/prisma.js';
import { startJobs, stopJobs } from './jobs/reminder.job.js';

/**
 * Server entry point. Kept deliberately thin: everything testable lives in
 * `createApp()`, which the test suite imports directly without binding a port.
 */
async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
     
    console.log(
      [
        '',
        '  ClassHub API',
        `  ├─ environment : ${env.NODE_ENV}`,
        `  ├─ listening   : http://localhost:${env.PORT}`,
        `  ├─ health      : http://localhost:${env.PORT}/api/health`,
        `  ├─ email mode  : ${env.emailEnabled ? 'SMTP' : 'CAPTURE (no SMTP configured)'}`,
        `  ├─ uploads     : ${env.paths.uploads}`,
        `  └─ reminders   : cron "${env.REMINDER_CRON}" (${env.REMINDER_LEAD_HOURS}h lead)`,
        '',
      ].join('\n'),
    );
  });

  // Scheduled jobs (deadline reminder sweep).
  startJobs();

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
     
    console.log(`\n[server] ${signal} received, shutting down gracefully...`);

    stopJobs();
    server.close(async () => {
      await disconnectDatabase();
       
      console.log('[server] shutdown complete');
      process.exit(0);
    });

    // Do not hang forever if a connection refuses to drain.
    setTimeout(() => {
       
      console.error('[server] forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
     
    console.error('[server] unhandled promise rejection:', reason);
  });
  process.on('uncaughtException', (error) => {
     
    console.error('[server] uncaught exception:', error);
    void shutdown('uncaughtException');
  });
}

main().catch((error) => {
   
  console.error('[server] failed to start:', error);
  process.exit(1);
});
