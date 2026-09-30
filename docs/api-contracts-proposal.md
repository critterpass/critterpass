# Critterpass API contracts: proposal and RSVP

Companion to [api-contracts.md](./api-contracts.md) §4.7: what the server built for the proposal, personal versions, RSVP, private objections, the dropout re-split and the waitlist hand-off. Privacy rule throughout: the organiser and peers never learn who opened a proposal or who objected privately; only public replies and crew-level counts leave the server.

## Commands

The §4.7 table stands, with these additions and precisions.

| Command | Payload | Authz | Result / notes |
|---|---|---|---|
| `create_proposal` | `{proposal_id?, trip_id, config{format, show_cost, personal, reply_by?, options[]}}` | organiser, trip `draft_review`/`proposed` | `{proposal_id, reply_by, recipients}`. Omitted `reply_by` = min(earliest booked-stay free cancellation − 1 d, trip start − 14 d), or an hour before the nearer bound when that has passed; `STATE_INVALID free_cancel_passed` when none is left. A given `reply_by` after the earliest free cancellation or in the past is `VALIDATION {reason: after_free_cancel \| in_past}`. Viator holds are never an input. Supersedes the trip's previous proposal; queues one `ai.proposal_versions` per recipient. |
| `send_proposal` | `{proposal_id}` | organiser | Crew can read it from now on; trip `draft_review → proposed`; N-07 per recipient. |
| `set_rsvp` | `{proposal_id, status: in\|maybe\|out, option_ids[]}` | recipient | `{rsvp, waitlisted, code?, waitlist_position?, cap?, boost_active?}`. Seats are claimed under the trip row lock (6, or 16 while boosted); past the cap the reply is kept as a waitlist place with `code: SEAT_CAP_REACHED` (status `applied`, not an error). `out` = `decline_trip`. `option_ids` are kept on the member's own `trip_participants.chosen_options`. |
| `react_proposal` | `{proposal_id, reaction: okay_wow\|six_am\|im_in\|heart\|fire\|laugh}` | recipient | Public by choice; updates hype. |
| `record_proposal_open` | `{proposal_id, kind: open\|view_slide, local_hour?}` | recipient | `{}`. Written through `app.record_engagement`; nothing is published by the command. |
| `submit_private_reason` | `{proposal_id, reason: cost\|dates\|plan\|other, text?}` | recipient | `{thread_id, reason, options[]}`. Private thread only (free text sealed); the member's public status becomes MAYBE if unanswered. No domain event. Use the SSE route below. |
| `choose_private_option` (doc delta) | `{thread_id, option_id}` | thread owner | `ask_crew` writes "Someone asked about …" through `app.write_anonymous_suggestion` (`K_ANON_UNAVAILABLE` under 4). |
| `schedule_proposal_followup` | `{proposal_id, at_local: YYYY-MM-DDTHH:mm, tz?}` | recipient | `{followup_id, due_at}`; N-08 when due. |
| `execute_rsvp_suggestion` / `dismiss_rsvp_suggestion` | `{suggestion_id}` | organiser | Resend schedules a `proposal_followups` row for the target; an offer publishes it (crew ≥ 4). |
| `publish_offer` | `{proposal_id, option{kind: cheaper_room\|skip_day\|cheaper_stay, id}}` | organiser, crew ≥ 4 | `offer.published` on `proposal:{id}`. |
| `decline_trip` | `{trip_id}` | participant | Frees the seat; queues `trip.dropout` and `proposal.waitlist` once. The only way the re-split starts (with an explicit OUT). |
| `set_keep_in_chat` | `{crew_id, uid, keep}` | crew organiser | `crew.member_updated`. |
| `resolve_dropout` (doc delta) | `{trip_id, uid}` | organiser | Marks the dropout's change list applied and re-prices the trip (`cost.recompute`). |

A dropout's re-split is **not** a `change_sets` row: its ops (`release_room_bed`, `move_guest`, `resplit_component`, `withdraw_reminder_entry`, `cancel_supplier_item`, `change_stay_booking`, `remove_participant_from_item`; `packages/domain/src/proposal/ops.ts`) are cost and booking changes that `apply_changeset` cannot replay. They live on `trip_dropouts.ops`; the organiser acts on each (supplier seats in the supplier flow, third-party stays on the supplier's site) and resolves it.

## HTTP

| Route | Body | Response |
|---|---|---|
| `POST /v1/proposals/{id}/private/reason` | a full `submit_private_reason` command envelope | SSE: `line {text, source: model\|template}`, `options {thread_id, options[{id, kind: skip_item\|ask_crew\|follow_up, label, text, delta_minor, display_delta_minor, currency, shared}]}`, `done`. Errors before the stream are the usual JSON envelope. A replayed `op_id` answers the stored result. |
| `POST /v1/proposals/{id}/reply` | `{text}` (≤ 500) | `202 {status: queued}`; the answer arrives as `rsvp.intent {proposal_id, intent, card: confirm_out\|suggest_reply\|null}` on the sender's `user:#uid`. |

## Realtime

- `proposal:{id}` (organisers from the start, the crew once sent): `reaction {reaction_id, user_id, kind}`, `hype_pct {hype_pct, reacted_count, boarded_count, recipients}`, `rsvp.status {user_id, status}`, `offer.published {option}`.
- Organiser `user:#uid`: `proposal.version_progress {proposal_id, recipient_id, status}`, `engagement.summary {proposal_id, opened, recipients}` (sent by the debounced suggestions job, never at the moment of an open), `dropout.ready {trip_id, user_id, dropout_id}`.

## Sync streams (`infra/powersync/streams/proposal.yaml`)

- `trip`: sent `proposals`, `proposal_reactions`, `hype_aggregates`, `anonymous_suggestions`, `trip_dropouts`.
- `trip_me`: the caller's own `proposal_versions` once sent.
- `trip_draft` (organisers): every `proposal_versions` row, unsent `proposals`, `rsvp_suggestions`.

## Jobs

| Queue | Trigger | Notes |
|---|---|---|
| `ai.proposal_versions` | `create_proposal`, per recipient | Route `proposal.personal`; 3 tries, then the shared version with "{guide} wrote the group version for {name}". Poster and postcard PNGs under `t/{trip}/proposal/{id}/{recipient}/` when R2 is configured. |
| `ai.rsvp_intent` | `POST …/reply` | Decision route `rsvp.reply_intent`; never changes an RSVP. |
| `trip.dropout` | `decline_trip` | Idempotent on `(trip_id, user_id)` via `trip_dropouts`. |
| `proposal.suggestions` (doc delta) | an open (debounced 10 min), a private "ask the crew" | Route `proposal.suggestion` words rule-made cards; copy never ties a name to a reason nor reports an open. |
| `proposal.reply_by` | cron every 5 min | N-09 once at reply-by − 24 h (unanswered + organisers); at reply-by locks, unanswered become MAYBE. |
| `followup.deliver` | cron every minute | N-08, once per row. |
| `proposal.waitlist` | `decline_trip` | Offers each free seat to the next waitlisted member (24 h), via `app.offer_freed_seats`. |
