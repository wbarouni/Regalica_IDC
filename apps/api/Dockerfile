# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20-alpine

# ---- builder ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY pnpm-workspace.yaml package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/bct-xml-parser/package.json ./packages/bct-xml-parser/
COPY packages/evaluator/package.json ./packages/evaluator/
COPY packages/state-machines/package.json ./packages/state-machines/
COPY packages/structure-validator/package.json ./packages/structure-validator/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --filter @regflow/api...

COPY apps/api ./apps/api

RUN pnpm --filter @regflow/api build && \
    pnpm --filter @regflow/api deploy --legacy --prod /deploy

# ---- runtime ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /deploy .

USER app
ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
