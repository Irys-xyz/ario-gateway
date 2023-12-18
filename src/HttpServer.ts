/* eslint-disable header/header */
import { default as cors } from 'cors';
import express from 'express';

import * as config from './config.js';
import log from './log.js';
import { arIoRouter } from './routes/ar-io.js';
import { arnsRouter } from './routes/arns.js';
import { dataRouter } from './routes/data/index.js';
import { apolloServer } from './routes/graphql/index.js';
import { openApiRouter } from './routes/openapi.js';
import * as system from './system.js';
import { GracefulShutdownController } from './utils/gracefulShutdown.js';

const logger = log.child({ name: 'HttpServer' });
let isShuttingDown = false;
let manualShutdown = () => {};

const gracefulShutdown = async (): Promise<void> => {
  logger.warn('Shutting down...');
  Promise.all([manualShutdown()])
    .then((_) => {
      process.exit(0);
    })
    .catch((_) => process.exit(1));
};

process.on('message', async (message) => {
  if (message === 'shutdown') {
    logger.verbose('received shutdown message');
    if (isShuttingDown) return;
    isShuttingDown = true;
    gracefulShutdown();
  }
});

process.on('SIGINT', () => {
  logger.verbose('received signal sigint');
  if (isShuttingDown) return;
  isShuttingDown = true;
  gracefulShutdown();
});

const app = express();

app.use(
  cors({
    exposedHeaders: ['X-ArNS-Resolved-Id', 'X-ArNS-TTL-Seconds'],
  }),
);

app.use(arnsRouter);
app.use(openApiRouter);
app.use(arIoRouter);
app.use(dataRouter);

// GraphQL
const apolloServerInstanceGql = apolloServer(system.db, {
  introspection: true,
  persistedQueries: false,
});
await apolloServerInstanceGql.start().then(() => {
  apolloServerInstanceGql.applyMiddleware({
    app,
    path: '/graphql',
  });
});

const server = app.listen(config.PORT);
logger.info(`Listening on port ${config.PORT}`);

server.keepAliveTimeout = 61 * 1000;
server.headersTimeout = 62 * 1000;

server.on('close', () => {
  logger.debug(`closing...`);
});

// // eslint-disable-next-line @typescript-eslint/naming-convention
// async function onHTTPShutdown(): Promise<void> {
//   // insert cleanup operation(s) here
//   const cleanup = async (): Promise<void> => {
//     await new Promise((r) => wss.close(r));
//   };
//   // await Promise.allSettled(wss.clients)
//   await Promise.race([sleep(5_000), cleanup]);
// }

const controller = new GracefulShutdownController({
  server,
  preShutdown: async (): Promise<void> => {
    server.closeIdleConnections(); // TODO: test me!!
  },
});
// overwrite manual shutdown noop method
manualShutdown = (): Promise<void> => controller.shutdown();

if (process.send) {
  process?.send?.('ready', undefined, undefined, (e) =>
    e ? logger.error(`Error sending ready message: ${e}`) : undefined,
  ); // send ready pm2 message
  logger.info(`Ready message sent`);
} else {
  logger.warn(`Ready message NOT sent`);
}
