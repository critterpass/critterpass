---
phase: 55
title: Find a driver: ask, capture, compare, pick, private tours
status: in_progress
depends_on: [13, 16, 29, 34, 35, 36, 58]
wave: 18
features: [F-193, F-194]
screens: [6a-1, 6a-2, 6b-1, 6c-1, 6c-2, 6c-3, 6d-1, 6d-2, 6e-4, 6f-1, 3e-1, 3h-3]
tasks: 13
owns:
  - packages/db/src/schema/drivers.ts
  - packages/db/migrations/*_driver_shortlist_intake.sql
  - packages/db/test/permissions/{provider-intake,provider-shortlist,provider-assignments,pickup-gaps,ask-groups}.test.ts
  - packages/domain/src/drivers/
  - packages/planner/src/ops/assign-provider.ts
  - packages/planner/test/ops/assign-provider.test.ts
  - packages/suppliers/src/private-transport/
  - packages/ai/src/routes/provider-extract/
  - packages/ai/evals/provider-extract/
  - services/api/src/commands/drivers/
  - services/api/src/routes/drivers.ts
  - services/api/src/admin/drivers.ts
  - services/api/test/drivers/
  - services/worker/src/jobs/drivers/
  - infra/powersync/streams/drivers.yaml
  - apps/admin/src/modules/drivers/
  - apps/mobile/src/app/(trip)/[tripId]/drivers/{index,ask,add,check,compare,pick,tours}.tsx
  - apps/mobile/src/features/drivers/{find,ask,intake,compare,pick,private-tours,leg-card,offline,shared}/**
  - apps/mobile/src/lib/share-intake/
  - apps/mobile/targets/share-extension/
  - apps/mobile/plugins/with-share-intake.ts
  - packages/i18n/locales/en/drivers/
  - e2e/drivers/{find,ask,intake,compare,pick,tours,offline}.yaml
  - e2e/screens/drivers-find.yaml
mount_points:   # one-line mounts in files of phases that are done before this one starts
  - packages/planner/src/ops/ registry (register `assign_provider`)
  - apps/mobile/src/features/plan/day/ day row (render the leg card from `features/drivers/leg-card`)
  - apps/mobile/src/features/bookings/getting-around/ (top card + offline ride-back state)
  - services/api/src/routes/offline-bundle.ts (include assigned providers)
---
# Phase 55 — Find a driver: ask, capture, compare, pick, private tours

## Context links
| Source | Section |
|---|---|
| `docs/product-decisions.md` | D10 (supplier content verbatim, uncached, never in prompts; commission-neutral; WhatsApp only with user approval), D21 (written by T1: drivers are brought in by users; we never read groups; the user sends every WhatsApp message from their own app), Q-57, C3, C41 |
| `docs/data-model.md` | §3.7 `providers`, `rides`, `ride_quotes`; §3.x `plan_days`, `plan_items`, `change_sets` |
| `docs/api-contracts.md` | §4.11 supplier commands; §5 `GET /v1/suppliers/offers`; §7 adapter interface |
| Reports | `research-260927-2018-local-guide-driver-finder-feasibility-report.md` (why no scraping; API landscape); `researcher-260926-1649-travel-supplier-apis-report.md` (Klook, Viator) |
| Phase inputs | P13 AI gateway + evals; P16 cost engine (per-person split); P29 plan day view, ChangeSet + review; P34 paste/scan import patterns (3h-2); P35 `providers`, adapters, Getting around, phrase card; P36 offline bundle |
| Renders | `docs/design-renders/screens/6a-1_*.png` … `6f-1_*.png`, `6e-4_*.png` (imported by the design sync step in plan.md §2) |

## Overview
Goal: when a leg has no app pickup, the crew can find a driver or driver-guide from three sources (crews' drivers from P56, private tours from Klook/Viator, or one they found themselves), compare them on equal terms and set one on the days they need.
Done when: a pickup gap on a plan leg shows the 6a-1 card; a pasted message, a screenshot and a shared WhatsApp contact each become a checked provider card; the compare table normalises per-car and per-day prices to each person's share; picking writes the driver onto the chosen days (directly or through a crew vote) and 3h-3 shows him; the offline ride-back card works in airplane mode.

## Requirements
### F-193 Find a driver (6a-1, 6a-2, 6b-1, 6c-1…3, 6d-1, 6d-2, 6e-4)
| Aspect | Behaviour |
|---|---|
| Pickup gaps (6a-1) | Curated `pickup_gaps` (POI or area, optional local-time window, reason copy) plus P35 Farefeed "no service" results for the leg. Card opens under the day row; NOT NOW folds to a NO RIDE flag (per user, per day); same card at the top of 3h-3 for that day |
| Hub (6a-2) | Leg chips pre-picked from the source card; + DAY adds more. Sources: crews' drivers (P56 route; hidden until P56 is done), private tours, found one yourself, ask for me. One shortlist per trip across all sources |
| Ask for me (6b-1) | Post built **deterministically** from trip data: party size, dates, route, seats, language, budget (from the private budget only when the user taps to include it; C36). Highlights are editable slots; EN and ID templates in i18n. COPY POST → toast. Suggested groups come from the curated `ask_groups` catalogue per destination; count = distinct crews who opened that group after copying a post. We never read or post to groups |
| Intake (6c-1) | PASTE (text/link), SCREENSHOT (pick or drop), CONTACT (vCard from WhatsApp share). OS share into CritterPass (iOS Share Extension, Android `ACTION_SEND` intent) lands in the trip's SHARED WITH TOKEK list, visible to the crew. Shared items are the crew's own trip data (C1); raw text/images kept only until parsed + 30 d |
| Extraction (6c-2, 6c-3) | AI route `provider-extract` (Sonnet with image, Haiku for text) returns fields + source spans; every field starts unconfirmed; tapping a line highlights its span in the peek bar; nothing reaches the crew shortlist until all lines are confirmed. Missing includes (tolls, entry, overtime) → ASK MADE opens WhatsApp with a templated question (user sends). Unreadable → 6c-3 with the crop line and partial fields; TYPE THE REST opens 6c-2 with gaps focused |
| Compare (6d-1) | 2–4 columns (scroll at 4). Rows: day price, each person's share for the chosen days (cost engine, crew split), car + seats, languages, tolls, entry fees, overtime, licence (user-confirmed only), crews rating (P56) or supplier rating (verbatim). NOT SAID pulses once; tap offers the ASK message. One deterministic Tokek line picks out the biggest risk (e.g. overtime unknown on a day longer than the quoted hours) |
| Pick (6d-2) | Sheet over the table; days with another provider are locked (TAKEN). SET writes `provider_assignments`; "Ask the crew first" wraps it as a ChangeSet with an `assign_provider` op through the normal poll (C41 defaults). Overtime warning when a day window exceeds quoted hours. "Tell Made on WhatsApp" builds dates + pickup pins (Google Maps links) for the user to send |
| Offline (6e-4) | Assigned provider (name, car, plate, pickup spot, agreed terms) is in the offline bundle; CALL uses the dialer; WHATSAPP · LATER queues; SHOW THIS TO {name} reuses the P35 phrase card with the pickup spot in the local language |

### F-194 Private tours for a driver (6f-1)
- `packages/suppliers/src/private-transport/` composes existing adapters: Klook (car charter with driver categories) and Viator (private tour / private driver tags) searched by destination + day window + party size.
- Cards: supplier title, photos, rating verbatim under THEIR WORDS, fetched per view, never stored or sent to the LLM; only product id + price shown are kept in the shortlist (data-model rule "Supplier content … is never stored").
- Tokek's fit line ("Fits Day 3. Ten hours covers Jatiluwih…") comes from **templates over structured fields** (duration, pax, price, plan day window), never from an LLM (D10).
- ADD TO COMPARE puts the supplier column into 6d-1; OPEN goes to the Klook/Viator page with sub-id (P35 links), or to the P35 in-app Viator sheet when `supplier.viator_booking` is on. Klook API flag off → Klook link row only ("Private car charters on Klook ↗"), no invented prices or ratings.
- Disclosure line pinned at the bottom (P35 copy).

### Undesigned states (build with the design system, log in `docs/undesigned-states.md`)
Share Extension sheet (iOS) and Android share target chooser; extraction in progress; contact with no phone; duplicate driver (same phone) merge prompt; private tours loading / supplier down / no results; compare with one candidate; admin screens for pickup gaps and ask groups.

## Architecture & contracts
| Item | Contract |
|---|---|
| Tables | `provider_intake` (trip_id, shared_by, kind text/link/image/contact, media_key?, raw_text_enc?, status pending/parsed/failed/used, parsed jsonb, spans jsonb, created_at; C1; purge parsed + 30 d); `providers` gains `source`, `status` (candidate/shortlisted/archived), `languages`, `seats`, `price_minor`, `price_unit` (day/hours/trip), `included_hours`, `includes jsonb` (fuel/parking/tolls/entry: yes/no/unknown), `overtime_minor?`, `licence_shown?`, `confirmed_fields`, `listing_id?` (P56), `supplier_ref?` (product id only); `provider_assignments` (trip_id, plan_day_id, provider_id, window_start, window_end, agreed jsonb, change_set_id?; uk day+kind=driver); `pickup_gaps` + `ask_groups` + `ask_group_opens` (catalogue C0 / events C1) |
| Commands | `share_provider_intake`, `parse_provider_intake` (job), `confirm_provider_fields`, `shortlist_provider`, `assign_provider` (direct) / via `propose_change_set` with op `assign_provider`, `dismiss_pickup_gap`, `record_ask_group_open` |
| Routes | `GET /v1/drivers/private-tours?trip_id&days` (supplier cards, no persistence); admin CRUD `pickup_gaps`, `ask_groups` |
| AI | `provider-extract` route with schema + span validation; eval set `packages/ai/evals/provider-extract/fixtures/driver-messages.yaml` (43 synthetic cases, 6 languages; 12 rendered to WhatsApp/Facebook images, 3 cropped) at ≥ 95 % field precision, 0 invented phones |
| Sync | stream `drivers.yaml`: trip members get intake, shortlist, assignments; contacts via existing `provider_contacts_offline` |
| Deep links | WhatsApp: `https://wa.me/{e164}?text=` built client-side; user sends |

## Ops console design

Build this phase's console panel to its render (`design/Ops - Community.dc.html`, `docs/design-renders/pages/Ops-Community.png`); field → table → command map in `plans/reports/researcher-260928-0214-ops-designs-content-platform-inventory-report.md`. Register the panel's `count`/`work` sources with the phase 58 registry. Sample data in the render is not a spec; AI labels follow D22 routing.

| Gap in the plan | Add in this phase |
|---|---|
| One screen "Community & drivers" with tabs DRIVERS / SHARED PLANS / PICKUP GAPS / ASK GROUPS | this phase creates the `community` area host (ops, content) with a tab registry; 52 and 56 add their tabs |
| Pickup gap status ACTIVE / DRAFT, Approve / Retire | `pickup_gaps.status draft\|active\|retired`; commands `upsert_pickup_gap`, `set_pickup_gap_status {id, status}` (content) |
| Ask-group link check ("checked 3 d ago", "broken since Thu", Fix link) | `ask_groups.link_status`, `last_checked_at`; `upsert_ask_group`, `mark_ask_group_checked {id, status}` (manual check by ops, D21: we never read groups) |
| Farefeed "no service on 9 legs this week" | aggregate read over phase 35 no-service ride quotes |
| Early option | the `pickup_gaps`/`ask_groups` catalogue tables and admin CRUD are server-only and may split out of this phase's migration to run early if a lane is idle |
| Nav badge | register `count` (gaps in draft + broken links) |

## Tasks
### T1 — Decision + contract deltas
- Status: done — 98b2a65e03
- Files: `docs/product-decisions.md` (D21 row, §5 copy rows for 6a–6f), `docs/data-model.md` §3.7, `docs/data-model-sync-and-privacy.md`, `docs/api-contracts.md` §4.11/§5, `docs/undesigned-states.md`
- Done when: tables, commands, routes and privacy classes above are in the docs; D21 records "users bring drivers in; we never read or post to groups; the user sends every WhatsApp message; directory listings only after the driver confirms".

### T2 — Schema, stream, permission tests
- Status: done — 5a6264c9e3 (pickup gaps and ask groups are not tables: founder 6 Oct, no new curated datasets)
- Files: `packages/db/src/schema/drivers.ts`, `packages/db/migrations/*_driver_shortlist_intake.sql`, `packages/db/test/permissions/*`, `infra/powersync/streams/drivers.yaml`
- Tests: `pnpm --filter @cp/db test:db -- permissions/provider-` etc.
- Done when: forced RLS + grants on every new table; non-members read nothing; raw intake text absent from the PowerSync publication and `guide_reader`.

### T3 — Pickup gaps + leg card (6a-1) + Getting around card
- Status: done — 5f5f2c35a0 (gaps are read from the plan day; the card sits on the trip map day sheet)
- Files: `packages/domain/src/drivers/pickup-gaps.ts`, `apps/mobile/src/features/drivers/leg-card/**`, mounts in plan day row + getting-around
- Done when: a Jatiluwih leg shows the card; after 18:00 only for the Ubud-centre window; NOT NOW folds to NO RIDE and persists per user.

### T4 — Find-a-driver hub + shortlist (6a-2)
- Status: done — 3a709ea761
- Files: `apps/mobile/src/app/(trip)/[tripId]/drivers/index.tsx`, `features/drivers/find/**`, `services/api/src/commands/drivers/shortlist-provider.ts`
- Done when: leg chips prefill from the card; the shortlist collects items from every source with the hop animation; the crews' drivers row is hidden behind a flag until P56 is done.

### T5 — Ask for me (6b-1)
- Status: done — 1b44a4e031 (no group list or open counts: no curated datasets)
- Files: `features/drivers/ask/**`, `packages/domain/src/drivers/ask-post.ts`, i18n `drivers/ask` EN + ID templates, `record_ask_group_open`
- Done when: the post rewrites around an edited slot; budget appears only when the user adds it; group counts come from real opens.

### T6 — Intake: paste, screenshot, contact, OS share (6c-1)
- Status: blocked — paste, screenshot and contact are done (c1ed943d23); the OS share target needs a native build batch
- Files: `features/drivers/intake/**`, `apps/mobile/src/lib/share-intake/`, `apps/mobile/targets/share-extension/`, `apps/mobile/plugins/with-share-intake.ts`, `share_provider_intake`
- Notes: native target → needs an EAS build; batch with other native changes (CLAUDE.md cost rule). Android `arm64-v8a` only.
- Done when: sharing a WhatsApp message and a Facebook screenshot from each OS lands in SHARED WITH TOKEK for every crew member.

### T7 — Extraction route, eval, check-the-card, couldn't-read (6c-2, 6c-3)
- Status: blocked — route, span checks and check-the-card are done (74f2870b94, c1ed943d23); the 43-case eval suite is not wired
- Files: `packages/ai/src/routes/provider-extract/`, `packages/ai/evals/provider-extract/`, `services/worker/src/jobs/drivers/parse-intake.ts`, `features/drivers/intake/check/**`
- Steps: wire the fixture file into a promptfoo suite; render the `render`/`crop` cases to PNG with Playwright at suite start (not committed).
- Done when: eval thresholds pass; span highlighting maps to the source; CONFIRM unlocks only when all lines are checked; ASK MADE opens WhatsApp with the templated question.

### T8 — Private tours (6f-1)
- Status: done — ae3ad962b5 (link rows until a Viator destination ref exists for the trip)
- Files: `packages/suppliers/src/private-transport/`, `services/api/src/routes/drivers.ts`, `features/drivers/private-tours/**`
- Done when: with Viator on and Klook off, Viator cards render verbatim and Klook shows its link row; a test asserts no supplier text reaches `packages/ai` payloads; fit lines come from templates.

### T9 — Compare (6d-1)
- Status: done — 75d8280ca8
- Files: `features/drivers/compare/**`, `packages/domain/src/drivers/compare.ts` (uses cost engine)
- Done when: per-car and per-day prices line up as each person's share; NOT SAID taps offer the ASK message; the risk line is deterministic and unit-tested.

### T10 — Pick for which days (6d-2) + assign op
- Status: blocked — direct SET is done (a7875e6625); "Ask the crew first" needs an assign_provider op in app.apply_change_set
- Files: `features/drivers/pick/**`, `packages/planner/src/ops/assign-provider.ts` (+ registry mount), `services/api/src/commands/drivers/assign-provider.ts`
- Done when: direct SET and the vote path both write `provider_assignments`; TAKEN days are locked; 3h-3 shows the driver; the overtime warning shows when a day window exceeds the quoted hours.

### T11 — Offline ride back (6e-4)
- Status: done — f57eebdabc (no phrase card with the pickup spot yet)
- Files: `features/drivers/offline/**`, mount in `offline-bundle.ts`
- Done when: in airplane mode the card shows name, car, plate, pickup and terms; CALL dials; WhatsApp is queued and sent on reconnect.

### T12 — Admin: pickup gaps and ask groups
- Status: blocked — dropped by the founder's 6 Oct rule (no new curated datasets); nothing to administer
- Files: `services/api/src/admin/drivers.ts`, `apps/admin/src/modules/drivers/`
- Done when: ops can add, edit and retire gaps and groups per destination; seed rows come from `plans/reports/research-260927-2116-driver-finder-seed-lists-merged-report.md` after the founder approves it and ops has checked every group URL while logged in.

### T13 — E2E + screenshots
- Status: done — ea95f48f2f (flows run on the device workflow, not locally)
- Files: `e2e/drivers/*.yaml`, `e2e/screens/drivers-find.yaml`
- Done when: flows pass locally (iOS sim + Android arm64 emulator); screenshots captured into the task report.

## Phase acceptance criteria
- [ ] Every 6a–6d, 6e-4, 6f-1 render matched, including loading/empty/error/offline
- [ ] No request anywhere reads or posts to Facebook or other groups (grep + network test)
- [ ] Supplier content never persisted or sent to the LLM (test)
- [ ] Every WhatsApp message is opened in the user's WhatsApp; the server sends none
- [ ] `provider-extract` evals green; permission suite green

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Extraction invents a phone number | Spans required per field; unconfirmed fields never shared; eval gate at 0 invented phones |
| Share Extension review friction | Extension only accepts text, URL, image, vCard; no network in the extension (hands off to the app) |
| Pickup-gap data goes stale | Curated with dates; Farefeed no-service is a second signal; admin retire |

## Non-code dependencies
Founder approval of the drafted pickup gaps + ask groups ([seed lists](../reports/research-260927-2116-driver-finder-seed-lists-merged-report.md)); ops logged-in check of group URLs; ID translation of the post template; Klook Activity API approval (else link row).

## Open questions
See plan.md §8 rows 24–33 (driver finder).
