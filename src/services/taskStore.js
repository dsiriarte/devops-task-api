'use strict';

/**
 * Almacen de tareas en memoria.
 *
 * Se mantiene deliberadamente simple (sin base de datos) para que el pipeline
 * de CI pueda ejecutarse sin dependencias externas ni servicios acompanantes.
 * La logica de negocio vive aqui para poder probarla de forma unitaria,
 * separada de la capa HTTP.
 */
class TaskStore {
  constructor() {
    this.tasks = new Map();
    this.nextId = 1;
  }

  /** Vacia el almacen. Usado por las pruebas para aislar cada caso. */
  reset() {
    this.tasks.clear();
    this.nextId = 1;
  }

  list({ status } = {}) {
    const all = Array.from(this.tasks.values());
    if (!status) {
      return all;
    }
    return all.filter((task) => task.status === status);
  }

  get(id) {
    return this.tasks.get(Number(id)) || null;
  }

  create({ title, description = '' }) {
    if (typeof title !== 'string' || title.trim() === '') {
      throw new ValidationError('El campo "title" es obligatorio');
    }
    if (title.length > 120) {
      throw new ValidationError('El campo "title" no puede superar 120 caracteres');
    }

    const task = {
      id: this.nextId++,
      title: title.trim(),
      description: String(description).trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  complete(id) {
    const task = this.get(id);
    if (!task) {
      return null;
    }
    task.status = 'done';
    task.completedAt = new Date().toISOString();
    return task;
  }

  remove(id) {
    return this.tasks.delete(Number(id));
  }

  /** Metricas simples que expone el endpoint /api/stats. */
  stats() {
    const all = this.list();
    const done = all.filter((task) => task.status === 'done').length;
    return {
      total: all.length,
      done,
      pending: all.length - done,
      completionRate: all.length === 0 ? 0 : Math.round((done / all.length) * 100),
    };
  }
}

/** Error de validacion de entrada; la capa HTTP lo traduce a un 400. */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

module.exports = { TaskStore, ValidationError, store: new TaskStore() };
