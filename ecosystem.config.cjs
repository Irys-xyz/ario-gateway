const { config } = require('dotenv');
config();

module.exports =
  // ecosystem.js
  {
    apps: [
      {
        name: 'Indexer',
        script: 'dist/app.js', // name of the startup file
        exec_mode: 'fork', // to turn on cluster mode; defaults to 'fork' mode
        env: {
          PORT: '10001', // the port on which the app should listen
        },
      },
      {
        name: 'HttpServer',
        script: 'dist/HttpServer.js',
        instances: 2,
        exec_mode: 'cluster',
        env: {
          PORT: '10000', // the port on which the app should listen
        },
      },
    ],
  };
