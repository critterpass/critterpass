# Critterpass: backend, realtime, data, auth, jobs, and offline sync

Researcher report · 2026-09-26 · scope: backend platform, DB, realtime, auth, storage, jobs, push plumbing, offline sync.
Input: `requirements-brief.txt` + `screens.json` (149 screens). Screen ids like 3g-4 refer to the brief.
Out of scope, covered by other reports: mobile framework, LLM vendor and cost, maps/routing/flight APIs, payments/IAP.
All prices are USD unless marked. They were checked on 2026-09-26 (the source links are in the Key claims table).

---

## 0. TL;DR

- **Recommendation:** use **Supabase Pro** (Postgres, RLS, Auth, Realtime Broadcast/Presence, Storage, Edge Functions, pg_cron, Queues/pgmq) in **ap-southeast-1 (Singapore)**. Add **one TypeScript worker** on Railway Singapore for long AI jobs, APNs/FCM (including Live Activities), the ETA loop, exports and purges. For offline trip data, use **PowerSync Cloud** (Sync Streams over the same Postgres). All writes go through **idempotent command RPCs**, so the outbox works with or without PowerSync.
- **Runner-up:** a custom stack (Postgres, Hono on Bun/Node, Better Auth, pg-boss, WebSockets or Durable Objects, R2). It would use the **same schema and SQL**, so it doubles as the escape hatch from Supabase. It costs about 6–10 extra build weeks.
- **Eliminated:**
  - **InstantDB**: the team joined OpenAI, signups are closed, and the cloud shuts down on 2027-08-31.
  - **Zero**: it does not support offline writes, so it fails 3k-4.
  - **Triplit, Replicache, WatermelonDB, Legend-State v3**: each has maintenance or maturity problems (details in §5).
- **Cost:** the platform is cheap relative to everything else. Estimated Supabase + worker + PowerSync, excluding SMS: about **$85 / $190 / $1.4k per month at 1k / 10k / 100k MAU**. **SMS OTP is the largest backend line item** (about $1.4k/mo at 100k MAU with Twilio Verify and a SEA-heavy user mix). The biggest avoidable cost trap is **Supabase image transformations on user photos** (about $3k/mo at 100k MAU). Generate thumbnails on the client instead.
- **Must-know gotchas:**
  1. Realtime RLS is cached per connection, so a revoked member keeps receiving until their JWT refreshes. Mitigate with epoch topics and short JWTs.
  2. Postgres Changes is single-threaded and authorizes every event for every subscriber. Use Broadcast-from-DB instead.
  3. Pro with the spend cap on is limited to 500 concurrent Realtime connections and 50 presence msgs/s. Turn the cap off at about 5–10k MAU.
  4. The refresh-token reuse window is 10 s. The main app and extensions (widgets, notification actions, Live Activity intents) will race and revoke the session. Give extensions scoped **action keys**.
  5. Vietnam **blocks unregistered SMS sender IDs** (enforced since 2025-08-25) and needs brandname registration (about 5 weeks).
  6. The `gmail.readonly` scope is Restricted and needs an annual CASA assessment. Use a forwarding address for the v1 booking import.

---

## 1. Context: what the backend must carry

| Capability | Screens | Backend implication |
|---|---|---|
| Pass exists before the account; later linked to Apple, Google or SMS OTP | 3a-1..3a-8 | Anonymous auth user from the first launch. Linking an identity keeps the same uid. Handle the case where the identity already exists (merge). |
| Invite ticket, deferred deep link, 6-char join code | 3a invite | Server-side invite tokens and codes. Firebase Dynamic Links is dead (shut down 2025-08-25), so a different deep-link provider is needed. |
| Crews (≤6 free, 7th member triggers a paywall), roles, multiple crews per user | 3g-3, 4 | Membership table plus entitlement checks inside RPCs, not only in the client. |
| Trip lifecycle: vote → setup → draft → proposal → live → recap | 3b–3m | A state machine in SQL with guarded transitions. |
| Votes and polls, including from notification actions, widgets and the lock screen | 3c-1, 3g-1, 5b-2, 5c | Idempotent vote upsert. Writes arrive from app extensions, which need an auth path that doesn't race the app's session (§6.4). |
| Group chat with the guide as a participant; guide replies stream | 3g-1, 3j | Durable messages plus ephemeral token deltas. |
| Presence, typing and cursors | 3g-2, 3c-7, 3d-2 | Ephemeral, high-frequency messages. Never persisted. |
| Live location, ETAs recounted every minute, meet-up pin, 1 h temporary sharing, SOS | 3g-4, 3k-6, 3k-10, 5a-2 | Location sessions and expiry enforced on the server. A 1-minute ETA loop. Live Activity pushes. |
| Private per-person budget maxes. "Nobody sees anyone else's number, including Pon" | 3c-5, 3n-2 | Owner-only table. Only an aggregate is exposed. The AI must never be able to read it. |
| Payment handles "shared only with the person paying" | 3i-5 | Visibility scoped to a relationship (open settlement between payer and payee). |
| Expenses, balances, multi-currency, "rates work offline" | 3i-1..3i-6, 3n-8 | Integer minor units, FX snapshot stored per expense, daily FX table synced to devices. |
| Bookings wallet, "all offline", email import | 3h, 3k-1 | Offline pack plus inbound-email parsing. |
| Photo album uploads, guide picks, recap | 3m | Background, resumable uploads. CDN. Renditions. |
| Scheduled jobs: morning briefing, leave-by, 20:00 roundup, anniversary, free-boost ending, reminders, per-user ping budget | 3k-1, 5a-1, 5b-1, 5b-4, 4 | Per-timezone scheduling, a notification router with a budget ledger, and a durable queue. |
| Live Activity push-to-start and updates; the crew activity runs on all 6 phones | 5a-1, 5a-2 | Direct APNs (token auth), push-to-start tokens, APNs broadcast channels (iOS 18). |
| Long AI jobs with visible task progress; redraft returned as a diff; 3 redrafts per trip free | 3c-8..3c-10 | Job table with progress, worker, and an atomic quota. |
| Offline mode with outbox: "sends when you're back" | 3k-4 | Local store plus an ordered, idempotent command outbox. |
| Community published plans, idea board with duplicate detection | 3o, 3p | Scrubbed published snapshots. pgvector for duplicate detection. |
| Delete account with 30-day undo; data export | 3n-6, 3n-9..3n-11 | Soft delete, restore on sign-in, purge job, export zip job. |

Scale assumptions used for the estimates: 15% of MAU are on a trip in a given month, 6 trip-days each, crew size about 5, and peak concurrent sockets equal to 5% of MAU (the app releases its socket when backgrounded).

---

## 2. Evaluation criteria (weights sum to 100)

| # | Criterion | Wt | Why it matters here |
|---|---|---|---|
| C1 | Relational integrity and queries | 10 | Balances and settle-up (3i-5 "netted 23 expenses down to three payments"), plan versions and diffs, lifecycle, joins across crews |
| C2 | Fine-grained security (row and field level) | 15 | Budget maxes (3c-5), payment handles (3i-5), location windows (3g-4, 3k-6), private guide threads (3c-4 "ask Dev privately") |
| C3 | Realtime fit | 15 | Chat, votes, presence and cursors (3g-2), location fan-out (3g-4), guide token streaming, the ticker (3k-1) |
| C4 | Auth fit | 10 | Anonymous first, linking Apple/Google/phone, custom SMS routing, a merge path |
| C5 | Jobs and scheduling | 10 | Per-timezone crons, queues, AI jobs of several minutes with progress, the 1-minute ETA loop |
| C6 | Offline story | 10 | 3k-4 outbox, "all offline" bookings, offline FX |
| C7 | Storage and CDN | 5 | Album photos, boarding passes, recap assets |
| C8 | Cost at 1k–100k MAU | 10 | Bootstrapped founder |
| C9 | Lock-in and vendor viability | 5 | InstantDB's shutdown shows the risk is real |
| C10 | Team velocity (SDKs for Swift, Kotlin, RN and Flutter; DX) | 10 | Small team; the mobile client is not decided yet |

