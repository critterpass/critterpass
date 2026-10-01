# Critterpass API contracts (async surface)

Status: working contract · 2026-09-26 · companion of [api-contracts.md](./api-contracts.md) (envelope, commands, HTTP, AI tools, suppliers).
Covers: Centrifugo channels, pg-boss jobs, push (APNs/FCM), notification actions + App Intents → commands, device action keys, App Group contract.

## 1. Realtime (Centrifugo v6 OSS + Redis 8, P10)

### 1.1 Rules

| Item | Contract |
|---|---|
| Connection | WSS `rt.critterpass.app`; JWT `aud: rt`, EdDSA via Better Auth JWKS, `exp` 15 min, client refresh via `/api/auth/token` |
| Channel pattern | `<namespace>:<id>`; user-limited channels `user:#<uid>` (Centrifugo `#` boundary) |
| Subscribe auth | subscribe proxy → `POST /internal/rt/subscribe` (ACL below); no subscription tokens |
| Revocation | on `crew.member_left/removed`, `participant.declined`, `location_share.changed(off)`, `session.revoked`: worker calls server API `unsubscribe` (channel) or `disconnect` (user) in the same outbox relay |
| Delivery | only via `rt_outbox` (written in command tx) → worker `rt.relay` → server API `publish`/`broadcast`; never publish before commit |
| Recovery | history + `recover: true`; client stores `(offset, epoch)` per channel. If Centrifugo returns `recovered: false` or the epoch changed → client treats channel as lossy and reconciles from PowerSync (source of truth) or the listed HTTP read |
| Payload envelope | `{v: 1, id: <event uuidv7>, type: "<aggregate.event>", at, data}`; ≤ 8 KB; client dedupes on `id` |
| Client publish | only via publish proxy on `trip_presence`, `crew_chat` (typing), `swipe` (presence ping); all other writes are commands |
| Privacy | no C3 values ever (budget maxes, private threads, raw calendar, payout, dietary detail). Locations only on `trip_locations` to participants inside an open window |
| Throttle | client-side: cursors ≤5 Hz, typing ≤1 per 3 s; server-side publish proxy drops over-rate (OSS has no per-op limits) |

### 1.2 Namespace catalogue

History = size / TTL. Presence ✓ = Centrifugo presence + join/leave enabled.

