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
| 2026-10-07 | tracked: gitleaks over the 18,031 files tracked at HEAD | clean (one accepted test vector, listed in `.gitleaksignore`) |
| 2026-10-07 | deps: `pnpm audit --audit-level high` | clean apart from the accepted advisories below |
| 2026-10-07 | osv: OSV scanner over `pnpm-lock.yaml` (2,078 packages) | clean apart from the accepted advisories below |
| 2026-10-07 | containers: Trivy config over the Dockerfiles | 3 open (finding 1) |
| 2026-10-07, after the fix | containers: `trivy config --severity HIGH,CRITICAL` over `infra/railway/*.Dockerfile` | centrifugo and powersync clean; valhalla still reports DS-0002 (finding 1: it starts as root to take the volume, then drops) |

History and CI-log scans were not repeated on 2026-10-07 (the build machine holds a partial clone).

## Static checks

| Date | Check | Command | Result |
|---|---|---|---|
| 2026-10-07 | Row-level security coverage, read from the 166 migrations | `pnpm tsx tools/scripts/security/rls-coverage.ts` | 286 `public` tables, all with RLS enabled and forced; no table without RLS; every one has a permission matrix entry (`packages/db/test/permissions/_matrix.ts`, 286 entries) |
| 2026-10-07 | HTTP security headers, one GET each of `https://staging.critterpass.app/` and the staging API's `/health` | `pnpm tsx tools/scripts/security/headers.ts` | fails on both (findings 3 and 4) |
| 2026-10-07 04:15 UTC, re-run after the header changes merged (4fa6976e55) and both staging deploys finished | HTTP security headers, same two GETs | same command | API passes: every checked header present (finding 4 fixed). Site still fails: none of the six headers on `/` (finding 3 stays open) |
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
| 1 | Trivy DS-0002 | `infra/railway/{centrifugo,powersync,valhalla}.Dockerfile` set no non-root `USER`; the upstream images decide the user. | high (heuristic) | centrifugo and powersync fixed: the upstream images already run unprivileged (`centrifugo`, uid 1000; `web`, uid 901; read from the image configs in the registries), and the Dockerfiles now say so, so a base image change cannot make them root; Trivy is clean on both. valhalla was the only one running as root (the upstream image has no other user): its server, tile download and config now run as a new `valhalla` user (uid 10001). The container still starts as root for one step, handing the tiles volume to that user, because Railway mounts volumes owned by root; for that reason there is no `USER` line and Trivy keeps reporting DS-0002 on this file. **Open: founder to accept the remaining report**, or the volume goes. Not yet deployed: see "After the next staging deploy" below |
| 3 | Headers check | The staging site (`apps/web`, Cloudflare) sends none of `Strict-Transport-Security`, `X-Content-Type-Options`, `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`. Invite and account pages can be framed by another site and nothing limits script sources. Production was not checked. | medium | **open: fixed in code, not on staging.** 4fa6976e55 sets the six headers in the site's middleware and in `apps/web/public/_headers`, with tests. The staging deploy of a later commit succeeded at 04:03 UTC on 2026-10-07 (`deploy edge`, 334d03d0d), yet at 04:15 UTC plain GETs of `/`, `/legal/privacy` (prerendered), `/i/ABC123` (rendered by the Worker, 404) and `/_astro/nope.js` returned none of them. Web owner: find why the deployed Worker and its assets do not send what the build sets, then re-run the check |
| 4 | Headers check | The staging API sent no `Strict-Transport-Security` and no `X-Content-Type-Options: nosniff`. The API serves JSON to the app, so exposure was small; HSTS matters for the browser-facing routes. | low | fixed: 4fa6976e55 (`services/api/src/security-headers.ts`). Seen on staging `/health` at 04:15 UTC on 2026-10-07: `strict-transport-security: max-age=31536000; includeSubDomains`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: no-referrer`, `content-security-policy: default-src 'none'; frame-ancestors 'none'`; the check passes |
| 5 | Privacy manifest check | The iOS app bundle has no privacy manifest although its own Swift calls `UserDefaults` (a required-reason API): App Store Connect rejects or warns on such uploads. Details and fix in [app-privacy-labels.md](app-privacy-labels.md). | medium (blocks submission) | open: mobile owner (the check still fails for the app on 2026-10-07) |
| 6 | Staging, 2026-10-07 | Realtime refused every app connection: Centrifugo checks the WebSocket `Origin` against `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS`, the app sends `Origin: https://<the realtime host it connects to>`, and the list held the web origins only. Centrifugo answered "request Origin is not authorized", so the app had no live map ETAs, typing, presence or live tallies. Not a leak (the check failed closed), but the allow-list is a security control whose wrong value takes realtime down, and nothing tested it. | medium (availability) | fixed on staging on 2026-10-07: the service's own public origin was added to the variable, documented in [infra/railway/README.md](../../infra/railway/README.md) (2930973b91). **Open for production: add the production realtime host's origin to the production variable before launch**, next to the web origins, and confirm one app connection |

## After the next staging deploy

Merging the Dockerfile change redeploys the three staging services (Railway watches the files).
Nothing was deployed or observed for this change yet; the routing image's boot on fresh tiles is
exercised by the `routing tiles` dry run on the pull request. Watch the boot logs once:

| Service | Expect | Trouble looks like |
|---|---|---|
| centrifugo | the same start as before (same user as the upstream image), `/health` answers | `permission denied` reading `/centrifugo/config.json` |
| powersync (`sync` and `api`) | the same start as before (same user), replication resumes, clients sync | `EACCES` on `/config/service.yaml` or `/config/sync-streams.yaml` |
| valhalla | `routing tiles: serving <build>` then `/status` answers; on the existing volume the first boot re-owns the tiles (seconds) and does not download again | `chown: … Operation not permitted` or `setpriv: …` before the first `routing tiles:` line (the container was not started as root, for example `RAILWAY_RUN_UID` is set), or `Permission denied` under `/data`. Roll back by redeploying the previous deployment; the volume's files stay readable by root |

External review findings are added here as they arrive, one row each, with the fixing commit or
the founder's acceptance.
