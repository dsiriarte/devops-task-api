# Informe de seguridad

**Proyecto:** devops-task-api
**Versión analizada:** 1.1.1
**Fecha:** 30 de agosto de 2026
**Herramientas:** SonarQube Community 26.8, Trivy 0.74, npm audit
**Repositorio:** https://github.com/dsiriarte/devops-task-api

---

## 1. Alcance y estrategia

El análisis cubre las tres superficies donde puede entrar una vulnerabilidad en
una aplicación contenerizada, con una herramienta distinta para cada una:

| Superficie | Qué puede fallar ahí | Herramienta |
|---|---|---|
| Código propio | Defectos de lógica, malas prácticas, patrones inseguros | SonarQube (SAST) |
| Dependencias declaradas | Paquetes npm con CVE conocidas | npm audit |
| Imagen del contenedor | Sistema operativo base y dependencias transitivas | Trivy |

Usar tres herramientas en lugar de una no es redundante, porque cada una consulta
bases de datos distintas y examina un artefacto diferente. El resultado de este
análisis lo demuestra bien: `npm audit` reportó cero vulnerabilidades mientras
Trivy encontró seis de severidad alta sobre la misma aplicación. Ninguna se
equivocó, simplemente estaban mirando objetos distintos.

## 2. Análisis estático de código — SonarQube

### 2.1 Resultado

| Métrica | Valor | Calificación |
|---|---|---|
| Bugs | 0 | A (fiabilidad) |
| Vulnerabilidades | 0 | A (seguridad) |
| Puntos calientes de seguridad | 0 | — |
| Code smells | 0 | A (mantenibilidad) |
| Deuda técnica | 0 min | — |
| Duplicación | 0.0 % | — |
| Cobertura de pruebas | 78.1 % | — |
| Líneas de código | 269 | — |
| **Puerta de calidad** | Passed | — |

### 2.2 Hallazgos y su tratamiento

El primer análisis reportó dos code smells. Ambos se trataron, pero de forma
distinta, porque solo uno era un defecto real:

**Hallazgo 1 — `src/app.js:3` · regla `javascript:S7772` · severidad MINOR**

> *Prefer `node:path` over `path`.*

Corregido. La importación pasó de `require('path')` a `require('node:path')`. El
prefijo `node:` hace explícito que el módulo es nativo y elimina la posibilidad
de que un paquete de npm con el mismo nombre lo suplante, un vector conocido de
confusión de dependencias.

**Hallazgo 2 — `scripts/smoke-test.js:5` · regla `javascript:S1135` · severidad INFO**

> *Complete the task associated to this "TODO" comment.*

**Marcado como falso positivo.** La regla busca la etiqueta `TODO`, pero aquí
coincidió con la palabra española *todo* dentro de la frase «si todo responde
correctamente». No existe trabajo pendiente asociado.

Se optó por marcarlo como falso positivo en SonarQube, con el razonamiento
registrado como comentario en la incidencia, en lugar de reescribir el comentario
del código. El motivo es de criterio: el problema está en la detección, no en el
código, y alterar el código para acallar a una herramienta degrada la
documentación real del proyecto. Es además un recordatorio de que **un analizador
estático no es una autoridad**, sino una fuente de hipótesis que alguien debe
triar.

Tras ambas acciones el proyecto quedó en 0 incidencias abiertas y 0 minutos de
deuda técnica.

## 3. Análisis de dependencias — npm audit

```
$ npm audit --audit-level=high
found 0 vulnerabilities
```

El árbol de dependencias de producción es deliberadamente pequeño: una única
dependencia directa (`express`) más `prom-client` para la instrumentación. Una
superficie reducida es en sí misma una medida de seguridad.

## 4. Análisis de la imagen — Trivy

### 4.1 Hallazgos iniciales (versión 1.1.0)

Trivy identificó seis vulnerabilidades de severidad ALTA, ninguna de ellas
originada en el código del proyecto ni en sus dependencias declaradas:

