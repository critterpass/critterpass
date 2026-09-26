# Fix log — phases 36–42 (chunk 6)

Date 2026-09-26. Source: red-team chunk-6 findings (26). Applied 26, rejected 0. Edited only phase-36…42 files; docs/ and plan.md untouched (deltas listed at end).

| # | File | Finding | Result | Verification / change |
|---|---|---|---|---|
| 1 | P37 | Storm SWAP has no payment step | Applied | Viator is merchant of record (D10) → new booking needs booker payment. F-116 Commit: hold → `awaiting_booker_payment` → booker "Confirm & pay" (Viator form/3DS) → cancel old only after confirmation; waiting-on-booker, hold-expired/payment-failed states; T7 done-when proves old booking kept on failure; overview reworded |
| 2 | P40 (+P41) | PowerSync can't sync views | Applied | `crew_collection_counts` → worker-maintained table (befriend/revoke/hide_collection; hidden rows deleted server-side); `crew_xp` → table updated in the same tx as `xp_ledger`; publication checks list no views; eggs hatch status via column-limited sync query |
| 3 | P40, P37 | Egg event contract broken | Applied | Verified phase-31 L94 emits `participant.boarded` and owns 3f-5. P40: grant on `participant.boarded`, hatch on `flight.event{landed}`, 3f-5 removed from screens (consumer-only), 31 already in depends_on. P37 Landed row → `flight.event{landed}` |
| 4 | P39 | `app.now` GUC in SECURITY DEFINER gate | Applied | Gate = `crew_map_open_at(trip, now())`; `_at` variant EXECUTE revoked from app_user, used only by tests as superuser; test proves setting `app.now` as app_user has no effect |
| 5 | P39 | Ambiguous subscribe ACL | Applied | ACL = `is_participant ∧ crew_map_open` only; rule in `packages/domain/src/live-map/channel-acl.ts`; subscribe-acl tests: gate-closed, after-window, non-sharing viewer, outsider |
| 6 | P39 | History size 1 per channel | Applied | History off for positions; `GET /v1/trips/{id}/live-snapshot` (latest fix per active non-paused share) on mount/resubscribe; pause publishes `share.paused` and is excluded from the snapshot |
| 7 | P39 | Changes phase-20 files not owned | Applied | Phase-20 file not editable here → added `services/api/src/routes/loc.ts` to P39 owns with a single-line channel-constant edit rule; policy override documented in Fixes row + OQ1 (phase-20 note = doc delta) |
| 8 | P36 | Wave/depends_on wrong | Applied | plan.md confirms 32, 35 wave 14 and 38 wave 15. P36 → wave 15, depends_on + 14, 15, 18, 32; Help long-press wiring left to P38 (already lists `onGuideLongPress` entry). Cascade: P37 → wave 16 (dependents 48/54 are later waves) |
| 9 | P41 | photos/phrase_practice events come later | Applied | Template registry `registerQuestTemplate`; P41 ships and tests only templates with existing events; P42 T9 registers `phrase_practice` (file added to P42 owns, P41 owns exception); P44 must register `photos` (phase-44 file out of scope → OQ) |
| 10 | P41 | Settle hook into P33 + assumed event name | Applied | Phase-33 already grants `stickers(kind=settled)` in `confirm_paid` and owns `SettledTokekReveal`, emitting `reward.granted{kind: settled, server_ts}`. P41 no longer grants the sticker or mounts into P33; `settled-sticker` handler → `settle-xp`; 3i-5 dropped from screens |
| 11 | P40 | Offline befriend can't carry attestation | Applied | Evidence hash signed at capture with attested device key (App Attest assertion, which is local; Android Keystore key registered online by P9); fresh Play Integrity token at upload; missing → `unavailable` |
| 12 | P40 | `encounter_samples` undefined | Applied | Columns `at, distance_band, accuracy_m, speed_mps`, no coordinates; schema test in T2 |
| 13 | P38 | Consent toggle pre-set on | Applied | Default OFF, explicit tap, stored in `consents` (`help_location_share`), revocable; one-off share button while off; T3 test; OQ3 resolved |
| 14 | P38 | Stale offline SOS replay | Applied | Guard: op age > `ops_config.sos.stale_after_min` (10) → no fan-out, `cmd_results` stale → sender prompt SEND NOW / I'M OK; T4 test |
| 15 | P36 | Cancel leaves optimistic row | Applied | Cancel removes CRUD entry + rolls back local row (inverse op or bucket re-sync); T10 done-when checks the pre-op state |
| 16 | P42 | Model returns price | Applied | Price removed from model schema; `parseMenuPrice` from OCR line text in code; validator strips numbers; tests |
| 17 | P42 | T1 too big | Applied | Split into T1 iOS STT/audio/playback, T2 Android + Deepgram, T3 VAD/barge-in; effort 7 → 9 |
| 18 | P37 | T8 too big | Applied | Split into T8 storm screen + T9 replan job/3e-2 overlay; effort 10 → 11 |
| 19 | P42 | AEC / silent switch | Applied | iOS `.voiceChat`, Android VOICE_COMMUNICATION + AcousticEchoCanceler; no-AEC device → tap interrupt; silent-switch claim replaced by explicit "Mute replies" toggle / volume 0 → text only; barge-in test during own playback |
| 20 | P42, P36 | Maestro can't inject mic/camera; physical device | Applied | Debug-only fixture-audio (cp-speech) and fixture-frame (cp-ocr live) sources; P36 T5 done-when now simulator-based; physical checks moved to founder device checklists (P36, P42 Non-code deps) |
| 21 | P37 | Maestro yaml created later | Applied | Each flow created in the task that builds its screen (T4, T8, T9, T11); T11 runs the suite |
| 22 | P36 | Wrong T ref; no offline_bundles test | Applied | "Maestro in T11" (now simulator e2e in T11); `permissions/offline-bundles.test.ts` added to owns, T1 files/tests/done-when |
| 23 | P39 | `@critterpass/mobile` filter | Applied | 100 uses of `--filter mobile` vs 27 of `@critterpass/mobile` across phases → P39 uses `--filter mobile` (other phases outside chunk still mixed → OQ) |
| 24 | P38 | depends_on incomplete | Applied | [11, 14, 18, 20, 32, 34, 35, 39]; all earlier waves, wave 15 kept; plan.md update left to orchestrator (not editable here) |
| 25 | P40 | Missing deps; broad reminders owns | Applied | depends_on + 6, 9, 14, 15, 25; owns narrowed to `reminders/{conditional,conditions}.ts` |
| 26 | P36 (+P38) | Play FSI / exact alarm restrictions | Applied | Notification + Live Update is the default; FSI behind `android_fsi_alarm` / `android_fsi_sos` flags after Play declaration + `canUseFullScreenIntent()`; `SCHEDULE_EXACT_ALARM` user grant only (never `USE_EXACT_ALARM`), inexact fallback |

## plan.md / doc deltas for orchestrator
- plan.md: P36 wave 15, deps [11,13,14,15,18,20,25,32,34]; P37 wave 16, effort 11; P38 deps [11,14,18,20,32,34,35,39]; P40 deps [5,6,9,14,15,18,20,25,31,34]; P42 effort 9; wave table rows 14/15/16 and task totals.
- phase-44: register `photos` quest template via `registerQuestTemplate` (P41 owns exception `templates/photos.ts`).
- phase-20: note channel `trip_locations:` and P39 `member_etas` policy override.
- docs: `crew_collection_counts` + `crew_xp` as tables; `encounter_samples` columns; `GET /live-snapshot`; `consents.purpose help_location_share`; `ops_config.sos.stale_after_min`; flags `android_fsi_alarm`, `android_fsi_sos`; `awaiting_booker_payment` booking state.

## Unresolved questions
1. Stale-SOS threshold 10 min — confirm with the founder/counsel.
2. Standardise `--filter mobile` in phases outside this chunk (37 `@critterpass/mobile` uses remain elsewhere); phase-20 also uses `@cp/db`.
3. Storm SWAP when the booker is offline until the hold expires: currently keep the old booking. Should the organiser be able to pay instead (as a new Viator booker)?
