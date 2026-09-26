---
phase: 21
title: Link resolver, deep-link router, deferred deep links
status: pending
depends_on: [1, 10]
wave: 5
features: [F-018, F-044]
screens: [3a-1, 3a-10, 3a-11, Site-Invite, web link routes]
effort: 9 sessions
owns:
  - packages/domain/src/links/
  - packages/db/src/schema/links.ts
  - packages/db/migrations/<ts>_join_codes_and_install_claims.sql
  - packages/db/test/permissions/{join_codes,install_attributions_claims}.test.ts
  - services/api/src/links/
  - services/api/src/routes/links.ts
  - services/api/src/commands/attribution/
  - services/api/test/links/
  - apps/web/public/.well-known/
  - apps/web/src/pages/.well-known/
  - apps/web/src/lib/links/
  - apps/web/src/components/link-handoff/
  - apps/web/src/pages/{i,j,p,r,g,plan,locals,app}/
  - apps/web/tests/links/
  - apps/mobile/modules/cp-deferred-link/
  - apps/mobile/plugins/with-links.ts
  - apps/mobile/src/lib/links/
  - apps/mobile/src/app/+native-intent.tsx
  - apps/mobile/targets/app-clip/
  - e2e/links/
---
# Phase 21 — Link resolver, deep-link router, deferred deep links

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D15, D16, D20; Q-14, Q-15, Q-19, Q-47, Q-99 |
| `docs/system-architecture.md` | §2 topology (web Worker, api), §4.1 commands, §4.8 extensions (custom scheme), §14 domains |
| `docs/api-contracts.md` | §4.1 `claim_attribution`, §5.6 links routes, §3 error codes |
| `docs/data-model.md` | §3.1 `install_attributions`, §3.2 `join_codes` |
| `docs/code-standards.md` | web rules, security (HMAC, rate limits), testing (Playwright) |
| Reports | `researcher-260926-1143-web-links-ops-report.md` rows 5–6, §deferred flow (lines ~197–245), risks table; `fact-check-260926-1143-web-links-ops-report.md` claims 10–16 and notes 1, 4, 7; `design-analysis-260926-1143-web-store-social-report.md` §2 link namespace table, AASA components; `design-analysis-260926-1143-onboarding-home-report.md` §3a-1, §3a-10, §3a-11; master §2 F-018/F-044, §6.1 rows "Deferred link / paste", "Universal / App Links, App Clip", §11.1 R12 |
| Renders | `docs/design-renders/screens/3a-10_Invite_a_seat_for_you.png`, `3a-11_Join_with_a_code.png`, `3a-1_Splash.png`; `docs/design-renders/pages/` Site-Invite |

## Overview

Goal: first-party links that open the app wherever possible and survive install: Universal Links + App Links on `critterpass.app` and `go.critterpass.app`, one link grammar shared by web/app/api, a server resolver with bot-filtered previews, an in-app deep-link router, and a first-launch deferred resolver (Play Install Referrer, iOS `detectPatterns` + paste control, 6-char code).

Done when: tapping any link route opens the right app screen on both OSes when installed (and the web handoff page otherwise); a fresh Android install from a referrer URL and a fresh iOS install after a web CTA copy both land on the target without typing; codes resolve through the same pipeline; Playwright validates AASA/assetlinks; attribution rows record `via`.

## Requirements

### F-018 Link resolver + deep-link router

