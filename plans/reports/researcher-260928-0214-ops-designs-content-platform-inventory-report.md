# Ops console designs: content and platform screens, mapped to the plan

Date 2026-09-28 · Source: Claude Design project `1339f371…` (`Ops - {Catalogue, Content Batches, Community, Flags, Partners, Services}.dc.html`, `Ops - Nav.dc.html`) · Code read at `origin/main` 1c360f9d · Read-only research.

Conventions: **NEW** = not in any phase file or doc. **SHIPPED** = on main (P17 T1–T4). Cited docs: `data-model.md` (DM), `api-contracts.md` (AC), phase files (P17 etc.).

## 0. Cross-cutting findings

| # | Finding | Evidence | Impact |
|---|---|---|---|
| X1 | The design's nav has areas `content`, `community` and `services`. `ADMIN_AREAS` in `packages/domain/src/admin/policy.ts` has none of them | policy.ts: home, catalogue, flags, partners, moderation, support, desk, jobs, feedback, audit | P17 (owns `packages/domain/src/admin/**`) must add the areas with their roles: content→content, community→ops+content, services→ops |
| X2 | Role map from the Nav `R` table: catalogue=content, content=content, community=`ops content`, flags=ops, partners=ops, services=ops. The owner sees every area | Ops - Nav script | Matches shipped policy except the community area, which the design gives to 2 roles |
| X3 | **The design uses stale AI vendors.** Services shows "CLAUDE · BY MODEL TIER" with haiku-4-5, sonnet-5 and opus-5-5. Content Batches shows "sonnet-5 via Batch API". D22 (2026-09-28) replaces these with a DeepSeek fast tier and a pro tier (plus `jev` for decisions) and drops the Batches API | product-decisions D22; P13 T13 | Build the tier rows from `aiTierSchema`/routing, not from the design labels. Log the change in undesigned-states or a design note |
| X4 | Nav badges (content 2, community 3, services 1 warn, jobs 7) need counters for each area | Nav `it(...,count,tone)` | `defineAdminModule.homeCounters` exists in `apps/admin/src/kit/registry.ts`. Nav badges are **NEW** (badge = counter + tone) |
| X5 | One design screen (Community & drivers) spans 3 phase modules: P52 `modules/community/`, P55 `modules/drivers/`, P56 `modules/driver-directory/` | phase owns lists | **GAP**: no phase owns the tabbed screen that hosts all three |
| X6 | Kill switches move from Flags to Services ("Kill switches … live on Services & spend") | Flags footer | `ConfigKeyDefinition` needs a `group`/surface attribute so the Flags read can exclude them (**NEW**) |

---

## 1. Catalogue (`Ops - Catalogue`): SHIPPED (P17 T4); deltas only

**Purpose/layout:** Tabs GUIDES 6 / DESTINATIONS 61 / POIS 1,842 (with counts) → a searchable list on the left and a 480 px editor on the right. The editor has a colour-locked header band (C5), Name, Voice id, Persona pack version, a Local words list (+ Add a word), a "Changes to save · N" diff, and a footer "version 12 · Linh · today 14:40" + SAVE CHANGES.

| Data in design | Source | Status on main |
|---|---|---|
| name, colour (locked), voice_id, persona_pack_version, local_words | `guides` (DM §3.13 row `guides`) | shipped (`guideEditSchema`, `locked: slug, colour`) |
| tab counts (6 / 61 / 1,842) | count per kind | **NEW**: the list read returns no total |
| guide row: critter art, "city · species" | `destinations.guide_id` → city; species from persona pack (P13) or slug map | **NEW**: the row has only Name/Colour/Voice columns |
| row "VOICE · PERSONA" shows voice + pack | same columns | shipped data; the list column is missing (UI) |
| integer version "v12" + last editor + time | no `guides.version int`/`updated_by`; the version is a microsecond `updated_at` token | **NEW**: take the editor from `ops.admin_audit` (target_kind=`guides`, target_id) and the count from audit rows, or add `version int` + `updated_by` |
| local words as ordered pairs, "shown and spoken in Indonesian" | `local_words jsonb` record; the language is not stored | **NEW**: the destination/guide language is missing (DM `destinations` has no `languages`; P18 destination index adds languages) |
| diff "local_words 3 words → + enak" | kit `diffValues` | UI refinement: per-key record diff |

