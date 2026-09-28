---
phase: 24
title: Crew chat
status: in_progress
depends_on: [10, 23]
wave: 10
features: [F-048]
screens: [3g-1, 3k-4, 3a-13, 4b-1, 5b-4]
tasks: 8
owns:
  - packages/db/src/schema/chat.ts
  - packages/db/migrations/<ts>_crew_chat_messages.sql
  - packages/db/test/permissions/crew-chat.test.ts
  - packages/domain/src/chat/
  - services/api/src/commands/chat/
  - services/api/test/chat/
  - services/worker/src/jobs/chat/
  - services/worker/test/chat/
  - apps/mobile/src/app/crew/[crewId]/chat/
  - apps/mobile/src/features/crew/chat/
  - packages/i18n/locales/en/chat/
  - e2e/chat/
---
# Phase 24 — Crew chat

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D4 (commands, Centrifugo, PowerSync, R2), D12 offline, entitlement matrix row "Guide in crew chat" (asker's meter; unmetered if any member has Pass+/boost; silent fair-use cap 400/crew/day), C36 crew visibility |
| `docs/system-architecture.md` | §4 core patterns (commands, reads, realtime, media, push) |
| `docs/data-model.md` | §2 `app.is_crew_member` (former + `keep_in_chat`), §3.2 `crew_members.notify_level` (owned by P23) + `last_read_seq` (doc delta, replaces `last_read_message_id`), §3.6 `messages`, `message_reactions`, §3.x `moderation_reports`, `media_objects`; open question 2 (sync depth) |
| `docs/data-model-sync-and-privacy.md` | §4 stream `crew_chat`; §5 realtime `crew_chat:` hints only; `llm.chat_window` |
| `docs/api-contracts.md` | §4.2 `send_message`, `edit_message`, `delete_message`, `react_message`, `mark_read`, `take_guide_offer` (`set_chat_mode` dropped: doc delta, P23 `set_crew_notify` is the single per-crew level); §5 media routes; `/internal/rt/publish` (typing) |
| `docs/api-contracts-async.md` | §1 `crew_chat:{crew_id}` (typing ≤1/3 s, history 200/72 h), §3 `cp.chat` (REPLY/READ), §5 action-key scope `chat_reply` |
| `docs/design-system.md` | bubbles, Caveat guide text, motion presets (spring rise, typing dots) |
| Reports | `design-analysis-260926-1143-plan-proposal-crew-report.md` §0 (typing kf), §2 3g-1, §8 Q13/Q28; master §2 F-048, F-094, F-164; §7 N-11 |
| Renders | `docs/design-renders/screens/3g-1_Crew_chat.png`, `3k-4_Offline_at_the_top.png`, `3a-13_You_re_in.png`, `4b-1_Out_of_questions.png`, `5b-4_How_much_we_ping.png` |

## Overview

Goal: the crew's coordination hub — local-first messages with rich cards, mentions, typing, unread, reactions, replies, edits/deletes, photos + voice notes through R2, an offline send queue and moderation hooks; guide message kinds and card slots are reserved for later phases through a typed card registry.

Done when: two devices in one crew exchange text/photo/voice messages in real time and offline (queued, then delivered once, in order); unread, reactions, edits, deletes and reports behave per spec; RLS and sync streams deny non-members and let former members with `keep_in_chat` read only; later phases can register a card renderer for a new `messages.type` without touching chat code.

## Requirements

### F-048 Crew chat (3g-1)

| Aspect | Behaviour |
|---|---|
| Header | ←, crew name, "{n} people · {guide} is in this chat" (guide of the active trip; hidden when no trip), MAP pill → crew map route (P39 owns target; unboosted → teaser 4f-2 via P46) |
| Timeline | day separators (TODAY / weekday / date, viewer tz), incoming bubble with avatar (radius 18/18/18/4), own bubble yellow right, grouped consecutive messages, system rows (joined, left, renamed), reply quote, edited marker, deleted tombstone "Message deleted" |
| Rich cards | registry keyed by `messages.type`: built here = `text`, `photo`, `voice`, `system`; reserved + rendered by owners = `poll` (P26), `expense` (P33), `guide_offer` + guide text streaming (P32), `changeset` (P29), `boost_card` (P46), `meetup` (P36/P39), `proposal` (P31), `supplier_order` Viator hold (P35). Unknown/unregistered type → neutral "Open in app update" card with deep link; never crashes |
| Composer | `+` attach menu (photo/camera, voice note; poll/expense/location entries registered by owner phases), input "Message, or @{guide}", mic = hold-to-record voice note (undesigned — design in code); send button replaces mic when text present |
| Mentions | `@` autocomplete of active members + active trip guide; stored `mentions uuid[]` + `mentions_guide bool`; guide mention enqueues `ai.guide_mention` (handler + meter = P32; here only the event and the reserved flag) |
| Typing | client publish on `crew_chat:{crew_id}` via publish proxy, ≤1 per 3 s, expires 5 s; show "Maya is typing"; guide typing dots = the only bouncing element (kf `0:ty0;.25:ty-4;.5:ty0;1:ty0`, 1200 ms, 160 ms stagger) |
| Ordering / unread | server assigns `messages.seq` (bigint, per crew, gap-free) at insert; timeline, unread and "delivered in order" key on `seq`, never on client clocks or UUIDv7; unacked local sends render after the last seq'd message in local send order; `crew_members.last_read_seq` via `mark_read{crew_id, seq}` (monotonic: `GREATEST`) on scroll-to-bottom (debounced 1 s); unread divider "NEW"; crew pill badge on Home (P25 reads `useUnreadCount(crewId)`); jump-to-latest pill |
| Reactions | long-press → emoji bar (6 quick + more); toggle per user; counts + avatars sheet |
| Replies / edit / delete | swipe-right to reply; edit own within 15 min (server config), delete own anytime → tombstone; organiser cannot edit others |
| Media | photos: R2 presigned PUT (multipart > 5 MB), progress ring, thumbnail from worker, full view via media-worker HMAC URL; voice notes ≤2 min AAC, waveform, playback speed 1×/1.5× |
| Offline | send = command with client UUIDv7 `op_id` = message id (idempotency only; order comes from server `seq`); renders immediately with "sending" clock; offline banner "Sends when you're back" (3k-4); `cmd_results` rejected → failed state with RETRY / DELETE; media queued until upload completes, then `send_message` |
| Moderation hooks | `report_message` → `moderation_reports`; ops `moderate_item{kind: message}` hides (`hidden_at`) for all; per-user local mute of a member (hide their messages) ; send-side validation (length ≤4000, attachment count ≤10, link-safety allow for http/https only) |
| Notifications | N-11 via P11 router; per-crew level = `crew_members.notify_level` all/mentions/off (default mentions), set by P23 `set_crew_notify` — no chat-specific setting; Communication Notification with sender avatar, `thread-id = crew_id`; `cp.chat` REPLY (text input → `send_message` with `chat_reply` action key) and READ (`mark_read`) |
| Former members | `status='former' AND keep_in_chat` → read-only timeline, composer replaced by "You left this crew" |
| Motion | new messages rise with soft spring (design-system `spring.soft`); card internals animate per owner; reduced motion → fade only |
| Entitlements | chat free; guide-in-chat metering handled by P32 (hint row "Maya has Pass+. Ask in the crew chat and {guide} answers there" rendered from P32 slot) |

### Undesigned states to design in code (founder reviews in app)

Empty new-crew chat ("Say hi to the crew" CTA from 3a-13), loading/first sync skeleton, history older than synced window (sync full history — see Open questions), send failure/retry, upload progress/failure, report sheet, reaction sheet, edit/delete menu, mute member, former-member read-only, no-trip header, attachment menu, voice recorder (hold, slide-to-cancel, lock), permission denied (mic/photos) fallbacks.

## Architecture & contracts

| Area | Delta |
|---|---|
| Tables | `messages`, `message_reactions` per data-model §3.6. **doc delta**: add `messages.mentions uuid[]`, `mentions_guide bool`, `hidden_at`, `deleted_at` (soft delete), `attachments jsonb` ([{media_id, kind: photo\|voice, w, h, duration_ms}]), `seq bigint not null` uk (crew_id, seq); new `crew_chat_counters(crew_id pk, last_seq)` row-locked in the send transaction; ALTER `crew_members` add `last_read_seq bigint default 0` (append-only migration on the P8 table); extend `type` enum with `voice`, `proposal`, `supplier_order` |
| RLS backstop | select: `app.is_crew_member(crew_id)` (includes former+keep_in_chat); insert/update only via `app_user` inside command handler with sender = `app.uid()`; `hidden_at` rows filtered for non-ops; `message_reactions` self write |
| Sync stream | `crew_chat` (auto, per crew membership): `messages` (full history), `message_reactions` |
| Commands | §4.2 set + **doc delta** `report_message {message_id, reason}` (member → `moderation_reports`), `mute_member {crew_id, uid, muted}` (self, stored in `user_settings.muted_uids` — doc delta) |
| Events → rt_outbox | `message.created/edited/deleted`, `reaction` on `crew_chat:{crew_id}` (hint → client pulls via PowerSync) |
| Jobs | `chat.notify` (per message: recipients by mode/mention → `notify.route` N-11, collapse per crew); `media.thumbnail` reused from P10 for `photo`; `chat.voice_transcode` (normalise to AAC 32 kbps, duration) |
| Push | `alert` with `category=cp.chat`, `thread-id`, communication intent (P11 NSE), FCM MessagingStyle |
| AI | this phase's migration defines `llm.chat_window(crew, n)` with `CREATE OR REPLACE VIEW` (P13 ownership rule for views over later tables): projects only `seq`, author display name, author kind (member/guide), `type` and `body` text for `type in (text, guide text)`; drops `attachments`, all card payloads (`supplier_order`, `proposal`, `poll`, `expense`, `changeset`, `boost_card`, `meetup`), hidden and deleted rows (D10: supplier content never reaches the LLM). Consumers (P13, P28, P32) must wrap it as untrusted user data — **doc delta** |
| Card registry | `apps/mobile/src/features/crew/chat/cards/registry.ts`: `registerChatCard(type, {Component, estimateHeight, a11yLabel})`; typed by `packages/domain/src/chat/message-types.ts` |

## Tasks

### T1 — Chat schema, RLS, sync stream, permission tests
- Goal: `messages` + `message_reactions` with RLS backstop and sync rules.
- Files: `packages/db/src/schema/chat.ts`, `packages/db/migrations/<ts>_crew_chat_messages.sql`, `packages/db/test/permissions/crew-chat.test.ts`, `infra/powersync` stream entry via the P10 stream registry file extension point (`packages/db/src/schema/chat.ts` exports stream SQL consumed by the P10 generator).
- Steps: 1. Drizzle schema incl. doc-delta columns, `crew_chat_counters`, `crew_members.last_read_seq` ALTER, indexes `(crew_id, seq desc)`, `(message_id)` on reactions. 2. RLS policies + grants (app_user, guide_reader via `llm.chat_window` only, powersync_repl publication). 3. `llm.chat_window` view (projection above). 4. `crew_chat` stream query. 5. Testcontainers tests: member reads, non-member denied, former+keep_in_chat reads but cannot insert, removed member denied, hidden rows invisible to app_user, guide_reader cannot select base table, `llm.chat_window` exposes no attachment or card-payload column and no `supplier_order`/`proposal` rows.
- Tests: `pnpm --filter @cp/db test -- crew-chat`
- Done when: all permission cases pass; migration applies clean on empty DB and is reversible in test.

### T2 — Chat domain contracts and command handlers
- Goal: idempotent chat commands.
- Files: `packages/domain/src/chat/{message-types,commands,validation}.ts`, `services/api/src/commands/chat/{send-message,edit-message,delete-message,react-message,mark-read,report-message,mute-member}.ts`, `services/api/test/chat/commands.test.ts`.
- Steps: 1. zod payloads (body ≤4000, mentions ⊆ active members, attachments owned by sender + uploaded). 2. Handlers through P10 framework; `op_id` = message id; duplicates → `duplicate`; `send_message` locks `crew_chat_counters` and assigns `seq`. 3. Edit window + owner checks; delete → tombstone. 4. `mark_read{seq}` monotonic on `seq` (never moves backwards). 5. Emit domain events + rt_outbox rows; `mentions_guide` emits `chat.guide_mentioned`. 6. `report_message` inserts `moderation_reports`.
- Tests: `pnpm --filter @cp/api test -- chat`
- Done when: tests cover duplicate op_id, non-member reject (2xx + `cmd_results` rejected via `/sync/upload`), edit after window → `STATE_INVALID`, mark_read monotonic, report row created (routed to P17 `moderate_item` kind `message`); two devices with clocks skewed ±1 h and one replaying an offline queue produce gap-free `seq` in server receive order.

### T3 — Chat notifications, voice transcode, reply action
- Goal: N-11 delivery per mode and REPLY/READ from the notification.
- Files: `services/worker/src/jobs/chat/{notify,voice-transcode}.ts`, `services/worker/test/chat/notify.test.ts`, `services/worker/Dockerfile` (append-only: install `ffmpeg` in the runtime stage; file owned by P1).
- Steps: 1. `chat.notify` computes recipients from `crew_members.notify_level` (exclude sender, muted, level off; mentions-only gets mentions + replies to own messages) → `notify.route` N-11, collapse-id per crew, sender avatar payload. 2. Register `cp.chat` actions in P11 action dispatcher: REPLY → `send_message`, READ → `mark_read` (scope `chat_reply`). 3. Voice transcode via ffmpeg in worker; store duration.
- Tests: `pnpm --filter @cp/worker test -- chat`
- Done when: tests prove level matrix (all/mentions/off × mention/reply/plain) and action-key REPLY creates exactly one message for a repeated action; worker image build test runs `ffmpeg -version`.

### T4 — Mobile chat data layer
- Goal: local-first queries, outbox status, typing, unread.
- Files: `apps/mobile/src/features/crew/chat/data/{use-messages,use-send-message,use-typing,use-unread-count,use-reactions}.ts`, `apps/mobile/src/features/crew/chat/data/__tests__/*.test.ts`.
- Steps: 1. PowerSync watched query ordered by `seq` with windowed virtualization (newest 200, load older locally); unacked sends appended in local order. 2. Send via P10 command client; status from `cmd_results` (sending/sent/failed). 3. Typing publish throttle + subscribe with 5 s expiry. 4. `useUnreadCount(crewId)` = count `seq > last_read_seq`, exported for Home and registered into the P23 crews-sheet `crewCardBadge` slot.
- Tests: `pnpm --filter @cp/mobile test -- features/crew/chat/data`
- Done when: hooks tested with the P10 in-memory PowerSync test DB; failed rejection surfaces RETRY state; unread count unchanged by a device with a skewed clock.

### T5 — Chat screen and composer
- Goal: 3g-1 pixel-faithful screen with all states.
- Files: `apps/mobile/src/app/crew/[crewId]/chat/index.tsx`, `apps/mobile/src/features/crew/chat/components/{chat-screen,message-list,bubble,day-separator,composer,mention-picker,typing-dots,unread-divider,offline-banner,empty-chat}.tsx`, `packages/i18n/locales/en/chat/chat.po`.
- Steps: 1. Inverted FlashList, grouping, day separators in viewer tz. 2. Composer with mention autocomplete, send/mic swap. 3. Motion: rise spring, typing dots kf, jump-to-latest. 4. Empty, loading, offline, former-member, no-trip header states. 5. a11y: bubble labels "Maya, 14:02: …", Dynamic Type, reduced motion.
- Tests: `pnpm --filter @cp/mobile test -- features/crew/chat/components`; `maestro test e2e/chat/screens.yaml` (`takeScreenshot` per state, uploaded as CI artifacts for founder review against `3g-1_Crew_chat.png`).
- Done when: RNTL tests cover send, mention insert, state rendering; RNTL layout snapshots (header, bubbles, composer) committed per state; Maestro screenshot artifacts produced on iOS and Android.

### T6 — Card registry, reactions, replies, edit/delete, report
- Goal: extensible rich-card slot plus message actions.
- Files: `apps/mobile/src/features/crew/chat/cards/{registry,unknown-card,system-card,reply-quote}.tsx`, `apps/mobile/src/features/crew/chat/components/{message-actions-sheet,reaction-bar,reactions-sheet,report-sheet}.tsx`, tests alongside.
- Steps: 1. Typed registry + unknown fallback. 2. Long-press menu (react, reply, copy, edit, delete, report, mute). 3. Swipe-to-reply gesture (Gesture Handler 3). 4. Tombstone + edited marker.
- Tests: `pnpm --filter @cp/mobile test -- features/crew/chat/cards`
- Done when: registering a test card type renders it without chat changes; unknown type renders fallback; all actions dispatch the right command.

### T7 — Photo and voice-note messages
- Goal: media send/receive with progress and offline queue.
- Files: `apps/mobile/src/features/crew/chat/media/{attach-menu,photo-message,voice-recorder,voice-message,media-viewer,use-upload-queue}.tsx`, tests alongside.
- Steps: 1. Picker/camera, compress, presign + multipart via P10 media client, progress ring. 2. Hold-to-record (slide-to-cancel, lock), waveform, playback. 3. Upload queue persisted; `send_message` only after `media_objects` confirmed. 4. Permission-denied fallbacks.
- Tests: `pnpm --filter @cp/mobile test -- features/crew/chat/media`
- Done when: queued photo sent offline delivers after reconnect exactly once (test toggles connectivity through the P10 sync test harness against the local docker-compose stack); voice note plays from HMAC URL.

### T8 — End-to-end chat flows
- Goal: prove multi-device and offline behaviour.
- Files: `e2e/chat/{send-receive,offline-queue,reactions-edit-delete,report}.yaml`, `services/api/test/chat/realtime.int.test.ts`.
- Steps: 1. Integration test against docker-compose stack: two users, message via `/sync/upload`, `crew_chat` publication received, Centrifugo hint delivered. 2. Maestro flows on iOS + Android simulators.
- Tests: `pnpm test:int -- chat`; `maestro test e2e/chat`
- Done when: all flows pass on both platforms.

## Phase acceptance criteria

- [ ] Permission tests pass (member, non-member, former+keep_in_chat read-only, hidden rows).
- [ ] Duplicate `op_id` never creates a second message across app, outbox and notification REPLY.
- [ ] Offline send → delivered once, ordered by server `seq`, after reconnect; rejected send shows RETRY.
- [ ] Typing, reactions, edits, deletes appear on the second device < 1 s on LAN stack.
- [ ] Unread count and divider correct after `mark_read`; Home can import `useUnreadCount`.
- [ ] N-11 honours `crew_members.notify_level` all/mentions/off; REPLY works from the notification.
- [ ] `llm.chat_window` carries no attachments or card payloads (permission test).
- [ ] Unknown card types render the fallback; registry documented in the feature README comment.
- [ ] Maestro `e2e/chat` green on iOS and Android.

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Full-history sync grows large for old crews | stream bounded by crew (≤16 members); if first-sync > 5 MB, switch stream to rolling 90 d + `GET /v1/chat/{crew}/history` pagination (open question) |
| Typing spam through publish proxy | server-side rate drop (P10) + client throttle |
| Guide streaming shape unknown until P32 | registry + reserved `guide.token` handler slot; no guide UI built here |
| Voice transcode cost | worker concurrency limit; reject > 2 min |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Emoji set licence (system emoji) | uses platform emoji only |

## Open questions

1. Sync depth: full history vs rolling window — default full history (data-model Q2).
2. Edit window length — default 15 min, server config.
3. Chat route under `apps/mobile/src/app/crew/` shared with P23 — default: P24 owns only the `chat/` subfolder (doc delta in system-architecture repo layout).
4. Catalog name `chat` vs area `crew` — default separate `chat` catalog to keep ownership disjoint from P23.
5. doc delta: `messages` columns (incl. `seq`) and types listed above; `crew_chat_counters`; `crew_members.last_read_seq` replaces `last_read_message_id`; `set_chat_mode`/`crew_chat_mode` removed in favour of P23 `notify_level`; `llm.chat_window` projection; `report_message`, `mute_member` commands; `user_settings.muted_uids`.