| CVE | Paquete | Versión | Corregida en | Origen |
|---|---|---|---|---|
| CVE-2026-14456 | libcrypto3 | 3.5.7-r0 | 3.5.8-r0 | Alpine (imagen base) |
| CVE-2026-14456 | libssl3 | 3.5.7-r0 | 3.5.8-r0 | Alpine (imagen base) |
| CVE-2026-14257 | brace-expansion | 5.0.7 | 5.0.8 | Dependencia interna de npm |
| CVE-2026-69152 | brace-expansion | 5.0.7 | 5.0.9 | Dependencia interna de npm |
| CVE-2026-69192 | ip-address | 10.2.0 | 10.3.1 | Dependencia interna de npm |
| CVE-2026-73566 | tar | 7.5.19 | 7.5.21 | Dependencia interna de npm |

El diagnóstico determinó el origen antes de plantear la corrección:

- CVE-2026-14456 (OpenSSL, denegación de servicio por crecimiento ilimitado
  de memoria en el servidor QUIC) llega con la imagen `node:24-alpine`, que
  distribuye OpenSSL 3.5.7-r0 aunque el repositorio de Alpine ya publicó la
  versión corregida.
- Las cuatro restantes proceden de las dependencias internas del propio
  gestor `npm`, que viaja dentro de la imagen oficial de Node. Se verificó con
  `npm ls --omit=dev` que ninguno de esos paquetes aparece en el árbol de
  dependencias de la aplicación.

### 4.2 Correcciones aplicadas

**Actualización de paquetes del sistema.** Se añadió `apk upgrade --no-cache` a
la etapa de ejecución del `Dockerfile`, que incorpora los parches publicados
después de la construcción de la imagen base.

**Eliminación del gestor de paquetes.** La aplicación se ejecuta con `node`,
nunca con `npm`. Mantener el gestor en la imagen final no aporta ninguna
capacidad y sí cuatro vulnerabilidades. La etapa de ejecución ahora lo elimina
junto con `npx` y `yarn` una vez instaladas las dependencias de producción.

Esta segunda medida es la más relevante del informe porque no parchea una
vulnerabilidad concreta: **elimina la superficie donde esa clase de
vulnerabilidad puede aparecer**. Cualquier CVE futura en las dependencias de npm
dejará de afectar a esta imagen.

### 4.3 Resultado tras las correcciones (versión 1.1.1)

```
Vulnerabilidades ALTAS o CRÍTICAS: 0
```

| Versión | Vulnerabilidades ALTAS/CRÍTICAS | Tamaño de la imagen |
|---|---|---|
| 1.1.0 | 6 | 248 MB |
| 1.1.1 | 0 | 257 MB |

La imagen creció 9 MB. Es un intercambio consciente y favorable: los parches del
sistema pesan más de lo que ahorra la eliminación de npm, a cambio de eliminar
por completo las seis vulnerabilidades altas.

## 5. Controles de seguridad en el despliegue

Más allá del escaneo, el despliegue aplica defensa en profundidad:

| Control | Implementación | Qué previene |
|---|---|---|
| Ejecución sin privilegios | `runAsNonRoot`, `runAsUser: 1000`, `USER node` | Escalada a root dentro del contenedor |
| Sistema de archivos de solo lectura | `readOnlyRootFilesystem: true` | Persistencia de un atacante que logre ejecución |
| Sin escalada de privilegios | `allowPrivilegeEscalation: false` | Uso de binarios setuid |
| Capacidades mínimas | `capabilities.drop: [ALL]` | Abuso de capacidades del kernel |
| Perfil seccomp | `seccompProfile: RuntimeDefault` | Llamadas al sistema no necesarias |
| Estándar de seguridad de pods | Namespace con `enforce: restricted` | Despliegue de cargas no conformes |
| Límites de recursos | `limits` de CPU y memoria | Agotamiento de recursos del nodo |
| Gestión de secretos | Credenciales en Jenkins, nunca en el repositorio | Filtración de credenciales por el código |

