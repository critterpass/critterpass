# Fix log — phases 22–28 (chunk 4)

Date 2026-09-26. Only the phase files 22–28 were edited. Sources checked: plan.md (wave table, decision 11), phase-08, phase-13, phase-16, phase-46, phase-45/08 privacy registry, phase-01 worker Dockerfile, supplier report §stays, product-decisions D9.

## Results

| # | File | Finding | Result | Verification / what changed |
|---|---|---|---|---|
| 1 | P28 | T1 duplicates P8 plan tables | Applied | P8 owns `schema/plan.ts`, the `plan_versions_and_changesets` migration and the plan permission tests (plan.md decision 11). T1 is now ALTER-only: `locked_reason`, `metrics`, `coverage`, plus a new `redraft_reservations` in `schema/draft.ts`. It appends to the existing `trip_draft` stream and adds new test files on top of P8's suites. `itinerary.ts` is removed from owns |
| 2 | P23 | SeatCapSheet built twice | Applied (P46 owns it) | P46 T7 already builds `SeatCapSheet` and says P23/P31 present it. P23 drops 4f-1 and now ships the `SEAT_LIMIT` presenter registry, a truthful default waitlist sheet and the joiner waitlist UI. P46 registers 4f-1 into that registry |
| 3 | P25/26/27 | Missing or same-wave dependencies | Applied, with different wave numbers | All three confirmed: P25 uses `useUnreadCount`; P26 uses the chat card registry and `poll.tally`; P27 uses places search, the won poll and `send_nudge`. Deps are now P25 +24, P26 +24, P27 +25 +26. The finding's own wave numbers (P27→12, P28→13) are wrong: once P25 depends on P24 (wave 10), P25 moves to 11, P26 to 12, P27 to 13 and P28 to 14 |
| 4 | P22 | Missing deps 10, 20, 21 | Applied | Their waves are 4/6/5, all below 8, so P22's wave is unchanged |
| 5 | P25 (+P28/P26) | Done-when checks need later phases | Applied in scope; wiring deferred | These checks are now contract tests: a `FlightSegmentsSource` port with a fixture (the C14 fallback is the real behaviour when there are no flights), typed route helpers (`routes.destination`, `routes.day(...draft)`), and the Viator availability port with a recorded fixture. The named wiring tasks in P29/P30/P34/P35/P46 are outside this chunk (see follow-ups) |
| 6 | P27 | Budget inference for k<4 | Applied | For k<4 there is no band, dots, under-all check or infeasible notice. The organiser sees only "k of N set" and each member sees only their own fit. Lock is limited to 3/h and 10/day, and a reject carries no distance. Added k=2 and k=3 inference property tests to T1 and T6a. Note: this is stricter than P16's band at k≥3 |
| 7 | P28 (+P27) | Free-cancel and stay-price claims | Applied | The supplier report confirms Travelpayouts gives affiliate links only, and cancellation data exists only in Agoda Demand. Step copy is now "Picked {n} {stay type}s in {area}". Stay prices come from P16 `destination_cost_indices` shown as "~$X estimate". Free-cancel appears only for imported bookings or behind the live Demand flag. Redraft copy "free-cancel slot" is changed to "slot" |
| 8 | P24 (+P28) | chat_window leaks card payloads; injection | Applied | The P13 rule gives later phases their views via CREATE OR REPLACE. P24 now defines `llm.chat_window` as text only (no attachments or card payloads, no supplier_order/proposal) and adds a permission test. The P28 redraft prompt now marks chat memory as untrusted data, and T3 has 10 injection eval cases |
| 9 | P24 (+P23) | notify level duplicated | Applied | One `crew_members.notify_level` (all/mentions/off, default mentions) set by P23 `set_crew_notify`. P24 drops `set_chat_mode`/`crew_chat_mode` (doc delta) |
| 10 | P24 | Ordering depends on client clocks | Applied | Added a per-crew server `seq` from a row-locked `crew_chat_counters`, and `crew_members.last_read_seq` (ALTER). `mark_read` is monotonic on seq; op_id is used only for idempotency. Added a skewed-clock test |
| 11 | P25/P26 | create_trip circular | Applied (whole command moved to P26) | `create_trip` and its file move to P26, which creates the crew trip and its poll in one tx and also handles solo trips. An invariant test checks that no voting trip exists without a poll. P25 only renders trips. Moving the whole command is simpler than splitting it |
| 12 | P23 | Owns overlap with P24 | Applied | P23 owns are now explicit route files plus named `features/crew/*` subfolders |
| 13 | P22/26/27/28 | Oversized tasks | Applied | Split into P22 T5a/T5b, P26 T3a/T3b, P27 T6a/T6b and P28 T4a/T4b, adding 1 session to each (+4 total) |
| 14 | P28 | Latency done-when blocks T4 | Applied | T4b's done-when is now "bench recorded + first streamed day card ≤ 8 s". p50 ≤ 20 s is handed to P54 as a launch gate, with the all-Sonnet routing flag as fallback |
| 15 | P26 | Guest brief web_search | Applied | Explicit `allowed_domains` excluding supplier and OTA domains, untrusted-data framing, a stored citation per fact, plus citation and injection evals |
| 16 | P26 | "150 cities" | Applied | Decision 9 is 150 locals across 61 places. The target is now every destination in the destinations DB (61 guide places + guest cities), checked by an enumerated test |
| 17 | P25 | Push-denied users; export coverage | Applied | Branches on "installed" instead of token: installed users always get an inbox item, and only non-installed users get the relay. `nudges`, `app_open_hours`, `saved_items` and `reminders` are appended to P8 `packages/domain/src/privacy.ts` (the registry the P45 purge test uses) |
| 18 | P24 (+25/26/27/28) | P17 dep, ffmpeg, gallery checks | Applied | Removed the P17 non-code row (P17 is a transitive code dep). T3 appends ffmpeg to the P1-owned `services/worker/Dockerfile` and adds an image `ffmpeg -version` check. Gallery checks are replaced with RNTL layout snapshots plus Maestro `takeScreenshot` CI artifacts in P24 T5, P25 T6, P26 T8–T10, P27 T8 and P28 T7 |
| 19 | P22 | Avatar moderation | Applied | Presign limit per uid and device (5/h, 20/day). A hash-match step (PhotoDNA Cloud or Cloudflare CSAM tool) runs before Haiku, and hits are never sent to the model. Uncertain results go to the ops queue. Added a non-code dep for enrolment; until then photo avatars stay "under review" pending ops approval |

