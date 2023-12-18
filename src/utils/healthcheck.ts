import checkDiskSpace from 'check-disk-space';

import { FS_FREE_SPACE_MIN } from '../config';
import logger from '../log';
import { checkResourceUtilisation } from './resourceUtil';
import sendWebhookMessage from './webhook';

export async function runHealthCheck(): Promise<void> {
  logger.info('Running health check');

  //   const lastNotified = +(await redisClient.get(REDIS_LAST_NOTIFIED_KEY));
  //   if (!isNaN(lastNotified) && Date.now() - lastNotified < 1.8e6) return;

  await checkFsFreeSpace();

  await checkResourceUtilisation();
  //   const lastSeeded = +(await redisClient.get(REDIS_LAST_SEEDED_KEY));
  //   if (isNaN(lastSeeded)) return;
  //   const now = Date.now();

  //   if (
  //     lastSeeded &&
  //     now - lastSeeded > 1.44e7 &&
  //     (await bundleQueue.getDelayedCount()) !== 0
  //   ) {
  //     sendWebhookMessage({
  //       name: 'No Seeding',
  //       value: 'Nothing has seeded for last 4 hours',
  //       ping: true,
  //       critical: true,
  //     });
  //   }

  //   const balance = new BigNumber(
  //     await arweave.wallets.getBalance(currencies.arweave.account.address),
  //   );
  //   const arReserveBytes = AR_RESERVE_BYTES;
  //   const required = new BigNumber(
  //     await redisClient.get(REDIS_PRICE_KEY),
  //   ).multipliedBy(arReserveBytes);
  //   logger.verbose(`[runHealthCheck:balance] Current Balance: ${balance}`);
  //   const percentOfRequired = balance.dividedBy(required);
  //   if (balance.isLessThanOrEqualTo(required))
  //     sendWebhookMessage({
  //       name: 'Running Low on AR',
  //       value: `Account: ${currencies.arweave.account.address}\n Current: ${balance} - cost for ${arReserveBytes} Bytes - ${required}`,
  //       ping: true,
  //       critical: percentOfRequired.isLessThanOrEqualTo(0.7),
  //     });

  //   const completedJobs = await bundleQueue.getJobs(['completed'], 0, 1000, true);
  //   const averageAttempts =
  //     completedJobs.reduce((total, next) => total + next.attemptsMade, 0) /
  //     completedJobs.length;

  //   if (averageAttempts > 10)
  //     sendWebhookMessage({
  //       name: 'Average Bundlr Queue Attempts High',
  //       value: `Current Average Attempts : ${averageAttempts}`,
  //       ping: true,
  //       critical: false,
  //     });

  //   const executorQueueWaitingCount = await bundleExecutorQueue.getWaitingCount();
  //   if (executorQueueWaitingCount >= 50) {
  //     sendWebhookMessage({
  //       name: 'Bundle Executor queue waiting count high',
  //       value: `Current executor jobs waiting: ${executorQueueWaitingCount}`,
  //       ping: true,
  //       critical: executorQueueWaitingCount >= 100,
  //     });
  //   }

  //   checkOtherQueue();

  //   await redisClient.set(REDIS_LAST_NOTIFIED_KEY, Date.now().toString());
  return;
}

// export async function devnetHealthCheck(): Promise<void> {
//   logger.info('[runHealthCheck] Running health check');

//   const lastNotified = +(await redisClient.get(REDIS_LAST_NOTIFIED_KEY));
//   if (!isNaN(lastNotified) && Date.now() - lastNotified < 1.8e6) return;

//   await checkFsFreeSpace();
//   await checkS3Queue();

//   await redisClient.set(REDIS_LAST_NOTIFIED_KEY, Date.now().toString());
//   return;
// }

// export async function checkS3Queue(): Promise<void> {
//   const s3QueueWaitingCount = await s3Queue.getWaitingCount();
//   logger.verbose(
//     `[checkS3Queue] Queue has ${s3QueueWaitingCount} waiting jobs.`,
//   );
//   if (s3QueueWaitingCount > 1000)
//     sendWebhookMessage({
//       name: 'S3 queue waiting count high',
//       value: `Current S3 jobs waiting ${s3QueueWaitingCount}`,
//       ping: true,
//       critical: s3QueueWaitingCount >= 2000,
//     });
// }

// export async function checkOtherQueue(): Promise<void> {
//   const otherQueueWaitingCount = await otherQueue.getWaitingCount();
//   if (otherQueueWaitingCount > 10_000)
//     sendWebhookMessage({
//       name: 'Other queue waiting count high',
//       value: `Current other queue jobs waiting ${otherQueueWaitingCount}`,
//       ping: true,
//       critical: otherQueueWaitingCount >= 50_000,
//     });
// }

export async function checkFsFreeSpace(): Promise<void> {
  const free = await checkDiskSpace('/')
    .then((r) => r.free)
    .catch((e) => logger.error(`Error checking free space:\n ${e}`));
  const threshold = FS_FREE_SPACE_MIN;
  if (typeof free === 'number' && free < threshold) {
    sendWebhookMessage({
      name: 'Running low on free space',
      value: `Free space (${free}) < threshold (${threshold})`,
      ping: true,
      critical: true,
    });
  }
}