| Aspect | Behaviour |
|---|---|
| Namespace | `/i/{code}[/{seat}]` (crew/trip/referral code, optional seat token), `/j/{code}` (alias), `/p/{token}` (shared plan), `/r/{code}` (referral), `/plan/{id}` (member plan deep link), `/g/{guide}` , `/locals/{slug}`, `/app/{path}` (generic app route). Excluded from UL: `/`, `/tips*`, `/legal*`, `/help*`, `/account*` |
| Hosts | `critterpass.app` + `go.critterpass.app` (each serves own AASA; manifest declares both hosts statically; Android 15+ `dynamic_app_link_components` only narrows) |
| Web handoff page | Minimal SSR page per route: public-safe preview (from resolver), "Open in app" explicit button (link to `go.` host so same-domain taps still fire UL), store buttons, code shown large, CTA copies the link to clipboard before store redirect, Android Chrome `intent://…;package=…;S.browser_fallback_url=…`, Smart App Banner. Phase 51 restyles landing content; the handoff component stays here |
| In-app browser escape | UA detection (Instagram, TikTok, Facebook, Messenger, LINE, WhatsApp webview, X): show "Open in your browser" instruction overlay + copy link; Android: intent to Chrome |
| App router | Parse → route mapping into expo-router; gating: onboarding not done → store pending link, resume after pass issued; already a member → crew Home; expired/revoked/full → state screens (owned by consumer phases, router passes state); custom scheme `critterpass://` for notifications/widgets/extensions |
| Preview | `GET /v1/links/{token}/preview` public subset `{kind, crew_name, inviter_first_name, trip_place?, members_count, expires_at, state}`; bot filter (UA + no-JS HEAD + known preview fetchers: WhatsApp, iMessage, Slack, Telegram) so link unfurls never count as opens; first human open emits `invite.opened` |
| Target registry | resolver dispatches by `kind` to providers registered by consumer phases (invite/code → P23, plan → P29/P52, referral → P23, guide/locals → P30/P51) |

### F-044 Deferred deep linking

| Aspect | Behaviour |
|---|---|
| Android | Web CTA → Play URL with `referrer=cp_link%3D{url-encoded path}`; first launch reads Install Referrer 2.2 once; deterministic |
| iOS | First launch: `UIPasteboard.detectPatterns([.probableWebURL])` (no alert); if likely → splash shows 3a-11 "Paste a link" as `ClipboardPasteButton` (UIPasteControl, no alert); pasted URL validated host/path/HMAC. Never reads the pasteboard silently |
| Code fallback | 6-char code visible on web page and 3a-11; Crockford base32 minus ambiguous glyphs (Q-15); lookup via resolver |
| Phone-hash match | Hook point `claim_attribution{via: phone}` runs after phone verification: if a pending seat invite carries the same HMAC phone hash, offer it (matching logic registered by P23) |
| Claim | `POST /v1/links/claim` → `claim_attribution` (idempotent per device); stores `install_attributions{device_id, channel, source, invite_id?, join_code?, via, claimed_at}` |
| Splash states (undesigned → design in code) | "Finding your crew…" loading on 3a-1 during resolve (≤ 2 s timeout), no-link → normal splash, invalid → 3a-11 with shake toast |
| App Clip | Decision D15: built unconditionally before launch (no invite installs exist pre-launch, so a volume gate could never trip) and shipped dark behind server flag `links.app_clip` (default off): the flag controls the AASA `appclips` entry and the `app-clip-bundle-id` meta on the web handoff page. Flag turns on when iOS deferred success < 60 % of Android, evaluated first on the TestFlight/Play beta cohort (≥ 30 invite installs per platform) and re-evaluated post-launch at ≥ 200; digital invocation only (100 MB cap), renders the ticket, hands token to full app via App Group |
| Metrics | `link_preview`, `link_click`, `store_click`, `install_attributed{via: referrer\|paste\|code\|phone\|clip}`, `time_to_manifest_ms` (P23 closes it) |

## Architecture & contracts

