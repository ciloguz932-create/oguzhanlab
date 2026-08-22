# OguzhanLab Agent API — container image
# Builds the standalone HTTP Agent API (server/agent-api) that reuses the RN-free
# agent core. The mobile app is not part of this image.

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:agent-api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# Only production deps are needed at runtime (esbuild bundled our source; deps are external).
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist/agent-api ./dist/agent-api
EXPOSE 8787
ENV AGENT_API_PORT=8787
# Writable artifacts directory (mount a volume in production to persist).
RUN mkdir -p /app/artifacts
CMD ["node", "dist/agent-api/index.js"]