| Namespace / pattern | ACL (subscribe proxy) | Payload types | Rate | Presence | History | Phase |
|---|---|---|---|---|---|---|
| `user:#{uid}` | self | `inbox.*`, `badge.counts`, `entitlement.changed`, `usage.changed{used, limit, reset_at}`, `job.progress{job_id, step, pct}`, `guide.private_message`, `cmd.result`, `session.revoked`, `otp.channel_failed{verification_id}` | event | – | 100 / 24 h | 9, 10 |
| `crew:{crew_id}` | member | `member.joined/left/updated`, `invite.opened`, `boost.state`, `trip.summary`, `home.badges` | event | ✓ | 50 / 24 h | 23 |
| `crew_chat:{crew_id}` | member | `message.created/edited/deleted`, `reaction`, `typing{uid\|guide}`, `guide.token{stream_id, seq, text}`, `poll.tally`, `guide_offer.taken`, `boost_card` | per msg; typing ≤0.33 Hz/user; tokens ~20/s | ✓ | 200 / 72 h | 24 |
| `crew_money:{crew_id}` | member | `expense.added/edited/deleted{expense_id, trip_id}`, `balances.updated{crew_id}`, `payment.status{payment_id, status, reissued_as?}`, `reward.granted{trip_id, kind, server_ts}`, `currency.changed{crew_id, currency}`, `budget.updated{trip_id}` (doc delta) | event | – | 100 / 72 h | 33 |
| `crew_bookings:{crew_id}` | member | `import.candidate`, `booking.*`, `flight.status` | event | – | 50 / 72 h | 34 |
| `crew_collection:{crew_id}` | member | `critter.befriended`, `sighting`, `first_spotter` | event | – | 50 / 7 d | 40 |
| `poll:{poll_id}` | anyone who can read the poll (its crew, or its trip's crew) | `ballot.upserted{poll_id, option_tallies, pending_count, eligible_count}`, `poll.updated{…, stage?}` (candidate added/removed, board ↔ final), `poll.closed{…, winner_option_id}`, `changeset.tally{yes, needed}`; the same counts are mirrored as `poll.tally` on `crew_chat:` | per ballot | – | 50 / 72 h | 26 |
| `trip:{trip_id}` | participant | hub ticker `activity`, `tiles`, `boost.state`, `boost.intent_lock{by_uid, until}`, `redraft.counter{used, limit\|null}`, `seat.count` | event | – | 100 / 72 h | 36 |
| `trip_setup:{trip_id}` | trip crew member (`trip_member`, doc delta: any active member of the trip's crew, RSVP or not, as the `trip` stream and the setup tables' RLS; setup runs before anyone answers) | `step.status{step, from}`, `calendar.sync_count{synced, of}`, `availability.updated{dates}` (counts moved; rows sync), `windows.updated`, `ask.status{option_id, status}`, `budget.count{maxes_count, of}`, `budget.band{maxes_count, of, band?}` (band only from 4 maxes, never a max), `budget.locked`, `rooms.changed{version}`, `rooms.locked`, `room_swap.requested{user_id}`, `must_do.row{must_do_id, fit_status}` (doc delta: payloads) | event | ✓ | 50 / 72 h | 27 |
| `trip_draft:{trip_id}` | organiser | `draft.step{job_id, step, status: running\|done\|failed, label{key, params}\|null, reason}`, `draft.day_title{job_id, day_no, theme, stops\|null}` (themes when the outline lands, again with the stop count as each day is built), `draft.done{job_id, status: succeeded\|failed\|cancelled, version_id}`, `redraft.result{redraft_id, status, outcome: changed\|identical, candidate_version_id, day_no}`, `job.progress`, `import.progress` (doc delta: payloads; schemas in `packages/domain/src/itinerary/ids.ts`) | ~1/s during job | – | 100 / 24 h | 28 |
| `trip_plan:{trip_id}` | participant | `plan.ops{version, base_version, ops\|null, source, change_set_id}` (ops null when too large for a hint), `guide.touched`, `forecast.band`, `match.inserted`, `changeset.*` (doc delta: `created`, `item_toggled`, `sent{poll_id, policy, needed, eligible, closes_at}`, `tally{yes, no, needed, eligible, tie}`, `applied{version}`, `rejected`, `expired`, `stale`, `rebased{base_version}`), `comment.changed{comment_id, anchor_kind, anchor_id}` | per op | – | 200 / 72 h | 29 |
| `trip_presence:{trip_id}` | trip crew member (`trip_member`, doc delta: setup presence `here{screen:'setup', step}` and must-do typing come from members before they RSVP; every publish carries only what they already sync) | client publish: `here{screen, day}`, `cursor{anchor}`, `typing` | ≤5 Hz/client | ✓ | none | 29 |
| `trip_dayof:{trip_id}` | participant | `readiness{leave_by_id, up[], total}`, `packing.checked`, `leave_by.changed` | event | – | 50 / 24 h | 36 |
| `trip_watch:{trip_id}` | participant | `watch.item`, `watch.status`, `forecast.updated` | per run | – | 50 / 72 h | 37 |
| `trip_copresence:{trip_id}` | participant with active visit at spot | `copresence{spot_id, in_count, total}` (no coordinates) | event, TTL 30 min | – | none | 40 |
| `trip_locations:{trip_id}` | participant with share window open (or Help/SOS session) | `fixes[{uid, lat, lng, acc, at, mode}]`, `meetup.*`, `eta[{uid, min}]`, `ping` | fixes 15–60 s; ETA 60 s | ✓ | 1 / 5 min (last fix only) | 39 |
| `trip_quests:{trip_id}` | participant | `quest.progress`, `quest.completed`, `reward` | event | – | 50 / 72 h | 41 |
| `trip_album:{trip_id}` | participant | `photo.added`, `photo.picked`, `curation.done` | event | – | 100 / 72 h | 44 |
| `swipe:{session_id}` | participant in session | `vote{uid}` (verdict hidden until match), `match{poi_id}`, `progress`, presence ping | per swipe | ✓ | 100 / 24 h | 30 |
| `proposal:{proposal_id}` | recipient; organiser gets extra `engagement.summary` via `user:#uid` only | `reaction`, `hype_pct`, `rsvp.status`, `offer.published` (never per-person opens, C28) | event | – | 50 / 14 d | 31 |
| `guide_thread:{thread_id}` | group thread: crew member; private: owner (prefer `user:#uid`) | `token`, `tool_event`, `proposal{changeset_id}` | streaming | ✓ (group) | 50 / 24 h | 32 |
| `disruption:{disruption_id}` | affected participant | `step{action_id, status}`, `needs_yes` | per step | – | 50 / 72 h | 37 (doc delta: not used; disruption hints ride `trip_watch:` as `disruption.step` and `late.eta`, [api-contracts-disruptions.md](./api-contracts-disruptions.md) §5) |
| `sos:{sos_id}` (fixes: `sos:{share_id}` of the SOS `location_shares` row) | crew of trip | `sender.fix`, `responder{uid, state}`, `step`, `message`, `resolved` | sub-second fixes | ✓ | 200 / 24 h | 38 |
| `recap:{recap_id}` | participant | `signature`, `mvp.vote`, `mvp.result` | event | – | 50 / 14 d | 43 |
| `memory:{memory_id}` | crew | `reaction` | event | – | 50 / 14 d | 43 |

Off-app equivalents (APNs broadcast, widget push, FCM data) are in §3.

## 2. Jobs (pg-boss 12, `services/worker`, P11)

### 2.1 Rules

| Item | Contract |
|---|---|
| Enqueue | inside the command transaction via pg-boss Drizzle adapter (`boss.send(queue, data, opts)` on the tx) |
| Naming | `<domain>.<action>` (e.g. `ai.draft`); handler at `services/worker/src/jobs/<domain>/<action>.ts` |
| Idempotency | `singletonKey` = natural key (listed); handler re-reads state and no-ops if already done; side effects keyed by `op_id` or `job_id` |
| Scheduling | per-object timers via `scheduled_events(due_at, kind, ref)` computed from local time + IANA tz; cron `sched.enqueue_due` every minute moves due rows into queues |
| Retries | default `retryLimit 3, retryBackoff true, retryDelay 10 s`; dead-letter queue `<queue>.dlq` with ops alert + redrive in admin |
| Progress | AI jobs write `agent_jobs.steps` and publish `job.progress` to `user:#uid` / `trip_draft` |
| Quotas | reserved in command tx; job commits or releases (`quota.release` on final failure) |
| Timeouts | `expireInSeconds` per queue; outbound calls ≤120 s |

### 2.2 Event-driven queues

| Queue | Trigger | Handler does | Retry / DLQ | Idempotency key | Phase |
|---|---|---|---|---|---|
| `rt.relay` | `rt_outbox` insert (LISTEN wake + 1 s sweep) | publish to Centrifugo, mark sent, unsubscribe/disconnect ops | 10 fast retries | outbox id | 10 (plain worker loop); moved onto pg-boss in 11 |
| `notify.route` | domain events with notification mapping (N-01…N-53) | class (ALWAYS/BUDGET/ROUNDUP/SILENT/LOCAL) → prefs → quiet hours → budget ledger → paywall governor → `push.send` or roundup queue; guide-voice rewrite (cached) | 3 / DLQ | `(event_id, uid)` | 11 |
| `notify.release` (doc delta) | cron every 5 min | for each person holding pushes that arrived in their quiet hours (`notifications.not_before`): once quiet hours are over (their `quiet_to`, or 90 min before a leave-by inside the window) send each as itself, oldest first, within the day's budget; expired → dropped, over budget or more than 12 h late → evening roundup | 1 | – | 11 |
| `push.send` | router | APNs/FCM send; 410/UNREGISTERED → token delete | 5 exp. | `(notification_id, device_id)` | 11 |
| `push.la` | LA transitions, readiness, ETA | APNs `liveactivity` update/end/start or broadcast; FCM Live Update data | 3 | `(activity_id, seq)` | 48 |
| `push.widget` | vote/balance/plan/forecast/crew change | APNs `widgets` content-changed; FCM data → Glance; budget ~40–70/day/device | 2 | `(device_id, kind, 5-min bucket)` | 49 |
| `inbox.fanout` | domain events | inbox items + badge recompute | 3 | `(event_id, uid)` | 25 |
| `inbox.fanout` poll kinds (doc delta) | `poll.created` → `poll.vote_needed` (up to 3 answers inline, `cast_ballot`); `poll.stage_changed` to final → `poll.final_open` (pending voters); `poll.pick_needed` → organiser card; `poll.closed` → `poll.result` | settled by the voter's `ballot.cast`/`ballot.changed` (key `poll:{uid}:{poll_id}`, also the nudge key about the poll) and by the close | 3 | `(event_id, uid)` | 26 |
| `countdown.recompute` (doc delta) | `trip.created`, `trip.dates_changed`, `trip.destination_set`, `booking.flight_added/changed/removed`, `rsvp.changed`, `user.tz_changed` | `trip_participants.countdown_target_at` per C14 (flights through the `FlightSegmentsSource` port), `trip.summary` on `crew:` | 3 | event id | 25 |
| `ai.pitch` | pitch cache miss (background prewarm) | AI-01 | 2 | `(crew, place, month)` | 26 |
| `ai.draft` | `start_draft` | steps `read_profiles` (guide_reader views + crew-visible setup rows) → `check_season` (season signal, cited closures) → `skeleton` (tier from `ai.draft.skeleton_model`) → `days` (parallel) → `validate` (repair ≤2, must-do-first trim, drop) → `persist` (one private version per job, summary line) → `draft.ready` push; a final failure puts the trip back to `setup` | 2 / DLQ | `trip_id + draft_seq` | 28 |
| `avatar.moderate` (doc delta) | `set_avatar` / `issue_pass` with a photo | known-image hash match first (`moderation.hash_match` ops switch + PhotoDNA key; off = ops review): a hit rejects, quarantines the upload and reports it, never reaching a model; then DeepSeek fast-tier image classification (`avatar.moderate` route): allow → approved + `avatar.render`, reject → rejected, uncertain → ops queue (`moderate_item` kind `avatar`) | 3 / DLQ | avatar id | 22 |
| `avatar.render` (doc delta) | avatar approved (job or ops) | 40/64/120/240 px circle + ring PNGs into R2 under the owner's avatar prefix, registered in `media_objects`, keys in `avatars.variant_keys` | 3 | avatar id | 22 |
| `compliance.check` | public, imported or outbound text created offline reaches the server (upload handler or command) | the content kind's registered handler loads the text, `checkCompliance` screens it (code patterns, one Jev call, fast-tier twin fallback), the handler applies the verdict idempotently (publish, moderation review, `CONTENT_REJECTED`); payload holds ids only | 3 / DLQ | `(content_kind, content_id)` | 13 |
| `ai.redraft` | `request_redraft`, `import_shared_plan` | steps `reserve` → `load` → `redraft` (day prompt, repair once, must-do-first trim) → `diff` (`redraftDiff` + metrics) → `persist` (candidate version, status `drafting`); an unchanged day or a final failure releases the reservation and returns the trip to `draft_review` | 2 / DLQ | `redraft_id` | 28, 52 |
| `ai.fit_check` | `set_must_dos`, `lock_trip_dates`, a re-opened step | planner fit per must-do on the trip's dates (hours, time needed, arrival/departure skeleton; unknown before dates or without hours; catalogue tags `lottery` / `book_ahead:<days>` → `external_action`), then the guide's note (fast tier `must_do.fit_line`, template when off); `must_do.row` per changed row; unmetered system AI (doc delta) | 3 (stately per trip) | trip id | 27 |
| `setup.lottery_remind` (doc delta) | `scheduled_events` timers from `track_lottery` | marks the member's reminder fired → `lottery.reminder_due` → N-45 (`lottery_deadline`) | 3 | `(must_do_id, member:slot)` | 27 |
| `setup.window_recompute` (doc delta) | `set_availability`, a calendar sync, an ask answered, a member joining or leaving | `app.recompute_availability` + the planner's window options into `date_window_options` (an ask's outcome kept on its option); `calendar.sync_count`, `availability.updated`, `windows.updated` on `trip_setup:` | 3 (stately: one queued + one running per trip) | trip id | 27 |
| `setup.budget_recompute` (doc delta) | `submit_budget_max` (debounced: two pending submissions, or ten minutes after the oldest through a `scheduled_events` timer), a member joining, leaving or answering out (at once, minimum-k check), `lock_trip_dates` | maxes of current setup members (read as app_system) → `@cp/cost-engine` `budgetAggregate` → `trip_budget_aggregates` (band, dots and flags only from 4 maxes); `budget.band{maxes_count, of, band?, infeasible?}` on `trip_setup:` | 3 (stately per trip) | trip id | 27 |
| `setup.availability_ask` (doc delta) | `ask_availability` | the guide's line (fast tier `micro.line`, `{dates}` filled at delivery so no calendar reaches the model; template when off) → `availability_ask.created` → N-05 | 3 / DLQ | ask id | 27 |
| `setup.ask_reply` (doc delta) | `answer_availability_ask` with `text` | intent on `availability.reply_intent` → settles like a quick reply, or leaves the ask open; the text is erased | 3 / DLQ | ask id | 27 |
| `calendar.sync` (doc delta) | `connect_calendar`, setup opening, daily from `calendar.stale_nudge` | refresh the token when due, Google `freeBusy` / Graph `calendarView` (`showAs`, times, all-day only) → date-level days in the member's zone (manual marks win; tentative as `maybe` only with consent); a revoked grant marks the source `error`; queues the member's window recomputes | 3 | source id | 27 |
| `ai.proposal_versions` | `create_proposal` | one child per recipient (AI-15), costs injected | 3 each | `(proposal_id, uid)` | 31 |
| `ai.rsvp_intent` | reply text | AI-18 intent; `out` → `trip.dropout` | 3 | message id | 31 |
| `trip.dropout` | `participant.declined` | room re-optimise, Viator cancel if applicable, re-split, waitlist promote, ChangeSet | 3 / DLQ | `(trip_id, uid)` | 31 |
| `ai.swipe_deck` | `start_swipe_session` | deck[30] + notes | 2 | session id | 30 |
| `explore.place_qna_summary` (doc delta) | place context read after a newer crew-chat mention | the trip's Q&A line per place | 2 | trip id + poi id | 30 |
| `chat.photo_thumbnail` (doc delta) | `send_message` with photos | 480 px JPEG per photo into R2 under the sender's photo prefix, registered in `media_objects`; `derived_key` and the photo's size written into the message's attachment | 3 | message id | 24 |
| `chat.voice_transcode` (doc delta) | `send_message` with a voice note | ffmpeg: mono AAC 32 kbps M4A capped at 2 min, measured duration and 48 waveform peaks written into the attachment (`derived_key`, `duration_ms`, `peaks`) | 3 | message id | 24 |
| `ai.guide_mention` | crew chat mention | AI-20 stream to `crew_chat` | 1 | message id | 32 |
| `ai.queued_answer` | 00:00 local reset | AI-40 answer, passive push N-36 | 3 | question id | 32 |
| `ai.receipt` | `POST /v1/receipts` | server transcription (`s{n}` lines) when the device read nothing or an unsupported script → `receipt.parse` keyed by line id → every amount re-parsed from its cited line (unprinted amounts rejected) → lines vs total → suggestions → `receipts` row + `user:#uid` `receipt.parsed` (doc delta) | 2 / DLQ | receipt id | 33 |
| `money.rerate` (doc delta) | `set_crew_settlement_currency` | every live expense re-expressed in the new currency (its own FX run when it relates the pair, else the newest): old entries reversed, new ones derived from the stored shares; confirmed payments' entries moved the same way; open requests cancelled; marked-paid and disputed payments restated; idempotent | 3 / DLQ | crew id | 33 |
| `money.autoconfirm` (doc delta) | cron `0 4 * * *` SGT | payments marked paid ≥ 7 d ago and not disputed → confirmed (`auto_confirmed`), ledger entry, Settled Tokek when it clears the trip (`app.grant_settled_if_square`) | 2 | – | 33 |
| `mail.parse` | inbound email | sanitize → JSON-LD/Microdata → fast-tier extract (no tools) → validate → dedupe → candidate → N-13 | 3 / DLQ | message-id header hash | 34 |
| `import.parse` | `import_paste`, `import_scan` | same parser path; allow-listed links fetched once (private addresses, off-list redirects and bodies > 2 MB refused); BCBP barcodes decoded and joined to their flight (doc delta) | 3 | candidate id | 34 |
| `flight.poll` (doc delta) | timers at T−72 h (registers the AeroAPI alert), T−24 h, T−6 h, T−3 h | AeroAPI (else AeroDataBox) reading → the same diff as `flight.event` | 3 | `(segment_id, slot)` | 34 |
| `booking.deadline_reminder` (doc delta) | timer at `free_cancel_until − 24 h` | `booking.deadline_due` → `booking_deadline` (ALWAYS) to the owner | 3 | booking id | 34 |
| `flight.watch_sweep` (doc delta) | hourly | ends watches a day after landing, deletes their AeroAPI alerts | 2 | – | 34 |
| `flight.event` | AeroAPI webhook | status diff → N-14/N-41, LA, `ai.disruption`, landed → `hatch_egg` | 5 | `(flight_id, alert_id)` | 34 |
| `ai.disruption` | flight event, watch escalation | AI-28 actions `{kind, reversible, needs_approval, cost_delta}`; progress on `disruption:` | 2 / DLQ | disruption id | 37 |
| `guide_action.execute` (doc delta) | a guide action is planned | autonomy decider → auto (policy approval with decider audit, apply ChangeSet, undo window + timer, `guide.touched`) or needs a yes (`changeset_approval` poll draft) or forbidden | 3 / DLQ | action id | 13 |
| `guide_action.undo_expire` (doc delta) | per-object timer at `undo_until` | closes the undo window in the synced row, `guide.undo_closed` on `trip_plan` | 3 | action id | 13 |
| `ai.replan` | material forecast change | AI-14 ChangeSet | 2 | `(trip_id, forecast_hash)` | 37 |
| `sos.orchestrate` | `trigger_sos` | deterministic fan-out (push ALWAYS + LA) first; AI-30 summary with hard timeout off the fan-out path; escalation timer | 10 fast | sos id | 38 |
| `supplier.hold_expiry` | hold created | release/mark expired before lapse; close linked ChangeSet (C41) | 3 | hold id | 35 |
| `vendor.reply_parse` | WhatsApp inbound | AI-31 reply intent → user card | 3 | wa message id | 35 |
| `quest.evaluate` | the events any registered template or XP source reads (`visit.recorded`, `expense.added`, `critter.befriended`, `copresence.completed`, `trip.settled`; later features add theirs to `QUEST_INPUT_EVENTS`) | visit and settle XP, progress by distinct counted keys, completion → `app.grant_quest_reward`; `quest_progress.source_event_ids` makes a repeated event a no-op | 3 (DLQ) | event id | 41 |
| `critter.verify` | `befriend_critter` | plausibility (speed, flight continuity, attestation, mock flags, skew) → verify/revoke | 3 | encounter id | 40 |
| `reward.fanout` | reward events | stamps, icon unlocks, XP; same server ts | 3 | event id | 40 |
| `media.process` | `register_photo`, avatar | thumbnails (sharp), hash dedupe, moderation, avatar PNG sizes for push/LA/widgets | 3 | media key | 44, 45 |
| `ai.curate_album` | photos added (debounced 10 min) / trip end | AI-35 picks[24] + note (prefiltered) | 2 | `(trip_id, photo_set_hash)` | 44 |
| `community.prepare` | `publish_shared_plan` | PII scrub, face blur derivative, title/tags (AI-36), match vectors | 2 / DLQ | shared plan id | 52 |
| `postcard.fulfil` | `mail_postcard` | vendor order, status sync, failure refund of quota | 5 | postcard id | 44 |
| `billing.apply` | RevenueCat webhook | refetch subscriber → fulfil/revoke; boost activation + IOUs; N-34/N-37 | 5 / DLQ | RC event id | 46 |
| `boost.expire` | scheduled at `ends_at` | flip entitlements, end crew LAs, freeze seats >6, notify | 3 | boost id | 46 |
| `export.build` | `request_data_export` | zip JSON + media + chat → R2 signed link, N-40 | 3 | export id | 45 |
| `account.purge` | grace end | cascade delete/anonymise, R2 manifest delete, SIWA + Google revoke, write-offs | 3 / DLQ | uid | 45 |
| `feedback.forward` | `submit_feedback` | AI-38 triage → tracker | 3 | ticket id | 47 |
| `idea.shipped_fanout` | tracker webhook | N-38 to voters when app version ≥ fixed | 3 | idea id | 47 |
| `content.publish` | `approve_content_batch`, `rollback_content_release` | verify the release artifact's checksum, replace the kind's catalogue rows in one tx (refuses unreviewed emergency/allergy cards and unverified safety records: release → `blocked` with the reason), mark the previous release `superseded`, `catalogue.changed` on `catalog`; `pnpm content <kind> pull` copies it into `packages/content` | 2 / DLQ | release id | 18 |
| `media.ingest` (doc delta) | `content.publish` of a `media` release, per asset not ready | download the source file, WebP stills (480/828/1242/1656 w, never upscaled), blurhash + dominant colour; video: 8 s muted H.264 loops (720/1280 w, faststart, ≤ 2.5 MB) and the first frame as poster; upload under `c/media/<id>/`, mark `ready`; a 404/undecodable file → `failed` without retry | 3 / DLQ | asset id | — |
| `content.embed` (doc delta) | help release published | embeds help articles into `help_articles.embedding`; a no-op until an embedding vendor is chosen (help search runs on the full-text index meanwhile) | 3 | release id | 18 |
| `og.render` | invite created, referral code minted (warm); code rotated, invite revoked, code expired in `maint.codes` (purge) | `GET {web}/og/{kind}/{code}.png?warm=1` as a preview bot: the web Worker draws the Takumi card into R2, or answers 404 and deletes it when the code no longer resolves | 3 | `(kind, code)` | 51 |
| `cost.recompute` (doc delta) | trip quotes, participants, rooms, plan version or FX run changed | `services/worker/src/cost/recompute.ts`: loads inputs (room plans too: one `room`-unit component per occupied room, the index stay estimate cut to the nights no room plan prices; doc delta), prices with `@cp/cost-engine`, replaces `cost_components`, writes own `share_calcs` + `trip_share_totals`, `tiles` hint on `trip:{trip_id}`; no-op when the input hash is unchanged | 3 | trip id (job key), input hash (writes) | 16 |
| `plan.stale_sweep` (doc delta) | a new group plan version (`apply_plan_ops`, an applied change set) | `services/worker/src/jobs/plan/stale-sweep.ts`: every pending group change set on an older base is rebased onto the current version when nothing it touches moved (`changeset.rebased`), else marked `stale` with its vote closed as no (`change_set.stale`, `changeset.stale`) | 3 exp. | `trip_id:version_id` | 29 |
| `poi.embed` (doc delta) | POI created/updated | `services/worker/src/places/embed.ts`: embeds searchable text, upserts `poi_embeddings`; flag-gated no-op until an embedding vendor is chosen | 3 | poi id | 14 |
| `poi.live_check` (doc delta) | place detail open, `last_live_check_at` > 24 h | `services/worker/src/places/live-check.ts`: Foursquare open/closed check, upserts `poi_live_checks`; degrades to `gated` (no retry backoff) on the account's own credits-exhausted response | 3 | poi id | 14 |
| `la.orchestrate` | `leave_by.*`, `readiness.changed`, `meetup.*`, `eta.updated`, `flight.event`, `poll.*`, `boost.*` (event hook) and the lifecycle sweep | one object's Live Activities: kill switch `la.<kind>.enabled` (off → end what shows once, never start or update) → loader → start (push-to-start, first start creates the object's broadcast channel) / one broadcast or per-token update / end per device; two per phone by rank; dismissal final; unchanged frame sends nothing; LA off or no start token → counted fallback | 3 × 5 s | exclusive per `(kind, ref_id)` | 48 |

