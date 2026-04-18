# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20-alpine
ARG NGINX_VERSION=1.27-alpine

# ---- builder ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY pnpm-workspace.yaml package.json ./
COPY apps/frontend/package.json ./apps/frontend/

RUN pnpm install --filter @regalica/frontend...

COPY apps/frontend ./apps/frontend
RUN pnpm --filter @regalica/frontend build

# ---- runtime (nginx) -------------------------------------------------------
FROM nginx:${NGINX_VERSION} AS runtime
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /workspace/apps/frontend/dist/frontend/browser /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
