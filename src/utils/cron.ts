import { CronJob } from 'cron';

import logger from '../log.js';

export function createCron(
  name: string,
  time: string,
  fn: () => Promise<void>,
): void {
  let jobLocked = false;
  try {
    new CronJob(
      time,
      async function () {
        if (!jobLocked) {
          jobLocked = true;
          await fn().catch((e) =>
            logger.error(`[CRON] Error occurred while doing ${name} - ${e}`),
          );
          jobLocked = false;
        }
      },
      null,
      true,
    );
  } catch (e: any) {
    logger.error(`[PROCESS] Error occurred while creating cron ${name} - ${e}`);
    process.exit(1);
  }
}