| Action | Command | Status |
|---|---|---|
| SAVE CHANGES | `upsert_catalogue_item {kind,id,version,data}` | shipped (VERSION_CONFLICT → diff) |
| + Add a word | same command | shipped (record field); list editor UI is new |
| search guides by name | `GET /v1/admin/catalogue/{kind}?q=` | shipped |

**Gaps/deltas:** (a) counts endpoint; (b) integer version + last editor on guides; (c) guide city/species in the list; (d) local-word language label; (e) optional: check that `persona_pack_version` exists in `persona_packs` (P13 table). This check is not in any phase.
**Early API (all pure server, P17-owned):** `GET /v1/admin/catalogue/counts`; last-editor join via audit; persona-pack existence validation. **Blocked:** none.
**Roles:** content (matches `ADMIN_AREA_ROLES.catalogue`).

---

## 2. Flags & config (`Ops - Flags`): SHIPPED (P17 T4); deltas only

**Purpose/layout:** A header with a "Filter keys" input. A table of grouped keys (LIMITS "shown to users" / FAIR USE "silent caps, never shown" / BILLING & PERKS / SUPPLIERS "follow the partner adapter"). Columns: KEY + badges (CRITICAL, SERVER ONLY, ON PARTNERS), VALUE, AUDIENCE, IN THE APP, CHANGED (when/who). Partner-managed rows are dimmed. The editor has badges, a description, a −/+ stepper, a 4-way audience segment, "Changes to save", "You'll type the key to confirm", SAVE…, and a **HISTORY** list (when, who, "25 → 30").

