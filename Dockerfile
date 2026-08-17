FROM node:22-alpine AS web-build

WORKDIR /build

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM nginx:1.28-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=web-build /build/dist/ /usr/share/nginx/html/

RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 8501

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O - http://127.0.0.1:8501/healthz | grep -q ok || exit 1