| Area | Delta |
|---|---|
| Tables | `join_codes` (data-model §3.2, unchanged) ; `install_attributions` add `via text`, `claimed_url text`, `link_kind text` (expand migration on phase-09 skeleton) |
| RLS | `join_codes`: M read (crew members), writes S/command only; lookup by code for non-members only via `app.lookup_join_code(code)` definer fn returning public subset; `install_attributions`: S only |
| Domain | `packages/domain/src/links/{grammar,codes,seat-token,hosts,schemes}.ts`: parse/build, alphabet `23456789ABCDEFGHJKMNPQRSTVWXYZ` (Crockford minus 0/O/1/I/L/U), CSPRNG `crypto.getRandomValues`, seat token 128-bit base64url + HMAC-SHA256 key id |
| HTTP | `GET /v1/links/{token}/preview`, `GET /v1/codes/{code}` (public subset; rate limits from phase 09 abuse module: 10/min/IP, 30/h/device; enumeration → uniform 404), `POST /v1/links/claim` |
| Command | `claim_attribution {install_referrer?\|pasted_url?\|join_code?\|phone?}` |
| Web | `apps/web/public/.well-known/apple-app-site-association` (applinks components include/exclude per above, `webcredentials`, `appclips` when built), `assetlinks.json` (SHA-256 of upload + Play signing certs, `dynamic_app_link_components`), served with `application/json`, no redirect, both hosts |
| Mobile | `with-links` config plugin (associatedDomains `applinks:`/`webcredentials:` both hosts; Android intent-filters `autoVerify` per path; scheme `critterpass`); `cp-deferred-link` (Kotlin Install Referrer, Swift detectPatterns); `src/lib/links/{router,pending,deferred,resolver-client}.ts`; `+native-intent.tsx` rewrite |
| Doc delta | api-contracts §5.6 add `GET /v1/codes/{code}`, `/j` alias, `claim_attribution.phone`; data-model §3.1 `install_attributions` columns |

## Tasks

### T1 — Link grammar, codes, seat tokens
- Goal: one source of truth for every link.
- Files: `packages/domain/src/links/{grammar,codes,seat-token,hosts,schemes,index}.ts`, `__tests__/*.test.ts`.
- Steps: 1. Route table + `parseLink(url)` / `buildLink(kind, params, host)`. 2. Code alphabet + `generateCode()` CSPRNG + normalise (upper, strip spaces/dashes, map O→0 not allowed → reject). 3. Seat token generate/HMAC verify with key rotation. 4. Custom scheme mapping.
- Tests: `pnpm --fail-if-no-match --filter @cp/domain test -- links`.
- Done when: property tests round-trip build→parse for all kinds; distribution test (χ²) on 100k codes passes; ambiguous glyphs never generated.

### T2 — Join codes + attribution claim schema
- Goal: storage with RLS backstop.
- Files: `packages/db/src/schema/links.ts`, `packages/db/migrations/<ts>_join_codes_and_install_claims.sql`, `packages/db/test/permissions/{join_codes,install_attributions_claims}.test.ts`.
- Steps: 1. `join_codes` table + partial unique index on active code. 2. Expand `install_attributions`. 3. `app.lookup_join_code` definer fn (public subset, increments nothing). 4. Permission matrix.
- Tests: `pnpm --fail-if-no-match --filter @cp/db test -- permissions/join_codes permissions/install_attributions_claims`.
- Done when: outsider cannot SELECT `join_codes` rows but lookup fn returns public subset only for active codes.

