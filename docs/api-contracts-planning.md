# Critterpass API contracts: Planning and places

Companion to [api-contracts.md](./api-contracts.md): Ideas, stances and hidden places, fit, gaps, the plan check and its fixes, stored legs, plain-words search, add from a link, and the private ask. Tables live in [data-model.md](./data-model.md) §3.3, §3.13 and §3.14; streams in [data-model-sync-and-privacy.md](./data-model-sync-and-privacy.md) §4; queues and realtime in [api-contracts-async.md](./api-contracts-async.md). The typed vocabulary is `packages/domain/src/planning` (fit, gaps, ideas, stances, checks, legs, search filters, import events, commands, queues, realtime hints, events, config).

Status: contracts for the section 7 screens (7a-1 … 7i-2). Each phase refines its own rows. This file is union-merged (`.gitattributes`): add rows, don't reorder them.

## Rules that hold everywhere

- Reasons, issues, chips and import events carry codes with numbers and ids, never words. The app words them from its own templates in every language.
- Copy names the source it used: "usually busy from 10" for an editorial curve, "what crews saw" only for visit-derived rows (five crews or more), "I read the post" unless a video was actually analysed. No view counts or durations for TikTok.
- Nothing from a social post is stored except the URL on the idea. Foursquare attributes are never stored. A Navigation API result is never stored: legs and the route cache hold self-hosted routing or straight-line estimates only.
- An unsent change set draft is its author's alone. A guide's draft reaches the trip's organisers. Placed ideas, fixes and swaps are drafts until sent.
- Hides are private to their owner. A stance is an explicit public ballot and is never derived from a swipe "no" or a hidden place. Nothing about crew balance is stored or posted.
- "Participant" = an active member of the trip's crew who has not answered `out`, or its organiser; anyone else gets `NOT_FOUND`.

## Commands

| Command | Payload → result | Authz | Ent | Events | Surfaces |
|---|---|---|---|---|---|
| `save_idea` | `{idea_id?, trip_id, poi_id? \| pin{name, lat, lng}, source: save\|link\|swipe\|search\|map\|pin\|guide, source_url?}` → `{idea_id, backer_ids}`. Exactly one of `poi_id` or `pin` (`VALIDATION{reason: pin_or_poi}`). Saving a place already in Ideas adds the caller as a backer. Also saves the POI to the caller's `saved_items`. A place outside the trip's destination → `VALIDATION{reason: outside_destination}` | participant | – | `trip_idea.saved` | A, O |
| `remove_idea` | `{idea_id}` → `{idea_id, removed, backer_ids}`. The caller leaves the backers; the last backer or an organiser removes the idea (`deleted_at`), which leaves every phone | participant | – | `trip_idea.removed` | A, O |
| `hide_place` / `unhide_place` | `{poi_id}` → `{poi_id, hidden}` | self | – | – | A, O |
| `set_place_stance` | `{trip_id, poi_id, stance: want\|rather_not, note? (≤ 140)}` → `{poi_id, stance}` | participant | – | `place.stance_set` | A, O |
| `clear_place_stance` | `{trip_id, poi_id}` → `{poi_id, stance: null}` | participant | – | `place.stance_cleared` | A, O |
| `start_idea_placement` | `{trip_id, idea_ids? (1..30)}` → `{job_id}`. One running per requester per trip (input-hash dedupe; a second start returns the running job); counts toward `fair_use.system_jobs_per_trip_day`. No current plan → `STATE_INVALID{reason: no_current_plan}` | participant | – | `ideas.placed` (when done) | A |
| `post_place_decision` | `{trip_id, poi_id, option_ids (1..2), mode: suggest\|vote}` → `{poll_id}`. One change set per option (status `voting`), a decision poll over them with the default decider policy, a chat card and a push. `suggest` = the chosen way against leaving the place out; `vote` = Tokek's two ways | participant | – | `change_set.proposed`, poll events | A |
| `apply_check_fix` | `{issue_id, base_version}` → organiser `{applied: true, guide_action_id}` (ops applied with a guide-action undo, kind `check_fix`, until the item starts or 24 h) · member `{applied: false, change_set_id}` (sent to the crew). A stale issue → `STATE_INVALID{reason: stale_issue}`; an issue with no one-tap fix → `STATE_INVALID{reason: no_fix}` | participant | – | `change_set.*`, `guide_action.*` | A |
| `ask_member_about_saves` | `{ask_id?, trip_id, user_id, idea_ids (1..3)}` → `{ask_id}`: a two-party `member_asks` row with pre-validated ops, a private guide line and an inbox action for that member only; never in crew chat | organiser / co-organiser | – | – | A |
| `answer_member_ask` | `{ask_id, accept}` → `{ask_id, status: accepted\|declined, change_set_id}`. Accept applies the ops under the asker's authority while they are still an organiser, else sends a change set; decline closes it. Closed ask → `STATE_INVALID{reason: ask_closed}` | the asked member (`FORBIDDEN{reason: not_asked_member}`) | – | – | A, N |

