'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const { store } = require('../src/services/taskStore');

const app = createApp();

describe('Endpoint de metricas para Prometheus', () => {
  beforeEach(() => {
    store.reset();
  });

  test('GET /metrics responde en el formato de exposicion de Prometheus', async () => {
    const res = await request(app).get('/metrics');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    // El formato de exposicion exige lineas HELP y TYPE por cada metrica.
    expect(res.text).toMatch(/# HELP/);
    expect(res.text).toMatch(/# TYPE/);
  });

  test('expone las metricas por defecto del proceso Node', async () => {
    const res = await request(app).get('/metrics');

    expect(res.text).toMatch(/process_cpu_seconds_total/);
    expect(res.text).toMatch(/process_resident_memory_bytes/);
    expect(res.text).toMatch(/nodejs_eventloop_lag_seconds/);
  });

  test('expone el histograma de duracion de peticiones HTTP', async () => {
    await request(app).get('/healthz');
    const res = await request(app).get('/metrics');

    expect(res.text).toMatch(/http_request_duration_seconds_bucket/);
    expect(res.text).toMatch(/http_requests_total/);
  });

  test('etiqueta las metricas con la aplicacion y el entorno', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/application="devops-task-api"/);
    expect(res.text).toMatch(/environment="/);
  });

  test('el contador de tareas creadas aumenta al crear una tarea', async () => {
    const antes = await request(app).get('/metrics');
    const valorAnterior = leerContador(antes.text, 'tasks_created_total');

    await request(app).post('/api/tasks').send({ title: 'Tarea medida' });

    const despues = await request(app).get('/metrics');
    expect(leerContador(despues.text, 'tasks_created_total')).toBe(valorAnterior + 1);
  });

  test('el medidor de tareas pendientes refleja el estado real', async () => {
    await request(app).post('/api/tasks').send({ title: 'Pendiente A' });
    const creada = await request(app).post('/api/tasks').send({ title: 'Pendiente B' });

    let res = await request(app).get('/metrics');
    expect(leerContador(res.text, 'tasks_pending')).toBe(2);

    await request(app).patch(`/api/tasks/${creada.body.data.id}/complete`);

    res = await request(app).get('/metrics');
    expect(leerContador(res.text, 'tasks_pending')).toBe(1);
  });

  test('agrupa las rutas con parametros en una sola serie temporal', async () => {
    const creada = await request(app).post('/api/tasks').send({ title: 'Tarea' });
    await request(app).get(`/api/tasks/${creada.body.data.id}`);

    const res = await request(app).get('/metrics');
    // La ruta debe aparecer parametrizada; si apareciera el id concreto la
    // cardinalidad de las metricas creceria sin control.
    expect(res.text).toMatch(/route="\/api\/tasks\/:id"/);
    expect(res.text).not.toMatch(new RegExp(`route="/api/tasks/${creada.body.data.id}"`));
  });
});

/** Lee el valor de una metrica simple (contador o medidor) del texto expuesto. */
function leerContador(texto, nombre) {
  const linea = texto
    .split('\n')
    .find((l) => l.startsWith(nombre) && !l.startsWith('#'));
  return linea ? Number(linea.split(' ').pop()) : 0;
}
