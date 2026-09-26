---
phase: 35
title: Supplier layer, rides, vendor comms & concierge desk
status: pending
depends_on: [13, 14, 17, 29, 33, 34]
wave: 16
features: [F-103, F-104, F-117]
screens: [3h-3, 3j-1, 3c-7, 3c-8, 3c-9, 3c-12, 3f-1, 3f-3, 3f-4, 3f-6, 3f-7, 4f-1, 3e-2, 3k-1, 3k-5, 3k-9, 3k-10]
tasks: 14
owns:
  - infra/powersync/streams/suppliers.yaml
  - packages/suppliers/ (except src/travelpayouts/fares/ and src/flight-status/, owned by the fares and bookings phases)
  - packages/domain/src/suppliers/
  - packages/domain/src/vendor-comms/
  - packages/db/src/schema/suppliers.ts
  - packages/db/migrations/*_supplier_orders_affiliate.sql
  - packages/db/migrations/*_rides_providers.sql
  - packages/db/migrations/*_vendor_messaging.sql
  - packages/db/test/permissions/{supplier-orders,affiliate,rides,providers,vendor-messaging}.test.ts
  - packages/ai/src/routes/vendor-reply/
  - packages/ai/evals/vendor-reply/
  - packages/i18n/locales/en/suppliers/
  - services/api/src/commands/suppliers/
  - services/api/src/suppliers/
  - services/api/src/routes/webhooks/{viator.ts,whatsapp-vendor.ts}
  - services/worker/src/jobs/suppliers/
  - services/api/src/admin/vendor-desk/
  - apps/admin/src/modules/vendor-desk/
  - apps/mobile/src/app/(trip)/getting-around.tsx
  - apps/mobile/src/app/(modal)/supplier/
  - apps/mobile/src/features/bookings/getting-around/
  - apps/mobile/src/features/bookings/supplier/
  - e2e/suppliers/
---
# Phase 35 — Supplier layer, rides, vendor comms & concierge desk

## Context links
| Source | Section |
|---|---|
| `docs/product-decisions.md` | D10 (never MoR; Viator Full + Booking; links; Grab Farefeed; WhatsApp only after approval; lotteries = reminders; clinic = human); §5 truthful copy table (canonical); C41 (votes close before hold expiry), C43 (no stay holds); §7 Q-57 |
| `docs/data-model.md` | §3.7 `supplier_orders`, `supplier_order_items`, `affiliate_clicks`, `affiliate_conversions`, `ride_quotes`, `rides`, `providers`; §3.16 `ops.concierge_tasks`, `ops.vendor_threads`, `ops.vendor_messages`, `ops.partner_adapters` |
| `docs/data-model-sync-and-privacy.md` | §1 "Supplier content never persisted"; §3.5 Viator order state machine; provider contacts offline view |
| `docs/api-contracts.md` | §4.11 commands; §5 `GET /v1/rides/quote`, `GET /v1/suppliers/offers`, `GET /v1/suppliers/bookings/{id}/cancel-quote`, `/webhooks/viator`, `/webhooks/whatsapp`; §6 tools `bookable_activity`, `ride_quote`, `propose_hold`, `propose_vendor_message`; §7 adapter interface + per-supplier table; errors `HOLD_EXPIRED`, `SUPPLIER_UNAVAILABLE`, `SUPPLIER_REJECTED`, `PAYMENT_PENDING`, `UPSTREAM_TIMEOUT` |
| `docs/api-contracts-async.md` | queues `supplier.hold_expiry`, `vendor.reply_parse`, `trip.dropout` (Viator cancel input) |
| `docs/system-architecture.md` | §4.9 supplier layer, §10 ops (fixed outbound IP, 120 s timeouts) |
| Reports | `researcher-260926-1649-travel-supplier-apis-report.md` §4–§11 (authority); `design-analysis-260926-1143-bookings-money-guide-report.md` 3h-3, 3j-1; `design-analysis-260926-1143-during-trip-report.md` 3k-5, 3k-9, 3k-10; `researcher-260926-1143-ai-guide-report.md` (autonomy, compensation); master §2 rows F-103, F-104, F-117, R1 |
| Phase inputs | P13 tool registry + GuideAction inverse registry; P14 POIs/routing (ride legs, local-script addresses); P17 ops console (concierge queue, `ops.approvals`, flags); P33 expenses (voucher/ride → expense); P34 bookings (voucher into wallet, insurance share) |
| Renders | `docs/design-renders/screens/3h-3_Getting_around.png`, `3j-1_Guide_chat.png`, `3k-5_Flight_delayed.png`, `3k-10_Crew_SOS.png`, `3c-8_Pon_is_drafting.png`, `3c-12_*.png`, `3f-1_*.png`, `3f-4_*.png` |

## Overview
Goal: one server-only supplier layer that makes every designed real-world action truthful: affiliate deep links with attribution and disclosure, Viator in-app activity booking with real holds (Viator is merchant of record), partner APIs (Agoda Demand, Klook, Trip.com) built and switched on by flag at approval, Grab fare + ETA + deep link for rides, and user-approved WhatsApp vendor messages and clinic hand-offs run by a human ops desk.
Done when: a guide-proposed Viator activity can be held ("{n} seats held until {time}" only when availability is `HOLDING`), paid in the Viator payment form with 3DS, and lands as a voucher booking + expense; every affiliate CTA records an opaque sub-id click and shows the disclosure; 3h-3 shows a real Grab estimate + Open Grab; a vendor draft is sent by ops only after the user approves the exact text and the reply appears as a card; every copy key follows the §5 table for the current flag state.

## Requirements
### F-103 Supplier bookings (3c-7, 3c-8, 3c-12, 3f-1/3/4/6/7, 4f-1, 3j-1, 3k-1)
| Aspect | Behaviour |
|---|---|
| Stays | no holds anywhere (D10, C43). Affiliate deep links (Agoda, Trip.com, Booking.com via CJ) through Travelpayouts with `sub_id`; stay copy "Free-cancel rooms at {hotel} on Agoda, from ~$X a night (seen {time})"; booked stays enter the wallet by forward/paste (P34) showing the real cancellation deadline. Agoda Demand flag on: live rates + "Checked live rooms…" copy; Fulfill Assisted booking only when its PCI path is approved (Open question 2) |
| Activities | Viator Full + Booking: search/availability → cart hold (≤ 16 items) → `holding` or `hold_not_provided` → payer opens Viator payment form (hosted iframe in WebView, 3DS) → `booking` → `confirmed` / `pending_operator` ("Waiting for the operator", status poll ≥ 3 min) / `rejected`; voucher → `bookings(source=viator)` + `add_expense(source=booking, payer)`; cancel quote shown before `cancel_activity_booking` ("Cancelled · full refund" only after success); dropout (P31 `trip.dropout`) calls cancel when applicable. Klook / GYG / Trip.com links until their flags turn on |
| Hold truth | "{n} seats held until {time}" only for availability `HOLDING`; "Price held until {time}" for pricing-only; `HOLD_NOT_PROVIDED` → "Book now · seats not held"; ticker "TOKEK HELD 6 BOAT SEATS" only while `HOLDING`, else "TOKEK FOUND…"; hold timer chip counts down; `supplier.hold_expiry` releases before lapse and closes linked votes (poll `closes_at ≤ hold_valid_until`, C41) |
| Lotteries (3c-7, 3c-9) | reminders only: "Entries close {date}. Each of you enters on the official site — I'll remind you." → per-participant `scheduled_events` reminder + official link; "results {date} · reminder set" |
| Supplier content | verbatim inside supplier cards only, attributed ("from Viator"), fetched per view, never cached, never persisted, never in prompts or `llm.*`; guide uses curated POI DB; enforced by dependency-cruiser rule (`packages/ai` cannot import `packages/suppliers` content types) + test that `supplier_orders` has no content columns |
| Ranking & disclosure | commission-neutral: ranking computed from POI/taste/cost signals before partner attach; partner choice by availability + price then fixed order; disclosure "We may earn a commission. It never changes what Pon recommends." on every card with an affiliate link |
| Partner adapters | Agoda Demand (Fulfill Assisted), Klook Activity API, Trip.com Attractions & Tours distributor, GYG Partner API: full adapters behind `ops.partner_adapters` flags; flag on → copy mode switches per §5 table without app release (server-driven `client_config`) |
| Undesigned (design in code) | supplier offer card, Viator booking sheet (date/time/option/pax, traveller details), payment WebView states (loading, 3DS challenge, failed, cancelled), pending operator, booked/voucher view, cancel sheet with quote, hold expired ("The hold ran out — check again"), supplier down (`SUPPLIER_UNAVAILABLE` → link fallback) |

### F-104 Rides (3h-3)
- Pre-booked transfer (from wallet voucher, P34): "Airport pickup booked on Klook (from your email) · driver details from your voucher" (driver name/phone/plate only if in the user's voucher).
- In-trip "CALL A CAR": `GET /v1/rides/quote` → Grab Farefeed estimate (services, ETA, min/max fare, surge notice) → "Grab estimates Rp X–Y, about {n} min away · Open Grab" (deep link pre-filled pickup/drop-off); Gojek deep link fallback; markets without Grab → phrase card + taxi / Uber deep link. No live car on our map, no "booked by Tokek".
- Map: route (Valhalla, P14) origin → destination pin; the designed car creep + draining ETA bar become the **estimated journey progress** after the user returns from Grab and taps "I'm in the car" (time-based along the route, labelled "estimate"); undesigned states: quote loading, no service, surge notice, returned from Grab, arrived.
- Phrase card "SHOW THIS TO {driver/THE DRIVER}" with local-script address from POI DB + gloss + play (TTS) — renders the guide phrase card component (Open question 1).
- "LATER TODAY · VILLA → WARUNG BIAH BIAH · 12 min by car · Rp 60k, split 6" → button "OPEN GRAB" + after the ride "LOG IT" → `add_expense(source=ride)` split across the plan item attendees (`rides` row links expense).
- Transfer links pre-trip: Klook, Trip.com, Kiwitaxi, GetTransfer ("Airport pickup on {supplier}").

### F-117 Vendor comms & concierge desk (3e-2, 3k-5, 3k-9, 3k-10)
| Flow | Behaviour |
|---|---|
| Draft | guide `propose_vendor_message` or user action ("Ask Locavore to hold a table for 6 until 21:00? I'll draft the WhatsApp.") → `request_vendor_message` → user sees exact text (editable) |
| Approve | `approve_vendor_message` (app or notification action) → `ops.concierge_tasks(kind=vendor_message)` → ops desk sends via WhatsApp Business Cloud API template (business-initiated) or free text inside the 24 h service window → card "Sent 10:45, waiting" |
| Reply | `/webhooks/whatsapp` (signature) → `vendor.reply_parse` (Haiku, AI-31: intent yes/no/counter/question) → card "Locavore replied: yes" + suggested next step (ChangeSet via P13 if plan changes); raw reply shown verbatim |
| Guide copy | "I've asked…" until confirmed; never "table held" / "Made rebooked" / "Villa knows" before a reply |
| Clinic hand-off (3k-10) | `request_concierge(kind=clinic)` → ops desk task (human calls the clinic with the user); insurance share only after `CONSENT(insurance_to_clinic)` via P34 `app.share_insurance`; copy "Ops desk is calling the clinic with you — share insurance details?"; the guide never phones |
| Ops desk | `apps/admin` vendor desk module: queue by due time, approved text read-only, send, thread view, reply status, SLA timers, phone-hours note (07:00–23:00 SGT); outside hours the user is told "The desk answers from 07:00 SGT" |
| Compensation | GuideAction kinds registered with inverses: `hold_activity` ↔ `release_activity_hold`; `book_activity` ↔ `cancel_activity_booking` (needs approval, shows quote); `vendor_message` ↔ follow-up correction draft (needs approval); unregistered kinds forbidden (P13) |
| Undesigned | vendor thread list per trip, "desk offline" state, template rejected, number not on WhatsApp → "Call them yourself" with `tel:` and phrase card |

## Architecture & contracts
| Area | Delta |
|---|---|
| Migrations | `*_supplier_orders_affiliate.sql`: `supplier_orders`, `supplier_order_items`, `affiliate_clicks`, `affiliate_conversions` (`supplier_calls` already exists — created by P15 suppliers core) ; `*_rides_providers.sql`: `ride_quotes`, `rides`, `providers` (+ `provider_contacts_offline` view); `*_vendor_messaging.sql`: `ops.vendor_threads`, `ops.vendor_messages` (+ `approved_text_sha256`) |
| RLS backstop | `supplier_orders` buyer write (O), trip read (T) status/amount only; `affiliate_*`, `supplier_calls` S (no user read); `rides`, `ride_quotes`, `providers` T; `ops.*` admin only; `send_vendor_message` DB check: message row must have `approved_by_user_id` and text hash equal to the approved text |
| Streams | `trip`: `supplier_orders`, `supplier_order_items`, `rides`, `ride_quotes`, `providers` (contact via offline view) |
| Commands (§4.11) | `record_supplier_click`, `hold_activity`, `book_activity`, `cancel_activity_booking`, `release_activity_hold`, `request_vendor_message`, `approve_vendor_message`, `send_vendor_message` (ops), `request_concierge`; new (doc delta): `log_ride {trip_id, leg_ref, provider, amount?, currency?, attendees[]}` (creates `rides` + optional expense), `set_entry_reminder {trip_id, must_do_id, closes_at, results_at, url}` |
| HTTP | `GET /v1/suppliers/offers`, `GET /v1/suppliers/bookings/{id}/cancel-quote`, `GET /v1/rides/quote`, `GET /v1/suppliers/payment-session/{hold_id}` (Viator payment form session), `/webhooks/viator` (disabled until partner push confirmed), `/webhooks/whatsapp` vendor path |
| Jobs | `supplier.hold_expiry`, `supplier.viator.poll` (modified-since, ≥ 3 min per booking), `supplier.affiliate_conversions` (daily Travelpayouts statistics import → `affiliate_conversions`), `vendor.reply_parse`, `supplier.agoda.booking_poll` (flag) |
| AI tools | executors `bookable_activity` (ids + price_from + hold_supported only), `ride_quote`, `propose_hold`, `propose_vendor_message` |
| Adapters | `packages/suppliers/src/{core/,viator/,agoda/,klook/,tripcom/,gyg/,travelpayouts/links/,booking-cj/,transfers/,grab/,gojek/,whatsapp/}`; core: `SupplierAdapter` (api-contracts §7), `fetchWithEgress` (Railway static outbound IP), 120 s timeout, retries only on idempotent reads, `supplier_calls` audit (P15 core: `fetchWithEgress` + audit writer; this phase adds `SupplierAdapter`), flag guard, no-cache headers |
| Copy | `packages/domain/src/suppliers/copy-rules.ts`: pure `supplierCopy(action, state, flags) → {key, params}` implementing the §5 table; consumed by P30/P31/P36/P37 UIs (not P28 — earlier wave, does not import it); catalog `packages/i18n/locales/en/suppliers/` |

## Tasks
### T1 — Supplier core, schema, permission tests
- Goal: adapter framework + all phase tables.
- Files: `packages/suppliers/src/core/{adapter.ts,http.ts,audit.ts,flags.ts,errors.ts}`, `packages/db/src/schema/suppliers.ts`, 3 migrations in owns, `packages/db/test/permissions/{supplier-orders,affiliate,rides,providers,vendor-messaging}.test.ts`, `.dependency-cruiser.cjs` rule entry
- Steps: 1. Interface + typed errors mapping to api-contracts §3. 2. Egress client (static IP env, timeout, abort, audit row). 3. Tables + RLS + publication + `infra/powersync/streams/suppliers.yaml`. 4. Content-isolation rule + schema test (no content columns).
- Tests: `pnpm --filter @critterpass/suppliers test -- core`; `pnpm --filter @critterpass/db test -- permissions/supplier-orders permissions/affiliate permissions/rides permissions/providers permissions/vendor-messaging`; `pnpm depcruise`
- Done when: timeout at 120 s returns `UPSTREAM_TIMEOUT`; `packages/ai` importing supplier content types fails CI.

### T2 — Affiliate links, click attribution, conversions, disclosure
- Goal: every link partner live with sub-id tracking.
- Files: `packages/suppliers/src/{travelpayouts/links/,booking-cj/,gyg/links.ts,transfers/,gojek/}`, `services/api/src/commands/suppliers/record-supplier-click.ts`, `services/worker/src/jobs/suppliers/affiliate-conversions.ts`, `packages/domain/src/suppliers/{ranking-guard.ts,disclosure.ts}`, `services/api/test/suppliers/affiliate.test.ts`
- Steps: 1. Deep-link builders per partner (Agoda, Trip.com, Booking.com CJ, Klook, GYG, Kiwitaxi, GetTransfer, Gojek) with opaque `sub_id`. 2. Bridge redirect on `go.critterpass.app/r/{sub_id}` for attribution (route handed to P21 link resolver as a registered target). 3. Click command (offline OK; URL built server-side on sync, cached link shown offline). 4. Daily conversions import. 5. Ranking guard test: identical results with commission rates permuted.
- Tests: `pnpm --filter @critterpass/suppliers test -- links`; `pnpm --filter @critterpass/api test -- suppliers/affiliate`
- Done when: each partner link resolves to the partner domain with our marker + sub_id; permuting commission rates never changes order.

### T3 — Viator adapter (Full + Booking)
- Goal: complete Viator API client passing certification checks.
- Files: `packages/suppliers/src/viator/{client.ts,search.ts,availability.ts,cart.ts,book.ts,status.ts,cancel.ts,mappers.ts}`, `packages/suppliers/test/viator/*.test.ts`
- Steps: 1. Products/availability/check. 2. `/bookings/cart/hold` (≤ 16) mapping `pricing.status` + availability `HOLDING`/`HOLD_NOT_PROVIDED` + `validUntil`. 3. Payment session for Viator payment form (`VIATOR_FORM`). 4. `/bookings/cart/book`, status (rate limit 1/3 min), modified-since poll. 5. Cancel quote + cancel; amendment reasons. 6. Per-endpoint rolling 10 s rate limiter.
- Tests: `pnpm --filter @critterpass/suppliers test -- viator` (unit on recorded sandbox responses) + `VIATOR_SANDBOX=1 pnpm --filter @critterpass/suppliers test:live -- viator` (real sandbox)
- Done when: live sandbox run completes search → hold → book → cancel; rate limiter never exceeds documented limits.

### T4 — Viator order flow: commands, hold expiry, voucher → wallet, compensation
- Goal: server state machine §3.5 wired to wallet, money, votes, GuideActions.
- Files: `services/api/src/commands/suppliers/{hold-activity.ts,book-activity.ts,cancel-activity-booking.ts,release-activity-hold.ts}`, `services/api/src/suppliers/{offers-route.ts,payment-session.ts,cancel-quote.ts}`, `packages/domain/src/suppliers/order-state.ts`, `services/worker/src/jobs/suppliers/{hold-expiry.ts,viator-poll.ts,dropout-cancel.ts}`, `services/api/src/routes/webhooks/viator.ts`, `services/api/test/suppliers/viator-flow.test.ts`
- Steps: 1. Table-driven state machine + transition trigger. 2. Hold → `supplier.hold_expiry` scheduled before `validUntil`; emits `hold.expiring`; registers the Viator implementations of P29's `HoldExpiryProvider` (poll `closes_at` clamp) and `BookingImpactProvider` (fee/cancel window, supplier refusal → blocked). Holds are placed only at booking time (after RSVP/vote), never at proposal time; if `validUntil` is shorter than the minimum vote window (`ops_config supplier.min_vote_window_min`, default 60), no hold is taken and copy is "book when agreed". 3. Book → pending poll → confirmed → P34 `add_booking(source=viator)` + P33 expense in one tx. 4. Cancel with quote. 5. `trip.dropout` handler. 6. Register GuideAction inverses + `bookable_activity`, `propose_hold` executors.
- Tests: `pnpm --filter @critterpass/api test -- suppliers/viator-flow` (Testcontainers + recorded sandbox)
- Done when: every state transition covered; hold expiry releases and closes linked vote; duplicate `book_activity` op_id never double-books; P29 clamp test: poll `closes_at` ≤ hold `validUntil`; booking-impact and supplier-refusal tests pass; a 20-min hold fixture yields no hold + "book when agreed".

### T5 — Truthful copy rules + supplier card + booking sheet UI
- Goal: in-app offer cards and Viator booking/payment on both platforms.
- Files: `packages/domain/src/suppliers/copy-rules.ts`, `packages/domain/test/suppliers/copy-rules.test.ts`, `packages/i18n/locales/en/suppliers/`, `apps/mobile/src/features/bookings/supplier/{OfferCard.tsx,HoldTimer.tsx,BookingSheet.tsx,PaymentWebView.tsx,CancelSheet.tsx,Disclosure.tsx}`, `apps/mobile/src/app/(modal)/supplier/{offer.tsx,book.tsx,cancel.tsx}`, `e2e/suppliers/viator-booking.yaml`
- Steps: 1. `supplierCopy` covering every §5 row × flag state (table test). 2. Offer card (verbatim content fetched per view, attribution, disclosure, "seen {time} on {supplier}"). 3. Booking sheet + react-native-webview payment form with 3DS return handling. 4. Pending/booked/voucher/expired/cancel states. 5. Link fallback when flag off or `SUPPLIER_UNAVAILABLE`.
- Tests: `pnpm --filter @critterpass/domain test -- suppliers/copy-rules`; `pnpm --filter mobile test -- features/bookings/supplier`; `maestro test e2e/suppliers/viator-booking.yaml` (Viator sandbox, test card with 3DS challenge)
- Done when: no rendered string contains "held" unless state is `HOLDING` (copy-rule test enumerates all states); sandbox booking lands in the wallet.

### T6 — Agoda Demand adapter (flagged)
- Goal: Demand API rates + Fulfill Assisted booking + two-step cancel + BookingDetail, off by default.
- Files: `packages/suppliers/src/agoda/{client.ts,search.ts,precheck.ts,book.ts,booking-detail.ts,cancel.ts}`, `packages/suppliers/test/agoda/*.test.ts`, `services/worker/src/jobs/suppliers/agoda-booking-poll.ts`
- Steps: 1. Client with IP-whitelisted egress. 2. Search/rates → stay offer card data (verbatim, uncached). 3. Precheck + book via supplier-hosted or tokenised card path (Open question 2) behind `supplier.agoda_demand.book`. 4. Cancel two-step; BookingDetail poll → wallet. 5. Copy-mode switch via `ops.partner_adapters`.
- Tests: `pnpm --filter @critterpass/suppliers test -- agoda` (recorded responses from Agoda's published API samples); `AGODA_SANDBOX=1 … test:live -- agoda` once credentials exist
- Done when: unit suite green; flag off → adapter never called (asserted); flag on in staging with credentials passes the live run.

### T7 — Generic activity-adapter contract + GYG Partner API adapter (flagged)
- Goal: a no-hold activity adapter contract any partner plugs into, proven with GYG (public OpenAPI).
- Files: `packages/suppliers/src/activity-adapter/{contract.ts,conformance.ts}`, `packages/suppliers/src/gyg/{client.ts,search.ts,book.ts,status.ts,cancel.ts}`, `packages/suppliers/test/{activity-adapter,gyg}/*.test.ts`
- Steps: 1. `ActivityAdapter` contract + reusable conformance suite (search → book → status → cancel, `hold_not_provided`). 2. GYG from OpenAPI → generated types; map to `SupplierOffer`/`BookRequest`; copy "Book on {supplier} · {n} left". 3. Flag `supplier.gyg_api`. 4. Order flow reuse from T4 with `hold_not_provided` path.
- Tests: `pnpm --filter @critterpass/suppliers test -- activity-adapter gyg`
- Done when: GYG type-checks against its published OpenAPI and passes the conformance suite on recorded responses; flag default off.

### T7b — Klook Activity API + Trip.com Attractions distributor adapters (runs when approval + docs arrive)
- Goal: plug both partners into the T7 contract. Both API docs are login-gated (supplier report), so this task is scheduled on approval, not in the wave; until then their deep links (T2) remain the path.
- Files: `packages/suppliers/src/{klook,tripcom}/{client.ts,search.ts,book.ts,status.ts,cancel.ts}`, `packages/suppliers/test/{klook,tripcom}/*.test.ts`
- Steps: 1. Implement against the partner docs received at approval. 2. Flags `supplier.klook_activity_api`, `supplier.tripcom_distributor`. 3. Run T7 conformance suite.
- Tests: `pnpm --filter @critterpass/suppliers test -- klook tripcom`
- Done when: both pass the conformance suite on recorded partner sandbox responses; flags default off.

### T8 — Rides: Grab Farefeed, Gojek fallback, ride logging
- Goal: fare + ETA + deep link, ride legs and expenses.
- Files: `packages/suppliers/src/grab/{oauth.ts,farefeed.ts}`, `packages/suppliers/src/gojek/deeplink.ts`, `services/api/src/suppliers/rides-quote.ts`, `services/api/src/commands/suppliers/log-ride.ts`, `services/api/test/suppliers/rides.test.ts`
- Steps: 1. Partner OAuth client-credentials (`ride.estimate`). 2. Quote route (60 s cache of our quote only, per api-contracts) → `ride_quotes`. 3. Market availability table (Grab SEA cities; Gojek ID; else taxi/Uber link). 4. `log_ride` → `rides` + P33 expense split by attendees. 5. `ride_quote` tool executor ("never claim a car is booked").
- Tests: `pnpm --filter @critterpass/api test -- suppliers/rides`; `GRAB_SANDBOX=1 pnpm --filter @critterpass/suppliers test:live -- grab`
- Done when: Denpasar airport → Ubud quote returns fare range + deep link on replayed Farefeed fixtures; ride log creates a split expense. Live Grab run on staging → P54 launch checks.

### T9 — Getting around screen (3h-3)
- Goal: truthful redesign of 3h-3 in the app.
- Files: `apps/mobile/src/app/(trip)/getting-around.tsx`, `apps/mobile/src/features/bookings/getting-around/{RouteMap.tsx,TransferCard.tsx,GrabEstimateCard.tsx,JourneyProgress.tsx,LaterTodayRow.tsx}`, `e2e/suppliers/getting-around.yaml`
- Steps: 1. Map (P14 MapLibre) with route + pins. 2. Transfer card from wallet voucher or Grab estimate card + OPEN GRAB / Gojek. 3. "I'm in the car" → time-based journey progress (labelled estimate), arrival haptic. 4. Phrase card via `PhraseCardSlot` registry (P32 registers its `<PhraseCard>`; until then/in tests a stub address card renders) + large "show to driver" mode. 5. LATER TODAY legs from plan with OPEN GRAB / LOG IT. 6. Offline: last quote shown with time, phrase card works offline.
- Tests: `pnpm --filter mobile test -- features/bookings/getting-around`; `maestro test e2e/suppliers/getting-around.yaml`
- Done when: no live-driver UI exists; deep link opens Grab (or store page) with pickup/drop-off; LOG IT creates the split expense.

### T10 — WhatsApp vendor messaging: approval guard, send, webhook
- Goal: approved-only sending with delivery status.
- Files: `packages/suppliers/src/whatsapp/{client.ts,templates.ts,webhook-verify.ts}`, `packages/domain/src/vendor-comms/{draft.ts,approval.ts,state.ts}`, `services/api/src/commands/suppliers/{request-vendor-message.ts,approve-vendor-message.ts,send-vendor-message.ts}`, `services/api/src/routes/webhooks/whatsapp-vendor.ts`, `services/api/test/suppliers/vendor-comms.test.ts`
- Steps: 1. Cloud API client (templates, session messages, delivery status). 2. Draft → approval (hash of exact text) → ops task; send guard in DB + handler. 3. Webhook signature + routing to thread. 4. `propose_vendor_message` executor + GuideAction inverse.
- Tests: `pnpm --filter @critterpass/api test -- suppliers/vendor-comms`
- Done when: sending an unapproved or edited-after-approval text is rejected at handler and DB; bad webhook signature rejected.

### T10b — Vendor reply parsing + eval
- Goal: inbound vendor replies → structured intent, treated as untrusted.
- Files: `services/worker/src/jobs/suppliers/vendor-reply-parse.ts`, `packages/ai/src/routes/vendor-reply/`, `packages/ai/evals/vendor-reply/`, `services/worker/test/suppliers/vendor-reply.test.ts`
- Steps: 1. AI-31 reply intent (Haiku, no tools, reply inside delimited untrusted block). 2. Eval incl. multilingual and injection cases.
- Tests: `pnpm --filter @critterpass/ai eval -- vendor-reply`; `pnpm --filter @critterpass/worker test -- suppliers/vendor-reply`
- Done when: reply "ok 13:50 bisa" parses to yes + time; injection replies never change intent schema or trigger actions.

### T10c — Concierge hand-off + lottery reminders
- Goal: human clinic/other concierge requests and lottery entry reminders.
- Files: `services/api/src/commands/suppliers/{request-concierge.ts,set-entry-reminder.ts}`, `services/api/test/suppliers/concierge.test.ts`
- Steps: 1. Concierge request (clinic/other) → ops task + insurance share hook (P34). 2. Lottery `set_entry_reminder` via `scheduled_events` per participant + official link (3c-7, 3c-9).
- Tests: `pnpm --filter @critterpass/api test -- suppliers/concierge`
- Done when: concierge creates one ops task (idempotent); reminder fires per participant at `closes_at` − lead; no entry is ever submitted by us.

### T11 — Ops vendor desk (admin) + in-app vendor cards
- Goal: human desk UI and user-facing status cards.
- Files: `services/api/src/admin/vendor-desk/{routes.ts,queries.ts}`, `apps/admin/src/modules/vendor-desk/{Queue.tsx,Thread.tsx,SendPanel.tsx,ConciergeTask.tsx}`, `apps/mobile/src/features/bookings/supplier/{VendorDraftCard.tsx,VendorThreadCard.tsx,ConciergeCard.tsx}`, `e2e/suppliers/vendor-message.yaml`, `apps/admin/e2e/vendor-desk.spec.ts`
- Steps: 1. Admin queue (P17 shell, audited), SLA timers, send with approved text read-only. 2. Thread view + reply status. 3. Mobile cards: "Draft ready — send?" → "Sent {time}, waiting" → "{vendor} replied: …"; desk-hours state; not-on-WhatsApp fallback (`tel:` + phrase card). 4. Notification action approve (N category registered with P11).
- Tests: `pnpm --filter admin test:e2e -- vendor-desk` (Playwright); `maestro test e2e/suppliers/vendor-message.yaml`
- Done when: end-to-end on local stack with replayed WhatsApp webhook fixtures: user approves → ops sends → reply card appears on device. Live WhatsApp test-number run → P54 launch checks.

## Phase acceptance criteria
- [ ] Permission suites for all phase tables pass; `ops.*` unreadable by app roles.
- [ ] Supplier content never persisted or sent to the LLM (schema test + depcruise rule + prompt-assembly test).
- [ ] Copy-rule table test covers every §5 row × flag state; "held" only with `HOLDING`.
- [ ] Viator sandbox: hold → pay (3DS) → confirmed → wallet + expense; cancel with quote; hold expiry closes the linked vote.
- [ ] Affiliate clicks carry opaque sub-ids; ranking invariant to commission; disclosure on every affiliate card.
- [ ] Grab quote + deep link works on replayed fixtures (live run in P54); no live-driver UI.
- [ ] Vendor messages sent only with matching approved text; replies parsed and shown.
- [ ] All outbound calls through fixed egress with ≤ 120 s timeouts (audited in `supplier_calls`).
- [ ] Partner adapters (Agoda, GYG) compiled, tested, flags default off; Klook/Trip.com (T7b) tracked as post-approval tasks against the T7 contract.
- [ ] Maestro `e2e/suppliers/*.yaml` and admin Playwright suite green.

## Risks & rollback
| Risk | Mitigation / rollback |
|---|---|
| Viator certification slips | `supplier.viator_booking` off → Viator Basic links with the same card; copy auto-switches |
| Partner approvals denied | links remain; adapters dormant behind flags |
| Accidental MoR / reselling | no adapter method charges our card; Agoda 4.1.7: Critterpass/guide never pays for stays |
| PCI scope (Agoda Fulfill Assisted card fields) | booking sub-flag stays off until a tokenising path is chosen (Open question 2) |
| WhatsApp template rejection / quality rating drop | approved templates only; per-vendor rate limits; ops desk fallback to user calling |
| Apple 4.2.2 "collection of links" | links are secondary to planning features |
| Rollback | every supplier path behind a flag; flags off restore link-only copy instantly |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Legal entity (D18) for partner contracts | link programmes only through Travelpayouts |
| Travelpayouts account + brand approvals (Agoda, Trip.com, Klook, GYG, Kiwitaxi, GetTransfer), Booking.com via CJ | CTA hidden for that partner; POI info still shown |
| Viator Full + Booking approval + certification | Basic links |
| Agoda Demand, Klook Activity, Trip.com distributor, GYG API approvals | flags off |
| Grab Farefeed partner approval | Gojek/Grab plain deep links without estimate + phrase card |
| WhatsApp Business account, verified number, templates approved | vendor drafts shown to the user to send from their own WhatsApp (share intent) |
| Railway static outbound IP (partner whitelists) | adapters requiring whitelists stay off |
| Counsel: affiliate disclosure wording, EU PTD linked-arrangement exposure, ops desk scripts for clinics | copy keys shipped; flags off where counsel pending |
| Ops staffing 07:00–23:00 SGT | desk-hours state shown; clinic hand-off says to call directly with `tel:` + phrase card |

## Open questions
1. plan.md delta: depends_on adds 29 (provider interfaces, wave 13). P32 is NOT a dependency: T9 renders the phrase card through a `PhraseCardSlot` registry P32 fills (same wave 14), so P35 stays wave 14 and P30/P31 move to wave 15.
2. Agoda Fulfill Assisted puts card data through our Book request (PCI) — default: booking sub-flag `supplier.agoda_demand.book` off until a tokenising proxy or supplier-hosted form is approved by counsel; rates/search usable when approved.
3. Doc delta: new commands `log_ride`, `set_entry_reminder`; `approved_text_sha256` column; route `GET /v1/suppliers/payment-session/{hold_id}`.
4. Doc delta: flag key names differ between product-decisions §5 (`supplier.viator_booking`) and api-contracts §7 (`supplier.viator.booking`) — default: product-decisions spelling.
5. Viator push webhooks availability — default: poll-only, webhook route disabled.
6. Bridge redirect host `go.critterpass.app/r/` for attribution is registered with the phase 21 resolver — default: yes.
