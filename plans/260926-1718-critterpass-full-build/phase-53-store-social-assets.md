---
phase: 53
title: Store listing & social kit
status: pending
depends_on: [5, 40, 43, 45, 47, 49, 50, 51]
wave: 22
early_block:
  tasks: [T4, T6]
  depends_on: [5, 51]
  wave: 11
features: [F-187, F-188]
screens: [Store-Assets, Store-Shot, App-Icon, Social-Kit]
tasks: 6
owns:
  - tools/scripts/store-kit/
  - tools/scripts/social-kit/
  - apps/mobile/store.config.json
  - apps/mobile/store/
  - e2e/store-shots/
  - packages/content/src/store/
  - packages/content/src/social/
---
# Phase 53 — Store listing & social kit

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D2 (both stores), D7 (prices shown as store localises), D17 (EAS Submit, Maestro), C48 (listing lists only shipped perks — all perks ship), §4 row R11 (official badges, in-app-captured previews, no staged frames) |
| `docs/system-architecture.md` | §3 repo (tools/), §6 envs (staging seed) |
| `docs/design-system.md` | brand, type, guide colours |
| Phase files | 05 (`critter-bake` icon templates, share layout canvas2d renderer), 51 (OG templates, fonts on web), 45 (alternate icons list), 40/43/47/49/50 and their upstreams 24–47 (commands used by the seed; captured vote, plan, trip day, critters, recap, money screens; Android parity), 54 (submission uses these assets) |
| Reports | `design-analysis-260926-1143-web-store-social-report.md` (Store Assets, Store Shot, App Icon, Social Kit), `researcher-260926-1143-web-links-ops-report.md` (store listing rules), `researcher-260926-1143-native-platform-monetization-report.md` (CPPs, In-App Events, preview video rules); master §2 F-187, F-188, R11 |
| Renders | `docs/design-renders/pages/Critterpass-Store-Assets.png`, `Store-Shot.png`, `App-Icon.png`, `Critterpass-Social-Kit.png` |

## Overview

Goal: reproducible, localised store assets for App Store + Google Play generated from real app builds (Maestro captures of a seeded staging crew composited into designed frames), listing copy as data, icon variants, and a social-kit batch renderer.

Done when: one command produces every required screenshot size for both stores in all shipped locales, preview videos captured from the app, listing metadata validated by `eas metadata:lint` and the Play API dry run, and `social-kit render` outputs the designed template set.

## Requirements

| Feature | Designed behaviour | Undesigned / truthful adjustments |
|---|---|---|
| F-187 store listing & assets | Store Shot templates (caption band, device frame, critter accents) for iPhone 6.9"/6.3", iPad not listed (iPhone-only per Q-02), Play phone + 7"/10" tablet letterbox shots, feature graphic 1024×500; app icon (App-Icon page) + Play adaptive/monochrome layers from `critter-bake`; preview videos (App Store ≤30 s app-captured, Play promo) captured from the running app; localized names/subtitles/keywords/descriptions/promo text; Custom Product Pages (crew-trip, critters) + In-App Event cards (e.g. legendary window) templates; privacy label/Data safety answers referenced from phase 54 | captions only claim shipped behaviour; prices never hard-coded in captions; official badges only; no staged frames |
| F-188 social kit | Social Kit templates (post square, story 9:16, "local of the week", guide intro, trip recap teaser) batch-rendered per locale from content JSON; uses the same share layout model as the app | output folder with manifest for manual posting |

Capture data: a dedicated staging crew created through real commands by a seed script (real behaviour, not mocks); captures run against staging builds. Blocks: T4 (listing copy) and T6 (social kit) run early (wave 11); T1–T3, T5 need the captured screens and run in wave 19.

## Architecture & contracts

| Area | Contract |
|---|---|
| Capture | `e2e/store-shots/<locale>/*.yaml` Maestro flows with `takeScreenshot`; device matrix in `tools/scripts/store-kit/devices.json` |
| Compose | `tools/scripts/store-kit/compose.ts`: `@napi-rs/canvas` + share layout model (phase 05) → per store/size/locale PNGs; templates in `packages/content/src/store/templates/*.json` |
| Copy | `packages/content/src/store/listing/<locale>.json` (zod: name ≤30, subtitle ≤30, keywords ≤100, promo ≤170, description ≤4000; Play title ≤30, short ≤80, full ≤4000) → `apps/mobile/store.config.json` (EAS metadata) + Play Developer API upload script |
| Social | `tools/scripts/social-kit/render.ts --set <name> --locale <l>`; templates `packages/content/src/social/templates/*.json` |
| No DB/API changes | – |

## Tasks

