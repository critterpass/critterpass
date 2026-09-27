---
phase: 56
title: Drivers our crews used: rating, invite, claim, directory
status: pending
depends_on: [9, 17, 21, 43, 51, 52, 55, 58]
wave: 22
features: [F-195]
screens: [6e-1, 6e-2, 6e-3, 6g-1, 6g-2, 6g-3, 6h-1, 6h-2, 3o-3]
tasks: 8
owns:
  - packages/db/src/schema/driver-directory.ts
  - packages/db/migrations/*_driver_directory.sql
  - packages/db/test/permissions/{driver-listings,driver-invites,driver-ratings,driver-tips,driver-listing-public}.test.ts
  - packages/domain/src/driver-directory/
  - services/api/src/commands/driver-directory/
  - services/api/src/routes/{driver-directory.ts,public-driver-claims.ts}
  - services/api/src/admin/driver-directory.ts
  - services/api/test/driver-directory/
  - services/worker/src/jobs/driver-directory/
  - apps/admin/src/modules/driver-directory/
  - apps/web/src/pages/d/
  - apps/web/src/components/driver-claim/
  - apps/web/tests/driver-claim/
  - apps/mobile/src/app/(trip)/[tripId]/drivers/{directory,ours}/**
  - apps/mobile/src/features/drivers/{directory,rating,invite,ours}/**
  - packages/i18n/locales/en/driver-directory/
  - packages/i18n/locales/{en,id}/driver-claim/
  - e2e/driver-directory/
  - e2e/screens/drivers-directory.yaml
mount_points:
  - apps/mobile/src/features/community/ rate-the-trip stack (driver card after the places it drove to)
  - packages/domain/src/links/ grammar (register `/d/{token}` as web-only, excluded from Universal/App Links)
  - apps/admin/src/modules/moderation/ (listing + tip reports as a queue source)
  - apps/mobile/src/features/drivers/find/ (enable the crews' drivers row from phase 55)
---
# Phase 56 — Drivers our crews used: rating, invite, claim, directory

## Context links
| Source | Section |
|---|---|
| `docs/product-decisions.md` | D21 (listing only after the driver confirms), D10 (commission-neutral; no paid placement), C36 visibility matrix, Q-57 |
| `docs/data-model.md` | §3.7 `providers` (phase 55 fields), community ratings (P52) |
| `docs/api-contracts.md` | §5 public routes (P), §3 error codes |
| Reports | `research-260927-2018-local-guide-driver-finder-feasibility-report.md` §2 (consent as lawful basis; PDPL), §3B |
| Phase inputs | P9 phone OTP (WhatsApp auth template), P17 moderation + audit, P21 link grammar, P43 recap, P51 web layout + public reader role, P52 rate-the-trip stack, P55 providers + shortlist |
| Renders | `6e-1`, `6e-2`, `6e-3`, `6g-1`, `6g-2`, `6g-3`, `6h-1`, `6h-2` |

## Overview
Goal: a directory of drivers that other crews loved. It holds only drivers who confirmed their own listing, and the ratings come only from crews who rode with them.
Done when: after a trip a crew rates their driver and invites him; he confirms on a light web page without an account; other crews then find him by area and language, see the crew ratings and message him on WhatsApp. He can pause or remove the listing at any time, and removal is immediate.

## Requirements
### F-195 Crews' drivers
| Aspect | Behaviour |
|---|---|
| Rate (6g-1) | One card per assigned provider in the rate-the-trip stack, after the places he drove to. Verdict LOVED IT / FINE / NOT AGAIN, optional tags, one tip. Any member can answer; the listing shows the crew's combined answer (majority verdict, union of tags ≥ 2 votes or the only voter). Eligible: provider assigned to ≥ 1 day of an ended trip; one combined answer per crew per driver per trip. Nothing about the rater is shown |
| Invite (6g-2) | Editable message with a single-use link `critterpass.app/d/{token}` tied to the provider's phone hash; optional ID text below the EN. OPEN IN WHATSAPP hands the text to WhatsApp; the user presses send |
| Our drivers (6g-3) | Per crew: NOT CLAIMED timeline (invite sent, link opened, waiting), expiry date (30 d), NUDGE once, CANCEL INVITE kills the token. Unclaimed providers are visible to the crew only |
| Claim (6h-1) | Web page, EN/ID, prefilled from the crew-confirmed card; editable name, areas, languages, car. YES, LIST ME needs a WhatsApp OTP to the invited number (P9 template), so "Verified" is true. The consent record stores the text version + time. Two toggles: list me, show ratings. No thanks deletes the invite. Budget: < 60 KB transferred, system fonts + one web font, no photos above the fold |
| Listed (6h-2) | Same token acts as the key (rotated on each use; the old one expires in 24 h). Pause hides the listing from 6e-1 and keeps ratings. Change details. Toggle ratings. REMOVE asks once more, then hard-deletes the listing, ratings aggregate and tips. Crews' trip-level providers keep the contact (their own data) |
| Directory (6e-1) | Filters: area (P14 regions), language, seats, day trips. Order: Wilson lower bound of loved/rated, then trip count, then listed-since; never paid, never sponsored (test). Shows only `listed` + not paused. Heart count = crews who loved it / crews who rated |
| Detail (6e-2) | Own photo (optional upload on claim), car, languages, areas, "what he tells crews" price (his words, not ours), one recent tip (crew size + month only), MESSAGE ON WHATSAPP with a first line prefilled, Add to shortlist (P55) |
| Empty (6e-3) | Nobody listed → widen to the nearest listed area, Ask for me (P55), Private tours (P55) |
| Moderation | Report on listing and tip → P17 queue; automated tip check (P13 `checkCompliance`, surface `public_text`) blocks phone numbers, URLs and other people's names; admin takedown with audit; anomaly flag when one account rates the same driver across trips from new crews |

### Undesigned states (log in `docs/undesigned-states.md`)
Claim OTP step; token invalid / used / expired pages; "Remove for good?" confirm; paused state in 6h-2; report sheet; photo upload field on the claim page; admin queue screens.

## Architecture & contracts
| Item | Contract |
|---|---|
| Tables | `driver_listings` (id, display_name, areas, languages, vehicle jsonb, price_text, photo_key?, phone_e164_enc, phone_hash uk, status pending/listed/paused/removed, show_ratings, consent_id, key_hash, key_rotated_at; C2, public projection via `public_reader`); `driver_invites` (listing_id?, provider_id, trip_id, crew_id, inviter_id, token_hash, phone_hash, status sent/opened/claimed/declined/cancelled/expired, expires_at, nudged_at; C1); `driver_ratings` (listing_id?, provider_id, trip_id, crew_id, user_id, verdict, tags; C1, aggregated per crew); `driver_tips` (listing_id?, crew_id, trip_id, text, month, status visible/held/removed; C1); `driver_listing_stats` (materialised: crews_rated, crews_loved, trips) |
| Linking | Claim links `providers.listing_id` for every trip row with the same phone hash in that crew; later crews that pick him from the directory get `listing_id` at shortlist time |
| Public routes (P) | `GET /v1/public/driver-claims/{token}`, `POST …/otp`, `POST …/confirm`, `PATCH …/listing`, `POST …/pause`, `DELETE …/listing`; rate-limited per token + IP; errors from §3 |
| Member routes | `GET /v1/driver-directory?area&lang&seats`, `GET /v1/driver-directory/{id}` |
| Commands | `rate_driver`, `invite_driver`, `nudge_driver_invite`, `cancel_driver_invite`, `report_driver_listing`, `report_driver_tip` |
| Jobs | `driver_invite.expire`, `driver_listing.stats`, `driver_listing.purge_removed` |

## Ops console design

Build this phase's console panel to its render (`design/Ops - Community.dc.html`, `docs/design-renders/pages/Ops-Community.png`); field → table → command map in `plans/reports/researcher-260928-0214-ops-designs-content-platform-inventory-report.md`. Register the panel's `count`/`work` sources with the phase 58 registry. Sample data in the render is not a spec; AI labels follow D22 routing.

| Gap in the plan | Add in this phase |
|---|---|
| DRIVERS tab in the `community` area host | add the tab to phase 55's host |
| LISTED date; rating breakdown loved / fine / not again | `driver_listings.listed_at`; `driver_listing_stats` gains per-answer counts |
| ANOMALY FLAG · RATING RING? with evidence | `driver_listing_flags (listing_id, kind, evidence jsonb, status open\|cleared)` written by the anomaly check |
| HOLD THOSE RATINGS / TAKE DOWN / CLEAR FLAG | `hold_driver_ratings {listing_id, rating_ids}` (+ `driver_ratings.status visible\|held`), `take_down_driver_listing {listing_id, reason}`, `clear_driver_flag {flag_id, reason}`, all ops |
| My work / badges | register `work` + `count` for open listing flags |

## Tasks
### T1 — Schema, public projection, permission tests
- Done when: forced RLS; `public_reader` sees only listed + unpaused columns (no phone, no raters); removal cascades are tested.

### T2 — Rate your driver card (6g-1)
- Done when: the card appears after the driver's places; combined answer rules are unit-tested; tips pass the automated check.

### T3 — Invite + our drivers (6g-2, 6g-3)
- Done when: the token is single-use, phone-bound and expires; NUDGE works once; CANCEL kills the link; timeline states match link events.

### T4 — Claim page (6h-1) with WhatsApp OTP
- Files: `apps/web/src/pages/d/`, `components/driver-claim/`, `routes/public-driver-claims.ts`
- Done when: EN/ID switch the whole page; OTP gates YES; consent recorded; Playwright asserts < 60 KB on a 3G profile; no thanks deletes the invite.

### T5 — Listed page (6h-2): pause, edit, ratings toggle, remove
- Done when: remove hard-deletes within one request and 6e-1 no longer returns him; the key rotates.

### T6 — Directory list, detail, empty (6e-1…6e-3)
- Done when: ordering test proves no paid or commission input; filters work offline from the last fetch; Add to shortlist lands in P55; the P55 hub row is enabled.

### T7 — Moderation + anomaly checks
- Done when: reports reach the P17 queue; takedown is audited and immediate; anomaly flag fires on the seeded ring scenario.

### T8 — E2E, web tests, screenshots
- Done when: mobile flows + Playwright claim/remove flows pass; screenshots are in the report.

## Phase acceptance criteria
- [ ] No driver is visible to other crews before he confirms with OTP
- [ ] Removal is immediate and complete (listing, stats, tips)
- [ ] Directory order is independent of any commission or payment (test)
- [ ] Renders matched, incl. empty, expired, removed states

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Defamation / unfair tips | Tip filter, report, takedown, crew size + month only |
| Fake ratings by the driver | Verified-phone accounts, eligibility rules, anomaly flag, admin review |
| Legal basis in VN/ID | Driver consent recorded on claim; counsel review before the flag goes on (`drivers.directory`) |

## Non-code dependencies
Counsel review (PDPL/Indonesia PDP, consent text, takedown policy); WhatsApp auth template approved for OTP (P9); ID translation of the claim pages.

## Open questions
See plan.md §8 rows 24–33 (driver finder).
