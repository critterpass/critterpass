# API contracts: Help hub and crew SOS

Wire contracts for the Help hub (3k-6) and crew SOS (3k-10). Commands are listed in
[api-contracts-trip.md](./api-contracts-trip.md) §4.12; this file holds the detail they point to.
Help and SOS are free on every trip and worded as telling the crew: nothing here contacts
emergency services, and every number and facility comes from the curated catalogue.

## 1. HTTP reads

| Route | Answer |
|---|---|
| `GET /v1/help/context?trip_id&lat?&lng?` | `{trip_id, country, coverage: full\|limited, place_label, numbers{general, lines[{service, number, label}], verified_at, source_url}, facilities[{id, kind, name, address, phone, lat, lng, minutes, distance_m, estimate, open_now, insurance_match, verified_at}], phrases[{key, context, language, text, romanisation, gloss, audio_key}], active_share{share_id, ends_at}\|null}`. Participant only (`NOT_ELIGIBLE`). `limited` = no curated row for the country: `general` is the GSM number 112. With a curated row, `general` is the country's one all-services line; where the row has none or several `general` lines (Vietnam), the ambulance leads and every line stays in `lines` under its own label. Facilities are the destination's curated rows ranked by drive minutes from the position (Mapbox, straight-line `estimate: true` otherwise; `null` without a position). `open_now` is `true` for 24 h facilities and `null` when hours are unknown. `insurance_match` stays `false` until policy networks are curated; it is never guessed. |
| `GET /v1/help/checklist?trip_id&problem&lat?&lng?` | `{problem, worded, steps[{id, kind, facts, template, text}]}`. `problem`: `hurt`, `lost_stolen`, `lost`, `missed_ride`. Steps are curated per problem (`packages/domain/src/safety/checklists.ts`) and filled from the context. `text` is the guide's wording in the caller's language (route `help.checklist`, 3 s budget) or `null`, in which case the app shows its own translated template for the step `kind` with the same `facts`. |
| `GET /v1/help/shares/{share_id}/fixes` | `{fixes[{uid, lat, lng, acc, activity, at}]}` newest first, through `app.shared_location_fixes` (Help and SOS shares need no Boost). Empty when the share ended or is not visible. |
| `GET /v1/sos/{sos_id}/private` | `{health_notes: string\|null}`: the sender's sealed notes, for the sender and responders only (RLS on `help_session_private`); `null` for anyone else or when none were stored. |

## 2. Commands (detail)

