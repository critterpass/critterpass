# Fix log — phases 29–35 (chunk 5)

Date 2026-09-26. Scope: phase-29…phase-35 only; docs/ and plan.md untouched (deltas listed below).

## Applied

| # | Phase | Finding | Change |
|---|---|---|---|
| 1 | 31 | F-090 per-person "Opened"/"Not opened yet" (C28) | Rows show Replied / Boarded / No reply yet; segment UNOPENED → NO REPLY; opens only as crew aggregates; T8 grep test for "opened". Verified vs master C28 row + §10.4 |
| 2 | 31 | F-088 unattributed ChangeSet in crews < 4 | Gated crew ≥ 4 via same definer check as `anonymous_suggestions`; < 4 = personal overlay only; T1 test |
| 3 | 31 / 35 | Viator hold drives reply-by / clamps | Viator holds removed from reply-by maths and proposal rows ("book when the crew agrees"); holds only at booking time; P35 T4 skips hold shorter than `supplier.min_vote_window_min` ("book when agreed"); 20-min hold tests in P31 T2 + P35 T4. Verified: supplier report §Viator (`validUntil`) |
| 4 | 35 | Klook docs login-gated | T7 = generic `ActivityAdapter` contract + conformance suite + GYG; new T7b Klook **and Trip.com** on approval. Partial correction: supplier report line 8 says Trip.com API docs are also login-gated, so Trip.com moved to T7b too |
| 5 | 29 | Hold expiry / booking impact need P35 | Nullable `HoldExpiryProvider` + `BookingImpactProvider` interfaces in P29; P35 T4 wires Viator and owns clamp/booking-impact/refusal tests |
| 6 | 31, 30 | Undeclared deps | P31 depends_on + 34, 35, 46; P30 + 35; both → wave 15 |
| 7 | 29 | Ghost needs P37; SHARE → P52 | Seeded weather ChangeSet fixture; P37 owns integration; `PlanShareSlot` export |
| 8 | 30 | Saved plans via P52 | `SavedPlansSlot` + hidden empty state |
| 9 | 32 | PHARMACY / TRANSLATE target later phases | `guide.quick_actions.*` flags default hidden; P35/P38/P42 enable |
| 10 | 33 | Forecast uses P34 bookings | Optional `BookedCostProvider`; P34 T2 registers + integration test |
| 11 | 29, 30, 31, 33, 34, 35 | Cross-phase file edits, stream path mismatch | Per-phase `infra/powersync/streams/<domain>.yaml` (added to owns) merged into P10 `sync-streams.yaml` at build; P29 no longer edits P27 `cp-calendar` (contract hook); P32 no longer edits P22 command (fields defined in P22) |
| 12 | 30 | Views not replicated; no-vote leak | `swipe_votes` out of publication; trigger-mirrored `swipe_yes_votes` table published; replicated-rows test |
| 13 | 30 | Q&A summary not trip-scoped; untrusted chat | `place_qna_summaries(trip_id, poi_id)` under trip RLS; delimited untrusted input; cross-crew + injection evals |
| 14 | 32 | Injection / tool scope / supplier text in proactive | Untrusted blocks; mention turn = read + propose-only tools as asker; availability facts via deterministic template; prompt-assembly test; injection eval cases |
| 15 | 33 | Append-only blocks erasure | `app_system`-only `app.pseudonymise_user(uid)` → tombstone; test; doc delta data-model + P45 |
| 16 | 34 | PASTE URL SSRF | Supplier allow-list, post-DNS private/link-local block, on-list redirects only, 2 MB, no cookies, 20 s; SSRF tests in T4 |
| 17 | 34 | Allow-list misses phone/anon/relay users | "Link this email?" reply-code state (design in code); Apple relay match |
| 18 | 33 | ML Kit no Thai; DataScanner vs vision-camera | Android Thai → `unsupported_script` → server Sonnet vision OCR with `s{index}` line ids; iOS = Vision via vision-camera frame processor (DataScanner dropped) |
| 19 | 29 | personal_plan_ops guide_reader mechanism | `llm.my_personal_plan_ops` view filtered by `app.uid`; no base-table grant; permission test |
| 20 | 31 | Haiku "out" auto-triggers dropout | Confirm card; only `decline_trip` enqueues `trip.dropout`; T9 test |
| 21 | 33, 34, 35 | Oversized tasks | P33 T4 → T4 + T4b; P34 T3 → T3 + T3b; P35 T10 → T10 + T10b + T10c (effort +1/+1/+3 incl. T7b) |
| 22 | 29, 30, 31, 34, 35 | Non-automatable done-whens | CI perf budgets, `ical.js` round-trip, replayed AeroAPI/Farefeed/WhatsApp fixtures; live runs → P54 |
| 23 | 31 | Maestro files missing from Files | Added to T4/T6/T7 |
| 24 | 35 | depends_on / copy-rules / 3c-9 | 3c-9 added (lottery row verified in screens.json); copy-rules consumer list drops P28 (P28 has no reference); P32 dependency avoided via `PhraseCardSlot` registry (P32 registers) so P35 stays wave 14; depends_on + 29 |
| 25 | 32 | tz forward jump | Stored tz changes ≤ once/24 h; bounded one early reset accepted + test |

## Rejected

| Finding | Reason |
|---|---|
| — | None fully rejected. #4 partly corrected (Trip.com is not public-docs; supplier report line 8). #24 "add 32 to depends_on" replaced by slot contract to avoid a wave-15/16 cascade |

## plan.md / other-phase deltas (not edited here)

- Waves: P30, P31 → 15. depends_on: P29 unchanged; P30 +35; P31 +34, 35, 46; P35 +29.
- P10: `sync-streams.yaml` built from `infra/powersync/streams/*.yaml`.
- P22: `set_dietary_profile` schema includes `avoid[]`, `spice`, `accessibility_notes`, `visibility`.
- P27: owns `cp-calendar` write method.
- P37: integration test for weather ghost; P38/P42: enable quick-action flags; P45: call `app.pseudonymise_user`; P52: fill `PlanShareSlot`, `SavedPlansSlot`; P54: live Grab/WhatsApp/flight/calendar/60 fps checks.
- docs: `swipe_yes_votes`, `place_qna_summaries`, `app.pseudonymise_user`, `supplier.min_vote_window_min`, `guide.quick_actions.*`.

## Unresolved questions

1. P38 depends on 35 (wave 14) — unaffected; confirm no other phase assumed P30/P31 at wave 14.
2. Minimum vote window default 60 min — founder confirm.