---

## 3. Options matrix (1–5 per criterion; weighted total out of 100)

| Option | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Supabase + worker + PowerSync** | 5 | 5 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | **85** |
| Supabase + worker, hand-rolled offline | 5 | 5 | 4 | 4 | 4 | 3 | 4 | 4 | 4 | 4 | 83 |
| Custom (PG + Hono + Better Auth + pg-boss + WS/DO + R2) | 5 | 4 | 4 | 3 | 5 | 3–4 | 4 | 4 | 5 | 2 | 77–79 |
| Firebase (Firestore + RTDB + Functions + FCM) | 2 | 3 | 4 | 5 | 4 | 5 | 4 | 3 | 1 | 4 | 72 |
| Convex | 4 | 4 | 4 | 3 | 5 | 2 | 3 | 3 | 2 | 4 | 71 |
| InstantDB | not scored: the cloud sunsets on 2027-08-31 and signups are closed | | | | | | | | | | **excluded** |

Scoring notes:
- **Supabase C3 = 4, not 5.** Postgres Changes doesn't scale (single thread, one auth check per subscriber), presence is rate-limited on Pro, and policies are cached per connection. All three are manageable with Broadcast (§7).
- **Firebase C1 = 2.** Firestore is a document store, so balances and settlement need denormalised counters or Cloud Functions. **C2 = 3:** rules work per document ("impossible … to prevent users from reading specific fields"), so private data has to be split into separate documents. That is workable but spreads the design out. **C6 = 5:** built-in offline persistence with queued writes. **C9 = 1:** proprietary.
- **Convex C6 = 2.** No official offline support. The Curvilinear local-sync repo was archived on 2026-09-24, and PowerSync's Convex connector is **alpha**. **C4 = 3:** Convex Auth is labelled beta. **C10:** excellent TypeScript DX, but the native Swift (0.8.1) and Kotlin (0.8.0) clients are pre-1.0.
- **Custom C10 = 2.** You build auth linking, realtime authorization, presence, storage signing and an admin UI yourself.

---

## 4. Platform deep-dives

### 4.1 Supabase (recommended core)

- **Database:** plain Postgres. Includes RLS, pg_cron (Supabase Cron: every second to yearly; the guideline is ≤8 concurrent jobs, each ≤10 min), **Queues = pgmq** (GA since 2024-12-05; guaranteed delivery; exactly-once within the visibility window), and pgvector for idea-board duplicate detection. Since 2026-05-30, new projects need **explicit grants** before a table is exposed through the Data API. That makes the default deny, which is good for private tables.
- **Auth:**
  - `signInAnonymously()` issues a JWT carrying an `is_anonymous` claim.
  - Upgrading: `linkIdentity()` for OAuth, including native Apple/Google ID tokens; `updateUser({phone})` plus OTP for phone. **Manual linking is still labelled Beta** and must be switched on (`GOTRUE_SECURITY_MANUAL_LINKING_ENABLED`).
  - Anonymous sign-in defaults to 30 requests/hour per IP (configurable). CAPTCHA is strongly recommended. There is **no automatic cleanup**; you delete stale anonymous users with SQL.
  - Anonymous users appear to count as MAU (per a GitHub discussion; medium confidence).
  - **Send SMS hook** (HTTP or Postgres) replaces the built-in SMS sender, which allows regional providers, WhatsApp and failover.
  - Built-in SMS providers: Twilio, Twilio Verify, MessageBird, Vonage (Textlocal is community). WhatsApp is supported only through Twilio or Twilio Verify.
  - Passkeys are in beta (June 2026).
- **Realtime:**
  - **Broadcast:** client over WebSocket, REST, or from the DB via `realtime.send()` / `realtime.broadcast_changes()`. Binary payloads since July 2026.
  - **Replay** on private channels: up to 25 messages, kept for 72 h to 4 days.
  - **Presence**, and **private channels** authorised by RLS on `realtime.messages` using `realtime.topic()`.
  - **Policies are cached for the life of the connection** and refresh only on join or when a new JWT arrives.
  - **Postgres Changes:** one auth check per subscriber per event, processed on a single thread. Supabase says to use Broadcast above about 3,000 concurrent subscribers to the same changes.
  - Billing counts each message per recipient: 1 broadcast to 4 listeners = 5 messages.
- **Realtime limits:**

| Limit | Pro, spend cap on | Pro, cap off / Team |
|---|---|---|
| Concurrent connections | 500 | 10,000 |
| Messages/s | 500 | 2,500 |
| Presence messages/s | **50** | 1,000 |
| Channels per connection | 100 | 100 |
| Broadcast payload | 3 MB | 3 MB |

- **Storage:**
  - Resumable TUS uploads with 6 MB chunks; the upload URL is valid for 24 h.
  - Image transformations: **$5 per 1,000 origin images** after 100. Output is at most 2500 px; sources up to 25 MB or 50 MP.
  - **Never delete objects through SQL.** That orphans the files; use the Storage API.
- **Edge Functions:** Deno. 256 MB memory, **2 s CPU**, 400 s wall clock (paid), 150 s idle timeout, `EdgeRuntime.waitUntil` for background tasks. Good for thin APIs, webhooks, the SMS hook and SSE streaming. **Not suitable** for multi-minute AI drafting or the ETA loop, so those go to the worker.
- **Pricing (Pro):**

| Item | Included | Overage |
|---|---|---|
| Base | $25/mo, includes $10 of compute credit (1× Micro) | — |
| Auth MAU | 100k (third-party MAU also 100k) | $0.00325/MAU |
| Disk | 8 GB | $0.125/GB |
| Egress | 250 GB | $0.09/GB (cached $0.03) |
| Storage | 100 GB | $0.0213/GB |
| Edge Function invocations | 2M | $2/M |
| Realtime | 500 connections, 5M messages | $10 per 1k connections; $2.50/M messages |
| PITR | — | $100/mo per 7 days |

  Compute sizes: Small $15 (2 GB), Medium $60 (4 GB), Large $110 (2 dedicated vCPU, 8 GB), XL $210 (4 vCPU, 16 GB), 2XL $410.
- **Regions:** Singapore `ap-southeast-1`, plus Tokyo, Mumbai, Sydney and others. One primary region per project.
- **Health:** supabase-js 2.117.2 (2026-09-25), realtime v2.138.1 (2026-09-23), supabase-swift 2.55.2 (2026-09-09). Flutter and Kotlin (community, 3.8.0) are active. $500M Series F in June 2026, so near-term vendor risk is low.

### 4.2 Convex

- Reactive TypeScript queries and mutations. The scheduler handles 1M outstanding functions. Actions run up to 30 min (Convex runtime) or 10 min (Node). Crons and file storage are built in. A presence component exists (`@convex-dev/presence`, with an RN import path).
- **Pricing (Professional):** $25 per developer per month. Includes 25M function calls (then $2/M), 250 GB-h of action compute, 50 GB DB storage and I/O (then $0.20/GB), and 50 GB egress (then $0.12/GB). Query and mutation compute is not metered. Business tier has a $2,500/mo minimum.
- **Blockers for Critterpass:**
  - No first-party offline sync (Curvilinear archived 2026-09-24; community `convex-rn` is "EXPERIMENTAL"; PowerSync–Convex is alpha).
  - Convex Auth is beta.
  - Native clients are pre-1.0.
  - Private data is enforced in function code, not declaratively (fine, but review-heavy).
  - Live location at 1/min × crew fan-out means every write re-runs subscribed queries and counts function calls.
