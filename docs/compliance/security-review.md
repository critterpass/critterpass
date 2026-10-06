# Security review

Launch gate for security (docs/product-decisions.md D4): automated scans clean, and every external
review finding fixed or accepted by the founder. Scope given to the reviewer:
[tools/scripts/security/review-scope.md](../../tools/scripts/security/review-scope.md).

## Advisory patch process

A new high or critical advisory on a dependency we ship is patched within 48 hours: bump or
override in `pnpm-workspace.yaml`, or, when no fix exists and we are not reachable, accept it in
`osv-scanner.toml` with the reason (`scan.sh` filters `pnpm audit` by the same list).

## Automated scans

Run: `bash tools/scripts/security/scan.sh` (steps `secrets ci-logs deps osv containers`).

| Date | Step | Result |
|---|---|---|
| 2026-10-06 | secrets: gitleaks, full history (4,227 commits) | clean |
| 2026-10-06 | ci-logs: gitleaks over the logs of the last 15 workflow runs | clean |
| 2026-10-06 | deps: `pnpm audit --audit-level high` | clean apart from the accepted advisories below |
| 2026-10-06 | osv: OSV scanner over `pnpm-lock.yaml` (2,072 packages) | clean apart from the accepted advisories below |
| 2026-10-06 | containers: Trivy config over the five Dockerfiles | 3 open (finding 1) |

Accepted advisories (no patched release, not reachable from user input; reasons in
`osv-scanner.toml`): braces, decode-uri-component, http-cache-semantics, node-forge, sprintf-js, uuid 7.

## Database isolation

`packages/db/test/fuzz/rls-fuzz.test.ts` builds random crews, trips and memberships next to the full
permission fixture and has every user attack every other crew's rows in every RLS table (select,
update, delete, insert into a foreign crew); at least 10,000 probes per run, zero rows reached.
It also checks that no read-only role can write anywhere and that `app_user` holds nothing on a
table without RLS.

## Findings

| # | Source | Finding | Severity | Status |
|---|---|---|---|---|
| 1 | Trivy DS-0002 | `infra/railway/{centrifugo,powersync,valhalla}.Dockerfile` set no non-root `USER`; the upstream images decide the user. Fix: add `USER` with the image's unprivileged user after checking volume permissions on Railway, or accept. | high (heuristic) | open: infra owner |

External review findings are added here as they arrive, one row each, with the fixing commit or
the founder's acceptance.
