/* eslint-disable header/header */
import { default as fastq } from 'fastq';
import type { queueAsPromised } from 'fastq';
import * as winston from 'winston';

import { ContiguousDataSource, MatchableItem } from '../types.js';

const DEFAULT_WORKER_COUNT = 4;

export class DataPrefetcher {
  // Dependencies
  private log: winston.Logger;
  private contiguousDataSource: ContiguousDataSource;
  //   private indexWriter: DataItemIndexWriter;

  // Data indexing queue
  private queue: queueAsPromised<MatchableItem, void>;

  constructor({
    log,
    // indexWriter,
    contiguousDataSource,
    workerCount = DEFAULT_WORKER_COUNT,
  }: {
    log: winston.Logger;
    // indexWriter: DataItemIndexWriter;
    contiguousDataSource: ContiguousDataSource;
    workerCount?: number;
  }) {
    this.log = log.child({ class: 'DataPrefetcher' });
    // this.indexWriter = indexWriter;
    this.contiguousDataSource = contiguousDataSource;

    this.queue = fastq.promise(this.prefetchData.bind(this), workerCount);
  }

  async queuePrefetchData(item: MatchableItem): Promise<void> {
    const log = this.log.child({
      method: 'queueDataItem',
      id: item.id,
    });
    log.debug('Queueing item for prefetching...');
    this.queue.push(item);
    log.debug('Data item queued for prefetching.');
  }

  async prefetchData(item: MatchableItem): Promise<void> {
    const log = this.log.child({
      method: 'indexDataItem',
      id: item.id,
    });

    try {
      log.debug('Prefetching data item...');
      const res = await this.contiguousDataSource.getData(item.id);
      const stream = res.stream;
      // you have to consume the stream so it actually caches the item fully.
      for await (const _ of stream) {
        true; // void it
      }
      log.debug('Data item prefetched.');
    } catch (error) {
      log.error('Failed to prefetch data item data:', error);
    }
  }
}
