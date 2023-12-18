import { contiguousDataCacheTmpCleanupWorker } from './system.js';

const batch = await contiguousDataCacheTmpCleanupWorker.getBatch('data', null);

console.log(batch);
