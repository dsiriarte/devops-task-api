# ---------------------------------------------------------------------------
# Build multietapa: la primera etapa instala dependencias y ejecuta pruebas,
# la segunda produce una imagen final minima solo con lo necesario para correr.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Se copian primero los manifiestos para aprovechar la cache de capas de Docker:
# si package*.json no cambia, npm ci no se vuelve a ejecutar.
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run lint && npm test

# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/src ./src
COPY --from=build /app/public ./public

# No ejecutar como root: requisito basico de seguridad en Kubernetes.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
