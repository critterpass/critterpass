# Critterpass API contracts: Explore

Companion to [api-contracts.md](./api-contracts.md): destination guide and place context reads, saved places and lists, group swiping, and sponsored picks. Tables live in [data-model.md](./data-model.md) §3.1, §3.3 and §3.13; streams in [data-model-sync-and-privacy.md](./data-model-sync-and-privacy.md) §4.

Status: server contract for the Explore screens (3d-1…3d-4, 3b-8). Stack: Hono + Zod, commands through the one registry (`/v1/cmd`, `/sync/upload`).

## Commands

| Command | Payload → result | Authz | Ent | Events | Surfaces |
|---|---|---|---|---|---|
| `save_place` / `unsave_place` | `{place_id, list_name?}` → `{place_id, saved}`. A destination id saves kind `place` (today's payload, unchanged); an active POI id saves kind `poi`. `list_name` files it in the caller's list (created on first use, so an offline save needs no list command first); saving again with another list moves it. Unknown id → `NOT_FOUND` | self | – | `place.saved/unsaved` | A, O |
| `create_saved_list` | `{list_id?, name (1..60), position?}` → `{id, name, position}`; idempotent on `list_id` or the name | self | – | – | A, O |
| `rename_saved_list` | `{list_id, name, position?}` → `{id, name, position}`; the list's saved items follow the new name; a name the caller already uses → `STATE_INVALID{reason: list_name_taken}` | self | – | – | A, O |
| `delete_saved_list` | `{list_id}` → `{list_id, deleted}`; its items go back to the default "Saved" list (`list_name = null`) | self | – | – | A, O |
| `move_saved_item` | `{item_id, list_name \| null}` → `{item_id, list_name}` | self | – | – | A, O |
| `start_swipe_session` | `{session_id?, trip_id}` → `{session_id, status: building, match_rule, joined}`. One open session per trip: a second start (or a race) joins it (`joined: true`). `match_rule` = min(2, participants), so a solo trip matches at one yes. Queues `ai.swipe_deck`. No destination → `STATE_INVALID{reason: no_destination}` | participant | – | `swipe.started` | A, O |
| `swipe_vote` | `{session_id, place_id, verdict: yes\|no\|super}` → `{session_id, place_id, verdict, match: {match_id, change_set_id, day_no, status: suggested\|unslotted} \| null}`. The card must be in the deck (`VALIDATION{reason: not_in_deck}`); an ended session → `STATE_INVALID{reason: session_ended}`. Votes on one card are serialised by a transaction lock on (session, card): the vote that reaches `match_rule` yes votes inserts the one `swipe_matches` row and, when the trip has a plan and a free slot, a `proposed` ChangeSet with one `add` for the organiser (`apply_changeset`); later yes votes and replays return the same match | participant | – | `swipe.voted` (no verdict), `swipe.matched`, `change_set.created` | A, O |
| `undo_swipe` | `{session_id, place_id}` → `{session_id, place_id, undone}`; a match already made stays | participant | – | `swipe.undone` | A, O |
| `end_swipe_session` | `{session_id}` → `{session_id, status: ended}` | starter or organiser (`FORBIDDEN{reason: starter_or_organiser}`) | – | `swipe.ended` | A |
| `record_sponsored_event` | `{placement_id, list_kind: picks\|map_carousel\|search, kind: impression\|click}` → `{recorded}`; one daily count per placement, list and kind with no user, device or trip attached; an inactive placement → `NOT_FOUND` | any | – | – | A, O |

"Participant" = an active member of the trip's crew who has not answered `out`, or its organiser; anyone else gets `NOT_FOUND`.

A "no" is its voter's alone: `swipe_votes` is owner-read and never published; the crew syncs `swipe_yes_votes` (yes and super only, kept by trigger). Realtime and events name who voted, never the verdict.

## Routes

| Route | Auth | Source | Cache |
|---|---|---|---|
| `GET /v1/explore/destinations/{id}?trip_id&month&currency&origins` | S | The `GET /v1/destinations/{id}` insights (month curve, events, FX chip, fares; every fare with `seen_at`) plus `trip_id`, `origins[{origin, user_ids}]` (each crew member's home airport when a trip is in context, the viewer's otherwise; fares are priced from these unless `origins` is given), `home_airport_missing`, and `picks[]`: `{kind: organic, item: {poi_id, name, name_local, category, tags, must_see, why_go, taste_matches}}` ranked must-sees first, then crew (or viewer) taste, commission-neutral; at most one `{kind: sponsored, label: SPONSORED, item: {placement_id, partner, poi_id, name, category, disclosure}}` at the third position, only where `sponsored(u,t)` holds. `currency` defaults to the viewer's home currency. No partner content, so nothing cached holds it | private 15 min |
| `GET /v1/places/{id}/context?trip_id&date` | S | `{poi_id, trip_id, stay{distance_m, minutes, estimate} \| null, crowd{date, best_window} \| null, crew{saved_by[], yes_by[]}, qna{text, source_at, updated_at} \| null, in_plan{day_no, stable_id, starts_at} \| null, suggested_slot{day_no, date, starts_at, ends_at, reason: quiet_window\|free_gap} \| null, add_mode: apply\|changeset, base_version}`. Trip members only (else `NOT_FOUND`). `saved_by` counts only crewmates on the trip and only for a place in its destination. `qna` is this trip's own line (never another crew's); a newer chat mention of the place queues `explore.place_qna_summary`. ADD TO DAY: organiser → `apply_plan_ops` with `base_version`; member → `create_changeset` | no-store |
| `GET /v1/explore/sponsored?destination_id&list_kind&category&trip_id&exclude` | S | `{slot: {...sponsored item, label: SPONSORED} \| null}` for lists the app builds itself (map carousel, search results), placed like the picks slot (third, never first). `null` while `explore.sponsored` is off, for Pass+ viewers, boosted trips, a placement past its impression cap, or an excluded place | no-store |

