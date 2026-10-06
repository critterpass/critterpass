# External security review: scope

The package handed to the external reviewer before launch (docs/product-decisions.md D4). Findings
and their fixes are tracked in [docs/compliance/security-review.md](../../../docs/compliance/security-review.md).

## What the system protects

- Crew data: trips, plans, polls, money (expenses, settlements, payout methods), chat, photos,
  live location and SOS. Privacy classes C0–C5 in `docs/data-model-sync-and-privacy.md` §1.
- Accounts: phone/email OTP, Apple and Google sign-in, anonymous accounts that later merge.
- Money and entitlements: RevenueCat purchases, boost credits, affiliate and supplier bookings.
- Spend: SMS/WhatsApp OTP sends, AI tokens, supplier API quotas.

## In scope

| Area | Entry points | What to try |
|---|---|---|
| Sessions and sign-in | `services/api/src/auth/` (Better Auth config, `otp/`, `social/`, `merge/`, `session-cookie.ts`, `guards.ts`) | OTP brute force and pumping (`abuse/code-attempts.ts`, `abuse/pumping.ts`), account takeover through anonymous merge tickets, social token audience checks, session revocation |
| Admin console | `services/api/src/auth/admin.ts`, `services/api/src/admin/` | role escalation between `admin`, `support` and `content`; impersonation (must be off in production); every action audited |
| Service tokens and JWKS | `services/api/src/auth/tokens.ts` (`GET /api/auth/token`, `GET /api/auth/jwks`) | audience confusion between PowerSync and Centrifugo tokens, key rotation, expiry |
| Device action keys | `services/api/src/auth/action-keys/`, `routes/action-keys.ts`, `routes/actions.ts` | signature, ±300 s replay window, scope escape from widget and notification actions |
| Commands and sync upload | `routes/cmd.ts`, `routes/sync-upload.ts`, `services/api/src/commands/` | acting on another crew's trip, op_id replay, merge rules |
| Database backstop | `packages/db/migrations` (roles, forced RLS), `packages/db/test/permissions`, `packages/db/test/fuzz` | any path where the request role reads or writes outside its crews; `guide_reader` and `powersync_repl` grants |
| PowerSync | `infra/powersync/` sync rules, `infra/railway/powersync-*.toml` | bucket parameters that widen a user's sync set |
| Realtime | `routes/internal-rt.ts`, `services/api/src/realtime/` (`acl.ts`, `publish-rules.ts`), `infra/centrifugo/` | channel subscription outside one's crews, publish proxy bypass, shared proxy header |
| Webhooks | `routes/webhooks/` (RevenueCat, AeroAPI, inbound email, WhatsApp vendor), `routes/otp-webhooks.ts`, `routes/webhooks-*.ts` | signature verification, replay, forged entitlement grants |
| Media | `services/media-worker/src/index.ts` (`verifyMediaSignature` from `@cp/domain`), `routes/media.ts` | URL signature forgery, key rotation (`MEDIA_HMAC_KEYS`), public-content path traversal |
| Partner links and OAuth | `routes/links.ts`, `routes/mailbox-oauth.ts`, `services/api/src/calendar-oauth/` | open redirects, OAuth state, token storage (encrypted columns) |
| AI surfaces | `services/api/src/ai/`, `routes/guide.ts` | prompt injection reaching tools or other crews' data; cost abuse past the fair-use caps |
| Rate limits | `services/api/src/abuse/rate-limits.ts`, `bot-filter.ts`, `attestation/` | limits per user, device and IP; App Attest and Play Integrity checks |
| Mobile app | `apps/mobile` | secrets in the bundle, deep-link handling, local SQLite at rest, screenshot of sensitive screens |

## Out of scope

Third-party platforms themselves (Railway, PlanetScale, Cloudflare, Expo/EAS, RevenueCat, Sentry),
denial of service by volume, and social engineering.

## Environment for the reviewer

- Staging only: `https://api-staging-de92.up.railway.app` and the staging TestFlight / Play internal builds.
- Two test crews made with real commands, one account per role (organiser, member, ex-member,
  outsider) and one `support` admin account. The founder creates the accounts and shares them out of band.
- Source access: read-only on the GitHub repository for the review window.

## Automated scans already run

`bash tools/scripts/security/scan.sh`: gitleaks over full git history and recent CI logs,
`pnpm audit` and OSV over the lockfile, Trivy over the Dockerfiles (and built images with
`SCAN_IMAGES`). CI runs gitleaks on every pull request and OSV weekly and on lockfile changes.
