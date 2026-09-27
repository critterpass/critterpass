# S-AUTH (server half): Better Auth 1.7 anonymous upgrade and merge

Date: 2026-09-27
Status: PASS (server half). Device half (native Apple/Google tokens, real Twilio Verify) is
T3, a separate mobile-track agent; this ADR covers only what a server-only harness can prove.

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

## Founder follow-ups

- **Twilio Verify test account** (phase-02 non-code dependency) not yet provisioned; the phone
  path here is verified against Better Auth's own OTP storage only, not a real WhatsApp/SMS
  send. Gap tracked, not blocking this ADR's verdict.
- **Native Apple/Google ID-token verification** is out of scope here by design — T3 (mobile
  agent, separate branch) covers it on-device.

## Rerun

```
pnpm --filter @cp/spikes run test:db
```