`sponsored(u,t) = ¬passPlus(u) ∧ ¬boostActive(t)` (product-decisions §3), gated by the public config key `explore.sponsored` (off until the store ads declaration and privacy label are filed). Placements (`sponsored_placements`) are written by the ops console only; a slot is chosen by destination, list and category, never by who is looking.

Supplier offers stay on `GET /v1/suppliers/offers` (uncached, verbatim, attributed; [api-contracts-suppliers.md](./api-contracts-suppliers.md)). No explore route or job caches, persists or sends supplier content to a model.

## Realtime

| Channel | Who | Events |
|---|---|---|
| `swipe:{session_id}` | participants of the session's trip; presence on | `vote{uid, poi_id, undone?}` (never the verdict), `match{poi_id, match_id, change_set_id, day_no, user_ids}`, `deck_ready{cards}`, `ended{by}` |
| `trip_plan:{trip_id}` | trip members | `changeset.created` and `match.inserted{match_id, session_id, poi_id, change_set_id, day_no}` when a match becomes a suggestion |

## Jobs

| Queue | Trigger | Does |
|---|---|---|
| `ai.swipe_deck` | `start_swipe_session` | Ranks up to 30 curated places not yet in the plan (crew taste tags, crew saves, must-sees, distance from the stay; `rankDeck`), then one `explore.swipe_notes` call (pro tier) notes the cards by short card id from our own place data only; a rejected note leaves its card bare. Sets the deck and `status = live` once |
| `explore.place_qna_summary` | place context read after a newer chat mention (singleton per trip and place) | Summarises the latest messages of that trip's crew chat naming the place (a shared place card or its name) with `explore.place_qna` (fast tier): each message inside an untrusted-data block, a strict one-line JSON reply citing a given message id; anything else is rejected and the previous line stays |

WHY THIS? is worded by the app from each card's `reasons[{code: must_see\|taste\|crew_saved\|near_stay, value?}]`, never by the model.
