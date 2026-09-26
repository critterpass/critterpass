# Fix log — phases 08–14 (chunk 2)

Scope: phase-08 … phase-14 only. docs/ and plan.md untouched. 21 findings: 21 applied (1 partly, via an alternative option), 0 rejected.

| # | Phase | Finding | Result | Change / reason |
|---|---|---|---|---|
| 1 | 11 | duplicate `device_action_keys` migration + action-key lib | applied | 11 owns now `*_devices_action_key_fk.sql` (FK only), routes, `/v1/actions`, Swift signer; drops `services/api/src/auth/action-key.ts`; T6 mounts the 09 middleware. 09 open question names 09 as sole owner |
| 2 | 13 | re-creates `change_sets`/`guide_actions` + op schema | applied | expand-only `*_guide_actions_undo_and_offers.sql`; `packages/domain/src/changesets/**` removed; imports 08 `plan/change-set-ops.ts`; `source_ids` added to the 08 op schema |
| 3 | 10 | duplicate publication/envelope/idempotency helpers | applied | dropped `_powersync_publication_core.sql`, `_command_pipeline_grants.sql`, `commands/envelope.ts`, `command/{idempotency,events,outbox}.ts`; kept only `_rt_outbox_notify.sql`; owning phases use `ALTER PUBLICATION … ADD TABLE`; stale errors.ts question deleted |
| 4 | 08 (+09–14) | `@cp/*` and `--filter mobile` scopes | applied | code-standards uses `@critterpass/*`; all commands in 08–14 normalised (incl. `@critterpass/mobile`, `@critterpass/media-worker`); plan-lint criterion added to 08 acceptance |
| 5 | 09 | merge ticket lacks fresh proof / surviving session | applied | ticket minted only inside the failed linkSocial/OTP verify (stores `verification_id`); merge response mints a session for existing uid; tests for both |
| 6 | 12 | needs phase 10 pipeline + relay | applied (option B) | 12 tests `entitle(tx)` in a raw `withUser` tx; the pipeline test moved to 10 T1. 10 now `depends_on` 12 (same wave 3 → 10 stays wave 4) |
| 7 | 09 | `disconnectAndClear` from 10; phase 2 fixtures | applied | `depends_on: [2, 8]` (wave unchanged); `registerOnSignOut` hook registry in 09 T8; 10 T4 registers into it |
| 8 | 14 | stream tasks unowned; two stream paths | applied | 10 T3 defines `infra/powersync/streams/<area>.yaml` + `stream-harness.ts` and writes `entitlements.yaml`/`places.yaml` (10 now depends on 12, 14). Path matches system-architecture §4.2 + code-standards §13. 11/13 use their own `notifications.yaml`/`ai.yaml` |
| 9 | 08 | system tables need app_user INSERT; rt_outbox forgery | applied | SECURITY DEFINER `app.claim_op/record_cmd_result/append_event/enqueue_rt` (channel checked against membership), no table INSERT grants; 10 grant migration removed |
| 10 | 13 | no transition to `approved` on auto path | applied | same-tx `app_system` sets `approved_by_kind='policy'` plus a decider audit row; column added in 08; DB test that a guide set never reaches approved without a decider row |
| 11 | 09 | App Attest challenge + storage missing | applied | `POST /v1/attest/challenge` (Redis, single-use) + `device_attestations` table (S, unpublished) in T3 |
| 12 | 09 | WhatsApp has no reachability lookup | applied | always try WhatsApp for allow-listed countries; signed `POST /webhooks/whatsapp` → `wa_failed` + `otp.channel_failed`; client SMS offer after 20 s |
| 13 | 14 | 61 places / guest cities unspecified | applied | named the 6 destinations (product-decisions §6); coverage tiers: 6 curated, 55 auto-conflated, world z0–8 basemap, "no curated places yet" state, Valhalla for all 61 countries (matches phase 02 spike), `destinations.geofence` for 61 places (content review P18; consumers P20/P40) |
| 14 | 14 | Mapbox terms with MapLibre (PLAUSIBLE) | applied | T5 step 0 checks the terms; fallback is text-only traffic ETA or written permission; escalate to the founder and never drop D6 |
| 15 | 14, 13 | T7 / T5 too big for one session | applied | 14 T7 → T7a components / T7b offline + Maestro (effort 7→8); 13 T5 → T5a registry / T5b grounding + web_search (effort 9→10) |
| 16 | 13 | circular `llm.pois` ownership; fixed-name denials | applied | 14 creates `llm.pois` (`*_llm_pois_view.sql`); the 13 contract test iterates the privacy registry |
| 17 | 13 | web_search could reach supplier pages | applied | `blocked_domains` list (OTAs/suppliers) + injection eval case in T5b |
| 18 | 08 | `crew:#{id}` is user-limited syntax | applied | `crew:{crew_id}` / `crew_*:{crew_id}` via `channel-names.ts` + `app.channel_name`; `#` is only for `user:#uid` |
| 19 | 12 | ISO exponents wrong (IDR, ISK) | applied | ISO 4217 table as data (IDR 2, ISK 0, no default) + `displayDecimals` override (IDR 0); golden tests for ISK and IDR |
| 20 | 11 | N-ids used as runtime keys | applied | semantic keys (`draft_ready`, `flight_delayed`, …); the N-id map stays in docs only; `{nid}` → `{id}` |
| 21 | 11 (+14) | undeclared cross-phase edits/deps | applied | 11 owns now lists `services/worker/src/rt-relay/` (modified) + `streams/notifications.yaml`. For 14, `depends_on [2,3,4,8]` (tokens/motion curves from 3, doodle art from 4). Instead of importing from 5/6 (which would push 14 to wave 4), the guide sprite comes in through a slot prop |
| 22 | 13 | embedding vendor not a user decision | applied | put to the founder as options (Voyage / self-hosted / FTS+trgm); default is none; the vector branch in 14 is flag-gated and `poi_embeddings` is optional; `VOYAGE_API_KEY` removed |

## Incidental fix
- 10 owned all of `apps/mobile/src/data/`, which collided with 09/11/12/14 subdirs. It now owns only `powersync/`, `commands/`, `realtime/`, `status/`.

## Follow-ups outside this chunk (not edited)
| Item | Owner |
|---|---|
| plan.md table: deps 9 → [2,8], 10 → [2,8,9,12,14], 14 → [2,3,4,8]; tasks 13 = 10, 14 = 8; total tasks +2. Waves unchanged | plan.md editor |
| Phases 20, 22, 33, 34, 36–39 still reference `infra/powersync/sync-streams.yaml` → switch to `streams/<area>.yaml` | their fixers |
| Other phases still use `@cp/` scopes (plan lint in 08 will flag them) | their fixers |
| Doc deltas: data-model-sync §4 path, `device_attestations`, `/v1/attest/challenge`, `/webhooks/whatsapp`, `approved_by_kind='policy'`, `destinations.geofence`, `curation` tier, `llm.pois` owner = 14 | docs owner |

## Unresolved questions
1. Embedding vendor (Voyage / self-hosted / none): founder decision.
2. Mapbox terms on Directions/Geocoding with non-Mapbox maps: verify before 14 T5.
3. Auto-tier threshold (50 POIs) for "no curated places yet": confirm.
