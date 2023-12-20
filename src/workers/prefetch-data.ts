import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import { isMainThread, parentPort } from 'worker_threads';

import { GatewayDataSource } from '../data/gateway-data-source.js';
import { currentUnixTimestamp } from '../lib/time.js';
import logger from '../log.js';
import { FsDataStore } from '../store/fs-data-store.js';
import { WorkerMessage, wrapWorkerFn } from './worker-thead.js';

export type PrefetchJobBody = {
  id: string;
};

// seperate deps, as we can't load the DB.
const dataStore = new FsDataStore({ log: logger, baseDir: 'data/contiguous' });
const dataSource = new GatewayDataSource({
  log: logger,
  trustedGatewayUrl: 'https://arweave.net',
});

export async function prefetchTransaction(
  job: PrefetchJobBody,
): Promise<PrefetchJobReturnBody> {
  const txId = job.id;
  const log = logger.child({ worker: 'transaction-prefetch', txId: txId });
  const then = performance.now();
  log.verbose(`Prefetching ${txId}`);

  const data = await dataSource.getData(txId);
  const hasher = createHash('sha256');
  const cacheStream = await dataStore.createWriteStream();
  const dataStream = data.stream;
  data.stream.on('data', (chunk) => {
    hasher.update(chunk);
  });
  data.stream.pause();
  await pipeline(dataStream, cacheStream);
  const hash = hasher.digest('base64url');
  await dataStore.finalize(cacheStream, hash);
  log.verbose(
    `Prefetched ${txId} in ${((performance.now() - then) / 1000).toFixed(3)}s`,
  );
  return {
    id: txId,
    dataRoot: undefined,
    hash,
    dataSize: data.size,
    contentType: data.sourceContentType,
    cachedAt: currentUnixTimestamp(),
  };
}

export type PrefetchJobReturnBody = {
  id: string;
  dataRoot?: string;
  hash: string;
  dataSize: number;
  contentType?: string;
  cachedAt?: number;
};

if (!isMainThread) {
  parentPort?.on('message', (msg: WorkerMessage<PrefetchJobBody>) =>
    wrapWorkerFn(prefetchTransaction, msg),
  );
}

// export default prefetchTransaction;
