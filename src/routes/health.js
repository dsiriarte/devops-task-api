'use strict';

const express = require('express');
const { version } = require('../../package.json');

const router = express.Router();
const startedAt = Date.now();

/**
 * Sondas para Kubernetes.
 * /healthz  -> liveness:  el proceso responde.
 * /readyz   -> readiness: la aplicacion puede atender trafico.
 */
router.get('/healthz', (req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000) });
});

router.get('/readyz', (req, res) => {
  res.json({ status: 'ready' });
});

router.get('/version', (req, res) => {
  res.json({
    version,
    commit: process.env.GIT_COMMIT || 'local',
    environment: process.env.NODE_ENV || 'development',
  });
});

module.exports = router;