Error reasons by code (`PLANNING_ERROR_REASONS`): `VALIDATION` outside_destination, pin_or_poi, too_many_ideas; `STATE_INVALID` stale_issue, no_fix, placement_running, ask_closed, trip_closed, no_current_plan; `FORBIDDEN` not_participant, not_organiser, not_asked_member, not_backer; `NOT_FOUND` idea, issue, ask, place. No new error codes.

## Routes

| Route | Auth | Source | Cache |
|---|---|---|---|
| `POST /v1/trips/{id}/fit` | S | `{poi_ids (1..50), day_id?, starts_at?, include_context?}` → `[{poi_id, best, days[]}]` (`placeFitSchema`) + `context` (one place only, for local re-evaluation). Participants, else `NOT_FOUND` | private no-store |
| `GET /v1/trips/{id}/places/{poiId}/nearby?limit` | S | curated places by drive minutes from the place `[{poi_id, name, category, minutes, mode}]` | private 15 min |
| `GET /v1/trips/{id}/gaps/ideas?day_id&start&end` | S | `gapIdeasResultSchema`: `{who_free[], context{busy[], next_item?}, ideas[≤ 3]{kind: single\|pair\|stay, poi_ids, minutes, cost_each_minor?, currency?, saver_id?, voted_by[], reasons[]}}` | no-store |
| `GET /v1/places/{id}/context?trip_id&date` (delta) | S | adds `when_it_fits{best, other_best?, days[], bars{from, to, hourly[], lit{from, to}}}`, `facts{open_spans[], entry?, takes_min?, dress?}`, `tip?`, `know[]`, `nearby[]`, `similar[]`, `quote?`, `split{want, rather_not, silent_user_ids[]}?`; `suggested_slot` stays for installed builds | no-store |
| `GET /v1/trips/{id}/places/{poiId}/split` | S | `{stances[{user_id, stance, note?}], silent_user_ids[], options[2]{option_id, kind: split_group\|alternative\|reschedule, title, body, attendee_ids[], day_id, starts_at, poi_id, cost{minor, currency, per: person\|car}?, going_count}}`; options cached per (trip, place, stances hash, plan version) 1 h in Redis | no-store |
| `GET /v1/places/search` (delta) | S | adds `trip_id`, `categories[]`, `attrs[]`, `open_past`, `max_minutes{from: stay\|poi:{id}\|day:{id}, minutes}`, `exclude_day_ids[]`, `price_max`, `fit=1` (fit summary per result), `relax=1` (`ways_out[{kind: widen\|related\|pin, label_params, count, areas[]}]`), `soft_misses[]` | as today |
| `POST /v1/trips/{id}/search/parse` | S | `{q}` → `searchParseResultSchema` `{filters, chips[{code, params}], exclude_reason?}`; fair use `search_parse`; kill switch or decline → `{filters: {text: q}, chips: []}` | no-store |
| `GET /v1/imports/preview?url` | S | `{platform, title?, author?, thumb_url?}` from oEmbed only, no model | no-store |
| `POST /v1/trips/{id}/imports` (SSE) | S | `{url}` or `{text, kind: screenshot}` → `importEventSchema` events `source{platform, read, title?, author?, thumb_url?}`, `match{label, poi_id, name, category, meta, fit_best?}`, `ambiguous{label, candidates[2..3]}`, `unknown{label}`, `done{matched, ambiguous, unknown}`, `error{code}`; fair use `link_import`; nothing stored | no-store |
| `GET /v1/trips/{id}/places/suggest?category&limit≤30&cursor` | S | curated places not saved, not hidden by the caller and not in the plan, ranked by fit, each with `fit{best, days[]}`; cached per (trip version, category, caller) 10 min server-side | private no-store |
| `GET /v1/trips/{id}/days/{dayId}/reorder` | S | `{before{order[], drive_min}, after{order[], drive_min, schedule[{stable_id, starts_at}]}, locked[], was[{stable_id, position, starts_at}]}` | no-store |
| `GET /v1/trips/{id}/days/{dayId}/swaps` | S | `{rain{from, to, source: forecast\|normal, recheck_on?}, crowds{source, hourly[]}, now[], swapped[], swaps[{stable_id, from, to, reason_code}]}` | no-store |
| `POST /v1/trips/{id}/check/fix-all` | S | `{issue_ids[]}` → `{change_set_id}` (a draft, the caller's alone, trigger `check`) | no-store |
| `POST /v1/trips/{id}/costs/preview` (delta) | S | adds `driving_delta_min` (planning travel over the set's ops) | as today |

## AI routes

| Route | Class | Input → output | Metering |
|---|---|---|---|
| `search.parse` | C (fast, no thinking, temperature 0) | the question + a context digest (destination, stay name, day ids with date and weekday, booked meals per day, guide) → `SearchFilter` with chips and an `exclude_reason` code; ids only from the digest; unknown words stay in `text` | fair use `search_parse` (100/day), not the guide meter |
| `links.extract_places` | M (fast, no thinking) | post text in an untrusted `social_post` block, or OCR lines in `ocr_text` → up to 10 mentions `{label, kind_hint, area_hint?, quote}`; every label and quote must appear in the source; matching is code | fair use `link_import` (30/day) |
| `places.compromise` | G (pro, thinking low) | code-built candidates, stances with notes in `crew_message` blocks → two candidate ids with title (≤ 24) and body (≤ 140); number guard; decline → templates | fair use `place_compromise` (20/day) |
| `fit_check` tool (delta) | – | output `{grade, day_no, starts_at, ends_at, reasons[{code, params}]}` from the fit engine | as the guide |
| `route_eta` tool executor | – | planning provider minutes and mode only | as the guide |

Plain-words questions asked from no results, and those queued offline, are guide questions (metered as today). The plan check makes no model call.

## Realtime

| Channel | Who | Events |
|---|---|---|
| `trip_plan:{trip_id}` | trip participants | `legs.updated{version}`, `check.updated{version, fix_count, know_count}`, `ideas.changed{idea_ids}` (hints: rows arrive through sync) |
| `swipe:{session_id}` (delta) | session participants | `match{…, idea_id}` replaces `change_set_id, day_no` for new matches |
| `user:#{uid}` | the requester | `job.progress` for `ai.place_ideas` |

## Jobs

| Queue | Trigger | Does | Policy |
|---|---|---|---|
| `plan.legs` | `plan.version_created`, `plan.ops_applied`, `change_set.applied`, `booking.edited` with a stay | writes `plan_legs` for the new version (unchanged pairs from `route_cache`), emits `plan.legs_updated` and `legs.updated` | singleton per trip, 30 s, retry 3, DLQ |
| `plan.check` | `plan.version_created`, `plan.ops_applied`, `change_set.applied` (after 45 s), `plan.legs_updated`, `trip_idea.saved/removed`, `place.stance_set/cleared`, `forecast.changed`, daily 06:00 trip time while planning, pre-trip or in-trip | writes `plan_checks`, replaces the version's `plan_check_issues`, updates `trip_ideas.fit`, emits `check.updated`; skips after `plan.check.max_runs_per_trip_day`; no model call | singleton per trip, retry 2, DLQ |
| `ideas.seed` | trip destination set, a member joining, a one-off backfill | participants' saved POIs inside the destination and unslotted swipe matches → `trip_ideas` | exclusive, retry 3 |
| `climate.normals` | monthly (`0 3 1 * *` UTC), a destination added | WeatherAPI history sampled per 0.1° cell (10 days × month × 3 years) → `climate_normals` | exclusive, retry 2 |
| `ai.place_ideas` | `start_idea_placement` (agent job kind `place_ideas`) | hours → locks → routing on touched days → needs-you; writes a draft change set (trigger `ideas`, author = requester); emits `ideas.placed` → one quiet push and an inbox row to the requester | exclusive, retry 1; system jobs cap per trip |

## Config

| Key | Default | Public | Meaning |
|---|---|---|---|
| `planning.redesign` | false | yes | the section 7 screens; off keeps the earlier plan and places screens |
| `plan.hub` | `map` | yes | what PLAN opens: the trip map (`map`) or the day plan (`day`) |
| `plan.check.max_runs_per_trip_day` | 96 | no | plan check runs per trip per day |
| `plan.check.thresholds` | `{too_far_day_min: 180, too_far_leg_min: 90, rain_pct: 50, normal_rain_pct: 40, busy_level: 70, pace_stops_per_9h: 6}` | no | when a day is too far, rainy, busy or packed |
| `routing.walk_max_m` | 1200 | no | longest leg the plan suggests walking |
| `fair_use.search_parse_per_day` / `link_import_per_day` / `place_compromise_per_day` | 100 / 30 / 20 | no | silent per-user caps |
| `imports.platforms` | `["tiktok","youtube","instagram","apple_maps","google_maps"]` | yes | link platforms Add from a link reads |

Defaults are seeded by the planning tables migration and never overwritten by a later deploy.
