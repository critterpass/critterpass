# Critterpass API contracts: disruptions

Companion to [api-contracts.md](./api-contracts.md) §4.12 and [api-contracts-trip.md](./api-contracts-trip.md): flight delay (3k-5), the forecast watch list and storm decision (3k-7, 3k-8), weather replan suggestions (3e-2) and running late (3k-9). Shapes live in `packages/domain/src/disruptions/` (`commands.ts`, `types.ts`, `late.ts`, `events.ts`, `queues.ts`, `templates.ts`); the deterministic work in `packages/planner/src/disruption/`; tables in [data-model.md](./data-model.md) §3.12.

**Rules every surface keeps**

- Code works out every row, option, time and amount. The guide only words them (routes `disruption.plan_b`, `watch.copy`, `replan.weather`, `late.options`), and a line with a number or a claim its facts do not hold is replaced by the template.
- The guide runs on its own only what is free, reversible and touches only the disrupted members' own items. Anything that costs money, touches a booking or others, or reaches a vendor waits for a yes. A message to a driver, villa, spa or restaurant is only ever a draft; the ops desk sends it after a member approved its exact text.
- Copy is truthful about suppliers: "confirmed" only after the vendor's parsed reply; a flight is never "rebooked" by us; a Viator booking moves only as a new booking its original booker pays, and the old one is cancelled only after the new one is confirmed.
- A booked plan item's time follows its booking. Running late never retimes or removes one.
- The journey check uses the phone's position to route and drops it. No table, event, job payload or realtime message holds it.
- Everything here is free and unmetered.

## 1. Commands

Every command is idempotent by `op_id`, works offline (queued) and allows anonymous sessions.

| Command | Payload | Authz | Result | Events |
|---|---|---|---|---|
| `decide_disruption_action` | `{disruption_id, action_id, decision: approve\|keep}` | a member the row affects (`NOT_ELIGIBLE` otherwise; not on the trip → `NOT_FOUND`) | the ballot on the row's decision poll (`cast_ballot`); the crew decider closes it | `poll.closed` → `disruption.action_decided` (worker) |
| `undo_disruption_action` | `{disruption_id, action_id \| 'all'}` | an affected member or an organiser, inside the undo window | `{disruption_id, undone, compensations}`; `all` closes the disruption as `undone` | `disruption.action_undone` |
| `announce_disruption` | `{disruption_id}` | an organiser or a disrupted traveller | `{message_id, posted}`; the guide's line in crew chat, once per summary | `disruption.announced` |
| `hold_storm_seats` (doc delta) | `{disruption_id, hold_id}` | the original booker of the storm swap's Viator booking | the `hold_activity` result for the new date; paid with `book_activity` | as `hold_activity`; `activity.cancelled` for the old booking once the new one is confirmed |
| `dismiss_weather_suggestion` (doc delta) | `{changeset_id}` | trip member | `{dismissed, status}`; the ChangeSet is rejected and the item is not suggested again that day | `weather.suggestion_dismissed` |
| `choose_late_option` (doc delta) | `{disruption_id, option_id: push\|walk\|skip\|car}` | a member of the late party (`NOT_ELIGIBLE not_in_late_party`); the option must be `offered` (`NOT_ELIGIBLE option_not_offered`) | `{chosen, option, message_id \| null}`; the same pick again is `chosen:false` and posts nothing | `late_option.chosen` |

`choose_late_option` posts the waiting crew's line in crew chat at once, as the guide, when anyone is waiting ("Wes and Jordan are 25 min late for Karsa Spa. Start without them."); a changed pick posts a correction ("Update: …"). The worker then turns the pick into rows (§4).

The storm decision is a decision poll (`cast_ballot`, [api-contracts.md](./api-contracts.md) §4.4); its result is committed by `storm.commit`. A weather suggestion is accepted with `apply_changeset` (§4.6).

## 2. Journey check

`POST /v1/trips/{id}/journey-check` (session; one call per 30 s per user, else `RATE_LIMITED`; doc delta).

