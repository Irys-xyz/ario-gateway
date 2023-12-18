import type { ServerResponse } from 'http';
import { type Server } from 'http';
import { Logger } from 'winston';

import logger from '../log.js';
import { sleep } from './utils.js';

export class GracefulShutdownController {
  private timeout = 30_000;
  private connections = new Map();
  private secureConnections = new Map();
  private server: Server;
  private connectionCounter = 0;
  private secureConnectionCounter = 0;
  private shutdownPromise?: void | PromiseLike<void>;
  private preShutdown?: () => Promise<void>;
  protected log: Logger;

  constructor(opts: { server: Server; preShutdown?: () => Promise<void> }) {
    this.server = opts.server;
    this.server.on('connection', this.connectionEventHandler.bind(this));
    this.server.on('request', this.requestEventHandler.bind(this));
    this.server.on('secureConnection', this.secureConnectionHandler.bind(this));
    this.log = logger.child({ class: this.constructor.name });
  }

  get isShuttingDown(): boolean {
    return this.shutdownPromise !== undefined;
  }

  requestEventHandler(req: any, res: ServerResponse): void {
    req.socket._isIdle = false;
    if (this.isShuttingDown) {
      // this.lastConnection = performance.now();
      this.log.warn('Received request while shutting down');
    }

    if (this.isShuttingDown && !res.headersSent) {
      res.setHeader('connection', 'close');
    }

    res.on('finish', function (this: ServerResponse) {
      req.socket._isIdle = true;
      this.destroy(req.socket);
    });
  }

  connectionEventHandler(socket: any): void {
    if (this.isShuttingDown) {
      // this.log.warn(`REJECTED INCOMING CONNECTION`);
      // socket.destroy();
      this.log.warn('Received request while shutting down');
      // this.lastConnection = performance.now();
    }
    const id = this.connectionCounter++;
    socket._isIdle = true;
    socket._connectionId = id;
    this.connections.set(id, socket);

    socket.once('close', () => {
      this.connections.delete(socket._connectionId);
    });
  }

  // destroy(socket: Socket & { _connectionId: string; _isIdle: boolean; server: any }, force = false): void {
  //   if ((socket._isIdle && this.isShuttingDown) || force) {
  //     this.log.info("DESTROY");
  //     socket.destroy();
  //     if (socket.server instanceof Server) {
  //       this.connections.delete(socket._connectionId);
  //     } else {
  //       this.secureConnections.delete(socket._connectionId);
  //     }
  //   }
  // }

  secureConnectionHandler(socket: any): void {
    // if (this.isShuttingDown) {
    //   this.log.warn(`REJECTED INCOMING CONNECTION`);
    //   socket.destroy();
    // } else {
    const id = this.secureConnectionCounter++;
    socket._isIdle = true;
    socket._connectionId = id;
    this.secureConnections.set(id, socket);

    socket.once('close', () => {
      this.secureConnections.delete(socket._connectionId);
    });
    // }
  }

  // returns true if should force shut down. returns false for shut down without force
  async waitForReadyToShutDown(totalNumInterval: number): Promise<void> {
    while (totalNumInterval-- > 0) {
      this.log.debug(`waitForReadyToShutDown... ${totalNumInterval}`);

      if (totalNumInterval === 0) {
        // timeout reached
        this.log.warn(
          `Could not close connections in time (${this.timeout}ms), will forcefully shut down`,
        );
        return;
      }

      // const symb = Object.getOwnPropertySymbols(this.server).find((v) => v.toString() === "Symbol(http.server.connections)");
      // const connectionsList = this.server[symb];

      // const activeConnections = connectionsList.active();

      // test all connections closed already?
      const allConnectionsClosed =
        this.connections.size === 0 && this.secureConnections.size === 0;

      if (allConnectionsClosed) {
        this.log.debug('All connections closed. Continue to shutting down');
        // use this if issues persist.

        // if (cluster.isWorker) {
        //   const worker = cluster.worker;
        //   // console.log(worker);
        //   console.log("DISCONNECT");
        //   worker.disconnect();
        // }

        // const timeSinceLastConn = performance.now() - this.lastConnection;
        // // console.log("timeSinceLastConn", timeSinceLastConn);

        // while (performance.now() - this.lastConnection < 250) {
        //   await sleep(50);
        //   this.log.info(`BusyWait for no connections...`);
        // }
        // this.log.info("busywait done");

        return;
      }

      this.log.debug('Schedule the next waitForReadyToShutdown');
      await sleep(250);
    }
  }

  async destroyAllConnections(force = false): Promise<void> {
    // destroy empty and idle connections / all connections (if force = true)
    this.log.debug(
      'Destroy Connections : ' + (force ? 'forced close' : 'close'),
    );

    const httpServerConnections = await new Promise((res, rej) =>
      this.server.getConnections((e, c) => {
        if (e != undefined) rej(e);
        if (c != undefined) res(c);
      }),
    );

    this.log.debug(
      `server has ${this.server.connections} (${httpServerConnections}) connections`,
    );

    for (const socket of this.connections.values()) {
      const serverResponse = socket._httpMessage;
      // send connection close header to open connections
      if (serverResponse && !force) {
        if (!serverResponse.headersSent) {
          serverResponse.setHeader('connection', 'close');
        }
      }
    }

    this.log.debug('Connection Counter    : ' + this.connectionCounter);

    for (const socket of this.secureConnections.values()) {
      const serverResponse = socket._httpMessage;
      // send connection close header to open connections
      if (serverResponse && !force) {
        if (!serverResponse.headersSent) {
          serverResponse.setHeader('connection', 'close');
        }
      }
    }

    this.log.debug(
      'Secure Connection Counter    : ' + this.secureConnectionCounter,
    );
    // const symb = Object.getOwnPropertySymbols(this.server).find((v) => v.toString() === "Symbol(http.server.connections)");
    // const connectionsList = this.server[symb];

    // const idleConnections = connectionsList.idle();

    // for (const connection of idleConnections) {
    //   connection.socket.destroy();
    // }
  }

  private async runShutdown(signal: string): Promise<void> {
    this.log.info(`shutting down with signal ${signal}`);
    if (this.preShutdown instanceof Function) await this.preShutdown();

    // if (cluster.isWorker) {
    //   // this *should* cause connection distribution to fail sending reqs to this worker
    //   // see https://github.com/nodejs/node/blob/33710e7e7d39d19449a75911537d630349110a0c/lib/internal/cluster/child.js#L236
    //   this.server.maxConnections = null;
    // }

    await this.destroyAllConnections();
    await this.waitForReadyToShutDown(Math.round(this.timeout / 250));
    this.log.verbose(`Closing server`);
    await new Promise<void>((res, rej) =>
      this.server.close((err) => (err ? rej(err) : res())),
    ).catch((e) =>
      this.log.error(`Error closing the server: ${e.toString()} ${e.stack}`),
    );
  }

  public async shutdown(signal = 'manual'): Promise<void> {
    if (!this.isShuttingDown) this.shutdownPromise = this.runShutdown(signal);
    return this.shutdownPromise;
  }
}
