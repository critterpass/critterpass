# Build context: repository root (railway.json sets dockerfilePath).
FROM node:26.10.0-trixie-slim AS base
RUN npm install --global pnpm@12.6.0 && pnpm --version

FROM base AS build
WORKDIR /repo
COPY . .
# Install only this service's dependency graph: a workspace-wide fetch would also download and
# build other apps' native tooling (e.g. the mobile app's SQLCipher test driver needs Python).
RUN pnpm install --frozen-lockfile --filter "@cp/worker..."
RUN pnpm --filter @cp/worker build
RUN pnpm --filter @cp/worker deploy --prod --legacy /out

FROM node:26.10.0-trixie-slim AS runtime
ENV NODE_ENV=production
# pg_dump for the nightly ops.backup job: it must be the database's major (18) or newer, and Debian
# trixie ships 17, so the client comes from the PostgreSQL (PGDG) apt repository.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt trixie-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-18 \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/* \
  && pg_dump --version
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/services/worker/dist ./dist
USER node
EXPOSE 8788
CMD ["node", "--enable-source-maps", "dist/index.js"]
