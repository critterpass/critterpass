# APNs broadcast Live Activity, push-to-start, device action keys, NSE/NCE

Date: 2026-09-27
Status: PASS on the device-action-key HMAC contract (server + real cross-language signature
parity). INCOMPLETE on every step that needs Apple's live APNs service or a physical device — no
`.p8` auth key and no iPhone exist in this environment, exactly as scoped. Phase not done until
the founder fills those in.

## Context

D3/D4 need: an APNs broadcast channel per Live Activity, push-to-start, a device-action-key HMAC
path from a Live Activity's "I'M UP" button back to the api, and NSE/NCE extensions that mutate a
notification while the device is locked and the app is killed (api-contracts-async.md §3.1–§3.2,
§4–§5). This environment has **no APNs `.p8` key** (only a founder-generated APNs *certificate*,
git-ignored, explicitly out of scope) and **no physical iPhone** — the environment brief names
both as known, expected gaps for this task, not something to route around with fake evidence.

## Criteria (phase-02 §Requirements, "Push LA" + "NSE/NCE")

| # | Criterion | Result |
|---|---|---|
| 1 | `@parse/node-apn`: create/delete a broadcast channel | **SKIPPED — no `.p8` key** (harness code real and typed against the installed library; not exercised against Apple) |
| 2 | Update a Live Activity for N devices via one channel push | **SKIPPED — no `.p8` key** |
| 3 | Push-to-start (alert + `input-push-channel`) | **SKIPPED — no `.p8` key** |
| 4 | `LiveActivityIntent` "I'M UP" → `POST /v1/actions` with device action key (HMAC) → harness logs | **PASS** — real HTTP call, real HMAC verification, real rejection of a tampered body |
| 5 | FCM v1 data message to Android dev client | **SKIPPED — no Firebase service account** |
| 6 | NSE downloads a signed avatar, sets a communication notification | PASS on build/embed (shared with the apple-targets ADR); **INCOMPLETE on runtime delivery** — see Findings |
| 7 | NCE poster with a vote action works locked/killed | PASS on build/embed; **INCOMPLETE on runtime delivery/interaction** — see Findings |

## Method

