'use strict';

const { TaskStore, ValidationError } = require('../src/services/taskStore');

describe('TaskStore (pruebas unitarias)', () => {
  let store;

  beforeEach(() => {
    store = new TaskStore();
  });

  test('crea una tarea con estado pendiente e id incremental', () => {
    const first = store.create({ title: 'Configurar pipeline CI' });
    const second = store.create({ title: 'Escribir Jenkinsfile' });

    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
    expect(first.status).toBe('pending');
    expect(first.createdAt).toBeDefined();
  });

  test('rechaza una tarea sin titulo', () => {
    expect(() => store.create({})).toThrow(ValidationError);
    expect(() => store.create({ title: '   ' })).toThrow(/obligatorio/);
  });

  test('rechaza un titulo de mas de 120 caracteres', () => {
    expect(() => store.create({ title: 'a'.repeat(121) })).toThrow(/120 caracteres/);
  });

  test('filtra las tareas por estado', () => {
    store.create({ title: 'Tarea A' });
    const b = store.create({ title: 'Tarea B' });
    store.complete(b.id);

    expect(store.list()).toHaveLength(2);
    expect(store.list({ status: 'done' })).toHaveLength(1);
    expect(store.list({ status: 'pending' })[0].title).toBe('Tarea A');
  });

  test('completar una tarea inexistente devuelve null', () => {
    expect(store.complete(999)).toBeNull();
  });

  test('elimina una tarea existente y reporta false si no existe', () => {
    const task = store.create({ title: 'Temporal' });
    expect(store.remove(task.id)).toBe(true);
    expect(store.remove(task.id)).toBe(false);
  });

  test('calcula las metricas de avance', () => {
    expect(store.stats()).toEqual({ total: 0, done: 0, pending: 0, completionRate: 0 });

    const a = store.create({ title: 'Tarea A' });
    store.create({ title: 'Tarea B' });
    store.complete(a.id);

    expect(store.stats()).toEqual({ total: 2, done: 1, pending: 1, completionRate: 50 });
  });

  test('reset deja el almacen vacio', () => {
    store.create({ title: 'Tarea' });
    store.reset();
    expect(store.list()).toHaveLength(0);
  });
});
