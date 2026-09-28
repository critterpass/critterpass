---
phase: 46
title: "Monetization: billing, paywall, Boost, plan management"
status: pending
depends_on: [9, 11, 12, 24, 33, 39, 58]
wave: 15
features: [F-157, F-158, F-159, F-162, F-163, F-164, F-165, F-166, F-167, F-168, F-169]
screens: [4e-1, 4e-2, 4e-3, 4b-1, 4b-3, 4b-4, 4b-5, 4c-1, 4c-2, 4d-1, 4d-2, 4d-3, 4d-4, 4f-1, 4f-2, 4f-3]
tasks: 13
owns:
  - packages/domain/src/billing/
  - packages/domain/src/paywall/
  - packages/db/src/schema/billing.ts
  - packages/db/migrations/*_billing_subscriptions_transactions.sql
  - packages/db/migrations/*_boosts_grants_codes.sql
  - packages/db/migrations/*_paywall_impressions.sql
  - packages/db/test/permissions/{subscriptions,store-transactions,billing-events,boost-intents,trip-boosts,boost-credits,crew-year-grants,ftf-grants,codes,code-redemptions,paywall-impressions}.test.ts
  - packages/entitlements/src/loaders/billing/
  - packages/ai/src/routes/boost-reaction/
  - packages/ai/evals/boost-reaction/
  - services/api/src/commands/billing/
  - services/api/src/commands/boost/
  - services/api/src/commands/paywall/
  - services/api/src/billing/
  - services/api/src/routes/webhooks/revenuecat.ts
  - services/api/src/admin/billing/
  - services/api/test/billing/
  - services/worker/src/jobs/billing/
  - services/worker/test/billing/
  - apps/admin/src/modules/billing/
  - apps/mobile/src/data/billing/
  - apps/mobile/src/features/monetize/
  - apps/mobile/src/app/(modal)/paywall/
  - apps/mobile/src/app/(modal)/boost/
  - apps/mobile/src/app/you/plan/
  - apps/mobile/src/features/crew/seat-limit/registry.ts                                   # append-only edit grant (owner phase 23): register SeatCapSheet presenter
  - apps/mobile/src/features/plan/draft/components/last-redraft-interstitial.tsx         # edit grant (owner phase 28): mount BoostOfferButton
  - apps/mobile/src/features/plan/draft/screens/change-day-sheet.tsx                      # edit grant (owner phase 28): REDRAFT_LIMIT upsell → BoostOfferButton
  - apps/mobile/ios/Critterpass.storekit
  - packages/i18n/locales/en/monetize/
  - e2e/monetize/
---
# Phase 46 — Monetization: billing, paywall, Boost, plan management

## Context links
| Source | Section |
|---|---|
| `docs/product-decisions.md` | D7 (products, RevenueCat + own entitlement service, no web checkout), D8, D10 (never MoR; Boost split = ledger IOUs only); C8, C9, C10, C11, C23, C26, C32, C42, C45, C46, C48; §3 entitlement matrix, resolution rules, fair-use caps, lifecycle overlays, products and codes, paywall governor table; §7 Q-70…Q-7G, Q-85 |
| `docs/data-model.md` | §3.14 (`subscriptions`, `store_transactions`, `billing_events`, `boost_intents`, `trip_boosts`, `boost_credits`, `crew_year_grants`, `ftf_grants`, `codes`, `code_redemptions`, `paywall_impressions`, `user_entitlements`, `trip_entitlements`, `usage_counters`); §3.8 `expenses`, `ledger_entries` (boost IOUs) |
| `docs/data-model-sync-and-privacy.md` | §1 (unpublished: `store_transactions`, `billing_events`, `codes`); §3.3 Boost machine; §3.6 Subscription machine; §4 streams `me`, `trip`, `crews`, `catalog`; table → phase (46) |
| `docs/api-contracts.md` | §4.15 monetization commands; §5.8 `/webhooks/revenuecat`; §3 errors `BOOST_INTENT_LOCKED`, `SEAT_LIMIT`, `REDRAFT_LIMIT`, `QUOTA_EXHAUSTED`, `ENTITLEMENT_REQUIRED` |
| `docs/api-contracts-async.md` | §1.2 `user:#uid` (`entitlement.changed`), `crew:` / `trip:` (`boost.state`, `boost.intent_lock`), `crew_chat:` (`boost_card`); §2.2 `billing.apply`, `boost.expire`; §2.3 `billing.reconcile`, `pause.remind`; §3 N-33, N-34, N-37, N-43, N-44; §6 App Group `snapshot/entitlements.json` |
| `docs/system-architecture.md` | §4 command pipeline, jobs, push router (governor hook) |
| `docs/design-system.md` | stamp slam, holo seal, light sweep, odometer, confetti, split-flap, sheet/rise presets |
| Reports | `design-analysis-260926-1143-subscriptions-report.md` §1–§9 (every 4* screen spec, prototype routing anomalies, risks); `researcher-260926-1143-native-platform-monetization-report.md` (store APIs, RevenueCat, policy 3.1.1/3.1.2); `fact-check-260926-1143-native-platform-monetization-report.md` claims 25–31, omissions 1, 9–11; master §2 F-157…F-169, §8 paywall entry points, R11, R16 |
| Phase inputs | P09 Better Auth (uid, anonymous upgrade keeps uid); P11 `notify.route` governor hook + push; P12 `packages/entitlements` engine, `registerSourceLoader()`, `products`/`perks` catalog, quota fns; P24 chat card registry (`boost_card` reserved); P33 ledger (`expenses.source=boost`, `boost_iou` entries, reversal entries); P39 crew live map (teaser host); P16 `boost-split` allocation |
| Renders | `docs/design-renders/screens/4e-1_Paywall.png`, `4e-2_What_s_in_each.png`, `4e-3_Welcome_to_Pass_.png`, `4b-3_Boost_Kyoto.png`, `4b-4_Checkout.png`, `4b-5_Stamped.png`, `4c-1_Boosted_by_Winston.png`, `4c-2_Free_boost_ending.png`, `4d-1_Your_plan.png`, `4d-2_Before_you_go.png`, `4d-3_Card_declined.png`, `4d-4_Redeem_or_restore.png`, `4f-1_Seven_s_a_crowd.png`, `4f-2_Live_map_teaser.png`, `4f-3_Last_redraft.png`; reference only (do not build, C32): `4a-1_Visa_page.png`, `4a-2_Boarding_pass.png`, `4a-3_Gold_cover.png`, `4b-2_Compare_plans.png` |

## Overview
Goal: sell Pass+ (monthly/yearly), Trip Boost (consumable), Crew yearly and IAP-funded gifts through StoreKit 2 / Play Billing via RevenueCat, with our API as the only entitlement authority; every purchase binds to the Critterpass uid, flows through an idempotent webhook → `billing.apply` → entitlement recompute, and Boost splits become ledger IOUs (never money movement). All paywall surfaces are governed (≤1 unsolicited/day, suppressed contexts) and list only server-enabled perks.
Done when: sandbox purchases on iOS (StoreKit config + sandbox) and Android (Play internal test track) activate Pass+ / Boost / Crew yearly end-to-end on two devices within seconds (realtime `entitlement.changed`), refund/revoke and grace/billing-retry transitions replay correctly from recorded webhook fixtures, the governor property tests pass, and Maestro flows cover paywall → purchase → welcome, boost split → crew card settle, redeem and restore.

## Requirements
### F-157 Store billing
| Aspect | Requirement |
|---|---|
| Products | `pass_monthly` ($3.99), `pass_yearly` ($29.99), one subscription group; `boost_trip` consumable ($11.99 tier, design "$12" → always show store `displayPrice`); `boost_crew_year` auto-renewing ($59.99 tier, separate group); `gift_pass_3m` consumable (funds a gift code). Store ids in `products.store_ids`; prices never hard-coded |
| Identity | RevenueCat `appUserID` = uid (set after Better Auth session, anonymous included); iOS `appAccountToken` = uid UUID; Play `obfuscatedAccountId` = uid hash; boost purchases set RC subscriber attribute `boost_intent_id` before purchase |
| Server truth | `/webhooks/revenuecat` (shared-secret constant-time compare) → `billing_events` (uk source,event_id) → `billing.apply` job refetches subscriber via RC REST → `fulfil_purchase` / `revoke_purchase` → `subscriptions` / `store_transactions` → P12 `recomputeUser/Trip` → `entitlement.changed` on `user:#uid`. Client purchase success also calls `fulfil_purchase{source:client_sync}` (same idempotency on store txn id) so UI never waits on webhook latency |
| Lifecycle | Subscription machine (data-model §3.6): active → grace (server 7 d after billing failure on both stores, `ops_config billing.grace_days`) → billing_retry → on_hold → expired; cancelled_active; paused; revoked. `billing.reconcile` cron 05:00 SGT diff vs RC REST |
| Restore | inline restore (RC `restorePurchases` / `syncPurchases`); transactions bound to another Critterpass account → `RESTORE_OTHER_ACCOUNT{masked_hint}` → prompt to sign in to that account (no transfer); anonymous purchases bind on sign-in (uid preserved, P09) |
| Launch listener | RC SDK configured at app start so interrupted/Ask-to-Buy/SCA purchases complete; pending state persisted |
| Policy | no web checkout; no custom unlock codes except IAP-funded gifts (3.1.1); Family Sharing off; no intro offer/trial (FTF is the trial analogue); EU alternative payments not offered at launch (IAP only) |

### F-158 Paywall visa, comparison, welcome (4e-1, 4e-2, 4e-3; 4a-*/4b-2 reference only)

