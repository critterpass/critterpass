# S-AUTH: Better Auth 1.7 anonymous upgrade and merge (server + device)

Date: 2026-09-27
Status: PASS (server half, T2). Device half (T3): PASS on anonymous → phone (real, on-device,
uid-preserving); Apple/Google idToken verification is wired and real on the server but has no
account to drive a genuine sign-in from — founder checklist below.

## Context

D4/D14 require: an anonymous-first session that later signs in with a real identity keeps its
uid, and — when that identity already belongs to another account — the two rows merge onto
the pre-existing account in one transaction ("merge ticket", system-architecture.md §11).
`tools/spikes/src/s-auth/` builds a minimal Better Auth 1.7.6 instance (anonymous,
phoneNumber, jwt, genericOAuth plugins) against a throwaway Testcontainers Postgres and drives
it exactly as a real client would, over HTTP.

## Criteria (phase-02 §Requirements, S-AUTH)

| # | Criterion | Result |
|---|---|---|
| 1 | anon → `phoneNumber.verify({updatePhoneNumber:true})` keeps uid, sets `isAnonymous=false` | PASS |
| 2 | anon → `linkSocial(idToken)` with a fresh identity keeps uid, sets `isAnonymous=false` | PASS |
| 3 | anon → identity already on another user → `onLinkAccount` merges in one tx | PASS |
| 4 | Merge atomicity: a forced failure mid-transaction rolls back the ownership change | PASS |
| 5 | JWT (EdDSA) verified via JWKS URL only (what PowerSync/Centrifugo do), rotation keeps old tokens valid | PASS |

## Method

