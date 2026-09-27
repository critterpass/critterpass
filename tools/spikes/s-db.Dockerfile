# Build context: repository root (selected on the Railway service via RAILWAY_DOCKERFILE_PATH).
# One-shot probe: prints a JSON report to stdout and exits; not a long-running service.
FROM node:26.10.0-trixie-slim AS base
RUN npm install --global pnpm@12.6.0 && pnpm --version

WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "@cp/spikes..."

WORKDIR /repo/tools/spikes
ENV NODE_ENV=production
CMD ["pnpm", "exec", "tsx", "src/s-db/run.ts"]
