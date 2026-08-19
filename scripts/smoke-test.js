'use strict';

/**
 * Prueba de humo: levanta la aplicacion en un puerto efimero, consulta los
 * endpoints criticos y termina con codigo 0 si todo responde correctamente.
 *
 * Se usa en los pipelines como verificacion posterior al despliegue y no
 * requiere procesos en segundo plano, lo que la hace segura de ejecutar
 * dentro de un agente de CI.
 */

const createApp = require('../src/app');

const CHECKS = [
  { path: '/healthz', expect: (body) => body.status === 'ok' },
  { path: '/readyz', expect: (body) => body.status === 'ready' },
  { path: '/version', expect: (body) => Boolean(body.version) },
  { path: '/api/stats', expect: (body) => typeof body.data.total === 'number' },
];

async function main() {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  let failures = 0;

  for (const check of CHECKS) {
    try {
      const res = await fetch(base + check.path);
      const body = await res.json();
      const ok = res.ok && check.expect(body);
      console.log(`${ok ? 'OK  ' : 'FALLO'}  ${check.path}  ->  ${JSON.stringify(body)}`);
      if (!ok) {
        failures += 1;
      }
    } catch (err) {
      console.log(`FALLO  ${check.path}  ->  ${err.message}`);
      failures += 1;
    }
  }

  server.close();

  if (failures > 0) {
    console.error(`\nPrueba de humo fallida: ${failures} verificacion(es) con error.`);
    process.exit(1);
  }
  console.log('\nPrueba de humo superada: la aplicacion responde correctamente.');
}

main();