```ts
request  = { item_id: uuid, lat: number, lng: number, mode: 'drive' | 'walk' | 'scooter' | 'transfer' }
response = {
  eta_at: string;            // routed arrival
  late_min: number;          // eta_at minus the time to be there (the start; check-in time for a flight)
  traffic: boolean;          // the duration reflects live traffic
  estimate: boolean;         // straight-line estimate, no routed path
  status: 'on_time' | 'late' | 'resolved';
  disruption_id: string | null;
}
```

- The phone calls it once a minute while it is on the way to a plan item (a leave-by journey or a transfer). The server drives nothing: `eta.running_late` only does upkeep (§5).
- Errors: `NOT_FOUND item` (not on the trip's current plan, or not the caller's trip), `NOT_ELIGIBLE not_attending` / `no_place` (the item has no place to route to). A transfer booked without a place routes to its booking's placed pickup point (`details.pickup_point`, while it was placed from the booking's current pickup text; doc delta, 3 Oct 2026); `no_place` stays for an item with neither.
- Routing: Mapbox with traffic when configured, else the flagged straight-line estimate. A late ride (not a walk) is also measured on foot; the walk is offered as an option only when it was really routed and beats the ride.
- Hysteresis: `late_min ≥ 10` on two checks in a row opens the item's running-late disruption (or joins the open one); `late_min ≤ 3` on two checks in a row takes the member out of it, and the disruption resolves when nobody is left. Anything between resets both runs and changes nothing.
- Kept: one `journey_checks` row per member and item (ETA, minutes late, the two runs, mode). Never a coordinate.
- A member's own `report_running_late {item_id, minutes}` opens or joins the same disruption with the minutes they gave (`cause: manual`).

## 3. The disruption row

`disruptions` rides the `trip` stream. `kind`: `flight_delay`, `storm`, `weather`, `running_late`. One open row per `(trip_id, dedupe_key)`: `flight:<segment>`, `storm:<watch item>`, `weather:<item stable id>:<day>`, `late:<item stable id>`.

- `affected`: `{traveller_ids, item_stable_ids, unaffected_ids}`. For running late these are the late party, the item, and whoever waits there.
- `facts`: the only names, times and numbers copy may show. Running late: `{title, start, eta, late_min, mode?, walk_min?, stale?}`.
- `actions` (`disruptionActionSchema`): the rows of 3k-5, ids `<kind>:<target>`. Kinds: `retime_item`, `reschedule_pickup`, `skip_item` (plan); `recompute_leave_by`, `refresh_live_activity`, `insert_briefing`, `notify_unaffected` (the guide's own); `contact_vendor` (a draft); `rebook_flight` (a link). States: `planned → running → done` (`failed`, `undone`); `needs_yes → approved | kept`; `draft_ready → approved → sent → confirmed | declined | no_answer`; `waiting_vendor` (runs when the row it depends on is `confirmed`); `link`; `withdrawn`.
- `options`: storm (`swap`, `keep`, `skip`, with `supplier_move` once committed) or running late (`lateOptionSchema`: `{id, label, detail, offered, recommended, split, new_start, arrive_at, per_person_minor, currency, supplier, vendor_name, facts}`). `chosen_option_id` / `chosen_by` record the pick.
- `decision_poll_id`: the storm vote. `change_set_id`: the weather suggestion's ChangeSet.

Running-late options (planner):

| Option | Offered when | What picking it does |
|---|---|---|
| `push` | not a flight; others are waiting (`split`: they start on time, the late ones slot in, the plan stays) or the pushed item still fits before the party's next one; a booked item only by asking whoever runs it | unbooked item with nobody waiting: a retime through the executor (on its own when it is only the party's item, with UNDO). Someone runs the item: a draft to them, and the retime waits for their yes |
| `walk` | the ride is late and the routed walk from where they are arrives at least 2 min sooner | nothing on the plan; the app shows walking directions |
| `skip` | not a flight | unbooked item with nobody waiting: off the plan, approved as the late member's own yes. Booked: the booker cancels with the supplier (`supplier: viator_cancel \| partner_link`), refund per the cancel quote |
| `car` | the party has no ride (`walk`, `scooter`) and the item is at a known place | nothing on the plan; the app quotes a ride from where the phone is (`GET /v1/rides/quote`) |

Recommendation: `walk` when offered, else `push`, else `car`, else `skip`.

## 4. Jobs