Not built, by design (product-decisions C32, decision 19): 4a-1 Visa page, 4a-2 Boarding pass, 4a-3 and 4b-2 Compare plans are rejected paywall directions superseded by 4e-1/4e-2/4e-3 — a supersession, not a deferral. Their motion ideas may inform 4e-* polish only. Prototype routes from 4b-1 and 4c-2 to 4a-1 go to 4e-1.
| Screen | Behaviour |
|---|---|
| 4e-1 | Rise over current screen; passport page "PAGE 07", Pass+ visa (HOLDER = display name, MRZ from `passes`), Boost entry stamp (current trip context), FIRST TRIP FREE round stamp only when the viewer's crew has an active/pending `ftf_grants` row (else hidden); MONTHLY / YEARLY toggle (yearly default, "−37%" computed per storefront from store prices, per-month computed); GET PASS+; "Boost a trip instead" → 4b-3 for context trip (hidden when no eligible trip); "What's in each ›" → 4e-2; ✕ = quiet no; RESTORE inline. Motion per report: page ty 40→0 540 ms, visa slap s1.18→1 630 ms back, sweep 1176 ms/4.2 s, holo seal 7 s spin, boost stamp at 900 ms, FTF thud at 1500 ms + jolt + heavy haptic, Tokek float, CTA sweep, odometer price roll on toggle; Reduce Motion → fades only |
| Disclosures (3.1.2) | below CTA: price per period, "renews automatically until cancelled", manage/cancel in store settings, Terms + Privacy links (web routes from P51), restore — present on 4e-1, 4e-2 and 4b-3 |
| 4e-2 | Comparison grid rows from `perks` (server-driven, `enabled` only, C48); column tap slides highlighter band (spring 300 ms), dims others to .45, lights matching CTA; CTA price follows 4e-1 period; rows ink in top-down 120 ms stagger; VoiceOver reads per row ("Guide chat: Free 30 a day, Pass+ unlimited, Boost unlimited on trip"); current-plan and boosted-trip markers |
| 4e-3 | After verified fulfilment: visa drop, ADMITTED stamp with purchase date, confetti 80 pcs, perks list from `perks` (personalised guide names of the user's trips), "PICK A NEW ICON" → 3n-5 (P45 route), renewal line from `subscriptions.period_end`, Done → Home |
| Undesigned states (design in code) | products loading / price unavailable; store unavailable / purchases restricted; offline; pending (Ask to Buy / SCA) "we'll finish this when it clears"; cancelled (silent back); failed; verifying beat (≤5 s then "finishing in the background" + push on completion); already subscribed → 4d-1; multiple crews (stamp shows context trip's crew); Android variant (Play sheet); restore-success welcome (no full celebration); gift/promo-granted welcome; monthly→yearly upgrade welcome; crew-yearly buyer welcome |

### F-159 Paywall governor + entry-point registry
- Registry `packages/domain/src/paywall/entries.ts`: `guide_limit` (4b-1), `redraft_last` (4f-3), `seat_cap` (4f-1), `live_map` (4f-2, per-trip dismissal), `lock_screen_map` (5a-6), `ftf_ending` (4c-2 push + recap), `postcard` (3m-9), `widget_locked` (5c-2/5c-5 tap), explicit (3n-1/3n-2/3n-5 chips, 4d-1, widget gallery) — each with `{offer, governed, suppressContexts}`.
- Rules (pure fn `canShowPaywall(ctx)` shared client/server): max 1 unsolicited/day/user (device tz date); never on day-of screens, Help, SOS (incl. Help/SOS map, C45), delay/disruption flows, within 10 min after an error; quiet no (✕ / "Maybe later" / "Stay free") hides that entry for that trip; explicit navigation exempt; 4c-1 crew cards and N-33 pushes count toward the cap (P11 `notify.route` calls the same fn); rating prompt never follows a paywall in the same session (P47 reads `paywall_impressions`).
- `record_paywall_event` writes `paywall_impressions`; offline events queue as commands; client pre-check uses synced rows, server check is authoritative for pushes.

### F-162 Trip Boost purchase + split IOUs (4b-3, 4b-4, 4b-5)
- 4b-3 sheet: trip label, THIS TRIP (window end = trip end + 7 d, C46) vs EVERY TRIP, ALL YEAR (crew yearly, stamps PASS+ sticker); WHO PAYS "I'LL COVER IT" | "SPLIT N WAYS" over seated participants (RSVP ≠ out) incl. buyer; avatars fan out (40 ms stagger); split preview from P16 `boost-split` (exact minor units, buyer absorbs remainder), shown as "{share} each goes into Balances"; CTA shows the charged price (C26); "AFTER THE TRIP" box; "Trip cancelled? The boost moves to your next one."
- Flow: `create_boost_intent` (15-min lock, `boost.intent_lock` on `trip:`; others see "{name} is boosting…" and cannot start) → RC purchase with `boost_intent_id` attribute → 4b-4 system sheet (not customisable; Split row lives in 4b-3/4b-5) → verifying beat → `fulfil_purchase` → `trip_boosts` active + if split: P33 `expenses(source=boost)` + `boost_iou` ledger entries in the same txn → 4b-5.
- 4b-5: BOOSTED stamp (slam + ink spread + page shake), confetti 70 pcs, guide line (template with last-redrafted day; optional Haiku one-liner ≤80 chars with 1.5 s timeout → template), avatars drop in as each share row is created (driven by synced `expense_shares`), TELL THE CREW → posts `boost_card` to crew chat.
- States: cover-it variant (no owe line), crew-yearly variant, already boosted (by whom), FTF/crew-year covering (sheet not offered; shows coverage), trip ended (not purchasable), solo trip (purchasable, Q-7E), intent locked by another member, price load failure, offline (CTA disabled with reason), expense creation failure (boost stays active; ledger retry job; banner "Split still being added").

### F-163 Boost lifecycle (C46, C9)
- Window: purchase → trip end + 7 d; `ends_at` recomputed on trip date change; UI copy "ON NOW · UNTIL {date}" with trip dates shown separately.
- FTF: auto-grant when the crew's first trip enters Setup and ≥2 seated participants; once per crew; one FTF-organised trip per user; abuse check on account + verified phone hash + device attestation (App Attest / Play Integrity) (`member_overlap_hash`; no store identifier exists because FTF involves no purchase); grants Boost + Pass+ for every member until trip end + 7 d.
- Expiry `boost.expire` at `ends_at`: flip `trip_entitlements`, end crew LAs (P48 hook), freeze new seats > 6 (nobody removed), notify.
- Trip cancelled → `move_boost` to crew's next trip or `boost_credits` (never expire, 3.1.1); `apply_boost_credit` by any member of the crew.
- Refund/revoke → `trip_boosts.revoked`, entitlement removed, unsettled IOUs reversed via P33 reversal entries, settled IOUs untouched.

### F-164 Crew boost broadcast (4c-1)
- `boost_card` message registered in P24 card registry: buyer avatar, "{BUYER} BOOSTED {DEST} / dates · split N ways", perk chips from `perks` (tier boost, enabled), SETTLE {share} → P33 settle screen preselecting the IOU, THANKS {BUYER} (one-shot reaction, notifies buyer, flips to "SENT ♥"), live SETTLED row (avatars slide in on settle via `crew_money:` hint + synced `payments`).
- Header "BOOSTED" pill on crew chat + trip hub (reads `trip_entitlements`); perks refresh on every member device via `entitlement.changed`.
- Guide reaction: job on `boost.activated` posts a guide line in crew chat (Haiku, persona, inputs = last 20 chat lines + redraft history; template fallback), may attach a redraft GuideOffer (P13 contract, never direct writes).
- N-34 push to members (crewmate sender, C18).
- States: buyer view ("{n} still to go", NUDGE → P33 nudge), viewer settled ("SETTLED ✓"), cover-it variant (THANKS only), all settled (collapses to "Everyone's square"), revoked/moved (card greys with reason), member joined after boost (owes nothing, no settle button).

### F-165 Live map gate + teaser (4f-2, 5a-6)
- Opening P39 crew map on an unboosted trip (outside Help/SOS sessions, C45) shows teaser: greyscale scrim over a **synthetic replay** (scripted pins moving along plan stops of the viewer's last boosted trip, or a generic demo destination if none; never real past coordinates, C25), tags "PREVIEW · YOUR {TRIP}" + "{TRIP} ISN'T BOOSTED", usage stat from `usage_counters(metric=map_opens)` ("You opened it 41 times in Bali"; hidden if zero), BOOST {DEST} · price, "Maybe later" = per-trip dismissal; afterwards the map shows own location only + small "Boost for live map" chip.
- 5a-6 "Put this on the lock screen" control → same Boost offer (governed).
- Copy never mentions SOS as a Boost perk (C11).

### F-166 Free-trip-ending reminder (4c-2)
- N-33 scheduled per FTF member at `ends_at − 3 d` local 10:00 within ping budget (governed) + recap placement (P43 mounts an empty `RecapEndSlot` at story end; P47 `RecapEndArbiter` fills it and presents this phase's exported `FtfEndingCard` first (priority 4c-2 > 3o-3 > store review), which also suppresses the rating prompt).
- Screen: split-flap day counter (in user tz), KEPT FOR GOOD chips (plan, photo count, recap, critters found, map trail = plan-stop route, C25), PAUSES {date} chips from boost/FTF perks, CTAs BOOST {NEXT} · {share} each (4b-3 split preselected), PASS+ JUST FOR ME (hidden if Pass+), Stay free (quiet no; toast "The album and recap are yours either way", C42).
- States: no next trip ("Boost your next trip" disabled until one exists; Pass+ only), next trip already boosted, 1 day left, ended variant, organiser vs member copy, offline.

### F-167 Plan management (4d-1, 4d-2, 4d-3)
- 4d-1 Your plan: pass card (shared element from 3n-2 chip), states: free (upsell card → 4e-1), monthly, yearly, paused ("Paused until {date}"), cancelled_active ("Ends {date}" + Resubscribe), grace (→ 4d-3), billing_retry/on_hold (access lost, fix CTA), expired, gift/promo-sourced ("Ends {date}", no store row), crew-yearly row (bound crew, rebind once per period), other-platform ("Manage on Google Play" / "App Store"); BOOSTS list = boosts where user is buyer or member (window, "{k} of {n} settled" odometer live); MANAGE: Change plan (store upgrade/downgrade via RC `purchasePackage` with `googleProductChangeInfo` / iOS same group), Payment method → store billing page (no last-4: not available from IAP), Redeem a code → 4d-4, Restore → inline, Cancel Pass+ → 4d-2.
- 4d-2 (Q-7A): monthly only shows the pause card. iOS = emulated pause: user turns auto-renew off in store sheet (`showManageSubscriptions`), app records `set_pause_intent{resume_at}` (default next trip start − 1 month), `pause.remind` at resume − 7 d sends N-37 with resubscribe deep link; paused overlay per §3 (keeps icon styles). Play = real pause: deep link to Play subscription centre (≤3 months; resume date clamped and copy says so); RTDN via RC updates `paused_from/resume_at`. "Cancel anyway" → confirm sheet → store manage sheet; outcome observed via webhook (`cancelled_active`). No timers, no discounts. States: no upcoming trip (pick a month), yearly (no pause; honest "your year is already paid"), return from store without change.
- 4d-3: entered from N-37 billing push (ALWAYS class per Q-85), in-app banner on Home/You while `grace|billing_retry`, and 4d-1. Copy uses status + grace end only (no card number, expiry or decline reason). UPDATE CARD → iOS store billing (`showManageSubscriptions`) / Play subscription centre; on foreground refetch; RECOVERED → green tick + success haptic; "Try again" = re-check status. Suppress duplicate if iOS system billing message already shown (RC `showInAppMessages` for billing issues disabled; ours is the one). Boosts shown as "Already paid, not affected".

### F-168 Codes & gifting (4d-4)
- Partner/promo codes = App Store Offer Codes (system redemption sheet `presentOfferCodeRedeemSheet`) and Play promo codes (redeem deep link); no custom unlock of store-sold content.
- Gifts (IAP-funded): sender buys `gift_pass_3m` in a design-in-code "Gift Pass+" flow from 4d-1 (recipient hint + note) → `create_gift` → server code `PASS-XXXX-XXXX` (+ share link via P21 `/g/` target) → N-44 to recipient (push if user, else link). Recipient 4d-4: three code boxes (auto-advance, uppercase, strip dashes, system paste control), live validation (debounced `GET` preview, rate-limited), envelope flip reveals sender + note, preview of new end, REDEEM → `redeem_code`: non-subscriber → `code_grant` time starting now; store subscriber (App Store or Play) → `code_grant` time that stacks after the current store period ends (entitlement service honours it once the store period lapses; copy: "Your gift starts when your current plan period ends — turn off auto-renew to use it next"). App Store Extend Subscription Renewal Date (≤90 d, ≤2 per 365 d) is a support-only admin tool (customer-service compensation, Apple's intended use), never used to fulfil sold gifts.
- Errors: invalid, expired, already redeemed, platform-restricted, already Pass+ elsewhere (still stacks), rate-limited, network. Restore section: "Found Pass+ and one boost" summary from restore result.

### F-169 Crew yearly boost
- Auto-renewing `boost_crew_year`; bound to one crew at purchase (4b-3 ALL YEAR on that crew); buyer gets Pass+ everywhere; crew trips `boostActive` during validity; buyer leaving keeps crew coverage to period end; rebind once per period (4d-1 row); split with ALL YEAR allowed: IOUs created on the first purchase only; renewals are buyer-paid with no automatic IOUs (buyer may add a manual expense).

### Cross-phase hooks (consumed, not rebuilt)
- 4b-1 limit card UI + queued question: P32 (calls entry `guide_limit` → 4e-1).
- 4f-3 last-redraft sheet UI: P28 (wave 12, before this phase) ships it with a placeholder upsell hook; this phase provides `BoostOfferButton` + the 4b-3 route and owns the wiring edit that mounts `BoostOfferButton` in P28's `last-redraft-interstitial.tsx` and `change-day-sheet.tsx` limit state (append-only edit grant).
- 4f-1: this phase builds `SeatCapSheet` (seven seat glyphs, pulsing dashed seat, "$12, or $1.72 each · SPLIT 7 WAYS" preview = P16 split over N+1 incl. pending invitee, buyer absorbs remainder, "Keep it at six" → waitlist toast); it registers itself in P23's seat-limit presenter registry (`features/crew/seat-limit/registry.ts`, append-only edit grant; P23 ships a default waitlist presenter, so no earlier phase imports this sheet). Joiner-side "crew full / waitlist" view is P23's.

## Architecture & contracts
| Area | Delta |
|---|---|
| Kill switch | Purchases, plan changes and boost checkout check `billing.enabled` first through the shared reader (api: `createKillSwitches(pool)` `.middleware(key)` / `.assertOn(key)`; worker: `createKillSwitchReader` from `@cp/db`); off answers `STATE_INVALID {reason: 'switched_off', key}` (api-contracts §4.17), never retried, and the app shows its existing fallback |
| Migrations | `<ts>_billing_subscriptions_transactions.sql`: `subscriptions`, `store_transactions`, `billing_events` (data-model §3.14 verbatim). `<ts>_boosts_grants_codes.sql`: `boost_intents` (partial uk trip_id where open/purchasing), `trip_boosts`, `boost_credits`, `crew_year_grants`, `ftf_grants`, `codes`, `code_redemptions`; expand `expenses.boost_id` fk (P33 table). `<ts>_paywall_impressions.sql`: `paywall_impressions` |
| RLS backstop | `subscriptions`, `code_redemptions`, `paywall_impressions` O read; `boost_intents`, `trip_boosts` T; `boost_credits`, `crew_year_grants`, `ftf_grants` M; `store_transactions`, `billing_events`, `codes` S (no `app_user` grant, unpublished, no `guide_reader`) |
| Publication | add `subscriptions`, `code_redemptions`, `paywall_impressions` (me), `boost_intents`, `trip_boosts` (trip), `boost_credits`, `crew_year_grants`, `ftf_grants` (crews) — allow-list in `packages/db/src/publication.ts` via its own migration |
| Entitlement loaders | `packages/entitlements/src/loaders/billing/{store-sub,trip-boost,ftf,crew-year,code-grant}.ts` registered via P12 `registerSourceLoader()` |
| Commands (§4.15) | `create_boost_intent`, `release_boost_intent`, `fulfil_purchase`, `revoke_purchase`, `move_boost`, `apply_boost_credit`, `redeem_code`, `create_gift`, `set_pause_intent`, `record_paywall_event`. **Doc delta**: `rebind_crew_year {grant_id, crew_id}`; `thank_boost {boost_id}`; `preview_code {code}` read (`GET /v1/codes/{code}/preview`, rate-limited 10/min); error `RESTORE_OTHER_ACCOUNT` |
| Webhook | `/webhooks/revenuecat` → `billing_events` → `billing.apply` (5 retries, DLQ); refetch subscriber via RC REST v2 before acting |
| Jobs | `billing.apply`, `boost.expire` (per-object at `ends_at`), `billing.reconcile` (cron 05:00 SGT), `pause.remind`, `ftf.grant` (on `trip.setup_started`), `boost.reaction` (AI line), `ftf.ending_notify` (per member at end − 3 d) — **doc delta** for the last three |
| Realtime | `user:#uid` `entitlement.changed`; `trip:` `boost.state`, `boost.intent_lock{by_uid, until}`; `crew:` `boost.state`; `crew_chat:` `boost_card` |
| Push | N-33 (governed), N-34, N-37 (billing = ALWAYS, pause remind = BUDGET), N-43 trigger on boost (seat opens), N-44 |
| App Group | writes `snapshot/entitlements.json` via P12 schema on every `entitlement.changed` (writer helper from P48/49 when present; until then a no-op-free direct write through `cp-app-group`) |
| AI | `packages/ai/src/routes/boost-reaction/` Haiku one-liner, persona pack, 1.5 s timeout → template; promptfoo suite (no numbers invented, ≤80 chars, persona voice) |
| Admin | `apps/admin/src/modules/billing/` + `services/api/src/admin/billing/`: user billing timeline, grant/revoke promo time (`code_grant`), partner code batch creation (records Offer Code batches for audit), webhook replay (P17 hook), FTF abuse review |
| Mobile | `apps/mobile/src/data/billing/{revenuecat,products,purchase-machine,restore,listener}.ts`; `features/monetize/{paywall,compare,welcome,boost,boost-card,seat-cap,map-teaser,ftf-ending,plan,codes,gift,governor}/`; routes `(modal)/paywall/{index,compare,welcome}.tsx`, `(modal)/boost/{[tripId],stamped}.tsx`, `you/plan/{index,cancel,billing-issue,redeem,gift}.tsx` |

## Ops console design

Build this phase's console panel to its render (`design/Ops - Billing.dc.html`, `docs/design-renders/pages/Ops-Billing.png`); field → table → command map in `plans/reports/researcher-260928-0214-ops-designs-queues-people-inventory-report.md`. Register the panel's `count`/`work` sources with the phase 58 registry. Sample data in the render is not a spec; AI labels follow D22 routing.

| Gap in the plan | Add in this phase |
|---|---|
| Tiles: webhook lag p95, reconcile drift, failed webhooks 24 h | `GET /v1/admin/billing/health` from `billing_events` timings and the reconcile job output |
| Failed webhook rows with error | `billing_events.error text` (C2) set by `billing.apply`; REPLAY by registering provider `revenuecat` (over `billing_events`) with phase 58's `replay_webhook` registry |
| Offer code batches (name, store, size, redeemed, recorded by) | `offer_code_batches` table + `record_offer_code_batch {name, platform, size, notes}` (support); redemptions counted from the RevenueCat `offer_code` field on `store_transactions` |
| GRANT PROMO TIME: Pass+ or BOOST A TRIP, stacking after store period | `grant_entitlement` gains `trip_id?` for a boost grant (writes `trip_boosts` source promo); stacking rule tested |
| Extend App Store renewal (≤ 90 days, twice a year, "0 of 2 used") | `extend_store_renewal {uid, days, reason}` (support); quota counted from audit rows |
| FTF review ALLOW / REVOKE GRANT | `review_ftf_grant {crew_id, decision: allow\|revoke, reason}` (support) |
| Nav badge | register `count` (failed webhooks 24 h + FTF items to review) |

## Tasks
### T1 — Billing schema, RLS backstop, publication, permission tests
- Goal: all monetization tables live with correct authz.
- Files: `packages/db/src/schema/billing.ts`, `packages/db/migrations/<ts>_billing_subscriptions_transactions.sql`, `<ts>_boosts_grants_codes.sql`, `<ts>_paywall_impressions.sql`, `packages/db/test/permissions/{subscriptions,store-transactions,billing-events,boost-intents,trip-boosts,boost-credits,crew-year-grants,ftf-grants,codes,code-redemptions,paywall-impressions}.test.ts`, `packages/domain/src/billing/{products,states,errors}.ts`.
- Steps: 1. Drizzle tables per data-model §3.14 + `expenses.boost_id` expand. 2. RLS `ENABLE`+`FORCE`, policies, grants per role; S tables revoked from `app_user`/`guide_reader`/`powersync_repl`. 3. Publication allow-list entries. 4. zod state enums matching data-model §3.3/§3.6.
- Tests: `pnpm --filter @cp/db test -- permissions/subscriptions permissions/trip-boosts permissions/codes` (then whole `permissions/`).
- Done when: outsider/ex-member/member/organiser/self matrices pass for all 11 tables; publication CI diff passes; S tables unreadable by `app_user`.

### T2 — RevenueCat webhook, billing.apply, fulfil/revoke, reconcile, entitlement loaders
- Goal: server-side purchase truth.
- Files: `services/api/src/routes/webhooks/revenuecat.ts`, `services/api/src/billing/{rc-client,map-subscriber,grace}.ts`, `services/api/src/commands/billing/{fulfil-purchase,revoke-purchase}.ts`, `services/worker/src/jobs/billing/{apply,reconcile}.ts`, `packages/entitlements/src/loaders/billing/*.ts`, `services/api/test/billing/{webhook,fulfil,revoke,grace}.test.ts`, `services/worker/test/billing/{apply,reconcile}.test.ts`, fixtures `services/api/test/billing/fixtures/*.json` (recorded RC sandbox payloads).
- Steps: 1. Auth header constant-time compare; insert `billing_events` (dupe → 200). 2. `billing.apply` refetches subscriber (RC REST v2, 120 s cap), maps to `subscriptions` state + `store_transactions`. 3. `fulfil_purchase` idempotent on (platform, transaction_id); `client_sync` path verifies via RC before granting. 4. Server grace 7 d: on BILLING_ISSUE set `grace_ends_at`. 5. Loaders → `recomputeUser`. 6. Reconcile cron diff + repair + metric.
- Tests: `pnpm --filter @cp/api test -- billing`; `pnpm --filter @cp/worker test -- billing`.
- Done when: fixture replay of INITIAL_PURCHASE, RENEWAL, CANCELLATION, UNCANCELLATION, BILLING_ISSUE, EXPIRATION, PRODUCT_CHANGE, SUBSCRIPTION_PAUSED, REFUND/revoke yields the expected `subscriptions.status` and `user_entitlements.pass_plus`; replaying any event twice changes nothing.

### T3a — Boost domain: intents, activation, IOUs
- Goal: one locked intent per trip; activation + split IOUs in one txn.
- Files: `services/api/src/commands/boost/{create-boost-intent,release-boost-intent,thank-boost}.ts`, `services/api/src/billing/activate-boost.ts`, `services/worker/src/jobs/billing/intent-expiry.ts`, `services/api/test/billing/{boost-intent,boost-activate}.test.ts`.
- Steps: 1. Intent lock (partial uk) + `BOOST_INTENT_LOCKED{by_uid, until}` + rt lock event; expiry job 15 min. 2. Activation in one txn: `trip_boosts`, P33 `expenses(source=boost)` + shares via P16 split, `domain_events boost.activated`, rt_outbox.
- Tests: `pnpm --filter @cp/api test -- boost-intent boost-activate`; `pnpm --filter @cp/worker test -- intent-expiry`.
- Done when: concurrent intents from two members → exactly one succeeds; split of $11.99 over 7 sums exactly with buyer absorbing remainder; activation replay is idempotent.

### T3b — Boost lifecycle: expiry, move/credit, revoke, FTF, crew yearly
- Goal: correct Boost/FTF/crew-year state across trip changes and refunds.
- Files: `services/api/src/commands/boost/{move-boost,apply-boost-credit,rebind-crew-year}.ts`, `services/api/src/billing/{ftf-eligibility,crew-year}.ts`, `services/worker/src/jobs/billing/{boost-expire,ftf-grant}.ts`, `services/api/test/billing/{ftf,crew-year,boost-revoke,boost-move}.test.ts`.
- Steps: 1. `ends_at` recompute on `trip.dates_changed`. 2. `boost.expire` flips entitlements, emits LA-end event. 3. Cancel → move or credit. 4. Revoke → reversal via P33 API. 5. FTF grant on setup start with abuse hash (account + verified phone hash + device attestation); crew-year grant/rebind rules (IOUs on first purchase only).
- Tests: `pnpm --filter @cp/api test -- ftf crew-year boost-revoke boost-move`; `pnpm --filter @cp/worker test -- boost-expire`.
- Done when: refund reverses only unsettled IOUs; FTF second attempt by same user/crew/phone/device rejected; date change moves `ends_at`; crew-year renewal creates no IOUs.

### T4 — Paywall governor + entry registry + impressions
- Goal: one rule set for every paywall and paywall push.
- Files: `packages/domain/src/paywall/{entries,governor}.ts`, `packages/domain/src/paywall/governor.test.ts`, `services/api/src/commands/paywall/record-paywall-event.ts`, `services/worker/src/jobs/billing/governor-hook.ts` (registers with P11 `notify.route` governor slot), `apps/mobile/src/features/monetize/governor/{use-paywall,PaywallGate}.tsx`, `apps/mobile/src/features/monetize/governor/__tests__/use-paywall.test.tsx`.
- Steps: 1. Entry catalogue with offer + governed + suppress contexts. 2. Pure `canShowPaywall` over impressions, context tags (day-of, help, sos, disruption, error_at), device-tz date. 3. Client `usePaywall(entry, {tripId})` → presents route or returns `suppressed`. 4. Server hook for N-33/crew cards.
- Tests: `pnpm --filter @cp/domain test -- paywall`; `pnpm --filter @cp/mobile test -- monetize/governor`.
- Done when: fast-check properties hold (≤1 unsolicited per local date; suppressed contexts never show; quiet-no blocks entry for that trip; explicit exempt); push path uses the same fn.

### T5 — Mobile billing client: RevenueCat, products, purchase state machine, restore
- Goal: reliable purchase UX primitives on iOS + Android.
- Files: `apps/mobile/src/data/billing/{revenuecat,products,purchase-machine,restore,listener,index}.ts`, `apps/mobile/src/data/billing/__tests__/purchase-machine.test.ts`, `apps/mobile/ios/Critterpass.storekit`, `apps/mobile/.env.example` (RC public keys section only).
- Steps: 1. Configure `react-native-purchases` at launch with uid; `logIn` on uid change. 2. `useProducts()` (localised price, period, per-month, savings %). 3. XState-style machine: idle → purchasing → pending | cancelled | failed | verifying → done | background (timeout 5 s) with `fulfil_purchase{client_sync}` + wait on `entitlement.changed`. 4. Restore with other-account mapping. 5. StoreKit config file mirrors products for local testing.
- Tests: `pnpm --filter @cp/mobile test -- data/billing`.
- Done when: machine tests cover every transition incl. pending → later success via listener; StoreKit config purchase on simulator reaches `done` against local api.

### T6 — Paywall 4e-1, comparison 4e-2, welcome 4e-3
- Goal: final paywall set with disclosures and motion.
- Files: `apps/mobile/src/app/(modal)/paywall/{index,compare,welcome}.tsx`, `apps/mobile/src/features/monetize/paywall/*`, `apps/mobile/src/features/monetize/compare/*`, `apps/mobile/src/features/monetize/welcome/*`, `packages/i18n/locales/en/monetize/`, `apps/mobile/src/features/monetize/paywall/__tests__/*.test.tsx`, `e2e/monetize/paywall-purchase.yaml`.
- Steps: 1. Visa page composition with P05 stickers + motion presets (P06). 2. Toggle + odometer; perk copy from `perks`. 3. Disclosure block + Terms/Privacy links. 4. Undesigned states list above. 5. 4e-2 grid a11y as rows. 6. 4e-3 celebration + route to 3n-5. 7. Register screens `4e-1/2/3` with P07 `registerScreens`.
- Tests: `pnpm --filter @cp/mobile test -- monetize/paywall monetize/compare monetize/welcome`; `maestro test e2e/monetize/paywall-purchase.yaml` (StoreKit test mode / Play test track).
- Done when: render matches `4e-1_Paywall.png`, `4e-2_What_s_in_each.png`, `4e-3_Welcome_to_Pass_.png` in motion-freeze screenshots; a disabled perk disappears from all three without a release; Reduce Motion path passes.

### T7 — Boost sheet 4b-3, checkout bridge 4b-4, stamped 4b-5, seat-cap sheet 4f-1
- Goal: buy a Boost for a trip, cover or split.
- Files: `apps/mobile/src/app/(modal)/boost/{[tripId],stamped}.tsx`, `apps/mobile/src/features/monetize/boost/*`, `apps/mobile/src/features/monetize/seat-cap/SeatCapSheet.tsx`, `apps/mobile/src/features/monetize/index.ts` (exports `BoostOfferButton`, `SeatCapSheet`, `openBoost`), tests `__tests__/*.test.tsx`, `e2e/monetize/boost-split.yaml`.
- Steps: 1. Options + WHO PAYS + split preview (P16). 2. Intent create/lock UI + locked-by-other state. 3. Purchase via T5 machine; verifying beat into stamp. 4. 4b-5 avatars tied to synced share rows. 5. TELL THE CREW → `post_message{type:boost_card}` (P24). 6. SeatCapSheet with N+1 preview and waitlist path; register it in P23's seat-limit presenter registry. 7. Mount `BoostOfferButton` in P28's last-redraft interstitial + REDRAFT_LIMIT state. 8. Every missing state listed in F-162.
- Tests: `pnpm --filter @cp/mobile test -- monetize/boost monetize/seat-cap`; `maestro test e2e/monetize/boost-split.yaml`.
- Done when: sandbox Boost with split creates IOUs visible in P33 Balances on a second device; locked intent shows the other member's name; 4f-1 "Keep it at six" waitlists via P23 command; P23 registry contract test resolves `SeatCapSheet` as presenter; P28 4f-3 BOOST opens 4b-3 with the redraft trip.

### T8 — Crew boost card 4c-1, BOOSTED pill, guide reaction, N-34
- Goal: the crew sees and settles the boost.
- Files: `apps/mobile/src/features/monetize/boost-card/*` (registered into P24 registry), `packages/ai/src/routes/boost-reaction/*`, `packages/ai/evals/boost-reaction/*`, `services/worker/src/jobs/billing/boost-reaction.ts`, `services/worker/src/jobs/billing/notify-registrations.ts` (N-33, N-34, N-37, N-44 via P11 `registerNotification`), tests, `e2e/monetize/boost-card-settle.yaml`.
- Steps: 1. Card states (buyer, member unsettled/settled, cover-it, all settled, revoked/moved, late joiner). 2. Live settled row from `payments` + `crew_money:` hint. 3. THANKS → `thank_boost` + buyer notification. 4. Reaction job (Haiku, template fallback) posting as guide via P24 system path. 5. Notification registrations.
- Tests: `pnpm --filter @cp/mobile test -- monetize/boost-card`; `pnpm --filter @cp/ai eval boost-reaction`; `maestro test e2e/monetize/boost-card-settle.yaml`.
- Done when: settling on device B slides B's avatar into SETTLED on device A without refresh; eval suite passes; N-34 sender is the buyer avatar.

### T9 — Live map teaser 4f-2 and free-trip-ending 4c-2
- Goal: governed, truthful contextual offers.
- Files: `apps/mobile/src/features/monetize/map-teaser/*` (exported `LiveMapGate` used by P39 map route), `apps/mobile/src/features/monetize/ftf-ending/*` (exports `FtfEndingCard` for P47's recap-end arbiter), `apps/mobile/src/app/(modal)/paywall/ftf-ending.tsx`, `services/worker/src/jobs/billing/ftf-ending-notify.ts`, tests, `e2e/monetize/map-teaser.yaml`.
- Steps: 1. Synthetic replay generator from plan stops (deterministic seed) on P14 map components with greyscale scrim. 2. Map-opens stat, per-trip dismissal, post-dismissal chip. 3. Help/SOS bypass (C45). 4. 4c-2 split-flap + chips + CTAs + states; push scheduling at end − 3 d local.
- Tests: `pnpm --filter @cp/mobile test -- monetize/map-teaser monetize/ftf-ending`; `pnpm --filter @cp/worker test -- ftf-ending`; `maestro test e2e/monetize/map-teaser.yaml`.
- Done when: teaser never renders any stored coordinate (test asserts replay derives only from plan stops); open inside a Help session shows the free map; N-33 respects governor and budget.

### T10 — Plan management 4d-1, cancel/pause 4d-2, billing issue 4d-3
- Goal: honest subscription management on both stores.
- Files: `apps/mobile/src/app/you/plan/{index,cancel,billing-issue}.tsx`, `apps/mobile/src/features/monetize/plan/*`, `services/api/src/commands/billing/set-pause-intent.ts`, `services/worker/src/jobs/billing/pause-remind.ts`, tests, `e2e/monetize/plan-manage.yaml`.
- Steps: 1. 4d-1 all states from F-167. 2. Store handoffs (`showManageSubscriptions`, Play subscription centre URL with sku). 3. Pause emulation (iOS) / Play pause deep link; `set_pause_intent`; reminder job. 4. Billing-issue banner component exported for Home/You; 4d-3 recovery polling on foreground. 5. Change plan flows.
- Tests: `pnpm --filter @cp/mobile test -- monetize/plan`; `pnpm --filter @cp/api test -- pause`; `maestro test e2e/monetize/plan-manage.yaml`.
- Done when: fixture BILLING_ISSUE shows 4d-3 with correct grace date and Pass+ still on; pause intent schedules N-37 at resume − 7 d; yearly subscribers never see pause.

### T11 — Codes & gifting 4d-4, gift purchase, Offer Codes, renewal extension
- Goal: redeem gifts/promos compliantly; restore.
- Files: `apps/mobile/src/app/you/plan/{redeem,gift}.tsx`, `apps/mobile/src/features/monetize/{codes,gift}/*`, `services/api/src/commands/billing/{redeem-code,create-gift}.ts`, `services/api/src/billing/{code-hash,extend-renewal,play-defer}.ts`, `services/api/src/routes/codes-preview.ts`, tests, `e2e/monetize/redeem-restore.yaml`.
- Steps: 1. Code generation (HMAC `code_hash`, prefix), preview endpoint + rate limit. 2. `redeem_code` branches: `code_grant` now (non-subscriber) / `code_grant` stacked after store period end (subscriber); extend-renewal + Play defer exposed only via T12 admin support action with reason + audit. 3. Gift purchase flow (design in code) → share link (P21 target `gift`). 4. Boxes UI + envelope flip + Offer Code sheet / Play redeem link. 5. Restore summary.
- Tests: `pnpm --filter @cp/api test -- codes gift`; `pnpm --filter @cp/mobile test -- monetize/codes`; `maestro test e2e/monetize/redeem-restore.yaml`.
- Done when: a sandbox gift purchase yields a code that redeems once on another account and extends entitlement by 90 d (stacked after the store period for a subscriber); no gift redemption calls the Extend Renewal Date API; second redemption returns `CODE_REDEEMED`; restore on a fresh install restores Pass+ + boosts.

### T12 — Admin billing module, observability, store sandbox runbook
- Goal: operable billing.
- Files: `apps/admin/src/modules/billing/*`, `services/api/src/admin/billing/*`, `services/api/test/billing/admin.test.ts`, `e2e/monetize/README.md` (sandbox + Play test-track setup steps for agents).
- Steps: 1. User billing timeline (subscriptions, transactions, events, entitlements). 2. Grant/revoke promo time via command with audit; support-only App Store Extend Renewal Date / Play defer action (reason required). 3. Partner Offer Code batch registry. 4. FTF abuse review list. 5. Metrics: webhook lag, reconcile drift count, purchase funnel events (P19 taxonomy).
- Tests: `pnpm --filter @cp/api test -- billing/admin`; `pnpm --filter @cp/admin test -- billing`.
- Done when: support role can grant 30 d Pass+ with reason and it appears in `ops.admin_audit`; drift metric exported to Grafana.

## Phase acceptance criteria
- [ ] 11 permission test files pass; S tables unreadable by `app_user`, `guide_reader`, `powersync_repl`
- [ ] Recorded RC webhook fixtures for every event type replay idempotently to the expected state
- [ ] Sandbox purchase of each product on iOS and Android activates entitlements; second device updates via `entitlement.changed`
- [ ] Boost split IOUs sum exactly to the charged price; refund reverses only unsettled IOUs
- [ ] Governor properties pass (≤1/day, suppressed contexts, quiet no per trip, explicit exempt), same fn used by push router
- [ ] Paywall/compare/welcome/boost sheets list only `perks.enabled` rows and include 3.1.2 disclosures
- [ ] Live map teaser uses only synthetic replay; Help/SOS map never gated
- [ ] 4d-3 shows no card number, expiry or decline reason; pause offered only to monthly
- [ ] Gift code single-use; gifts fulfilled as stacked `code_grant`; renewal extension only via admin support tool (≤90 d / ≤2 per 365 d)
- [ ] Maestro `e2e/monetize/*` pass on iOS and Android; Reduce Motion and AX3 checks pass
- [ ] No prices hard-coded in UI strings (lint rule / grep check on `\$[0-9]` in `features/monetize`)

## Risks & rollback
| Risk | Mitigation / rollback |
|---|---|
| Webhook delay makes purchase look failed | client_sync fulfil + verifying beat + background completion push |
| Double Boost by two members | DB partial unique + intent lock; duplicate purchase → `boost_credits` (reason duplicate_purchase) |
| App Review 3.1.1/3.1.2 rejection (codes, disclosures, pause copy) | Offer Codes only for promos, IAP-funded gifts, disclosures on every purchase surface, pause emulation copy states "turn off auto-renew"; perks server-driven to withdraw copy without release |
| RevenueCat outage | cached `user_entitlements` keep users entitled; reconcile repairs after; webhooks retried by RC |
| Grace mismatch with store config | server grace independent of store grace; copy uses server `grace_ends_at` |
| Rollback | feature flag `billing.enabled` (P19 flags) hides purchase CTAs; entitlements keep resolving from existing rows |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| App Store Connect: products, subscription groups, Offer Codes, Server API key, sandbox testers; Paid Apps agreement + banking (needs legal entity D18) | StoreKit config file testing only; purchase CTAs hidden behind `billing.enabled=false` |
| Play Console: products/base plans, RTDN topic, test track, service account | Android purchase CTAs hidden by flag |
| RevenueCat project (iOS + Android apps, webhook secret, REST key) | same flag; entitlement still from codes/FTF |
| Price tier confirmation ($59.99 crew yearly, $11.99 boost) | use listed tiers |
| Counsel review of paywall/pause/gift copy and consumer-law disclosures (EU/VN) | ship with disclosures above; copy keys editable server-side |

## Open questions
1. Crew yearly renewals with split — default (in F-169): IOUs only on first purchase; renewals are buyer-paid (no automatic IOUs). Confirm.
2. Gift length vs extension cap — default: gift = 90 days exactly (fits App Store cap); longer gifts stack as `code_grant`.
3. `gift_pass_3m` product type — default: consumable (non-renewing), one per purchase; 3.1.1 "credits never expire" applies to unredeemed codes (no expiry).
4. Doc delta: add `rebind_crew_year`, `thank_boost`, `preview_code`, error `RESTORE_OTHER_ACCOUNT`, `CODE_REDEEMED`, jobs `ftf.grant`, `boost.reaction`, `ftf.ending_notify`, `billing.intent_expiry` to api-contracts / api-contracts-async.
5. Does the BOOSTED stamp persist as a passport stamp? Default: no (not a trip stamp; C7 unaffected).
6. EU alternative payments (from 2026-10-01) — default: not offered at launch; IAP only.
7. Split members for Boost — default: seated participants (RSVP ≠ out) at purchase time; later joiners owe nothing.
