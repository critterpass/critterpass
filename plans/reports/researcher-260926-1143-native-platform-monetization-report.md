# Research: native platform capabilities + monetization compliance (Critterpass)

- **Date:** 2026-09-26. **OS context verified:** iOS 27 shipped 2026-09-14; iOS 26 on 79% of all iPhones in June 2026. Android 17 went stable 2026-06-16. Play requires targetSdk 36 for updates from 2026-08-31.
- **Scope:**
  - Screens: 5a-1..6, 5b-1..4, 5c-1..5, 3l-4, 4a..4f.
  - Related native bits: 3c-3 calendar heatmap, 3n-5 icons, 3p shake/rating, 3m-9 postcard.
- **Method:** Apple docs pulled as DocC JSON (`developer.apple.com/tutorials/data/documentation/...`), plus the App Review Guidelines HTML (Last Updated 2026-06-08), Android and Play docs, vendor pricing pages, court coverage, and `gh` for SDK activity. Unverified items are marked **UNVERIFIED**.
- **Builds on:** the design analyses `design-analysis-260926-1143-off-app-native-surfaces-report.md` and `design-analysis-260926-1143-subscriptions-report.md`. This report re-verifies their platform claims and adds policy and pricing.
- **Legend in tables:**
  - **F** = feasible as designed.
  - **FC** = feasible with caveats.
  - **NF** = not feasible as drawn; a workaround is listed.

---

## 0. Headline verdicts

1. **Almost all of 5a/5b/5c is buildable natively. Three things are not buildable as drawn.**
   - **Custom full-screen alarm UI (5b-3) on iOS.** AlarmKit rings through Focus and Silent, but its alert UI is system-rendered: title, stop button, one secondary button, tint colour.
   - **Continuous motion on system surfaces.** This covers the gecko walking, avatars sliding, the breathing StandBy gecko, the page-flip, and "Tokek waves on unlock". Live Activities ignore animation modifiers.
   - **"+ opens the system widget sheet" (5c-5) on iOS.** There is no public API, and none was found for iOS 27.
2. **"I'M UP works from the lock screen without opening the app" is feasible, with one caveat: authentication.**
   - Apple: "On a locked device, buttons and toggles are inactive and the system doesn't perform actions unless a person authenticates and unlocks their device."
   - Face ID usually authenticates on glance, so it feels instant. Touch ID, masks and passcode-only phones will prompt.
   - The fan-out to every crew phone works through **iOS 18 broadcast channels**, with one push per channel.
3. **Recommend minimum iOS 26.** AlarmKit, scheduled Live Activity start and WidgetKit push are all iOS 26+. Broadcast is 18+. With iOS 26 as the floor, three of the design's core promises need no fallback. Adoption is high (79% of all iPhones by June 2026).
4. **Encounters "keep counting in your pocket" (5a-4, 3l-4) are feasible, with a permission trade-off.**
   - A terminated app is relaunched by region monitoring only with **Always** authorization.
   - When-In-Use works only while a `CLBackgroundActivitySession` started in the foreground keeps the app alive.
   - The 50 m dwell is below practical geofence resolution. Android recommends a 100–150 m minimum radius and has 2–6 min background latency. So the dwell needs continuous GPS near spots.
   - A Live Activity itself "can't access the network or receive location updates". The app must feed it.
5. **Monetization is compliant if every digital unlock uses IAP.**
   - This covers Pass+, Boost, All-Year and gifts bought in-app.
   - **IOUs must stay a ledger that never gates perks.** Guideline 3.2.1(vii): a person-to-person gift "connected to or associated at any point in time with receiving digital content or services must use in-app purchase".
   - Unlocking features for other users through one purchase is not prohibited. Discord sells "1 Server Boost Monthly" via iOS IAP.
6. **The App Store has no subscription pause.** Play has one, but it is limited to 1–3 months, starts only after the current period ends, and is user-initiated. The 4d-2 "pause Nov→Mar on a yearly plan" is not implementable on either store as drawn, so it needs emulation.
7. **Custom code boxes (4d-4) are allowed only for gifts of IAP items.**
   - Partner and promo codes must be Apple Offer Codes / Play promo codes, or be redeemed on the web under 3.1.3(b).
   - Guideline 3.1.1 bans "their own mechanisms to unlock content ... license keys ... QR codes".
8. **The printed postcard perk (3m-9) conflicts with 3.1.3(e).** Physical goods "must use purchase methods other than in-app purchase". Bundling it into an IAP subscription is a grey area with no precedent found. Decouple it.
9. **US anti-steering (September 2026).**
   - **Apple:** US-storefront apps may link to web checkout with no entitlement, currently at 0% commission. The Ninth Circuit (Dec 2025) allows "a reasonable commission" on remand. The Supreme Court granted cert on 2026-06-30. Treat the 0% as provisional.
   - **Google:** since 2026-06-30 the service fee is 10% (first $1M, and all subscriptions) plus a 5% billing fee when using Play Billing. US external links still pay the service fee, so link-outs save about 5% minus Stripe fees on Android.
10. **New WWDC26 fact that affects Pass+: Apple Group Purchases are on by default.**
    - One buyer purchases multiple seats and invites others via Apple's flow. This covers StoreKit 2 auto-renewables. Launch is "winter 2026"; volume purchasing starts ~2026-10-22.
    - Decide now whether to opt Pass+ out, or handle `Transaction.OwnershipType.assigned`.

---

## 1. Context

- The design is iPhone-first (390×844). It relies on iOS-only surfaces (Dynamic Island, AlarmKit alert, StandBy), yet the marketing says "Free on iPhone and Android".
- Cross-platform crews are expected. Entitlements and fan-out must be server-side and platform-neutral.
- The off-app surfaces carry critter art. The Canvas2D JS renderer (doodles.js, critters-draw-*.js) cannot run in any extension, so all art on these surfaces must be pre-rendered raster/vector assets.
- Monetization (4*):
  - **Pass+** follows the user. It is $3.99/mo or $29.99/yr.
  - **Trip Boost** covers one trip for the whole crew. It is $12, or $59 "ALL YEAR".
  - **First trip free.** The cost split is recorded in Balances.
  - Also in scope: gift, promo and partner codes; restore; grace; "pause until next trip"; the postcard perk.

## 2. Evaluation criteria (tied to screens)

| # | Criterion | Screens driving it |
|---|---|---|
| C1 | Act from the lock screen without opening the app | 5a-1 I'M UP, 5a-2 RUNNING LATE/SOS, 5b-2 vote, 5c-1 vote widget, 5c-2 NUDGE DEV |
| C2 | Crew-wide near-real-time fan-out to 6–16 phones | 5a-1 pips "4 OF 6 UP", 5a-2 positions/ETAs, 5a-6 "all six lock screens" |
| C3 | Wake-up reliability through DND/Silent, offline | 5b-3 alarm, 5c-4 StandBy alarm, 5b-4 "ALWAYS GETS THROUGH" |
| C4 | Background dwell tracking: accuracy, battery, permission | 5a-4, 3l-4, 3g crew map |
| C5 | Critter art and motion fidelity on system surfaces | 5a-*, 5c-*, 5b-2 poster |
| C6 | Android parity | all |
| C7 | Store and policy review risk | Always location, Communication Notifications, FSI, background location, IAP rules |
| C8 | OS coverage for the minimum version | all |
| C9 | Monetization compliance | 4b-3 split, 4d-2 pause, 4d-3 retry, 4d-4 codes, 3m-9 postcard |
| C10 | Engineering and operating cost | all |

---

## 3. Options matrices (1 = poor, 5 = best)

### 3.1 Minimum iOS version

| Option | C1 | C2 | C3 | C8 coverage | C10 effort | Total | Notes |
|---|---|---|---|---|---|---|---|
| **iOS 26 min** | 4 | 5 | 5 | 4 | 5 | **23** | AlarmKit, scheduled LA start, widget push, broadcast all native. 79% of iPhones on iOS 26 (Jun 2026); iOS 27 is out. |
| iOS 18 min + fallbacks | 4 | 5 | 2 | 5 | 3 | 19 | Below 26 the alarm is only a Time Sensitive notification, which does not ring through Silent. Needs dual code paths. |
| iOS 17.2 min | 4 | 3 | 2 | 5 | 2 | 16 | No broadcast channels, so per-device fan-out (N pushes). No AlarmKit. |

### 3.2 Leave-by alarm through DND (5b-3)

