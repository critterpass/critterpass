# Security review

Launch gate for security (docs/product-decisions.md D4): automated scans clean, and every external
review finding fixed or accepted by the founder. Scope given to the reviewer:
[tools/scripts/security/review-scope.md](../../tools/scripts/security/review-scope.md).

## Advisory patch process

A new high or critical advisory on a dependency we ship is patched within 48 hours: bump or
override in `pnpm-workspace.yaml`, or, when no fix exists and we are not reachable, accept it in
`osv-scanner.toml` with the reason (`scan.sh` filters `pnpm audit` by the same list).

## Automated scans

Run: `bash tools/scripts/security/scan.sh` (steps `secrets ci-logs deps osv containers`; `tracked`
scans only the files tracked at HEAD, for a clone without full history).

| Date | Step | Result |
|---|---|---|
| 2026-10-06 | secrets: gitleaks, full history (4,227 commits) | clean |
| 2026-10-06 | ci-logs: gitleaks over the logs of the last 15 workflow runs | clean |
| 2026-10-07 | tracked: gitleaks over the 17,816 files tracked at HEAD | clean (one accepted test vector, listed in `.gitleaksignore`) |
| 2026-10-07 | deps: `pnpm audit --audit-level high` | clean apart from the accepted advisories below |
| 2026-10-07 | osv: OSV scanner over `pnpm-lock.yaml` (2,078 packages) | clean apart from the accepted advisories below |
| 2026-10-07 | containers: Trivy config over the Dockerfiles | 3 open (finding 1) |

History and CI-log scans were not repeated on 2026-10-07 (the build machine holds a partial clone).

## Static checks

| Date | Check | Command | Result |
|---|---|---|---|
| 2026-10-07 | Row-level security coverage, read from the 162 migrations | `pnpm tsx tools/scripts/security/rls-coverage.ts` | 284 `public` tables, all with RLS enabled and forced; no table without RLS; every one has a permission matrix entry (`packages/db/test/permissions/_matrix.ts`, 284 entries) |
| 2026-10-07 | HTTP security headers, one GET each of `https://staging.critterpass.app/` and the staging API's `/health` | `pnpm tsx tools/scripts/security/headers.ts` | fails on both (findings 3 and 4) |
| 2026-10-07 | Privacy manifests for the app and its extensions | `pnpm tsx tools/scripts/security/privacy-manifest-check.ts` | fails for the app (finding 5) |

The coverage report is static: it replays `CREATE`/`DROP`/`RENAME`/`ALTER … ROW LEVEL SECURITY`/
`GRANT` statements and the `FOREACH … EXECUTE format` loops the migrations use, and does not read
policies. The live catalogue and the policies are proven by the permission matrix suite and the
fuzz below, which run against Postgres in CI.

Accepted advisories (no patched release, not reachable from user input; reasons in
`osv-scanner.toml`): braces, decode-uri-component, http-cache-semantics, node-forge, sprintf-js, uuid 7.

## Database isolation

`packages/db/test/fuzz/rls-fuzz.test.ts` builds random crews, trips and memberships next to the full
permission fixture and has every user attack every other crew's rows in every RLS table (select,
update, delete, insert into a foreign crew); at least 10,000 probes per run. Reads, updates and
deletes reach nothing; three insert policies are open (finding 2).
It also checks that no read-only role can write anywhere and that `app_user` holds nothing on a
table without RLS.

## Findings

| # | Source | Finding | Severity | Status |
|---|---|---|---|---|
| 2 | RLS fuzz | `crew_members`, `trip_participants` and `calendar_days` insert policies check only `user_id = app.uid()`: through the request role a user can add their own membership, participation or calendar day to a crew or trip they are not in. Commands gate joins today (invite and seat-claim checks), so reaching it takes a command bug; the database backstop does not hold. Fix: a migration that also requires an invite/seat path (for example inserts only through a `SECURITY DEFINER` join function, or `WITH CHECK` on crew membership for `trip_participants` and `calendar_days`), then remove the entries from `OPEN_INSERT_GAPS` in the fuzz. | medium | fixed: migration `20261006170000_membership_insert_backstop` (crew joins go through `app.join_crew`, which wants a live code or invite; trip rows and trip-tagged calendar days need crew membership); the fuzz now fails on any insert leak |
| 1 | Trivy DS-0002 | `infra/railway/{centrifugo,powersync,valhalla}.Dockerfile` set no non-root `USER`; the upstream images decide the user. Fix: add `USER` with the image's unprivileged user after checking volume permissions on Railway, or accept. | high (heuristic) | open: infra owner |
| 3 | Headers check | The staging site (`apps/web`, Cloudflare) sends none of `Strict-Transport-Security`, `X-Content-Type-Options`, `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`; no file under `apps/web` sets them. Invite and account pages can be framed by another site and nothing limits script sources. Fix: response headers in the site's middleware or a `_headers` file, with a policy that fits the inline scripts Astro emits. Production was not checked. | medium | open: web owner |
| 4 | Headers check | The staging API sends no `Strict-Transport-Security` and no `X-Content-Type-Options: nosniff` (no `secureHeaders` middleware under `services/api/src`). The API serves JSON to the app, so exposure is small; HSTS matters for the browser-facing routes. Fix: Hono's `secureHeaders` on the app. | low | open: api owner |
| 5 | Privacy manifest check | The iOS app bundle has no privacy manifest although its own Swift calls `UserDefaults` (a required-reason API): App Store Connect rejects or warns on such uploads. Details and fix in [app-privacy-labels.md](app-privacy-labels.md). | medium (blocks submission) | open: mobile owner |

External review findings are added here as they arrive, one row each, with the fixing commit or
the founder's acceptance.
