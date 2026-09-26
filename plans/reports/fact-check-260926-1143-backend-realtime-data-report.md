# Fact-check: backend, realtime, auth, offline-sync report

**Target:** `plans/reports/researcher-260926-1143-backend-realtime-data-report.md`
**Checked:** 2026-09-26. Evidence types:
- primary docs, via WebFetch;
- the npm registry and GitHub REST API, via curl;
- a live call to the Frankfurter API;
- Apple DocC JSON, via curl.

The web-search budget ran out part way through, so the remaining checks used direct fetches only.

**Verdict:** the recommendation holds. It is Supabase Pro (Singapore) + a TypeScript worker on Railway + PowerSync Cloud, with idempotent command RPCs.
- No load-bearing claim was refuted.
- Corrections are minor: one date, one release label, a client-support caveat, and one cost assumption.
- The significant gaps are **omissions**: SMS rate limits, Apple/Google account-deletion duties, the APNs channel cap, and Vietnam data law.

Tally: 30 claim groups checked. 25 confirmed, 1 refuted (the date only), 4 uncertain.

## Claims table

| # | Claim (report §) | Verdict | Correction / note | Source |
|---|---|---|---|---|
| 1 | InstantDB team joined OpenAI; signups closed; cloud shuts down 2027-08-31; backups kept to 2028-08-31 (§0, §4.5) | confirmed | Elimination valid | instantdb.com/essays/instant_team_joins_openai |
| 2 | InstantDB announcement dated 2026-08-22 (§4.5) | **refuted** (minor) | The post metadata says `"date":"2026-08-19"`. It does not affect the conclusion | Same page (HTML post JSON) |
| 3 | Zero: "Zero does not support offline writes", so it fails 3k-4. 1.9.0 released 2026-08-14 (§5) | confirmed | Offline writes are rejected with an offline error. The docs say "not a priority right now". npm latest is 1.9.0 (2026-08-14); canary is 1.11 | zero.rocicorp.dev/docs/offline; npm `@rocicorp/zero` |
| 4 | Supabase Pro pricing (§4.1). Base: $25, $10 compute credit. Auth: 100k MAU (and 100k third-party MAU), then $0.00325. Disk 8 GB/$0.125. Egress 250 GB/$0.09 (cached $0.03). Storage 100 GB/$0.0213. Edge Function invocations 2M/$2 per M. Realtime 500 connections/$10 per 1k and 5M msgs/$2.50 per M. PITR $100 per 7 d | confirmed | All values match | supabase.com/pricing |
| 5 | Realtime limits (§4.1). Pro with cap: 500 connections / 500 msg/s / 50 presence/s. Cap off or Team: 10k / 2,500 / 1,000. 100 channels per connection; 3 MB payload | confirmed | Also: channel joins are limited to 500/s (Pro with cap) and 2,500/s (cap off) | supabase.com/docs/guides/realtime/limits |
| 6 | Realtime messages are billed per recipient (1 broadcast to 4 listeners = 5) (§4.1) | confirmed | DB changes: 1 message per listening client | …/manage-your-usage/realtime-messages |
| 7 | Private-channel RLS is cached per connection and refreshes on join or a new JWT (§0, §7) | confirmed | Also: "If a new JWT is never received … the client will be disconnected when the JWT expires." This matters for backgrounded clients | …/realtime/authorization |
| 8 | Postgres Changes runs on a single thread with one auth check per subscriber. Use Broadcast above about 3k subscribers (§4.1) | confirmed | Quote: "larger compute add-ons don't meaningfully increase … throughput" | …/realtime/postgres-changes |
| 9 | Broadcast from DB (`realtime.send`, `broadcast_changes`). Replay: 25 msgs, 72 h to 4 d, private channels only (§4.1, §7) | confirmed | Only messages published by DB broadcast are replayable | …/realtime/broadcast |
| 10 | Binary broadcast payloads since July 2026 (§4.1, §7 `pos` binary) | confirmed, with a caveat | Requires supabase-js ≥ 2.91.0 or supabase-swift ≥ 2.44.0. **Dart, Kotlin and Python clients do not support it; older clients silently drop the messages.** If the app is Flutter or Kotlin, `pos` must use JSON | …/realtime/broadcast; changelog 47796 (July 2026) |
| 11 | Anonymous sign-in (§4.1): `is_anonymous` claim; `linkIdentity` or `updateUser` to convert; 30 req/h per IP (configurable); no automatic cleanup; CAPTCHA recommended | confirmed | Docs show a manual SQL cleanup for users older than 30 d | …/auth/auth-anonymous; …/auth/rate-limits |
| 12 | Anonymous users count as Supabase MAU (§4.1, §10 1.3× factor) | **uncertain** | The official MAU page is silent. It defines MAU as "distinct users who sign in or refresh their token", which implies anonymous users count. The only explicit source is a community discussion (#35933). The 1.3× factor is a reasonable conservative assumption. Confirm with support | …/manage-your-usage/monthly-active-users; github.com/orgs/supabase/discussions/35933 |
| 13 | Manual identity linking is Beta and gated by `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED`. `linkIdentity` accepts native ID tokens (§4.1, §6.3) | confirmed | Still labelled "(beta)", a risk for the core 3a-7 flow; keep the merge-ticket fallback | …/auth/auth-identity-linking |
| 14 | Send SMS hook (HTTP or Postgres) replaces the built-in provider and allows regional providers, WhatsApp and failover. WhatsApp is only via Twilio or Twilio Verify (§4.1, §9) | confirmed | The hook page lists no plan restriction | …/auth/auth-hooks/send-sms-hook; …/auth/phone-login |
| 15 | Refresh-token reuse interval is 10 s; reuse outside it revokes the whole session. Keep JWT expiry ≥ 5 min (§0, §6.4, §7) | confirmed | Quote: "the whole session is regarded as terminated and all refresh tokens … revoked". So the action-key design for extensions is justified | …/auth/sessions |
| 16 | Edge Functions: 256 MB, 2 s CPU, 400 s wall clock (paid; 150 s free), 150 s idle timeout (§4.1) | confirmed | Offloading long AI jobs and the ETA loop to the worker is justified | …/functions/limits |
| 17 | Supabase Cron: ≤ 8 concurrent jobs, ≤ 10 min each, schedules from every second (§4.1) | confirmed | — | …/guides/cron |
| 18 | Queues (pgmq) GA since 2024-12-05; guaranteed delivery; exactly-once within the visibility window (§4.1) | **uncertain** (GA label only) | The date and guarantees are confirmed. Neither the blog ("Today we're releasing…") nor the docs say GA/beta/alpha | supabase.com/blog/supabase-queues; …/guides/queues |
| 19 | Image transforms: Pro and above; $5 per 1k origin images after 100; max 2500 px; 25 MB / 50 MP source. So user photos would cost about $3k/mo at 100k MAU (§4.1, §6.7) | confirmed | The count resets each billing cycle, so older album photos viewed again are billed again. $3k is a **floor**. Client-side renditions are the right choice | …/storage/serving/image-transformations; pricing |
| 20 | Compute: Micro $10, Small $15 (2 GB), Medium $60 (4 GB), Large $110 (2 dedicated vCPU, 8 GB), XL $210 (4 vCPU, 16 GB), 2XL $410 (§4.1) | confirmed | — | …/platform/compute-and-disk |
| 21 | New projects need explicit grants to expose tables through the Data API, default from 2026-05-30 (§4.1) | confirmed | Opt-in from Apr 28. Existing projects are not affected | changelog 45702 (May 2026) |
| 22 | Passkeys beta (June 2026); $500M Series F (§4.1) | confirmed | $10B pre-money valuation, led by GIC | changelog 46689 (June 2026) |
| 23 | Region `ap-southeast-1` Singapore; also Tokyo, Seoul, Mumbai, Sydney (§4.1) | confirmed | — | …/platform/regions |
| 24 | SDK health: supabase-js 2.117.2 (2026-09-25), realtime v2.138.1 (2026-09-23), supabase-swift 2.55.2 (2026-09-09) (§4.1) | confirmed | — | npm; GitHub releases API |
| 25 | PowerSync Cloud Pro pricing (§5, §10): $49; 30 GB synced then $1/GB; 1k peak clients then $30 per 1k. Team $599. Open Edition self-host | confirmed | **Omitted by the report:** 10 GB hosted, then $1/GB. The Pro price is "from $49" | powersync.com/pricing |
| 26 | PowerSync SDKs all GA: RN, Flutter, Swift, Kotlin, JS, .NET, Node. PowerSync–Convex connector is alpha (§5, §3) | confirmed (mobile) | The platform page says GA for all. The 2026-09-15 release note still tags **.NET v0.1.5 "(Beta)"**. Kotlin JS/Wasm targets are experimental. Irrelevant for mobile | docs.powersync.com/resources/supported-platforms; releases.powersync.com |
| 27 | Sync Rules are being replaced by Sync Streams. New Cloud instances are Streams-only from 2027-03-15. RN SDK 2.3.0 (2026-09-21), Swift 1.16.2 (2026-09-16) (§5) | confirmed | Notice dated 2026-09-23. **Full Sync Rules sunset 2027-12-15.** Build on Streams from day 1. Per-user limits: 1,000 buckets and 1,000 parameter-query rows (defaults) | releases.powersync.com; docs …/sync/streams/bucket-count; npm; GitHub |
| 28 | PowerSync + Supabase and conflict model (§5, §8). Replication via WAL; auth via JWKS; writes go through supabase-js, so RLS applies. Sync Streams (not RLS) govern reads: "Grants and RLS do different jobs, and you need both". Conflicts: backend-authoritative, per-field LWW, deletes win, per-client op id, ordered upload queue | confirmed | The two-permission-layer risk is real, so the CI contract tests are warranted | docs …/integrations/supabase/guide; …/handling-writes/handling-update-conflicts |
| 29 | Convex (§3, §4.2) | confirmed | Details below this table (too long for a row) | github.com/get-convex/curvilinear (API); convex-swift and convex-mobile releases; labs.convex.dev/auth; docs.convex.dev limits; convex.dev/pricing |
| 30 | Other local-first libraries (§5) | confirmed | Details below this table. None of these corrections changes the report's verdicts | npm (`@legendapp/state`, `@nozbe/watermelondb`, `@triplit/client`, `@electric-sql/client`); GitHub API; replicache.dev; supabase.com/blog/triplit-joins-supabase; electric.ax/docs/guides/writes |

**Row 29, Convex.** Every item checked out:
- Curvilinear is archived. The GitHub API shows `archived:true`, updated 2026-09-24.
- Swift client 0.8.1 and Kotlin client 0.8.0 are pre-1.0.
- Convex Auth is labelled "in beta".
- Actions run up to 30 min on the Convex runtime and 10 min on Node; up to 1M scheduled functions can be outstanding.
- Pro pricing: $25 per developer; 25M function calls, then $2/M; 50 GB DB, then $0.20/GB; 50 GB egress, then $0.12/GB. Business tier has a $2,500 minimum.

**Row 30, other local-first libraries.**
- **Legend-State:** v3 is still beta (3.0.0-beta.48, 2026-07-12); the latest stable is 2.1.15 (2024-08-30).
- **WatermelonDB:** latest release is 0.28.0 (2025-04-07) and there are 304 open issues. Nuances:
  - A 0.28.1-0 prerelease came out 2025-07-24.
  - The repo was still being pushed to on 2026-09-16.
  - GitHub's open-issue count includes PRs.
  - So the right label is "slow", not "dead".
- **Triplit:** joined Supabase 2025-10-08 with no product integration. The client was last published 2025-07-31.
- **Replicache:** in maintenance mode ("migrate to Zero").
- **Electric:** read-path only. Official clients are TypeScript and Elixir. Latest `@electric-sql/client` is 1.5.28 (2026-09-09).

### Push, Firebase, SMS, infrastructure

| # | Claim | Verdict | Correction / note | Source |
|---|---|---|---|---|
| P1 | APNs Live Activities (§6.5, §6.6): priority 5 doesn't count toward the hourly budget; `NSSupportsLiveActivitiesFrequentUpdates`; 8 h active and 12 h max on the lock screen; push-to-start; broadcast channels on iOS 18; token-based connection | confirmed | Apple: "send a low-priority ActivityKit push notification that doesn't count toward the budget by setting … apns-priority to 5". **Resolves part of unresolved Q2 (the rest is below this table)** | developer.apple.com ActivityKit docs (DocC JSON); …/usernotifications/sending-channel-management-requests-to-apns; …/sending-broadcast-push-notification-requests-to-apns |
| P2 | FCM supports Live Activity start, update and end (start on 17.2+); no mention of broadcast channels; page updated 2026-09-24 (§4.3, §6.6) | confirmed | Needs iOS 16.1 for Live Activities. Going direct to APNs for channels is justified | firebase.google.com/docs/cloud-messaging/customize-messages/live-activity |
| P3 | Firebase Dynamic Links shut down 2025-08-25 (§1) | confirmed | Links return 404 | firebase.google.com/support/dynamic-links-faq |
| P4 | Firestore rules can't restrict reads per field; split the documents (§3, §4.3) | confirmed | "impossible using security rules alone…" | firebase.google.com/docs/firestore/security/rules-fields |
| P5 | Identity Platform (§4.3, §9). MAU: 0–50k free, $0.0055 to 100k, $0.0046 to 1M. Anonymous users are excluded if auto-cleanup is on. Per SMS: VN $0.13, ID $0.35, MY $0.25, PH $0.16, SG $0.05, TH $0.01, JP $0.03, IN $0.07, US $0.01, DE $0.10, UK $0.04. First 10 SMS/day free | confirmed | All values match | cloud.google.com/identity-platform/pricing |
| P6 | Firebase Auth works as Supabase third-party auth; needs a `role: authenticated` claim via blocking functions (§4.3, §9) | confirmed | Blocking functions need the Identity Platform upgrade. The alternative is `onCreate` plus a forced token refresh, because the first token lacks the claim | supabase.com/docs/guides/auth/third-party/firebase-auth |
| P7 | Twilio Verify costs $0.05 per successful verification plus channel fees (§9) | confirmed | — | twilio.com/en-us/verify/pricing |
| P8 | Twilio SMS prices: VN $0.2852, ID $0.4414, MY $0.3389, PH $0.241, SG $0.0591, TH $0.0305, JP $0.080–0.089, IN $0.0832, US $0.0083 (§9) | confirmed | Every value appears on the country pages | twilio.com/en-us/sms/pricing/{cc} |
| P9 | Vietnam: sender IDs **and templates** must be pre-registered; unregistered traffic fully blocked from 2025-08-25; about 5 weeks (§0, §9) | confirmed | The document Twilio asks for is a "colored copy of business registration certificate", plus proof of brand rights if the brand isn't yours. "Stamped docs" is imprecise. Numeric senders are overwritten and delivered best-effort | twilio.com/en-us/guidelines/vn/sms |
| P10 | `gmail.readonly` is Restricted and needs an annual assessment (§0, §12) | confirmed | Nuance: the assessment applies "if you store restricted scope data on servers (or transmit)". The forwarding-address v1 approach stands | developers.google.com/workspace/gmail/api/auth/scopes |
| P11 | Railway (§4.4, §10): Pro is $20 per workspace including $20 of usage; about $20/vCPU and $10/GB-month; egress $0.05/GB; Singapore region | confirmed | Region id `asia-southeast1-eqsg3a` ("Southeast Asia Metal"). Volume storage is $0.15/GB | railway.com/pricing; docs.railway.com/reference/deployment-regions |
| P12 | Cloudflare (§4.4, §6.7): Durable Objects $0.15/M requests, WebSocket messages billed 20:1, SQLite billing from Jan 2026, hibernation not billed. R2 $0.015/GB-month with free egress | confirmed | Durable Objects duration is $12.50 per M GB-s. R2 operations: Class A $4.50/M, Class B $0.36/M | developers.cloudflare.com DO and R2 pricing |
| P13 | Frankfurter is free with no quotas, and v2 has 166 currencies including VND, IDR, PEN and ISK (§6.1) | confirmed | Live `/v2/currencies` returned 166, including VND, IDR, PEN, ISK, JPY and MXN. The service is rate-limited against abuse. It draws on 98 central banks | api.frankfurter.dev/v2/currencies (live); frankfurter.dev |
| P14 | Secondary options (§4.4, §4.6, §6.5): Better Auth 1.7.6; Trigger.dev has no timeouts ($10 / $50); Ably Standard $29 + $2.50/M + $1/M connection-minutes, 10k connections | confirmed | Better Auth 1.7.6 was published 2026-09-24 | npm; trigger.dev/pricing; ably.com/pricing |

**Row P1, APNs broadcast channels.** New facts that resolve part of unresolved Q2:
- An app can keep **at most 10,000 channels per environment**.
- Delete channels after each event.
- The storage policy is fixed when the channel is created. "No Message Stored" gives a higher publishing budget. "Most Recent Message" is kept for at most 8 h.
- The broadcast payload is limited to 5 KB.

### Derived numbers (the report's own arithmetic, checked against the confirmed prices)

| # | Claim | Verdict | Note |
|---|---|---|---|
| D1 | Realtime overage at 100k MAU: about $238 in messages and $45 in connections. Auth overage about $98 | confirmed (arithmetic) | Messages: 95M × $2.50/M = $237.50. Connections: 4.5k × $10 = $45. Auth: 30k × $0.00325 = $97.50 |
| D2 | SMS cost, based on a "SEA-weighted avg $0.15/SMS": about $1,380/mo at 100k MAU (Twilio) | **uncertain; likely understated** | The report's own Twilio table shows VN $0.285, ID $0.441, MY $0.339 and PH $0.241. A SEA-heavy blend of $0.20–0.30 gives about $1.7–2.5k/mo at 100k MAU. The report's conclusion ("SMS is the largest backend line item") becomes stronger |
| D3 | Egress at 100k MAU is about $70/mo | **uncertain; likely understated** | New photos come to about 780 GB/mo. If about 5 crewmates each fetch the 1.2 MB rendition, egress is about 3.9 TB/mo, or roughly $110 (cached) to $330 (uncached). PowerSync WAL/initial sync reads may also count as egress. It does not change the ranking |

## Omissions (missed options or constraints)

1. **Supabase Auth SMS limit is project-wide: 30 SMS/hour by default.** Also 30 sign-in/OTP requests per 5 min per IP, and 30 verify requests per 5 min per IP.
   - The limit must be raised before launch.
   - The docs don't say whether it still applies when the Send SMS hook is used.
   - The report only mentions the anonymous 30/h per-IP limit.
   - Source: supabase.com/docs/guides/auth/rate-limits
2. **Apple account-deletion rule: revoke Sign in with Apple tokens through the REST API when an account is deleted.**
   - This requires capturing the Apple `authorizationCode` or refresh token at sign-in. The Supabase native ID-token flow does not keep it.
   - Delayed deletion (the 30-day undo) is allowed if the timeframe is disclosed and completion is confirmed.
   - Missing from §6.3 and §13.6.
   - Source: developer.apple.com/support/offering-account-deletion-in-your-app
3. **Google Play requires a web page for account-deletion requests**, in addition to the in-app path.
   - It has to be built on the marketing site plus a backend endpoint.
   - Retention disclosures are required.
   - Source: support.google.com/googleplay/android-developer/answer/13327111
4. **APNs channel cap: 10,000 per environment.**
   - The per-crew-event channel design must delete channels when events end. Long-lived per-crew channels would hit the cap at about 10k crews.
   - Pick the storage policy per activity type.
   - This resolves unresolved Q2 (limits); the push-to-start reliability spike is still needed.
5. **Vietnam data law.** Law 91/2025/QH15 on personal data protection has been in force since 2026-01-01, with Decree 356/2025.
   - If the controller is a Vietnam entity, cross-border transfer to Singapore needs a **Transfer Impact Assessment filed with A05/MPS within 60 days**.
   - Decree 147 localisation may apply to "domestic social networks", which could include group chat.
   - This affects the choice of region and legal entity. It needs legal review; not verified against the statute text.
   - Source: DLA Piper Data Protection Laws of the World (VN)
6. **The Supabase Before User Created hook can reject sign-ups by IP or metadata**, and the user object has `is_anonymous`.
   - This partly answers unresolved Q3: an App Attest or Play Integrity pre-check can gate anonymous sign-ups server-side, without a web CAPTCHA.
   - Whether the hook fires for anonymous sign-ups is not stated explicitly, so a spike is needed.
7. **Binary broadcast is not supported in Dart or Kotlin.** This couples the location-payload format to the mobile-framework decision.
8. **PowerSync: hosted-data overage and per-user limits.**
   - Hosted data: 10 GB included, then $1/GB.
   - Per-user limits: 1,000 buckets and 1,000 parameter-query rows by default. Users with many crews or trips are fine, but it should be asserted in CI.
   - Sync Rules are fully sunset on 2027-12-15.
9. **Realtime disconnects clients whose JWT expires without a refresh.**
   - Combined with the 10 s refresh-token reuse window, the app process must own the refresh.
   - Reconnect and catch-up must be designed around this. It is already partly covered by the `since=seq` design.
10. **The deep-link replacement is not named** (§1 says only "a different provider"). Options:
    - Branch, Adjust or AppsFlyer;
    - self-hosted universal links, plus the Play Install Referrer on Android;
    - on iOS, the paste-board or App Clip.

    Apple restricts fingerprinting, so on iOS the 6-char code fallback is load-bearing.

## Does the recommendation still hold?

**Yes.** Every elimination rationale was confirmed:
- InstantDB is shutting down.
- Zero has no offline writes.
- Convex has no first-party offline, Convex Auth is beta, and its native clients are pre-1.0.
- Replicache is in maintenance, Triplit is stale, and Legend-State v3 is still beta.

Every Supabase and PowerSync capability or limit the design relies on was confirmed from primary docs:
- RLS caching, the Postgres Changes limits and the refresh-token reuse window;
- the Edge Function limits, Cron guidance, grants default and pricing;
- PowerSync GA mobile SDKs, the Sync Streams roadmap and the conflict model.

The corrections are additive. Add these to the plan:
1. Raise the Auth SMS limit.
2. Apple token revocation and the Play web deletion page.
3. APNs channel lifecycle.
4. JSON location payloads if the client is Flutter or Kotlin.
5. A Vietnam PDPL review before fixing the region or entity.
6. SMS and egress budgets about 1.5–2× the report's figures.

## Unresolved questions

1. Do Supabase anonymous users count as MAU? The official docs are silent; ask support.
2. Is Supabase Queues formally GA? No label was found.
3. Does the Supabase Auth 30 SMS/h project limit still apply with the Send SMS hook? What is the maximum configurable value?
4. Does the Before User Created hook fire on `signInAnonymously()`?
5. Vietnam PDPL: is Critterpass's controller a Vietnam entity? Is a TIA filing needed for Singapore hosting? Does Decree 147 localisation apply to group chat?
6. How reliable is iOS 18 push-to-start with a channel id? Is the channel budget enough for a 1-minute ETA cadence at priority 5? Needs a spike.
7. Actual SEA country mix for phone sign-ups. It drives the SMS budget; the $0.15 average looks low.
8. Does PowerSync replication and initial sync count toward Supabase egress?
