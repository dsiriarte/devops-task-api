# DevOps Task API — Laboratorio técnico CI/CD

Aplicación web de ejemplo (API REST + interfaz) que sirve de eje al laboratorio
técnico de la **Unidad 2 — Flujos de entrega eficientes: CI/CD y automatización**
de la asignatura *Fundamentos DevOps* de la Universidad de La Sabana.

El repositorio contiene **dos pipelines**: uno de **integración continua** con
GitHub Actions, que se ejecuta automáticamente ante cada `push` y cada *pull
request*, y uno de **entrega continua** con Jenkins, que analiza el código con
SonarQube, escanea la imagen con Trivy y despliega la aplicación en un clúster de
Kubernetes, donde Prometheus y Grafana la observan.

La aplicación **está desplegada y monitoreada de verdad**: tres réplicas
corriendo, métricas recolectadas cada 15 segundos, un tablero con trece paneles y
seis reglas de alerta.

| | |
|---|---|
| **Autor** | David Santiago Iriarte Zamora |
| **Asignatura** | Fundamentos DevOps — Unidad 2, Actividad 3 |
| **Stack** | Node.js 24 · Express · Jest · ESLint · Docker · Kubernetes |
| **Seguridad** | SonarQube · Trivy · npm audit |
| **Monitoreo** | Prometheus · Grafana · Alertmanager |
| **CI** | GitHub Actions (`.github/workflows/ci.yml`) |
| **CD** | Jenkins (`Jenkinsfile`) |

---

## 1. La aplicación

`devops-task-api` es un gestor de tareas: expone una API REST y una interfaz web
estática que la consume. Se eligió deliberadamente un dominio sencillo y un
almacenamiento en memoria —sin base de datos— para que **el pipeline sea el
objeto de estudio** y pueda ejecutarse sin servicios acompañantes ni credenciales
externas, manteniendo los tiempos de *feedback* por debajo del minuto.

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Interfaz web de la aplicación |
| `GET` | `/healthz` | *Liveness probe*: el proceso responde |
| `GET` | `/readyz` | *Readiness probe*: la aplicación puede atender tráfico |
| `GET` | `/version` | Versión, *commit* y entorno desplegado |
| `GET` | `/api/tasks` | Lista de tareas (filtro opcional `?status=`) |
| `GET` | `/api/tasks/:id` | Consulta una tarea |
| `POST` | `/api/tasks` | Crea una tarea |
| `PATCH` | `/api/tasks/:id/complete` | Marca una tarea como completada |
| `DELETE` | `/api/tasks/:id` | Elimina una tarea |
| `GET` | `/api/stats` | Métricas de avance |

### Ejecución local

```bash
npm install      # instala dependencias
npm start        # levanta el servidor en http://localhost:3000
npm test         # ejecuta las pruebas con reporte de cobertura
npm run lint     # análisis estático con ESLint
```

Con Docker:

```bash
docker build -t devops-task-api:local .
docker run -p 3000:3000 devops-task-api:local
```

---

## 2. Estructura del repositorio

```
.
├── .github/workflows/ci.yml     # Pipeline de INTEGRACIÓN CONTINUA (GitHub Actions)
├── Jenkinsfile                  # Pipeline de ENTREGA CONTINUA (Jenkins)
├── jenkins/Jenkinsfile.demo     # Variante ejecutable en local, para evidencias
├── Dockerfile                   # Build multietapa de la imagen
├── k8s/                         # Manifiestos de despliegue
│   ├── deployment.yaml
│   ├── service.yaml
│   └── hpa.yaml
├── src/                         # Código de la aplicación
│   ├── app.js                   # Fábrica de la app Express
│   ├── server.js                # Punto de entrada y apagado ordenado
│   ├── routes/                  # Capa HTTP
│   └── services/taskStore.js    # Lógica de negocio
├── tests/                       # 23 pruebas (unitarias + integración HTTP)
├── public/index.html            # Interfaz web
└── docs/                        # Documentación técnica y evidencias
```

---

## 3. El flujo CI/CD de extremo a extremo