El estándar `restricted` del namespace demostró su eficacia durante el
laboratorio: al lanzar un pod auxiliar de verificación sin contexto de seguridad,
Kubernetes rechazó la creación enumerando los cuatro requisitos incumplidos.
Es un control activo, no declarativo.

## 6. Integración en los pipelines

| Herramienta | Pipeline | Momento | Comportamiento ante hallazgo |
|---|---|---|---|
| npm audit | GitHub Actions | Job `security` | Falla el build ante severidad alta |
| Trivy (código) | GitHub Actions | Job `security` | Falla el build ante severidad alta |
| Trivy (imagen) | GitHub Actions | Job `build` | Falla el build ante severidad alta |
| SonarQube | Jenkins | Stage 4 | Análisis completo con cobertura |
| Puerta de calidad | Jenkins | Stage 5 | **Detiene la entrega** si no se supera |
| Trivy (imagen) | Jenkins | Stage 7 | Detiene la entrega, archiva el informe |

SonarQube se ejecuta en Jenkins y no en GitHub Actions por una razón
arquitectónica: la instancia está autoalojada y solo es accesible desde la red
local, mientras los *runners* de GitHub viven en la nube. Es la misma disposición
que adoptan las organizaciones que mantienen SonarQube dentro de su perímetro.

La distinción importante es entre analizar y bloquear. Un análisis cuyo
resultado no detiene nada acaba siendo un informe que nadie lee. Aquí cada
herramienta tiene un `exit-code` que rompe el pipeline, y la puerta de calidad de
SonarQube es una condición explícita del stage 5.

## 7. Recomendaciones

**Aplicables de inmediato**

1. **Fijar la imagen base por digest** (`node:24-alpine@sha256:...`) en lugar de
   por etiqueta. La etiqueta es mutable: dos construcciones del mismo commit
   pueden producir imágenes distintas, lo que rompe la reproducibilidad.
2. **Programar un escaneo periódico** de la imagen ya publicada. Las
   vulnerabilidades aparecen después del despliegue; escanear solo en el build
   deja ciega a la aplicación mientras está en producción.
3. **Generar un SBOM** (`trivy image --format cyclonedx`) y archivarlo con cada
   versión, para poder responder «¿nos afecta esta CVE?» sin reconstruir nada.

**A medio plazo**

4. **Firmar las imágenes** con Cosign y verificar la firma en el clúster mediante
   un controlador de admisión, cerrando la puerta a imágenes no autorizadas.
5. **Incorporar análisis de secretos** (`trivy fs --scanners secret` o
   *gitleaks*) para detectar credenciales filtradas en el historial de Git.
6. **Añadir NetworkPolicies**: hoy cualquier pod del clúster puede alcanzar a la
   aplicación. El principio de mínimo privilegio también aplica a la red.
7. **Elevar la cobertura de pruebas**, hoy en 78.1 %. El incidente simulado en
   este laboratorio se originó precisamente en una rama sin cobertura.

**Limitación conocida**

SonarQube Community Build no analiza vulnerabilidades de inyección (SQL
injection, XSS y similares), como advierte la propia herramienta en su panel. En
esta aplicación el riesgo es bajo, porque no hay base de datos ni renderizado de
HTML desde entrada de usuario, pero en un proyecto con esas características habría
que complementar con una edición superior o con una herramienta SAST adicional.

## 8. Conclusión

La aplicación pasa a producción sin bugs, sin vulnerabilidades y sin deuda
técnica según SonarQube, y sin vulnerabilidades altas o críticas en su imagen
según Trivy.

Lo que más me llamó la atención del análisis no fueron las seis vulnerabilidades
en sí, sino su procedencia. Ninguna estaba en el código que escribí ni en las
dependencias que elegí: todas venían heredadas de la imagen base y de herramientas
que la aplicación ni siquiera utiliza cuando se ejecuta. Esto confirma algo que se
plantea a menudo en DevSecOps, y es que la seguridad de una aplicación
contenerizada depende tanto del código como de la decisión sobre qué se empaqueta
junto a él.