### 2.3 Cron and per-object schedules

| Queue | Schedule (tz) | Handler | Phase |
|---|---|---|---|
| `sched.enqueue_due` | `* * * * *` | move due `scheduled_events` into queues | 11 |
| `eta.meetups` | every 60 s per active meetup (self-rescheduling) | Valhalla ETAs → `trip_locations`, LA broadcast p5 (p10 on arrive/late/all <5 min) | 39 |
| `eta.running_late` | `* * * * *` | doc delta: upkeep only. The phone drives the checks (`POST /v1/trips/{id}/journey-check`, which detects ETA ≥ start + 10 min twice in a row → N-27); this job marks journeys whose checks stopped for 3 min as stale, resolves a running-late disruption whose item is over, and deletes checks older than a day ([api-contracts-disruptions.md](./api-contracts-disruptions.md)) | 37 |
| `weather.watch` | `0 */3 * * *` (hourly within 48 h; 15 min marine/volcano alerts) | forecast watcher → `trip_watch`, `ai.replan` | 37 |
| `fx.refresh` | `15 * * * *` | Frankfurter snapshot | 12 (snapshot fn); cron registered in 15 |
| `fares.refresh` | `0 2 * * *` SGT | Travelpayouts calendars for active origins × candidates; price-drop detect (AI-03) | 15 |
| `crowds.refresh` | `0 3 * * *` SGT | expires weekly crowd patterns older than 90 d (no hourly source contracted) | 15 |
| `season.ingest` | `0 4 * * *` SGT, works Mondays and inside blossom/foliage windows | month `price_index` from fares (≥ 3 origins); bloom/legendary windows → reminder reschedule | 15, 40 |
| `season.research` | `0 5 1 * *` SGT | per live destination, code-built `web_search` queries (destination, month three ahead, event keywords) → `season.research` extraction → cited candidates in the season review queue (`season_events`, `reviewed_at` null, deduplicated); served only once a content reviewer approves (D23) | 15 |
| `weather.refresh` (doc delta) | `*/15 * * * *`; each point due at 3 h, 1 h within 48 h of an outdoor item, 15 min marine while under way | WeatherAPI.com forecast + marine → `weather_snapshots`; `forecast.changed` on material change | 15 |
| `hazards.refresh` (doc delta) | `*/15 * * * *`; reads hourly, every tick while a trip is under way | MAGMA / IMO / JMA / CENAPRED / GDACS → `hazard_alerts`; `hazard.changed` on a level move | 15 |
| `briefing.build` | per user local morning (`scheduled_events`) | AI-27 | 36 |
| `quests.sweep` (doc delta) | hourly (`2 * * * *` UTC) | queues `quests.generate` for every trip on its dates (not voting, cancelled or archived) whose clock is past 04:00 and that has no quests for its local date; expires quests past their deadline | 41 |
| `quests.generate` | `quests.sweep` | `{trip_id, local_date}`: AI-32 → validator → deterministic fill to three → publish, N-31; once per trip day | 41 |
| `roundup.build` | per tz bucket, user time −10 min (default 20:00) | AI-39 ≤5 items, template fallback, skip empty | 49 |
| `leaveby.schedule` | per LeaveBy: start T−≤8 h (push-to-start), T−15 relevance, T0, end | LA + alarm re-sync background push; crew knock at 2nd snooze/T0+N | 36, 48 |
| `poll.close` | `scheduled_events` timer at a non-board poll's `closes_at` | closes under the poll row lock with the tie rule (a moved deadline or an earlier close: no-op); destination → trip `won`, reveals, N-03 | 26 |
| `poll.board_advance` (doc delta) | timer at a destination board's `closes_at` (7 d after it opened) | top two → final (N-01 + `poll.final_open` to those who must vote again); tied final spot → `poll.pick_needed` inbox item to the organiser and one more day; one place → it wins; empty board → another 7 d | 26 |
| `poll.remind` (doc delta) | timers −24 h / −2 h before a non-board `closes_at` | `poll.closing_soon` → N-02 to voters still pending | 26 |
| `plan.changeset_expiry` (doc delta) | `scheduled_events` timer at a change set vote's `closes_at` (≤ earliest hold expiry) | an undecided vote closes as no and the change set ends `rejected` (`change_set.expired`, `changeset.expired`, result push): expiry keeps the current plan; a vote closed another way is settled by its winner | 29 |
| `ai.pitch` (doc delta) | cron 05:00 Asia/Singapore | fresh pitches (≤20 per run) for places in crews' decks (queued, or back in the deck within 30 d) whose fares moved; no model key → nothing | 26 |
| `proposal.reply_by` | reply_by −24 h, at reply_by | N-09, close | 31 |
| `proposal.suggestions` (doc delta) | an open (debounced 10 min), a private "ask the crew" | organiser suggestion cards + `engagement.summary` | 31 |
| `followup.deliver` | recipient local `at` | N-08 | 31 |
| `nudge.dispatch` | `scheduled_events` timer at the target's engagement hour (modal open hour of 14 d, fallback 19:00, moved out of quiet hours) | marks sent, `nudge.received` → inbox item + N-12 | 25 |
| `tips.generate` (doc delta) | `0 6 * * *` SGT + per crew on `fare.dropped` | detectors (fare drop ≥ `home.tips.min_fare_drop_pct` vs stored-night median, book-by, season peak, crowd dip) → `tips.phrase` line validated against facts, template fallback; ≤1 new tip/crew/day; `home.tips.enabled` kill switch | 25 |
| `reminders.conditional` | per reminder due | N-30 / N-45 only if condition holds | 40 |
| `boarding.schedule` | per flight boarding time | N-41, flight LA push-to-start T−3 h | 34 |
| `location.expire` | share TTL / last-day midnight | stop share, purge fixes | 39 |
| `location.fixes_ttl` | `* * * * *` UTC | delete fixes older than 15 min unless their SOS share is open or ended < 24 h ago | 20 |
| `visits.ttl` | `5 * * * *` UTC | visits of archived/cancelled trips get `expires_at` = now + 30 d; delete visits past `expires_at` | 20 |
| `daybundle.build` | night before + stay geofence exit + wake | offline bundle version | 36 |
| `trips.lifecycle` (doc delta) | `*/10 * * * *` UTC | the timed trip moves of data-model-sync-and-privacy §3.1 on the trip's clock (`trips.tz`, else the destination's, else UTC), in lifecycle order so a trip that fell behind catches up in one run: `proposed → confirmed` (sent proposal's `reply_by` passed, ≥ 1 IN), `confirmed → pre_trip` (00:00 on start − 14 d, at once when confirmed later), `pre_trip → in_trip` (12:00 on the first day, fallback), `in_trip → post_trip` (midnight after the last day), `post_trip → archived` (`app.boost_window_end`, last day + 7 d); each move is its own transaction with its `trip.status_changed` | 36 |
| `trips.lifecycle_signal` (doc delta) | `flight.landed`, `egg.hatched` (trigger `arrived`) | an inbound final leg (not a connection within 24 h, not landing where the traveller's first leg on the trip left from, landing from the day before the first day) or a device arrival from 00:00 on the first day starts a `pre_trip` trip; a return landing home on or after the last day ends an `in_trip` trip; first signal wins | 36 |
| `recap.build` | trip end (last-day local midnight) + debounced re-run | AI-34, share renders, N-32 | 43 |
| `anniversary.scan` | `0 1 * * *` per tz bucket | N-35 | 43 |
| `ftf.ending` | FTF end −3 d local | N-33 (governed) | 46 |
| `billing.reconcile` | `0 5 * * *` | RevenueCat REST drift check, grace expiry (server 7 d) | 46 |
| `billing.intent_expiry` (doc delta) | intent timer (15 min) | lapses an open boost intent, frees the trip lock | 46 |
| `ftf.grant` (doc delta) | trip enters `setup` | first trip free check and grant | 46 |
| `boost.trip_changed` (doc delta) | trip `cancelled` | moves its boost to the crew's next trip or a credit | 46 |
| `pause.remind` | resume −N d | N-37 | 46 |
| `mailbox.scan` | hourly, acting on connections whose owner's local hour is 07 (doc delta), and on connect | Gmail history / Graph delta; headers first, bodies only for the trip filter's picks; lapsed Pass+ pauses | 34 |
| `calendar.stale_nudge` | `0 * * * *` UTC (doc delta: hourly, acting on members whose local time is 09:xx) | members of trips still choosing dates whose calendar is missing or older than 72 h: one `calendar.stale` (N `setup_task`) per stale period; queues the daily `calendar.sync` of OAuth calendars not synced for 24 h | 27 |
| `availability_ask.timeout` (doc delta) | `scheduled_events` timer 48 h after `ask_availability` | an ask still open times out: its option shows `timed_out`, `availability_ask.timed_out` → N-46 to whoever asked | 27 |
| `maint.purge` | `30 3 * * *` SGT | retention: fixes TTL, visits, encounter samples, receipts/menu images, face data, `cmd_log` 30 d, `cmd_results` 14 d, `rt_outbox` 7 d after send, `domain_events` 400 d, `notifications` 90 d, media orphans, invites + PII | 11 |
| `maint.anon_gc` | `0 4 * * *` | delete anonymous accounts inactive 90 d with no crew | 11 (rules from 09) |
| `maint.tokens` | `0 */6 * * *` | LA token hygiene, APNs channel GC (≤10k channels/env), ended activities | 48 |
| `maint.codes` | `0 * * * *` | invite/join/gift/offer code expiry, abuse checks | 23, 46 |
| `maint.purge_reminder` | purge_at −3 d | N-52 email/SMS | 45 |
| `powersync.compact` | `0 19 * * *` UTC | bucket compact | 11 |
| `ops.backup` | `0 20 * * *` UTC | off-provider `pg_dump` → R2 (monthly restore drill is ops runbook) | 11 |
| `poi.ingest` (doc delta) | monthly per destination | `services/worker/src/places/ingest.ts` via `tools/maps/ingest-cli.ts` (no pg-boss schedule wired yet — run manually/via Railway cron until this queue exists): reads Overture (+ FSQ OS Places where a source is configured) for the destination bbox, conflates, upserts `pois`, writes an attribution NOTICE; idempotent (rerun creates no new ids) | 14 |
| `la.lifecycle` | `* * * * *` (UTC) | due starts, time-driven frames and planned ends for live objects; 8 h restart (same content version, never for a switched-off kind); stale marking; ended rows purged after 7 d | 48 |
| `la.channels` | `17 * * * *` (UTC) | Channel Management API delete of broadcast channels past `delete_after` (`broadcast_channels.gc`) | 48 |

## 3. Push contracts (P11, P48, P49)

### 3.1 APNs (`@parse/node-apn`, token auth .p8)

| Push type | Topic | Use | Priority | Payload |
|---|---|---|---|---|
| `alert` | `<bundle>` | notifications N-* | 10 ALWAYS/time-sensitive; 5 passive | `aps{alert{title, body}, sound?, category, thread-id: crew_id, interruption-level: passive\|active\|time-sensitive, relevance-score, mutable-content: 1, target-content-id?}`, `cp{...}` (below); `apns-collapse-id` per poll/item |
| `background` | `<bundle>` | alarm re-sync, snapshot refresh | 5 | `aps{content-available: 1}`, `cp{type: resync, scope}` |
| `liveactivity` | `<bundle>.push-type.liveactivity` | LA start/update/end per device token | 5 routine; 10 arrive/late/SOS/T0 | `aps{timestamp, event: start\|update\|end, content-state, stale-date, dismissal-date?, relevance-score, alert? (required on start), attributes-type + attributes (start), input-push-channel (start, iOS 18+)}` |
| broadcast (`liveactivity` on channel) | channel id per LeaveBy/MeetUp/Vote | crew fan-out | 5 / 10 as above | `aps{event: update\|end, content-state, timestamp}`; channels created/deleted via Channel Management API |
| `widgets` | `<bundle>.push-type.widgets` | WidgetKit push (26+) | 5 | `aps{content-changed: true}` |

Common custom block `cp` (≤1 KB):

```json
{ "v": 1, "nid": "<uuidv7>", "type": "vote.needs_you", "deeplink": "critterpass://crew/<id>/vote/<poll>",
  "crew_id": "…", "trip_id": "…",
  "sender": { "kind": "guide|member|system", "id": "tokek|<uid>", "name": "Tokek", "avatar": "avatars/guide-tokek@3x.png" },
  "ctx": { "poll_id": "…", "options": [{ "id": "…", "label": "Bali" }] },
  "full": false }
```

`full: false` → NSE fetches `GET /v1/notifications/{nid}` with the action key (minimal-payload mode for private content).

**Communication Notification sender identity (NSE):** `INSendMessageIntent` with `sender = INPerson(personHandle: INPersonHandle(value: "cp-guide:<guide_id>"|"cp-user:<uid>", type: .unknown), displayName, image: INImage(avatar from App Group avatars/ or downloaded signed URL))`, `conversationIdentifier = crew_id` (or `guide:<guide_id>:<uid>` for 1:1 guide), `speakableGroupName = crew name`; donate interaction, `content.updating(from: intent)`. Fallback when the capability is refused: plain alert + avatar image attachment. Guide personas always carry AI disclosure in the conversation name ("Tokek · AI guide").

### 3.2 LA activity types (`targets/_shared/ActivityAttributes/*.swift` ↔ `packages/domain/src/live-activities.ts`)

ContentState ≤4 KB, ETA/text only, never coordinates; art = bundled/App Group assets by key.

| Activity | Attributes (static) | ContentState | Start | Updates | Ent | Phase |
|---|---|---|---|---|---|---|
| `LeaveBy` | `trip_id, leave_by_id, title, legs[]` | `{leave_at, state: waiting\|soon\|go\|late\|done, up_count, total, pips[{uid_hash, up}], leg, guide_line}` | local, scheduled `startDate` (26+), or push-to-start T−≤8 h | broadcast channel per LeaveBy (crew pips need boost for crew channel; own LA free) | own free; crew pips per C10 | 48 |
| `MeetUp` | `trip_id, meetup_id, place_name` | `{eta[{uid_hash, min}], all_under_5, state}` | push-to-start | broadcast p5 (p10 arrive/late) | Boost | 48 |
| `Flight` | `booking_id, flight_no, route` | `{phase, sched, est, gate, delay_min, colour}` | push-to-start T−3 h | per-device token | free (C37) | 48 |
| `Vote` | `poll_id, question` | `{closes_at, tallies[], voted: bool}` | push-to-start T−24 h | broadcast per poll | free | 48 |
| `CritterNearby` | `spawn_id, silhouette_key` | `{distance_band, blur_stage}` | local | local/token | free | 48 |
| `Storm` | `trip_id, watch_id` | `{severity, window, action_line}` | push-to-start | token | free | 48 |
| `SOS` | `sos_id, sender_name` | `{state, responders, last_seen_min}` | push-to-start (recipients), local (sender) | token p10 | free | 48 |
| `Alarm` (AlarmKit `AlarmAttributes<CPAlarmMetadata>`) | `leave_by_id` | countdown/paused presentation | AlarmKit schedule at plan sync | re-sync via background push | free | 36, 48 |

Android: same types as Live Updates (`ProgressStyle`, API 36+ gate; MetricStyle 37+ gate) or ongoing notification below 36, driven by FCM data `{type: "la.<kind>", op: start|update|end, state}`.

### 3.3 FCM (`firebase-admin`, HTTP v1)

| Message | Priority | Body |
|---|---|---|
| Notification (all N-*) | high for ALWAYS, normal otherwise | **data-only** `{v, nid, type, channel_id, title, body, cp: <same JSON as APNs cp, stringified>}`; app renders MessagingStyle + `Person` + dynamic conversation shortcut (sender identity parity) |
| Live Update | high | `{type: "la.<kind>", op, state}` |
| Widget | normal | `{type: "widget.refresh", kinds[]}` → Glance `update()` |
| Resync | normal | `{type: "resync", scope}` → WorkManager expedited |

Android channels (`cp_always`, `cp_alarm` USAGE_ALARM, `cp_crew_chat`, `cp_votes`, `cp_money`, `cp_trip`, `cp_guide`, `cp_critters`, `cp_roundup`, `cp_sos` DND-bypass request). Channel id per notification class/category is fixed in `packages/domain/src/notifications.ts`.

### 3.4 Notification categories and actions

Category ids shared iOS (`UNNotificationCategory`) / Android (action set). Background actions (no unlock) run via extension or receiver → `POST /v1/actions` with action key; `.foreground` actions open the app route.

| Category | Notifications | Actions (id → command) | Content ext |
|---|---|---|---|
| `cp.vote` | N-01, N-02 | `VOTE_1..VOTE_3` → `cast_ballot{poll_id, option_id}` (labels via `notificationActions` per vote); `OPEN` fg | ✓ animated poster + stamp (`.doNotDismiss`) |
| `cp.changeset` | N-50 (needs yes; doc delta: key `changeset_needs_yes` on `change_set.proposed` to affected voters still pending, `cp.ctx{change_set_id, poll_id, trip_id}`; result notice `changeset_decided` on applied/rejected/expired, `cp.generic`), 3e-3 | `APPROVE` / `DECLINE` → `approve_changeset{decision: yes\|no}` (action-key scope `changeset`); `UNDO` → `undo_guide_action` | – |
| `cp.disruption` | N-28 | `APPROVE` → `decide_disruption_action{yes}`; `OPEN` fg | – |
| `cp.leaveby` | N-20, N-21 | `IM_UP` → `set_readiness{up}`; `SNOOZE` → `snooze_leave_by`; `LATE_10` → `report_running_late{10}` | – |
| `cp.sos` | N-24 | `COMING` → `respond_sos{coming}`; `CALL` fg (`tel:`); `OPEN` fg | – |
| `cp.money` | N-16 | `MARK_PAID` → `mark_paid`; `CONFIRM` → `confirm_paid`; `NUDGE` → `nudge_payment` | – |
| `cp.chat` | N-11 | `REPLY` (text input) → `send_message`; `READ` → `mark_read` | – |
| `cp.rsvp` | N-07, N-09 | `IN` / `MAYBE` → `set_rsvp`; `OPEN` fg (OUT requires app, private reason flow) | ✓ poster |
| `cp.invite` | N-42 | `JOIN` fg → `accept_invite`; `LATER` → `defer_invite` | – |
| `cp.import` | N-13 | `ADD_ALL` → `resolve_import_candidate{add}` × n | – |
| `cp.briefing` | morning briefing | `DONE` → `act_briefing_item{done}`; `NUDGE` → `act_briefing_item{nudge}` | – |
| `cp.help` | N-25 | `STOP_SHARE` → `stop_help_share` | – |
| `cp.memory` | N-35 | `REACT` → `react_memory` | – |
| `cp.setup_ask` | N-05 | `freed` / `not_movable` fg → `answer_availability_ask{answer}` (opens the ask sheet, which confirms) | – |
| `cp.generic` | all others | `OPEN` fg | – |

## 4. Off-app surfaces → commands (P48, P49, P50)

All run through `POST /v1/actions` with the device action key; extension writes an optimistic App Group state and queues to `pending-actions.json` if offline (drained by app launch or next extension run; `op_id` generated in the extension).

| Surface | Intent / action | Command | Scope | Notes |
|---|---|---|---|---|
| LA LeaveBy | `ImUpIntent` (LiveActivityIntent, app process) | `set_readiness{up, source: la}` | `readiness` | optimistic `activity.update`; server broadcasts |
| LA LeaveBy / AlarmKit | `AlarmStopIntent` / `AlarmSnoozeIntent` | `set_readiness` / `snooze_leave_by` | `readiness` | 2nd snooze → crew knock |
| LA MeetUp | `RunningLateIntent{10}`, `OnMyWayIntent`, `PingAllIntent` | `report_running_late`, `ping_all` | `trip_day` | Boost check server-side |
| LA / Control / Siri | `SOSIntent` (confirm dialog) | `trigger_sos` | `sos` | never one-tap |
| LA Vote / widget Vote | `CastBallotIntent{poll_id, option_id}` | `cast_ballot` | `ballot` | returns tallies for stamp |
| Widget Balances | `NudgeIntent{uid, trip_id}` | `nudge_payment` / `send_nudge` | `money_nudge` | 1/pair/24 h |
| Widget Today | `PackingCheckIntent` | `check_packing_item` | `trip_day` | – |
| Widget config | `SelectTripIntent`, `SelectCrewIntent` (AppIntentConfiguration) | none (reads snapshot) | – | – |
| App Shortcuts (Siri) | `AskGuideIntent` (opens app), `NextLeaveByIntent` (read), `SetActiveCrewIntent` | `set_active_crew` | `profile` | ask opens app (metered path) |
| Control Center | `ImUpControl`, `SOSControl` | as above | as above | iOS 18+ controls |
| Notification actions | §3.4 | as mapped | per category | background, no unlock where allowed |
| Android | `BroadcastReceiver` → WorkManager expedited → same `/v1/actions`; Glance `actionRunCallback` | same commands | same scopes | parity |

## 5. Device action keys (P11, P48)

| Item | Contract |
|---|---|
| Issue | `POST /v1/devices/{id}/action-keys` (session) → `{key_id, secret (32 B), scopes[], expires_at}`; stored in shared Keychain access group `<TeamID>.app.critterpass.shared` (Android: EncryptedSharedPreferences in app) |
| Scopes | `ballot`, `readiness`, `trip_day`, `sos`, `money_nudge`, `money_mark`, `rsvp`, `changeset`, `chat_reply`, `inbox`, `read_snapshot`, `read_notification` |
| Request | headers `X-CP-Key-Id`, `X-CP-Ts` (±300 s), `X-CP-Sig = base64url(HMAC-SHA256(secret, method \n path \n ts \n sha256(body)))`; body = command envelope with `actor.via` set |
| Server | key → (uid, device_id, scopes); reject scope misses with `ACTION_KEY_SCOPE`; same pipeline as `/v1/cmd` |
| Lifetime | 30 d rolling, rotated on app foreground when <7 d left; revoked on sign-out, device removal, deletion, uid merge, or admin action |
| Storage | `device_action_keys(key_id, user_id, device_id, secret_enc (HMAC-signing secret, AES-256-GCM envelope-encrypted), scopes, expires_at, last_used_at, revoked_at)` (data-model §3.1); `issueActionKey`, `verifyActionKeyRequest` (constant-time signature compare), `revokeActionKey`/`revokeActionKeysForUser`/`revokeActionKeysForDevice` built in phase 9 as the sole owner of the table + this verification primitive — phase 11 adds only the `devices` FK expand migration, the `POST/DELETE /v1/devices/{id}/action-keys` routes above, `/v1/actions`, and the Swift/Kotlin request signer |

## 6. App Group contract (P48, P49; Android mirror P50)

Group `group.app.critterpass`; written by the app (`modules/cp-app-group`) and by extensions for optimistic state. Every JSON file: `{"schema": <int>, "generated_at": ISO, ...}`; readers ignore unknown fields; writes atomic (temp + rename); no C3 data.

| Path | Writer | Reader | Content |
|---|---|---|---|
| `snapshot/widgets.json` | app, widget push handler (fetch `/v1/widgets/snapshot`) | widgets, LA | countdown, active trip, vote summary, balances (net only), today items, crew ETA line, next flight (Pass+) |
| `snapshot/entitlements.json` | app | widgets, LA, NSE | `{passPlus, boostedTripIds[], boostExpiresAt, generatedAt}` (locked-state rendering) |
| `snapshot/prefs.json` | app | NSE, content ext | chattiness, voice readout, per-category mode, quiet hours |
| `snapshot/crews.json` | app | NSE, intents | crew ids → names, member first names + avatar keys (for INPerson) |
| `state/la/<activity_id>.json` | app, intents | intents | last content-state + seq (optimistic updates) |
| `state/pending-actions.json` | extensions | app (drain), extensions | `{schema: 1, generated_at, actions[]}`; each action is `{op_id (uuid v7), cmd, v: 1, via (widget \| notif_action \| la_intent \| app_intent), scope (action-key scope), client_ts, base_version?, payload}`. The app drains on launch and foreground, adds uid and device to build the command envelope (keeping `op_id` and `via`), and empties the file; a write during a drain is kept for the next one |
| `state/alarms.json` | app (cp-alarm) | alarm intents | leave_by_id → AlarmKit id, schedule hash |
| `assets/avatars/<key>@2x/@3x.png` | app (from `media.process` renders) | NSE, LA, widgets | user + guide avatars |
| `assets/critters/<form>-<pose>-<mode>.png` | app bundle copy + `critter-bake` outputs | LA, widgets, content ext | incl. silhouettes + blur stages; monochrome/tinted variants |
| `config/endpoints.json` | app | all | `{schema: 1, generated_at, env (development \| staging \| production), api_base_url, schemas: {<path>: <version>}}`, written on app start |

Android mirror: Jetpack DataStore (`cp_snapshot`) + `filesDir/assets/*`; same JSON schemas from `packages/domain/src/surfaces/*.ts` (zod → Swift/Kotlin via `packages/domain/scripts/gen-surfaces.ts`).

## 7. Phase map (async surface)

| Phase | Groups |
|---|---|
| 10 | §1 rules, `user`, relay |
| 11 | §2 rules, `sched.enqueue_due`, `notify.route`, `push.send`, §3.1/§3.3 base, channels; §5 action keys (`device_action_keys` table, issue/rotate routes, `/v1/actions` verification) |
| 23–44 | namespaces + queues per Phase column |
| 36, 48 | LeaveBy scheduler, §3.2 LA types, AlarmKit, §4 LA intents |
| 49 | categories §3.4, widget push, §4 widget intents, §6 App Group |
| 50 | Android mirror of §3.2–§6 |

## Unresolved questions

1. Crew LA push-to-start timing for MeetUp (T−30 min assumed) and Vote (T−24 h assumed).
2. Apple acceptance of guide personas as Communication Notification senders (fallback defined).
3. Roundup/reset timezone when trip tz ≠ device tz (Q-84/Q-76): device tz assumed per decision 8.
4. Centrifugo history sizes are initial values; tune after load test in the S-SYNC spike.