- `tools/spikes/src/apns-live-activity/` (inside the existing `@cp/spikes` package, alongside
  `s-db`/`s-auth`/`s-rt` — this repo's own precedent for how the earlier spikes' harnesses are
  organized, `tools/spikes/src/<slug>/` under one package rather than a `@cp/spike-<slug>` package
  per slug as the phase file's illustrative text suggested):
  - `hmac.ts`: `sign`/`verify` implementing api-contracts-async.md §5 exactly
    (`HMAC-SHA256(secret, method \n path \n ts \n sha256(body))`, base64url, ±300 s window).
  - `actions-server.ts`: a Hono app standing in for the real api's `POST /v1/actions` — the
    network-boundary test double code-standards.md §17 explicitly allows (APNs/FCM/the api
    itself), not a fake success path.
  - `apns-client.ts` / `fcm-client.ts`: real `@parse/node-apn` (8.1.0) / `firebase-admin`
    (14.5.0) wrappers, typed against each library's actual installed API
    (`Provider.manageChannels(notification, bundleId, 'create'|'delete')`,
    `Provider.broadcast(notification, bundleId)`, `pushType: 'liveactivity'`), added to
    `pnpm-workspace.yaml`'s catalog since neither existed there yet. Every exported function
    requires real `ApnsCredentials`/a real service-account path — there is no code path that
    returns a fabricated success when credentials are absent; callers must check
    `credentialsFromEnv()`/`hasFcmCredentials()` first and record `SKIPPED`.
  - `run.ts` (`pnpm --filter @cp/spikes run apns-live-activity`): starts the actions-server on an
    ephemeral port, signs and posts a real HTTP request with `hmac.ts`, posts a tampered body to
    confirm rejection, then attempts the APNs and FCM lifecycles, printing `PASS`/`FAIL`/`SKIPPED`
    per step with the reason.
  - `hmac.test.ts`, `actions-server.test.ts`: unit/integration tests (`pnpm --filter @cp/spikes
    test`).
- **Cross-language signature parity**, to prove the exact mechanism `_shared/ActionsClient.swift`
  (used by T7's `ImUpIntent` and the NCE vote handler) and this harness's verifier agree on the
  same wire format, not just that each side's own tests pass in isolation:
  `tools/spikes/apns-live-activity/print-test-vector-signature.swift` duplicates the Swift
  signing algorithm (a command-line `swift` script cannot import the compiled Xcode target) and
  is invoked from `hmac.test.ts` — one test asserts against a captured expected value (works
  without `swift` on PATH, e.g. in CI), a second actually re-invokes `swift` on this machine and
  asserts it reproduces the same output.
- NSE/NCE runtime: attempted `xcrun simctl push <udid> app.critterpass.dev <payload.json>` with a
  realistic `cp.leaveby`/`cp.vote`-shaped payload (`mutable-content: 1`, `category`, `cp.ctx`)
  against the T7 build, both with the app foregrounded and backgrounded — see Findings for the
  real (not assumed) outcome.

## Raw numbers

```
$ pnpm --filter @cp/spikes run apns-live-activity
[PASS] device-action-key: signed request accepted — {"command":"set_readiness","scope":"readiness","payload":{"up":"true"}}
[PASS] device-action-key: tampered body rejected — status 401
[SKIPPED] apns: broadcast channel + push-to-start + update + end + delete — no .p8 key configured (APNS_KEY_PATH/APNS_KEY_ID/APNS_TEAM_ID)
[SKIPPED] fcm: data message to Android dev client — no GOOGLE_APPLICATION_CREDENTIALS configured

4 steps: 2 PASS, 0 FAIL, 2 SKIPPED
```

```
$ pnpm --filter @cp/spikes test -- src/apns-live-activity
✓ src/apns-live-activity/actions-server.test.ts (4 tests)
✓ src/apns-live-activity/hmac.test.ts (6 tests)
  ✓ Swift/TypeScript signature parity (2)
    ✓ regenerates the same signature by actually invoking swift on this machine  789ms
```

`xcrun simctl push` with the app foregrounded delivered without a visible banner (expected — iOS
does not banner a foregrounded app by default); with the app terminated first, the same push
returned:

```
(domain=UNErrorDomain, code=2003): Repository could not save notification. Source is not authorized.
```

## Findings

1. **The device-action-key HMAC contract works end to end and matches across languages.** This
   is the one criterion in this ADR that needed no external account to prove for real, and it
   is proven for real: a Swift-signed request is byte-for-byte identical to what the
   TypeScript verifier computes for the same inputs, and the harness server accepts a correctly
   signed envelope while rejecting a tampered one with `401`. Phase 11, which owns the real
   `device_action_keys` table and `/v1/actions` route, can adopt `hmac.ts`'s algorithm and
   `_shared/ActionsClient.swift`'s Swift side directly.
2. **`xcrun simctl push` cannot deliver a notification to an app that has never been granted
   `UNUserNotificationCenter` authorization**, and `xcrun simctl privacy <udid> grant notifications
   <bundle-id>` cannot grant it either (`Operation not permitted — Failed to create TCC
   authorization record`; notification permission is not one of `simctl privacy`'s TCC services).
   This spike's minimal dev-client app has never called `requestAuthorization` — that only exists
   once `expo-notifications` (or equivalent) is wired up, which is phase 11's job, not this one's.
   **This means NSE/NCE runtime invocation could not be verified by CLI automation in this pass**,
   independent of the missing `.p8`/device gaps: build/embed/entitlements are proven (shared
   evidence with the apple-targets ADR), but nothing beyond that. Whoever adds notification
   permission handling should re-run this exact `simctl push` test as a cheap regression check
   before relying on device-only verification for NSE/NCE.
3. **Every APNs/FCM call in `apns-client.ts`/`fcm-client.ts` requires its credentials be supplied
   explicitly** (`credentialsFromEnv`, `hasFcmCredentials`) rather than falling back to a default
   or a mock — this was a deliberate design choice so that "SKIPPED" can never be silently
   confused with "PASS" by a future reader of the harness output, matching the project rule
   against faking evidence.
4. `@parse/node-apn`'s `manageChannels(notification, bundleId, action)` needs a `Notification`
   instance even for `'create'` (which mints a *new* channel id — there is nothing to identify
   yet); the response's `apns-channel-id` field is where the new id comes back. `'delete'` needs
   `notification.channelId` set instead. Recorded here since it's easy to get backwards and
   nothing in this pass could exercise it against a live server to catch that class of mistake.

## Verdict

**PASS** on the one criterion fully within this environment's reach (device action key HMAC,
including real cross-language parity) and on NSE/NCE build/signing (shared with the apple-targets
ADR). **INCOMPLETE** on every criterion that needs Apple's live APNs service, a real Firebase
project, or a physical device — consistent with, not a surprise relative to, the environment
brief's own statement that these could not be gathered here. No criterion **FAILED**; nothing
was skipped without a machine-checkable reason printed alongside it.

## Chosen path

Ship `@parse/node-apn` + `firebase-admin` as designed (D3/D4's chosen libraries) — nothing here
found a reason to fall back to "per-activity tokens for LA updates" or any other fallback. The
harness (`tools/spikes/src/apns-live-activity/`, `tools/spikes/apns-live-activity/`) is the
rerunnable proof once credentials exist; no code changes are anticipated to be needed for the
credentialed path, since the guard clauses are the only thing standing between "SKIPPED" and a
real Apple/Firebase call.

## Founder follow-ups

- **APNs `.p8` auth key** (Apple Developer portal → Keys, "Apple Push Notifications service
  (APNs)" enabled) for team `YFND2EEW8S`, plus its Key ID. The existing APNs *certificate* in
  this repo is explicitly not usable for `@parse/node-apn`'s token-based auth. Once available,
  set `APNS_KEY_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID` (and `APNS_PRODUCTION=true` once out of
  sandbox) and rerun `pnpm --filter @cp/spikes run apns-live-activity` to fill in criteria 1–3.
- **Firebase service account JSON** for the project already set up for Android; set
  `GOOGLE_APPLICATION_CREDENTIALS` and `FCM_TEST_DEVICE_TOKEN` (a real Android dev-client
  install's token) and rerun the same script for criterion 5.
- **Physical iPhone**: install the T7 signed build (needs the apple-targets ADR's Xcode
  account/team fix first), wire up notification permission (phase 11) or a minimal ad hoc
  `requestAuthorization` call just for this spike, then trigger a push-to-start Live Activity and
  a `cp.vote`/`cp.leaveby` push with the device locked and the app killed; screenshot the Dynamic
  Island/lock screen and the NCE poster for this ADR.

## Rerun

```
pnpm --filter @cp/spikes test -- src/apns-live-activity
pnpm --filter @cp/spikes run apns-live-activity
swift tools/spikes/apns-live-activity/print-test-vector-signature.swift
```
