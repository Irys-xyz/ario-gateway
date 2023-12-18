import { contiguousDataCacheTmpCleanupWorker } from '../src/system';

const batch = await contiguousDataCacheTmpCleanupWorker.getBatch('data');
