# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20-alpine

# ---- builder ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json ./
COPY apps/chatbot-node/package.json ./apps/chatbot-node/

RUN pnpm install --filter @regalica/chatbot-node...

COPY apps/chatbot-node ./apps/chatbot-node

RUN pnpm --filter @regalica/chatbot-node build && \
    pnpm --filter @regalica/chatbot-node deploy --prod /deploy

# ---- runtime ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /deploy .

USER app
ENV NODE_ENV=production
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