```
  Desarrollador                GitHub                   GitHub Actions (CI)
       │                          │                              │
       │  git push / pull request │                              │
       ├─────────────────────────►│  dispara el workflow ───────►│
       │                          │                              ├─ Checkout
       │                          │                              ├─ Instalar dependencias
       │                          │                              ├─ ESLint (análisis estático)
       │                          │                              ├─ Jest (Node 22 y 24)
       │                          │                              ├─ npm audit (seguridad)
       │                          │                              └─ Build + smoke test Docker
       │                          │                                        │
       │      ✅ checks en verde  │◄───────────────────────────────────────┘
       │◄─────────────────────────┤
       │                          │
       │      merge a main        │        webhook
       ├─────────────────────────►├──────────────────────► Jenkins (CD)
                                                              ├─ Checkout
                                                              ├─ Instalar dependencias
                                                              ├─ Calidad y pruebas (paralelo)
                                                              ├─ Construir imagen Docker
                                                              ├─ Escaneo Trivy
                                                              ├─ Publicar en el registro
                                                              ├─ Actualizar manifiestos (GitOps)
                                                              ├─ Desplegar en Kubernetes
                                                              ├─ Verificación post-despliegue
                                                              └─ Aprobación manual (solo prod)
                                                                        │
                                                                        ▼
                                                               Clúster Kubernetes
```

La **separación entre CI y CD no es accidental**: la integración se ejecuta de
forma síncrona ante cada *commit* y su objetivo es dar retroalimentación rápida
al desarrollador; la entrega se ejecuta después, sobre código ya validado, y su
objetivo es promover un artefacto inmutable entre entornos. Esta separación es la
que recomiendan las prácticas actuales de GitOps y es la que se refleja en la
arquitectura propuesta en el informe previo de esta misma unidad.

---

## 4. Pipeline de CI — GitHub Actions

**Archivo:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

### Disparadores

```yaml
on:
  push:         { branches: [main, develop] }
  pull_request: { branches: [main] }
  workflow_dispatch:
```

Se ejecuta **automáticamente** ante cada `push` a `main` o `develop` y ante cada
*pull request* dirigido a `main`; `workflow_dispatch` permite además lanzarlo a
mano. El bloque `concurrency` cancela ejecuciones anteriores de la misma rama para
no consumir minutos de *runner* en *commits* ya superados.

### Etapas

| Job | Qué hace | Por qué está |
|---|---|---|
| **`lint`** | ESLint sobre todo el código | Análisis estático: detecta errores y malas prácticas antes de ejecutar nada |
| **`test`** | Jest con cobertura, en matriz Node 22 y 24 | Verifica el comportamiento sobre las dos versiones LTS vigentes (Node 20 alcanzó su fin de vida en abril de 2026) |
| **`security`** | `npm audit --audit-level=high` | DevSecOps: falla el *build* ante vulnerabilidades altas o críticas en dependencias |
| **`build`** | Construye la imagen Docker y le hace *smoke test* | Garantiza que el artefacto que consumirá el CD es construible y arranca |
| **`summary`** | Publica una tabla de resultados | Retroalimentación legible en la propia interfaz de Actions |

`lint`, `test` y `security` corren **en paralelo**; `build` declara
`needs: [lint, test, security]` y solo se ejecuta si los tres pasan. El resultado
es un pipeline que falla en el primer minuto cuando algo está mal, en lugar de
gastar tiempo construyendo una imagen que se va a descartar.

Decisiones técnicas relevantes:

- **`npm ci` en lugar de `npm install`**: instala exactamente las versiones
  fijadas en `package-lock.json`, lo que hace la construcción reproducible.
- **`cache: 'npm'`** en `setup-node`: reutiliza el caché de dependencias entre
  ejecuciones y reduce el tiempo del pipeline.
- **Umbrales de cobertura** en `package.json` (80 % de líneas): el *build* falla
  si la cobertura baja, evitando la erosión silenciosa de la calidad.
- **`permissions: contents: read`**: principio de mínimo privilegio sobre el
  token del workflow.

---

## 5. Pipeline de CD — Jenkins

**Archivo:** [`Jenkinsfile`](Jenkinsfile) — *pipeline declarativo*

El pipeline está escrito como `Jenkinsfile` declarativo y versionado junto al
código (*pipeline as code*), de modo que el proceso de despliegue evoluciona con
la aplicación y queda auditado en el historial de Git.

### Stages definidos