| Option | Rings through Silent/Focus | Custom UI | Policy risk | Offline | Total |
|---|---|---|---|---|---|
| **AlarmKit (iOS 26+) + custom countdown LA/Dynamic Island** | 5 ("overrides both a device's focus and silent mode") | 2 (system alert; custom art only in the LA/Island countdown) | 4 (usage string; review scrutiny reports exist) | 5 (scheduled locally) | **16** |
| Time Sensitive notification | 2 (breaks Focus/summary, not the Silent switch) | 2 | 5 | 5 (local) | 14 |
| Critical Alerts entitlement | 5 | 1 | 1 (health, home or public safety only; "extremely rare") | 5 | 12 |
| Live Activity alert only | 1 | 4 | 5 | 2 (push) | 12 |

### 3.3 Encounter background location (5a-4, 3l-4)

| Option | Works when app killed | Permission friction | Battery | Review risk | Accuracy for 50 m | Total |
|---|---|---|---|---|---|---|
| A. **Always** + `CLMonitor` (≤20 conditions, rotate nearest spots) → background relaunch → high-accuracy `CLLocationUpdate.liveUpdates` near spot | 5 | 2 | 4 | 3 | 4 | **18** |
| B. **When-In-Use "trip-day session"** (`CLBackgroundActivitySession` started in foreground; blue pill) | 2 (dies if terminated) | 4 | 2 (continuous) | 5 | 5 | **18** |
| C. Foreground-only (camera open) | 1 | 5 | 5 | 5 | 5 | 21, but breaks "phone in pocket" |
| D. Significant-change only | 4 | 2 | 5 | 3 | 1 (km-scale) | 15 |

**Pick: B by default, then offer A as an upgrade after the first successful encounter.** C covers users who decline both. Android mirrors this: an FGS started from visible UI (WIU), or geofence + `ACCESS_BACKGROUND_LOCATION`.

### 3.4 Crew fan-out for Live Activities (5a-1 pips, 5a-2)

