# Fix log — phases 43–49 (chunk 7)

Date: 2026-09-26. Scope: phase-43…phase-49 only. docs/ and plan.md not edited.

| # | Phase | Sev | Finding | Result | Verification / change |
|---|---|---|---|---|---|
| 1 | 43–49 | high | `@critterpass/*` / `--filter mobile` / `--filter ai` package filters | Applied | P01 fixes `@cp/<dir>` scope. Replaced every filter in P43–49 (0 left) |
| 2 | 45 | high | T4 imports P47/P49 rows, which are in the same wave | Applied (option A) | Only P54 depends on P45, so a later wave is safe. depends_on +47,49; wave 17→18; T4 text updated; OQ7 flags the plan.md table delta |
| 3 | 43 | high | `recap.completed` + toast conflicts with P47; nobody wires the arbiter | Applied | P47 L79 expects `recap.story_completed`. P43: toast removed; T6 emits at story end and mounts empty `RecapEndSlot`. P47 T7 fills the slot (edit grant) with priority 4c-2 > 3o-3 > review. P46 F-166 wording fixed; P46 exports `FtfEndingCard` |
| 4 | 46 | high | SeatCapSheet/BoostOfferButton are consumed before P46's wave | Partly applied | P23 already uses a presenter registry with a default waitlist presenter (P23 L96), so nothing imports SeatCapSheet early. P28 does need the Boost CTA. P46 now owns append-only/edit grants on P23 `seat-limit/registry.ts` and P28 `last-redraft-interstitial.tsx` + `change-day-sheet.tsx`, with a T7 step and done-when. The P12 option was not used: editing P12 is out of scope |
| 5 | 48 | high | Critter-nearby LA is started locally in the background | Applied | Foreground: local request. Background: push-to-start on P40 `encounter.dwell_started{spawn_id, poi_id, distance_band}` (no coordinates). Fallback: time-sensitive notification. Worker test `la/critter-start` added |
| 6 | 44 | high | No face-recognition model named; bystander Art. 9 processing | Applied | Names a bundled CoreML/TFLite MobileFaceNet-class model with a licence check (T4 step 0, MODEL_LICENSE.md). Bystander embeddings stay in memory and are never persisted (tested). Flag `album.face_self_match` ships off until counsel signs off. Non-code deps: bystander ruling + model licence. Matching is not limited to own uploads, which would defeat "who's in"; the flag-off default covers the risk |
| 7 | 45 | high | Purge misses external stores | Applied | Purge now covers Langfuse (by userId), Linear redaction + attachments, R2 `exports/{uid}`, Better Auth tables (enumerated in the test), PowerSync buckets, Resend, and a Twilio/Prelude note. Restoring a backup re-runs the purge. Deletion copy states 35-day backup roll-off (system-architecture Backups row: pg_dump 35 d, PITR ≤30 d) |
| 8 | 49 | med | P45/P49 path overlap; `(you)` group route breaks `/you/...` links | Applied | P49 routes → `app/you/{pings,widgets}.tsx`. P45 owns carve out `you/ping-settings/`, `pings.tsx`, `widgets.tsx`, `pings.po` |
| 9 | 48 | med | C10 context row contradicts F-171 | Applied | C10 (product-decisions L66): leave-by pips free, meet-up LA Boost. F-171 was already correct; the context row now matches C10. No C10 delta needed |
| 10 | 49 | med | C12 spoken read-out has no mechanism | Applied | Closest truthful equivalent: in-app read-out of the roundup in the guide's ElevenLabs voice (`roundup.narrate`) plus Siri Announce eligibility; Android is in-app only. Copy states the locked-phone limit. OQ4 doc delta added |
| 11 | 46 | med | Gift fulfilment via the Extend Renewal Date API | Applied | Default is a `code_grant` stacked after the store period ends. Extend Renewal Date / Play defer are now support-only admin actions (T12). F-168, T11, and acceptance updated |
| 12 | 45, 46 | med | Tasks too large for one session | Applied | P46 T3 → T3a (intent/activation/IOUs) + T3b (expiry/move/revoke/FTF/crew-year); effort 12→13. P45 T9 → T9a (preflight/close/restore) + T9b (purge/external purge/reminder/admin); effort 11→12 |
| 13 | 43 | med | Recap narration has no TTS job | Applied | `recap.narrate` added: ElevenLabs Flash per card × locale → R2, cached per version + copy hash, text-only fallback, cost bound stated. Wired into T3/T6 and the Jobs row |
| 14 | 47 | med | PrivateContent adoption deferred to P54 | Applied | Route-group default mask at capture (wallet, chat, pass, map). Explicit edit grants on P22/P24/P33 feature folders (wrapper only). OQ4 resolved; per-route test added |
| 15 | 43 | low | MVP vote is not a P26 poll | Applied | Done-when reworded |
| 16 | 49 | low | Widget counts inconsistent | Applied | 7 home / 5 accessory / 2 StandBy throughout; the gallery lists the 7 home widgets |
| 17 | 49 | low | Edits to files P49 does not own | Applied | Append-only grants for `CPWidgetBundle.swift` (P48) and `data/push/categories.ts` (P11) added to owns |
| 18 | 44 | low | Webhook HMAC assumption | Applied | Secret path token plus re-fetch of status from the vendor API; body never trusted; HMAC only where supported. T8 steps and done-when updated |
| 19 | 46 | low | FTF "store account overlap" | Applied | Now account + verified phone hash + device attestation |
| 20 | 46 | low | F-169 inline open question | Applied | Default written into the requirement (IOUs on first purchase only); OQ1 kept as a confirm |

Rejected: none. #4 applied only in part, with the reason given above.

## Unresolved questions
1. plan.md phase table / wave list must be updated: P45 moves to wave 18 with deps 47, 49; P45 effort 12; P46 effort 13.
2. Doc deltas: `recap.narrate`, `roundup.narrate`, the `encounter.dwell_started` report (P40 contract), `album.face_self_match` flag, `FtfEndingCard` / `RecapEndSlot` contracts.
3. P40 must emit the POI-level `encounter.dwell_started` report that P48 T7 consumes. Confirm it exists in P40.