| # | Stage | Propósito |
|---|---|---|
| 1 | **Checkout** | Clona el repositorio y registra *commit* y rama exactos: trazabilidad del artefacto |
| 2 | **Instalar dependencias** | `npm ci` para una construcción reproducible |
| 3 | **Calidad y pruebas** | ESLint y Jest **en paralelo**; archiva el reporte de cobertura |
| 4 | **Construir imagen Docker** | Empaqueta la app en un artefacto inmutable etiquetado `build-commit` |
| 5 | **Escaneo de seguridad (Trivy)** | Detecta CVEs en la imagen antes de publicarla (*shift-left security*) |
| 6 | **Publicar en el registro** | `docker push` a DockerHub; la etiqueta `latest` solo se mueve desde `main` |
| 7 | **Actualizar manifiestos (GitOps)** | Reemplaza la etiqueta de imagen en `k8s/deployment.yaml` |
| 8 | **Desplegar en Kubernetes** | `kubectl apply` + `rollout status` con espera a que converja |
| 9 | **Verificación post-despliegue** | *Smoke test* contra el servicio ya desplegado |
| 10 | **Aprobación para producción** | Puerta manual con `input`, activa solo si `DEPLOY_ENV == 'prod'` |

### Despliegue agnóstico al entorno

El parámetro `DEPLOY_ENV` (`dev` / `staging` / `prod`) determina el *namespace*
de destino, y el mismo pipeline sirve para los tres entornos sin duplicar
definiciones. **El artefacto se construye una sola vez y se promueve**: lo que se
prueba en `dev` es exactamente el mismo binario que llega a producción, lo que
elimina la clase entera de fallos "funcionaba en staging".

### Gestión de secretos

Ninguna credencial está en el código. El pipeline referencia identificadores de
credenciales almacenadas en Jenkins (`dockerhub-credentials`,
`kubeconfig-credentials`) y las consume mediante `docker.withRegistry` y
`withCredentials`, que las inyectan como variables de entorno enmascaradas en el
log.

### Manejo de fallos

El bloque `post { failure { ... } }` ejecuta `kubectl rollout undo`, devolviendo
el *deployment* a la revisión anterior si cualquier *stage* falla. Junto con
`timeout`, `disableConcurrentBuilds()` y las sondas de Kubernetes, esto acota el
tiempo medio de recuperación ante un despliegue defectuoso.

### Variante ejecutable en local

[`jenkins/Jenkinsfile.demo`](jenkins/Jenkinsfile.demo) replica los mismos
*stages* sustituyendo por trazas las operaciones que requieren un demonio Docker,
un registro y un clúster real. Se usó para generar las evidencias de ejecución
que acompañan la entrega, ejecutando de verdad las etapas de dependencias,
*lint*, pruebas, auditoría y *smoke test*.

---

## 6. Contenerización

El [`Dockerfile`](Dockerfile) usa un **build multietapa**:

1. **Etapa `build`** — instala todas las dependencias y ejecuta *lint* y pruebas.
   Si algo falla, la imagen no llega a existir.
2. **Etapa `runtime`** — parte de `node:24-alpine` limpia, instala solo
   dependencias de producción (`npm ci --omit=dev`) y copia únicamente `src/` y
   `public/`.

Esto reduce el tamaño de la imagen final y su superficie de ataque. Además el
contenedor corre con `USER node` (no root) y declara un `HEALTHCHECK`.

---

## 7. Despliegue en Kubernetes

Los manifiestos de [`k8s/`](k8s/) declaran el estado deseado:

- **`deployment.yaml`** — 3 réplicas, `RollingUpdate` con `maxUnavailable: 0`
  (despliegue sin interrupción), sondas de *liveness* y *readiness*, límites de
  CPU y memoria, y contexto de seguridad restrictivo (`runAsNonRoot`,
  `readOnlyRootFilesystem`, `drop: ALL`).
- **`service.yaml`** — `ClusterIP` que expone la aplicación dentro del clúster.
- **`hpa.yaml`** — autoescalado horizontal de 3 a 10 réplicas al 70 % de CPU.

---

## 8. Justificación de las herramientas