- Harness: `tools/spikes/src/s-auth/harness.ts` — `betterAuth()` over a real `pg.Pool`
  (Testcontainers), schema created from `getAuthTables(options)` (see "Findings" — no
  supported way to run Better Auth's own migrator against an arbitrary connection).
  `tools/spikes/src/s-auth/serve.ts` mounts it on a real HTTP listener (127.0.0.1, ephemeral
  port) — JWKS verification has to happen over the network to be a fair test.
- Identity: `tools/spikes/src/s-auth/mock-idp.ts` is a tiny real OIDC provider (EdDSA-signed
  ID tokens, a real discovery document and JWKS) registered as a `genericOAuth` provider,
  which Better Auth treats as a first-class social provider driven through the same
  `/link-social` and `/sign-in/social` endpoints Apple/Google would use. This is a test double
  at the external-IdP network boundary only (code-standards.md §17); native Apple/Google
  ID-token verification is T3's device-side spike.
- Phone OTP: `phoneNumber.sendOTP` is a no-op; the code is read back via a
  `databaseHooks.verification.create.after` hook (the same row a real Twilio Verify `sendOTP`
  call would read from). No Twilio Verify test account is provisioned yet — see Founder
  follow-ups.
- Tests: `tools/spikes/src/s-auth/upgrade.db.test.ts` (criteria 1–2),
  `merge.db.test.ts` (3–4), `jwks.db.test.ts` (5). Run: `pnpm --filter @cp/spikes run test:db`.

## Findings (apply to the real auth build, phase 9 — not spike-only workarounds)

1. **`linkSocial`/`phoneNumber.verify(updatePhoneNumber)` keep the uid because they attach the
   identity directly to the current session's user** (`createAccount({userId: session.user.id,
   ...})`); no ambiguity, no merge. **`signIn.social` (not link) resolves by email match** and
   can land on a *different* pre-existing user — that is the merge path, not a bug.
2. **`onLinkAccount` fires on every anonymous-session sign-in-shaped transition**, not only
   conflicts (its matcher covers `/sign-in/*`, `/sign-up/*`, `/callback/*`,
   `/phone-number/verify`, …). The hook must compare `anonymousUser.user.id` to
   `newUser.user.id` itself to tell a merge apart from a same-user upgrade.
3. **`account.accountLinking.allowDifferentEmails: true` is required** for `/link-social` to
   work from an anonymous session at all: anonymous users carry a placeholder email
   (`temp-<id>@anonymous.placeholder.invalid`), which never matches a real identity's email,
   and `/link-social` otherwise rejects with `LINKING_DIFFERENT_EMAILS_NOT_ALLOWED`.
4. **Neither path flips `isAnonymous`.** Production needs a `databaseHooks.account.create.after`
   hook (checks the linked user's `isAnonymous`, clears it) and the phone plugin's
   `callbackOnVerification` doing the same. One hook per identity mechanism.
5. **A mutation's response body can be stale.** `phoneNumber.verify`'s JSON reflects the user
   row *before* `callbackOnVerification` runs, so its `isAnonymous` is one step behind; a
   client must trust a follow-up `/get-session`, not the verify response, for that field.
6. **JWKS key rotation** (`jwks.rotationInterval` + `gracePeriod`) works as documented: once a
   key ages past `rotationInterval`, the next `resolveSigningKey` call mints a new one and
   signs with it, while `/jwks` keeps serving the old key (and therefore verifying old tokens)
   until `gracePeriod` elapses. Confirmed independently with `jose`'s `createRemoteJWKSet`
   against the real `/jwks` HTTP endpoint (not an in-process shortcut).
7. **There is no supported way to run Better Auth's own migration engine against an arbitrary
   already-running Postgres connection.** `better-auth/test`'s `getTestInstance` only targets a
   hardcoded local database regardless of what `database` option is passed, and the CLI that
   drives real migrations (`@better-auth/cli@1.4.21`) lags the installed core (`better-auth
   1.7.6`) by several minors. `tools/spikes/src/s-auth/schema.ts` instead calls the *public*
   `getAuthTables(options)` (the same schema-merge function the CLI itself calls) and generates
   `create table` DDL from it — correct today, but re-verify against whatever migration path
   phase 9 actually ships with, since this bypasses Better Auth's own migrator entirely.

## Verdict

**PASS.** All five server-side criteria hold. Fallback (merge tx + PowerSync
`disconnectAndClear`) is not needed.

## Chosen path

Ship Better Auth 1.7 with `anonymous`, `phoneNumber`, `jwt`, and (for Apple/Google in
production) the built-in social providers — not `genericOAuth`, which stands in for them only
in this spike. Carry findings 1–6 into phase 9's real config verbatim.

## Founder follow-ups (server half)

- **Twilio Verify test account** (phase-02 non-code dependency) not yet provisioned; the phone
  path here is verified against Better Auth's own OTP storage only, not a real WhatsApp/SMS
  send. Gap tracked, not blocking this ADR's verdict.

## Rerun (server half)

```
pnpm --filter @cp/spikes run test:db
```

---

# Device half (T3): native sign-in on Expo SDK 58

## Context

T3 proves the same anonymous-upgrade contract from a real Expo SDK 58 app against a real,
persistently deployed Better Auth server — not the ephemeral Testcontainers harness above.
`tools/spikes/src/s-auth/deploy-*.ts` builds a second, real (not mock-IdP) Better Auth config —
anonymous, phoneNumber, jwt, the built-in `apple` social provider, `@better-auth/expo`'s server
plugin — deployed to Railway staging as `spike-auth`
(`https://spike-auth-staging.up.railway.app`, kept running for the founder device run).
`apps/mobile/src/app/(dev)/spikes/auth.tsx` drives it with `@better-auth/expo`'s real client,
`expo-apple-authentication`, and `@react-native-google-signin/google-signin`.

## Criteria (phase-02 §Requirements, S-AUTH — device half)

| # | Criterion | Result |
|---|---|---|
| 1 | anon → `phoneNumber.verify` on-device keeps uid, sets `isAnonymous=false` | **PASS** — real device run |
| 2 | anon → Apple idToken keeps uid, sets `isAnonymous=false` | Server path real and wired (§Method); no Apple ID on this simulator to drive a genuine sign-in — **founder checklist** |
| 3 | anon → Google idToken keeps uid, sets `isAnonymous=false` | Blocked: no Firebase/Google Cloud project provisioned (recorded account gap) — **founder checklist / FAIL until provisioned** |
| 4 | JWT (EdDSA) verified via JWKS URL, PowerSync/Centrifugo compatible | PASS — same `jwt` plugin as the server half, `/api/auth/jwks` live and real |
| 5 | SIWA revoke endpoint behaviour recorded | Documented from source/Apple docs only — see Findings 6; no real revoke exercised |

## Method

- **Deploy**: `tools/spikes/s-auth-app.Dockerfile` + `tools/spikes/src/s-auth/deploy-main.ts`,
  a persistent Railway service (`spike-auth`, Southeast Asia region, same project as every other
  spike), connected to the **direct** PlanetScale port (`DATABASE_DIRECT_URL`, 5432) — see
  Finding 1 for why not the pooled `:6432` this deploy originally (wrongly) used. Tables live in
  their own `spike_auth` Postgres schema so they never collide with S-SYNC's own Better Auth
  instance on the same shared staging database.
- **Real Apple provider, not a mock**: `socialProviders.apple` in
  `tools/spikes/src/s-auth/deploy-app.ts`, reading `@better-auth/core`'s actual
  `social-providers/apple.ts` source directly (not assumed) to confirm the native idToken
  verification path needs only `clientId`/`appBundleIdentifier` — no `.p8` Sign in with Apple key,
  which this environment does not have (recorded in the Apple-targets ADR). A `.p8` key is needed
  only for the redirect/authorization-code exchange this native flow never takes.
- **Real Expo integration**: `@better-auth/expo`'s server `expo()` plugin +
  `trustedOrigins: ['critterpass-dev://', …]` — Better Auth otherwise 403s every native request
  with `INVALID_ORIGIN`/`MISSING_OR_NULL_ORIGIN` (a real repro against this exact deploy, not a
  guess — see Finding 2). Client side: `expoClient({scheme, storage: SecureStore})` +
  `anonymousClient()` + `phoneNumberClient()`.
- **Phone OTP without Twilio**: same technique as the server half — `/internal/spike/otp` is a
  spike-only debug endpoint (never shipped) that returns the code the server's own
  `databaseHooks.verification.create.after` hook captured, letting the on-device Maestro flow
  complete a real phone-verify round trip with no SMS provider.
- **Real device evidence**: iPhone 17 / iOS 27.0 simulator, `apps/mobile/src/app/(dev)/spikes/
  auth.tsx`, driven both manually (screenshots below) and via `e2e/spikes/auth-anonymous.yaml`
  (Maestro) — anonymous sign-in → send code → verify, asserting `isAnonymous: false` and
  `uid before last action: <id> (unchanged)` are visible on-screen.
- **New native modules**: `@maplibre/maplibre-react-native`, `expo-apple-authentication`,
  `@react-native-google-signin/google-signin`, `expo-secure-store`, `expo-network` — each added a
  real Xcode/CocoaPods native rebuild pass (`expo run:ios`), all succeeding under SDK 58 / Xcode
  27 / UIScene alongside T7–T12's existing native modules.

## Raw evidence

- Real anonymous sign-in via curl: `uid: M2ViGb0mIinnklt9XT9DAes6jXf2BNMh`, `isAnonymous: true`.
- Real phone verify (same uid) via curl, `get-session` immediately after:
  `isAnonymous: false`, `phoneNumber: "+15550001234"`.
- Real on-device run (screenshots, `e2e/spikes/auth-anonymous.yaml`'s captures): anonymous sign-in
  shows `uid: 0ehOYfjUB7PcDMYBjRTWSK7NALDVPBuy`; after phone verify the same screen shows
  `isAnonymous: false`, `phoneNumber: +15555849947`, `uid before last action: <same id>
  (unchanged)`.
- `/api/auth/jwks` returns a real EdDSA key (`"alg":"EdDSA","crv":"Ed25519",…`) from the live
  deploy.

## Findings (apply to the real auth build, phase 9 — not spike-only workarounds)

1. **A session-level `SET search_path` through PgBouncer transaction pooling leaks onto other
   clients' connections.** The first version of `deploy-main.ts` ran `SET search_path to
   spike_auth, public` on every pooled connection (`:6432`) to keep this spike's Better Auth
   tables out of the shared `public` schema. PgBouncer's transaction pooling mode hands the same
   backend session to a *different* client on the next transaction — this override reached a real
   migration running elsewhere on staging and put PostGIS in the wrong schema. **Fixed**: connect
   on the **direct** port (`DATABASE_DIRECT_URL`, 5432, not pooled) and set `search_path` via the
   `pg.Pool`'s `options: '-c search_path=…'` startup parameter instead of a runtime `SET` —
   safe specifically because a direct-port connection is never shared with another client. Any
   phase-9 code that needs a non-default `search_path` must follow the same rule: never issue a
   session-level `SET` through a pooled connection.
2. **`@better-auth/expo` requires `trustedOrigins` (and the server `expo()` plugin) or every
   native request 403s.** Confirmed by reproducing both failure codes directly against this
   deploy: `MISSING_OR_NULL_ORIGIN` with no `Origin` header, `INVALID_ORIGIN` with an untrusted
   one. The app's own scheme(s) must be listed explicitly server-side.
3. **A fixed test phone number silently produces a false negative across repeated runs.** Reusing
   the same hardcoded number across many anonymous sessions on one device made later
   `isAnonymous`/`phoneNumber` reads look permanently stale — not a caching bug (ruled out: a
   matching plain-curl sequence with a *fresh* anonymous account and the same number updated
   correctly every time). The real cause was the number already being claimed by an earlier
   anonymous account created during previous testing on this same device. **Fixed** in
   `auth.tsx`: the spike derives its test phone number from the current session's own uid
   (`testPhoneNumberFor`), so repeated runs never collide with each other again.
4. **`expo-secure-store`'s backing Keychain data survived a full app uninstall + reinstall** on
   this iOS Simulator — the same anonymous session (and later its phone-verified state) was
   restored automatically after `simctl uninstall` + reinstall, with no sign-out step. Real,
   reproduced twice. Worth a deliberate decision in phase 9: is "still logged in after
   reinstall" desired? If not, the real app needs an explicit Keychain-clear on first launch
   after a fresh install (a `hasLaunchedBefore` flag), which `expo-secure-store` does not do
   automatically.
5. **`@better-auth/expo`'s client needs `expo-network` and `expo-secure-store` as real installed
   dependencies**, not just `expo-apple-authentication`/`@react-native-google-signin/google-
   signin` for the two providers — `getSession()` failed outright with `Cannot find module
   'expo-network'` until it was added. Neither is documented as a required peer in the package's
   own README; discovered only by running the real client on-device.
6. **SIWA server-to-server revoke notifications need a `.p8` key this environment does not have**
   (from Apple's own docs, not exercised here): Apple posts a signed JWT to a registered webhook
   when a user revokes access from Settings → Apple ID → Sign in with Apple, and verifying that
   webhook's signature requires the same private key the redirect/token-exchange flow needs —
   which Finding 3 of the server-half ADR and the Apple-targets ADR already record as missing.
   `expo-apple-authentication`'s on-device `addRevokeListener` is wired in `auth.tsx` and would
   fire for a *local* OS-level revoke signal, but the server-side webhook half cannot be tested
   without that key.

## Verdict

**PASS** on the criterion this environment can actually drive end to end: anonymous → phone
verify, uid-preserving, on a real device against a real deployed server, with a real Maestro
regression test (`e2e/spikes/auth-anonymous.yaml`). Apple's idToken verification path is real and
deployed but unexercised (no Apple ID signed into this simulator); Google is blocked entirely on
the missing Firebase/Google Cloud project. Neither is a code gap — both are founder-checklist
account provisioning, per T3's own "Done when (agent)" scope.

## Chosen path

Keep `spike-auth` running on Railway staging (direct-port connection, per Finding 1) for the
founder's real-device Apple/Google run. No fallback needed for the phone path. Google needs a
Firebase/Google Cloud project before it can be attempted at all.

## Founder follow-ups (device half)

- **Real Apple Sign In**: sign an Apple ID into this (or a fresh) iOS Simulator / a real iPhone,
  run `apps/mobile/src/app/(dev)/spikes/auth.tsx`'s "Upgrade: Sign in with Apple" button, screenshot
  the uid before/after into this ADR.
- **Real Google Sign In**: provision a Firebase/Google Cloud project (an already-recorded account
  gap), add the resulting iOS/Android OAuth client ids to `apps/mobile/app.config.ts`'s
  `@react-native-google-signin/google-signin` plugin entry (skipped entirely this pass — no real
  client id to put there), then repeat the same screenshot pair.
- **SIWA revoke webhook**: once a `.p8` Sign in with Apple key exists, wire and test the real
  server-to-server revoke notification per Finding 6.
- **Twilio Verify**: same gap the server-half ADR already records — the phone path here is real
  end to end except for the actual SMS send.

### Founder device run

| Provider | Device | uid before | uid after | isAnonymous after | Notes |
|---|---|---|---|---|---|
| Apple | | | | | |
| Google | | | | | |

## Rerun (device half)

```
railway up --service spike-auth --detach --ci   # redeploy tools/spikes/s-auth-app.Dockerfile
maestro test e2e/spikes/auth-anonymous.yaml
```