- **License:** FSL-1.1-Apache-2.0 and self-hostable (Postgres or SQLite backing). But the API is proprietary, so leaving means a rewrite.
- **When it wins:** a TypeScript-only (RN/Expo) team, offline reduced to a read-only cache, and a preference for reactive queries and built-in workflows over SQL and RLS.

### 4.3 Firebase (Firestore, Cloud Functions, FCM, RTDB)

- **Strengths:**
  - The most mature **anonymous → link** flow (`link(with:)`, `credentialAlreadyInUse` on conflict). With Identity Platform, anonymous users auto-clean after 30 days and **don't count toward MAU**.
  - Built-in phone auth, billed per SMS; the first 10/day are free.
  - Firestore offline persistence with queued writes.
  - FCM is free and **supports Live Activity start, update and end** (doc updated 2026-09-24; broadcast channels not mentioned).
- **Weaknesses:**
  - Firestore is documents only. Balances need aggregation via Functions.
  - Rules are per document, so private data must be split into subcollections.
  - Listener re-reads are billed. After a disconnect of more than 30 min, a listener is billed as a brand-new query.
  - Lock-in is high.
  - "Firebase SQL Connect" (the renamed Data Connect: Cloud SQL Postgres plus GraphQL) exists but has no offline and adds a second model.
- **Prices:**
  - Firestore Standard (Iowa table): $0.03 per 100k reads, $0.09 per 100k writes, $0.01 per 100k deletes. Singapore pricing may differ; not verified.
  - Identity Platform: 0–50k MAU free, then $0.0055 per MAU up to 100k, $0.0046 up to 1M.
- **Use as an add-on (a flip option):** Supabase supports **Firebase Auth as third-party auth**. RLS reads `auth.jwt()->>'sub'`, and a `role: authenticated` claim must be set via blocking functions. So Firebase phone auth could be used without adopting Firestore.

### 4.4 Custom (runner-up)

