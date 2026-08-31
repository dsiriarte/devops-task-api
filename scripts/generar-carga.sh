#!/usr/bin/env bash
# Genera trafico sintetico contra la aplicacion desplegada para que los paneles
# de Grafana muestren datos representativos: peticiones exitosas, algunos 404 y
# creacion de tareas. Se ejecuta dentro del cluster como un pod efimero.
set -euo pipefail

DURACION="${1:-180}"
BASE="http://devops-task-api"
fin=$(( $(date +%s) + DURACION ))

while [ "$(date +%s)" -lt "$fin" ]; do
  curl -sf  "$BASE/healthz"                       > /dev/null || true
  curl -sf  "$BASE/api/stats"                     > /dev/null || true
  curl -sf  "$BASE/api/tasks"                     > /dev/null || true
  curl -sf -X POST "$BASE/api/tasks" \
       -H 'Content-Type: application/json' \
       -d "{\"title\":\"Tarea $(date +%s%N)\"}"   > /dev/null || true
  # Peticiones que fallan a proposito: alimentan el panel de codigos de respuesta.
  curl -s   "$BASE/api/tasks/999999"              > /dev/null || true
  curl -s   "$BASE/ruta-inexistente"              > /dev/null || true
  sleep 0.4
done
