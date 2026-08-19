'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const { store } = require('../src/services/taskStore');

const app = createApp();

describe('API de tareas (pruebas de integracion HTTP)', () => {
  beforeEach(() => {
    store.reset();
  });

  test('GET /api/tasks devuelve una lista vacia al inicio', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('POST /api/tasks crea una tarea y devuelve 201', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Desplegar en Kubernetes', description: 'Via Argo CD' });

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toMatchObject({
      id: 1,
      title: 'Desplegar en Kubernetes',
      description: 'Via Argo CD',
      status: 'pending',
    });
  });

  test('POST /api/tasks sin titulo devuelve 400 con el mensaje de validacion', async () => {
    const res = await request(app).post('/api/tasks').send({ description: 'sin titulo' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/obligatorio/);
  });

  test('GET /api/tasks/:id devuelve la tarea creada', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'Tarea X' });
    const res = await request(app).get(`/api/tasks/${created.body.data.id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.title).toBe('Tarea X');
  });

  test('GET /api/tasks/:id devuelve 404 si no existe', async () => {
    const res = await request(app).get('/api/tasks/404');
    expect(res.statusCode).toBe(404);
  });

  test('PATCH /api/tasks/:id/complete marca la tarea como done', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'Tarea Y' });
    const res = await request(app).patch(`/api/tasks/${created.body.data.id}/complete`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe('done');
    expect(res.body.data.completedAt).toBeDefined();
  });

  test('PATCH sobre una tarea inexistente devuelve 404', async () => {
    const res = await request(app).patch('/api/tasks/77/complete');
    expect(res.statusCode).toBe(404);
  });

  test('DELETE /api/tasks/:id elimina la tarea y devuelve 204', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'Tarea Z' });
    const del = await request(app).delete(`/api/tasks/${created.body.data.id}`);

    expect(del.statusCode).toBe(204);
    expect((await request(app).get('/api/tasks')).body.data).toHaveLength(0);
  });

  test('DELETE sobre una tarea inexistente devuelve 404', async () => {
    const res = await request(app).delete('/api/tasks/55');
    expect(res.statusCode).toBe(404);
  });

  test('GET /api/tasks?status=done filtra por estado', async () => {
    const a = await request(app).post('/api/tasks').send({ title: 'A' });
    await request(app).post('/api/tasks').send({ title: 'B' });
    await request(app).patch(`/api/tasks/${a.body.data.id}/complete`);

    const res = await request(app).get('/api/tasks?status=done');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('A');
  });

  test('GET /api/stats devuelve las metricas de avance', async () => {
    const a = await request(app).post('/api/tasks').send({ title: 'A' });
    await request(app).post('/api/tasks').send({ title: 'B' });
    await request(app).patch(`/api/tasks/${a.body.data.id}/complete`);

    const res = await request(app).get('/api/stats');
    expect(res.body.data).toEqual({ total: 2, done: 1, pending: 1, completionRate: 50 });
  });
});
