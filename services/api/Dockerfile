# Build context: repository root (railway.json sets dockerfilePath).
FROM node:26.10.0-trixie-slim AS base
RUN npm install --global pnpm@12.6.0 && pnpm --version

FROM base AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "@cp/api..."
RUN pnpm --filter @cp/api build
RUN pnpm --filter @cp/api deploy --prod --legacy /out

FROM node:26.10.0-trixie-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/services/api/dist ./dist
USER node
EXPOSE 8787
CMD ["node", "--enable-source-maps", "dist/index.js"]
