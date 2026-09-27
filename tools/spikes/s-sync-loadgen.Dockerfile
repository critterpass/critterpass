# One-shot Railway job that ramps real PowerSync client connections against spike-powersync-api
# from Railway's own container (not the dev machine, which shares 16 GB with sibling agents —
# see docs/decisions/20260927-self-hosted-powersync-sync.md). Build context: repository root.
FROM node:26.10.0-trixie-slim AS base
RUN npm install --global pnpm@12.6.0 && pnpm --version

WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "@cp/spikes..."

WORKDIR /repo/tools/spikes
ENV NODE_ENV=production
CMD ["pnpm", "exec", "tsx", "src/s-sync/load-gen.ts"]