| Herramienta | Por qué se eligió |
|---|---|
| **GitHub Actions** | Integrado de forma nativa en el repositorio: cero infraestructura que mantener, *runners* gestionados y retroalimentación visible en el propio *pull request*. Es la opción con menor curva de aprendizaje para CI en un proyecto alojado en GitHub. |
| **Jenkins** | Máxima extensibilidad y control sobre el proceso de entrega, con más de 1.800 *plugins* y capacidad de orquestar despliegues hacia infraestructura propia. Su modelo de *pipeline as code* permite versionar el proceso junto al código. |
| **Docker** | Estandariza el entorno de ejecución: el mismo artefacto corre igual en el portátil, en el *runner* de CI y en el clúster, resolviendo el "en mi máquina funciona" (Turnbull, 2014). |
| **Jest + Supertest** | *Framework* de pruebas estándar del ecosistema Node, con cobertura y umbrales integrados; Supertest permite probar la API real sin abrir puertos. |
| **ESLint** | Análisis estático que detecta errores y unifica el estilo, reduciendo la carga de las revisiones de código. |
| **Trivy / npm audit** | Escaneo de vulnerabilidades en imagen y dependencias dentro del pipeline: seguridad desplazada a la izquierda (DevSecOps). |
| **Kubernetes** | Orquestación con autorecuperación, escalado y despliegues progresivos; es el destino natural de un artefacto contenerizado. |

**Por qué dos herramientas y no una:** GitHub Actions resuelve la CI con mínima
fricción para el desarrollador, mientras Jenkins aporta el control, la
trazabilidad y las puertas de aprobación que exige la entrega hacia entornos
productivos. La combinación refleja lo que ocurre en muchas organizaciones
reales, donde la CI vive junto al repositorio y el CD lo gobierna una plataforma
corporativa con acceso a la infraestructura.

---

## 9. Relación con los principios DevOps

Siguiendo los *Tres Caminos* de Kim et al. (2022):

- **Flujo.** La automatización de extremo a extremo elimina las transferencias
  manuales entre desarrollo y operaciones. El paralelismo en ambos pipelines y el
  caché de dependencias acortan el *lead time*.
- **Retroalimentación.** *Lint*, pruebas, auditoría y *smoke tests* crean ciclos
  cortos: un defecto se detecta en minutos, no en producción. El `rollout undo`
  automático y las sondas de Kubernetes reducen el tiempo de recuperación.
- **Aprendizaje continuo.** Todo —código, pipeline, infraestructura— vive
  versionado en Git, lo que convierte cada despliegue en un experimento
  reversible y auditable, y habilita la mejora iterativa del propio proceso.

En términos de métricas DORA, el diseño ataca las cuatro: frecuencia de
despliegue (automatización), *lead time* (paralelismo y caché), tasa de fallos
(pruebas y escaneos como puertas de calidad) y tiempo de recuperación (*rollback*
automático y observabilidad).

---

## 10. Documentación y evidencias

- [`docs/documentacion-tecnica.md`](docs/documentacion-tecnica.md) — documento
  técnico completo de la entrega.
- [`docs/Documentacion_Tecnica_Actividad3.pdf`](docs/Documentacion_Tecnica_Actividad3.pdf)
  — el mismo documento en PDF, con las figuras incrustadas.
- [`docs/img/`](docs/img/) — capturas de la ejecución de ambos pipelines.
- [`docs/evidencia-jenkins-consola.txt`](docs/evidencia-jenkins-consola.txt) — log
  completo de la ejecución del pipeline de Jenkins.

---

---

## 11. Seguridad y monitoreo (unidad 3)

Esta fase añade análisis de seguridad y observabilidad sobre el despliegue real
en Kubernetes.

### Seguridad

| Herramienta | Superficie | Dónde se ejecuta | Resultado |
|---|---|---|---|
| SonarQube | Código propio | Jenkins, stages 4 y 5 | 0 bugs · 0 vulnerabilidades · puerta **Passed** |
| npm audit | Dependencias declaradas | GitHub Actions | 0 vulnerabilidades |
| Trivy | Imagen del contenedor | GitHub Actions y Jenkins | De 6 vulnerabilidades altas a **0** |

Informe completo: [`docs/seguridad/informe-seguridad.md`](docs/seguridad/informe-seguridad.md).

