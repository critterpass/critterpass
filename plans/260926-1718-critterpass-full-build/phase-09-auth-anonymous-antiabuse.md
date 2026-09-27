---
phase: 9
title: Auth, anonymous-first identity, anti-abuse
status: pending
depends_on: [2, 8]
wave: 3
features: [F-042, F-029]
screens: [3a-1, 3a-7, 3a-8, 3a-11, 3a-12, 3n-9]
tasks: 10
owns:
  - services/api/src/auth/
  - services/api/src/abuse/
  - services/api/src/routes/auth-extra.ts        # /v1/auth/merge-ticket, /v1/auth/merge, /v1/auth/apple/authorization-code, /v1/attest/challenge
  - services/api/src/routes/webhooks-whatsapp.ts # signed WhatsApp Cloud API status webhook
  - services/api/test/auth/
  - services/api/test/abuse/
  - services/api/.env.example                    # auth + OTP + attestation keys only (append section)
  - packages/db/src/schema/auth.ts
  - packages/db/src/schema/user-private.ts       # user_private, account_deletions, install_attributions (skeleton), device_action_keys
  - packages/db/src/merge-rules.ts
  - packages/db/src/crypto/
  - packages/db/migrations/*_auth_schema.sql
  - packages/db/migrations/*_user_private_and_account_state.sql
  - packages/db/migrations/*_device_action_keys.sql
  - packages/db/migrations/*_device_attestations.sql
  - packages/db/test/permissions/{user_private,account_deletions,install_attributions,device_action_keys,device_attestations,auth_schema}.test.ts
  - packages/domain/src/auth/
  - apps/mobile/src/data/auth/
  - apps/mobile/src/lib/attestation.ts
---
# Phase 9 — Auth, anonymous-first identity, anti-abuse

## Context links
| Source | Section |
|---|---|
| `docs/api-contracts.md` | §5.1 auth routes, §3 codes `AUTH_REQUIRED`, `SESSION_REVOKED`, `MERGE_REQUIRED`, `ACCOUNT_CLOSED`, `ATTESTATION_FAILED`, `RATE_LIMITED`, `ACTION_KEY_SCOPE`; §4.1 note (auth flows are Better Auth endpoints) |
| `docs/api-contracts-async.md` | §1 `user:#uid` `session.revoked`; §5 device action keys; `maint.anon_gc` rules |
| `docs/data-model.md` | §3.1 `auth.*`, `user_private`, `install_attributions`; §3.11 `device_action_keys`; §3.17 `account_deletions`; UQ 1 (phone plaintext in `auth.user`) |
| `docs/data-model-sync-and-privacy.md` | §1 split tables, field encryption, deletion row; §4 account switch → `disconnectAndClear()` |
| `docs/system-architecture.md` | §5 identity layer, §6 secrets, §11 S-AUTH spike |
| `docs/code-standards.md` | §18 security rules |
| `docs/product-decisions.md` | D4 (Better Auth), D14 (OTP sender router), D15, Q-10 (sign-in required before purchase, sending invites, second device) |
| Backend report | §4.5 Auth (anonymous caveat, plugins, rate limits, attestation), §8 risks, S-AUTH, §13 UQ 1 |
| Onboarding report | §"3a-7 Save your pass", §"3a-8 Phone sign-in", gap 2 (no returning sign-in on splash), F6 row, UQ 1 (skip 3a-7?) |
| Master | §2 rows F-042, F-029; R17; §7 auth row (SIWA, oneTimeCode, SMS Retriever) |
| Renders | `docs/design-renders/screens/3a-7_Save_your_pass.png`, `3a-8_Phone_sign-in.png`, `3a-1_Splash.png`, `3a-11_Join_with_a_code.png` |

## Overview
Goal: every install gets an anonymous uid on first launch (attested), which later upgrades in place to Apple / Google / phone without changing uid; conflicts become an explicit merge; returning users on a fresh install can sign in; EdDSA JWTs (JWKS) feed PowerSync and Centrifugo; OTP and codes are protected against pumping and enumeration; extensions authenticate with scoped, revocable device action keys.
Done when: API integration tests (Hono `app.request` + Testcontainers + Redis container) prove uid preservation for all three upgrade paths, merge, returning sign-in, JWT verification against `/api/auth/jwks` with rotation, OTP routing/fallback with recorded provider fixtures, rate limits, attestation enforcement and action-key HMAC verification; the Expo auth client compiles and its unit tests pass. Screens 3a-7/3a-8 and the returning sign-in UI are built in phase 22 on this client.

## Requirements
### F-042 Auth + account upgrade
| Aspect | Requirement |
|---|---|
| Anonymous-first | first launch → `POST /api/auth/sign-in/anonymous` (attested) → session (30 d sliding) + `public.users` row with same uid, `status='anonymous'` (database hook in the same tx) |
| 3a-7 Save your pass | sheet offers Apple, Google, phone. Apple/Google: native ID token (`expo-apple-authentication` with nonce; Google Sign-In / Credential Manager) → `linkSocial({provider, idToken, nonce})` on the anonymous session → uid unchanged, `is_anonymous=false`, `users.status='registered'`. Motion "SAVED tick" is UI (phase 22); client returns `{linked:true}` event for it |
| 3a-8 Phone | `send-otp` → sender router; `verify({updatePhoneNumber:true})` keeps uid; OTP 6 digits, 300 s, 5 attempts; iOS `oneTimeCode` autofill, Android SMS Retriever hash appended to SMS body (app hash from config); WhatsApp copy-code button template; resend with backoff 30/60/120 s; "OR continue with Apple/Google" also on 3a-8 |
| Conflict → merge | identity already on another uid → `MERGE_REQUIRED`. The ticket is minted **only inside that failed `linkSocial` / OTP-verify response** (the call that just proved control of the existing identity: verified Apple/Google ID token or consumed OTP); the ticket stores `verification_id` + `existing_uid` + `anon_uid` + `anon_session_id`, single-use, 10 min. No standalone ticket issuance. `POST /v1/auth/merge-ticket {ticket}` returns preview `{crews, trips, critters, stamps}` of both → user confirms → `POST /v1/auth/merge` (strategy `keep_existing`) runs `onLinkAccount` merge rules in one `withSystem` tx: crews/critters/stamps union, existing profile wins; anonymous uid deleted; its sessions/action keys revoked; `rt_outbox` disconnect; the same response mints and returns a session for `existing_uid` (Better Auth `internalAdapter.createSession`), so the client never holds a dead anonymous session; client runs `onSignOut` hooks (PowerSync `disconnectAndClear()` registered by phase 10) then resyncs as the existing uid |
| Merge rule registry | `packages/db/src/merge-rules.ts`: per table with a user column → `union | keep_existing | drop | reassign`; coverage test fails when a table with `user_id` lacks a rule (later phases register theirs) |
| Returning user (undesigned) | fresh install, no local pass: splash "I have an account" entry (UI phase 22) → Apple/Google `sign-in/social` or phone `sign-in/phone-number` **before** an anonymous session exists (never from an anonymous session — Better Auth would drop the uid); if an anonymous session already exists with no crews and no pass → sign-in then GC the anonymous uid; if it has data → merge-ticket path |
| Second device | sign-in required (Q-10); same flow as returning user |
| Gates (Q-10) | server error `AUTH_REQUIRED` with `detail.reason ∈ {purchase, send_invite, second_device}` from `requireRegistered()` guard used by phase 23/46 |
| SIWA | capture `authorizationCode` via `/v1/auth/apple/authorization-code` → exchange for refresh token (encrypted in `auth.account`) → `revokeApple(uid)` used by deletion (phase 45) and unlink; Google token revoke likewise |
| Sessions | sign-out / revoke-sessions → `rt_outbox` `session.revoked` on `user:#uid` + revoke device action keys; client runs the `onSignOut` hook registry (`apps/mobile/src/data/auth/sign-out-hooks.ts`); phase 10 T4 registers PowerSync `disconnectAndClear()` + `local_private` wipe into it |
| Account state | `ACCOUNT_CLOSED` guard reads `account_deletions` (open row) — restore flow in phase 45 |
| States to design in code (phase 22 renders them) | OTP wrong code, expired code, too many attempts, country not supported ("Use Apple or Google instead"), WhatsApp not delivered (`otp.channel_failed` on `user:#uid`, or no verify after 20 s) → "Send by SMS" offer, provider down, merge preview, link cancelled, offline |

### F-029 Anti-abuse
| Control | Requirement |
|---|---|
| Attestation | iOS App Attest (attest once per install, assertion per sensitive call; each assertion signs a single-use server challenge from `POST /v1/attest/challenge` — Redis, 5 min TTL, bound to install id; key id + public key + sign counter stored in `device_attestations` (S, unpublished, no `guide_reader`)) / Android Play Integrity (standard request, nonce bound to request hash) verified in Better Auth `hooks.before` for anonymous sign-in and OTP send; failures → `ATTESTATION_FAILED`. Mode per env: `enforce` (prod), `enforce` with Apple development environment accepted (staging), `log` only when `NODE_ENV=test`/local simulators — mode chosen by env var, never by client input |
| Rate limits | Better Auth rate limit with Redis secondary storage; `ipAddressHeaders:['x-real-ip']`; IPv6 bucket /64; custom rules: anonymous sign-in 10/h/IP; send-otp 3/10 min/phone, 10/h/IP, 5/h/device; verify 5 attempts/code; link 10/h/uid |
| SMS pumping | country allow-list (server config `otp.allowed_countries`), block premium/unknown ranges (libphonenumber-js type check), per-prefix velocity breaker (auto-disable a prefix after N sends/15 min without verifications), daily spend counter per provider with alarm metric + hard cap switching to WhatsApp-only, conversion ratio alert |
| Code enumeration | reusable limiter `abuse/code-attempts.ts` (per IP + device + uid sliding window, exponential lockout, constant-time lookups by hash) consumed by join codes (phase 21/23), gift codes (46) |
| Bot-filtered opens | `abuse/bot-filter.ts` classifies link-preview/prefetch UAs and known scanner IPs; exported for invite open counting (phase 21) |
| Anonymous GC | rule fn `isAnonGcCandidate` (inactive 90 d, no crew, no purchases) used by `maint.anon_gc` cron (phase 11) |
| Admin | Better Auth `admin` plugin roles `admin`, `support`, `content`; impersonation disabled in prod; every admin action → `ops.admin_audit` |
| Device action keys | table + issuance helper + HMAC verification middleware (`X-CP-Key-Id`, `X-CP-Ts` ±300 s, `X-CP-Sig`), scope enforcement → `ACTION_KEY_SCOPE`, 30 d rolling, revoke on sign-out, device removal, deletion, merge, admin action. Endpoints `/v1/devices/{id}/action-keys` wired in phase 11 with `devices` |

Applicable decisions: D4 (Better Auth 1.7 plugins: anonymous, phoneNumber, jwt EdDSA, admin, expo; `disableImplicitLinking`; minimal plugin set; advisories patched within 48 h), D14, D15, D18 (data in Singapore), C36.

## Architecture & contracts
| Area | Delta |
|---|---|
| Tables | `auth.user/session/account/verification/jwks` (Better Auth generated → reviewed SQL; `generateId` = UUIDv7); `user_private` (phone_e164_enc, phone_hash, email_enc, sign_in_country), `account_deletions`, `install_attributions` skeleton (device_id, channel, source), `device_attestations` (install_id, platform, key_id, public_key, counter, attested_at, last_assertion_at, verdict), `device_action_keys` (key_id, device_id uuid, user_id, secret_enc, scopes, expires_at, last_used_at, revoked_at) — all RLS X/S, not published |
| Phone plaintext (data-model UQ 1) | `auth` schema: no grants to `app_user`, `guide_reader`, `powersync_repl`; `databaseHooks` copies encrypted phone + hash into `user_private`; logs redact |
| Routes | §5.1 as specified + `POST /api/auth/sign-in/phone-number` (returning), `GET /api/auth/token?aud=sync|rt` (15 min, `sub`=uid, `kid`), `POST /v1/attest/challenge`, `POST /webhooks/whatsapp` (Meta `X-Hub-Signature-256` HMAC verified, `GET` verify-token handshake) |
| JWKS | EdDSA Ed25519, private keys AES-GCM encrypted, `rotationInterval` 90 d, old keys kept 7 d for verification; PowerSync + Centrifugo read `/api/auth/jwks` |
| Realtime | `session.revoked`, `otp.channel_failed{verification_id}`, `rt_outbox` kind `disconnect` for merged/revoked uid |
| Events | `auth.anonymous_created`, `auth.linked{provider}`, `auth.merged{from_uid}`, `auth.signed_in{method}`, `auth.session_revoked`, `abuse.otp_blocked{reason}` |
| Mobile | `apps/mobile/src/data/auth/`: `@better-auth/expo` client, secure storage, `useSession`, `ensureAnonymous()`, `linkApple()`, `linkGoogle()`, `sendOtp()/verifyOtp()`, `signInReturning()`, `startMerge()/confirmMerge()`, `signOut()` (→ runs `onSignOut` hook registry; PowerSync `disconnectAndClear` is registered by phase 10), token fetchers for PowerSync/Centrifugo; `apps/mobile/src/lib/attestation.ts` wraps App Attest / Play Integrity (Expo module from phase 2 spike or `expo-app-integrity`) |

## Tasks
### T1 — Better Auth core, auth schema, users hook
- Goal: Better Auth mounted at `/api/auth/*` with Postgres (Drizzle adapter, `auth` role), Redis secondary storage, UUIDv7 ids.
- Files: `services/api/src/auth/{index,config,hooks}.ts`, `packages/db/src/schema/auth.ts`, `packages/db/migrations/<ts>_auth_schema.sql`, `services/api/test/auth/core.test.ts`, `services/api/.env.example`.
- Steps: 1. Configure minimal plugins (anonymous, phoneNumber, jwt, admin, expo), `disableImplicitLinking`, `trustedOrigins`, session 30 d / `updateAge` 1 d. 2. Generate auth schema, review, commit SQL; grants per data-model §2. 3. `databaseHooks.user.create.after` inserts `public.users` (same id) + `user_settings` defaults. 4. zod env check for auth vars.
- Tests: `pnpm --filter @cp/api test -- auth/core`
- Done when: anonymous sign-in creates `auth.user` + `public.users` with identical uuidv7; `app_user` cannot SELECT `auth.*`.
- Status: done — 7fe2d99 (test named `core.db.test.ts` per the repo's Testcontainers convention — `pnpm --filter @cp/api test:db -- auth/core`; `services/api/src/auth/otp/*` and `routes/webhooks-whatsapp.ts` landed early as a real, credential-free routing skeleton so the phoneNumber plugin has a working `sendOTP`, filled in by T4)

### T2 — JWT/JWKS for PowerSync and Centrifugo, key rotation
- Goal: short-lived audience-scoped tokens.
- Files: `services/api/src/auth/tokens.ts`, `services/api/test/auth/jwks.test.ts`.
- Steps: 1. jwt plugin EdDSA, encrypted private keys, `aud` sync|rt, 15 min, claims `sub`, `sid`, `anon`. 2. `/api/auth/token?aud=` endpoint. 3. Rotation job fn + retention of old keys 7 d. 4. Tests verify with `jose` `createRemoteJWKSet` against `/api/auth/jwks`, including after rotation.
- Tests: `pnpm --filter @cp/api test -- auth/jwks`
- Done when: token verifies by kid before and after rotation; wrong aud rejected; revoked session cannot mint tokens.
- Status: done — 213435e (`jwks.db.test.ts` per Testcontainers convention, `pnpm --filter @cp/api test:db -- auth/jwks`; discovered and worked around Better Auth's undocumented hard-coded 3-per-10s `/sign-in*` rate limit via `rateLimit.customRules`)

### T3 — Anonymous sign-in with attestation
- Goal: attested anonymous-first identity.
- Files: `services/api/src/abuse/attestation/{app-attest,play-integrity,challenge,index}.ts`, `services/api/src/auth/hooks.ts`, `services/api/src/routes/auth-extra.ts` (challenge route), `packages/db/src/schema/user-private.ts` (`device_attestations`), `packages/db/migrations/<ts>_device_attestations.sql`, `packages/db/test/permissions/device_attestations.test.ts`, `apps/mobile/src/lib/attestation.ts`, `services/api/test/abuse/attestation.test.ts`, `services/api/test/fixtures/attestation/`.
- Steps: 1. App Attest: verify attestation object (cert chain to Apple root, nonce, app id `TEAMID.app.critterpass`), store key id + public key + counter in `device_attestations`; `POST /v1/attest/challenge` issues single-use Redis challenges (5 min); assertions verify challenge consumed once + counter monotonic. 2. Play Integrity: decode via Google API (service account), check package name, cert digest, `MEETS_DEVICE_INTEGRITY`, nonce. 3. `hooks.before` on `/sign-in/anonymous` and `/phone-number/send-otp`. 4. Env-driven mode. 5. Recorded real fixtures from the phase 2 spike devices.
- Tests: `pnpm --filter @cp/api test -- abuse/attestation`
- Done when: valid fixtures pass, tampered nonce/app id/replayed counter/reused challenge fail with `ATTESTATION_FAILED`; `device_attestations` owner-less S table unreadable by `app_user`; mode cannot be changed by request input.
- Status: done — b66ec65. No real Apple/Google device fixtures exist yet (App Attest cannot run in the iOS Simulator; Play Integrity has no credentials), so `services/api/test/fixtures/attestation/` generates a locally-signed test root + attestation/assertion CBOR objects through the *same* verification code (`AppAttestConfig.rootCertificatePem` is injected) rather than recorded real-device captures — flagged as a founder follow-up once a physical device + Play Integrity credentials exist. `packages/db/test/permissions/_matrix.ts` (outside this phase's owns list, shared across phases) now fails its coverage check on `device_attestations`, a new `public`-schema RLS table with no entry there yet; everything else (293/294 in `@cp/db`) is green — needs a controller-side matrix update once every phase's new tables have landed. `apps/mobile/src/lib/attestation.ts` wraps `@expo/app-integrity` (Expo's first-party SDK 58 module, still alpha) with the native module boundary injected for testing (no native build in this lane).

### T4 — Phone OTP sender router
- Goal: WhatsApp first, SMS fallback, allow-listed countries.
- Files: `services/api/src/auth/otp/{router,whatsapp,twilio-verify,prelude,countries}.ts`, `services/api/src/routes/webhooks-whatsapp.ts`, `services/api/test/auth/otp.test.ts`, `services/api/test/routes/webhooks-whatsapp.test.ts`, `services/api/test/fixtures/otp/`.
- Steps: 1. `phoneNumber.sendOTP` → router: WhatsApp Cloud API authentication template (copy-code button) always tried first when the country allows WhatsApp (the Cloud API has no reachability lookup); else Twilio Verify or Prelude by country table; `POST /webhooks/whatsapp` verifies `X-Hub-Signature-256`, maps `failed`/undeliverable statuses by message id → verification `wa_failed` + `rt_outbox` `otp.channel_failed` on `user:#uid`; client offers "Send by SMS" on that event or after 20 s without verify; router records channel per verification. 2. Custom `verifyOTP`: local code for WhatsApp; provider check API for Verify/Prelude. 3. `verify({updatePhoneNumber:true})` on anonymous sessions; returning sign-in via `sign-in/phone-number`. 4. Write `user_private` enc + hash; uniqueness on `phone_hash` → conflict → `MERGE_REQUIRED`. 5. Android SMS Retriever hash in SMS body; "Send by SMS instead" retry forces SMS channel.
- Tests: `pnpm --filter @cp/api test -- auth/otp` (provider HTTP recorded fixtures only)
- Done when: VN/SG/ID numbers route per table; blocked country → `VALIDATION` with `detail.reason='country_unsupported'`; WhatsApp sync send error falls back to SMS; signed webhook `failed` status marks `wa_failed` and emits `otp.channel_failed`; unsigned/bad-signature webhook → 401; uid unchanged after verify.
- Status: done — 7241b2b (router/adapters/webhook source landed under T1's commit, since the phoneNumber plugin needs a working `sendOTP` to mount; this task's own commit is its test coverage). Scope notes: (1) all channels sign Better Auth's own generated code as each provider's documented `CustomCode`/`custom_code` parameter instead of a per-channel `verifyOTP` override, so every channel shares Better Auth's one built-in attempt/expiry pipeline rather than this task re-implementing it — satisfies every done-when line above without the two-code-per-attempt risk a naive per-provider `verifyOTP` split would add; (2) `user_private` enc+hash write and the `phone_hash` uniqueness → `MERGE_REQUIRED` conflict path need T10's `user_private` table and crypto envelope (not yet built) — not implemented here, left as a clean seam (Better Auth's own `auth.user.phone_number` UNIQUE constraint already throws `PHONE_NUMBER_EXIST` on a conflicting `verify({updatePhoneNumber:true})`, which is where that translation plugs in); (3) `sign-in/phone-number` (returning-user path) and the Android SMS Retriever hash are T8's mobile-client / returning-sign-in scope, not this task's router. `wa_failed` state + `otp.channel_failed` correlation are Redis-tracked (TTL-bounded), not a new Postgres column, since no `user_private`-adjacent table exists yet to hold it.

### T5 — Rate limits, SMS-pumping defences, code enumeration, bot filter
- Goal: F-029 controls as reusable modules.
- Files: `services/api/src/abuse/{rate-limits,pumping,code-attempts,bot-filter,metrics}.ts`, `services/api/test/abuse/{rate-limits,pumping,code-attempts,bot-filter}.test.ts`.
- Steps: 1. Better Auth custom rules (Requirements table) in Redis; IPv6 /64 keying. 2. Prefix velocity breaker + daily spend counters + WhatsApp-only failover + OTel metrics `otp_sent_total{country,channel}`, `otp_verify_ratio`. 3. Code attempts limiter with exponential lockout. 4. Bot-filter UA/IP lists (config-driven).
- Tests: `pnpm --filter @cp/api test -- abuse` (Redis Testcontainer)
- Done when: limits return `RATE_LIMITED` with `retry_after_s`; synthetic pumping burst on one prefix trips the breaker; enumeration of 50 codes from one IP locks out.
- Status: done — c6c2168. Better Auth's own rate limiter only ever keys by (ip, path) — verified against the installed 1.7.6 source, not documented — so it covers "10/h/IP" (customRules, services/api/src/auth/config.ts) while phone/device/uid dimensions are this task's own Redis counters, composed into one `hooks.before`/`hooks.after` pair with attestation (Better Auth's top-level `hooks` is a single function, not a plugin-style matcher array). Found and fixed a real bug while proving this over real HTTP: a thrown plain `DomainError` from a hook reached the client as a generic 500 regardless of its own status — now converted to `better-auth`'s own `APIError` (same wire body); the same fix closes the gap for T3's attestation gate too, which only had direct-function tests before this task. `code-attempts.ts`/`bot-filter.ts`/`metrics.ts` are standalone, tested, not yet consumed by anything in this phase (join/gift codes and invite-open counting are later phases); the spend-cap-triggers-WhatsApp-only behaviour is a reusable function, not forced into live adapter wiring, since no real provider costs are provisioned yet to calibrate a cap against.

### T6 — Social linking (Apple/Google ID tokens) and SIWA revocation
- Goal: uid-preserving upgrade + revocable Apple link.
- Files: `services/api/src/auth/social/{apple,google,revoke}.ts`, `services/api/src/routes/auth-extra.ts` (authorization-code route), `services/api/test/auth/link-social.test.ts`.
- Steps: 1. Providers configured for ID-token verification (Apple audience = bundle id; Google iOS + Android + web client ids); nonce check. 2. `linkSocial` on anonymous session flips `is_anonymous=false`, `users.status='registered'`. 3. Authorization-code exchange → encrypted refresh token; `revokeApple(uid)` + `revokeGoogle(uid)`. 4. Test with signed ID tokens from a local JWKS test issuer injected via provider config (network boundary double only).
- Tests: `pnpm --filter @cp/api test -- auth/link-social`
- Done when: uid identical before/after link for both providers; implicit linking by email disabled (second provider with same email does not auto-link); revoke calls Apple endpoint with stored token.
- Status: done — 6a2f320

### T7 — Merge ticket + merge execution + registry
- Goal: conflict path that never loses data silently.
- Files: `services/api/src/auth/merge/{ticket,execute}.ts`, `packages/db/src/merge-rules.ts`, `services/api/src/routes/auth-extra.ts` (merge routes), `services/api/test/auth/merge.test.ts`, `packages/db/test/merge-rules-coverage.test.ts`.
- Steps: 1. Ticket minted only by the failed link/verify handler that just proved the credential (stores `verification_id`, `existing_uid`, `anon_uid`, `anon_session_id`; signed, single-use, 10 min); preview route requires the ticket + the same anonymous session. 2. Execute in one `withSystem` tx applying registry rules; unique-conflict resolution (existing wins); delete anonymous auth user; revoke sessions + action keys; outbox disconnect; `auth.merged` event; mint a session for `existing_uid` in the same response. 3. Coverage test over `information_schema.columns` for user FK columns.
- Tests: `pnpm --filter @cp/api test -- auth/merge`; `pnpm --filter @cp/db test -- merge-rules`
- Done when: anon crews + existing crews both present after merge; existing profile fields kept; replaying ticket fails; partial failure rolls back fully; a ticket cannot be obtained without a just-verified credential (test: forged/other-session ticket and preview request without proof → 403, no preview data leaked); merge response carries a working session for the existing uid (test: authenticated call succeeds as `existing_uid`).
- Status: done — 836facf

### T8 — Returning-user sign-in and Expo auth client
- Goal: undesigned returning flow server side + mobile client layer.
- Files: `apps/mobile/src/data/auth/{client,session,link,otp,returning,merge,sign-out,sign-out-hooks,tokens}.ts`, `apps/mobile/src/data/auth/index.ts`, `apps/mobile/src/data/auth/__tests__/*.test.ts`, `services/api/test/auth/returning.test.ts`.
- Steps: 1. `@better-auth/expo` client with SecureStore. 2. Flow functions per Architecture table, each returning typed outcomes (`linked`, `merge_required{preview}`, `country_unsupported`, …) for phase 22 screens. 3. Returning logic: decide sign-in vs merge-ticket by local anonymous data presence. 4. Token fetchers with refresh-ahead (60 s). 5. Sign-out/merge clears SecureStore and runs `registerOnSignOut(fn)` hooks in order (phase 10 T4 registers PowerSync `disconnectAndClear`); tests use a spy hook.
- Tests: `pnpm --filter @cp/mobile test -- data/auth`; `pnpm --filter @cp/api test -- auth/returning`
- Done when: returning sign-in on a fresh install lands on the existing uid; an anonymous session with data triggers merge instead of data loss; typed outcomes exhaustively covered.

### T9 — Device action keys: storage, issuance helper, HMAC verification
- Goal: extension auth primitive.
- Files: `packages/db/src/schema/user-private.ts` (`device_action_keys`), `packages/db/migrations/<ts>_device_action_keys.sql`, `packages/domain/src/auth/action-key-scopes.ts`, `services/api/src/auth/action-keys/{issue,verify,revoke}.ts`, `services/api/test/auth/action-keys.test.ts`, `packages/db/test/permissions/device_action_keys.test.ts`.
- Steps: 1. Table (secret encrypted via `packages/db/src/crypto`). 2. `issueKey(uid, deviceId, scopes)` / rotate when <7 d. 3. Hono middleware verifying signature over `method\npath\nts\nsha256(body)`, ±300 s, constant-time compare, scope check → `ACTION_KEY_SCOPE`, `last_used_at`. 4. Revocation hooks on sign-out, merge, deletion, admin.
- Tests: `pnpm --filter @cp/api test -- action-keys`
- Done when: valid signature passes; body tamper, stale ts, revoked key, missing scope each rejected with the right code.

### T10 — Account state, session revocation fan-out, admin roles, field crypto
- Goal: close remaining identity plumbing.
- Files: `packages/db/src/crypto/{envelope,hmac}.ts`, `packages/db/src/schema/user-private.ts` (`user_private`, `account_deletions`, `install_attributions`), `packages/db/migrations/<ts>_user_private_and_account_state.sql`, `services/api/src/auth/{guards,admin}.ts`, `services/api/test/auth/{guards,admin}.test.ts`, `packages/db/test/permissions/{user_private,account_deletions,install_attributions,auth_schema}.test.ts`.
- Steps: 1. AES-256-GCM envelope with `key_id` + HMAC-SHA256 peppered hashes; key rotation re-encrypt fn. 2. Guards `requireSession`, `requireRegistered(reason)`, `rejectClosedAccount`. 3. Sign-out/revoke → outbox `session.revoked` + `disconnect`. 4. Admin roles + audit writes; impersonation off in prod. 5. `isAnonGcCandidate` rule fn.
- Tests: `pnpm --filter @cp/api test -- auth/guards|auth/admin`; `pnpm --filter @cp/db test -- permissions/(user_private|account_deletions)`
- Done when: C3 tables owner-only, unpublished, no `guide_reader` grant (asserted); closed account gets `ACCOUNT_CLOSED`; admin action writes audit row.

## Phase acceptance criteria
- [ ] Anonymous → Apple, Google, phone each keep the uid (integration tests).
- [ ] Conflict yields `MERGE_REQUIRED`; merge executes atomically; registry coverage test passes.
- [ ] Returning sign-in from a fresh install reaches the existing uid.
- [ ] JWTs verify via JWKS for `sync` and `rt`, survive rotation.
- [ ] Attestation enforced on anonymous sign-in and OTP send in prod/staging modes.
- [ ] OTP router: WhatsApp → SMS fallback; allow-list; pumping breaker; spend cap.
- [ ] Rate limits and code-enumeration limiter return `RATE_LIMITED`.
- [ ] Action keys: signature, time window, scope, revocation proven.
- [ ] C3 tables (`user_private`, `device_action_keys`) owner-only/system, unpublished, no `guide_reader`.
- [ ] `.env.example` only; no secrets committed.

## Risks & rollback
| Risk | Mitigation |
|---|---|
| `linkSocial` on anonymous session drops uid on Expo SDK 58 (S-AUTH) | spike in phase 2 gates this; fallback = merge path in one tx + `disconnectAndClear` |
| Better Auth advisories | pin 1.7.x; Renovate + 48 h patch SLA; minimal plugins |
| SMS pumping cost | allow-list + breaker + spend hard cap → WhatsApp-only mode |
| Attestation false negatives (old devices) | per-reason metrics; `log` fallback toggle per platform via ops_config (server-side only) |
| Merge edge cases (duplicate critters) | registry rules per table with tests; existing wins |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Apple Developer: Sign in with Apple service id, App Attest capability | anonymous + phone only; Apple button hidden by server config `auth.providers` |
| Google Cloud: OAuth client ids, Play Integrity API | Google button hidden; Android attestation `log` mode in staging only |
| WhatsApp Business account + approved auth template; Twilio Verify / Prelude accounts; Vietnam brandname registration | router skips unavailable channels; VN falls back to Verify international route |
| Legal entity (D18) for provider contracts | staging uses test credentials |

## Open questions
| Q | Default implemented |
|---|---|
| Doc delta: `device_action_keys` assigned to phase 11 (sync doc §7, async §5) | table + issue/verify/revoke lib here (sole owner); phase 11 adds only the `devices` FK expand migration, `/v1/devices/{id}/action-keys` routes, `/v1/actions`, Swift signer — update §7 |
| Doc delta: `POST /v1/attest/challenge`, `POST /webhooks/whatsapp`, `device_attestations`, `otp.channel_failed` | implemented as listed; add to api-contracts §5.1, data-model §3.1, async §1 |
| Doc delta: add `POST /api/auth/sign-in/phone-number` and `GET /api/auth/token?aud=` details to api-contracts §5.1 | implemented as listed |
| Is 3a-7 skippable (onboarding UQ 1)? | yes: sheet dismissible; gates at purchase / invite send / second device (Q-10) |
| Phone plaintext in `auth.user` | isolated schema, no grants, encrypted copy in `user_private`, redacted logs |
| OTP provider per country | WhatsApp first everywhere allowed; SMS: Prelude for SEA, Twilio Verify elsewhere (config table) |