| Data | Source | Status |
|---|---|---|
| key, value, audience, client value, updated_at/by, critical, is_public, managed_by | `ops.ops_config` + `client_config` (DM §3.13) via `GET /v1/admin/flags` | shipped |
| group label + note per key | `CONFIG_KEYS` | **NEW** field `group` on `ConfigKeyDefinition` |
| per-key HISTORY with before → after | `ops.admin_audit` (target_kind `config`) | **NEW read**. Audit `detail` holds only the new `{key,value,audience}`. "25 → 30" needs `previous` in the audit detail (a change inside `set_feature_flag`'s audit fn) |
| exclusion of kill-switch keys | registry | **NEW** (see X6) |

| Action | Command | Status |
|---|---|---|
| SAVE… (critical keys need the key typed to confirm) | `set_feature_flag {key,value,audience,version}` | shipped (`requireText=flag.key`) |
| audience EVERYONE/COHORT/USER IDS/APP VER. | `flagAudienceSchema` all/cohort/uids/app_version | shipped |
| filter keys | client-side | UI only |

**Gaps/deltas:** group metadata; history endpoint `GET /v1/admin/flags/{key}/history`; `previous` value in the audit detail; stepper UI. The design's key set matches `CONFIG_KEYS` (`fair_use.system_jobs_per_trip_day` is in code but not in the design, which is fine).
**Early API:** all of the above (P17). **Blocked:** none. **Roles:** ops (shipped).

---

## 3. Partners (`Ops - Partners`): SHIPPED (P17 T4); deltas only

**Purpose/layout:** A 2-column grid of ticket cards, one per partner. Each card has a state pill (LIVE / APPROVED · OFF / OFF), a display name, the key, notes, a **health line**, and an "APP SAYS" stub (BOOK IN CRITTERPASS / OPEN KLOOK ↗ / HIDDEN). The editor has "Adapter live" toggle, app copy LINK·AFFILIATE | BOOKING·IN-APP, a "What a crew will see" NOW vs AFTER SAVE preview, notes (approval ref), a diff, UPDATE ADAPTER AND APP COPY…, and "Booking copy stays off until the adapter has passed certification".

| Data | Source | Status |
|---|---|---|
| partner, enabled, copy_mode, approved_at, notes, version | `ops.partner_adapters` (DM §3.16) | shipped |
| state **APPROVED · OFF** (approved but not live) | `approved_at` is set only on first enable (`CASE WHEN $2 AND approved_at IS NULL`) | **DELTA**: `set_partner_adapter` needs an explicit `approved_at` input (or `approved: bool`) |
| certification gate for booking copy | – | **NEW** `certified_at` column + rule `copy_mode='booking' ⇒ certified`. The current rule is only `booking ⇒ enabled` |
| copy **HIDDEN** (GYG: neither link nor booking) | `PARTNER_COPY_MODES = link, booking` | **NEW** third mode `hidden`, or derive it from "no affiliate link builder" (P35 T2). Needs a decision |
| display names (Viator, Klook…) | – | UI constant |
| health: "p95 820 ms · 0.4% errors · 212 bookings in Sep" / "links only · 1,904 click-outs" / "not called yet" | `supplier_calls` (P15, created by first outbound call; plan decision row 13), `supplier_orders`, `affiliate_clicks` (DM §3.7, P35) | **GAP**: P17's handoff table assigns "partner health" to P35, but P35's requirements/tasks never mention it. No read is specified |
| crew preview NOW/AFTER ("Ubud cooking class · from 450k") | a sample offer | **NEW**. Supplier content can't be cached (D10), so use a canned sample or a live fetch. Log as an undesigned-data question |

| Action | Command | Status |
|---|---|---|
| UPDATE ADAPTER AND APP COPY… | `set_partner_adapter {partner,enabled,copy_mode,notes,version}` | shipped. Payload delta: `approved_at?`, `certified_at?` |
| webhook replay (P17 handoff → P35) | – | not in the design; still unowned in P35 (AC §5.9 lists "webhooks replay") |

**Early API (P17):** explicit approved/certified fields + booking⇔certified rule (migration on `ops.partner_adapters`, which P17 owns). **Blocked:** the health read needs P15 `supplier_calls` and P35 `affiliate_clicks`/`supplier_orders` (neither exists on main). **Roles:** ops.

---

## 4. Content batches (`Ops - Content Batches`): P18 T4 (pending), not built

**Purpose/layout:** A header stage strip: BRIEF ✓ GENERATE ✓ VALIDATE ✓ RENDER ✓ **REVIEW** APPROVE PUBLISH. A left batch list: status pill REVIEW/BLOCKED/PUBLISHED/REJECTED, a gate code (G2, G3, G6, G5, or v4), a title, and meta (counts, warnings, $). The main panel shows the batch title, id, route/model/tokens/cost, summary pills (7 PASS · 3 WARN · IP CHECK CLEAR), a 5-col item grid (render + locked silhouette, name, city, PASS/WARN, reviewer mark), and a side panel "PREVIOUS VS NEW" (V3 LIVE vs V4 THIS BATCH) with a validator report (✓/!), a regenerate note, and KEEP V4 / REJECT ITEM. The footer reads "Reviewers kept 7 of 10… Live release: forms v3, published 21 Sep. Roll back", with REJECT BATCH WITH NOTES and APPROVE & PUBLISH V4 · OWNER.

| Data | Source (P18 §Architecture, DM §3.13/§3.16) | Status |
|---|---|---|
| batch kind, version, status, approved_by/at | `content_releases` (kind, version, checksum, approved_by, approved_at, status draft/review/approved/published) | planned P18 T2. **GAP**: design statuses `blocked` + `rejected` missing |
| batch vs release distinction ("approval publishes a new release"; "live release forms v3") | P18 treats the release as the batch | **GAP**: a separate batch id (`2026-09-27-forms-07`), title, and a link to the live release/version are not modelled |
| pipeline stage per batch | factory CLI stages (P18 T3) | **NEW** `stage` column (or derived). The CLI writes only the release draft |
| founder gate per batch (G1–G7) + blocked reason ("6 cards need a native speaker") | P18 founder gate table | **NEW** `gate`, `blocked_reason` columns |
| route, model, tokens, cost per batch | P18: "cost + tokens logged per batch (Langfuse)" | **GAP**: no DB columns. Suggest `tokens_in/out`, `cost_micros`, `route` on the batch, or roll up from `ai_usage.job_id` |
| per-item verdict, reviewer, notes, render_key | `ops.content_reviews` (release_id, item_ref, render_key, verdict, reviewer, notes) | planned P18 |
| validator report per item with PASS/**WARN** | P18 validators are "code, blocking" | **GAP**: a non-blocking WARN severity (e.g. contrast 3.4:1) isn't specified; report storage isn't specified (suggest `ops.content_reviews.report jsonb`) |
| IP check status per batch | P18 T3 IP checklist markdown | **NEW**: a batch-level `ip_status` field for the pill |
| previous vs new render | P18 T4 step 1 | planned. Renders need P05 bake + HMAC media URLs |
| POI duplicate gray band ("14 possible duplicates") | P18 T7 → review batch | planned |

| Action | Command | Status |
|---|---|---|
| KEEP V4 / REJECT ITEM (+ regenerate note) | per-item verdict → `ops.content_reviews` | **GAP (name)**: no command is in AC §4.17. Propose `review_content_item {batch_id,item_ref,verdict: keep\|reject,notes?}` (role content) |
| REJECT BATCH WITH NOTES | `reject_content_batch {batch_id,notes}` | AC §4.17 (role content) |
| APPROVE & PUBLISH · OWNER | `approve_content_batch {batch_id,notes}` | AC §4.17 lists role **content**; P18 says "owner required for approve". **Doc conflict**: update the AC row to owner |
| Roll back | `rollback_content_release {kind,to_version}` | P18 doc delta; not yet in AC §4.17 |
| batch list / detail reads | `GET /v1/admin/content/batches`, `/…/{id}` | AC §5.9 mentions "content batches (review, approve)". Paths are **NEW** names |

**Early vs blocked:** P18 has no app dependency (depends on 4 done, 5 in progress, 13 in progress, 14 in progress, 17). **Early:** T1 schemas/release format, T2 migration (add the missing statuses/columns above), T4 server half (reads, review/approve/reject/rollback commands, `content.publish` job), and the admin module with placeholder thumbnails. **Blocked:** real render thumbnails/contact sheets need P05 bake (in progress). Generation stages need P13 T13 (DeepSeek) to be final. Founder gates G1–G7 are human.
**Roles:** content marks items; owner approves (design + P18). `ADMIN_COMMAND_ROLES` needs `approve_content_batch: ['owner']`, `reject_content_batch/review_content_item: ['content']`.

---

## 5. Community & drivers (`Ops - Community`): P52 + P55 + P56 (all pending)

**Purpose/layout:** Tabs DRIVERS 41 / SHARED PLANS 128 / PICKUP GAPS 23 / ASK GROUPS 17. The main area is a drivers table (DRIVER+areas, SPEAKS, LISTING status, CREWS, FLAGS). The right card is the driver detail: own photo, name, vehicle · seats · areas, VERIFIED WHATSAPP, LISTED 9 SEP, "what he tells crews", a rating summary + latest tip (crew size · month), and an **ANOMALY FLAG · RATING RING?** box with HOLD THOSE RATINGS / TAKE DOWN / CLEAR FLAG. The bottom row has PICKUP GAPS · BALI (place, quoted copy, window, ACTIVE/DRAFT, Retire/Approve, + Add gap, and a Farefeed no-service note) and ASK GROUPS (name, destination, link check status, crews opened, + Add group, "Fix link").

| Data | Source | Status |
|---|---|---|
| display_name, areas, languages, status listed/paused/pending/removed, vehicle, price_text, photo_key | `driver_listings` (P56 §Tables; not yet in DM) | planned P56 |
| "invite opened" (pending), "removed by him" | `driver_invites.status` (P56) | planned |
| "7 rated · 6 loved · 1 fine" | `driver_listing_stats` (crews_rated, crews_loved, trips) | **DELTA**: add a `crews_fine`/`crews_not_again` breakdown |
| latest tip + "crew of 5 · August", TIP HELD flag | `driver_tips` (text, month, status visible/held/removed) | planned. Crew size is derived |
| LISTED date, VERIFIED WHATSAPP | `consent_id` + OTP | **DELTA**: `listed_at` column is missing |
| ANOMALY flag: account, trips, rule text | P56 T7 "anomaly flag fires on seeded ring" | **GAP**: no storage/shape. Propose `driver_listing_flags` (listing_id, kind `rating_ring`, evidence jsonb, status open/cleared) or `moderation_reports` with kind `driver_rating_ring` |
| shared plans tab | `shared_plans` (DM §3.15), P52 T9 "published plans list, unpublish with reason" | planned P52 |
| pickup gaps: place (POI/area), copy, window, status **ACTIVE/DRAFT** | `pickup_gaps` (P55 §Tables; columns unspecified) | **GAP**: P55 only says "add, edit, retire". There is no DRAFT→approve status and the column list is missing |
| Farefeed "no service on 9 legs this week" | P35 T8 `ride_quotes` no-service results | **NEW** aggregate read |
| ask groups: name, destination, opens ("41 crews") | `ask_groups`, `ask_group_opens` (P55) | planned |
| link check "checked 3 d ago" / "broken since Thu" / Fix link | – | **GAP**: P55 has only a manual logged-in URL check. Needs `last_checked_at`, `link_status` (+ a manual "mark checked" action, or an automated HEAD check. An automated check must stay compatible with D21 "never read groups". Needs a founder call) |

| Action | Command | Status |
|---|---|---|
| TAKE DOWN listing | P56 "admin takedown with audit". No name | **GAP (name)**: propose `take_down_driver_listing {listing_id,reason}` |
| HOLD THOSE RATINGS | – | **NEW** `hold_driver_ratings {listing_id,user_id\|rating_ids}` + `driver_ratings.status` (visible/held) column |
| CLEAR FLAG | – | **NEW** `clear_driver_flag {flag_id,reason}` (or `moderate_item` verdict approve if flags ride the moderation queue) |
| + Add gap / edit / Retire / Approve (draft) | P55 T12 "admin CRUD pickup_gaps" | **GAP (names)**: propose `upsert_pickup_gap`, `set_pickup_gap_status {id, active\|retired}` |
| + Add group / Fix link | P55 T12 CRUD `ask_groups` | **GAP (names)**: `upsert_ask_group`, `mark_ask_group_checked` |
| unpublish shared plan (tab) | P52 T9 "unpublish with reason" | **GAP (name)**: `admin_unpublish_shared_plan {id,reason}` |

**Early vs blocked:**
- **Early:** the `pickup_gaps` + `ask_groups` + `ask_group_opens` catalogue migration and admin CRUD (C0 catalogue, founder-approved seed list exists). This is pure server + console with no app dependency. It needs a split from the P55 migration, which also carries `provider_intake`/`providers` changes.
- **Blocked:** the drivers tab needs P56 tables (they depend on P55 `providers` columns) and real ratings from the P52/P56 rate stack (app phases 43/52/56). The anomaly detector needs rating data. The shared plans tab needs P52 (depends on app phases 28/29/30/43/44/46/51). The Farefeed aggregate needs P35 T8.

**Roles:** community area = ops + content (design). Takedown/hold/clear have no role in the design: suggest ops (moderation-like), with content limited to gaps/groups. This needs confirmation.

---

## 6. Services & spend (`Ops - Services`): NEW screen, unowned

**Purpose/layout:** Header "checked 30 s ago" + GRAFANA ↗ / LANGFUSE ↗. 4 tiles: SPEND THIS MONTH ($1,284 of $3,000, ON PACE, projection), AI TODAY ($184 of $400 cap, GUARD OK, "alerts 80%, pauses 100%"), SERVICES (31/32 healthy, 1 DEGRADED, "incident is open"), OTP·SMS TODAY ($22, alert at $60, "pumping guard blocked 41"). Then a per-tier AI panel (spend / cap bar + toggle, "cost guard OK · every 5 min", DOWNGRADE A TIER…) and a 14-day stacked AI spend chart with a cap line. Then AI FEATURES · KILL SWITCHES (key, what, tier, volume, spend today, toggle) and PRODUCT SWITCHES (typed confirm; "Off · Mai · 14:12 · APNs incident"). Then a THIRD-PARTY SERVICES · 32 table grouped by domain (service, use, status, p95·errors, usage bar vs quota, MTD spend, switch key).

| Element | Plan owner today | What exists on main | Needs |
|---|---|---|---|
| Kill-switch registry `ai.<feature>.enabled`, `ai.tier.<model>.enabled`, `la.<kind>.enabled`, `widgets.push.enabled`, `supplier.<name>.enabled`, `android.fsi.enabled`, `signup.enabled`, `otp.<channel>.enabled` | **P54 T9** (`services/api/src/ops/kill-switches.ts`), wave 23 | none. `CONFIG_KEYS` has only limits/fair-use/billing/perks/supplier keys | Add keys to `CONFIG_KEYS` with `group:'services'` (P17-owned file) |
| Keys in design but **not** in P54's list | – | – | `billing.enabled`, `postcards.enabled`, `supplier.grab` (Grab isn't in `PARTNER_KEYS`), `otp.sms.enabled`. Design `la.crew_map.enabled` vs P39 `ops_config.crew_map_enabled`: naming conflict |
| Toggle reason ("APNs incident") | – | `set_feature_flag` payload has no `reason`. `ops.admin_audit.reason` exists | **NEW** optional `reason` in the payload → audit |
| Tier downgrade (owner only per P54 "founder admin toggle") | P54 T9 step 3 | `set_feature_flag` roles = ops for every key | **NEW** per-key role (`ConfigKeyDefinition.roles` or `ownerOnly`) |
| AI cost guard cron every 5 min, alert 80 % / pause 100 %, Opus-skeleton queueing | **P54 T9** (`services/worker/src/jobs/ops/ai-cost-guard.ts`) | `ai_usage` table + `admin_reader` SELECT grant (ops_console migration). pg-boss runtime (P11) | Caps as config keys: **NEW** `ai.cap.daily_usd`, `ai.cap.<tier>.daily_usd`. Guard run status for "GUARD OK" (**NEW**: last run/result in Redis or a table) |
| Per-tier spend today, 14-day chart | P13 cost accounting (done) | `ai_usage(model,tier,cost_micros,at)` | Read only. **Early** |
| Per-feature spend + volume | P19 metric `cp_llm_cost_micros_total{feature,tier}` (Grafana only) | `ai_usage` has **no route/feature column**. `recordUsage` gets no route | **NEW** migration `ai_usage.route` + P13 `usage.ts` change. Volume units per feature (turns, voice min, scans) are **NEW** (or show call count) |
| Month spend + projection + monthly budget | none | none | **NEW**: `spend.month_budget_usd` key. Vendor spend store, e.g. `ops.vendor_spend_daily(service, day, amount_micros, source api\|manual\|computed)`, filled by per-vendor billing pollers or manual owner entry for fixed plans (Railway, PlanetScale, Cloudflare, SaaS plans) |
| OTP·SMS today + alert threshold + blocked count | P09 abuse (done) | Redis `abuse:otp-pumping:spend:{provider}:{date}` daily spend counter + cap (`services/api/src/abuse/pumping.ts`). P19 `cp_sms_sent_total` | Read Redis. **NEW** counter for blocked attempts + `otp.sms.alert_usd` key. **Early** |
| Service registry (32 rows: name, group, purpose, switch key, fallback note) | none (system-architecture §2 vendor list) | none | **NEW** static registry in `packages/domain` (KISS; no table). The design omits DeepSeek, TypeSafe (Jev), Tavily/Brave, and self-hosted PowerSync/Centrifugo/Valhalla. Add them |
| Status OK/DEGRADED/NOT LIVE + p95·errors per vendor | P19 metrics `cp_supplier_call_ms`, `cp_push_total`, `cp_sms_sent_total` → Grafana; P19 T9 dashboards | `/ready` checks only db/redis/centrifugo | **NEW** read: either query Grafana's Prometheus API from the api (one source; needs a read token) or keep rolling Redis stats in each outbound HTTP client. Thresholds for DEGRADED are **NEW** |
| Incident open | P19 T9 Grafana IRM | none | **NEW** (read IRM API) or drop it to a link-out |
| Quota usage % (Mapbox free tier, WeatherAPI plan, AeroDataBox, ElevenLabs chars, Foursquare) | none | none | **NEW** hourly `ops.vendor_usage_poll` job per vendor usage API → `ops.vendor_usage` |
| Supplier rows switch "on Partners" | P17 partners (shipped) | `supplier.*` keys `managedBy:'partners'` | Link only |

**Owning phase:** none. Parts sit in P54 T9 (switches + guard, wave 23), P19 (metrics/alerts, pending), and P13 (usage, done). The whole screen, its read endpoint, the vendor registry, spend collection and the `services` area are a **GAP**. It also conflicts with P17's "no duplicate dashboards (link-out to Grafana)". The founder should confirm that the console shows health/spend itself rather than linking out.

**Proposed routes/commands:**

| Item | Proposal |
|---|---|
| Read | `GET /v1/admin/services` → `{tiles, tiers[], daily_ai[14], features[], product_switches[], services[]}` (area `services`, role ops) |
| Switch/caps writes | existing `set_feature_flag` (+`reason`, per-key roles). No new command |
| Manual vendor cost | `set_vendor_cost {service, month, amount_minor, currency, note}` (owner) **NEW** |

**Early (pure server, no mobile dependency):** services area + role; kill-switch/caps keys in `CONFIG_KEYS` with group + owner-only tier keys; `reason` on `set_feature_flag`; AI tier/day spend reads from `ai_usage`; `ai_usage.route` migration; SMS tile from the existing Redis counters; the cost-guard cron (pull P54 T9 forward, since it needs only `ai_usage` + pg-boss); static vendor registry; the read endpoint returning `unknown` health until P19 lands.
**Blocked:** p95/error health needs P19 T6/T9 (OTel + Grafana), or outbound-client instrumentation in each vendor phase (P15 AeroDataBox/WeatherAPI/Travelpayouts, P35 Viator/Grab, P44 PostGrid, P46 RevenueCat, P11 APNs/FCM). Quotas and spend need vendor accounts/API keys. Switches for `la.*`, `widgets.push`, `android.fsi` only take effect once P39/P48/P49 enforce them (the keys can exist earlier).
**Roles:** ops for the screen. Tier downgrade = owner (P54). The design gives no role hint on DOWNGRADE, so it should be owner-gated in the UI.

---

## 7. Summary: early-build candidates (no app dependency)

| # | Item | Owner to assign | Depends on |
|---|---|---|---|
| E1 | Add `content`, `community`, `services` areas + command roles in `policy.ts` | P17 | – |
| E2 | Flags: `group` metadata, `/flags/{key}/history`, `previous` in audit detail, `reason` in payload, per-key roles | P17 | – |
| E3 | Catalogue: counts, last editor/version from audit, persona-pack check | P17 | – |
| E4 | Partners: `approved_at` input, `certified_at` column, booking⇒certified rule, copy `hidden` decision | P17 | founder call on `hidden` |
| E5 | P18 T1/T2/T4 server half: release schema with batch fields (stage, gate, blocked/rejected, cost/tokens, ip_status, WARN reports) + review/approve/reject/rollback commands | P18 | P13 T13 for generation only |
| E6 | Pickup gaps + ask groups catalogue tables + admin CRUD (split from the P55 migration) | P55 | founder-approved seed list |
| E7 | Kill-switch + caps keys, AI cost guard cron, `ai_usage.route`, Services read (AI + SMS parts) | P54 T9 pulled forward + new services task | P11 pg-boss (in place) |

## Unresolved questions

1. Services & spend: should the console duplicate Grafana health/spend (the design) or follow P17's link-out rule? Who owns the screen (new P17 task vs P54 T9 vs P19)?
2. Partner copy mode `hidden` (GYG): is it a new enum value or derived from "no link partner"?
3. `approve_content_batch` role: AC §4.17 says content, but P18 and the design say owner. Fix the AC row.
4. Should content batches be a table separate from `content_releases` (the design shows a batch id + a "live release vN" pointer)?
5. Ask-group link checks: automated HEAD check vs manual "mark checked" (D21 "never read groups")?
6. Community actions (takedown/hold/clear): ops only, or ops + content?
7. Crew-map switch name: `la.crew_map.enabled` (design) vs `crew_map_enabled` (P39)?
8. Vendor spend for fixed plans: billing APIs per vendor, or monthly manual entry by the owner?
