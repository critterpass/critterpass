---
phase: 23
title: Invites, join codes, crews, referral, seat cap
status: pending
depends_on: [12, 21, 22]
wave: 9
features: [F-043, F-045, F-190, F-046, F-161, F-047]
screens: [3a-10, 3a-11, 3a-12, 3a-13, 3g-3, 3b-2, 3f-7, Site-Referral]
effort: 10 sessions
owns:
  - infra/powersync/streams/crews.yaml
  - packages/domain/src/crews/
  - packages/domain/src/invites/
  - packages/domain/src/referrals/
  - packages/db/src/schema/growth.ts
  - packages/db/migrations/<ts>_invites_referrals_waitlist.sql
  - packages/db/test/permissions/{invites,invite_prefill,referrals,seat_waitlist_offers,crew_contact_cards}.test.ts
  - packages/db/test/concurrency/seat-claim.test.ts
  - packages/ai/src/prompts/invite-tags/
  - packages/ai/src/prompts/crew-welcome/
  - services/api/src/commands/crews/
  - services/api/src/commands/invites/
  - services/api/src/commands/referrals/
  - services/api/src/links/providers/{invite,join-code,referral}.ts
  - services/api/test/crews/
  - services/worker/src/jobs/invites/
  - services/worker/src/jobs/referrals/
  - apps/mobile/src/app/crew/{index,new,invite-friends}.tsx
  - apps/mobile/src/app/crew/[crewId]/{settings,invite}.tsx
  - apps/mobile/src/app/onboarding/invite/
  - apps/mobile/src/features/crew/{crews-sheet,start-crew,settings,members,invite-composer,seat-limit,waitlist,referral}/
  - apps/mobile/src/features/onboarding/invited/
  - packages/i18n/locales/*/crew.po
  - e2e/crew/
  - e2e/invites/
---
# Phase 23 — Invites, join codes, crews, referral, seat cap

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D7, D10 (hold copy rewrite on 4f-1), D15; C26, C28, C34, C36, C46; Q-10, Q-11, Q-14, Q-15, Q-16, Q-19, Q-26, Q-92, Q-97; §3 entitlement matrix (seats 6/16) |
| `docs/system-architecture.md` | §4.1 commands, §4.3 realtime (epochs, unsubscribe), §5 authz, §7.d boost flow |
| `docs/data-model.md` | §3.2 `crews`, `crew_members`, `invites`, `invite_prefill`, `join_codes`, `referrals`, `crew_contact_cards`; §3.3 `trip_participants`; §3.5 `seat_waitlist_offers`; §3.10 `stamps`; §3.14 `trip_entitlements` |
| `docs/data-model-sync-and-privacy.md` | §1 private fields (`invite_prefill` C3), §4 streams `crews`, `crew_invites`, `crew_people`; §7 row "23" |
| `docs/api-contracts.md` | §3 `SEAT_LIMIT`, `WAITLISTED`; §4.2 crews/invites commands; §5.6 link routes; §6 AI tools |
| `docs/api-contracts-async.md` | §1.2 `crew:{id}`, `user:#uid`; §2.2 queues; §2.3 `maint.codes`; N-43 seat opened |
| Reports | `design-analysis-260926-1143-onboarding-home-report.md` §3a-10…3a-13; `design-analysis-260926-1143-plan-proposal-crew-report.md` §3g-3; `design-analysis-260926-1143-web-store-social-report.md` §1.5 referral, §2 link namespace; `design-analysis-260926-1143-subscriptions-report.md` 4f-1; master §2 F-043/F-045/F-046/F-047/F-161/F-190, §6.1 contacts picker row, §11.1 R12/R17/R20, §11.2 onboarding gaps |
| Renders | `docs/design-renders/screens/3a-10_Invite_a_seat_for_you.png`, `3a-11_Join_with_a_code.png`, `3a-12_Your_pass_three_taps.png`, `3a-13_You_re_in.png`, `3g-3_Crews.png`, `4f-1_Seven_s_a_crowd.png`; `docs/design-renders/pages/` Site-Referral |

## Overview

Goal: the growth loop: an inviter composes a personal or generic invite, the invitee opens a crew ticket (or types a 6-char code), issues a prefilled pass in three taps and lands on the crew manifest in ~15 s; crews can be created, switched, left and managed; trip seats cap at 6 (16 boosted) with a waitlist and seat-opened offers; referrals attribute and reward stamps and covers.

Done when: two simulators complete invite → install → 3a-13 with provenance-marked prefill; 50 concurrent `accept_invite` calls on a 6-seat trip seat exactly the free seats and waitlist the rest; code enumeration and forwarded-link cases behave per Q-14; referral stamps grant once per qualified new user.

## Requirements

### F-043 Invites & join codes

| Aspect | Behaviour |
|---|---|
| Kinds (Q-14) | personal seat invite (contact picked → seat token, prefill, invitee name shown); generic crew/trip link or code (crew join, no name); forwarded personal link opened by someone else → "a seat in {crew}" without invitee name, consumes a generic seat |
| Codes | 6-char CSPRNG from phase-21 `generateCode`, per crew and per trip, `expires_at` default 14 d, rotate (`rotate_join_code`), revoke, `max_uses` optional |
| Claim | `accept_invite` transactional: lock trip row, count `holds_seat`, allocate or waitlist (`WAITLISTED`), crew membership always granted (crew ceiling 16); increments `membership_epoch`; emits `crew.member_joined` |
| Tracking | channel tag per share target; bot-filtered `open_count` (phase-21 filter); inviter sees "opened" status only for their own invite (C28 never exposes per-person opens to peers) |
| States (undesigned → design in code) | expired, revoked, full (→ waitlist copy), trip cancelled/past, already a member (→ crew Home), forwarded, rate-limited, offline |

### F-045 Invited fast path (3a-10 → 3a-13)

| Screen | Designed | Undesigned states |
|---|---|---|
| 3a-10 ticket | Inviter row ("Opened from WhatsApp · 2 min ago"), headline with invitee name, yellow crew ticket (code, route YOU→DPS, dates, SEAT n OF cap, ~per-person estimate from P16), member stub + "Dev hasn't opened his yet" (status only: joined/not yet), trailer card (P31 media; hidden until ready). Motion: slide up settle crooked ≈720 ms, plane wobble 2600 ms. TAKE THE SEAT → 3a-12; "Just look around first" → read-only proposal/trailer | loading skeleton, all error states above; origin shows invitee home once known (C34) |
| 3a-11 code | boxes drop stagger 70 ms, paste link via phase-21 paste control, green ring on 6th char, crew card unfold 460 ms, Tokek lands 520 ms; wrong code pink shake 420 ms + toast | loading, expired (names inviter), full, already member, rate-limited, offline |
| 3a-12 three taps | mini pass with provenance label "FROM {INVITER}'S CONTACTS"; face row (guide stickers); chips (phase-22 chips mode) with Tokek line from tag inference; ISSUE MY PASS → stamp slam → phase-22 save sheet → join | no prefill (code path), edit name/home (reuse 3a-5 search), + MORE full tag sheet, auth failure, seat taken concurrently |
| 3a-13 manifest | cards stamp in join order (delays 0/260/520… ms), newcomer green ring, pending dashed, confetti 70, welcome line types out; SEE THE PLAN → 3f-3 (P31); Say hi → 3g-1 (P24) | 1–2 members, >6 members (scroll grid up to 16), all joined, join pending server, offline |
| Nudge | "Tokek has already nudged him" only if a push nudge was actually sent to an installed non-opener; otherwise copy "Dev hasn't opened it yet" + inviter "Nudge" action via share sheet (Q-19) |
| Metric | `time_to_manifest_ms` from link open (target p50 ≤ 15 s) |

### F-190 Invite composer (inviter side, undesigned → design in code)

Contact picker (iOS `CNContactPickerViewController` via expo-contacts picker, Android `ACTION_PICK`; no Contacts permission, only picked fields), prefill name + home hint (phone country code → nearest airport) + taste note (free text ≤ 140 chars, AI-inferred tags shown to inviter for confirmation), channel choice (WhatsApp, Messages, copy link, QR, share sheet), preview of the 3a-10 ticket. Sign-in required before sending (Q-10). 7th seat → 4f-1 instead of error. Existing users (matched in crew context only) → in-app invite appears in their 3g-3 with JOIN/LATER + push. Phone number is never stored plain: `invite_prefill.phone_hash` (HMAC) enables phase-21 phone-hash match; prefill purged at claim/expiry + 7 d.

### F-047 Crews

| Aspect | Behaviour |
|---|---|
| 3g-3 sheet | crew cards (avatar stack ≤6, unread badge, status line, last message), active crew outlined; tap → `set_active_crew`, Home cross-fades to crew theme (guide colour per C5); JOIN WITH A CODE; invites JOIN ("JOINED ✓" + toast) / LATER (stays under "Later" section until expiry); START A CREW |
| Start a crew (undesigned) | name (≤ 32) + art pick → create → share code/link sheet (composer) → Home |
| Manage (undesigned) | crew settings: rename, members list with colours, leave (keep_in_chat option), remove (organiser of active trip or creator), notification level all / mentions / off (default mentions; single per-crew setting `crew_members.notify_level` via `set_crew_notify`, read by P24 chat notify), rotate code |
| Limits | 10 active crews per user (Q-16, server config), crew ceiling 16, member colours per join order over 6 accents, 7–16 add ring pattern (Q-92) |
| Realtime | `crew:{id}` member.joined/left/updated, invite.opened; epoch-based unsubscribe on leave/remove |

### F-161 Seat cap + waitlist

Trip seats = participants with RSVP ≠ out: 6, or 16 while boosted (C26, `seatCap(t)` from P12). Applies on every join path (3a-10, 3a-11, composer, in-app JOIN). Over-cap joins return `SEAT_LIMIT {trip_id, invitee, seats_taken, cap}`; the client hands it to the seat-limit presenter registry (`features/crew/seat-limit/registry.ts`). This phase ships the default presenter: a truthful waitlist sheet ("{trip} is full at {cap}. {name} joins the waitlist and gets the next free seat.") that calls `promote_waitlist`/waitlist path. The 4f-1 "SEVEN'S A CROWD" sheet (seat row, split preview, BOOST, D10 eyebrow rewrite) is built only by P46 (`SeatCapSheet`, P46 T7), which registers itself as presenter and reuses this phase's waitlist command for "Keep it at six". Waitlist state visible to invitee ("You're next for a seat"); RSVP out frees a seat → `seat_waitlist_offers` offer (N-43 push), 24 h accept window, never auto-join; boost expiry freezes seats > 6 (P46 `boost.expire`).

### F-046 Referral programme

Attribution: first valid invite link/code before account creation (all invites carry `inviter_id`). Qualification: referee is new (unique verified phone / Apple / Google subject + attestation) AND joined-and-voted or created a trip. Reward: one referral stamp each (`stamps.kind=referral`); covers unlock at 3 (Navy) and 5 (Collector cover, Q-97 rename); stamps beyond 5 still counted, no further cover. Fraud: attestation, velocity per referrer (≤ 20 qualified/30 d), self-referral device match → void. Dashboard (undesigned in app → design in code) under You > Invite friends: link + copy + channels, stamps 0/5 slots, friends list with status only (PENDING / JOINED / STAMPED — no activity detail, privacy), how-it-works, fine print → referral terms (legal P51).

## Architecture & contracts

| Area | Delta |
|---|---|
| Tables | `invites`, `invite_prefill` (+ `phone_hash`, doc delta), `referrals` (+ `status pending/joined/qualified/void`, `via`, doc delta), `seat_waitlist_offers`, `crew_contact_cards` per data-model |
| RLS | `invite_prefill` X (inviter only via command, decrypted server-side); `invites` M status columns; `referrals` O either party (status only); `seat_waitlist_offers` T; `crew_contact_cards` M |
| Commands | §4.2 set: `create_crew`, `update_crew`, `create_invite`, `rotate_join_code`, `accept_invite`, `defer_invite`, `decline_invite`, `leave_crew`, `remove_member`, `set_active_crew`, `promote_waitlist`; add `revoke_invite {invite_id}`, `accept_seat_offer {offer_id}`, `set_crew_notify {crew_id, level: all|mentions|off}` (doc delta; the only per-crew notification setting — P24 has no separate chat mode) |
| Links | register providers `invite`, `join-code`, `referral` in phase-21 registry (preview subset: crew name, inviter first name, trip place/dates, members_count, seats taken/cap, state) |
| AI | `invite-tags` (Haiku 4.5, structured output `{tags: TagEnum[≤3], line ≤70}`, persona of trip guide; validator rejects non-enum); `crew-welcome` (Haiku, ≤ 90 chars, template fallback); both via phase-13 gateway, promptfoo evals |
| Jobs | `invites.expire` + code expiry (`maint.codes` hourly), `waitlist.offer` on `participant.rsvp_out`, `waitlist.offer_expire`, `invites.nudge` (installed non-openers, once after 24 h), `referral.evaluate` on vote/trip events |
| Push | N-43 seat opened, crew invite received (existing user), nudge |
| Entitlements | `seatCap(t)` from `packages/entitlements`; crew ceiling from `client_config` |

## Tasks

### T1 — Growth tables, RLS, permission tests
- Goal: five tables with privacy.
- Files: `packages/db/src/schema/growth.ts`, `packages/db/migrations/<ts>_invites_referrals_waitlist.sql`, `packages/db/test/permissions/{invites,invite_prefill,referrals,seat_waitlist_offers,crew_contact_cards}.test.ts`, `infra/powersync/streams/crews.yaml` (`crew_invites`).
- Steps: 1. Drizzle + SQL, FORCE RLS, grants; encrypted prefill fields via phase-09 crypto. 2. Matrix incl. ex-member and invitee-before-join.
- Tests: `pnpm --filter @critterpass/db test -- permissions/invites permissions/invite_prefill permissions/referrals permissions/seat_waitlist_offers permissions/crew_contact_cards`.
- Done when: prefill unreadable by any role except command path; publication check passes.

### T2 — Crew, invite, seat and referral domain rules
- Goal: pure rules.
- Files: `packages/domain/src/crews/{limits,colours}.ts`, `packages/domain/src/invites/{machine,seat-allocation,forwarding}.ts`, `packages/domain/src/referrals/{qualification,rewards,fraud}.ts`, tests.
- Steps: 1. Invite state machine. 2. Seat allocation decision given counts + cap. 3. Forwarded-link rule. 4. Colour assignment + ring pattern. 5. Referral qualification + cover thresholds + velocity.
- Tests: `pnpm --filter @critterpass/domain test -- crews invites referrals`.
- Done when: table-driven tests cover every C26 case (unboosted 7th, boosted 16th, RSVP out frees seat, boost expiry freeze).

### T3 — Crew commands and membership epochs
- Goal: create/switch/leave/remove/rename/mute/rotate.
- Files: `services/api/src/commands/crews/{create-crew,update-crew,set-active-crew,leave-crew,remove-member,set-crew-notify,rotate-join-code}.ts`, `services/api/test/crews/crew-commands.test.ts`.
- Steps: 1. Handlers with authz + limits. 2. Epoch increment + `rt_outbox` unsubscribe control row. 3. Organiser hand-off on leave (Q-11).
- Tests: `pnpm --filter @critterpass/api test -- crews/crew-commands`.
- Done when: removed member's Centrifugo subscription ends (integration with Centrifugo container) and PowerSync stream drops crew rows.

### T4 — Invite commands, seat claim, waitlist, link providers
- Goal: server invite lifecycle.
- Files: `services/api/src/commands/invites/{create-invite,accept-invite,defer-invite,decline-invite,revoke-invite,promote-waitlist,accept-seat-offer}.ts`, `services/api/src/links/providers/{invite,join-code}.ts`, `services/worker/src/jobs/invites/{expire,waitlist-offer,offer-expire,nudge}.ts`, `packages/db/test/concurrency/seat-claim.test.ts`, tests.
- Steps: 1. `create_invite` (registered users only) with seat token, code, prefill encrypt, phone hash. 2. `accept_invite` with `SELECT … FOR UPDATE` on trip, allocation from T2. 3. Waitlist offer jobs + N-43. 4. Phone-hash match handler for phase-21 claim. 5. Providers for preview/resolve.
- Tests: `pnpm --filter @critterpass/db test -- concurrency/seat-claim`; `pnpm --filter @critterpass/api test -- crews/invites`; `pnpm --filter @critterpass/worker test -- jobs/invites`.
- Done when: 50 parallel claims on 6-seat trip with 4 taken → exactly 2 seated, 48 waitlisted; anonymous invitee can accept; anonymous inviter gets `AUTH_REQUIRED`.

### T5 — Invite AI, welcome line, referral engine
- Goal: tag inference + referral rewards.
- Files: `packages/ai/src/prompts/invite-tags/{prompt.ts,schema.ts,evals.yaml}`, `packages/ai/src/prompts/crew-welcome/{prompt.ts,evals.yaml}`, `services/api/src/commands/referrals/{attribute,void}.ts`, `services/api/src/links/providers/referral.ts`, `services/worker/src/jobs/referrals/evaluate.ts`, tests.
- Steps: 1. Prompts with enum-constrained output + validators + template fallbacks. 2. Referral attribution on claim; evaluation on vote/trip events; stamp + cover grant via phase-22 stamps; fraud void.
- Tests: `pnpm --filter @critterpass/ai eval -- invite-tags crew-welcome`; `pnpm --filter @critterpass/worker test -- jobs/referrals`.
- Done when: eval pass rate ≥ 95 % on 40 notes; second device of same person never qualifies.

### T6 — Invited fast path screens
- Goal: 3a-10, 3a-11, 3a-12, 3a-13.
- Files: `apps/mobile/src/app/onboarding/invite/{ticket,code,pass,manifest}.tsx`, `apps/mobile/src/features/onboarding/invited/*`, tests.
- Steps: 1. Ticket with preview data + motion + states. 2. Code entry with paste + found card + errors. 3. Three-tap pass using phase-22 chips/avatar/save sheet with provenance labels. 4. Manifest stamp-in, truthful nudge line, timing metric.
- Tests: `pnpm --filter mobile test -- features/onboarding/invited`; `maestro test e2e/invites/fast-path.yaml`.
- Done when: every undesigned state reachable in RNTL; Maestro timing ≤ 15 s p50 on simulator.

### T7 — Crews sheet, start a crew, crew settings
- Goal: F-047 UI.
- Files: `apps/mobile/src/app/crew/{index,new,[crewId]/settings}.tsx`, `apps/mobile/src/features/crew/{crews-sheet,start-crew,settings,members}/*`, `packages/i18n/locales/en/crew.po`, tests.
- Steps: 1. Sheet with a typed `crewCardBadge` slot (P24 T4 registers the unread count; slot renders nothing until registered), invites JOIN/LATER, theme cross-fade. 2. Start flow → share. 3. Settings: rename, members, leave, remove, mute, rotate code.
- Tests: `pnpm --filter mobile test -- features/crew`; `maestro test e2e/crew/crews-sheet.yaml`.
- Done when: switching crew changes Home theme and data within one frame budget; leave removes crew locally after sync.

### T8 — Invite composer, SEAT_LIMIT routing, waitlist UI
- Goal: F-190 + F-161 joiner/inviter UI (4f-1 sheet itself is P46).
- Files: `apps/mobile/src/features/crew/{invite-composer,seat-limit,waitlist}/*`, `apps/mobile/src/app/crew/[crewId]/invite.tsx`, tests.
- Steps: 1. Composer: contact picker, prefill fields, note + inferred tags confirm, channel list, ticket preview, QR. 2. Seat-limit presenter registry + default waitlist sheet (truthful copy). 3. Invitee waitlist ("You're next for a seat") + seat-offer accept screens.
- Tests: `pnpm --filter mobile test -- features/crew/invite-composer features/crew/seat-limit features/crew/waitlist`; `maestro test e2e/invites/seventh-seat.yaml`.
- Done when: 7th invite yields `SEAT_LIMIT` and invokes the registered presenter (contract test with a test presenter), default presenter waitlists the invitee, never an error toast; no address book upload (network log assertion in test).

### T9 — Referral dashboard
- Goal: You > Invite friends.
- Files: `apps/mobile/src/app/crew/invite-friends.tsx`, `apps/mobile/src/features/crew/referral/*`, tests.
- Steps: 1. Link + copy + channels. 2. Stamp slots + covers unlock state. 3. Friends list status-only. 4. Terms link.
- Tests: `pnpm --filter mobile test -- features/crew/referral`.
- Done when: states pending/joined/stamped render from synced `referrals`; no referee activity text shown.

### T10 — Growth loop end-to-end
- Goal: prove loop across devices.
- Files: `e2e/invites/{two-device-invite,forwarded-link,expired-code,waitlist-offer}.yaml`, `services/api/test/crews/growth-loop.test.ts`.
- Steps: 1. Two-simulator run inviter → invitee (link via `simctl openurl`). 2. API test: forwarded link, revoke, RSVP out → offer → accept. 3. Referral qualification path.
- Tests: `maestro test e2e/invites e2e/crew`; `pnpm --filter @critterpass/api test -- crews/growth-loop`.
- Done when: all flows green; `time_to_manifest_ms` recorded.

## Phase acceptance criteria

- [ ] All six features' screens and undesigned states implemented
- [ ] Seat cap enforced transactionally on every join path; concurrency test green
- [ ] Forwarded personal links never reveal invitee name
- [ ] No contact data beyond picked fields leaves the device; prefill purged per retention
- [ ] Removed members lose realtime + sync access immediately
- [ ] Referral stamps granted once per qualified new user; covers at 3/5
- [ ] `SEAT_LIMIT` always reaches the seat-limit presenter; default waitlist sheet copy truthful (4f-1 owned by P46)
- [ ] Permission tests green for 5 tables; AI evals ≥ 95 %

## Risks & rollback

| Risk | Mitigation |
|---|---|
| Seat race / double seating | Row lock + unique partial index; concurrency test in CI |
| Referral fraud | Attestation + velocity; server flag pauses rewards without release |
| Tag inference wrong/offensive | Inviter confirms tags; validator enum-only; template fallback |
| Invite spam | Phase-09 rate limits; sign-in required to send |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Referral terms (counsel, P51 legal page) | Dashboard links to terms page; programme flag off until published |
| P46 `SeatCapSheet` (4f-1) + Boost purchase | default waitlist presenter ships here; P46 T7 registers 4f-1 into the seat-limit registry |
| Trailer media (P31) | Trailer card hidden |

## Open questions

| Question | Default |
|---|---|
| `revoke_invite`, `accept_seat_offer`, `set_crew_notify`, `invite_prefill.phone_hash`, `referrals.status/via` (doc delta) | Implement as specified |
| LATER invites: kept or removed? | Kept under "Later" until expiry |
| Waitlist offer window | 24 h |
| Referral reward cap beyond 5 | Stamps keep counting; no new cover |
| Crew ceiling 16 vs boosted trip 16 when crew already has 16 | Ceiling blocks join with "crew is full" copy |
