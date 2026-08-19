'use strict';

const createApp = require('./app');

const PORT = process.env.PORT || 3000;
const app = createApp();

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`devops-task-api escuchando en el puerto ${PORT}`);
});

// Apagado ordenado: Kubernetes envia SIGTERM antes de terminar el pod.
const shutdown = (signal) => {
  // eslint-disable-next-line no-console
  console.log(`Senal ${signal} recibida, cerrando servidor...`);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