| Command | Payload | Result | Notes |
|---|---|---|---|
| `start_help_share` | `{trip_id, reason: help, ttl_min? (1–180, default 60), session_id?, place_label?}` | `{session_id, share_id, ends_at, overrode_pause}` | Opens a `help` session and a 1 h `location_shares` row (reason `help`). An open Help share is answered as is. `overrode_pause` = the crew-map share was paused (the app says Help shares anyway). A `help.share_expire` job runs at `ends_at`. Consent: the app only sends this on open after the `consents.purpose = help_auto_share` opt-in; the one-off "Share my location · 1 h" button is its own consent. |
| `stop_help_share` | `{share_id}` | `{share_id, ends_at}` | Owner. Ends the share now and resolves its session. Action scope `sos` (N-25 STOP_SHARE). |
| `extend_help_share` | `{share_id, ttl_min? (default 60)}` | `{share_id, ends_at}` | Owner. From the later of now and the current end, capped at three hours ahead. `STATE_INVALID share_ended` after the end. |
| `request_ops_clinic_call` | `{trip_id, session_id?, facility_id?, share_insurance, text_shown}` | `{session_id, task_id, insurance_shared}` | Records `text_shown` as an `ops.approvals` row (`clinic_handoff`), opens one `ops.concierge_tasks` row (`clinic_handoff`, due by the desk's clinic pick-up window), sets the `ops_clinic` step pending. With `share_insurance` it records the `insurance_to_clinic` consent and runs `app.share_insurance`; `insurance_shared` is false when no policy is on file. A person at the desk makes the call. |
| `trigger_sos` | `{trip_id, sos_id?, text? (≤280), preset?: fell\|lost\|need_ride, fix?{lat, lng, acc, at}, place_label?, health_notes? (≤1000), clock_offset_ms?, confirm_of?}` | `{sos_id, status: alerting\|stale, sent_at, today_count, notes_saved}` | Action scope `sos`. The incident's location share uses the incident's id, so `/v1/loc` fixes on it publish on `sos:{sos_id}`. Health notes are sealed with the field keyring (`notes_saved: false` without one; the SOS never waits on them). `today_count` = SOS by the sender in 24 h, this one included; the app asks "are you sure?" before a fourth. |
| `respond_sos` | `{sos_id, state: seen\|coming\|calling}` | `{sos_id, state, share_id}` | A participant other than the sender, on an open SOS. `coming` makes them a responder (reads the notes), opens their own `sos` share (`share_id`, for their fixes) and starts `sos.responder_eta`; a later `seen` never downgrades `coming`. |
| `send_sos_message` | `{sos_id, message_id?, body (≤500)}` | `{message_id}` | Sender or participant, open SOS only; one row per id. |
| `resolve_sos` | `{sos_id, note?, false_alarm?}` | `{sos_id, status: resolved, alerted}` | Sender or responder. Ends every `sos` share of the incident. `alerted: false` for a stale SOS, which resolves as a false alarm without N-48. |

### Staleness (queued SOS)

The server measures when the sender pressed SEND: the earlier of the op id's UUIDv7 time and
`client_ts`, moved onto the server clock by `clock_offset_ms` (server minus device, as the app last
measured it; clamped to ±24 h). Older than `ops_config` `sos.stale_after_min` (default 10) and not a
`confirm_of` re-send → the incident is stored `stale` (sender-only by RLS and in sync), no share, no
fan-out, no takeover, event `sos.stale`, and the op's `cmd_results` row holds `result_ref.status =
stale`. The app then asks "Your SOS from {time} didn't send — are you still in trouble?": SEND NOW =
`trigger_sos{confirm_of}` (alerts, closes the stale one), I'M OK = `resolve_sos` (false alarm, no
crew alert).

## 3. Realtime

| Channel | Types | Data |
|---|---|---|
| `sos:{sos_id}` (ACL: can read the incident) | `fixes` (from `/v1/loc`), `step`, `summary`, `responder`, `message`, `escalated`, `resolved` | `step{key: sent\|location_live\|ops_clinic\|insurance, state, at, n?}`, `summary{summary}`, `responder{uid, state, at, share_id?, eta_min?, distance_m?, estimate?, arrived_at?, lat?, lng?}`, `message{id, sender_id, body, at}`, `escalated{sos_id, at}`, `resolved{by, false_alarm, note, at}` |
| `user:#uid` | `sos.takeover`, `sos.escalated`, `help.share_ended` | `{sos_id, trip_id, sender_id, at}` to each crewmate; `{sos_id, at}` to the sender; `{share_id, session_id, reason}` to the sharer |

Command transactions may publish on `sos:{id}` for an incident of their trip (`app.enqueue_rt`);
takeovers on other members' `user:` channels come from the worker.

## 4. Jobs

| Queue | Trigger | Does |
|---|---|---|
| `sos.orchestrate` | `trigger_sos` (same tx; `{sos_id, event_id}`) | Routes every crewmate's N-24 push (ALWAYS) and publishes their takeovers in parallel, marks `sent` done with `n`, arms `sos.escalate` (+120 s); then the `sos.summary` wording with a 3 s budget (the sender's words stand without it). 10 fast retries, idempotent. |
| `sos.escalate` | +120 s | Open SOS with nobody coming: `escalated_at`, event `sos.escalated` (N-24 again, same collapse id), `escalated` hints to the channel and the sender. Once. |
| `sos.responder_eta` | `respond_sos{coming}`, then every 60 s | Walking ETA (Valhalla pedestrian, straight-line otherwise) from each coming responder's latest fix to the sender's; within 50 m = arrived; stops when all arrived or the SOS closes. |
| `help.share_expire` | `ends_at` of a Help share | Resolves the Help session, `help.share_ended` to the sharer, event `help_share.expired`, purges the share's fixes. |
| `safety.retention` | daily 03:40 UTC | Deletes health notes and thread messages after 90 days, closed sessions after a year. |

## 5. Pushes

N-24 `sos` (ALWAYS, `cp.sos`, `cp_sos`, sender avatar, collapse `sos:{sos_id}`, 1 h TTL): title
"{sender} needs help"; body the preset line, else "{sender} sent an SOS to the crew." (never the
sender's own words, which may describe their health: those are read in the app); escalation "Nobody's answered yet. {sender} still needs help." N-48 `sos_resolved`
(ALWAYS): "{sender} is safe. Thanks for being there." or "False alarm: {sender} is OK." to everyone
alerted. `location_share_ending` (budgeted, `cp.help`, collapse per share, to the sharer only): "Your location share with the crew ends in 10 minutes." with STOP and +1 H, ten minutes before a Help share ends (job `help.share_ending`, event `help_share.ending`, re-armed on extend); worded as a location share, never Help. N-25 `help_share_changed` (budgeted): "{sender} opened Help and is sharing where they are
for an hour." Deep links: `/sos/{sos_id}`, and for a Help share the crew map `/map/{trip_id}`, which draws the sharer (`/help/{trip_id}/session/{session_id}` on pushes sent earlier opens the same map).

## 6. AI

`help.checklist` and `sos.summary` (fast tier, structured, no tools, DeepSeek) word curated facts
only. Every reply is checked before use (`packages/ai/src/routes/help/guard.ts`): no number the facts
do not hold, no clinic/hospital/embassy the facts do not name, no medical advice, no claim that
anyone contacted emergency services; checklist replies also keep every step and every fact.
Evals: `pnpm --filter @cp/ai eval help sos`.
