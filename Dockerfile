# Канбат на сервере: сайт + API в одном контейнере.
# Данные — в томе /data; ИИ — переменными окружения (см. .env.example).
FROM node:22-alpine AS build
# в России registry.npmjs.org обычно доступен; если нет — передайте зеркало через NPM_REGISTRY
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN npm config set registry $NPM_REGISTRY
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/tokens/package.json packages/tokens/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    SERVE_WEB=1 \
    DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/web/dist ./apps/web/dist
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "scripts/start.mjs"]
