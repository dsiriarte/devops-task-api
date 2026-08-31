'use strict';

const path = require('node:path');
const express = require('express');
const healthRouter = require('./routes/health');
const { router: tasksRouter } = require('./routes/tasks');
const { registry, metricsMiddleware } = require('./metrics');

/**
 * Construye la aplicacion Express.
 *
 * Se exporta como fabrica (y no como servidor ya escuchando) para que las
 * pruebas puedan montarla con supertest sin abrir un puerto real.
 */
function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // La medicion se registra antes que las rutas para que abarque todas ellas.
  app.use(metricsMiddleware);

  // Endpoint que Prometheus consulta periodicamente para recolectar metricas.
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });

  app.use('/', healthRouter);
  app.use('/api', tasksRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Recurso no encontrado' });
  });

  // Manejador central de errores: traduce ValidationError a 400 y el resto a 500.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Error interno del servidor' : err.message,
    });
  });

  return app;
}

module.exports = createApp;