| Queue | Trigger | Does |
|---|---|---|
| `ai.disruption` | `flight.status_changed` (delay, cancelled, diverted, schedule, landed) | impact analysis, rows under the autonomy policy, the guide's words, executor runs, decision polls, vendor drafts; a further change re-versions the row; a flight back on time takes back what the guide did; landing closes it |
| `disruption.react` | `change_set.proposed/applied`, `guide_action.undone`, `poll.closed`, `vendor_msg.approved/sent/failed/reply_parsed`, `disruption.action_undone`, `activity.hold_expired/hold_released/rejected`, `running_late.detected`, `late_option.chosen` | moves a row on the real outcome; works out running-late options; turns a late pick into rows (rows of an earlier pick still waiting are withdrawn with their draft and vote) |
| `disruption.no_answer` | 30 min after a message was sent | the row offers a call instead |
| `weather.watch` | `*/15 * * * *`; each trip is due every 3 h (≤ 16 days out), hourly within 48 h, every 15 min while a marine or volcano row is WATCHING or on PLAN B | scores the watch list (waves ≥ 2 m, wind ≥ 30 km/h, rain ≥ 60 % during the item, volcano level ≥ 3, crowds), words changed rows, opens the storm decision on PLAN B, queues `ai.replan` for rain over an outdoor item |
| `ai.replan` | `forecast.changed` with rain over an outdoor item | a dry slot the same day as a `trigger = weather` ChangeSet and a `weather` disruption with the rain band |
| `storm.commit` | the storm poll closes | applies the swap or skip by the vote; the supplier side stays truthful (`awaiting_booker_payment`, `change_on_partner`, `booker_cancel`) |
| `eta.running_late` | `* * * * *` (doc delta: the phone drives the checks; this job only does upkeep) | marks a journey whose checks stopped for 3 min as stale (`facts.stale`), resolves a running-late disruption whose item is over or gone, deletes checks older than a day |

## 5. Realtime

Disruption hints ride `trip_watch:{trip}` and `trip_plan:{trip}` (doc delta: the planned `disruption:{id}` channel has no ACL resolver and is not used).

| Channel | Event | Payload |
|---|---|---|
| `trip_watch` | `disruption.step` | `{disruption_id, action_id, state}`; `action_id` is a row id, or `late_options` (`ready`), `late_option` (the pick), `late_party` (`updated`, `resolved`), `supplier_move` |
| `trip_watch` | `late.eta` | `{disruption_id, late_min, eta_at}` on every late check; `{disruption_id, stale: true}` when checks stopped |
| `trip_watch` | `watch.changed` | `{watch_item_id, status}` for each row whose status or numbers changed |
| `trip_plan` | `forecast.band` | `{disruption_id, change_set_id, item_stable_id, date, rain_from, rain_to}` for the 3e-2 overlay; `{disruption_id, change_set_id, withdrawn: true}` when the suggestion is gone |

## 6. Notifications

| Key | Event | Who | Copy |
|---|---|---|---|
| `disruption_update` (ALWAYS, `cp.disruption` APPROVE) | `disruption.needs_yes` | the members the row affects | the guide's headline and the row's question |
| `disruption_update` | `disruption.detected` | the disrupted travellers, when the guide already did something | the guide's headline and summary |
| `watch_escalation` (ALWAYS only when plan-changing, else the roundup) | `watch.escalated` | the trip | the row's title and detail |
| `running_late_detected` (ALWAYS) | `running_late.detected` | the late party; and whoever waits, unless the member reported it themselves (they already pinged the crew) | built from names, minutes and the place, in the recipient's language: the late ones are told they can choose, the waiting ones who is late; once per member per disruption |

The first three carry the guide's own line: `disruptions.title/summary` and `watch_items.title/detail` are guide text with per-language translations (`i18n`, written by `guide_text.translate`), and the push reads the recipient's translation when the sweep has stored it, the English line until then. Row labels and option lines are not translated yet. Templates: `packages/domain/src/disruptions/templates.ts`.

## 7. Not wired yet

- Curated and web-cited closures and airport traffic on the watch list; running late therefore only ever says traffic is heavy and never names a closure.
- The live Viator sandbox check of the storm swap (waits on Viator Full + Booking access); tested with the published-contract fixtures.
