# Red-team — phases 08–14 (chunk 2)

Scope: phase-08 … phase-14. Lenses: coverage, dependencies, feasibility, security/privacy, agent-executability. Sources checked: phase files, plan.md wave table, docs/code-standards.md, docs/product-decisions.md §3, backend report (EdDSA/JWKS support verified there, so not flagged).

## Summary

| Sev | Count |
|---|---|
| high | 5 |
| medium | 10 |
| low | 6 |

Main theme: **ownership collisions and wave-order violations** between 08/09/10/11/12/13/14. Parallel agents will create the same tables, migrations, and modules twice, or rely on phase-10 infra from wave 3.

## Findings

| # | Sev | Lens | File § | Issue | Fix |
|---|---|---|---|---|---|
| 1 | high | deps/exec | 09 `owns` + T9; 11 `owns` + T6 | Both own `migrations/*_device_action_keys.sql`, and both build key issue/verify/revoke middleware (09 `services/api/src/auth/action-keys/*`, 11 `services/api/src/auth/action-key.ts`). This means two tables/middlewares, or a merge conflict. | 09 owns the table + verify/issue/revoke lib. 11 owns only `devices` FK expand migration, `/v1/devices/{id}/action-keys` routes, `/v1/actions`, Swift signer. Remove duplicate files from 11 `owns`. |
| 2 | high | deps/exec | 08 T5 (`change_sets`, `guide_actions`, `change-set-ops.ts`, `state/change-set.ts`); 13 `owns` `*_change_sets_and_guide_actions.sql`, `packages/domain/src/changesets/**`, T2/T8 | 13 re-creates tables 08 already created, plus a second ChangeSet op zod schema (08 `packages/domain/src/plan/change-set-ops.ts` vs 13 `packages/domain/src/changesets/ops.ts`). | 13: rename migration to `*_guide_action_columns.sql` (expand only: `inverse`, `undo_until`, `disruption_id`) + `guide_offers*`; import 08 op schema, add `source_ids` field there. |
| 3 | high | deps/exec | 08 `ops_core_and_publication` + `packages/domain/src/commands/envelope.ts` + `src/events.ts`; 10 T1/T3 | 10 re-creates `CREATE PUBLICATION powersync` (`*_powersync_publication_core.sql`), `commands/envelope.ts`, and idempotency/outbox/event helpers (`packages/db/src/command/{idempotency,events,outbox}.ts`) that 08 already delivers (`claimOpId`, `recordCmdResult`, `enqueueRealtime`). 10's open question "does 08 create errors.ts?" is stale, because 08 does. | 10 uses 08 primitives. Make publication changes `ALTER PUBLICATION … ADD TABLE` in each owning phase. Drop 10's publication migration, or make it only add the missing private-column filters. Delete the stale question. |
| 4 | high | exec | 08, 09, 12 test commands (`@cp/db`, `@cp/api`, `@cp/mobile`, `@cp/cost-engine`, `@cp/entitlements`, `@cp/worker`); 10/11 (`mobile`) | code-standards uses the `@critterpass/*` scope. Phases 10/11/13/14 use `@critterpass/*`, but 08/09/12 use `@cp/*`, and 10/11 use `--filter mobile`. Done-when commands will fail for the agent. | Normalise every command to `@critterpass/<pkg>` (mobile = `@critterpass/mobile`). Add a plan-wide lint for `--filter @cp/`. |
| 5 | high | security | 09 F-042 "Conflict → merge", T7 | Merge ticket is "signed, bound to both uids", but the plan never requires proof of control of the existing identity (fresh verified ID token / OTP) at ticket issue. It also never says how the client gets a session for the surviving uid after the anonymous uid is deleted. Without proof, the preview leaks another account's crews/trips counts, and the merge becomes an account-takeover vector. | Issue the ticket only from the failed `linkSocial` / OTP verify that just proved the credential (store a verification id in the ticket). Execute the merge, then mint a session for the existing uid in the same response. Add tests: ticket without fresh proof → `FORBIDDEN`; post-merge session sub = existing uid. |
| 6 | medium | deps | 12 (wave 3, depends [8]) T7 done-when; 10 wave 4 | "failed command releases its quota reservation" and "`entitle()` callable by phase 10's pipeline" need `executeCommand` (10, later wave). The `rt_outbox` relay also does not exist yet. | Either move 12 to wave 4 with depends [8,10], or split T7: pure `entitle(tx,…)` tested with a raw tx in 12, and pipeline integration test in 10 T1 (which already has the entitle hook). |
| 7 | medium | deps | 09 (wave 3) T8 "Sign-out clears SecureStore + PowerSync", F-042 merge `disconnectAndClear()`; T3 uses "phase 2 spike fixtures" | The PowerSync client (10 T4) is a later wave. Phase 2 (attestation fixtures, S-AUTH gate) is not in `depends_on`. | Add 2 to depends. 09 exposes an `onSignOut` hook list, and 10 T4 registers `disconnectAndClear` into it. |
| 8 | medium | deps | 12 "stream config change by phase 10"; 14 T1 "stream entries appended", done-when "`trip_pack` stream test"; 10 T3 "later phases append" | 12 and 14 are wave 3, and 10 creates `sync-streams.yaml` + stream test harness in wave 4. Each side expects the other to add the entitlement/POI tables to streams, so nobody does. The path also differs: `infra/powersync/sync-streams.yaml` (10, 11) vs `infra/powersync/streams/` (13, 14). | 10 creates the file layout (`infra/powersync/streams/<area>.yaml`, one file per owning phase) and the stream-test helper. 12/14 stream entries + tests move to a task that runs after 10, or 10 T3 includes 12/14 tables explicitly. Pick one path. |
| 9 | medium | deps/security | 08 RLS summary (`cmd_log`, `rt_outbox`, `domain_events` = S) + T6 done-when; 10 `command_pipeline_grants` | 08 T6 must prove event + activity + outbox atomic inside a `withUser` command tx, but 08 grants no INSERT to `app_user` (10 adds it later). 10's fix (direct INSERT on `rt_outbox`/`domain_events`) also lets any `app_user` SQL path forge publishes to arbitrary channels. | In 08: `SECURITY DEFINER` fns `app.append_event`, `app.enqueue_rt`, `app.claim_op` (EXECUTE to `app_user`, channel validated against `app.uid()` membership). No table INSERT grants. Delete 10's grant migration. |
| 10 | medium | feasibility | 13 F-052 decider "auto"; 08 `app.apply_change_set` requires `status='approved'` | The auto-apply path (reversible/free/own items) has no specified approval transition. Either the guide path bypasses the "guide never writes" guard, or auto actions can't apply. | 13 T8: auto ⇒ system marks the change set `approved` with `approved_by_kind='policy'` + decider audit in the same tx (via `app_system`), then apply. Add a test that a guide-authored set can never reach `approved` without a decider row. |
| 11 | medium | feasibility | 09 T3 App Attest "assertion per sensitive call" | There is no challenge/nonce issuance route and no table for `key_id` + counter storage (not in `owns`, not in data-model refs). Replay protection can't be built as specified. | Add `POST /v1/attest/challenge` (Redis, 5 min single use) and table `device_attestations(key_id, uid?, platform, counter, receipt, created_at)` (S, unpublished) to 09 T3 files. |
| 12 | medium | feasibility | 09 T4 "WhatsApp Cloud API … when number is WhatsApp-reachable" | Cloud API has no reachability lookup. Non-delivery is only known via status webhooks (`failed`, e.g. 131026), which arrive asynchronously. No webhook route or signature check is listed. | Always try WhatsApp for allow-listed countries. Add `POST /webhooks/whatsapp` (X-Hub-Signature-256 verified), mark the verification `wa_failed`, and push `otp.channel_failed` to the client → "Send by SMS" (client-initiated after 20 s too). |
| 13 | medium | coverage | 14 F-030/F-031, open Q1 | POIs, tiles, Valhalla, and offline packs cover only "6 destinations", which aren't even named. D9 has 61 places (locals/geofences) and a guest guide for any city. Map/place/route behaviour outside the 6 is unspecified (search via `cities` only; no routing, no tiles). | Name the destination list from 08 seed / product-decisions §6. Specify the guest-city behaviour: Valhalla planet-lite or Mapbox fallback for routing, a global low-zoom PMTiles basemap, the "no curated places here yet" state, and whether the 61 places need POI geofences here or in 20/40. |
| 14 | medium | feasibility | 14 F-032 traffic, F-030 geocoding; D6 | Mapbox service terms may restrict Directions/Geocoding results to display on a Mapbox map. We render on MapLibre + our own OSM tiles. The open question only covers TTS. Unverified: flagged PLAUSIBLE. | Before T5: verify current Mapbox Product Terms for non-Mapbox-map use of `driving-traffic` + Geocoding v6 permanent. If restricted, show traffic ETA as text only (no route line from Mapbox geometry) or seek written permission. Don't drop D6 without the user. |
| 15 | medium | exec | 14 T7 (8 components + offline region download + local FTS + 6 missing states + Maestro iOS+Android); 13 T5 (every tool schema + allow-lists + grounding + web_search) | These don't fit one session. | Split 14 T7 into (a) map components + pins/clusters/motion, (b) region packs + offline search + Maestro. Split 13 T5 into (a) schemas/registry/allow-lists, (b) grounding validators + web_search. Update effort counts (14: 8, 13: 10). |
| 16 | medium | deps | 13 `llm.pois` ("once P14 landed"); 14 RLS "`llm.pois` (P13 view)" | Each phase assigns the view to the other, so neither owns it. 13 T2 also asserts denial on `supplier_*` / `engagement_events`, which don't exist at wave 6. | 14 creates `llm.pois` (base-table owner rule 13 itself states). 13's contract test asserts over whatever C3/supplier tables exist, driven by the privacy registry, not by fixed names. |
| 17 | low | security/D10 | 13 T5 `web_search` "domain allow-list" | D10 says supplier content is never fed to the LLM. Web search can pull Agoda/Viator/Klook/Booking/Trip.com/GYG listing pages. | Add an explicit blocked-domains list (all suppliers + OTAs) in `web-search.ts`, plus an eval case. |
| 18 | low | correctness | 08 T3 step 3 `crew:#{crew_id}` | In Centrifugo `#` marks a user-limited channel (the part after `#` is a user id). Crew channels are `crew:{crew_id}` per 10/async §1.2. | Use `crew:{crew_id}` / `crew_*:{crew_id}`; add a channel-name helper in `packages/domain/src/realtime` and use it in the trigger payload. |
| 19 | low | correctness | 12 F-021 exponent list | Says "ISO exponents" but lists IDR as 0 (ISO 4217 = 2), and "else 2" makes ISK 2 (ISO = 0; Reykjavík is a launch destination). | Keep the ISO table from data; add a separate `displayDecimals` override (IDR 0). Golden tests for ISK/IDR. |
| 20 | low | exec/rules | 11 T7 catalogue "N-01…N-52", `nid`; 13/11 "AI-39" | Analysis catalogue ids used as runtime keys/code identifiers. This violates the "no plan/audit ids in code" rule and is brittle. | Semantic keys (`draft_ready`, `flight_delayed`, …) with an N-id mapping kept only in docs. |
| 21 | low | deps | 11 T1 edits `services/worker/src/rt-relay/` (owned by 10); 11 T5 edits `infra/powersync/sync-streams.yaml`; 14 T7 uses tokens/motion (phase 3/6) and P05 sprites, which aren't in depends_on | Undeclared cross-phase edits/deps. | Add the paths to `owns` as "append/modify" and add the missing phases to `depends_on`. |
| 22 | low | dependency | 13 open Q5 embeddings `voyage-4-lite` (used by 14 T3/T4) | This vendor isn't in D5/D6. D5 says "Claude only". It is a user decision, not an agent default. | Put it to the founder with options: Voyage (quality), self-hosted open embedding model on worker (no vendor), or FTS+trgm only. Until then, 14 builds search with the embedding column optional. |

## Coverage check (assigned features)

| Feature | Phase | Verdict |
|---|---|---|
| F-037, F-015 | 08 | covered; see #2, #3, #9, #18 |
| F-042, F-029 | 09 | covered; gaps #5, #11, #12 |
| F-010, F-011 | 10 | covered; overlaps #3, #8 |
| F-014, F-016, F-017 | 11 | covered; overlap #1 |
| F-019, F-021 | 12 | covered; #6, #19 |
| F-013, F-052 | 13 | covered; #2, #10, #16, #17 |
| F-030, F-031, F-032 | 14 | partial: non-6 destinations (#13) |

No Supabase leftovers found. Effort is stated in sessions only; no weeks/months/dates.

## Unresolved questions

1. Exact list of the 6 curated destinations vs the 61 local places (#13).
2. Embedding vendor under "Claude only" (#22).
3. Mapbox terms for non-Mapbox-map use (#14): needs a check before phase 14 T5.
4. Streams file layout: single YAML or per-area files (#8).
