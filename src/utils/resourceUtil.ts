import { spawn } from 'child_process';
import { cpus, freemem, loadavg, totalmem } from 'os';

import { HIGH_LOAD_CRITICAL } from '../config.js';
import sendWebhookMessage from './webhook.js';

export async function checkResourceUtilisation(): Promise<void> {
  const loadAvg = loadavg();
  const oneMinLoad = loadAvg[0];
  const cpuCount = cpus().length;
  const loadAveragePer = Math.round((oneMinLoad / cpuCount) * 100);

  // text, if it's ping, if it's critical (page)
  let comb =
    loadAveragePer >= 200
      ? ['> 200', true, true]
      : loadAveragePer >= 75
      ? ['> 75', true, false]
      : loadAveragePer >= 50
      ? ['> 50', false, false]
      : undefined;
  if (comb)
    sendWebhookMessage({
      name: 'Load Average High',
      value: `Current 1m Load Avg ${comb[0]} - ${loadAveragePer}`,
      info: [
        { name: '5m load avg', value: loadAvg[1].toString() },
        { name: '15m load avg', value: loadAvg[2].toString() },
      ],
      ping: comb[1] as boolean,
      critical: HIGH_LOAD_CRITICAL ? (comb[2] as boolean) : false,
    });

  let availableMemory;
  if (process.platform === 'linux') {
    const prc = spawn('free', []);
    prc.stdout.setEncoding('utf8');
    availableMemory =
      +(await new Promise<string>((r) => {
        prc.stdout.on('data', (d) => {
          const lines = d.toString().split(/\n/g);
          const stats = lines[1].split(/\s+/);
          const avail = stats[6];
          r(avail as string);
        });
      })) * 1024;
    prc.kill();
  } else {
    availableMemory = freemem();
  }

  const usagePercentage = Math.round((1 - availableMemory / totalmem()) * 100);
  comb =
    usagePercentage >= 90
      ? ['> 90', true, true]
      : usagePercentage >= 75
      ? ['> 75', true, false]
      : usagePercentage >= 50
      ? ['> 50', false, false]
      : undefined;
  if (comb)
    sendWebhookMessage({
      name: 'Memory Usage High',
      value: `Memory usage ${comb[0]}% - ${usagePercentage}%`,
      ping: comb[1] as boolean,
      critical: comb[2] as boolean,
    });

  //   await checkRedisMemoryUtil();
}

// export async function checkRedisMemoryUtil(): Promise<void> {
//   try {
//     const redis = createClient({
//       url: redisUrl,
//     });
//     const info = await redisClient.info();
//     const splitInfo = info.split('\r\n');
//     const usedMem = +(
//       splitInfo.find((v) => v.split(':')[0] === 'used_memory').split(':')[1] ??
//       0
//     );

//     const maxMemRaw = splitInfo.find((v) => v.split(':')[0] === 'maxmemory');
//     if (!maxMemRaw) throw new Error('Unable to find maxmemory');
//     let maxMem = REDIS_MAX_MEMORY
//       ? +REDIS_MAX_MEMORY
//       : +maxMemRaw.split(':')[1];
//     // maxMem = 0 means redis will use all of the system memory, so we check that
//     if (maxMem === 0) {
//       const systemMem = splitInfo.find(
//         (v) => v.split(':')[0] === 'total_system_memory',
//       );
//       if (!systemMem) throw new Error('Unable to find total_system_memory');
//       maxMem = +(systemMem.split(':')[1] ?? 0);
//     }
//     const usedPercent = (usedMem / maxMem) * 100;

//     const comb =
//       usedPercent >= 90
//         ? ['> 90', true, true]
//         : usedPercent >= 75
//         ? ['> 75', true, false]
//         : usedPercent >= 50
//         ? ['> 50', false, false]
//         : undefined;

//     if (comb)
//       sendWebhookMessage({
//         name: 'Redis memory Usage High',
//         value: `Memory usage ${comb[0]}% - ${usedPercent}%`,
//         ping: comb[1] as boolean,
//         critical: comb[2] as boolean,
//       });
//   } catch (e: any) {
//     await sendWebhookMessage({
//       name: 'Unable to check Redis memory usage',
//       value: e?.stack ?? e?.message ?? e,
//       ping: true,
//       critical: true,
//     });
//   }
// }
