'use strict';

const request = require('supertest');
const createApp = require('../src/app');

const app = createApp();

describe('Endpoints de salud', () => {
  test('GET /healthz responde 200 y estado ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  test('GET /readyz responde 200 y estado ready', async () => {
    const res = await request(app).get('/readyz');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  test('GET /version expone la version del package.json', async () => {
    const res = await request(app).get('/version');
    expect(res.statusCode).toBe(200);
    expect(res.body.version).toBe(require('../package.json').version);
  });

  test('una ruta inexistente responde 404', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Recurso no encontrado');
  });
});