### T3 — API resolver, preview, claim
- Goal: server endpoints and provider registry.
- Files: `services/api/src/links/{registry,resolver,bot-filter,preview}.ts`, `services/api/src/routes/links.ts`, `services/api/src/commands/attribution/claim-attribution.ts`, `services/api/test/links/*.test.ts`.
- Steps: 1. Provider registry interface `{kind, preview(ctx), resolve(ctx)}`. 2. Bot filter + first-human-open event. 3. Code lookup with phase-09 rate limits, uniform 404. 4. Claim command validating host/path/HMAC, idempotent per device. 5. OpenAPI via `@hono/zod-openapi`.
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- links`.
- Done when: WhatsApp/iMessage preview UA does not emit `invite.opened`; 11th lookup in a minute returns 429; replayed claim returns original result.

### T4 — AASA, assetlinks, handoff pages, in-app browser escape
- Goal: web side of links on both hosts.
- Files: `apps/web/public/.well-known/{apple-app-site-association,assetlinks.json}`, `apps/web/src/pages/.well-known/*` (if templated per env), `apps/web/src/lib/links/{ua,intent-url,store-url,resolver-fetch}.ts`, `apps/web/src/components/link-handoff/{Handoff.astro,OpenInApp.astro,InAppBrowserEscape.astro,CopyOnTap.ts}`, `apps/web/src/pages/{i,j,p,r,g,plan,locals,app}/[...slug].astro`, `apps/web/tests/links/*.spec.ts`.
- Steps: 1. Static well-known files with correct content type, both hosts. 2. Handoff component: preview, Open in app via `go.` host, store buttons with Play referrer, clipboard copy on CTA, intent URL. 3. In-app browser overlay. 4. Route pages render handoff (phase 51 restyles content).
- Tests: `pnpm --fail-if-no-match --filter @cp/web test:e2e -- links`.
- Done when: Playwright asserts AASA JSON schema/content-type/no redirect on both hosts, assetlinks fingerprints, Instagram UA shows escape overlay, Play URL carries encoded referrer.

### T5 — Native link config + cp-deferred-link module
- Goal: OS-level link claims and deferred primitives.
- Files: `apps/mobile/plugins/with-links.ts`, `apps/mobile/modules/cp-deferred-link/{expo-module.config.json,index.ts,ios/CpDeferredLinkModule.swift,android/src/main/java/app/critterpass/deferredlink/CpDeferredLinkModule.kt}`, tests.
- Steps: 1. Plugin writes associated domains + intent filters for every UL path on both hosts + scheme. 2. Kotlin `getInstallReferrer()` once (cached flag). 3. Swift `detectLikelyLink()` via `detectPatterns` (no value read). 4. Paste via expo-clipboard `ClipboardPasteButton`.
- Tests: `./gradlew :cp-deferred-link:testDebugUnitTest`; `pnpm --fail-if-no-match --filter @cp/mobile test -- modules/cp-deferred-link`; `npx expo prebuild --no-install` + `tools/scripts/check-links-manifest.ts` asserting entitlements/manifest.
- Done when: prebuilt iOS entitlements list both hosts; Android manifest has `autoVerify` filters for each path; module unit tests pass.

### T6 — In-app deep-link router
- Goal: every link lands on the right screen with gating.
- Files: `apps/mobile/src/lib/links/{router,pending,route-map}.ts`, `apps/mobile/src/app/+native-intent.tsx`, tests.
- Steps: 1. `+native-intent` rewrites UL/scheme to internal paths. 2. Pending-link store (MMKV) consumed after onboarding. 3. Membership/state check via resolver client before navigation. 4. Unknown → Home with toast.
- Tests: `pnpm --fail-if-no-match --filter @cp/mobile test -- lib/links`; `maestro test e2e/links/open-installed.yaml`.
- Done when: `xcrun simctl openurl` / `adb shell am start -d` for each kind reaches expected route in Maestro.

### T7 — First-launch deferred resolver + splash states
- Goal: zero-typing install → target.
- Files: `apps/mobile/src/lib/links/{deferred,resolver-client,attribution}.ts`, `apps/mobile/src/lib/links/SplashResolveGate.tsx`, tests.
- Steps: 1. Order: Android referrer → iOS detectPatterns → paste control prompt → code entry. 2. `POST /v1/links/claim`; store pending link. 3. Loading state (≤ 2 s), fallback to normal splash. 4. Analytics funnel events. 5. Phone-hash hook invoked after phone verify (calls claim with `via: phone`).
- Tests: `pnpm --fail-if-no-match --filter @cp/mobile test -- lib/links/deferred`; `maestro test e2e/links/deferred-android.yaml` (referrer injected via debug-only override flag in internal builds).
- Done when: debug referrer override lands on invite route; iOS paste flow lands on target in simulator Maestro.

### T8 — Funnel verification and runbook
- Goal: prove real-device deferral and measure.
- Files: `e2e/links/{deferred-ios-paste,in-app-browser}.yaml`, `docs/runbooks/deep-link-qa.md`, `services/api/test/links/funnel.test.ts`.
- Steps: 1. Automated run on simulator/emulator (or AWS Device Farm) of paste, referrer-override and in-app-browser flows with saved artifacts; real-device QA script (Play internal testing referrer, TestFlight paste, Instagram in-app browser) written for the M8 milestone checklist. 2. Funnel query (PostHog) for `install_attributed.via` split. 3. App Clip gate query documented.
- Tests: `maestro test e2e/links`; `pnpm --fail-if-no-match --filter @cp/api test -- links/funnel`.
- Done when: automated flows green with artifacts saved; runbook contains the real-device script and an empty results table (both platforms, all `via` values) to fill at M8.

### T9 — App Clip (built, flag-gated)
- Goal: deterministic iOS deferral ready at launch; switched on by flag if the paste funnel underperforms (D15).
- Files: `apps/mobile/targets/app-clip/{AppClip.swift,TicketView.swift,Info.plist,expo-target.config.js}`, AASA `appclips` entry.
- Steps: 1. SwiftUI clip rendering invite ticket from preview API (baked art). 2. Write token to App Group; full app reads it on first launch. 3. Size ≤ 100 MB digital invocation (no App Clip Code).
- Tests: `xcodebuild -scheme AppClip test`; Maestro `e2e/links/app-clip.yaml` using `_XCAppClipURL` launch.
- Done when: clip builds and installs from Safari invocation on the simulator with `links.app_clip` on, the full app consumes the App Group token; with the flag off AASA has no `appclips` entry and the handoff page no clip meta (test); decision (build + flag, beta-cohort gate) recorded in `docs/decisions/`.

## Phase acceptance criteria

- [ ] AASA + assetlinks valid on `critterpass.app` and `go.critterpass.app` (Playwright)
- [ ] Every route kind opens the app from Notes/Messages taps on both OSes (Maestro + runbook)
- [ ] Android fresh install with referrer lands on the target without typing
- [ ] iOS fresh install: paste control lands on target; no pasteboard alert appears
- [ ] Code lookup rate-limited and enumeration-safe; previews bot-filtered
- [ ] `install_attributions.via` recorded for every claimed install
- [ ] No link path, code or token appears in logs unhashed

## Risks & rollback

| Risk | Mitigation |
|---|---|
| In-app browsers block UL | Escape overlay, `go.` host, code always visible |
| AASA cached stale by Apple CDN | Version path components carefully; `?mode=developer` in dev builds |
| Referrer spoofing | HMAC on seat tokens; codes are public by design and gated by seat cap/expiry in P23 |
| Paste funnel poor | flip `links.app_clip` on (clip built in T9) |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Domain `critterpass.app` + `go.` DNS on Cloudflare (D20) | Staging domain in env; hosts are config, not code |
| Apple Team ID, Play app signing SHA-256 | Placeholders in env-specific build of well-known files; CI check fails on placeholders for prod |
| App Clip bundle id + associated domain entitlement | T9 builds against a dev bundle id; flag stays off |

## Open questions

| Question | Default |
|---|---|
| Does `/i/{code}` also serve referral codes (web report) or only `/r/` (api-contracts)? | Both: `/r/` canonical for referral; `/i/` resolves by code type |
| `/j/` vs `/i/` alias (doc delta) | Keep `/j/` as alias of `/i/` |
| Pending-link expiry | 24 h after capture |
| Phone-hash match consent | Only matches when inviter supplied the number via contact picker (P23); disclosed in invite terms |
