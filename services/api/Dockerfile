# Build context: repository root (railway.json sets dockerfilePath).
FROM node:26.10.0-trixie-slim AS base
RUN npm install --global pnpm@12.6.0 && pnpm --version

FROM base AS build
WORKDIR /repo
COPY . .
# Install only this service's dependency graph: a workspace-wide fetch would also download and
# build other apps' native tooling (e.g. the mobile app's SQLCipher test driver needs Python).
RUN pnpm install --frozen-lockfile --filter "@cp/api..."
RUN pnpm --filter @cp/api build
RUN pnpm --filter @cp/api deploy --prod --legacy /out

FROM node:26.10.0-trixie-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/services/api/dist ./dist
# dist/migrate.js resolves this by URL relative to itself (services/api/src/migrate.ts), not cwd.
COPY --from=build --chown=node:node /repo/packages/db/migrations ./dist/migrations
USER node
EXPOSE 8787
CMD ["node", "--enable-source-maps", "dist/index.js"]