Rejected: none. One partial correction: finding 3's wave numbers.

## Follow-ups outside this chunk (not edited)

| Target | Needed |
|---|---|
| plan.md wave table | P25 → 11, P26 → 12, P27 → 13, P28 → 14; effort 22 → 11, 26 → 12, 27 → 12, 28 → 10. This cascades to later waves: P29 (deps 28) → 15, P33 (deps 27) → 14, then P30/31/32/34+ and P54. The critical path grows by about 2 waves and the totals change (+4 sessions) |
| P46 T7 | Register `SeatCapSheet` into the P23 seat-limit presenter registry (`features/crew/seat-limit/registry.ts`) |
| P34 | Wiring task: register the bookings-backed `FlightSegmentsSource` for the P25 countdown, with a done-when |
| P29 | Wiring task: the draft-mode day screen for `routes.day(tripId, day, {version:'draft'})` |
| P30 | Wiring task: the `routes.destination(placeId)` screen reached from 3b-1, tips and 3b-7 |
| P35 | Wiring task: register the Viator adapter on the `packages/suppliers` availability port used by P28 T9 |
| P13 / P32 | Consume `llm.chat_window` as untrusted data (same framing as P28) |
| P16 | Align the k≥3 band with P27's k≥4 crew-level rule, or document the difference |
| P54 | Add the draft latency gate (p50 ≤ 20 s, p95 ≤ 40 s) with the routing-flag fallback |
| docs | Doc deltas are listed in each phase's open questions (`create_trip` → P26, `set_chat_mode` removed, `messages.seq`, `last_read_seq`, `llm.chat_window` projection) |

## Unresolved questions

1. Hash-match vendor: PhotoDNA Cloud or Cloudflare CSAM Scanning Tool (both need the legal entity, D18).
2. Should P16's band threshold rise to k ≥ 4 so both phases match?
