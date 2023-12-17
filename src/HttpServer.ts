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
apolloServerInstanceGql.start().then(() => {
  apolloServerInstanceGql.applyMiddleware({
    app,
    path: '/graphql',
  });
  app.listen(config.PORT, () => {
    log.info(`Listening on port ${config.PORT}`);
  });
});