- **Stack:** Postgres (Supabase DB-only, Neon, or Railway PG), Hono 4.13.9 on Bun 1.4.2 or Node, Better Auth 1.7.6 (the anonymous plugin's `onLinkAccount` merges data; phone plugin), Drizzle 0.45.3, pg-boss 12.34 or Graphile Worker 0.18, WebSockets on Railway or Cloudflare Durable Objects via PartyServer 0.5.10 for fan-out, R2 for storage.
- **Railway:** Pro is $20 per workspace including $20 of usage. CPU is about $20 per vCPU-month, memory about $10 per GB-month, egress $0.05/GB. A **Singapore** region exists.
- **Durable Objects:** $0.15 per million requests, and WebSocket messages are billed 20:1. SQLite storage is billed from Jan 2026. Hibernation isn't billed. The Workers Paid minimum is $5.
- **Pros:** full control, cheapest infrastructure, lowest lock-in, no Edge Function limits.
- **Cons:** 6–10 extra weeks to rebuild auth linking, realtime authorization, presence, signed storage, an admin dashboard, backups and observability. There are more security surfaces to own.

### 4.5 InstantDB: excluded

"The Instant team joins OpenAI" (announced 2026-08-22). New signups are closed. Cloud apps shut down on **2027-08-31**, and backups remain until 2028-08-31. The code is open source and there is a self-host guide. This is not a foundation to build on.

### 4.6 Managed realtime add-ons (ephemeral traffic only)

| Option | Price (2026-09) | Fit | Verdict |
|---|---|---|---|
| **Supabase Realtime (included)** | 5M msgs and 500 connections included; $2.50/M messages; $10 per 1k connections | Same JWT and RLS, no extra vendor | **Use** |
| Ably | Standard $29/mo + $2.50/M messages + $1 per million connection-minutes and channel-minutes; 10k peak connections | Strong delivery guarantees, but a second auth integration (token requests) | Flip option above about 10k concurrent connections or for SLA needs |
| Liveblocks | Pro $30/mo; 10 connections per room on Free/Pro; $0.002 per collaboration-minute; RN not mentioned | Built for web document collaboration | No |
| Cloudflare DO / PartyServer | $0.15 per M requests, WebSocket messages 20:1, hibernation free | Cheapest fan-out; you write it | Flip option if location fan-out becomes the cost driver |

---

## 5. Offline and local-first options (3k-4)

| Option | Offline writes | Clients | Conflict model | Maturity (checked 2026-09-26) | Fit |
|---|---|---|---|---|---|
| **PowerSync** | Yes: ordered upload queue; `localOnly` and `insertOnly` tables; attachments helper | RN, Flutter, Swift, Kotlin, JS, .NET, Node: **all GA** | Server-authoritative. Your backend applies each operation. Default is per-field LWW; delete wins; per-client op-id for dedupe | RN SDK 2.3.0 (2026-09-21), Swift 1.16.2 (2026-09-16). Sync Rules are being replaced by **Sync Streams** (new Cloud instances can't use Sync Rules after 2027-03-15) | **Best fit.** Supabase is first-class: WAL replication, Supabase JWT via JWKS, writes through supabase-js so RLS applies. Pro $49/mo, 1k peak clients included, $30 per extra 1k, 30 GB synced then $1/GB. Self-host Open Edition (FSL) |
| ElectricSQL (1.x) | Read path only. Writes go through your API. Offline needs your own persistent optimistic layer (TanStack DB 0.6 persistence, Mar 2026) | TypeScript and Elixir official. RN via the TS client. **No Swift or Kotlin** | You own it | `@electric-sql/client` 1.5.28 (2026-09-09), Apache-2.0. Cloud: $1 per M writes, reads free | Good for web. Weak for native mobile offline |
| Zero (Rocicorp) | **No.** "Zero does not support offline writes" | Web and RN (0.23+) | Server-authoritative | 1.0 on 2026-03-24, 1.9.0 on 2026-08-14 | **Fails the outbox requirement** |
| Legend-State | Yes (persist plus sync plugins; Supabase plugin) | JS/RN only | Client-driven LWW via `updated_at` | **v3 still beta** (3.0.0-beta.48, 2026-07-12). Stable 2.1.15 is from 2024-08 | Risky: beta for years, JS only |
| WatermelonDB | Yes (your pull/push endpoints) | RN only | Per-column client changes; server decides | Last release 0.28.0 (2025-04-07); 304 open issues | Stale |
| Triplit | Yes | JS | CRDT-ish | Joined Supabase 2025-10-08 with no product integration. Client last published 2025-07-31 | Dead end |
| Replicache | Yes | JS | Server-authoritative | "Now in maintenance mode … migrate to Zero" | No |
| Hand-rolled "trip pack + command outbox" | Yes (you build it) | Any | Per command, server-authoritative | n/a | **Fallback** if the offline scope stays narrow |

**Why PowerSync over hand-rolled:**
- About 20 screens show live data (chat, votes, balances, plan, ticker, RSVPs, quests).
- With PowerSync, each screen is a **live query over local SQLite**. That gives offline reads everywhere (the design promises "Bookings · all offline", "Rates work offline", "Search works offline once Kyoto is saved", "Bali trip saved offline 84 MB").
- Durable data no longer needs per-screen realtime subscriptions and reconnect catch-up code.
- Realtime then only carries ephemeral traffic: typing, presence, cursors, location, token streams.

**Costs of PowerSync:**
- A **second permission layer**: Sync Streams decide reads, RLS decides writes ("Grants and RLS do different jobs, and you need both").
- $49–$340 per month.
- One more service in the sync path. Local reads still work if it is down.

**Flip to hand-rolled if** the owner limits offline to "today's pack plus 4 command types" (message, vote, expense, photo) and wants no extra vendor.

---

## 6. Recommended architecture

```
 iOS / Android app ─┬─ supabase-js/swift/kt: Auth, RPC (commands), Storage (TUS)
  + widgets/LA/     ├─ Realtime WS: Broadcast/Presence (ephemeral + DB-originated events)
  App Intents ext.  ├─ PowerSync SDK: local SQLite ⇄ PowerSync Cloud ⇄ Postgres WAL
                    └─ Extension "action key" → Edge Function /actions (vote, I'M UP, late, nudge)
 Supabase (Singapore): Postgres+RLS · Auth · Realtime · Storage · Edge Functions · pg_cron · pgmq
 critter-worker (Railway Singapore, TS on Node/Bun): pgmq consumers
   → LLM jobs (drafts, briefings, roundups, receipt/email parsing) · APNs HTTP/2 (token auth, LA, broadcast channels)
   → FCM HTTP v1 · ETA loop (routing API) · exports/purges · FX fetch (Frankfurter) · anon-user cleanup
```

### 6.1 Data model sketch (Postgres, all tables with RLS on and explicit grants)

- **Identity:**
  - `profiles`: name, avatar sticker, home airport. Visible to self and crewmates.
  - `user_private`: payment handles, dietary, prefs. Owner only.
  - `account_deletions`: requested_at, purge_after, reason.
- **Crews:**
  - `crews`.
  - `crew_members`: crew_id, user_id, role organiser|member, joined_at, left_at, **topic_epoch**.
  - `invites`: code char(6) unique, token, prefill jsonb, expires_at.
- **Trips:**
  - `trips`: crew_id, status enum, tz, dates, dest, boost, pack_version.
  - `trip_members`: rsvp, slide_to_board_at.
  - `plan_versions` and `plan_items`: day, start, 15-minute slot, place ref.
  - `must_dos`.
  - `ai_jobs`: kind, status, `steps jsonb`, result_ref, error.
- **Decisions:**
  - `polls`: kind vote|showdown|swipe, closes_at.
  - `poll_options`.
  - `votes`: PK (poll_id, user_id), upsert.
  - `swipe_matches`: the server decides.
- **Money:**
  - `expenses`: amount_minor bigint, currency, **fx_rate numeric plus fx_date plus fx_source frozen at entry**, payer_id.
  - `expense_shares`.
  - `settlements`: from, to, amount_minor, status.
  - `fx_rates`: date, base, quote, rate. Filled daily from Frankfurter, which serves 166 currencies including IDR, VND, JPY, ISK, MXN and PEN (verified live).
- **Bookings and media:**
  - `bookings`: owner, visibility me|crew, kind, payload jsonb, source.
  - `albums`, `photos`: storage_path, thumb_path, w, h, taken_at, uploader.
- **Location:**
  - `location_shares`: user, trip, mode trip_days|temporary|sos, started_at, **expires_at**.
  - `live_positions`: one row per user per trip, upserted.
  - `position_trail`: ring buffer with a TTL purge.
  - `meetups`: pin, at.
  - `meetup_etas`.
- **Push:**
  - `devices`.
  - `push_tokens`: kind apns|fcm|la_update|la_push_to_start, activity_id, env.
  - `la_channels`: trip, APNs channel id.
  - `notification_outbox`: user, class always|budgeted|roundup, dedupe_key, due_at, status.
  - `ping_ledger`: user, local_date, count.
- **Community:**
  - `published_plans`: a **scrubbed snapshot**, never live trip rows.
  - `ideas`: embedding vector.
  - `idea_votes`.
- **Commands:** every mutating RPC takes a client-generated `id uuid` and uses `insert … on conflict (id) do nothing`, which makes it idempotent for outbox replays.

### 6.2 Security model: key patterns

```sql
-- membership helper: STABLE + SECURITY DEFINER, wraps auth.uid() in a subselect so the planner caches it
create function app.is_crew_member(c uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.crew_members m where m.crew_id=c and m.user_id=(select auth.uid()) and m.left_at is null) $$;

-- budget max: owner-only; nobody else (crew, organiser, guide) can select
create table public.budget_max_private(trip_id uuid, user_id uuid default auth.uid(), max_minor bigint not null,
  currency char(3) not null, primary key(trip_id,user_id));
alter table public.budget_max_private enable row level security;
create policy own on public.budget_max_private for all using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
-- crew sees only an aggregate via SECURITY DEFINER fn: submitted/total + rounded sweet spot, and only once submitted>=k
```

- **The guide never reads private data.** The worker gathers LLM context through a dedicated Postgres role `guide_reader` that has **no grant** on `budget_max_private` or `user_private`, instead of the service role (which bypasses RLS). Only the aggregate function's output reaches the prompt.
- **Payment handles (3i-5):** a policy on `user_private.payment_handles` allows select only when there is an open `settlement` where `from = auth.uid()` and `to = owner`.
- **Location:** `live_positions` is readable only when the owner has an active `location_shares` row (`now() < expires_at`) and the viewer is a crewmate. Positions are **written only through the RPC `post_location()`**, which also calls `realtime.send()`. Sharing switches off at midnight or after 1 h because of `expires_at`, not because the client remembers.
- **Anonymous users:** a policy of `(auth.jwt()->>'is_anonymous')::bool = false` restricts actions that need a saved account, such as publishing to the community or paying for a boost. Crew and pass creation stay open to anonymous users, per 3a.
- **PowerSync Sync Streams** mirror the membership predicates. **Private tables are never included in any stream.** A CI test asserts the stream definitions don't reference them.

### 6.3 Auth flows

1. First launch, OPEN YOUR PASS: `signInAnonymously()`. The pass row is created under this uid, so invites work before an account exists.
2. SAVE MY PASS (3a-7):
   - Apple or Google native ID token: `linkIdentity({provider, token})`.
   - Phone: `updateUser({phone})` then verify the OTP (phone-change).
   - The uid is unchanged and so is all data.
3. **Conflict** (the identity already has an account, e.g. a new phone): linking fails.
   - The app first obtains a server-signed **merge ticket** for the anonymous uid.
   - It then signs in to the existing account and calls `merge_anonymous(ticket)`.
   - Merge policy: crews and critters are unioned; pass fields from the existing account win.
   - Product: add "I already have a pass" on the splash (3a-1 only shows "I have an invite code").
4. **Cleanup:** a daily pg_cron job deletes anonymous users inactive for more than N days with no crew membership, because Supabase doesn't clean them up automatically.

### 6.4 Extensions: auth without session races

Notification actions, interactive widgets and Live Activity buttons such as I'M UP (5a-1, 5b-2, 5c) run in extension processes. If both the app and an extension refresh the Supabase session, then **a reuse outside the 10 s window revokes the whole session**.

Fix:
- At sign-in, the app mints a per-device **action key**: 256-bit random, stored hashed in the DB, placed in the App Group keychain, scoped to `{vote, im_up, running_late, nudge, snooze}`.
- Extensions call the Edge Function `/actions`, which verifies the key, rate-limits, and calls the same idempotent command RPCs.
- The key is revocable per device.

### 6.5 Jobs and scheduling

- **pg_cron, every minute:**
  - `enqueue_due()` scans `notification_outbox` and `scheduled_events` (due_at ≤ now(), `FOR UPDATE SKIP LOCKED`) and sends them to **pgmq** queues: `push`, `ai`, `eta`, `maint`.
- **pg_cron, daily:**
  - FX fetch.
  - Account purge.
  - Anonymous-user cleanup.
  - Position-trail TTL.
  - Anniversary scan (trip end date = today − 1 year, 09:00 local).
  - Free-boost-ending reminders.
- **Timezones:**
  - Every schedule is stored as a local time plus a tz, and converted to `due_at` when created or when the trip tz changes.
  - The morning briefing is **generated around 05:00 trip-local** and delivered at wake-up. It is also included in the offline pack.
  - The roundup runs at 20:00 in the user's local tz.
- **Notification router** (worker):
  - Class `always`: leave-by, SOS, flight change, anything that costs money if missed.
  - Class `budgeted`: checks `ping_ledger` against the user's budget (5b-4). Overflow goes to the 20:00 roundup.
  - Also applies dedupe keys and sets the interruption level (time-sensitive vs passive). DND-piercing alarms and SOS are mobile-client entitlements; see the mobile report.
- **Long AI jobs (3c-8):**
  - The RPC `request_draft(trip)` enforces the free quota of 3 redrafts per trip atomically, inserts `ai_jobs`, and enqueues.
  - The worker streams step updates into `ai_jobs.steps`, broadcasts on `user:{uid}`, and pushes "draft ready" if the app is backgrounded.
  - The diff is computed on the server between plan versions.
  - Edge Functions are **not** used for this because of the 2 s CPU and 400 s wall-clock limits.
  - Optional: Trigger.dev v4 (no timeouts, realtime streams, $10–50/mo base) if multi-step LLM orchestration grows. Not needed on day 1.
- **ETA loop (3g-4, 5a-2):**
  - Only for meetups within the next 90 min that have sharing members.
  - Every minute: batch a routing-API matrix call, write `meetup_etas`, and broadcast.
  - APNs Live Activity updates go out at **priority 5**, which doesn't count toward the budget, and at priority 10 only on threshold events (everyone under 5 min, arrival).
  - The app needs `NSSupportsLiveActivitiesFrequentUpdates`.

### 6.6 Push and Live Activities

- **iOS:** direct APNs over HTTP/2 from the worker. Live Activity pushes **require token-based auth** and `apns-push-type: liveactivity`. A Live Activity lasts at most 8 h active and 12 h on the lock screen. Push-to-start needs iOS 17.2+.
- **Crew activity on all 6 phones (5a-2):**
  - Use an **APNs broadcast channel per crew event** (iOS 18). Push-to-start carries the channel id, and one push updates every phone, with no per-activity token bookkeeping.
  - Fallback for iOS 17.2: per-member push-to-start plus per-activity update tokens.
  - The channel limits and channel-management API were not verified here.
- **Flight-day Live Activity:** start it close to departure because of the 8 h cap.
- **Android:** FCM HTTP v1. FCM also supports iOS Live Activity start, update and end, but I found no mention of broadcast channels, so iOS goes direct.

### 6.7 Storage

- **Buckets:**
  - `photos`: private; read via signed or CDN URLs checked against album membership.
  - `docs`: boarding passes and tickets; owner or crew by booking visibility.
  - `exports`: private; signed URL with a 7-day TTL.
  - `static`: critters and places; public and cached.
- **Uploads:** background OS transfer (URLSession background / WorkManager) to TUS, 6 MB chunks. The app **makes renditions on the client**: a 2048 px long edge at about 1.2 MB plus a 512 px thumbnail at about 60 KB. The DB row is written by an idempotent RPC after the upload completes.
- **Do not use Supabase image transformations on user photos.** They cost $5 per 1k origin images, which is about $3k/mo at 100k MAU. Use them only for the small static catalogue.
- **Move photos to R2 when** stored photos exceed about 5 TB or egress exceeds 1 TB/mo. R2 is $0.015/GB-month with free egress.

---

## 7. Realtime channel design (Supabase private channels; RLS on `realtime.messages` by topic)

| Topic | Members | Events | Producer | Notes |
|---|---|---|---|---|
| `user:{uid}` | self (all devices) | inbox items, job progress, seen-flags, reveal-once (3c-2) | DB triggers (`realtime.send`), worker | Organiser-only drafting progress goes here |
| `crew:{crew_id}:{epoch}` | crew members | `msg` (new or edited, from a DB trigger), `poll` (tally), `ticker`, `guide_delta` {msg_id, seq, text}, `typing` | DB, worker, clients (typing only) | Guide deltas are flushed about every 250 ms and the final text is written to the DB. Typing is throttled to 1 per 3 s per user |
| `trip:{trip_id}:collab:{day}` | crew | presence {user, focus_item} (low frequency); `cursor` via **Broadcast** at ≤5 Hz while touching; `vote` | clients, DB | Don't put cursors in Presence: Pro allows only 50 presence msgs/s with the cap on |
| `trip:{trip_id}:setup` | crew | step status, submissions **count only**, must-do rows, typing | DB, clients | Budget values never touch Realtime |
| `swipe:{session}` | participants | presence, `yes`, `match` (server-decided, idempotent) | RPC, DB | |
| `trip:{trip_id}:loc:{epoch}` | crew with an active share | `pos` (binary or compact), `eta`, `sos` | **server only** (`post_location` RPC, worker) | Clients subscribe only while the map is open. Background devices get Live Activity pushes instead |

- **Authorization:**
  - `select` policy: `app.can_join(realtime.topic())` parses the topic and checks membership, epoch and share window.
  - `insert` policy: allows client broadcast only on `typing` and `cursor` topics. The location topic is server-only.
- **Revocation lag:** policies are cached per connection until the JWT refreshes. So:
  1. Topics carry `topic_epoch`, bumped when a member leaves or is removed; old topics stop receiving.
  2. Set the JWT expiry to about 15 min. The docs advise against going below 5 min.
- **Durable versus ephemeral:**
  - Everything durable (messages, votes, expenses) is written to the DB first and reaches devices through PowerSync, or through a DB-trigger broadcast when PowerSync isn't used.
  - Realtime carries only ephemeral traffic plus nudges.
  - **Avoid Postgres Changes** for fan-out.
- **Reconnect:** the DB is the source of truth. PowerSync, or a `since=seq` fetch, fills the gaps. Broadcast replay (25 msgs, 72 h) is only a nicety.
- **Estimated volume:** about 1,000 billable messages per MAU per month. Location about 360, guide deltas about 360, chat about 90, presence and typing about 100, votes and events about 50. That gives 1M / 10M / 100M per month at the three tiers.

---

## 8. Offline strategy (3k-4)

1. **Trip-scoped local replica** (PowerSync Sync Streams keyed by `auth.user_id()` and membership):
   - trips, plan items, bookings (+ attachment files through the PowerSync attachments helper), crew profiles, messages (last N per crew), polls and votes, expenses and balances, fx_rates, phrase cards, briefing.
   - Streams are subscribed on demand, and **auto-subscribed for a trip starting 48 h before departure**. The "saved offline 84 MB" budget includes attachments and map packs; map packs are out of scope here.
2. **Outbox = PowerSync upload queue.** Commands go into `insertOnly` tables (`cmd_send_message`, `cmd_vote`, `cmd_add_expense`, `cmd_add_photo`, …). The `uploadData` connector calls the **idempotent RPCs** in order. The UI shows pending items under "SENDS WHEN YOU'RE BACK" with a clock, then ticks them off when acknowledged.
3. **Conflicts:** the server decides each command and returns typed rejections: `poll_closed`, `item_removed`, `not_member`, `quota_exceeded`. The client shows "couldn't send" with a fix (for example, the vote closed while you were offline). Plan edits, which aren't offline in the design, use per-field LWW plus version checks for drag reorder.
4. **Photos:** a separate background-transfer queue. The row is created only after the upload finishes.
5. **FX:** the daily table syncs to devices, so offline expenses use the latest local rate and store `fx_date`. The server keeps the stored rate; there's no silent re-pricing.
6. **Guide offline:** not designed. Show the cached briefing and phrase cards; queue questions as messages.
7. **SOS offline:** OS-level emergency calling. The SOS command is queued, and the owner decides whether to add an SMS fallback.

**Fallback without PowerSync:**
- An RPC `get_trip_pack(trip_id, since_version)` returns a JSON snapshot cached in local SQLite and refreshed nightly and on Wi-Fi.
- A hand-rolled outbox table uses the same RPCs.
- The same server contract applies, so switching later is cheap.

---

## 9. Auth and SMS OTP cost (users worldwide, founder in Vietnam)

**Per successful verification, 1 SMS** (Twilio Verify = $0.05 + Twilio SMS rate; Firebase Identity Platform = per-SMS price):

| Country | Twilio SMS | Twilio Verify total | Firebase/IdP per SMS |
|---|---|---|---|
| Vietnam | $0.2852 | ~$0.335 | $0.13 |
| Indonesia | $0.4414 | ~$0.491 | $0.35 |
| Malaysia | $0.3389 | ~$0.389 | $0.25 |
| Philippines | $0.241 | ~$0.291 | $0.16 |
| Singapore | $0.0591 | ~$0.109 | $0.05 |
| Thailand | $0.0305 | ~$0.081 | $0.01 |
| Japan | $0.080–0.089 | ~$0.13–0.14 | $0.03 |
| India | $0.0832 | ~$0.133 | $0.07 |
| US | $0.0083 | ~$0.058 | $0.01 |
| Germany / UK | n/a | n/a | $0.10 / $0.04 |

- **WhatsApp via Twilio Verify:** $0.05 plus the Meta authentication template fee ($0.0034 in the US). Meta's per-country rate card (effective 2026-07-01) was not machine-readable, so **VN and ID WhatsApp rates are unverified**.
- **Prelude:** €0.032 per verification plus pass-through carrier cost, with antifraud. Per-country prices were not verified.
- **Zalo ZNS** (Vietnam): about 200–300 VND per message from secondary sources. Low confidence.
- **Vietnam specifics:** alphanumeric sender IDs **and templates must be pre-registered**. Unregistered traffic has been **blocked since 2025-08-25**. Provisioning takes about 5 weeks and needs stamped company documents. The message must include the brand ("[Critterpass] Your code…").

**Recommendation:**
- Make Apple and Google the primary buttons (the design already does).
- Route phone OTP through the **Send SMS hook to a small router**: WhatsApp when available, then SMS through a per-country provider (Twilio Verify default; A/B test Prelude). Use a country allow-list, per-number and per-IP limits, App Attest / Play Integrity on `/otp/start`, and Verify Fraud Guard or Prelude antifraud against SMS pumping.
- Start VN brandname registration now.
- **Flip:** if phone becomes the primary sign-in in SEA, use **Firebase Auth as Supabase third-party auth** for its lower SEA per-SMS rates. It costs complexity: a JWT role claim via blocking functions, and third-party MAU billing.

---

## 10. Cost estimates (monthly; excludes LLM, maps/routing, flight data, TTS/OCR, store fees)

Assumptions:
- 1.3× auth users per MAU (anonymous passes that never convert).
- 1,000 Realtime msgs per MAU per month.
- 5% peak concurrency.
- 6 photos per MAU per month at 1.3 MB (client renditions); storage shown at month 12.
- 20% of MAU are new sign-ups per month, 30% of them by phone, 1.2 SMS per verification, SEA-weighted average SMS $0.15.

| Line | 1k MAU | 10k MAU | 100k MAU |
|---|---|---|---|
| Supabase Pro base | $25 | $25 | $25 |
| Compute (minus the $10 credit) | $0 (Micro) | ~$50 (Medium) | ~$200 (XL) |
| Auth MAU overage (130k) | $0 | $0 | ~$98 |
| Realtime messages / connections | $0 / $0 | ~$13 / $0 (at the 500 limit, so **turn the cap off**) | ~$238 / ~$45 |
| Storage (month 12: 94 GB / 936 GB / 9.4 TB) | $0 | ~$18 | ~$197 (R2: ~$140) |
| Egress | $0 | $0 | ~$70 |
| Edge Functions | $0 | $0 | ~$16 |
| **Supabase subtotal** | **~$25** | **~$105** | **~$890** (+$100 if PITR) |
| Worker (Railway) | ~$10 | ~$35 | ~$200 |
| PowerSync Cloud Pro | $49 | $49 | ~$340 |
| **Platform total** | **~$85** | **~$190** | **~$1.4–1.5k** |
| SMS OTP (Twilio Verify) | ~$14 | ~$138 | ~$1,380 |
| SMS OTP (Firebase rates, for comparison) | ~$9 | ~$86 | ~$864 |
| *Avoid:* Supabase image transforms on user photos | +$30 | +$300 | +$3,000 |

Order-of-magnitude comparisons at 100k MAU, platform only, low confidence:
- **Firebase:** about $1.3–1.8k. Firestore reads and writes about $600, Identity Platform about $275, storage and egress about $350, Functions about $100.
- **Convex:** about $1.3k. About 400M function calls ≈ $750 plus storage and egress about $430.
- **Custom:** about $0.6–0.9k in infrastructure plus the engineering time.
- **Conclusion:** platform choice changes cost by less than about $1k/mo at 100k MAU. Fit, security and velocity should decide, not price.

---

## 11. Vendor lock-in

| Component | Supabase-specific? | Exit path |
|---|---|---|
| Schema, RLS, SQL functions, pg_cron, pgvector | No (standard Postgres extensions) | `pg_dump` to any Postgres. Check pgmq availability on the target host (not verified) |
| Auth (GoTrue, Apache-2.0) | API-level | Self-host GoTrue, or migrate users (bcrypt hashes and identities are exportable) to Better Auth. Apple/Google subs are preserved; phone users simply re-verify |
| Realtime (`realtime.messages` policies, Broadcast) | Yes (protocol) | Replace with WS or Durable Objects. Topics and payloads are already our own design |
| Storage | S3-compatible | Copy to R2 or S3 and rewrite paths |
| Edge Functions (Deno) | Mild | Plain TypeScript handlers; move to Hono |
| PowerSync | Sync Streams DSL | Works with any Postgres. Self-host Open Edition. Fallback is the trip-pack RPC |

Overall lock-in: **low to medium.** For contrast: Convex is high (FSL self-host, but its API model), Firebase is very high, and InstantDB has already sunset.

---

## 12. Risks and mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Realtime policy cache means a removed member keeps receiving | M / H (location privacy) | Epoch in the topic, about 15 min JWT, location topic server-only, sharing windows checked in `post_location` |
| App and extension refresh-token race revokes the session | H / M | Scoped device action keys (§6.4) |
| Postgres Changes throughput or fan-out | M / M | Broadcast from DB triggers; no `postgres_changes` in production paths |
| Pro spend cap: 500 connections and 50 presence msgs/s | H at about 10k MAU / M | Turn the spend cap off at about 5k MAU; cursors on Broadcast; set budget alerts |
| Private data leaking via the service role or LLM context | M / H | `guide_reader` role without grants; aggregate-only functions; tests asserting private tables are absent from Sync Streams, the published snapshot and prompts |
| Two permission systems (RLS + Sync Streams) drift apart | M / H | A shared SQL predicate library; CI contract tests with fixture users (outsider, ex-member, organiser, member) |
| SMS pumping and cost blowouts | M / H | Allow-list, App Attest / Play Integrity, rate limits, provider fraud guard, daily spend alert |
| Vietnam SMS blocked without a registered brandname | H / M | Register now; WhatsApp or Zalo channel; Apple/Google first |
| Anonymous sign-in rate limit behind carrier CGNAT (30/h per IP) | M / M | Raise the limit; attestation on first launch; monitor 429s |
| Image-transformation bill | H if used / M | Client-side renditions |
| SQL deletes orphan storage files during purge | M / L | Purge through the Storage API in the worker |
| APNs Live Activity budget throttling | M / M | Priority 5 by default, 10 for threshold events; frequent-updates flag; broadcast channels |
| Live Activity 8 h cap on the flight-day and leave-by activities | M / L | Start near the event; hand off between activities |
| Single-region Supabase outage | L / H | Offline-first client; PITR; status page; the worker degrades gracefully |
| Gmail read-only import needs a restricted-scope annual CASA | H if chosen / M | v1 uses a forwarding address (inbound email to a webhook to the worker parser); OAuth later |
| Location-dwell spoofing for critters | M / M (fairness) | Plausibility checks (speed, accuracy, mock-location flag, attestation). Out of scope here |
| PowerSync vendor or pricing change | L / M | Open Edition self-host; trip-pack fallback on the same RPCs |

---

## 13. Decisions the product owner must make

1. **Offline depth.**
   - (A) Trip pack plus a 4-command outbox, hand-rolled: fewer moving parts, stale reads elsewhere.
   - (B) PowerSync local-first for all crew and trip data: offline everywhere, **recommended**, +$49–340/mo.
   - (C) Online-only v1 with a read-only cache (contradicts 3k-4).
2. **Phone OTP scope.**
   - (A) Apple/Google only at launch.
   - (B) Phone with WhatsApp first, then SMS, in allow-listed countries: **recommended**.
   - (C) SMS everywhere.
   - Also: who registers the VN brandname, and is a VN legal entity needed?
3. **Returning user on a new device.** Add "I already have a pass" on the splash, yes or no. Merge policy when an anonymous pass meets an existing account: union, keep existing, or ask.
4. **Budget privacy (3c-5).** Anonymous dots show every value, and "under all 6 maxes" reveals the minimum.
   - (A) Show exactly, as designed.
   - (B) Bucket to $50 or $100 and jitter the dots.
   - (C) Show only the band once k ≥ 3 have submitted.
5. **Location retention.** The recap route (3m-4, "214 km") needs a trail.
   - (A) Store a downsampled trail per trip with consent, deleted after N days.
   - (B) Derive the route from the itinerary and check-ins only (most private).
6. **Deletion grace (3n-10).** During the 30 days, do crews see the member as "former member" or unchanged? Disclose that backups hold data for 7 days after purge (Pro daily backups; PITR adds more).
7. **Primary region.** Singapore (best for SEA; about 150–250 ms from EU/US) or US/EU. Add read replicas later?
8. **Minimum iOS version** (shared with the mobile report). 17.2 gives push-to-start; 18 adds broadcast channels, which simplifies 5a-2.
9. **Guide streaming in group chat.** Stream to everyone present (about 360 msgs per MAU per month), or stream only to the asker while others get the final message (about 10× fewer messages).
10. **Email import.** A forwarding address in v1, or Gmail OAuth (Restricted scope, annual CASA).
11. **Photo originals.** Keep full-resolution originals (storage × 3–4) or only the 2048 px rendition.

---

## 14. Key claims

| Claim | Source | Checked | Confidence |
|---|---|---|---|
| Supabase Pro $25/mo; 100k MAU then $0.00325; 8 GB disk; 250 GB egress; 100 GB storage; 2M Edge Function invocations; Realtime 500 connections and 5M msgs; overage $10 per 1k and $2.50/M; image transforms $5 per 1k origin images; compute credit $10 | https://supabase.com/pricing | 2026-09-26 | High |
| Realtime limits: Pro 500 connections, 500 msg/s, 50 presence/s (cap on); 10,000 / 2,500 / 1,000 with cap off | https://supabase.com/docs/guides/realtime/limits | 2026-09-26 | High |
| Realtime messages billed per recipient (broadcast to 4 = 5 msgs) | https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages | 2026-09-26 | High |
| Realtime private-channel policies cached for the connection; refresh on join or new JWT | https://supabase.com/docs/guides/realtime/authorization | 2026-09-26 | High |
| Postgres Changes: one auth check per subscriber, single thread; use Broadcast above about 3k subscribers | https://supabase.com/docs/guides/realtime/postgres-changes | 2026-09-26 | High |
| Broadcast from DB (`realtime.send`), replay 25 msgs for 72 h–4 d on private channels, binary payloads | https://supabase.com/docs/guides/realtime/broadcast ; https://supabase.com/changelog/47796-developer-update-july-2026 | 2026-09-26 | High |
| Anonymous sign-ins: `is_anonymous` claim, `linkIdentity` / `updateUser`, 30 req/h per IP, no automatic cleanup | https://supabase.com/docs/guides/auth/auth-anonymous | 2026-09-26 | High |
| Anonymous users count as MAU on Supabase | https://github.com/orgs/supabase/discussions/35933 (via search) | 2026-09-26 | Medium |
| Manual identity linking is Beta and needs enabling; native ID-token linking | https://supabase.com/docs/guides/auth/auth-identity-linking | 2026-09-26 | High |
| Send SMS hook (HTTP or Postgres) replaces built-in SMS | https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook | 2026-09-26 | High |
| SMS providers; WhatsApp only via Twilio or Twilio Verify | https://supabase.com/docs/guides/auth/phone-login | 2026-09-26 | High |
| Refresh-token reuse interval 10 s; reuse outside it revokes the session | https://supabase.com/docs/guides/auth/sessions | 2026-09-26 | High |
| Edge Functions: 2 s CPU, 400 s wall clock (paid), 256 MB | https://supabase.com/docs/guides/functions/limits | 2026-09-26 | High |
| Supabase Cron: ≤8 concurrent jobs and ≤10 min each recommended; schedules down to seconds | https://supabase.com/docs/guides/cron | 2026-09-26 | High |
| Supabase Queues (pgmq) GA 2024-12-05 | https://supabase.com/blog/supabase-queues | 2026-09-26 | Medium-High |
| TUS resumable uploads, 6 MB chunks, 24 h URL | https://supabase.com/docs/guides/storage/uploads/resumable-uploads | 2026-09-26 | High |
| Image transforms: Pro+, max 2500 px output, 25 MB / 50 MP source | https://supabase.com/docs/guides/storage/serving/image-transformations | 2026-09-26 | High |
| Deleting storage objects via SQL orphans files | https://supabase.com/docs/guides/storage/management/delete-objects | 2026-09-26 | Medium-High |
| Compute sizes and prices (Micro $10 … 2XL $410) | https://supabase.com/docs/guides/platform/compute-and-disk | 2026-09-26 | High |
| Singapore region `ap-southeast-1` | https://supabase.com/docs/guides/platform/regions | 2026-09-26 | High |
| New projects need explicit grants for the Data API (default from 2026-05-30); passkeys beta (June 2026); $500M Series F | https://supabase.com/changelog/45702-developer-update-may-2026 ; https://supabase.com/changelog/46689-developer-update-june-2026 | 2026-09-26 | High |
| Firebase Auth usable as Supabase third-party auth (needs a role claim) | https://supabase.com/docs/guides/auth/third-party/firebase-auth | 2026-09-26 | High |
| InstantDB team joined OpenAI; signups closed; cloud shuts down 2027-08-31 | https://www.instantdb.com/essays/instant_team_joins_openai | 2026-09-26 | High |
| Convex Pro $25 per developer; 25M calls then $2/M; 50 GB storage and I/O $0.20/GB; egress $0.12/GB | https://www.convex.dev/pricing | 2026-09-26 | High |
| Convex actions up to 30 min (Node 10 min); 1M outstanding scheduled functions | https://docs.convex.dev/production/state/limits | 2026-09-26 | High |
| Convex Auth is beta | https://labs.convex.dev/auth | 2026-09-26 | High |
| Convex backend license FSL-1.1-Apache-2.0 | https://github.com/get-convex/convex-backend (LICENSE.md) | 2026-09-26 | High |
| Convex local sync (Curvilinear) archived 2026-09-24; PowerSync–Convex alpha | https://github.com/get-convex/curvilinear/issues/6 (via search) ; https://docs.powersync.com/resources/supported-platforms | 2026-09-26 | Medium |
| Firestore rules can't restrict fields on read; split documents | https://firebase.google.com/docs/firestore/security/rules-fields | 2026-09-26 | High |
| Firestore Standard: $0.03 / $0.09 / $0.01 per 100k reads/writes/deletes (first-listed location); listener re-query billing after 30 min offline | https://cloud.google.com/firestore/pricing | 2026-09-26 | Medium (region-specific rates not isolated) |
| Identity Platform MAU tiers; anonymous excluded with auto-cleanup; per-SMS prices by country (VN $0.13, ID $0.35, SG $0.05, US $0.01) | https://cloud.google.com/identity-platform/pricing | 2026-09-26 | High |
| Firebase anonymous `link(with:)`; auto-delete after 30 days with Identity Platform | https://firebase.google.com/docs/auth/ios/anonymous-auth | 2026-09-26 | High |
| FCM supports Live Activity start, update and end (iOS 17.2 for start) | https://firebase.google.com/docs/cloud-messaging/customize-messages/live-activity | 2026-09-26 (page updated 2026-09-24) | High |
| Firebase SQL Connect is the renamed Data Connect | https://firebase.google.com/docs/data-connect | 2026-09-26 | Medium |
| Firebase Dynamic Links shut down 2025-08-25 | https://firebase.google.com/support/dynamic-links-faq | 2026-09-26 | High |
| APNs Live Activity: hourly budget; priority 5 doesn't count; frequent-updates Info.plist key; 8 h active, 12 h on lock screen; broadcast channels; push-to-start | https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications ; https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities | 2026-09-26 | High |
| Twilio Verify $0.05 per successful verification plus channel fee | https://www.twilio.com/en-us/verify/pricing | 2026-09-26 | High |
| Twilio SMS: VN $0.2852, ID $0.4414, MY $0.3389, PH $0.241, SG $0.0591, TH $0.0305, JP $0.08–0.089, IN $0.0832, US $0.0083 | https://www.twilio.com/en-us/sms/pricing/{vn,id,my,ph,sg,th,jp,in,us} | 2026-09-26 | High |
| Vietnam: pre-registered sender IDs and templates; unregistered traffic blocked from 2025-08-25; about 5 weeks | https://www.twilio.com/en-us/guidelines/vn/sms | 2026-09-26 | High |
| Prelude €0.032 per verification plus carrier cost | https://prelude.so/pricing | 2026-09-26 | Medium |
| WhatsApp rate cards effective 2026-07-01 (per-country values not extracted) | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing | 2026-09-26 | Low for values |
| PowerSync Cloud: Free / Pro $49 (30 GB synced, 1k peak clients, $30 per 1k) / Team $599; Open Edition self-host | https://www.powersync.com/pricing | 2026-09-26 | High |
| PowerSync SDKs GA (RN, Flutter, Swift, Kotlin, JS, .NET, Node); Convex alpha | https://docs.powersync.com/resources/supported-platforms | 2026-09-26 | High |
| PowerSync: Sync Rules replaced by Sync Streams; new Cloud instances can't use Sync Rules after 2027-03-15; RN 2.3.0 on 2026-09-21 | https://releases.powersync.com/ | 2026-09-26 | High |
| PowerSync writes via supabase-js (RLS applies); Sync Streams govern reads | https://docs.powersync.com/integrations/supabase/guide | 2026-09-26 | High |
| PowerSync conflict model: backend decides; default per-field LWW; op-id dedupe | https://docs.powersync.com/handling-writes/handling-update-conflicts | 2026-09-26 | High |
| Zero 1.0 on 2026-03-24; "Zero does not support offline writes" | npm `@rocicorp/zero` time ; https://zero.rocicorp.dev/docs/offline | 2026-09-26 | High |
| Electric: TS and Elixir clients only; offline writes need your own layer; Cloud $1 per M writes | https://electric.ax/docs/api/clients/typescript ; https://electric.ax/docs/guides/writes ; https://electric.ax/pricing | 2026-09-26 | High |
| Legend-State stable 2.1.15 (2024-08-30); v3 beta.48 (2026-07-12) | npm `@legendapp/state` | 2026-09-26 | High |
| WatermelonDB 0.28.0 (2025-04-07); 304 open issues | npm and GitHub API | 2026-09-26 | High |
| Triplit joined Supabase 2025-10-08; client last published 2025-07-31 | https://supabase.com/blog/triplit-joins-supabase ; npm | 2026-09-26 | High |
| Replicache in maintenance mode; migrate to Zero | https://replicache.dev/ | 2026-09-26 | High |
| Ably: Standard $29 + $2.50/M msgs; $1 per M connection-minutes | https://ably.com/pricing | 2026-09-26 | High |
| Liveblocks Pro $30; 10 connections per room | https://liveblocks.io/pricing | 2026-09-26 | High |
| Durable Objects: $0.15/M requests, WebSocket 20:1, SQLite billing from Jan 2026 | https://developers.cloudflare.com/durable-objects/platform/pricing/ | 2026-09-26 | High |
| R2: $0.015/GB-month, free egress | https://developers.cloudflare.com/r2/pricing/ | 2026-09-26 | High |
| Railway Pro $20 incl. $20 usage; about $20/vCPU and $10/GB-month; egress $0.05/GB; Singapore region | https://railway.com/pricing ; https://docs.railway.com/reference/deployment-regions | 2026-09-26 | High |
| Trigger.dev: no run timeouts; Hobby $10, Pro $50; realtime streams | https://trigger.dev/pricing | 2026-09-26 | High |
| Frankfurter free, no quotas, 166 currencies incl. VND/IDR/PEN/ISK (live call) | https://frankfurter.dev/ ; https://api.frankfurter.dev/v2/currencies | 2026-09-26 | High |
| `gmail.readonly` is Restricted; restricted scopes need an annual security assessment | https://developers.google.com/workspace/gmail/api/auth/scopes ; https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification | 2026-09-26 | High |
| Better Auth anonymous plugin `onLinkAccount`; v1.7.6 | https://www.better-auth.com/docs/plugins/anonymous ; npm | 2026-09-26 | High |

---

## 15. Unresolved questions

1. Are Supabase anonymous users definitely billed as MAU? Only a GitHub discussion confirms it; ask Supabase support.
2. APNs broadcast channel limits (channels per app, management API quotas) and whether push-to-start can reliably attach a channel on iOS 18.x. Needs an Apple docs deep-dive or a spike.
3. Can a Supabase anonymous sign-in be gated with App Attest or Play Integrity natively, instead of a web CAPTCHA? Not found; likely needs a custom pre-check Edge Function.
4. Per-country WhatsApp authentication rates (VN, ID, MY, PH) and Prelude per-country prices. Rate cards weren't machine-readable.
5. Does VN brandname registration need a Vietnamese legal entity or local representative? Twilio says "stamped company documents"; confirm with the provider.
6. Actual PowerSync replication latency for chat on Supabase (target under 1 s). Benchmark in the spike. If it's slow, chat stays on Broadcast plus DB writes and PowerSync is used for offline history only.
7. Is pgmq available on non-Supabase Postgres hosts (Neon, RDS) for the exit path?
8. Firestore Singapore pricing and the non–Identity Platform Auth MAU policy (only relevant to the Firebase flip).
9. Mobile framework choice (another report) affects the SDK path: PowerSync and Supabase are GA on all four platforms, but widget and extension data sharing (App Group SQLite vs JSON snapshot) depends on it.
10. Should the ETA loop's routing API calls be priced? That is covered in the maps report, but at 1/min × meetups it may dominate on-trip cost.