SonarQube se ejecuta desde Jenkins y no desde GitHub Actions porque la instancia
está autoalojada y solo es accesible desde la red local, mientras los *runners*
de GitHub viven en la nube.

### Monitoreo

La aplicación expone `/metrics` en formato Prometheus con métricas del proceso,
un histograma de latencia HTTP y métricas de negocio. Un `ServiceMonitor` declara
el objetivo de recolección y el tablero de Grafana vive versionado como
`ConfigMap`.

| Recurso | Archivo |
|---|---|
| Valores del stack de observabilidad | [`monitoring/values-monitoring.yaml`](monitoring/values-monitoring.yaml) |
| Tablero de Grafana | [`monitoring/dashboard-devops-task-api.json`](monitoring/dashboard-devops-task-api.json) |
| Reglas de alerta | [`monitoring/alert-rules.yaml`](monitoring/alert-rules.yaml) |
| Objetivo de recolección | [`k8s/servicemonitor.yaml`](k8s/servicemonitor.yaml) |

Seis alertas cubren disponibilidad (`AplicacionCaida`, `PodsInsuficientes`,
`ReinicioFrecuenteDePods`), rendimiento (`TasaDeErroresElevada`, `LatenciaAlta`)
y recursos (`MemoriaCercaDelLimite`).

### Reproducir el entorno completo

```bash
# 1. Clúster local con Docker y Kubernetes
colima start --cpu 6 --memory 12 --disk 60 --kubernetes

# 2. Construir y desplegar la aplicación
docker build -t devops-task-api:1.1.1 .
kubectl apply -f k8s/

# 3. Stack de observabilidad
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --values monitoring/values-monitoring.yaml
kubectl apply -f monitoring/alert-rules.yaml -f monitoring/dashboard-configmap.yaml

# 4. Análisis estático
docker run -d --name sonarqube -p 9000:9000 sonarqube:community
docker run --rm --network host -v "$PWD:/usr/src" \
  -e SONAR_HOST_URL=http://localhost:9000 -e SONAR_TOKEN=<token> \
  sonarsource/sonar-scanner-cli:latest

# 5. Acceso a las interfaces
kubectl -n monitoring port-forward svc/monitoring-grafana 3001:80      # Grafana
kubectl -n monitoring port-forward svc/monitoring-prometheus 9090:9090 # Prometheus
```

### Evidencias

| Evidencia | Archivo |
|---|---|
| Dashboard de Grafana en operación | [`docs/img/05-grafana-dashboard.png`](docs/img/05-grafana-dashboard.png) |
| Panel de SonarQube | [`docs/img/06-sonarqube-dashboard.png`](docs/img/06-sonarqube-dashboard.png) |
| Pipeline de CD con seguridad y despliegue | [`docs/img/07-jenkins-cd-k8s.png`](docs/img/07-jenkins-cd-k8s.png) |
| Dashboard durante el incidente simulado | [`docs/img/08-grafana-incidente.png`](docs/img/08-grafana-incidente.png) |
| Log de consola del pipeline de CD | [`docs/evidencia-jenkins-cd-k8s.txt`](docs/evidencia-jenkins-cd-k8s.txt) |
| Cronología del incidente | [`docs/postmortem/cronologia-incidente.txt`](docs/postmortem/cronologia-incidente.txt) |
| Documentación técnica de esta fase | [`docs/documentacion-tecnica-u3.md`](docs/documentacion-tecnica-u3.md) |

---

## Referencias

- Kim, G., Humble, J., Debois, P., Willis, J. y Forsgren, N. (2022). *Manual de DevOps: Transformación exitosa de equipos, herramientas e infraestructura* (2.ª ed.). dpunkt.
- Lwakatare, L. E., Kuvaja, P., Oivo, M., Jedlitschka, A., Nguyen Duc, A., Felderer, M., Abrahamsson, P., Amasaki, S. y Mikkonen, T. (2016). Relationship of DevOps to Agile, Lean and Continuous Deployment: A Multivocal Literature Review Study. En *Product-Focused Software Process Improvement* (pp. 399–415). Springer.
- Turnbull, J. (2014). *The Docker Book: Containerization is the new virtualization*. Turnbull Press.

---

## Licencia

MIT — proyecto académico, Universidad de La Sabana.
