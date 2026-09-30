# Build context: repository root (railway.json sets dockerfilePath).
FROM node:26.10.0-trixie-slim AS base
RUN npm install --global pnpm@12.6.0 && pnpm --version

FROM base AS build
WORKDIR /repo
COPY . .
# Install only this service's dependency graph: a workspace-wide fetch would also download and
# build other apps' native tooling (e.g. the mobile app's SQLCipher test driver needs Python).
# drizzle-orm lists better-sqlite3 as an optional peer, and the mobile app's test driver puts it in
# the lockfile, so it lands in this graph. The service never loads it, and building it needs a
# prebuilt download or Python, so the image turns its install scripts off.
RUN sed -i -E 's/^  (better-sqlite3(-multiple-ciphers)?): true$/  \1: false/' pnpm-workspace.yaml
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
# ffmpeg for crew chat voice notes (chat.voice_transcode); the build fails if it cannot run.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -version
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/services/worker/dist ./dist
# Fonts the share cards (proposal poster and postcard) are drawn with.
COPY --from=build --chown=node:node /repo/apps/mobile/assets/fonts/Archivo-W66-800.ttf /repo/apps/mobile/assets/fonts/Geist-400.ttf /repo/apps/mobile/assets/fonts/GeistMono-400.ttf /repo/apps/mobile/assets/fonts/Borel-400.ttf ./fonts/
ENV SHARE_FONTS_DIR=/app/fonts
USER node
EXPOSE 8788
# The OpenTelemetry preload registers the ESM hook before the entry loads http, pg and pino.
CMD ["node", "--enable-source-maps", "--import", "./dist/obs/instrument.js", "dist/index.js"]
