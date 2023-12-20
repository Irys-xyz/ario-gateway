import { MessagePort, Worker, parentPort } from 'node:worker_threads';
import * as winston from 'winston';

export enum WorkerEventName {
  LOG_MESSAGE,
  RETURN_DATA,
  ERROR,
}

export type WorkerMessage<JobData> = {
  eventName: WorkerEventName;
  id: number;
  data: JobData;
};

type WorkerJob<JobData> = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  data: JobData;
  id: number;
};

export class WorkerThreadQueue<JobData, ReturnData> {
  protected log: winston.Logger;

  protected workers: { takeWork: () => void }[] = [];
  protected workQueue: WorkerJob<JobData>[] = [];

  constructor({
    log,
    workerCount = 1,
    workerPath,
    workerData = undefined,
    tasksPerWorker = 5,
  }: {
    log: winston.Logger;
    workerCount?: number;
    workerData?: any;
    workerPath: string;
    tasksPerWorker?: number;
  }) {
    this.log = log;
    const self = this;

    function spawn() {
      const workerUrl = new URL(workerPath, import.meta.url);
      const worker = new Worker(workerUrl, {
        workerData: workerData,
      });
      // let jobId = 0;

      let jobs: WorkerJob<JobData>[] = []; // Current item from the queue
      let error: any = null; // Error that caused the worker to crash
      let job: WorkerJob<JobData> | null = null;

      function takeWork() {
        // send jobs to the worker
        while (jobs.length !== tasksPerWorker && self.workQueue.length) {
          const job = self.workQueue.shift()!;
          const pos = jobs.push(job) - 1;
          job.id = pos;
          const msg: WorkerMessage<JobData> = {
            id: pos,
            eventName: WorkerEventName.LOG_MESSAGE,
            data: job.data,
          };
          worker.postMessage(msg);
        }
      }

      worker
        .on('online', () => {
          self.workers.push({ takeWork });
          takeWork();
        })
        .on('message', (message: WorkerMessage<any>) => {
          switch (message?.eventName) {
            case WorkerEventName.LOG_MESSAGE: {
              const logData = message.data;
              log.info(logData);
              break;
            }
            case WorkerEventName.RETURN_DATA: {
              const data = message.data as ReturnData;
              job = jobs.splice(message.id, 1)?.[0];
              job?.resolve(data);
              job = null;
              break;
            }
            case WorkerEventName.ERROR: {
              job = jobs.splice(message.id, 1)?.[0];
              job?.reject(message.data);
              job = null;
              break;
            }
            default:
              if (message?.data?.id) {
                job = jobs.splice(message.id, 1)?.[0];
                job?.reject(message.data);
                job = null;
                break;
              }
              // very problematic, so we terminate
              jobs = [];
              worker.terminate();
              break;
          }
          takeWork(); // Check if there's more work to do
        })
        .on('error', (err) => {
          self.log.error('Worker error', err);
          error = err;
        })
        .on('exit', (code) => {
          self.workers = self.workers.filter(
            (w: any) => w.takeWork !== takeWork,
          );
          if (job) {
            job.reject(error || new Error('worker died'));
          }
          if (code !== 0) {
            self.log.error('Worker stopped with exit code ' + code, {
              exitCode: code,
            });
            spawn(); // Worker died, so spawn a new one
          }
        });
    }

    for (let i = 0; i < workerCount; i++) {
      spawn();
    }
  }

  get pendingJobs() {
    return this.workQueue.length;
  }

  drainQueue() {
    for (const worker of this.workers) {
      worker.takeWork();
    }
  }

  queueWork(data: JobData): Promise<ReturnData> {
    return new Promise((resolve, reject) => {
      this.workQueue.push({
        resolve,
        reject,
        data,
        id: 0,
      });
      this.drainQueue();
    });
  }
}

export type ParentPort = MessagePort | null;

export function returnData<ReturnData = any>(
  parentPort: ParentPort,
  id: number,
  data: ReturnData,
): void {
  const returnData: WorkerMessage<ReturnData> = {
    eventName: WorkerEventName.RETURN_DATA,
    id,
    data,
  };
  parentPort?.postMessage(returnData);
}

export function returnError<ErrorData = any>(
  parentPort: ParentPort,
  id: number,
  data: ErrorData,
): void {
  const errorData: WorkerMessage<ErrorData> = {
    eventName: WorkerEventName.ERROR,
    id,
    data,
  };
  parentPort?.postMessage(errorData);
}

export async function wrapWorkerFn<JobData = any, ReturnData = any>(
  wrapped: (job: JobData) => ReturnData | Promise<ReturnData>,
  msg: WorkerMessage<JobData>,
): Promise<void> {
  try {
    returnData(parentPort, msg.id, await wrapped(msg.data));
  } catch (e: any) {
    returnError(parentPort, msg.id, e?.stack ?? e);
  }
}

// if (!isMainThread) {
//   const filter = createFilter(JSON.parse(workerData.dataItemIndexFilterString));
//   parentPort?.on('message', async (message: any) => {
//     const { rootTxId, parentId, parentIndex, bundlePath } = message;
//     let stream: fs.ReadStream | undefined = undefined;
//     try {
//       stream = fs.createReadStream(bundlePath);
//       const iterable = await processStream(stream);
//       const bundleLength = iterable.length;
//       let matchedItemCount = 0;

//       const fnLog = log.child({ rootTxId, parentId, bundleLength });
//       fnLog.info('Unbundling ANS-104 bundle stream data items...');

//       const processedDataItemIds = new Set<string>();
//       for await (const [index, dataItem] of iterable.entries()) {
//         const diLog = fnLog.child({
//           dataItemId: dataItem.id,
//           dataItemIndex: index,
//         });
//         diLog.info('Processing data item...');

//         if (!dataItem.id) {
//           diLog.warn('Skipping data item with missing ID.');
//           continue;
//         }

//         if (processedDataItemIds.has(dataItem.id)) {
//           diLog.warn('Skipping duplicate data item ID.');
//           continue;
//         }

//         if (!dataItem.dataOffset) {
//           diLog.warn('Skipping data item with missing data offset.');
//         }

//         const normalizedDataItem = normalizeAns104DataItem({
//           rootTxId: rootTxId as string,
//           parentId: parentId as string,
//           parentIndex: parentIndex as number,
//           index: index as number,
//           filter: workerData.dataItemIndexFilterString,
//           ans104DataItem: dataItem as Record<string, any>,
//         });

//         if (await filter.match(normalizedDataItem)) {
//           matchedItemCount++;
//           parentPort?.postMessage({
//             eventName: DATA_ITEM_MATCHED,
//             dataItem: normalizedDataItem,
//           });
//         }
//       }
//       parentPort?.postMessage({
//         eventName: UNBUNDLE_COMPLETE,
//         parentId: parentId as string,
//         itemCount: bundleLength,
//         matchedItemCount,
//       });
//     } catch (error: any) {
//       log.error('Error unbundling ANS-104 bundle stream', {
//         message: error?.message,
//         stack: error?.stack,
//       });
//       parentPort?.postMessage({ eventName: 'unbundle-error' });
//     } finally {
//       try {
//         await fsPromises.unlink(bundlePath);
//       } catch (error: any) {
//         log.error('Error deleting ANS-104 bundle temporary file', {
//           message: error?.message,
//           stack: error?.stack,
//         });
//       }
//       if (stream !== undefined) {
//         try {
//           stream.destroy();
//         } catch (error: any) {
//           log.error('Error destroying ANS-104 bundle temporary file stream', {
//             message: error?.message,
//             stack: error?.stack,
//           });
//         }
//       }
//     }
//   });
// }
