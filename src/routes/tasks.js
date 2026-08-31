'use strict';

const express = require('express');
const { store, ValidationError } = require('../services/taskStore');
const { tasksCreatedTotal, tasksCompletedTotal, tasksPending } = require('../metrics');

const router = express.Router();

router.get('/tasks', (req, res) => {
  res.json({ data: store.list({ status: req.query.status }) });
});

router.get('/tasks/:id', (req, res) => {
  const task = store.get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Tarea no encontrada' });
  }
  return res.json({ data: task });
});

router.post('/tasks', (req, res, next) => {
  try {
    const task = store.create(req.body || {});
    tasksCreatedTotal.inc();
    tasksPending.set(store.stats().pending);
    res.status(201).json({ data: task });
  } catch (err) {
    next(err);
  }
});

router.patch('/tasks/:id/complete', (req, res) => {
  const task = store.complete(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Tarea no encontrada' });
  }
  tasksCompletedTotal.inc();
  tasksPending.set(store.stats().pending);
  return res.json({ data: task });
});

router.delete('/tasks/:id', (req, res) => {
  const removed = store.remove(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'Tarea no encontrada' });
  }
  tasksPending.set(store.stats().pending);
  return res.status(204).send();
});

router.get('/stats', (req, res) => {
  res.json({ data: store.stats() });
});

module.exports = { router, ValidationError };
