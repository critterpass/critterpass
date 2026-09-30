---
phase: 34
title: Bookings wallet, imports, mailbox scan, flight tracking
status: done
depends_on: [11, 13, 15, 33]
wave: 15
features: [F-100, F-101, F-102, F-121, F-036]
screens: [3h-1, 3h-2, 3n-2, 3k-5, 3k-6, 3k-10, 3l-1, 5a-3, 5c-5]
tasks: 11
owns:
  - packages/domain/src/bookings/
  - packages/domain/src/bcbp/
  - packages/domain/src/flights/
  - packages/db/src/schema/bookings.ts
  - packages/db/migrations/*_bookings_wallet.sql
  - packages/db/migrations/*_imports_inbound_mail.sql
  - packages/db/migrations/*_flight_tracking.sql
  - packages/db/migrations/*_insurance_vault.sql
  - packages/db/test/permissions/{bookings,booking-attachments,flight-segments,flight-watches,import-candidates,inbound-emails,crew-inbound-addresses,mailbox-connections,insurance-policies}.test.ts
  - packages/suppliers/src/flight-status/
  - packages/ai/src/routes/booking-extract/
  - packages/ai/evals/booking-extract/
  - packages/i18n/locales/en/bookings/
  - services/api/src/commands/bookings/
  - services/api/src/bookings/
  - services/api/src/routes/webhooks/inbound-email.ts
  - services/api/src/routes/webhooks/aeroapi.ts
  - services/api/src/routes/mailbox-oauth.ts
  - services/worker/src/jobs/bookings/
  - services/worker/src/jobs/flights/
  - infra/powersync/streams/bookings.yaml
  - infra/cloudflare/inbound-email/
  - apps/mobile/src/app/(tabs)/wallet/bookings/
  - apps/mobile/src/features/bookings/ (except getting-around/ and supplier/, owned by the supplier phase)
  - e2e/bookings/
---
# Phase 34 — Bookings wallet, imports, mailbox scan, flight tracking

## Context links
| Source | Section |
|---|---|
| `docs/product-decisions.md` | D6 (AeroDataBox + FlightAware AeroAPI), D10 (never MoR; real cancellation deadlines; no holds), C29, C37 (flight tracking free for any wallet flight; mailbox import + NEXT FLIGHT = Pass+), C43; §3 matrix rows "Mailbox auto-scan", "Forward/paste/scan", "Flight status…"; §7 Q-58, Q-59, Q-5A |
| `docs/data-model.md` | §3.7 `bookings`, `booking_attachments`, `flight_segments`, `flight_watches`, `import_candidates`, `inbound_emails`, `crew_inbound_addresses`, `mailbox_connections`, `insurance_policies`; §3.x `consents` (`mailbox_surfacing`, `insurance_to_clinic`) |
| `docs/data-model-sync-and-privacy.md` | §1 field encryption (barcode, insurance, OAuth tokens), `app.share_insurance`, `local_private`; `llm.bookings` view; §4 streams; retention (`inbound_emails` raw 7 d) |
| `docs/api-contracts.md` | §4.10 commands; §5 `/webhooks/inbound-email`, `/webhooks/aeroapi`, `GET /v1/me/private/{kind}`, `GET /v1/trips/{id}/offline-bundle`, presign `booking_doc`; §6 tools `bookings_read`, `flight_status`; open questions 2, 4 |
| `docs/api-contracts-async.md` | `crew_bookings:{crew_id}`; queues `mail.parse`, `flight.event`, `mailbox.scan`, `boarding.schedule`; action category `cp.import` (N-13); N-14, N-41; `snapshot/widgets.json` next flight |
| `docs/system-architecture.md` | §4 commands/jobs/push, §10 ops (fixed egress IP, 120 s timeouts) |
| Reports | `design-analysis-260926-1143-bookings-money-guide-report.md` §2 3h-1, 3h-2, §7 risks 1–5, §8 Q2–Q6; `design-analysis-260926-1143-during-trip-report.md` (3k-5 flight card, 3k-6 insurance line, 3k-10); master §2 rows F-036, F-100, F-101, F-102, F-121; C37; R19 (CASA) |
| Phase inputs | P33 `cp-ocr`, expense commands (auto-expense), P11 push router + scheduled events, P13 gateway (Haiku extract), P15 travel-data, P12 entitlements, P10 offline bundle framework |
| Renders | `docs/design-renders/screens/3h-1_Bookings.png`, `3h-2_Add_a_booking.png`, `3n-2_Settings.png`, `3k-5_Flight_delayed.png`, `3k-6_Help.png`, `3k-10_Crew_SOS.png` |

## Overview
Goal: a typed, offline trip wallet fed by zero-typing imports (crew forward address, paste, scan, Pass+ mailbox scan) that extracts real cancellation deadlines, plus live flight status for any wallet flight and a consent-gated insurance vault.
Done when: forwarding a real confirmation to `trip-{slug}@in.critterpass.app` produces an ADD/IGNORE candidate for the crew within the job SLA, ADD puts a typed card in the 3h-1 stack (and an optional split expense), a watched flight updates gate/boarding/delay from AeroAPI alerts and fires the boarding ping, bookings and barcodes open in airplane mode, and permission suites prove personal bookings, raw mail, tokens and insurance never leak.

## Requirements
### F-100 Bookings wallet (3h-1)
| Aspect | Behaviour |
|---|---|
| Stack | typed cards (activity yellow/volcano, boat green, stay pink/bed, flight blue/plane, transfer, rail, other); collapsed 58 px offset, soonest-relevant expanded on top; tap → bring to front; pull-down rubber-band fan (offsets scale with drag, spring back — P06 gesture kit) |
| Flight card | `SQ 938 · MON 12 OCT` + status chip (ON TIME / DELAYED {n}m / GATE CHANGE / BOARDING / CANCELLED / LANDED — **undesigned variants**), IATA + times, BOARDS/GATE/SEAT/BAG grid, tear line, barcode tile → full-screen boarding pass with max brightness; "Maya and Alex are on this flight." co-travellers; "Tokek pings you when boarding opens." |
| Offline | "✓ {n} OFFLINE" = bookings whose attachments + barcode are cached in the offline bundle (P10 framework, entries registered here); barcode payload decrypted into `local_private` for the owner only |
| Visibility | stays/activities/transfers with ≥ 2 travellers = crew; flights personal but flight no. + times visible to crew unless opted out (Q-59) |
| Banner | "Found {n} bookings in {member}'s inbox that weren't here yet. REVIEW" (dashed, gecko cheer) → 3h-2 |
| Motion | fan on pull; top pass brightens and the flight LA pins T−3 h (LA itself = P48; this phase emits `boarding.schedule` + LA trigger events) |
| Undesigned (design in code) | empty wallet (three import tiles inline), loading/sync, past bookings archive, multi-trip switcher, **booking detail/edit/delete**, barcode unavailable ("No boarding pass in this email — scan it at check-in"), insurance card, rail/car hire types, cancellation-deadline row "Free cancellation until {date}" + reminder |
| Deadlines | `free_cancel_until` from the user's own confirmation → ALWAYS push < 24 h (P11 class), shown in proposal builder copy via P31 |
| Entitlement | free (manual + forward/paste/scan); NEXT FLIGHT widget Pass+ (P49 reads snapshot field written here) |

### F-101 Booking import: forward / paste / scan (3h-2) — free (Q-58)
- Crew inbound address `trip-{slug}@in.critterpass.app` (pill + COPY → "COPIED" flap, toast "Forward any confirmation to that address."); organiser can rotate; sender allow-list = verified emails of crew members; unknown sender from the crew address → undesigned "Link this email?" state (design in code): the sender gets an auto-reply with a 6-digit code, the member enters it in-app (or taps the N-13 action) → address verified + linked to their account, quarantined mail released. Apple Private Relay (`@privaterelay.appleid.com`) addresses are matched to the account's Apple-provided relay email; other senders quarantined, owner notified.
- Pipeline `mail.parse`: sanitize (strip scripts/trackers) → schema.org JSON-LD/Microdata reservation → P13 `checkCompliance` surface `imported_text` (injection flag → candidate needs the user's confirm, no auto-actions) → Haiku structured extraction (no tools, email as `document` block) → zod validation (dates, tz, pax, price, confirmation code, `free_cancel_until`, `cancel_policy_text` verbatim from the user's own email) → dedupe `(user_or_crew, supplier, confirmation_code | normalised title+start)` → `import_candidates` → N-13 + `crew_bookings:` `import.candidate`.
- PASTE (iOS paste control, no prompt): confirmation code, text, or URL (fetched once server-side, not stored) with SSRF controls: supplier-domain allow-list (Agoda, Trip.com, Booking.com, Viator, Klook, GYG, airline list in config), DNS resolved then private/loopback/link-local/metadata IPs blocked, redirects followed only within the allow-list, ≤ 2 MB, no cookies/auth headers, 20 s timeout; non-allow-listed URL → treated as text only. "Own booking" cannot be verified → result is a candidate the user confirms.
- SCAN: document scanner / screenshot picker → `cp-ocr` lines + barcode; IATA BCBP decoder (PDF417/Aztec) → flight segment + seat; OCR text → same extractor.
- Candidates: fields assemble one by one as Tokek reads them (per-field reveal 460 ms stagger); chip "FROM {MEMBER}'S EMAIL"; "Split {n} ways" toggle (on when price + ≥ 2 travellers) → `add_expense(source=booking)` on ADD; ADD slides card into the stack (shared element), IGNORE slides off; resolution by any traveller resolves for all.
- Undesigned states: parsing, parse failed ("Couldn't read this one — add it by hand" prefilled), duplicate ("Already in the wallet"), unsupported attachment, empty paste, camera denied, no candidates.

### F-102 Mailbox auto-scan (3h-2 footnote, 3n-2 "Find bookings in my email") — Pass+
- Connect Gmail (`gmail.readonly` restricted scope, CASA assessment) or Microsoft (Graph `Mail.Read`, publisher verification) via system browser OAuth (PKCE); refresh tokens encrypted; daily `mailbox.scan` at user local morning + on connect; incremental (Gmail historyId / Graph delta).
- Trip filter before any content is read beyond headers: date window (trip ± 60 d), known booking-sender domains list, destination keywords; only matching messages fetched and parsed; nothing else stored.
- Crew surfacing requires `CONSENT(mailbox_surfacing)` by the mailbox owner; without it candidates are private to the owner.
- Footnote "I check for new confirmations every morning. You can switch that off in Settings." ; Settings toggle "Read-only, confirmations only"; disconnect revokes tokens at provider and deletes the connection.
- Entitlement: `connect_mailbox` needs Pass+; paused/expired → scan stops, connection kept, "Resume with Pass+" state. Server flag `mailbox.gmail` / `mailbox.microsoft` on only after verification passes; flag off → 3n-2 row shows "Coming soon — forward confirmations meanwhile" and the paywall perk list omits it (C48 `shipped` flag).

### F-121 Insurance vault + consented sharing (3h-1, 3k-6, 3k-10)
- Add policy (provider, policy no., assistance phone, document scan/PDF) → encrypted `insurance_policies`; owner offline copy via `GET /v1/me/private/insurance` → `local_private`.
- Shown as a card in the wallet ("Chubb Travel · policy card") and as the Help line "Insurance: {provider} · the policy card is in Bookings".
- Sharing: `app.share_insurance(help_session_id)` only with `CONSENT(insurance_to_clinic)`, per-session, exact fields listed before approval; used by P35 concierge hand-off and P38 SOS ("Ops desk is calling the clinic with you — share insurance details?"). Never in LLM views.

### F-036 Flight status tracking (3h-1, 3k-5, 3l-1, 5a-3) — free for any wallet flight (C37)
- `watch_flight` on flight add (auto) → AeroAPI alert (departure, arrival, gate, delay, cancel, diverted) + AeroDataBox schedule/boarding poll at T−24 h, T−6 h, T−3 h.
- `/webhooks/aeroapi` (path secret + source allow-list) → refetch `/flights/{id}` before any ALWAYS push → `flight.event`: diff → `flight_segments` update → `crew_bookings:` `flight.status` → N-14 (delay/gate/cancel, ALWAYS for the traveller) / N-41 boarding ping ("Tokek pings you when boarding opens"); boarding time unknown → dep − 40 min labelled "est."; source + time shown ("AeroAPI · 09:12").
- Co-travellers = crew members with the same `(carrier, flight_no, sched_dep_at)`.
- Landed → `flight.landed` domain event (P40 egg hatch consumes; P36 trip state `pre_trip → in_trip`); `report_landed` manual fallback from card / notification.
- Delay → `ai.disruption` trigger (P37 consumes); LA phases (P48 consumes `la_phase`).
- Fixed egress IP + 120 s timeouts; AeroAPI alert cost budget per user tracked in `supplier_calls` through the P15 audit writer (`packages/suppliers/src/core/audit.ts`); P15 is a dependency, so the table exists before this phase starts.

## Architecture & contracts
| Area | Delta |
|---|---|
| Migrations | `*_bookings_wallet.sql` (`bookings`, `booking_attachments`; `expenses.booking_id` FK expand); `*_imports_inbound_mail.sql` (`import_candidates`, `inbound_emails`, `crew_inbound_addresses`, `mailbox_connections`); `*_flight_tracking.sql` (`flight_segments`, `flight_watches`); `*_insurance_vault.sql` (`insurance_policies`, `app.share_insurance`) |
| RLS backstop | `bookings` T + visibility (personal → owner only); barcode + attachments C2 (owner; crew for crew bookings); `inbound_emails`, `flight_watches` S (system only); `mailbox_connections`, `insurance_policies` X owner-only; `import_candidates` owner, plus crew when source consent exists (policy via `app.can_see_candidate`) |
| Streams | `trip`: `bookings` (visibility-filtered), `booking_attachments` meta, `flight_segments`; `crews`: `crew_inbound_addresses`; `me`: `import_candidates` |
| Commands (§4.10) | `add_booking`, `edit_booking`, `delete_booking`, `import_paste`, `import_scan`, `resolve_import_candidate`, `connect_mailbox`, `disconnect_mailbox`, `watch_flight`, `report_landed`; new (doc delta): `rotate_inbound_address {crew_id}` (organiser), `set_booking_visibility {booking_id, visibility}`, `save_insurance_policy` / `delete_insurance_policy` (self), `set_flight_crew_visibility {booking_id, visible}` |
| HTTP | `/webhooks/inbound-email` (HMAC + timestamp; DKIM/SPF verdict), `/webhooks/aeroapi`, `GET /v1/mailbox/oauth/{provider}/start|callback`, `GET /v1/me/private/insurance`, offline-bundle entries `bookings` |
| Realtime | `crew_bookings:{crew_id}` `import.candidate`, `booking.*`, `flight.status` |
| Jobs | `mail.parse`, `mailbox.scan` (cron per tz bucket), `flight.event`, `flight.poll` (AeroDataBox schedule checks), `boarding.schedule` (scheduled_events), `booking.deadline_reminder` (free_cancel_until − 24 h) |
| Push | N-13 import candidate (actions `cp.import` ADD_ALL), N-14 flight change, N-41 boarding, deadline reminder |
| AI | route `booking-extract` (Haiku 4.5, Sonnet 5 fallback for images/PDF), strict schema, injection eval cases (malicious email bodies); tool executors `bookings_read`, `flight_status` |
| Adapters | `packages/suppliers/src/flight-status/{aeroapi.ts,aerodatabox.ts}` (server-only; uses P35 core HTTP client once it exists — built here on the shared `fetchWithEgress` helper from P15) |
| Inbound mail | Cloudflare Email Routing → Worker `infra/cloudflare/inbound-email/` stores raw to R2 (7 d TTL) and POSTs signed metadata to api |

## Tasks
### T1 — Bookings, imports, flights, insurance schema + permission tests
- Goal: all phase tables with RLS, encryption columns, publication.
- Files: `packages/db/src/schema/bookings.ts`, 4 migrations listed in owns, `packages/db/test/permissions/*.test.ts` (9 files in owns), `infra/powersync/streams/bookings.yaml`
- Steps: 1. Drizzle schema per data-model §3.7. 2. RLS incl. visibility + candidate consent policy. 3. Encrypted columns via P08 envelope helpers. 4. `app.share_insurance`. 5. Publication allow-list (no barcode/policy columns). 6. Retention rules registered with `maint.purge`.
- Tests: `pnpm --filter @cp/db test -- permissions/bookings permissions/import-candidates permissions/insurance-policies permissions/mailbox-connections permissions/inbound-emails permissions/flight-segments permissions/flight-watches permissions/booking-attachments permissions/crew-inbound-addresses`
- Done when: personal booking invisible to crewmates; `guide_reader` sees only `llm.bookings` columns; tokens/policy numbers never selectable by non-owner.
- Status: done — 0a8dc211

### T2 — Booking commands, auto-expense, offline bundle, guide tools
- Goal: manual CRUD + booking→expense link + offline availability.
- Files: `services/api/src/commands/bookings/{add-booking.ts,edit-booking.ts,delete-booking.ts,set-booking-visibility.ts}`, `packages/domain/src/bookings/{booking-schema.ts,kinds.ts,deadline.ts,booked-cost-provider.ts}`, `services/api/src/bookings/{offline-bundle.ts,tools.ts}`, `services/worker/src/jobs/bookings/deadline-reminder.ts`, `services/api/test/bookings/commands.test.ts`
- Steps: 1. Typed field schemas per kind. 2. Handlers + `crew_bookings:` events; optional `add_expense` via P33 domain writer in the same tx. 3. Offline-bundle entries (attachments signed URLs, barcode to owner). 4. Deadline reminder scheduling. 5. Register `bookings_read` (deadlines verbatim). 6. Register P33 `BookedCostProvider` (booked-not-yet-expensed).
- Tests: `pnpm --filter @cp/api test -- bookings/commands`; `pnpm --filter @cp/cost-engine test -- forecast` (integration case)
- Done when: P33 forecast includes a booked-not-yet-expensed booking and drops it once expensed; add with split creates booking + expense atomically; delete keeps the expense unless user chooses to delete it too; replay idempotent.
- Status: done — 265801f2 (the cost-engine forecast is not built yet: the `BookedCostProvider` port is registered and tested against the api; its forecast integration case lands with the money app lane)

### T3 — Inbound email intake: Worker, webhook, sender allow-list, link-email
- Goal: mail reaches a verified `inbound_emails` row or quarantine.
- Files: `infra/cloudflare/inbound-email/{wrangler.toml,src/index.ts}`, `services/api/src/routes/webhooks/inbound-email.ts`, `services/api/src/commands/bookings/{rotate-inbound-address.ts,verify-sender-email.ts}`, `services/api/src/bookings/sender-allow-list.ts`, `apps/mobile/src/features/bookings/link-email/**`, `services/api/test/bookings/inbound-intake.test.ts`
- Steps: 1. Worker: address lookup, size cap, raw → R2, HMAC POST. 2. Webhook verify + `inbound_emails` row + DKIM/SPF verdict. 3. Sender allow-list incl. Apple relay match; unknown → quarantine + reply-code "Link this email?" flow. 4. Address creation on crew create + rotation.
- Tests: `pnpm --filter @cp/api test -- bookings/inbound-intake`; `pnpm --filter inbound-email test`
- Done when: unknown sender quarantined; correct code links the address and releases the mail; Apple relay sender of a member accepted; bad HMAC rejected.
- Status: done — ea6412be (Worker, webhook and linking; the app's link-email screen is the app lane's)

### T3b — Mail parse job, extractor, evals
- Goal: verified mail → validated, deduped import candidate.
- Files: `services/worker/src/jobs/bookings/mail-parse.ts`, `packages/domain/src/bookings/{jsonld.ts,dedupe.ts,sanitize.ts}`, `packages/ai/src/routes/booking-extract/`, `packages/ai/evals/booking-extract/`, `services/worker/test/bookings/mail-parse.test.ts`
- Steps: 1. Sanitize → JSON-LD/Microdata → Haiku → validate → dedupe → candidate → N-13. 2. Eval set from real confirmation emails the founder forwards (Agoda, Trip.com, Booking.com, Viator, Klook, airlines, fast boats) + injection cases.
- Tests: `pnpm --filter @cp/worker test -- bookings/mail-parse`; `pnpm --filter @cp/ai eval -- booking-extract`
- Done when: JSON-LD emails parse without an LLM call; eval ≥ 95 % field accuracy incl. `free_cancel_until`; injection cases never alter other fields or trigger tools; same email forwarded by 3 members → one candidate.
- Status: done — d654b9bb (harness, injection cases recorded live at 3/3; the ≥ 95 % field-accuracy gate waits for the founder's forwarded corpus)

### T4 — Paste and scan imports, BCBP, candidate resolution
- Goal: PASTE and SCAN channels + ADD/IGNORE with split.
- Files: `packages/domain/src/bcbp/{decode.ts,index.ts}`, `packages/domain/test/bcbp.test.ts`, `services/api/src/commands/bookings/{import-paste.ts,import-scan.ts,resolve-import-candidate.ts}`, `services/worker/src/jobs/bookings/paste-parse.ts`, `services/api/test/bookings/imports.test.ts`
- Steps: 1. IATA Resolution 792 BCBP decoder (multi-leg, conditional fields) tested with published spec sample strings. 2. Paste: code/text/URL (single fetch via `services/api/src/bookings/safe-fetch.ts` with the SSRF controls listed under PASTE, no storage). 3. Scan: OCR lines + barcode → extractor. 4. Resolve: add (booking + optional expense), ignore (crew-wide), duplicate. 5. `cp.import` notification actions.
- Tests: `pnpm --filter @cp/domain test -- bcbp`; `pnpm --filter @cp/api test -- bookings/imports`
- Done when: spec BCBP samples decode exactly; resolve by one member hides candidate for all within one sync; SSRF tests: `http://169.254.169.254`, `http://localhost`, a DNS name resolving to 10.x, an allow-listed URL redirecting off-list, and a > 2 MB body are all refused.
- Status: done — bea87e35

### T5 — Mailbox auto-scan (Gmail + Microsoft)
- Goal: Pass+ daily scan with trip filter and consented crew surfacing.
- Files: `services/api/src/routes/mailbox-oauth.ts`, `services/api/src/commands/bookings/{connect-mailbox.ts,disconnect-mailbox.ts}`, `services/worker/src/jobs/bookings/mailbox-scan.ts`, `packages/domain/src/bookings/{trip-filter.ts,booking-senders.ts}`, `services/worker/test/bookings/mailbox-scan.test.ts`
- Steps: 1. OAuth PKCE start/callback, encrypted refresh tokens. 2. Entitlement `mailbox_import` check + lifecycle overlays. 3. Incremental fetch with header-only prefilter, then message fetch for matches → `mail.parse` path. 4. Consent check for crew surfacing. 5. Disconnect → provider revoke + row delete. 6. Flags `mailbox.gmail`, `mailbox.microsoft`.
- Tests: `pnpm --filter @cp/worker test -- bookings/mailbox-scan` (Testcontainers; provider HTTP recorded from a real test mailbox owned by the founder, replayed with nock)
- Done when: non-matching messages are never fetched beyond headers (asserted); expired Pass+ stops scans; revoke verified against provider.
- Status: done — 0a5f8890 (flags `mailbox.gmail`/`mailbox.microsoft` off until Google CASA and Microsoft publisher verification)

### T6 — Flight status adapters, watches, webhook, events
- Goal: live flight status for any wallet flight.
- Files: `packages/suppliers/src/flight-status/{aeroapi.ts,aerodatabox.ts,types.ts}`, `packages/domain/src/flights/{status-diff.ts,boarding.ts,co-travellers.ts}`, `services/api/src/commands/bookings/{watch-flight.ts,report-landed.ts,set-flight-crew-visibility.ts}`, `services/api/src/routes/webhooks/aeroapi.ts`, `services/worker/src/jobs/flights/{flight-event.ts,flight-poll.ts,boarding-schedule.ts}`, `services/worker/test/flights/*.test.ts`
- Steps: 1. Adapters with egress IP + timeouts + cost counter. 2. Watch on flight add/import; unwatch at landed + 1 d. 3. Webhook verify + refetch. 4. Diff → segments, events, N-14/N-41, `flight.landed`, disruption trigger. 5. Boarding estimate labelling. 6. Register `flight_status` tool executor.
- Tests: `pnpm --filter @cp/worker test -- flights`; `pnpm --filter @cp/domain test -- flights`
- Done when: a replayed real AeroAPI alert sequence (delay → gate → departed → landed) produces exactly one push per change and one `flight.landed`; spoofed webhook without refetch match is ignored.
- Status: done — a35580ef (adapters off until `AEROAPI_KEY`/`AERODATABOX_KEY` are set; scheduled times + `report_landed` meanwhile)

### T7 — Insurance vault
- Goal: owner-only encrypted policy with offline copy and consented share.
- Files: `services/api/src/commands/bookings/{save-insurance-policy.ts,delete-insurance-policy.ts}`, `services/api/src/bookings/private-insurance.ts`, `apps/mobile/src/features/bookings/insurance/`, `services/api/test/bookings/insurance.test.ts`, `e2e/bookings/insurance.yaml`
- Steps: 1. Commands + encryption. 2. `GET /v1/me/private/insurance` → `local_private`. 3. Share flow API used by P35/P38 (consent write + scoped reveal). 4. Wallet card + edit form + document scan (cp-ocr).
- Tests: `pnpm --filter @cp/api test -- bookings/insurance`; `maestro test e2e/bookings/insurance.yaml`
- Done when: policy readable offline by owner only; share without consent → `CONSENT_REQUIRED`.
- Status: done — f9bda7b3 (server), 0d56fe6d (wallet card, policy form with document scan, screenshot flow)

### T8 — Wallet stack UI (3h-1) + booking detail/edit
- Goal: the card deck, flight card variants, boarding pass, detail/edit.
- Files: `apps/mobile/src/app/(tabs)/wallet/bookings/{index.tsx,[id].tsx,edit/[id].tsx,pass/[id].tsx,archive.tsx}`, `apps/mobile/src/features/bookings/{stack/,flight-card/,detail/,boarding-pass/}`, `packages/i18n/locales/en/bookings/`, `e2e/bookings/wallet.yaml`
- Steps: 1. Deck with fan gesture (Gesture Handler 3 + Reanimated spring). 2. Type cards + flight variants + co-travellers line. 3. Boarding pass full screen (brightness via expo-brightness, restore on exit). 4. Detail/edit/delete/visibility + deadline row. 5. Offline badge from bundle state; empty/loading/archive states; import banner.
- Tests: `pnpm --filter @cp/mobile test -- features/bookings/stack`; `maestro test e2e/bookings/wallet.yaml` (airplane mode step opens barcode)
- Done when: renders match 3h-1 proportions; barcode opens offline; flight card updates live on `flight.status`.

- Status: done — 1e302e3c (full brightness in PR #225, lands with the next native build)
### T9 — Add a booking UI (3h-2) + mailbox settings entry
- Goal: three channels, crew candidates, assemble animation.
- Files: `apps/mobile/src/app/(tabs)/wallet/bookings/add.tsx`, `apps/mobile/src/features/bookings/{add/,candidates/,paste/,scan/,mailbox/}`, `e2e/bookings/import.yaml`
- Steps: 1. Tiles + address pill copy. 2. Paste: iOS SwiftUI `PasteButton` hosted via `@expo/ui` in `features/bookings/paste/PasteButton.ios.tsx` (no paste prompt); Android clipboard read on tap. 3. Scan flow (document camera + barcode). 4. Candidate cards with per-field assemble, split toggle, ADD/IGNORE slide. 5. Mailbox connect sheet (Pass+ lock → P46 paywall route; flag-off copy) + 3n-2 row hook exported for P45.
- Tests: `pnpm --filter @cp/mobile test -- features/bookings/add`; `maestro test e2e/bookings/import.yaml`
- Done when: paste of a real confirmation code/URL yields a candidate; ADD animates into the stack and creates the split expense.

- Status: done — 62a46352 (the mailbox sign-in return needs its route file `app/(tabs)/wallet/mailbox/connected.tsx`, outside this lane; flags stay off until provider verification)
### T10 — Wallet widget/LA snapshot fields and cross-phase events
- Goal: publish the data other surfaces need, verified end to end.
- Files: `services/worker/src/jobs/flights/snapshot.ts`, `packages/domain/src/flights/la-phase.ts`, `services/worker/test/flights/snapshot.test.ts`, `e2e/bookings/flight-day.yaml`
- Steps: 1. `la_phase` computation (check-in → boarding → departed → landed → pickup) on segment change. 2. Snapshot fields `next_flight` (Pass+ gated at render, C37/Q-5A) and `boarding_at` into widget snapshot writer (P11/P49 contract). 3. Emit `flight.landed`, `boarding.soon` domain events with payload schemas in `packages/domain/src/flights`. 4. Maestro flight-day flow driven by replayed AeroAPI/AeroDataBox fixtures (live watched flight on staging → P54 launch checks).
- Tests: `pnpm --filter @cp/worker test -- flights/snapshot`; `maestro test e2e/bookings/flight-day.yaml`
- Done when: emitted `flight.landed` / `boarding.soon` payloads validate against their `packages/domain` schemas; snapshot reflects a gate change within one job cycle.

- Status: done — 457512e7 (`flight-day.yaml` walks the card through the day on lab fixtures; the live watched-flight run waits for the AeroAPI keys)
## Phase acceptance criteria
- [ ] 9 permission suites pass; raw email, tokens, barcodes, policies never reachable by crewmates or `guide_reader`.
- [ ] Forward, paste and scan each create a validated candidate with the real cancellation deadline when present.
- [ ] Duplicate forwards dedupe to one candidate; ADD by one member resolves for all.
- [ ] Mailbox scan gated by Pass+ and flags; header-only prefilter asserted.
- [ ] AeroAPI replay produces correct pushes and exactly one `flight.landed`; boarding estimate labelled.
- [ ] Wallet usable offline (cards, attachments, barcode) on iOS 26 and Android API 36.
- [ ] Extraction eval ≥ 95 % field accuracy; injection suite green.
- [ ] Maestro `e2e/bookings/*.yaml` green.

## Risks & rollback
| Risk | Mitigation / rollback |
|---|---|
| Gmail CASA / Microsoft verification slow | flags off; forward/paste/scan cover the flow; perk hidden via `shipped` flag |
| Email spoofing into crew address | sender allow-list + DKIM/SPF verdict; quarantine |
| Extraction errors on deadlines | verbatim policy text shown next to parsed date; user can edit |
| AeroAPI cost overrun | watch only flights within 72 h; AeroDataBox polls for schedule; per-user alert cap |
| Boarding time unknown | labelled estimate; never ALWAYS push on estimates |
| Rollback | expand-only migrations; `imports.mail` flag disables the Worker route (mail bounced with a friendly reply) |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Google OAuth verification + CASA Tier 2 for `gmail.readonly`; Microsoft publisher verification | `mailbox.*` flags off; UI shows forward instructions |
| Cloudflare Email Routing on `in.critterpass.app` (domain D20) | inbound import unavailable; paste/scan work |
| FlightAware AeroAPI + AeroDataBox accounts (paid tier) | manual status + `report_landed`; card shows scheduled times only |
| Real confirmation-email corpus for evals (founder) | eval gate blocks T3 merge |
| Counsel: mailbox consent copy, insurance sharing consent (GDPR/PDPL) | copy keys shipped; flags stay off for mailbox |

## Open questions
1. Doc delta: new commands `rotate_inbound_address`, `set_booking_visibility`, `save_insurance_policy`, `delete_insurance_policy`, `set_flight_crew_visibility`.
2. Resolved: `supplier_calls` + `fetchWithEgress` come from P15 (suppliers core); flight adapters here use them directly — no interim log-only path.
3. Address format: `trip-{slug}@in.critterpass.app` (api-contracts) vs design `bali-six@in.critterpass.app` — default: crew slug `{crew-slug}@in.critterpass.app` shown as designed; doc delta.
4. `.pkpass` / Google Wallet export not designed — default: not built.
5. AeroAPI webhook authenticity (no signature) — default path secret + refetch.
