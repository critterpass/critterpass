# Persistent Railway service for the S-SYNC spike: Better Auth (JWKS + token minting) and
# POST /sync/upload over PlanetScale (tools/spikes/src/s-sync/main.ts). Build context: repository
# root (selected via RAILWAY_DOCKERFILE_PATH). Unlike s-db.Dockerfile this does not exit — it
# serves traffic until torn down.
FROM node:26.10.0-trixie-slim AS base
RUN npm install --global pnpm@12.6.0 && pnpm --version

WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "@cp/spikes..."

WORKDIR /repo/tools/spikes
ENV NODE_ENV=production
EXPOSE 8080
CMD ["pnpm", "exec", "tsx", "src/s-sync/main.ts"]
