'use strict';

const client = require('prom-client');

/**
 * Instrumentacion de metricas en formato Prometheus.
 *
 * Se exponen tres familias de metricas:
 *   1. Las metricas por defecto del proceso Node (CPU, memoria, event loop,
 *      handles abiertos), que aporta prom-client sin configuracion.
 *   2. Un histograma de duracion de las peticiones HTTP, que permite calcular
 *      latencia por percentiles (p50, p95, p99) y tasa de errores.
 *   3. Metricas de negocio de la aplicacion (tareas creadas, completadas y
 *      pendientes), que ilustran que el monitoreo no se limita a la
 *      infraestructura sino que tambien observa el dominio.
 */

const registry = new client.Registry();

// Etiqueta comun a todas las metricas: permite distinguir instancias y
// entornos cuando varios pods reportan al mismo Prometheus.
registry.setDefaultLabels({
  application: 'devops-task-api',
  environment: process.env.NODE_ENV || 'development',
});

client.collectDefaultMetrics({ register: registry });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duracion de las peticiones HTTP en segundos',
  labelNames: ['method', 'route', 'status_code'],
  // Cubos ajustados a una API rapida: la mayoria de respuestas caen por
  // debajo de 100 ms, por lo que los cubos se concentran en ese rango.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Numero total de peticiones HTTP atendidas',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

const tasksCreatedTotal = new client.Counter({
  name: 'tasks_created_total',
  help: 'Numero total de tareas creadas desde el arranque del proceso',
  registers: [registry],
});

const tasksCompletedTotal = new client.Counter({
  name: 'tasks_completed_total',
  help: 'Numero total de tareas marcadas como completadas',
  registers: [registry],
});

const tasksPending = new client.Gauge({
  name: 'tasks_pending',
  help: 'Numero de tareas pendientes en este momento',
  registers: [registry],
});

/**
 * Middleware que mide cada peticion HTTP.
 *
 * Usa req.route.path en lugar de req.path para no generar una serie temporal
 * distinta por cada identificador: /api/tasks/1 y /api/tasks/2 se agregan bajo
 * la etiqueta /api/tasks/:id. Sin esta precaucion la cardinalidad de las
 * metricas crece sin limite y termina degradando a Prometheus.
 */
function metricsMiddleware(req, res, next) {
  const fin = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const ruta = req.route ? req.baseUrl + req.route.path : 'desconocida';
    const etiquetas = {
      method: req.method,
      route: ruta,
      status_code: res.statusCode,
    };
    fin(etiquetas);
    httpRequestsTotal.inc(etiquetas);
  });

  next();
}

module.exports = {
  registry,
  metricsMiddleware,
  tasksCreatedTotal,
  tasksCompletedTotal,
  tasksPending,
};