### T1 — Staging demo crew seed via real commands
- Goal: truthful capture data.
- Files: `tools/scripts/store-kit/seed-demo-crew.ts`, `tools/scripts/store-kit/README.md`.
- Steps: 1. Create anonymous accounts via Better Auth API, crew, trip, poll, plan, expenses through `/v1/cmd`. 2. Bookings only via the Viator sandbox (activities) and forwarded-booking fixtures (stays) through the real ingest path. 3. Idempotent (op_ids derived from seed name). 4. Guards: refuses non-staging API base; refuses to run unless the target's `/v1/health` reports supplier mode `sandbox` for every supplier adapter (no production supplier keys).
- Tests: `pnpm tsx tools/scripts/store-kit/seed-demo-crew.ts --api http://localhost:8787 --dry-run` then full run on local compose stack; `pnpm vitest run tools/scripts/store-kit/seed-guard`.
- Done when: rerun produces no duplicates; refusing prod base URL and production supplier mode both tested.

### T2 — Maestro capture flows (iOS + Android, all locales)
- Goal: raw screenshots + preview video.
- Files: `e2e/store-shots/**`, `tools/scripts/store-kit/{capture.ts,devices.json}`.
- Steps: 1. Flows per shot (vote, plan, trip day, critters, recap, money). 2. Locale switch via launch args. 3. Status bar clean (`simctl status_bar`, Android demo mode). 4. Screen recording for previews.
- Tests: `pnpm tsx tools/scripts/store-kit/capture.ts --platform ios --locale en`.
- Done when: raw captures for every device×locale exist with deterministic names.

### T3 — Store shot compositor + icons
- Goal: final store images.
- Files: `tools/scripts/store-kit/compose.ts`, `packages/content/src/store/templates/*.json`, `tools/scripts/store-kit/icons.ts`, `apps/mobile/store/**` (outputs, gitignored except manifest).
- Steps: 1. Templates from Store-Shot render. 2. Size validation per store spec. 3. Icons: 1024 marketing icon, Play 512 + adaptive + monochrome via `critter-bake` (alternate icon set from phase 45 `APP_ICON_IDS`, read-only).
- Tests: `pnpm vitest run tools/scripts/store-kit/compose` (golden image diff; `tools/scripts` is not a workspace package, per phase 01).
- Done when: every output matches required pixel dimensions and has no alpha where stores forbid it.

### T4 — Listing copy, CPPs, In-App Events, metadata upload
- Goal: listing as data.
- Files: `packages/content/src/store/listing/*.json`, `packages/content/src/store/schema.ts`, `apps/mobile/store.config.json`, `tools/scripts/store-kit/{play-listing.ts,cpp.ts,events.ts}`.
- Steps: 1. zod limits. 2. Generate EAS metadata file. 3. Play API upload (dry-run flag). 4. CPP + event card assets.
- Tests: `pnpm --filter @cp/content test -- store`; `npx eas-cli metadata:lint`; `pnpm tsx tools/scripts/store-kit/play-listing.ts --dry-run`.
- Done when: over-length copy fails the schema; dry runs pass.

### T5 — Preview video assembly
- Goal: App Store preview + Play promo.
- Files: `tools/scripts/store-kit/preview-video.ts`.
- Steps: 1. ffmpeg trim/concat of in-app recordings, caption burn-in, required resolutions/fps, ≤30 s. 2. Poster frame selection.
- Tests: `pnpm tsx tools/scripts/store-kit/preview-video.ts --check` (ffprobe asserts duration/resolution).
- Done when: outputs pass ffprobe checks for each required size.

### T6 — Social kit renderer
- Goal: F-188.
- Files: `tools/scripts/social-kit/render.ts`, `packages/content/src/social/templates/*.json`, `packages/content/src/social/sets/*.json`.
- Steps: 1. Templates from Social-Kit page. 2. Batch per set × locale. 3. Manifest with alt text.
- Tests: `pnpm vitest run tools/scripts/social-kit` (golden diff).
- Done when: `local-of-the-week` set renders square + story for each shipped locale.

## Phase acceptance criteria
- [ ] One command regenerates all store screenshots for both stores and all shipped locales
- [ ] Captures come from real builds against seeded staging
- [ ] Listing copy validated against store limits; EAS metadata lint + Play dry run pass
- [ ] Icons (iOS + adaptive/monochrome Play) generated
- [ ] Preview videos meet store specs
- [ ] Social kit batch render works

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Captures flaky due to realtime/animation | Maestro `waitForAnimationToEnd`; reduced-motion launch arg off for store shots only after settle |
| Store spec changes | sizes in `devices.json`/schema, one edit |

## Non-code dependencies
| Item | If not ready |
|---|---|
| App Store Connect app record + Play Console app | dry-run mode only |
| Translated listing copy (Tolgee) | en only; other locales not uploaded |
| Counsel review of claims | captions kept to factual feature statements |

## Open questions
1. Custom Product Page count at launch: 2 (crew trip, critters) — default.
2. Play tablet screenshots required? Default: provide letterboxed 7"/10" shots.
3. Wave shift 11 → 19 (early block T4/T6 stays 11) and phase 54 → wave 20 need the plan.md wave table updated — controller edit.
