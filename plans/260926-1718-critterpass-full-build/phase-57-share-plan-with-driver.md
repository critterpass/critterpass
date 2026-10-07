---
phase: 57
title: Share the plan with your driver: page, PDF, quote back
status: in_progress
depends_on: [21, 26, 29, 51, 52, 55]
wave: 22
features: [F-196]
screens: [6i-1, 6j-1, 6j-2, 6j-3, 6k-1, 3e-1, 3e-3]
tasks: 7
owns:
  - packages/db/src/schema/plan-shares.ts
  - packages/db/migrations/*_driver_plan_shares.sql
  - packages/db/test/permissions/{driver-plan-shares,driver-plan-replies}.test.ts
  - packages/domain/src/driver-plan-shares/
  - packages/planner/src/driver-view/
  - packages/planner/test/driver-view/
  - services/api/src/commands/driver-plan-shares/
  - services/api/src/routes/public-driver-plans.ts
  - services/api/test/driver-plan-shares/
  - services/worker/src/jobs/driver-plan-shares/
  - apps/web/src/pages/t/
  - apps/web/src/components/driver-plan/
  - apps/web/tests/driver-plan/
  - apps/mobile/src/features/drivers/{share,replied}/**
  - packages/i18n/locales/en/driver-plan/
  - packages/i18n/locales/{en,id}/driver-plan-web/
  - e2e/driver-plan/
  - e2e/screens/drivers-share.yaml
mount_points:
  - trip-plan SHARE sheet (second tab "A driver or guide" next to OTHER CREWS)
  - apps/mobile/src/features/plan/review/ (render quote + reorder items and pinned tips from a driver reply)
  - packages/domain/src/links/ grammar (register `/t/{token}` as web-only)
---
# Phase 57 — Share the plan with your driver: page, PDF, quote back

## Context links
| Source | Section |
|---|---|
| `docs/product-decisions.md` | C3 (ChangeSet), C36 (budgets, private chat never shared), C41 (approval policy), Q-57, D21 |
| `docs/data-model.md` | `itinerary_versions`, `plan_days`, `plan_items`, `change_sets`, `polls` |
| `docs/api-contracts.md` | §5 public routes; ChangeSet ops |
| Phase inputs | P21 link grammar; P26 polls; P29 plan views + review changes (3e-3); P51 web layout, OG, public reader role; P52 SHARE sheet; P55 providers + `assign_provider` op |
| Renders | `6i-1`, `6j-1`, `6j-2`, `6j-3`, `6k-1` |

## Overview
Goal: the crew sends their driver a page with the days he's needed. He can read it without logging in and send back a quote, a suggested order and tips. His reply arrives as a proposal the crew votes on.
Done when: SHARE → "A driver or guide" creates a link for the chosen days. The page and PDF show only first names, no budgets and no chat. A quote with a reorder becomes a ChangeSet vote in 6k-1, and tips pin to the days without a vote. Revoking or expiring the link switches the page off at once.

## Requirements
### F-196 Share with your driver
| Aspect | Behaviour |
|---|---|
| Share sheet (6i-1) | Days picker (defaults to days assigned to the provider, else selected), expiry (default 14 d, max 60 d), "Let {name} send a quote" toggle, COPY, SEND ON WHATSAPP (user sends), PDF, open count + last opened, REVOKE (confirm once). One active link per provider per trip; new link supersedes |
| Driver view projection | `packages/planner/src/driver-view/`: party size, dates, stay area, must-dos, per day: times, stop names (local-language names where the POI DB has them), pickup pins as Google Maps links, notes like "Tickets bought"/"Sarongs needed". **Excluded (tested):** budgets, prices other than the driver's own agreed terms, chat, votes, comments, last names, phone numbers, other providers |
| Web page (6j-1) | `/t/{token}`, EN/ID for the whole page; readable at 360 px, 16 px body, high contrast; sticky SEND A QUOTE / SUGGEST CHANGES / ADD A TIP when quotes are allowed; no Universal Link; `noindex`; OG preview shows only "Trip plan from {first name}" |
| Switched off (6j-3) | Revoked and expired copies; no trip details beyond the sharer's first name; "Your quote from {date} is still with the crew" when one exists |
| Quote (6j-2) | Price per day (IDR formatting by locale), included items, overtime per hour after N hours, car; reorder by drag or tap-to-move per day (re-time suggestion allowed); tips (≤ 5, 280 chars, no URLs); SEND TO THE CREW. Rate-limited per token; one open reply per token (later sends replace it until the crew votes) |
| Replied (6k-1) | Reply → ChangeSet authored by an external-provider actor: `assign_provider` terms item (price, includes, overtime) + reorder/retime ops as separate items; tips attach to days as pinned notes (no vote). Poll uses C41 defaults (money → majority of affected); YES TO ALL or one by one; per-person delta from the cost engine; "0 MUST-DOS TOUCHED" check; at threshold Tokek applies it and offers the WhatsApp confirm message (user sends) |
| PDF | Same projection rendered by the worker, cached per share version, deleted on revoke/expiry |

### Undesigned states (log in `docs/undesigned-states.md`)
Quote sent confirmation page; quote replaced; share with no days selected; PDF generating; link opened offline (app side shows last known open count).

## Architecture & contracts
| Item | Contract |
|---|---|
| Tables | `driver_plan_shares` (trip_id, provider_id?, created_by, itinerary_version_id, day_ids, token_hash, allow_quote, expires_at, revoked_at, open_count, last_opened_at, pdf_key?; C1); `driver_plan_replies` (share_id, price_minor, currency, includes, overtime_minor?, included_hours, car, reorder jsonb, tips jsonb, change_set_id?, status open/replaced/decided; C1) |
| Public routes (P) | `GET /v1/public/driver-plans/{token}` (projection + locale), `GET …/pdf`, `POST …/reply`; `SHARE_REVOKED` / `SHARE_EXPIRED` errors (add to §3) |
| Commands | `create_driver_plan_share`, `revoke_driver_plan_share`, `update_driver_plan_share` |
| Realtime | reply → `change_set.proposed` event on the trip channel; open → counter update |
| Versioning | Share pins `itinerary_version_id`; the page shows the latest version's projection for the pinned days and a small "updated {time}" line when it changed |

## Tasks
### T1 — Schema, projection, permission + leak tests
- Done when: the projection test fails if any excluded field appears; RLS + public_reader grants are tested.
- Status: done — c426738268

### T2 — Share sheet tab (6i-1)
- Done when: create/copy/WhatsApp/PDF/revoke work; open count updates live.
- Status: done — e5e637d12c (create, copy, WhatsApp, revoke, live open count; the PDF button waits on T4)

### T3 — Web page + switched-off page (6j-1, 6j-3)
- Done when: EN/ID pass; 360 px visual check; revoke flips the page on the next request (no edge cache on token pages).
- Status: done — 0f0144663e

### T4 — PDF render
- Done when: the PDF matches the page content; it is removed on revoke; the size is ≤ 1 MB.
- Status: blocked — needs a decision: the worker can draw the PDF without a browser (`@napi-rs/canvas` writes PDF), but the projection loader lives in the api, the serving route and the revoke hook are api work, and stop names in local scripts need fonts in the worker image

### T5 — Quote + suggestions form (6j-2)
- Done when: validation, rate limit and replace semantics are tested; the reply creates the ChangeSet + tips.
- Status: done — 66c08adf6a (reorder/retime become the ChangeSet; the quote terms item waits on the `assign_provider` op of phase 55)

### T6 — Made replied (6k-1) in review changes
- Done when: per-item votes, per-person delta and the must-do check are shown; at threshold the provider terms are set on both days and the WhatsApp confirm is offered.
- Status: done — 9b59cc64c1 (the quote is voted as the terms of picking him, the voted terms become his terms, and his reply offers the WhatsApp confirm once the vote set him)

### T7 — E2E, web tests, screenshots
- Done when: share → web quote → crew vote runs end to end (mobile flow + Playwright); screenshots are in the report.
- Status: blocked — partial: Playwright suite (5b963000bc), api suite and lab-scene device flow are in; a live share → web quote → crew vote Maestro flow is not

## Phase acceptance criteria
- [ ] Budgets, chat, votes, last names never reach the page, PDF or OG image (tests)
- [ ] Driver input never edits the plan directly; always a ChangeSet
- [ ] Revoke/expiry immediate; renders matched

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Link forwarded to strangers | First names only, no phones, expiry, revoke, open count visible to the crew |
| Spam via the quote form | Token-scoped rate limit, size caps, no URLs in tips |

## Non-code dependencies
ID translation of the web page strings.

## Open questions
See plan.md §8 rows 24–33 (driver finder).
