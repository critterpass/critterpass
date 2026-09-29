---
phase: 22
title: Onboarding: passport, taste, home airport, avatar
status: in_progress
depends_on: [5, 7, 9, 10, 18, 20, 21]
wave: 8
features: [F-038, F-039, F-040, F-041]
screens: [3a-1, 3a-2, 3a-3, 3a-4, 3a-5, 3a-6, 3a-7, 3a-8, 3a-9, 3n-1, 3n-3, 3n-4]
tasks: 11
owns:
  - infra/powersync/streams/onboarding.yaml
  - packages/domain/src/pass/
  - packages/domain/src/taste/
  - packages/domain/src/airports/
  - packages/content/onboarding/
  - packages/content/airports/
  - tools/scripts/build-airports.ts
  - packages/db/src/schema/onboarding.ts
  - packages/db/migrations/<ts>_passes_taste_stamps_avatars.sql
  - packages/db/test/permissions/{passes,taste_profiles,stamps,avatars}.test.ts
  - services/api/src/commands/onboarding/
  - services/api/src/commands/avatar/
  - services/api/src/routes/geo.ts
  - services/api/test/onboarding/
  - services/worker/src/jobs/avatar/
  - apps/mobile/modules/cp-subject-lift/
  - apps/mobile/src/app/onboarding/
  - apps/mobile/src/features/onboarding/ (except invited/, owned by phase 23)
  - apps/mobile/src/ui/avatar/
  - apps/mobile/src/ui/pass-card/
  - packages/i18n/locales/*/onboarding.po
  - e2e/onboarding/
---
# Phase 22 — Onboarding: passport, taste, home airport, avatar

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D1, D5, D11; C5, C6, C7, C22, C23, C36, C39; Q-10, Q-17, Q-18, Q-93, Q-95 |
| `docs/system-architecture.md` | §4.1 commands, §4.6 AI, §4.7 critter art pipeline, §4.8 App Group, §9 perf (cold start) |
| `docs/data-model.md` | §3.1 `users`, `taste_profiles`, `passes`, `avatars`; §3.10 `stamps` |
| `docs/data-model-sync-and-privacy.md` | §4 streams `me`, `crew_people`; §7 row "22" |
| `docs/api-contracts.md` | §4.1 `issue_pass`, `set_taste`, `set_home_airport`, `set_avatar`; §3 `CONTENT_REJECTED`; §5.1 auth; §5.4 media |
| `docs/design-system.md` | tokens, type (Archivo widths 62–100), motion presets, stamps, confetti, components |
| Reports | `design-analysis-260926-1143-onboarding-home-report.md` §3a-1…3a-9 (per-screen specs, missing states, motion values), §8 questions; `design-analysis-260926-1143-critters-after-report.md` (rarity rings, avatar forms); `researcher-260926-1143-native-platform-monetization-report.md` (camera/vision row); master §2 F-038–F-041, §6.1 "Camera + vision", "Photos", §11.2 onboarding gaps |
| Renders | `docs/design-renders/screens/3a-1_Splash.png` … `3a-9_Permissions_in_context.png`, `3n-3_Edit_profile.png`, `3n-4_Avatar.png` |

## Overview

Goal: the anonymous-first pass flow (3a-1…3a-9): splash with passport open, name with live MRZ, photo/guide pick, six this-or-that questions, home airport, pass issued stamp + confetti, save-pass sheet and phone sign-in (UI over phase-09 auth client), permissions in context; plus the avatar system used everywhere.

Done when: a new user reaches Home through 3a-1→3a-9 offline-tolerant (pass issued locally, synced later) with every missing state designed; returning users can sign in from the splash; the pass, taste tags, home stamp and avatar sync to crewmates; photo avatars are cut out on device, moderated, and baked into PNG variants for OS surfaces.

## Requirements

### F-038 Anonymous-first pass

| Screen | Designed behaviour | Undesigned states to design in code |
|---|---|---|
| 3a-1 Splash | Passport bob (4200 ms), cover sheen, Tokek pop-up 3600 ms, five floating guides; OPEN YOUR PASS = 3D cover swing (rotateY around spine, ≈1600 px perspective, 260+420 ms) into 3a-2 shared element; medium haptic; page-flip SFX respecting silent switch; "I have an invite code" → 3a-11 (P23) | "I already have a pass · Sign in" entry (returning sign-in, phase-09 `signInReturning`); deferred-link resolving state (P21 `SplashResolveGate`); offline first launch (all art/fonts bundled) |
| 3a-2 Name | PAGE 1 OF 4; per-glyph drop 120–180 ms onto pass; MRZ rewrites; Tokek line swaps after 600–800 ms idle from a scripted pool (no LLM, no name sent anywhere); `textContentType=givenName` | empty (NEXT disabled), max 24 chars + ellipsis, non-Latin names (display in system font fallback; MRZ via ICAO 9303 transliteration), emoji stripped from MRZ, profanity → gentle Tokek line + block |
| 3a-6 Pass issued | pass drop (≈630 ms back), ISSUED slam at 900 ms (`s2.2→.94→1.04→1`), heavy haptic + thud, jolt, confetti 80 pcs, HOME stamp at 1500 ms (brand orange, C7), Tokek hop; SAVE MY PASS | reduced motion (fade stamps, no confetti); offline issue (local pass, "SYNCING" micro-label, number fills on sync) |
| 3a-7 Save sheet | sheet 540 ms; Apple / Google / phone; SAVED tick pop 300 ms after success | provider cancel/error, network error, identity already has a pass → merge-or-switch choice (phase-09 merge ticket), SIWA hide-my-email, "Not now" (dismissible per phase-09 decision; sign-in required later at purchase / invites / second device), in-progress; use HIG/Google-approved button styles |
| 3a-8 Phone | OTP boxes, digits drop at 450/710/970 ms, green ring at 1350 ms + hop stagger 45 ms, puffin claps, auto-advance 2150 ms | number entry step + country picker (default from home country), invalid number, send failure, WhatsApp vs SMS channel note, resend countdown 30/60/120 s, wrong code (pink shake like 3a-11), expired, rate limited, change number |
| 3a-9 Permissions | composes phase-20 `PrimerCard`s (ALARMS AND PINGS, LOCATION ON TRIPS, CALENDAR); LET'S GO / Ask me later → Home | invited path reaches the same primers just-in-time (Q-13) |
| State machine | `PassDraft` states name→photo→taste→home→issued→saved; resume on relaunch at last step; pass number reserved at `start_pass` (online) else placeholder "CP-····" until sync |

### F-039 Taste profile

| Aspect | Behaviour |
|---|---|
| Quiz (3a-4) | 6 binary questions (content in `packages/content/onboarding/quiz.json`, founder-approved): Q1 SUNRISE SUMMIT vs SLEEP TILL TEN, then food, pace, stays, nightlife, planning. Top card bob 3000 ms; pick flings other card (≈480 px, ±50°, 560 ms); answer stamp thuds onto ON YOUR PASS (`2.2→.94→1.04→1`, heavy haptic); next pair rises 460 ms; "3 OF 6" counter |
| Undesigned | back/undo last answer, skip question (no tag), summary state after Q6, retake sheet (3n-1 RETAKE, mounted by P45) overwriting answers |
| Tags | taxonomy in `packages/domain/src/taste/taxonomy.ts` (SUNRISE CHASER, STREET FOOD, BEACH NO PLANS, MUSEUMS, NIGHT OWL, BIG HIKES, PHOTO DUMPS, CHAOS IS FINE, EASY-ISH PACE, …); pass short forms "SUNRISE · STREET FOOD · EASY"; `tag_sources` per tag (quiz/chips/inviter/guide); chips mode API for 3a-12 (P23) |
| Visibility | crew-visible (Q-17) with disclosure line on 3a-4 summary; `user_settings.hide_taste_tags` honoured by `crew_people` stream |

### F-040 Avatar system

| Aspect | Behaviour |
|---|---|
| Kinds | critter sticker (6 live guides at onboarding; owned forms later via 3n-4) with rarity ring (rare `#4f86ff`, epic `#ff5fa8`, legendary `#ffd84a`, C6); initials in member colour (fallback); real photo cut-out with white outline |
| 3a-3 | 3×2 guide grid, 6 px ring; tap → flash blink (0→.55→0, 460 ms), sticker waves, frame tilt ±2–4° spring, bob 2400 ms; USE A REAL PHOTO → library (PHPicker/Photo Picker, no permission) or camera (phase-20 JIT primer) → on-device subject lift → outline → preview in frame |
| Undesigned | capture UI, crop/zoom, no subject found, upload progress, moderation pending ("under review", shows initials to others), rejected (`CONTENT_REJECTED`, retry), camera denied |
| Moderation | presign rate limit per uid + device (5 avatar uploads/h, 20/day; `RATE_LIMITED`), anonymous uids included; worker `avatar.moderate`: 1. known-CSAM hash match (PhotoDNA Cloud or Cloudflare CSAM Scanning Tool) before any model sees the image; hit → blocked, object quarantined, ops queue + legal report path, never sent to Haiku; 2. Claude Haiku 4.5 image classification (nudity, violence, hate symbols, not-a-person allowed) via phase-13 gateway; uncertain → ops queue (P17 `moderate_item`), others see initials meanwhile |
| Variants | worker `avatar.render`: PNG 40/64/120/240 px circle + ring, stored in R2; app mirrors current avatar into App Group `avatars/` via phase-05 `exportPng` for NSE sender images (5b-1) |
| Gating | earned critter avatars never gated (C23); ownership check on `set_avatar(kind=critter)` |
| Consumers | chat, map pins, manifests, votes (all use `ui/avatar/Avatar`) |

### F-041 Home airport

| Aspect | Behaviour |
|---|---|
| Dataset | bundled JSON built from OurAirports (public domain) filtered to airports with scheduled service (+ metro groups e.g. "All London airports"), fields iata, name, city, country ISO2/3, currency, lat/lng, rank, localized "home" word per country (RUMAH…) |
| Search (3a-5) | offline fuzzy search (IATA exact > city prefix > name trigram), results animate per keystroke; nearest on top from `GET /v1/geo/hint` (IP → country/city, no GPS prompt) with "Malaysia · 40 min away" distance line; picking inks HOME stamp (300–400 ms) which shares element into 3a-6 |
| Undesigned | no results, offline (dataset local, nearest hidden), location unknown, far from airports ("nearest is 3 h away"), multi-airport city row |
| Derived | `home_country`, `home_currency` (feeds 3n-8, money), home set (C39), home stamp No. 1; reused by 3n-3 (P45) |

## Architecture & contracts

| Area | Delta |
|---|---|
| Tables | `taste_profiles`, `passes`, `stamps`, `avatars` per data-model; `passes` add `status (draft/issued)` + `number` from sequence `pass_number_seq` (doc delta); stamps `kind=home` created by `issue_pass` |
| RLS | `passes`, `avatars`, `stamps`: read self or `app.shares_crew`, write S/command; `taste_profiles` read shares-crew unless `hide_taste_tags`, write O |
| Commands | `start_pass {}` → `{number}` (doc delta, idempotent per user); `issue_pass`; `set_taste`; `set_home_airport`; `set_avatar` (handler lives here; 3n-4 screen mounts it in P45; doc delta phase column 45→22) |
| HTTP | `GET /v1/geo/hint` → `{country, city?, nearest_iata[]}` from DB-IP Lite City (CC BY 4.0, attribution in legal page) (doc delta) |
| Jobs | `avatar.moderate`, `avatar.render` (queue catalogue delta) |
| Sync | append `passes`, `taste_profiles`, `stamps`, `avatars` to `me`/`crew_people` in own file `infra/powersync/streams/onboarding.yaml` (merged by `build-config.ts`) |
| Native | `cp-subject-lift`: iOS Vision `VNGenerateForegroundInstanceMaskRequest`; Android ML Kit subject segmentation; returns PNG with alpha |
| Events | `pass.issued` (analytics funnel `onboarding_step{step}`), `profile.taste_changed`, `profile.avatar_changed` → Centrifugo `crew:` `member.updated` |

## Tasks

### T1 — Onboarding schema, RLS, permission tests
- Goal: four tables + pass number sequence.
- Files: `packages/db/src/schema/onboarding.ts`, `packages/db/migrations/<ts>_passes_taste_stamps_avatars.sql`, `packages/db/test/permissions/{passes,taste_profiles,stamps,avatars}.test.ts`, `infra/powersync/streams/onboarding.yaml`.
- Steps: 1. Drizzle + SQL, FORCE RLS, grants. 2. Sequence + helper. 3. Matrix: self, crewmate, ex-crewmate, outsider, guide_reader (taste tags visible via llm view only).
- Tests: `pnpm --filter @cp/db test -- permissions/passes permissions/taste_profiles permissions/stamps permissions/avatars`.
- Done when: hidden taste tags invisible to crewmates; outsider sees nothing.
- Status: done — 9999bd57

### T2 — Pass, MRZ, taste and airport domain
- Goal: pure logic.
- Files: `packages/domain/src/pass/{draft-machine,mrz,number}.ts`, `packages/domain/src/taste/{taxonomy,quiz-to-tags,chips}.ts`, `packages/domain/src/airports/{search,nearest,types}.ts`, tests.
- Steps: 1. Draft machine with resume. 2. MRZ lines (ICAO 9303 transliteration table, `<` fill, 44 chars). 3. Quiz answers → tags + short forms. 4. Airport fuzzy search + haversine nearest.
- Tests: `pnpm --filter @cp/domain test -- pass taste airports`.
- Done when: MRZ golden tests for Latin, Vietnamese diacritics, CJK fallback; search returns SIN first for "Sing" and "sin".
- Status: done — 13960157

### T3 — Onboarding content + airport dataset
- Goal: bundled, validated content.
- Files: `packages/content/onboarding/{quiz.json,home-words.json,tokek-lines.json,schema.ts}`, `packages/content/airports/{airports.json,metro-groups.json,schema.ts}`, `tools/scripts/build-airports.ts`.
- Steps: 1. Author 6 questions × 2 options with tags, art refs, copy (en; other locales via Tolgee). 2. Scripted Tokek reaction pool (≥ 20 lines). 3. Build script downloads OurAirports CSV, filters scheduled service, joins currency, writes JSON ≤ 600 KB. 4. zod validation in CI.
- Tests: `pnpm tsx tools/scripts/build-airports.ts --check`; `pnpm --filter @cp/content test -- onboarding airports`.
- Done when: schemas pass; dataset size budget met; founder approval noted in PR.
- Status: done — 13960157

### T4 — Onboarding commands + geo hint
- Goal: server handlers.
- Files: `services/api/src/commands/onboarding/{start-pass,issue-pass,set-taste,set-home-airport}.ts`, `services/api/src/commands/avatar/set-avatar.ts`, `services/api/src/routes/geo.ts`, `services/api/test/onboarding/*.test.ts`.
- Steps: 1. Handlers via phase-10 registry; `issue_pass` creates pass (issued), home stamp, taste profile, avatar row atomically; idempotent. 2. `set_avatar` ownership + moderation enqueue. 3. Geo hint from DB-IP mmdb loaded at boot.
- Tests: `pnpm --filter @cp/api test -- onboarding`.
- Done when: offline replay of `issue_pass` after `start_pass` yields one pass; unowned form → `FORBIDDEN`.
- Status: done — 9999bd57

### T5a — Avatar component + on-device subject lift
- Goal: F-040 client side.
- Files: `apps/mobile/src/ui/avatar/{Avatar,RarityRing,InitialsAvatar,PhotoAvatar,AvatarPicker}.tsx`, `apps/mobile/modules/cp-subject-lift/{index.ts,ios/CpSubjectLiftModule.swift,android/src/main/java/app/critterpass/subjectlift/CpSubjectLiftModule.kt}`, tests.
- Steps: 1. Avatar component (sizes, ring, pending/rejected fallbacks). 2. Subject lift + Skia outline; no-subject fallback circular crop. 3. Upload via phase-10 media presign (surfaces `RATE_LIMITED`).
- Tests: `pnpm --filter @cp/mobile test -- ui/avatar`; `./gradlew :cp-subject-lift:testDebugUnitTest`; `xcodebuild test -scheme CpSubjectLiftTests`.
- Done when: sample photo → cut-out PNG with alpha on both platforms; pending/rejected/rate-limited states render in RNTL.
- Status: done — fe95344c (the avatar component, states, upload and App Group mirror in eaf8e606; the photo picker and subject lift reach devices with the next native build)

### T5b — Avatar moderation, variants, App Group mirror
- Goal: F-040 server side + OS-surface variants.
- Files: `services/worker/src/jobs/avatar/{hash-match,moderate,render}.ts`, `services/api/src/commands/avatar/upload-limits.ts`, `apps/mobile/src/ui/avatar/app-group-mirror.ts`, tests.
- Steps: 1. Per-uid/device upload rate limit on avatar presign. 2. Hash-match step (vendor adapter behind `moderation.hash_match` config) before Haiku. 3. Haiku classification, uncertain → ops queue. 4. Render job 40/64/120/240 px + App Group mirror.
- Tests: `pnpm --filter @cp/worker test -- jobs/avatar`; `pnpm --filter @cp/api test -- onboarding/avatar-limits`.
- Done when: hash-match hit (vendor test image) is blocked and never reaches the Haiku call (asserted on gateway spy); rejected image leaves initials visible to crew; 6th upload in an hour → `RATE_LIMITED`; variants exist in R2 for approved avatar.
- Status: done — 9999bd57

### T6 — Splash, name, photo screens
- Goal: 3a-1, 3a-2, 3a-3.
- Files: `apps/mobile/src/app/onboarding/{index,name,photo}.tsx`, `apps/mobile/src/features/onboarding/{splash,name,photo}/*`, `apps/mobile/src/ui/pass-card/{PassCard,MrzLines,GlyphDrop}.tsx`, tests.
- Steps: 1. Splash motion + cover swing shared element + returning sign-in entry + resolve gate. 2. Name with glyph drop, MRZ, Tokek pool, validation. 3. Photo picker with guide grid, flash, real photo flow and states.
- Tests: `pnpm --filter @cp/mobile test -- features/onboarding`; `maestro test e2e/onboarding/splash-name-photo.yaml`.
- Done when: RNTL covers all listed states; reduced-motion snapshot differs (no 3D swing).
- Status: done — eaf8e606

### T7 — This-or-that and home base
- Goal: 3a-4, 3a-5.
- Files: `apps/mobile/src/app/onboarding/{taste,home}.tsx`, `apps/mobile/src/features/onboarding/{taste,home}/*`, tests.
- Steps: 1. Card pair with fling gesture (RNGH) + tap, stamp thud, undo, skip, summary + disclosure. 2. Export `TasteQuiz` sheet mode for retake. 3. Airport search list with nearest, distance, ink stamp, states.
- Tests: `pnpm --filter @cp/mobile test -- features/onboarding/taste features/onboarding/home`; `maestro test e2e/onboarding/taste-home.yaml`.
- Done when: 6 answers produce expected tags; airplane-mode search still returns results.
- Status: done — eaf8e606

### T8 — Pass issued, save sheet, phone sign-in
- Goal: 3a-6, 3a-7, 3a-8 over phase-09 client.
- Files: `apps/mobile/src/app/onboarding/{issued,save,phone}.tsx`, `apps/mobile/src/features/onboarding/{issued,save,phone}/*`, tests.
- Steps: 1. Issued choreography with confetti + haptics + offline label. 2. Save sheet with approved Apple/Google buttons, merge-or-switch dialog, dismiss. 3. Phone entry + country picker + OTP boxes + resend + errors; SAVED tick.
- Tests: `pnpm --filter @cp/mobile test -- features/onboarding/issued features/onboarding/save features/onboarding/phone`; `maestro test e2e/onboarding/save-phone.yaml` (test OTP number from phase-09 fixture).
- Done when: linking keeps uid (asserted via API in e2e); every error state reachable in RNTL.
- Status: done — eaf8e606

### T9 — Permissions step + flow controller
- Goal: 3a-9 and resumable flow.
- Files: `apps/mobile/src/app/onboarding/permissions.tsx`, `apps/mobile/src/features/onboarding/{flow-controller,permissions}/*`, `packages/i18n/locales/en/onboarding.po`, tests.
- Steps: 1. Compose phase-20 primer cards; LET'S GO / Ask later. 2. Flow controller: step routing, resume, pending deep link hand-off (P21 pending store → P23 invited path), analytics `onboarding_step`. 3. Extract strings.
- Tests: `pnpm --filter @cp/mobile test -- features/onboarding/flow-controller`; `pnpm --filter @cp/i18n test -- onboarding`.
- Done when: killing the app at each step resumes at that step.
- Status: done — eaf8e606

### T10 — End-to-end first run
- Goal: prove F-038–F-041 together.
- Files: `e2e/onboarding/{first-run-ios,first-run-android,returning-sign-in,offline-first-launch}.yaml`, `services/api/test/onboarding/first-run.test.ts`.
- Steps: 1. Full flow both platforms. 2. Offline start → issue → reconnect → sync. 3. Returning user sign-in skips pass creation. 4. Crewmate sees pass/avatar via stream (API test with two users).
- Tests: `maestro test e2e/onboarding`; `pnpm --filter @cp/api test -- onboarding/first-run`.
- Done when: all flows green in CI; cold start to 3a-2 within the §9 budget.
- Status: blocked — flows (eaf8e606) and the API first-run test (9999bd57) are in; on the iOS 27 simulator with e2e-test build 537c50ab (fingerprint dce23884) first-run-ios, splash-name-photo, taste-home, returning-sign-in, offline-first-launch, real-photo-ios (circle-crop fallback, upload done) and the screens-en / screens-vi captures pass. Android emulator (e2e-test build 4ecd0486, 2026-09-29): first-run-android, splash-name-photo, taste-home, offline-first-launch, returning-sign-in and save-phone (staging test number and code) pass after Android flow fixes (a shared back step instead of the iOS edge swipe; no hideKeyboard once the airport pick has closed the keyboard, because Android's presses back). Continue with Google on an emulator without a Google account goes to Play services' "Checking info…" and never finishes; back returns to the page with the button reset, no error and no crash. Open: the Android screens-en / screens-vi captures

## Phase acceptance criteria

- [ ] 3a-1…3a-9 implemented with designed motion and every listed missing state
- [ ] Returning sign-in reachable from splash
- [ ] Pass issuable offline; exactly one pass after sync
- [ ] Taste quiz 6 questions; tags crew-visible unless hidden
- [ ] Photo avatar cut out on device, moderated, variants baked; initials fallback. The on-device cut-out **passed the founder's check on TestFlight build 10 (2026-09-29)**.
- [ ] Airport search works offline; nearest from IP hint without GPS prompt
- [ ] Permission tests green for 4 tables

## Risks & rollback

| Risk | Mitigation |
|---|---|
| Subject lift fails on older Android devices | Fallback circular crop with white ring |
| Moderation false positives | Ops queue review; user sees "under review", not rejection |
| MRZ transliteration gaps | Unknown chars → `<`; display name unaffected |
| Airport data drift | Build script in content refresh job; dataset versioned |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Founder approval of quiz content and Tokek lines | Ship the authored defaults in T3 |
| DB-IP Lite attribution in legal page (P51) | Endpoint still works; legal page task tracks line |
| Apple/Google button branding review | Use system-provided buttons |
| Hash-matching enrolment (PhotoDNA Cloud or Cloudflare CSAM Scanning Tool; needs legal entity D18) | Photo avatars from any uid stay "under review" (initials to others) until an ops reviewer approves; hash step switches on when enrolled |
| Counsel: taste tags crew-visible disclosure (Q-17), min age 16 (Q-95) | Disclosure copy per C36; age gate via Declared Age Range handled at 3a-7 (phase 09) |

## Open questions

| Question | Default |
|---|---|
| `start_pass`, `passes.status`, `GET /v1/geo/hint`, `set_avatar` phase move, avatar jobs (doc delta) | Implement as specified here |
| MRZ trailing digits "00→01" meaning | Stamp count, two digits |
| Remaining 5 quiz questions wording | Authored in T3; founder reviews in running app (D11) |
| Photo avatar allowed before sign-in? | Yes; upload tied to anonymous uid, preserved on upgrade |