| Option | Pushes per event | Offline catch-up | Min iOS | Budget risk | Total |
|---|---|---|---|---|---|
| **Broadcast channel per LeaveBy/MeetUp** (`apns-channel-id`) | 1 | 5 ("Most Recent Message Stored", ≤8 h) | 18 | 4 (10,000 channels per environment; delete after) | **19** |
| Per-activity push tokens | N (6–16) | 3 (apns-expiration) | 16.2 | 3 | 15 |
| Device-side polling | 0 | 1 | any | 1 (LAs can't use network) | NF |

### 3.5 Subscription infrastructure

| Criterion | RevenueCat | Adapty | Superwall | Direct StoreKit 2 + Play Billing |
|---|---|---|---|---|
| Store plumbing (validation, ASSN v2, RTDN) | 5 | 5 | 4 (infra newer) | 2 (build it) |
| Cross-platform entitlements | 5 | 5 | 4 | 3 |
| Server-granted, time-boxed entitlement for crew/gifts | 4 (promotional entitlement, `end_time_ms`) | 4 (grant access level, `expires_at`) | 2 (**UNVERIFIED** API) | 5 |
| Consumable Boost ledger | 3 (`NON_RENEWING_PURCHASE` webhook; own ledger) | 3 | 3 | 3 |
| Webhooks | 5 | 5 | 5 | 4 |
| Paywall builder / experiments (low value: 4e-1 is bespoke animated UI) | 3 | 4 | 5 | 1 |
| Web checkout (US link-out) | 4 (RevenueCat Billing, Web-to-App) | 3 | 4 (Stripe App2Web) | 2 |
| Cost | Free to $2.5k MTR, then 1% of tracked revenue | Free to $5k/30 d, then 1% | Infra free; paywalls 1% of attributed revenue over $10k/mo | 0% + ~4–8 eng-weeks (estimate) |
| Maturity / activity (gh) | purchases-ios 5.91.0 (2026-09-23), 3.07k stars | iOS 4.2.0 (2026-09-25) | iOS 4.17.0 (2026-09-22), 174 stars | n/a |
| **Total (excluding cost)** | **29** | **29** | 27 | 20 |

RevenueCat and Adapty tie. **RevenueCat wins on ecosystem maturity and web billing.** Adapty wins if the $2.5k–$5k MTR band matters.

### 3.6 "Pause until next trip" (4d-2)

| Option | App Store | Play | User value | Revenue | Complexity | Total |
|---|---|---|---|---|---|---|
| **Auto-renew off + server reminder T−30 d before next trip + win-back / promo offer** | F | F | 4 | 4 | 3 | **15** |
| Native Play pause (1–3 months, after current period) | NF | F | 3 | 4 | 4 | n/a on iOS |
| Renewal-date extension API (≤90 days, ≤2×/365 d; intended for outages; user keeps access) | FC | Play `defer` (user keeps access) | 5 | 1 | 3 | 12 |
| Downgrade tier "Pass+ Keep" (~$0.99/mo in the same group: icons and avatar only) | F | F | 3 | 3 | 3 | 12 |

### 3.7 Gift / promo / partner codes (4d-4)

| Option | 3.1.1 compliance | Cross-platform | "Renewal moves" copy | Total |
|---|---|---|---|---|
| **Gift bought via IAP (consumable) → server code → in-app redeem** | F ("Apps may enable gifting of items that are eligible for in-app purchase") | F (server entitlement) | FC (server time; Apple renewal can't move) | **Best for gifts** |
| **Apple Offer Codes / Play promo codes** for partner airlines and promos | F (system sheet `offerCodeRedemption`) | Per-store codes | F on iOS (applies at next renewal for active subscribers) | **Best for partners** |
| Own codes with no IAP behind them (partner, free) | NF on iOS ("own mechanisms ... license keys") | — | — | reject |
| Web-bought codes redeemed on the website (3.1.3(b)) | F if the item also exists as IAP | F | FC | fallback |

---

## 4. Deep-dives

### 4.1 Live Activities (ActivityKit, iOS 26/27)

**Facts (Apple docs, accessed 2026-09-26)**

- **Duration:** "active for up to eight hours ... remains on the Lock Screen ... up to four additional hours ... maximum of 12 hours".
  - So "switches off at midnight on the last day" (5a-2/5a-6) must be **one LA per meet-up**, not one per trip.
  - Long-haul flights (5a-3) need an end followed by a restart.
- **Size:** static + dynamic data ≤ **4 KB**. A crew of 16 fits only with compact state: initials, progress 0–100, ETA in minutes.
- **Sandbox:** "can't access the network or receive location updates".
  - The app or pushes must feed every change.
  - Images must be local and at or below presentation size. Minimal presentation is ≤45×36.67 pt, and oversize "might fail to start".
  - Load images from the App Group container.
- **Motion:** "the system ignores any animation modifiers". Only content transitions animate: blur text, image cross-fade, opacity/move/slide/push, `numericText`.
  - Timers use `Text(timerInterval:)` and `ProgressView(timerInterval:)`, which keep counting without updates.
- **Start options:**
  - Foreground `Activity.request`.
  - `LiveActivityIntent` from the background.
  - **Scheduled start** `request(...start:)` (**iOS 26**), which requires `AlertConfiguration`. Scheduled activities count toward the undocumented concurrent limit.
  - **Push-to-start** (17.2+). It needs an `alert`, and `input-push-channel` / `input-push-token` (18+). "You can't use broadcast push notifications to start a Live Activity."
- **Budgets:**
  - Priority 10 is budgeted per hour. Priority 5 "doesn't count toward the budget".
  - `NSSupportsLiveActivitiesFrequentUpdates` gives a higher budget, but the user can disable it (`frequentPushesEnabled`).
  - Priority 5/1 may be "grouped and delivered in bursts".
  - Push-to-start has a separate, **undocumented** budget (community reports).
- **Broadcast (18+):**
  - The capability can be enabled only on developer.apple.com, not in Xcode.
  - Up to 10,000 channels per environment; delete them after use.
  - Storage policy: "No Message Stored" (higher budget) or "Most Recent Message Stored" (≤8 h).
  - Payload ≤5 KB. Best-effort, may reorder.
- **Buttons:**
  - `Button(intent:)` with a `LiveActivityIntent` "runs ... in the app's process".
  - Locked device: requires authentication (see §0.2).
  - No actions in CarPlay.
- **Dynamic Island:**
  - Compact / minimal / expanded regions. `relevanceScore` chooses which of our LAs shows.
  - iOS 27: compact and minimal also appear in **landscape**, where they "don't have room to grow in width" (WWDC26 session 223). Check the 5a-5 compact "Tokek + minutes".
- **Other surfaces:** LAs appear in StandBy (full-screen scaled; `isActivityFullscreen`), on Apple Watch, on CarPlay and on a paired Mac.

**"I'M UP" end-to-end (5a-1 → every crew phone)**

1. The tap on `Button(intent: ImUpIntent(leaveById))` triggers system auth (Face ID glance). `perform()` then runs in the app process in the background.
2. `perform()` first does an optimistic local `activity.update` (own pip green). It then makes an idempotent `POST /leave-by/{id}/up`, authenticated with a token in a Keychain item readable after first unlock.
3. The server writes state and sends **one** `liveactivity` push with `apns-channel-id = leaveBy.channelId`.
   - Priority 10 when it changes "N OF 6 UP". Priority 5 for cosmetic updates.
   - Channel created with "Most Recent Message Stored", so phones offline at the villa catch up.
4. Every iOS 18+ device subscribed to the channel re-renders.
   - Android: FCM high-priority data to each member, or an FCM topic. The app re-posts its Live Update. FCM keeps high priority only if a user-visible notification results, which an updated ongoing notification satisfies.
5. Side effects: a WidgetKit push (budgeted) and a crew-chat system message.

**Lifecycle per surface**

- **Leave-by:**
  - At plan sync, the app schedules the LA with `start:` (iOS 26), e.g. at T−3 h or bedtime, plus the AlarmKit alarm.
  - If the plan changes while the app is dead: push-to-start with `input-push-channel` as the visible fallback, plus a background push to reschedule the alarm (throttled, best-effort).
  - Reconcile on every launch.
- **Crew meet-up (boost):** push-to-start to each boosted member's device (each needs a push-to-start token, so the app must have launched once). One channel per meet-up. End with `dismissal-date` at arrival.
- **Flight (Pass+, email import):**
  - Server push-to-start on the morning of the flight, driven by a flight-status provider.
  - The "orange at T−10" state needs a server push at T−10. There is no local scheduled-update API.
  - "Flips to pickup on landing" = update on the landed webhook.
- **Critter nearby:**
  - The app, running in the background due to location, cannot `request` an LA. It must ask the server for a push-to-start (seconds of latency), then drive local `activity.update` from location callbacks.
  - Ring: `ProgressView(timerInterval:)` while inside the ring. "Drains slowly" = app updates with a new state and interval.

### 4.2 Widgets (WidgetKit)

- **Refresh budget:** "typically 40 to 70 refreshes" a day, i.e. every 15–60 min. Entries should be ≥~5 min apart.
  - Budget exemptions: app in foreground, StandBy display refresh.
  - WidgetKit push (**iOS 26**, `WidgetPushHandler`, `apns-push-type: widgets`) is "budgets ... delivers them opportunistically".
  - Widgets cannot use broadcast channels.
  - **So 5c-2 "CREW, LIVE" cannot be live.** Show "as of HH:MM"; the LA is the live surface.
- **Interactivity:**
  - `Button`/`Toggle(intent:)` (iOS 17). `AppIntent` runs in the widget-extension process unless it is a `LiveActivityIntent` or `openAppWhenRun`.
  - Locked device requires auth, same as LAs.
  - Toggles update optimistically. No API reverts them if the user cancels unlock (Apple forum, Nov 2024).
- **Rendering modes:**
  - `fullColor` / `accented` / `vibrant`. Lock screen is vibrant (5c-3 monochrome critter).
  - Home screen **tinted/clear (Liquid Glass)** uses accented mode: "Tints opaque images with a single white color" and removes the background.
  - So every widget needs accented-mode art, via `.widgetAccentedRenderingMode(...)` (iOS 18).
- **Families:**
  - Lock screen: `accessoryInline` / `Circular` / `Rectangular`.
  - StandBy: `systemSmall`. Night-mode tint is system-controlled.
  - iOS 27 adds `systemExtraLargePortrait` (optional).
- **Gallery (5c-5):** no public "add widget" API was found (**UNVERIFIED for iOS 27**). Build an animated how-to instead. Detect installs with `WidgetCenter.getCurrentConfigurations`.

### 4.3 Alarm (5b-3, 5c-4)

- **AlarmKit (iOS/iPadOS 26):**
  - Requires `NSAlarmKitUsageDescription` (if missing, alarms can't be scheduled) and `AlarmManager.requestAuthorization()`.
  - Presentations: Alert, Countdown, Paused.
  - Alert = title + stop button + optional secondary button. Secondary behaviour is `.countdown` ("Repeat") or `.custom` ("Open").
  - Supports `stopIntent` / `secondaryIntent` App Intents, a tint colour, and a custom countdown LA in the widget extension ("AlarmKit expects a widget extension if an app supports a countdown presentation. Otherwise ... fail to alert").
  - The alert is forwarded to Apple Watch.
- **Mapping to the design:**
  - **Snooze-once:** the secondary button is `.custom`. Its intent cancels the alarm and schedules a new one 5 min later with **no** secondary button. If there is no stop within N min, the server sends the "crew knock". Needs a device prototype.
  - **Slide-to-confirm UI:** NF. Put Tokek art and the trail in the countdown LA / Dynamic Island / StandBy.
  - **Pip ticked on stop:** via `stopIntent` → server → broadcast. **UNVERIFIED** whether `stopIntent` executes before unlock. Prototype it.
  - "Allowed for leave-by times only" is app logic, because AlarmKit authorization is app-wide.
- **Critical Alerts:** HIG says "extremely rare and typically come from governmental and public agencies or apps that help people manage their health or home". A travel app, including crew SOS, should not expect approval.
- **Time Sensitive:**
  - Use for the "ALWAYS GETS THROUGH" class (5b-4) and SOS/flight changes. HIG: the event must be "happening now or will happen within an hour".
  - The system lets users turn it off after the first one.
  - "**Never** use the Time Sensitive interruption level to send a marketing notification". This applies to 4c-2.
- **Android:**
  - `AlarmManager.setAlarmClock()` needs `SCHEDULE_EXACT_ALARM`. It is denied by default on 14+ for new installs that aren't calendar/alarm apps, so request it via `ACTION_REQUEST_SCHEDULE_EXACT_ALARM`.
  - `USE_EXACT_ALARM` is Play-restricted to core alarm/calendar apps, so Critterpass is ineligible.
  - Full-screen intent: auto-grant only for core alarm/calling apps (enforced 2025-01-22). Others must obtain user consent and "gracefully degrade".
  - With both grants, the **full custom 5b-3 design is feasible** as a full-screen Activity plus a `USAGE_ALARM` channel.

### 4.4 Notifications (5b)

- **Communication Notifications:**
  - Need the capability, `NSUserActivityTypes: INSendMessageIntent`, NSE `content.updating(from: intent)`, and `INPerson` + `INImage`.
  - The avatar replaces the icon and the app icon becomes a badge.
  - They "break through the scheduled notification summary by default, and can also break through a Focus".
  - HIG scopes them to "direct communication — like a phone call or message".
  - **Verdict:**
    - Guide and crewmate **chat messages** in crew chat (the guide is a chat participant, 3g) = legitimate.
    - Tips, roundup and "Balances" as senders = semantic misuse. Risk: user confusion, and Focus "allowed people" oddities. Review enforcement is **UNVERIFIED**.
    - For those, use normal notifications with a titled persona ("Tokek · Bali") and a guide thumbnail attachment.
- **Vote without unlocking (5b-2):**
  - `UNNotificationAction` without `.authenticationRequired` runs in the background while locked. That option exists to "prompt the user to unlock".
  - The animated poster comes from a **Notification Content Extension** (a UIViewController, so animation is OK). Per-vote labels are set via `extensionContext.notificationActions` (iOS 12+). The stamp comes from the action handler updating the view.
  - The banner version shows the stamp by re-posting with the same identifier or `apns-collapse-id`.
  - Caveat: if Show Previews = When Unlocked (common), the long-press expand needs Face ID.
- **Summaries:**
  - Scheduled Summary: Time Sensitive and communication notifications bypass it. `relevanceScore` 0–1 picks the featured item.
  - Apple Intelligence summaries are user-toggled per category in iOS 26.
  - The 20:00 roundup (5b-1) and ping budget (5b-4) are **server-side** policies, with the per-user timezone in trip-local time.
  - Locally scheduled notifications (alarms, reminders) bypass the server, so the client must count them.
- **Marketing pushes:**
  - Guideline 4.5.4 and HIG require explicit opt-in consent UI plus an in-app opt-out.
  - This applies to 4c-2 "3 days left on your free first trip" and to Boost/Pass+ nudges.
- **Android:**
  - `MessagingStyle` + `Person(icon)` + long-lived shortcut → conversation section (for "real-time conversations").
  - Actions run on the lock screen unless `setAuthenticationRequired(true)`.
  - BigPicture gives a static poster. There is no animated expanded notification.

### 4.5 Background location / encounters

- **Region monitoring:**
  - `CLMonitor` (iOS 17) is capped at 20 conditions per app. It "can only occur after the user unlocks the device after a reboot".
  - Relaunching a terminated app ("region monitoring ... significant location change, visits") requires **Always**.
- **When-In-Use:**
  - The app keeps running in the background only while location services are active and a `CLBackgroundActivitySession` (iOS 17) exists. The session must be created in the foreground.
  - `CLServiceSession` (iOS 18) declares the authorization needs and must be recreated on relaunch.
- **LPSE (`com.apple.developer.location.push`):**
  - Server queries location via `location` pushes. Needs Always. About **360 events per 24 h**.
  - For "apps that allow individuals to share their location with other people that they explicitly approve". It fits the 3g crew map and SOS 1-h share.
  - Whether Apple must approve the entitlement is **UNVERIFIED**.
- **Review:**
  - 5.1.5 ("only when directly relevant ... explain the purpose").
  - 2.5.4 (background location "only for their intended purposes").
  - Justify Always by encounters plus crew meet-up. Ask for it contextually after the user sees value.
- **Android:**
  - Geofences: 100 per app. Recommended minimum radius 100–150 m. Background latency usually <2 min, 2–3 min with limits, up to 6 min when stationary.
  - Needs `ACCESS_BACKGROUND_LOCATION`.
  - A geofence transition is an exemption for starting an FGS from the background. Android 14+ while-in-use FGS types can't start from the background unless the app holds background location.
  - Play background location requires a declaration form, a ≤30 s video and a prominent disclosure ("location" + "background/when the app is closed").
  - Play's examples of acceptable use are navigation, delivery tracking, child safety and fitness. A game-like collectible is **not** a listed example, so review risk is medium.
- **Spoofing:** check `CLLocation.sourceInformation.isSimulatedBySoftware` (iOS 15+) and Android `Location.isMock()` (API 31). Both are from memory, **UNVERIFIED this session**. Validate server-side (dwell plausibility).

### 4.6 Other native bits

- **Alternate icons (3n-5, 4e-3):**
  - Xcode 26 uses Icon Composer files per alternate icon (these carry light/dark/tinted/clear appearances), `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`, and `setAlternateIconName`.
  - "The system automatically displays an alert" on every change.
  - All icons must ship in the binary, so "earned critter icons" must be a bounded set, not 150.
  - Reverting on Pass+ lapse needs the app in the foreground.
  - Android: one `activity-alias` per icon, toggled via `setComponentEnabledSetting(... DONT_KILL_APP)`. Launcher-dependent quirks; shortcut loss on API ≤28 (blog source, low confidence). Supply a monochrome layer for themed icons.
- **Rating prompt (3p):**
  - iOS: `RequestReviewAction` / `AppStore.requestReview`, shown at most 3× per 365 days. Guideline 5.6.1 disallows custom review prompts.
  - Play In-App Review has a time-bound quota (≈1/month). No pre-question ("Do you like the app?") and no CTA button.
- **Shake to report (3p):**
  - iOS `motionEnded(.motionShake)`. Users can disable Shake to Undo (`UIAccessibility.isShakeToUndoEnabled`); whether events still arrive is **UNVERIFIED**.
  - Always offer a menu path (WCAG 2.5.4).
  - Android: accelerometer while in the foreground.
- **Calendar heatmap (3c-3):**
  - iOS EventKit **cannot request read-only**: "To read events ... your app needs full access" (`NSCalendarsFullAccessUsageDescription`). This is a heavy prompt.
  - Compute busy blocks on device and upload only anonymised weekly availability.
  - Google Calendar API scopes `calendar.freebusy` / `calendar.events.freebusy` are the narrowest. Sensitivity class and verification need are **UNVERIFIED** (the scope page lists no class).
  - Android `READ_CALENDAR` via CalendarContract covers device-synced Google accounts without OAuth. **Recommend device calendars first, Google OAuth later.**

### 4.7 Android surfaces

- **Live Updates (Android 16+):**
  - Requirements: a qualifying style (Standard / BigText / Call / **ProgressStyle** / **MetricStyle** (Android 17)), `POST_PROMOTED_NOTIFICATIONS`, `setRequestPromotedOngoing(true)`, ongoing, a content title, **no** `customContentView`, not colorized, not a group summary, and a non-MIN channel.
  - Status-bar chip via `setShortCriticalText` / chronometer countdown.
  - **Allowed:** active navigation, rideshare, delivery. **Not allowed:** "Ads, promotions, chat messages, alerts, upcoming calendar events". Updates must be "actively in progress, with a distinct start and end" and "most ... explicitly triggered by the user".
  - Consequences:
    - Leave-by must start only in the active window, e.g. from wake-up. It can't sit there overnight.
    - Critter nearby should first be a normal notification "Start encounter", and become a Live Update only after the tap.
    - The vote-closing LA is not allowed.
- **MetricStyle (Android 17):** up to 3 metrics, "health and fitness apps, timers, and travel". Fits flight day (gate, boarding, seat) and meet-up (ETA, distance).
- **Samsung Now Bar** consumes Live Updates (One UI 8; more third-party types in One UI 9). This is press coverage.
- **Glance:**
  - 1.2.0 stable (2026-08-26); 1.3.0-alpha02.
  - Android 17 (target 37) enforces a RemoteViews bitmap memory cap (1.5 × w × h × 4), so pre-size critter bitmaps.
  - Lock-screen widgets are Pixel "hub" only (16 QPR2); no inline/circular families. StandBy ≈ hub mode / DreamService.
  - `requestPinAppWidget` enables 5c-5 "+".
- **Platform floor:** target SDK 36 is required for updates (2026-08-31). Play Billing Library ≥8 is required; 9.1.0 is current.

### 4.8 Monetization compliance, item by item

| Item | App Store (Guidelines, 2026-06-08) | Google Play | Verdict / implementation |
|---|---|---|---|
| Pass+ auto-renew $3.99 / $29.99 | 3.1.2(a) OK (≥7 days, all devices); 3.1.2(c) terms before buy; one group, 2 levels | Subscription, 2 base plans | **F.** Paywall 4e-1 must add renewal terms, price per period, ToS/Privacy and Restore (already has RESTORE). |
| One purchase unlocks features for the whole crew (Boost) | No prohibition; 3.1.1 only requires IAP for unlocks. Precedent: Discord "1 Server Boost Monthly" via iOS IAP. | Play Billing required for in-app features; no rule against group benefit | **F.** Boost = **consumable** (repeatable per trip). The server binds it to the trip and grants perks to members on any platform. |
| Boost restore / history | Finished consumables absent from `Transaction.all` unless `SKIncludeConsumableInAppPurchaseHistory=true` (iOS 18) | consumed purchases not restorable | **FC:** server ledger is the source of truth; use `appAccountToken` = user UUID. |
| Boost credit moved to next trip | 3.1.1 "credits ... may not expire" | — | Moved/unused boost credit must never expire. |
| Cost split as IOUs in Balances | 3.2.1(vii): P2P money gifts OK without IAP only if not connected to digital content | P2P payments exempt from Play Billing | **FC:** Balances records the share only. **Perks never depend on settlement.** No in-app payment rail on boost lines (no "Pay $2 now" via Stripe/Venmo inside the boost card). Settlement happens off-app or as a generic balance settle. Copy: "Maya owes you $2", not "pay to unlock". |
| "ALL YEAR" $59 (crew + buyer Pass+) | 3.1.2(b): avoid "multiple variations of the same thing" | extra base plan / product | **Recommend** an auto-renew yearly tier **in the Pass+ group** ("Crew Year" > Pass+ yearly), which gives Apple upgrade/proration for free. Alternative: non-renewing 12-month product. |
| First trip free | Free server grant is not an IAP trial (no Tier-0 rule applies) | same | **F.** The reminder push (4c-2) is marketing and needs opt-in (4.5.4). Never Time Sensitive. |
| Checkout sheet (4b-4) | System sheet; can't show "Split $2 each", card or email | Play sheet likewise | **FC:** show the split in app UI before and after. Charged currency = storefront, not USD. |
| Billing retry / grace (4d-3) | Retry up to 60 days; grace **3, 16 or 28 days** (monthly+); StoreKit `Message.Reason.billingIssue` sheet (iOS 16.4); link `apps.apple.com/account/billing` | Grace configurable (on by default); account hold = 60 d − grace | **FC:** "7 more days" copy won't match Apple, so pick 16 d and make the copy dynamic. Card last-4/expiry are unavailable. |
| Pause (4d-2) | No store pause | Pause 1–3 months (incl. annual), after the current period, user-initiated; `defer` API (keeps access) | **NF as drawn.** Emulate (§3.6). Use Apple Retention Messaging (ASC/API, "coming this fall" 2026) for custom cancel-flow messaging and offers. |
| Cancel / change plan (4d-1/4d-2) | Must go through store UI: `AppStore.showManageSubscriptions` | Play subscription centre deep link | **FC:** "asks once more in a sheet" becomes the system sheet. |
| Gift from Maya (4d-4) | 3.1.1: gifting IAP items OK; digital gift cards "can only be sold in your app using IAP" | no gifting API; Play promo codes limited | **FC:** gift = IAP consumable (e.g. "3 months Pass+ gift"). Server issues a code/link; the recipient redeems in-app → server entitlement. "Renewal moves" only if the recipient has no active store subscription. Otherwise gift time queues or converts. |
| Partner-airline / promo codes | Own unlock codes banned (3.1.1). Use **Offer Codes**: all IAP types (subs iOS 14.2; others iOS 16.3), ≤10 active offers, ≤1,000,000 codes/app/quarter, redeem sheet in-app | Promo codes: subs 10k/quarter/product (custom 2k–99,999 uses, in-app only); one-time products 500/quarter total | **FC:** per-store code pools. For cross-platform partners, prefer web redemption (3.1.3(b)). |
| Restore (4d-4) | `AppStore.sync()`; required mechanism for restorable items | `queryPurchasesAsync` | **F.** Also link purchases made before sign-in (anonymous-first) via `appAccountToken`. |
| Printed postcard perk (3m-9) | 3.1.3(e) physical goods "must use purchase methods other than IAP"; no ruling found on bundling | physical goods exempt from Play Billing | **FC / risk.** Option A: a free "thank-you" not listed as a purchase benefit. Option B: sell postcards via Apple Pay / Stripe, with Pass+ giving a discount. **Ask App Review before launch.** |
| US external purchase links | 3.1.1(a)/3.1.3: US storefront may include "buttons, external links, or other calls to action"; currently 0% commission (provisional) | US external content links / alt billing; service fees payable from 2026-10-01 (deadline 2026-12-01); new tiers from 2026-06-30 | **Optional, later.** Only meaningful for the iOS US Boost (per-person split checkout on web). |
| Apple Group Purchases (WWDC26) | On by default for StoreKit 2 auto-renewables; family-shared subs opted out | n/a | **Decide:** opt Pass+ out (recommended) or handle `.assigned` ownership. |

### 4.9 Store fee math (per unit; excludes taxes/VAT; USD list prices)

| Product | App Store, Small Business Program (15%) | App Store standard (> $1M) | Play, first $1M/yr (10% service + 5% billing) | Play > $1M, new installs |
|---|---|---|---|---|
| Pass+ $29.99/yr | $25.49 | 30% yr 1 → $20.99; 15% after a year of paid service (15% rule **UNVERIFIED** this session) | $25.49 | recurring 10% + 5% → $25.49 |
| Pass+ $3.99/mo | $3.39 | $2.79 | $3.39 | $3.39 |
| Trip Boost $12 | $10.20 | $8.40 | $10.20 | non-recurring 20% + 5% → $9.00 |
| All-Year $59 | $50.15 | $41.30 | $50.15 | recurring → $50.15 |

- **Vendor fees at total MTR:**
  - $10k: RevenueCat $100/mo; Adapty $100/mo; Superwall infra $0.
  - $50k: RevenueCat $500; Adapty $500.
- US web checkout for Boost saves about $1.80 − Stripe fee per $12 on iOS while the 0% holds. Stripe pricing was **UNVERIFIED** this session.
- APNs/FCM: no per-message price found. Not re-verified; assumed free.

---

## 5. Per-feature feasibility (iOS 26+ min, Android 16+ for Live Updates)

| ID | Feature | iOS | Android | Workaround / notes |
|---|---|---|---|---|
| 5a-1 | Leave-by LA: trail with legs + countdown | FC | FC | Static gecko per leg + `ProgressView(timerInterval:)`. Android ProgressStyle points + tracker icon + chronometer, started only in the active window. |
| 5a-1 | "Tokek walks the trail" continuous motion | NF | NF | Per-leg state changes with content transitions. |
| 5a-1 | I'M UP from the lock screen, no app open | FC | F | iOS needs device auth (Face ID glance). Android action without auth. |
| 5a-1 | Crew pips update on all phones | F | FC | iOS 18 broadcast channel. Android FCM per member/topic. |
| 5a-1 | Pips shown on a FREE trip | F (tech) | F | Product conflict (FREE vs BOOST) is an owner decision. |
| 5a-2 | Crew converging: positions sliding to flag | FC | FC | Positions update per push (priority 5, ~60 s, may burst). ProgressStyle has a single tracker, so Android shows a text ETA list. Needs every member's background location (Always / LPSE / session). |
| 5a-2 | RUNNING LATE / SOS buttons | FC | F | LiveActivityIntent + server. SOS needs a confirm step. |
| 5a-2 | Ends at meet-up; off at midnight on last day | F | F | One LA per meet-up (8 h cap). |
| 5a-3 | Flight LA auto-starts from email import | FC | FC | Server push-to-start (token after first launch). Android Live Update (MetricStyle on 17). |
| 5a-3 | Orange at T−10; flips to pickup on landing | FC | F | Server pushes at T−10 and on the landed webhook. Long-haul > 8 h: end + restart. |
| 5a-4 | Critter nearby LA keeps counting when locked | FC | FC | App alive via location (session or Always) → local updates. LA start via push-to-start. Android: tap-to-start encounter, then FGS location + Live Update (linear bar, not ring). |
| 5a-4 | Silhouette sharpens; ring drains when leaving | F | FC | Pre-bundled stage images; state updates. |
| 5a-5 | Dynamic Island compact/minimal/expanded + 2 buttons | F | NF → FC | Android: status-bar chip / Now Bar. iOS 27 landscape: narrow compact. |
| 5a-5 | "Pulse yellow + double tap" at 03:10 | FC | FC | Alert update (sound). Custom haptic pattern not controllable. The alarm itself is AlarmKit. |
| 5a-6 | Boost upsell with mini lock-screen demo | F | F | In-app UI. |
| 5a-6 | Crew LA on all 6 phones | FC | FC | Push-to-start per device; each must allow LAs and location. |
| 5b-1 | Guide/crewmate avatar as sender | FC | FC | Communication Notifications for chat messages only. Others: titled persona + thumbnail. Android MessagingStyle. |
| 5b-1 | 20:00 roundup batching | F | F | Server scheduler in trip-local tz. Android InboxStyle. |
| 5b-2 | Vote via actions without unlock | F | F | No `.authenticationRequired`; idempotent ballot endpoint; ~30 s background. |
| 5b-2 | Rich animated poster on long-press | FC | NF → FC | Content Extension (auth needed if previews hidden). Android: static BigPicture. |
| 5b-2 | Vote stamp lands on the notification | FC | F | Content ext updates view; banner re-posted with the same id / collapse-id. |
| 5b-3 | Alarm rings through DND/Silent | F | FC | AlarmKit. Android needs user-granted exact alarm + FSI. |
| 5b-3 | Custom full-screen alarm UI (glow, Tokek, slide) | NF | FC | iOS: system alert + custom countdown LA/Island/StandBy art. Android full custom Activity. |
| 5b-3 | Snooze once, then crew ping | FC | F | Reschedule-without-snooze trick + server knock; prototype. |
| 5b-3 | Slide ticks your pip everywhere | FC | F | `stopIntent` → server; execution-when-locked **UNVERIFIED**. |
| 5b-4 | Ping budget + overflow to roundup | F | F | Server router; client counts local notifications. |
| 5b-4 | "Always gets through" class | FC | FC | Time Sensitive (user can disable). SOS is not Critical. Android high-importance channel. |
| 5c-1 | Countdown widget flips at midnight | FC | FC | Timeline entry at midnight; no page-flip or wave animation. |
| 5c-1 | Interactive vote widget, rolling count, result on close | FC | F | `Button(intent:)`, `.numericText` transition, entry at close + widget push. Lock-screen use needs auth. |
| 5c-2 | Today large widget: strike finished stops, forecast line | FC | F | Entries per stop end; forecast via widget push (budgeted). |
| 5c-2 | NUDGE DEV from widget | F | F | AppIntent in extension; shared Keychain / App Group auth. |
| 5c-2 | Crew widget with live dots (boost) | FC | FC | Minutes-stale; live view = LA. |
| 5c-3 | Lock-screen inline / ring / vote / Critterdex, tinted | F | NF → FC | vibrant/accented art. Android Pixel hub widgets only; no inline/circular. |
| 5c-4 | StandBy: sleeping Tokek, digits flip, alarm on the right | FC | FC | systemSmall + `Text(timerInterval)`. No breathing/flip animation. Night tint is system. Alarm = AlarmKit countdown LA. Android hub mode / DreamService (full animation possible). |
| 5c-5 | Gallery with live previews + locked states | F | F | Same SwiftUI/Glance views in app; entitlement snapshot in App Group. |
| 5c-5 | "+" opens system widget sheet | NF | F | iOS instructions overlay. Android `requestPinAppWidget`. |
| 3l-4 | Camera encounter, critter hops between spots | F | F | ARKit/RealityKit or 2D overlay on camera. Pre-rendered critter sprites. |
| 3l-4 | 50 m dwell detection (incl. locked) | FC | FC | §3.3. Filter by horizontal accuracy. Anti-spoof checks. |
| 3l-4 | Hold-to-befriend ring, legendary-day rules | F | F | Client UI + server rules. |
| 4e-1 | Visa paywall, monthly/yearly toggle, RESTORE | F | F | Add required subscription terms and links. |
| 4e-2 | Comparison table | F | F | — |
| 4e-3 | Welcome → PICK A NEW ICON | F | FC | System alert on icon change. Android alias. |
| 4a-1..3 | Rejected directions | n/a | n/a | Not built. |
| 4b-1 | 30/day guide limit, "Maya has Pass+ → ask in crew chat" | F | F | Server quota. Group benefit from one subscriber is allowed; add a fair-use cap. |
| 4b-2 | Compare (superseded) | n/a | n/a | Use 4e-2. |
| 4b-3 | Boost $12 / All-Year $59, I'll cover vs split | FC | FC | Consumable + (auto-renew tier or non-renewing). Split = ledger only (§4.8). |
| 4b-4 | Store sheet with split line + card | FC | FC | System sheet can't show split/card; show them in app. |
| 4b-5 | Stamped + IOUs added to Balances | F | F | After server-verified transaction. |
| 4c-1 | Crew sees "Boosted by Winston" + perks | F | F | Server entitlements; cross-platform. |
| 4c-2 | Free-boost-ending reminder push | FC | FC | Marketing opt-in required; not Time Sensitive; don't gate the album on settle-up. |
| 4d-1 | Your plan: renewal, change plan, payment method | FC | FC | Store manage sheet / deep links; no card data. |
| 4d-2 | Cancel with "pause until Kyoto" | NF | FC | §3.6 emulation. Play native pause ≤3 months after the period. |
| 4d-3 | Card declined, 7-day grace | FC | FC | Apple grace 3/16/28; billingIssue sheet; generic copy. |
| 4d-4 | Redeem gift/promo/partner code | FC | FC | §3.7. |
| 4d-4 | Restore purchases | F | F | Boosts from server ledger. |
| 4f-1..3 | Contextual limit prompts (7th seat, live map teaser, last redraft) | F | F | Server; synthetic map replay for privacy. |
| 3m-9 | Printed postcard mailed per crew member (Pass+) | FC | FC | Physical goods outside IAP (§4.8). |

---

## 6. Recommendation

**Native-surface stack:**
- iOS 26 minimum. Swift/SwiftUI extensions: Widget (widgets + LA + AlarmKit countdown), NSE, Content Extension, App Intents.
- Android minSdk decided by the app-stack report, with feature gating: Live Updates 36+, MetricStyle 37+. Target 36.
- A server-side **surface orchestrator**:
  - APNs token + broadcast channels (iOS 18+ path) + push-to-start + widget push.
  - FCM high-priority data per member.
  - Notification router enforcing the ping budget, roundup, Time Sensitive class and marketing consent.
- Specific choices:
  - **Alarm:** AlarmKit with custom countdown-LA art. Android exact alarm + FSI with user grants and graceful degrade.
  - **Encounters:** trip-day When-In-Use session by default, with an optional Always upgrade. Android FGS-from-UI by default, with optional background-location geofences.
  - **Crew live data:** in-app realtime plus LA broadcast, with LPSE considered for the crew map.
  - **Communication Notifications:** crew chat messages only.

**Monetization:**
- **RevenueCat** for store plumbing (StoreKit 2 + Play Billing, ASSN v2/RTDN, webhooks).
- **Own entitlement service** as the authority for trip/crew-scoped perks: Boost, first-trip-free, gifts, Crew Year. It resolves `passPlus(u)`, `boostActive(t)` and similar, and pushes snapshots to the App Group / widgets.
- IAP for all digital items:
  - Pass+ = auto-renew group with monthly/yearly.
  - Crew Year = higher tier in the same group.
  - Boost = consumable.
  - Gifts = consumable.
- Partner codes via Apple Offer Codes / Play promo codes.
- IOUs are ledger-only and never gate perks.
- Pause is emulated: auto-renew off + reminder/win-back + Retention Messaging; native pause on Play.
- Grace period: Apple 16 d, Play aligned.
- Opt Pass+ **out** of Apple Group Purchases and Family Sharing for v1.
- Postcard decoupled from IAP.
- No US web checkout at launch.

**Runner-up:**
- Same surface design with **iOS 18 minimum** (Time Sensitive fallback for the <26 alarm, push-to-start instead of scheduled start).
- **Adapty** instead of RevenueCat: equal features, $5k free threshold.

**Flip conditions:**
- Launch analytics or target market show >~15–20% of target users on iOS <26 at launch → iOS 18 min with fallbacks.
- App Review rejects AlarmKit use for leave-by, or `stopIntent` can't run locked → Time Sensitive + LA-only wake, and drop the "rings through DND" promise on iOS.
- Always location rejected or conversion is poor → session-only encounters, with copy "keep Critterpass open in your pocket".
- MTR > ~$100k/mo (RevenueCat ≈ $1k/mo) → negotiate RevenueCat Enterprise, or evaluate Superwall's free infra / direct StoreKit 2.
- Superwall infra proven mature (server-grant API, consumables) → switch to save 1%.
- Apple link-out commission settles low (<~10%) and US Boost volume is material → add a US web checkout for Boost with a true per-person split.
- Apple Group Purchases prove cross-platform-friendly → revisit Crew Year as a seat purchase (it is currently iOS-only by nature).

## 7. Cost / effort estimates (engineering, own estimates, not sourced)

- **iOS extensions** (widgets ×6 + 4 LA types + Island states + AlarmKit + NSE + content ext + intents + accented/vibrant art pipeline): ~8–12 eng-weeks.
- **Orchestrator server** (tokens, channels lifecycle/GC, push-to-start, widget push, FCM, router/budget/roundup): ~4–6 eng-weeks.
- **Android parity** (Glance widgets, Live Updates, alarm/FSI, FGS location, permissions UX): ~6–10 eng-weeks.
- **Monetization** (RevenueCat integration, entitlement service, Boost ledger/split, gifts/codes, lifecycle UIs 4d-*): ~5–7 eng-weeks. Direct StoreKit 2/Play Billing instead adds ~4–8.
- **Art:** pre-rendered critter asset set for extensions (sizes × rendering modes × stages). This is a design-pipeline task that uses the Canvas2D renderer offline to export PNG/PDF.

## 8. Risks + mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Push-to-start budget undocumented; LA may silently not start (device or user settings, concurrent limit) | Critter/crew/flight LAs missing | Always pair with a Time Sensitive notification fallback. Log `liveactivitiesd`. Keep ≤2–3 concurrent LAs via `relevanceScore`. |
| Lock-screen buttons need auth | "No unlock" promise weaker on Touch ID devices | Copy: "tap I'M UP". Also accept via AlarmKit stop and the notification action. |
| AlarmKit alarm can't be rescheduled remotely | Stale alarm after plan change | Background push reschedule (best-effort) + push-to-start LA with updated time + reconcile on launch + server crew-knock fallback. |
| Always-location review / consent | Encounter reach | Session default; contextual Always ask; Android declaration video prepared early. |
| Battery drain from GPS near spots | Uninstalls | High accuracy only inside the 150 m geofence; stop on stationary; cap per-day minutes. |
| Communication Notifications misuse | Review or UX issues | Chat messages only. |
| Broadcast channel leak (10k cap) | Fan-out failure at scale | Channel per event with TTL GC job; per crew-day channel if needed. |
| Widget freshness (40–70/day) | "Live" widgets stale | Timestamp labels; LA for live data. |
| IOU seen as off-IAP payment for digital service (3.2.1(vii)) | Rejection | Ledger only; perks unconditional; no payment rail on boost lines. |
| Postcard perk vs 3.1.3(e) | Rejection | Decouple; pre-submission question to App Review. |
| Own gift/partner codes vs 3.1.1 | Rejection | IAP-backed gifts only; Offer Codes / promo codes for partners. |
| Store grace mismatch (7 d copy) | Copy wrong | Dynamic copy from the server's grace end date. |
| Group Purchases on by default | Unexpected `.assigned` Pass+ holders | Opt out in App Store Connect before rollout (volume ~2026-10-22; group winter 2026). |
| US link-out commission reversal (SCOTUS / remand) | Web-checkout economics | Don't build web checkout until settled. |
| Android OEM battery killers / FSI denial | Alarm fails | Permission health screen; fallback high-importance notification; crew knock. |
| Android 17 RemoteViews bitmap cap | Widget crash | Pre-size bitmaps; test on target 37. |

## 9. Decisions the product owner must make

1. **Minimum iOS:**
   - (a) 26 (recommended);
   - (b) 18 with a degraded alarm;
   - (c) 17.2.
   - Android v1 scope: (a) full parity where possible; (b) reduced (no StandBy, no lock-screen widgets, no animated vote poster).
2. **iOS alarm look:**
   - (a) accept the AlarmKit system alert, with Tokek only in the countdown LA/Island/StandBy;
   - (b) drop "rings through DND" and use a Time Sensitive notification with a custom LA.
3. **Encounter location model:**
   - (a) trip-day session by default + optional Always (recommended);
   - (b) ask Always up front;
   - (c) foreground-only.
4. **Crew live (5a-2) consent:**
   - (a) opt-in per member per meet-up;
   - (b) per trip-day;
   - (c) per trip.
   - Also whether to use LPSE.
5. **Leave-by crew pips on FREE trips:** (a) yes, visible to all (5a-1 badge); (b) own-only unless boosted.
6. **Guide-as-sender notifications:** (a) chat only (recommended); (b) all guide-voiced notifications as communication notifications (review/UX risk).
7. **Pause emulation:**
   - (a) auto-renew off + reminder + win-back (recommended);
   - (b) renewal extension ≤90 d;
   - (c) "Pass+ Keep" low tier;
   - (d) drop pause and offer "Boost-only" instead.
8. **Grace period:** (a) 16 d; (b) 28 d; (c) 3 d. Also Play alignment.
9. **Crew Year $59 product:** (a) top tier in the Pass+ group (recommended); (b) non-renewing 12 months; (c) Apple Group Purchase (iOS-only).
10. **Gifts:**
    - (a) IAP gift consumable + server code (recommended);
    - (b) Apple Offer Codes pool sold via IAP;
    - (c) web-only gifting.
    - For partner airlines: Offer Codes/promo codes vs web redemption.
11. **Postcard perk:** (a) free thank-you, not a listed purchase benefit; (b) paid via Apple Pay/Stripe with a Pass+ discount; (c) drop.
12. **US web checkout:** (a) never; (b) after the legal dust settles (recommended); (c) at launch for Boost split.
13. **Apple Group Purchases / Family Sharing for Pass+:** (a) opt out both (recommended); (b) enable Family Sharing; (c) enable group seats.
14. **Subscription infra:** (a) RevenueCat (recommended); (b) Adapty; (c) Superwall; (d) direct.
15. **Marketing push consent:** a single opt-in at onboarding vs contextual. Which notifications count as marketing (4c-2, upsells)?
16. **Calendar sync v1:** (a) device calendars only (recommended); (b) plus Google OAuth free/busy (verification effort).

## 10. Key claims

| Claim | Source URL | Date | Confidence |
|---|---|---|---|
| LA active ≤8 h, on Lock Screen ≤12 h total; 4 KB data cap; LA can't access network/location; animation modifiers ignored | https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities | accessed 2026-09-26 | High |
| Scheduled LA start `request(...start:)` iOS 26, needs AlertConfiguration, counts toward limit | https://developer.apple.com/documentation/activitykit/activity/request(attributes:content:pushtype:style:alertconfiguration:start:) | accessed 2026-09-26 | High |
| Push-to-start 17.2; start payload needs alert; `input-push-channel`/`input-push-token` iOS 18; broadcast can't start LAs; priority 5 not budgeted; frequent-updates key user-revocable | https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications | accessed 2026-09-26 | High |
| 10,000 channels per environment; storage policies; Most Recent ≤8 h | https://developer.apple.com/documentation/usernotifications/sending-channel-management-requests-to-apns | accessed 2026-09-26 | High |
| Broadcast payload ≤5 KB; best-effort; low/medium may burst | https://developer.apple.com/documentation/usernotifications/sending-broadcast-push-notification-requests-to-apns | accessed 2026-09-26 | High |
| Widget/LA buttons inactive on locked device until auth; LiveActivityIntent runs in app process | https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities | accessed 2026-09-26 | High |
| No API to revert widget toggle after cancelled unlock | https://developer.apple.com/forums/thread/766780 | 2024-11 | Medium |
| Push-to-start budget undocumented | https://dev.to/hellomisterdev/why-your-ios-live-activity-silently-stops-updating-lmd | n/d | Low |
| iOS 27: compact/minimal in landscape, narrow width | https://developer.apple.com/videos/play/wwdc2026/223/ | 2026-06 | Medium |
| Widget budget 40–70/day; entries ≥~5 min; StandBy refresh not budgeted | https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date | accessed 2026-09-26 | High |
| WidgetKit push iOS 26; budgeted; no broadcast for widgets | https://developer.apple.com/documentation/widgetkit/updating-widgets-with-widgetkit-push-notifications ; https://developer.apple.com/documentation/widgetkit/widgetpushhandler | accessed 2026-09-26 | High |
| Tinted/clear home screen → accented mode, images tinted white, background removed | https://developer.apple.com/documentation/widgetkit/optimizing-your-widget-for-accented-rendering-mode-and-liquid-glass | accessed 2026-09-26 | High |
| `systemExtraLargePortrait` iOS 27 | https://developer.apple.com/documentation/widgetkit/widgetfamily/systemextralargeportrait | accessed 2026-09-26 | High |
| AlarmKit iOS 26; overrides focus+silent; alert = title/stop/secondary; widget ext required for countdown; usage string required | https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit | accessed 2026-09-26 | High |
| Time Sensitive breaks Focus/summary, user can turn off; within an hour; never for marketing | https://developer.apple.com/design/human-interface-guidelines/managing-notifications | accessed 2026-09-26 | High |
| Critical = entitlement; "extremely rare", health/home/government | same HIG + https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts | accessed 2026-09-26 | High |
| Communication notifications: avatars, break through summary/Focus; for direct communication | https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications ; https://developer.apple.com/design/human-interface-guidelines/notifications | accessed 2026-09-26 | High |
| `.authenticationRequired` = unlocked-only actions (so omit for lock-screen voting) | https://developer.apple.com/documentation/usernotifications/unnotificationactionoptions/authenticationrequired | accessed 2026-09-26 | High |
| CLMonitor ≤20 conditions; works after first unlock | https://developer.apple.com/documentation/corelocation/monitoring-the-user-s-proximity-to-geographic-regions | accessed 2026-09-26 | High |
| Only Always relaunches terminated app for region/SLC/visits | https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services | accessed 2026-09-26 | High |
| CLBackgroundActivitySession (iOS 17) keeps WIU app in use; CLServiceSession (iOS 18) | https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background | accessed 2026-09-26 | High |
| LPSE ~360 events/24 h, needs Always, for approved location sharing | https://developer.apple.com/documentation/corelocation/creating-a-location-push-service-extension | accessed 2026-09-26 | High |
| Alternate icons via Icon Composer; system alert on change | https://developer.apple.com/documentation/xcode/configuring-your-app-to-use-alternate-app-icons | accessed 2026-09-26 | High |
| Review prompt ≤3 per 365 days; custom prompts disallowed (5.6.1) | https://developer.apple.com/documentation/storekit/requesting-app-store-reviews ; https://developer.apple.com/app-store/review/guidelines/ | 2026-06-08 | High |
| EventKit read requires full access (no read-only) | https://developer.apple.com/documentation/eventkit/accessing-the-event-store | accessed 2026-09-26 | High |
| Guidelines 3.1.1 (own unlock mechanisms banned; gifting OK; gift cards via IAP; credits don't expire), 3.1.2, 3.1.3(b)(e), 3.2.1(vii), 4.5.4, 5.1.5, US-storefront link exception | https://developer.apple.com/app-store/review/guidelines/ | Last Updated 2026-06-08 | High |
| Ninth Circuit Dec 2025 upheld contempt, allows reasonable commission on remand | https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple | 2025-12 | Medium |
| SCOTUS cert granted 2026-06-30; district court continuing commission determination | https://www.courthousenews.com/apples-fight-over-commissions-for-linked-out-app-store-purchases-continues-in-federal-court/ | 2026-08-11 | Medium |
| US link-outs currently 0% commission | https://stora.sh/blog/2026-05-16-apple-app-store-external-purchase-links-implementation-guide | 2026-05-16 | Medium |
| Offer Codes all IAP types; ≤10 active offers; ≤1M codes/quarter; existing subs apply next renewal | https://developer.apple.com/documentation/storekit/supporting-offer-codes-in-your-app | accessed 2026-09-26 | High |
| Apple billing retry ≤60 d; grace 3/16/28 (monthly+) | https://developer.apple.com/documentation/storekit/reducing-involuntary-subscriber-churn | accessed 2026-09-26 | High |
| Renewal extension ≤90 d, ≤2 per 365 d, for outages | https://developer.apple.com/documentation/appstoreserverapi/extending-the-renewal-date-for-auto-renewable-subscriptions | accessed 2026-09-26 | High |
| `billingIssue` message sheet iOS 16.4; `showManageSubscriptions` | https://developer.apple.com/documentation/storekit/message/reason-swift.struct/billingissue | accessed 2026-09-26 | High |
| Finished consumables hidden unless `SKIncludeConsumableInAppPurchaseHistory` (iOS 18) | https://developer.apple.com/documentation/bundleresources/information-property-list/skincludeconsumableinapppurchasehistory | accessed 2026-09-26 | High |
| WWDC26: Group Purchases (winter 2026), Retention Messaging (fall), on by default for StoreKit 2 auto-renewables | https://developer.apple.com/wwdc26/guides/app-store/ ; https://developer.apple.com/videos/play/wwdc2026/391/ | 2026-06 | High |
| Multiseat on by default; volume launch 2026-10-22 | https://bleepingswift.com/blog/multiseat-subscriptions-app-store-connect | 2026-09-22 | Medium |
| Small Business Program 15% (≤$1M) | https://developer.apple.com/app-store/small-business-program/ | accessed 2026-09-26 | High |
| Discord sells Server Boost via iOS IAP | https://support.discord.com/hc/en-us/articles/26487124247319-iOS-Purchases-on-Discord-FAQ | n/d | Medium |
| Play fees from 2026-06-30 (US/UK/EEA): 10% first $1M & subs; non-recurring 20% new / 25% existing; +5% billing fee | https://support.google.com/googleplay/android-developer/answer/16954621 ; https://android-developers.googleblog.com/2026/06/play-expanded-billing.html | 2026-06-24 | High |
| US external links/alt billing fees payable from 2026-10-01 (deadline 2026-12-01) | https://support.google.com/googleplay/android-developer/answer/16470497 | 2026 | Medium |
| Play pause 1–3 months (annual incl.), after current period; grace/account hold 60 d total; `defer` API | https://developer.android.com/google/play/billing/lifecycle/subscriptions | accessed 2026-09-26 | High |
| Play promo codes: 500/quarter one-time; 10k/quarter/sub; custom sub codes in-app only | https://support.google.com/googleplay/android-developer/answer/6321495 | accessed 2026-09-26 | High |
| PBL 9.1.0 current; ≥8 required from 2026-08-31 | https://developer.android.com/google/play/billing/release-notes | 2026-06-18 | Medium |
| Live Update requirements + allowed/disallowed uses | https://developer.android.com/develop/ui/views/notifications/live-update | accessed 2026-09-26 | High |
| MetricStyle Android 17, ≤3 metrics, travel use case | https://developer.android.com/develop/ui/views/notifications/metric-style | accessed 2026-09-26 | High |
| SCHEDULE_EXACT_ALARM default-denied 14+; setAlarmClock needs it; USE_EXACT_ALARM policy-restricted | https://developer.android.com/about/versions/14/changes/schedule-exact-alarms | accessed 2026-09-26 | High |
| FSI auto-grant only core alarm/calling; enforcement 2025-01-22 | https://support.google.com/googleplay/android-developer/answer/13392821 | accessed 2026-09-26 | High |
| Geofence: 100/app, min radius 100–150 m, latency 2–6 min, needs background location | https://developer.android.com/develop/sensors-and-location/location/geofencing | accessed 2026-09-26 | High |
| FGS background-start exemptions incl. geofence; while-in-use FGS restriction 14+ | https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start | accessed 2026-09-26 | Medium (summarised by fetch tool) |
| Play background location: declaration + video + prominent disclosure | https://support.google.com/googleplay/android-developer/answer/9799150 | accessed 2026-09-26 | High |
| FCM high priority deprioritised without user-visible notification | https://firebase.google.com/docs/cloud-messaging/android/message-priority | updated 2026-09-24 | High |
| Glance 1.2.0 stable 2026-08-26 | https://developer.android.com/jetpack/androidx/releases/glance | 2026-08-26 | High |
| Android 17 widget RemoteViews bitmap memory cap (target 37) | https://developer.android.com/about/versions/17/behavior-changes-17 | accessed 2026-09-26 | High |
| Android 17 stable 2026-06-16 | https://www.androidauthority.com/android-17-3561251/ | 2026 | Medium |
| Target SDK 36 required from 2026-08-31 | https://support.google.com/googleplay/android-developer/answer/11926878 | 2026 | Medium (via search) |
| Play In-App Review quota ~monthly; no pre-questions or CTA | https://developer.android.com/guide/playcore/in-app-review | accessed 2026-09-26 | High |
| iOS 27 released 2026-09-14 | https://www.macrumors.com/2026/09/09/apple-announces-ios-27-release-date/ | 2026-09-09 | Medium |
| iOS 26 on 79% of all iPhones (June 2026) | https://www.macrumors.com/2026/06/09/ios-26-adoption-stats-wwdc/ | 2026-06-09 | Medium |
| RevenueCat free to $2.5k MTR then 1%; Adapty free to $5k then 1%; Superwall infra free, paywalls 1% over $10k | https://www.revenuecat.com/pricing/ ; https://adapty.io/pricing/ ; https://superwall.com/pricing | accessed 2026-09-26 | High |
| RevenueCat promotional entitlement with `end_time_ms`; Adapty grant access level `expires_at` | https://docs-origin.revenuecat.com/docs/promotionals ; https://adapty.io/docs/api-adapty/operations/grantAccessLevel | accessed 2026-09-26 | Medium |
| RevenueCat consumables tracked outside RevenueCat; `NON_RENEWING_PURCHASE` webhook | https://www.revenuecat.com/docs/platform-resources/non-subscriptions | accessed 2026-09-26 | High |
| Google Calendar scopes incl. `calendar.freebusy`, `calendar.events.freebusy` | https://developers.google.com/workspace/calendar/api/auth | accessed 2026-09-26 | High (sensitivity class UNVERIFIED) |

## 11. Unresolved questions

1. Does AlarmKit `stopIntent` / `secondaryIntent` execute before device unlock? Can the "reschedule without snooze" pattern replace an alerting alarm? Needs a device prototype.
2. Push-to-start budget and behaviour after the user force-quits the app on iOS 26/27 (undocumented).
3. The concurrent-LA limit per app/device (undocumented). Critterpass could have leave-by + crew + critter + flight at once.
4. Does `com.apple.developer.location.push` (LPSE) need an Apple approval request? Would Critterpass's crew-share qualify?
5. Is there an iOS 27 API to open the add-widget sheet? None found.
6. Google Calendar `calendar.freebusy` sensitivity classification and verification effort.
7. App Review stance on a mailed physical perk bundled into an IAP subscription (3.1.3(e)). No precedent found. Ask App Review.
8. App Review stance on Communication Notifications from AI personas. No published rule found.
9. Whether in-app redemption of **web-purchased** codes is acceptable on the US storefront post-2025 (vs web-only redemption).
10. Final Apple link-out commission (remand / SCOTUS, 2026–27).
11. Apple price-point availability for exactly $12.00 vs $11.99 (not checked). How storefront currencies map to the "$2 each" IOU.
12. Google Play grace-period default days per billing period (docs say default-on, adjustable). Exact value not captured.
13. Whether Apple Group Purchases' `.assigned` holders appear in RevenueCat entitlements correctly.
14. Superwall infra: a server-side grant API for time-boxed crew entitlements? Maturity?
15. `Person.setBot` / Android guidance for bot senders in the conversation space. Not found in docs.
16. `UIAccessibility.isShakeToUndoEnabled = false`: are shake motion events still delivered to apps?
17. Android "hub mode" / lock-screen widget availability beyond Pixel (Samsung One UI 9?).
18. Stripe and APNs/FCM pricing were not re-verified this session.
