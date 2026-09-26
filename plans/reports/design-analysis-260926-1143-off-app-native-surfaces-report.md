# Design analysis: off-app native surfaces (5a Live Activities + Dynamic Island, 5b Notifications, 5c Widgets + StandBy)

- **Date:** 2026-09-26
- **Screens (15):** 5a-1 to 5a-6, 5b-1 to 5b-4, 5c-1 to 5c-5.
- **Also in this slice (not phone screens):**
  - Spec card "DYNAMIC ISLAND · EVERY STATE" (inside the 5a-6 range).
  - Spec card "WHO GETS WHAT, OFF THE APP" (after 5c-5).
- **Sources:**
  - `design/Critterpass.dc.html`, chars 1174663 to 1306635.
  - Prototype handlers `proto-script.js` (lines 662–687).
  - Motion presets in `design/doodles.js`.
  - Rendered shots.
  - Platform research (see §9).
- **Stance:** stack-agnostic. OS capabilities are named explicitly.

---

## 0. Headline findings

1. **The designed motion mostly can't run on system surfaces.**
   - Affected surfaces: widgets, Live Activities, the Dynamic Island, notification banners and StandBy. None can run continuous animation or the Canvas2D critter renderer.
   - Lost: Tokek walking the trail, avatars sliding, the breathing StandBy gecko, "Tokek waves when you unlock", flip digits, the island "pulse yellow".
   - What remains: at most a system transition when content updates, plus system-driven timers and progress (`Text(timerInterval:)`, `ProgressView(timerInterval:)`).
   - The one exception is the long-press notification content extension, which runs arbitrary native views, so the animated vote poster there is feasible.
   - **Needs a designer pass for "static + update transition" variants.**
2. **The custom full-screen alarm UI (5b-3) is not achievable on iOS.**
   - AlarmKit (iOS 26+) is the right primitive: it rings through Silent and Focus with user permission. But the alerting UI is system-rendered (title plus stop/secondary buttons).
   - Tokek art is only possible in the alarm's Live Activity and Dynamic Island countdown presentation.
   - The design *is* achievable on Android with a full-screen-intent Activity.
3. **Live Activities cannot be started from the background with `Activity.request`.**
   - Affected: critter nearby (phone in pocket), crew live on all 6 phones, flight day ("starts on its own"), vote closing.
   - These need server **push-to-start** (iOS 17.2+) or a **scheduled start** (`startDate`, iOS 26+).
   - Crew-wide state (pips, positions) fits **broadcast channels** (iOS 18+).
   - This means a real server-side LA orchestration service.
4. **iOS has no public API to open the add-widget sheet from the app**, so 5c-5 "Tapping + opens the system widget sheet" can't be built as drawn (to re-verify on iOS 27). Android has `requestPinAppWidget`.
5. **Entitlement contradictions.**
   - 5a-1 has a FREE badge but shows "4 OF 6 UP" crew pips, while the matrix says "Leave-by pips for the whole crew" is **BOOST**.
   - The matrix says "Guide voice in notifications" is **PASS+**, yet 5b-1 shows guide-voiced notifications with no gate, and "All notifications and the roundup" is **FREE**.
6. **Missing designs.**
   - Lock-screen and expanded layouts for flight (post-landing pickup), crew, critter, vote-closing and SOS activities.
   - Widget empty, locked, voted and closed states.
   - Rows for the StandBy and leave-by widgets, and a Critterdex row, in the gallery.
   - The "put this on the lock screen" control on the crew map.
   - A "Widgets" row in Settings.

---

## 1. Slice overview

### User goals
- Know what to do next without opening the app:
  - leave on time (leave-by);
  - find the crew (meet-up);
  - catch the flight and find the driver;
  - notice a critter nearby.
- Act from the lock screen:
  - I'M UP;
  - RUNNING LATE;
  - SOS;
  - vote;
  - nudge a debtor.
- Be pinged less, but never miss what matters: ping budget, 20:00 roundup, an "always gets through" class.
- Keep the trip glanceable on the home screen, lock screen and nightstand.
- Understand what's free, what's Pass+ and what's Boost for off-app surfaces.

### Entry points (into this slice)

| Surface | Triggered by / from |
|---|---|
| 5a-1 leave-by LA | Leave-by engine (3k-2 Day-of; LeaveBy on an itinerary item), started ahead of leave time; 5b-3 slide → 5a-1 (prototype) |
| 5a-2 crew live LA | Meet-up created on crew map (3g-4) on a boosted trip |
| 5a-3 flight LA | Email-imported flight booking (3h-1/3h-2), morning of the flight (3h-1 says "3 h before boarding") |
| 5a-4 critter nearby LA | Encounter spot proximity (3l) while on a trip |
| 5a-5 island | Any active LA; long-press |
| 5a-6 boost sheet | "Put this on the lock screen" on crew map of an unboosted trip (control **not drawn** in 3g-4); CREW, LIVE row in 5c-5 (prototype) |
| 5b-1 notifications | Server notification router (every slice emits events) |
| 5b-2 vote notification | Vote created/progress in 3b/3c showdown |
| 5b-3 alarm | Leave-by engine; 3n-2 "Leave-by alarms: Can ring through Do Not Disturb" toggle |
| 5b-4 ping settings | 3n-2 Settings → NOTIFICATIONS (prototype `['NOTIFICATIONS','How much we ping']`) |
| 5c-1..5c-4 widgets | User adds from the OS widget picker, or from 5c-5 |
| 5c-5 gallery | PARENT = "Settings, more" (3n-6), but **no row exists in 3n-6** |

### Exits (out of this slice)

| From | To |
|---|---|
| LA or notification body tap | 3k-2 Day-of (3k-3 prototype: zoom) |
| 5a-2 SOS | 3k-10 Crew SOS |
| 5a-2 RUNNING LATE | 3g-1 chat message |
| 5a-5 ASK TOKEK | 3j Guide chat |
| 5a-6 CTA | 4b-3 Boost Kyoto → 4b-4 Checkout |
| 5b-1 roundup | Guide chat (prototype) |
| 5b-1 Pon · Kyoto | "Pon's draft" 3c (prototype; arguably 3f "Your version") |
| 5b-1 Balances | 3i Balances |
| 5b-2 "Open the showdown" | 3c-1 Vote showdown |
| 5c-5 NEXT FLIGHT | 4e-1 Paywall |
| 5c-5 CREW, LIVE | 5a-6 sheet |
| Widget taps (implied) | Trip hub/Home, Critterdex 3l, Day-of, Balances, Crew map |

### Surface capability matrix (iOS ↔ Android, cadence, server needs)

| Surface | Tier | iOS capability, extension, entitlement (min OS) | Nearest Android | Update cadence | Server push needs |
|---|---|---|---|---|---|
| **Leave-by LA** (5a-1, 5a-5) | FREE (crew pips: BOOST?) | ActivityKit `ActivityConfiguration` in the Widget Extension; `NSSupportsLiveActivities=YES`; button = `Button(intent:)` + `LiveActivityIntent` (17+, runs in app process); countdown `Text(timerInterval:countsDown:)`; start via foreground `Activity.request`, **scheduled `startDate` (26+)** or **push-to-start (17.2+)**; crew pips via **broadcast channel (18+, "Broadcast" sub-capability of Push Notifications on the App ID)** | Android 16 **Live Update**: `NotificationCompat.ProgressStyle` with points (VILLA/PICKUP/TRAILHEAD/SUMMIT) + tracker icon (gecko) + chronometer countdown + "I'm up" action; `POST_PROMOTED_NOTIFICATIONS` + `setRequestPromotedOngoing(true)`; below Android 16, an ongoing notification with `setUsesChronometer`+`setChronometerCountDown` | Countdown is local (0 pushes); state changes on events (each "up", leg change) + scheduled transitions T−15 (relevance bump), T0 (alert/pulse), end after departure | APNs `apns-push-type: liveactivity`, topic `<bundle>.push-type.liveactivity`; one broadcast channel per LeaveBy; push-to-start per device; FCM high-priority data for Android |
| **Crew live LA** (5a-2) | BOOST | Same, plus `NSSupportsLiveActivitiesFrequentUpdates=YES`; each member's device needs background location (`UIBackgroundModes: location`; When-In-Use + `CLBackgroundActivitySession` (17+), or Always) | Live Update: BigText/ProgressStyle (a single tracker, so the multi-avatar lane can't be drawn; use a text ETA list); location via FGS type `location` (+`ACCESS_BACKGROUND_LOCATION` if started from background) | ETA recompute every 60 s (3g-4) → **priority 5** broadcast; arrivals/late/SOS → priority 10; auto-end at meet-up | Push-to-start to every boosted member's device; broadcast channel per MeetUp; `end` event with `dismissal-date` |
| **Flight LA** (5a-3) | PASS+ | Scheduled start (26+) at booking import, or push-to-start at T−3 h; 8 h active cap (long-haul needs an end + restart); alert on landing | Live Update (ProgressStyle flight progress); alternatively a Google Wallet boarding pass | Event-driven: gate, delay, boarding, T−10 (orange), landed → pickup | Flight-status provider webhooks → targeted per-activity push token |
| **Critter nearby LA** (5a-4) | FREE | **Push-to-start required** (the app is in the background). Then local `activity.update` from background location callbacks; ring via `ProgressView(timerInterval:)` while in range. Location: `CLMonitor` region (~100 m+ practical resolution) to wake, then `CLLocationUpdate.liveUpdates` for the 50 m dwell | Live Update (linear progress, no ring) + FGS `location` (the FGS notification can *be* the Live Update) | Local; update only on threshold, in/out or silhouette stage change | Server push-to-start on device-reported entry; server-side anti-cheat validation |
| **Vote closing LA** (card) | FREE | Push-to-start (T−? before close); broadcast per Vote | Ongoing/Live Update | On each ballot | Broadcast per Vote |
| **SOS LA** (priority #1 in card; 3k-10) | FREE | Push-to-start + alert; sound through Silent needs the Critical Alerts entitlement `com.apple.developer.usernotifications.critical-alerts` (Apple approval, unlikely) else Time Sensitive | High-priority notification + full-screen intent | Realtime | Targeted + broadcast |
| **Dynamic Island** (5a-5, card) | per LA | `DynamicIsland { DynamicIslandExpandedRegion(.leading/.trailing/.center/.bottom) } compactLeading/compactTrailing/minimal`; `keylineTint`; priority across *our* activities via `ActivityContent.relevanceScore`; iOS 27 landscape: `@Environment(\.isDynamicIslandLimitedInWidth)`; `.supplementalActivityFamilies([.small])` → Watch Smart Stack, CarPlay, macOS menu bar | Status-bar chip of a Live Update (`setShortCriticalText`, e.g. "22m"); Samsung Now Bar (One UI 8) | = LA | = LA |
| **Guide-voiced notifications** (5b-1) | FREE (voice = PASS+?) | APNs alert with `mutable-content:1` → **Notification Service Extension**; **Communication Notifications** capability (`com.apple.developer.usernotifications.communication`), `NSUserActivityTypes: [INSendMessageIntent]`, `INPerson`+`INImage` avatar per guide, `content.updating(from: intent)`; `thread-identifier` per crew; `interruptionLevel` | `NotificationCompat.MessagingStyle` + `Person(icon)` + long-lived dynamic conversation shortcut (`ShortcutManagerCompat.pushDynamicShortcut`) → avatar in conversation section; one channel per category | Event-driven, budgeted | Router → APNs/FCM |
| **Evening roundup** (5b-1) | FREE | Standard alert (`.active`, high `relevanceScore`); yellow card only achievable in an optional long-press Content Extension | `InboxStyle` | Daily at the user's time (default 20:00) | Per-timezone scheduler + LLM job |
| **Actionable vote** (5b-2) | FREE | `UNNotificationCategory` + `UNNotificationAction` (options: none → runs in background without unlock; `.foreground` for "Open the showdown"); **`UNNotificationContentExtension`** (`UNNotificationExtensionCategory`, `UNNotificationExtensionUserInteractionEnabled=YES`) for the animated poster; per-vote labels via `extensionContext.notificationActions`; handle in extension with `.doNotDismiss` to show the stamp; NSE adds a poster `UNNotificationAttachment` | `BigPictureStyle` (static poster) + 3 actions → `BroadcastReceiver` → WorkManager expedited job; `setAuthenticationRequired(false)`; re-post with the "Voted" state | On vote events; replace via `apns-collapse-id` | APNs category id + collapse id |
| **Leave-by alarm** (5b-3, 5c-4) | FREE | **AlarmKit (26+)**: `NSAlarmKitUsageDescription`, `AlarmManager.shared.requestAuthorization()`, fixed schedule, `AlarmPresentation.Alert` (stop "I'm up", secondary "Snooze", `.countdown` 5 min), `stopIntent`/`secondaryIntent` (`LiveActivityIntent`), custom sound; countdown/paused presentation via an `ActivityConfiguration(for: AlarmAttributes<…>)` in the widget ext. Below 26: Time Sensitive (`com.apple.developer.usernotifications.time-sensitive`), which does **not** ring through the Silent switch | `AlarmManager.setAlarmClock` (needs `SCHEDULE_EXACT_ALARM`, user-granted and default-denied on 14+; `USE_EXACT_ALARM` is Play-restricted to alarm/calendar apps) + full-screen intent (`USE_FULL_SCREEN_INTENT`, restricted 14+, check `canUseFullScreenIntent()`) + channel `AudioAttributes.USAGE_ALARM`, `CATEGORY_ALARM` + `RECEIVE_BOOT_COMPLETED` re-arm | Scheduled locally at plan sync; re-synced on plan change | Background push to reschedule (best-effort) + reconcile on every launch; server fallback: crew "knock" ping |
| **Ping budget** (5b-4) | FREE | Server-side policy. Read `UNNotificationSettings` (`timeSensitiveSetting`, `scheduledDeliverySetting`); deep-link `UIApplication.openNotificationSettingsURLString` | Mirror categories as `NotificationChannel`s; `Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS` | n/a | Router, ledger |
| **Home widgets** (5c-1, 5c-2) | FREE / BOOST / PASS+ | WidgetKit ext + **App Group** container + shared Keychain group (auth for intents); `AppIntentConfiguration` (trip/crew picker); interactive `Button(intent:)` (17+); timelines; `WidgetCenter.reloadTimelines`; **WidgetKit push (26+)**: `WidgetPushHandler`, Push Notifications entitlement on the widget ext, `apns-push-type: widgets`, topic `<bundle>.push-type.widgets`, body `{"aps":{"content-changed":true}}`, budgeted; iOS 27: home widgets update in real time while the app is active | Jetpack Glance `GlanceAppWidget`; `actionRunCallback`; updates via WorkManager (≥15 min) / FCM data → `update()`; generated previews (15+) | Countdown: entry at local midnight. Today: entries at each stop end. Vote/balances/crew: push on change. Budget ≈40–70 reloads/day | Widget push on vote tally, balance, plan, forecast line or crew ETA change |
| **Lock screen widgets** (5c-3) | FREE | `.accessoryInline`, `.accessoryCircular` (`Gauge` `.accessoryCircularCapacity`), `.accessoryRectangular`; `widgetRenderingMode == .vibrant`; `.widgetAccentable()`; `.privacySensitive()` | Android 16 QPR2 lock-screen "hub" widgets (Pixel; regular widgets, opt-out `not_keyguard`); OEM-dependent; no circular/inline families | Same as home | Same |
| **StandBy** (5c-4) | FREE | `systemSmall` widgets in StandBy (17+); `@Environment(\.showsWidgetContainerBackground)`; `.containerBackgroundRemovable(false)`; night-mode red tint is **system-controlled**; LAs also show in StandBy (iOS 27: landscape island) | Hub mode (charging/docked, OEM trigger) + `DreamService` (custom animated screensaver, full fidelity possible) | Per-minute timeline entries | none |
| **Widget gallery** (5c-5) | n/a | In-app screen. **No public API to open the add-widget sheet** (verify iOS 27) → animated how-to overlay; `WidgetCenter.shared.getCurrentConfigurations` to mark "added" | `AppWidgetManager.requestPinAppWidget()` (`isRequestPinAppWidgetSupported()`) | n/a | n/a |

---

## 2. Per-screen spec

### Shared visual tokens (off-app surfaces)

| Token | Values |
|---|---|
| Ink | `#17142a`, panel `#1f1b38`, chip `#2c2750`, track `#3a3466` |
| Text | muted `#a9a3c0`, cream `#f4efe4` |
| Wallpaper stripe | `#241f3d` |
| Accents | yellow `#ffd84a`, green `#54d6a4`, pink `#ff5fa8`, blue `#4f86ff`, orange `#ff9a4d` |
| Encounter bg | `#12261f` |
| Alarm bg | `#0e0c1c` |
| Member colours | W cream, M pink, R green, A blue, J yellow, D orange |
| Type | Archivo 900 with `font-stretch` 60–80% (display numerals and titles); Geist (UI); Geist Mono (labels); Caveat (guide's handwritten lines) |
| Tier pills | FREE (`#2c2750`/cream), PASS+ (yellow/ink), BOOST (pink/ink): 9.5px Archivo 900, .08em, radius 7 |
| LA card | radius 28, padding 14/16, gap 12, bg ink |
| Notification | radius 24, 38px avatar tile radius 10, 13px bold sender, 13.5/1.4 body |

### Motion presets (`doodles.js`)

Default ease `io` = `cubic-bezier(.65,0,.35,1)`; `out` = `(0,.55,.45,1)`; `back` = `(.34,1.56,.64,1)`. The global clock keeps loops synced, and `prefers-reduced-motion` disables all of them.

| Preset | Keyframes | Duration |
|---|---|---|
| bob | ty 0→−6→0 | 2400 ms |
| wiggle | r −4°→4°→−4° | 1600 ms |
| pulse | s 1→1.07→1 | 1600 ms |
| ping | s .6 o .8 (out) → s 1.5 o 0 | 1800 ms |
| blink | o 1→.25→1 | 1200 ms |
| hop | .10 sy .9 (squash, out) → .22 ty −14 sy 1.05 (in) → .34 ty 0 sy .94 → .42 settle | 2600 ms |
| float | ty 0 r −2 → ty −9 r 2 | 4200 ms |

---

### 5a-1 Leave-by (lock screen Live Activity)

**Purpose:** get each person out the door by leave-by, show crew readiness, and let people confirm "I'm up" without unlocking.

**UI composition** (card top 300):
- **Header:**
  - 44px yellow tile with gecko sticker;
  - "LEAVE BY" (11px, .16em, yellow) + FREE pill;
  - "03:10" (36px, stretch 70%);
  - right side: live countdown mm:ss "21:02" (22px yellow, tabular; `tg-count from=1320 format=ms`) + place "villa gate".
- **Trail:**
  - 3px dashed track `#3a3466`, with the solid yellow progress segment at 14%;
  - 4 nodes (14px) at 0/32/64/100% labelled VILLA / PICKUP / TRAILHEAD / SUMMIT (9.5px, .1em);
  - 32px gecko sticker at the progress point (`left: calc(14% - 16px)`).
- **Footer:**
  - 6 pips (6px bars; green up vs track);
  - "4 OF 6 UP";
  - "I'M UP" pill (32h, yellow).
- Below the card is a separate guide notification: "Tokek · now · Rise and shine. Headlamp's by the door, and Made is already outside."

**Data:**
- `LeaveBy{leaveAt, placeLabel, legs[{label, plannedAt, order}], progress}`
- `Readiness[]` for 6 members `{userId, state, at}`
- guide `{id, colour}`
- tier flags

**Actions:**
- **I'M UP:**
  - Triggers a `LiveActivityIntent`, which calls `POST readiness=up`. Your pip fills locally at once (optimistic `activity.update`), and the server broadcasts to all crew LAs. Prototype toast: "You're up. Five of six now."
  - Also cancels your local AlarmKit alarm (the intent runs in the app process).
- **Card tap:** opens Day-of 3k-2 via `widgetURL` (3k-3 prototype).

**Motion:**
- Tokek walks the trail "as the night goes on"; the HTML keyframe is a static placeholder (`0:tx0;1:tx0`, 3000 ms).
- Countdown ticks each second.
- Each pip "fills green with a small pop".
- **Native:** the countdown comes from `Text(timerInterval:)`. Gecko position and pips change only on update, using a system transition (scale-pop via `.transition(.scale)`/default spring, ≤~2 s). There is no continuous walk.

**States:**
- **Designed:** T−22 min, 4/6 up, you not up.
- **MISSING:**
  - you are up (button → "UP ✓"/hidden);
  - all up;
  - T0 (3k-3 caption: "At 03:10 the card flips to show the driver's ETA");
  - driver late;
  - mid-trek leg progress;
  - ended / dismissal;
  - stale (no network at 3 am: `staleDate` UI);
  - Live Activities disabled;
  - unboosted variant (own status only?);
  - crew > 6 (Boost allows 16).
- Note: 3k-3 Lock screen is a **different, simpler variant** (no trail, no button), so a canonical layout is needed.

**AI:** the companion notification line is written in the guide's voice (LLM or template, pre-generated with the leave-by schedule). The LA itself has no LLM.

**Multiplayer:** any member's "up" reaches all crew LAs within seconds via the broadcast channel. Who sees crew pips depends on gating (see Q1).

**Native/OS:**
- LA (lock screen, island, StandBy, Watch Smart Stack automatically);
- App Intent;
- APNs LA push + broadcast;
- push-to-start or scheduled start;
- time-sensitive companion notification.
- Android: Live Update ProgressStyle with 4 points + gecko tracker icon.

**Gates:**
- Badge FREE.
- Matrix: "Leave-by Live Activity and alarm" FREE, but "Leave-by pips for the whole crew" BOOST. **Conflict.**

### 5a-2 Crew, live (lock screen LA, BOOST)

**Purpose:** converge the crew on a meet-up, surface the stragglers, and offer one-tap late/SOS.

**UI composition** (card top 292):
- **Header:** "MEET-UP · 17:00" (yellow) + BOOST pill (pink) + "22 min" (muted, right).
- **Title:** "CAMPUHAN RIDGE" (34px, stretch 70%).
- **Lane:**
  - 4px track `#2c2750`, yellow ⚑ flag at the right end;
  - 6 avatar chips (26px initials, member colour, 2px ink ring) at their progress: W 100% (arrived), M 90%, R 84%, A 66%, J 40%, D 14%;
  - vertical offsets alternate 2/12px to reduce collisions.
- **Straggler rows** (2 furthest; 22px avatar + name + right-aligned status): "Jordan · Scooter · 2 km · 8 min", "Dev · Just left the villa · 21 min".
- **Buttons:** RUNNING LATE (`#2c2750`) and SOS (pink), 34h, equal width.

**Data:**
- `MeetUp{id, placeName, lat/lng, meetAt}`
- per member: `{initial, colour, progress 0..1, etaMin, distanceKm, mode, statusText, sharing}`
- time to meet

**Actions:**
- **RUNNING LATE:** sends "10 more minutes" to the crew as a chat message and moves your ETA +10. Prototype toast: 'Sent: "10 more minutes."'
- **SOS:** "works the same as in the app" → 3k-10.
- **Body tap:** Crew map 3g-4.

**Motion:**
- Avatars slide toward the flag as people move.
- Idle sway: `tx −6→0→−6`, durations 2400/2700/3000/3300/3600/3900 ms (a +300 ms stagger), io ease.
- The activity ends by itself at the meet-up.
- **Native:** idle sway is impossible. Positions jump on each update with a system move transition.

**States:**
- **Designed:** 22 min out, 1 arrived, 2 straggler rows.
- **MISSING:**
  - a member paused sharing (3g-4 shows Dev "Paused sharing at 14:00", but here Dev is moving: **inconsistency**);
  - all arrived / ended;
  - past meet time;
  - SOS active;
  - "late" sent confirmation;
  - more than 6 members;
  - own location off;
  - stale;
  - avatar collision at the same progress.

**AI:** none required. Status strings ("Just left the villa") come from place and geofence labels.

**Multiplayer:** every sharing member's location reaches the server, which computes ETAs every 60 s and broadcasts them to all boosted members' LAs. Only members who share are shown.

**Native/OS:**
- LA + island (compact: 3 furthest faces M/A/J + "17:00" pink; minimal: furthest face "J");
- background location on **every** device;
- `LiveActivityIntent` ×2;
- frequent updates flag.

**Gates:** BOOST ("on all six phones"; matrix "Crew, live on all six lock screens").

### 5a-3 Flight day (lock screen LA, PASS+)

**Purpose:** boarding countdown, gate and seat, then a hand-off to the pickup on landing.

**UI composition** (card top 292):
- **Header:** "SQ 938 · GATE B7" + PASS+ pill + "from your email" (muted).
- **Route:** SIN (44px, stretch 66%), a dashed line with the yellow plane at 30%, DPS.
- **3-column grid** (label: Geist Mono 9.5px): BOARDING = mm:ss countdown "21:02" (yellow 20px), SEAT "14A", LANDS "11:40".
- **Below:** a translucent card rotated −1° labelled "AFTER LANDING", with the gecko (pose `point`, wiggle 1800 ms): "Made is at door 3 with a sign. Silver Avanza, DK 1842 AB." This previews the flipped state.

**Data:**
- `FlightSegment{carrier, number, origin, dest, gate, seat, boardingAt, departAt, arriveAt, status}`, source = email
- `Pickup{driverName, meetingPoint, vehicle, plate, eta}`

**Actions:**
- Tap → Bookings/boarding pass 3h-1 (implied).
- Prototype "from your email" toast: "Pulled from your SQ confirmation. Pass+ only."
- No buttons.

**Motion:**
- Plane drift `tx 0→6→0` (io, 3000 ms), decorative.
- Countdown ticks, and **turns orange at T−10 to boarding**.
- On touchdown the card **flips** to pickup and Tokek holds a sign with Made's name.
- **Native:** the colour change needs an update push at T−10 (LA views can't evaluate time). The flip is an update with a system transition. A true 3D flip is not guaranteed; use push/opacity.

**States:**
- **Designed:** pre-boarding.
- **MISSING:**
  - boarding now;
  - gate change;
  - delayed (3k flight-delayed exists in-app only);
  - in-air progress;
  - **landed/pickup full layout**;
  - driver late or missing;
  - cancelled;
  - multi-leg / connection;
  - long-haul over 8 h;
  - crewmates on the same flight (3h-1: "Maya and Alex are on this flight").
- **Data inconsistency:** 3h-1 shows seat 34A, boards 08:25, departs 09:05. Here it is seat 14A, and a 22 min countdown at 07:40 means boarding at about 08:02.

**AI:** the pickup line is in the guide's voice. Booking extraction from email (LLM parse) lives in 3h.

**Multiplayer:** none. Each Pass+ traveller gets their own LA.

**Native/OS:**
- scheduled LA start (26+) or push-to-start;
- flight-status webhooks → LA push;
- alert on landing;
- island compact: plane + "B7 · 22m"; minimal: plane.

**Gates:** PASS+ ("Flight and pickup Live Activity, from your email"). But "flight changes always reach everyone", so free users still get flight-change notifications.

### 5a-4 Critter nearby (lock screen LA, FREE)

**Purpose:** reward staying put near an encounter spot, even with the phone locked.

**UI composition:**
- **Card:** green-black `#12261f`.
- **Header:** "SOMETHING'S NEARBY" (green) + FREE + "Tirta Empul".
- **Ring (96px):**
  - conic green 62% over `#2c2750`, 7px inset ink disc;
  - locked gecko silhouette (`locked=#3a3466`) + "?" (green 22px);
  - ping halo (green, opacity .4, `ping` at 2200 ms).
- **Headline:** "STAY 4 MORE MIN" (30px, stretch 70%). Sub: "Phone in your pocket is fine. Stay within 50 m of the pools."
- **Companion notification** (Tokek, 6m): "Something rustled near the spring pools. Go quietly and don't chase it." The guide tile here is **green**, i.e. tile colour follows category.

**Data:** `Encounter{spotName, center, radiusM=50, requiredDwellS, progressS, remainingS, state, silhouetteStage, critterId (hidden)}`.

**Actions:** tap → Encounter camera 3l (implied). Prototype toast: "Stay put. The ring drains slowly if you wander."

**Motion:**
- Ring fills while within 50 m.
- The silhouette sharpens near full.
- Out of range, the ring **drains slowly** (no reset).
- **Native:**
  - fill via `ProgressView(timerInterval:)` (system-animated) while in range;
  - on exit, update to a drain interval (counting down);
  - silhouette as discrete pre-rendered stages (e.g. 0/50/80/95%).

**States:**
- **Designed:** in range, 62%.
- **MISSING:**
  - draining / "wandered off" (3l has an in-app version);
  - complete → befriended + end;
  - expired or left for good;
  - poor GPS accuracy;
  - When-In-Use only (can't count in pocket);
  - Low Power Mode;
  - two spots nearby;
  - on-device anti-spoof failure.

**AI:** the notification line only.

**Multiplayer:** unspecified (do crewmates at the same spot share progress? see Q).

**Native/OS:**
- background location;
- **push-to-start** (can't `Activity.request` from background);
- local updates from location callbacks;
- island compact: silhouette + mini ring; minimal: mini ring.

**Gates:** FREE. Critters are never sold.

### 5a-5 Dynamic Island (expanded leave-by) + "Compact and minimal, per activity" card

**Purpose:** leave-by and other activities at a glance on the home screen, with an expanded view for actions.

**UI composition:**
- **Expanded island** (black, radius 44, inset 10, padding 16/18): the same header as 5a-1 (countdown 26px yellow), the same trail, and **two buttons**:
  - I'M UP (yellow, 36h);
  - ASK TOKEK (`#2c2750`).
- **No pips** in the expanded view.

**Compact / minimal spec card:**

| Activity | Tier | Compact leading | Compact trailing | Minimal | Note |
|---|---|---|---|---|---|
| Leave-by | FREE | gecko sticker | "22:14" yellow, tabular | gecko | "Minutes to leave. Pulses at zero." |
| Critter nearby | FREE | locked gecko silhouette | 18px ring 62% | ring | "The ring is the stay-put progress." |
| Vote closing | FREE | tanuki | "4–2" orange | "4–2" | "Live score until it closes." |
| Crew, live | BOOST | stacked faces M/A/J | "17:00" pink | furthest face (J) | "Furthest-out face, and the meet-up." |
| Flight | PASS+ | plane | "B7 · 22m" yellow | plane | "Gate and time to boarding." |

- **Priority rule:** "SOS, then leave-by inside 15 minutes, then flight, crew, critter, vote. The others move to the minimal circle."

**Actions:**
- I'M UP: same intent as 5a-1.
- ASK TOKEK: `Link`/`widgetURL` deep link → 3j Guide chat.

**Motion:**
- Long-press to expand is system behaviour.
- In compact, Tokek "peeks out of the left edge".
- At 03:10 the island "pulses yellow once" and the phone "gives a double tap".
- **Native:**
  - The T0 moment is a push update with `alert` (island auto-expands briefly, default sound/haptic).
  - Custom haptic patterns and a colour pulse are **not controllable**; `keylineTint` is static.
  - Priority is only an ordering *among our activities* via `relevanceScore`. The system arbitrates across apps and shows at most 2 activities in the island.
  - "Leave-by inside 15 min" needs a server push at T−15 to raise the score.

**States MISSING:**
- expanded layouts for flight, crew, critter, vote and SOS;
- SOS compact itself;
- landscape (iOS 27 `isDynamicIslandLimitedInWidth`);
- non-island iPhones (banner-style alert only);
- the Watch/CarPlay `.small` family.

**Gates:** per the table above.

### 5a-6 On every lock screen (boost upsell sheet)

**Purpose:** convert the moment someone wants the crew on everyone's lock screen into a Trip Boost.

**UI composition:**
- Crew map 3g-4 behind the sheet, dimmed `rgba(8,6,18,.62)`.
- **Bottom sheet** (radius 32, grabber):
  - kicker "KYOTO · LIVE ACTIVITY" (pink);
  - title "ON EVERY LOCK SCREEN" (40px);
  - a mini lock screen (stripe wallpaper, "16:38" 44px, mini crew LA with BOOST pill and 20px avatars);
  - body: "On a boosted trip the meet-up, ETAs and SOS sit on all six lock screens and in the Dynamic Island. It switches off at midnight on the last day.";
  - CTA "BOOST KYOTO · $12" (pink, 58h);
  - secondary "Just my own leave-by alarms".

**Actions:**
- CTA → 4b-3 Boost sheet (I'll cover it / split 6 ways) → 4b-4 Checkout.
- Secondary → dismiss and keep your own leave-by LA (always free).

**Trigger:** "someone taps 'put this on the lock screen' on the crew map of an unboosted trip". **That control is not drawn** in 3g-4 or 4f-2.

**Motion:**
- CTA light sweep: `kf "0:tx-140 e=io; .3:tx420; 1:tx420"`, 3600 ms. A 60×58px skewX(−20°) white gradient crosses in the first 30%, then rests.
- The mini-LA avatars "slide toward the flag" (drawn static).
- LIVE dot `blink` at 1400 ms; gecko `hop` at 2400 ms; own dot `ping` at 2000 ms.

**States MISSING:**
- already boosted (never shown);
- purchase failed or cancelled;
- non-organiser taps (anyone can boost; 4c "Boosted by Winston");
- offline.

**Inconsistency:** the Bali/Ubud map sits behind a "KYOTO" sheet, and Bali is the free-first-trip (boosted) trip. The intended trip context is unclear (4f-2 uses the same device: last trip's map as preview).

**Gates:** BOOST $12 per trip (4b-3).

### 5b-1 In the guide's voice (lock screen notification stack)

**Purpose:** every notification has a sender identity, and small things batch into one 20:00 roundup.

**UI composition:**
- **Roundup:** a yellow card (`rgba(255,216,74,.94)`, ink text):
  - gecko-on-ink avatar tile;
  - "Tokek's evening roundup" / "3 things for tomorrow" / "now";
  - numbered lines 1–3 (Archivo 900 numerals): "Boat at 08:30. Sarongs go in the day bag." · "Rain after two. I moved the museum up." · "Dev owes you $41. I'll nudge him, gently."
- **"Pon · Kyoto"** (orange tanuki tile, 12m): "Winston, I wrote a version just for you. Six gates at dawn, no crowds."
- **"Balances"** (green wallet tile, 1h): "Maya paid you back $92.10. You're square with everyone except Dev."
- A stack indicator shows 2 more.

**Data:** `Notification{sender{kind: guide|destination_guide|feature|crewmate, id, displayName, avatarAsset, colour}, title, subtitle, body, items[], deepLink, category, createdAt}`.

**Actions (prototype):**
- roundup → Guide chat;
- Pon → Pon's draft;
- Balances → Balances.
- No long-press actions are designed. Candidates: "Nudge Dev" on roundup item 3, "Open version" for Pon.

**Motion:** none. Arrival at 20:00 as one card "instead of eight pings".

**States MISSING:**
- empty roundup (skip sending);
- more than 3–5 items (truncate, "+N more");
- multi-crew / multi-trip roundup grouping;
- notifications denied;
- iOS Scheduled Summary capturing our pings;
- crewmate-sender example (described, not drawn);
- localisation.

**AI:**
- **Roundup composer:** an LLM batch job before the send time.
  - Inputs: the queued budget-overflow items, tomorrow's plan diff, weather, balances, guide persona, user name and locale.
  - Output: `{title, subtitle, items[≤5]{text ≤80 chars, deepLink}}`.
  - Deterministic template fallback.
  - Note "I moved the museum up": the roundup reports guide-made plan edits, so it depends on the auto-replan (3e/3k).
- **Pon's message:** from the personalised proposal job (3f "Your version").
- **Per-notification copy:** a guide-voice rewrite of templated events (short, cached, safety-filtered).

**Multiplayer:** senders include crewmates (chat, mentions only by default).

**Native/OS:**
- iOS Communication Notifications (INPerson avatar replaces the app icon, with a small app badge) via NSE;
- `thread-identifier` per crew;
- the yellow card is only possible in a long-press Content Extension (the collapsed banner uses system material).
- Android: MessagingStyle + Person + conversation shortcut; `InboxStyle` roundup. Background colour is not possible (`setColorized` is only honoured for FGS/media).

**Gates:**
- Matrix: "All notifications and the roundup" FREE, and "Guide voice in notifications" PASS+.
- What free users see is undefined: plain copy? App-icon sender? No TTS?

### 5b-2 Vote from the lock screen (expanded actionable notification)

**Purpose:** cast the final vote without unlocking.

**UI composition:**
- Lock screen blurred (8px) and dimmed .6.
- **Expanded card:**
  - 210px poster, a diagonal 115° split: orange `#ff9a4d` 0–52%, blue `#4f86ff`;
  - "KYOTO" top-left, "LISBON" bottom-right (52px, stretch 60%);
  - tanuki (100px, **bob** 2400 ms) and sardine (110px, **wiggle** 2600 ms);
  - "VS" badge (52px, ink/yellow, **pulse** 1400 ms);
  - meta "The Bali Six · Final vote · now";
  - body "Three of six have voted. It's Kyoto 2, Lisbon 1, and it closes Friday."
- **Action list:**
  - ● Vote Kyoto (orange dot);
  - ● Vote Lisbon (blue dot);
  - ● Open the showdown (cream dot).

**Data:** `Vote{id, crewId, options[{id, name, colour, critter}], tallies, voterCount, closesAt, myBallot}`.

**Actions:**
- Vote X: a background ballot, no unlock. The vote "lands back on the notification as a small stamp". Prototype toasts: "Voted Kyoto. It's 3–1 now." / "Voted Lisbon. It's 2–2 now."
- Open the showdown: `.foreground` (requires unlock) → 3c-1.

**Motion:**
- Long-press "opens into the showdown poster" (system expansion).
- Critters move and VS pulses (in the content extension: native animation of **pre-rendered** critter frames or vector paths).
- The stamp lands (the brand stamp thud: scale-down + shake).

**States MISSING:**
- already voted (allow change?);
- vote closed (stale notification → action fails gracefully, re-post the result);
- tie;
- network failure (queue + retry, local "pending" stamp);
- more than 2 options (collapsed list?);
- **the stamp visual itself**;
- result notification;
- the non-expanded banner (which cannot show the poster; use an NSE image attachment thumbnail).

**AI:** body copy template or guide voice.

**Multiplayer:** a ballot updates tallies everywhere in realtime: Home, Inbox, vote widget, vote-closing LA, other members' notifications (replace via collapse id).

**Native/OS:**
- iOS category + actions (no `.authenticationRequired`) handled by the Content Extension (`didReceive(_:completionHandler:)` → `.doNotDismiss`, show stamp) or by the app in background (~30 s).
- Action labels are per-vote via `extensionContext.notificationActions`. Coloured dots need `UNNotificationActionIcon` (template images may be tinted by the system, so colour is not guaranteed).
- Android: BigPicture + actions + receiver + expedited work.

**Gates:** FREE (4e-2: "Voting … stay free for everyone").

### 5b-3 Leave-by alarm (full-screen alarm)

**Purpose:** wake the person for a crew departure, even through Do Not Disturb, and escalate to the crew if they snooze twice.

**UI composition:**
- bg `#0e0c1c` + radial orange glow from the bottom;
- a 440px yellow disc pulsing (`pulse`, 1200 ms);
- kicker "LEAVE-BY ALARM · BATUR" (orange);
- "03:10" (132px, stretch 66%);
- "Pickup at the villa gate · Made is outside";
- Tokek 160px (pose `wave`) with `hop` at 1400 ms ("on the beat");
- speech bubble (Caveat 20px yellow, radius 18/18/18/4): "The sun won't wait. Neither will Made. Up!";
- slide-to-confirm track (68h, yellow .14 fill, .4 inset border), 56px yellow knob "→" with a hint nudge `kf "0:tx0; .4:tx18 e=out; .6:tx0; 1:tx0"` at 2000 ms, label "SLIDE, I'M UP";
- "Snooze 5 min" + Caveat "(Tokek will sigh)".

**Data:** `Alarm{fireAt, leaveById, title, place, driver, guideLine, snoozesUsed}`.

**Actions:**
- **Slide:** sets readiness up (ticks your pip on every LA), stops the alarm, and goes to 5a-1 (prototype).
- **Snooze:** 5 min, **once**. Toast: "Fine. Five minutes. I'm watching."
- **The second time:** "Tokek pings the crew that you might need a knock".

**Motion:** glow pulse synced to the alarm, Tokek hop on the beat, knob nudge.

**States MISSING:**
- the post-snooze alarm with no snooze option;
- "crew was pinged" feedback;
- offline (must still ring: local scheduling);
- plan changed or cancelled (alarm removed/rescheduled);
- permission denied → fallback;
- hardware-button dismissal (counts as stop? as snooze?).
- **Timing conflict:** the screen shows 03:10, but 5c-4 says the alarm fires at 03:00 and 3k-2 says "Tokek rings Alex and Dev at 03:00" (only those not up).

**AI:** the guide line is pre-generated when scheduling (must be local, so no network at fire time).

**Multiplayer:**
- slide → crew LAs;
- second snooze or no response → crew knock notification (time-sensitive) to awake members.

**Native/OS:**
- **iOS:**
  - AlarmKit's alerting UI is system-rendered: title + "I'm up" stop button + "Snooze" secondary with a `.countdown` post-alert of 5 min. It **cannot** show the slide control, Tokek or the glow.
  - Custom art shows only in the alarm's LA/island countdown presentation.
  - `stopIntent` (LiveActivityIntent, app process) posts readiness.
  - Snooze-once: the secondary intent reschedules a new alarm **without** a secondary button, and a second skip → server knock.
  - Custom alarm sound bundled.
- **Android:** a full-screen-intent Activity (`showWhenLocked`, `turnScreenOn`) can render the full design; audio `USAGE_ALARM`.

**Gates:** FREE. The DND bypass is a user permission and a Settings toggle (3n-2).

### 5b-4 How much we ping (settings)

**Purpose:** a user-set daily ping budget; overflow waits for the roundup; per-category switches; the safety class is explained.

**UI composition:**
- "← SETTINGS"; title "HOW MUCH WE PING" (48px).
- **Budget card:** "Ping budget" + "ABOUT 5 A DAY" (yellow 22px); a 10-segment bar (18h segments, radius 5; 5 filled yellow); caption "Over budget, the rest waits for the 20:00 roundup."
- **List card:**
  - "Evening roundup · One card at 20:00 with the small stuff · 20:00 ›";
  - "Guide tips · From Tokek, Pon and the rest" (gecko tile, toggle on);
  - "Crew chat · Mentions only ›" (pink chat tile);
  - "Money · When someone pays or owes you" (green wallet, on);
  - "Critters nearby · Only when you're already there" (blue spark, on).
- **Dashed card:** "ALWAYS GETS THROUGH: Leave-by alarms, SOS, flight changes and anything that costs money if you miss it."

**Data:** `NotificationPrefs{budgetPerDay 1..10, roundupTime, toggles{guideTips, money, crittersNearby}, crewChatMode, leaveByDndAllowed, chattiness}`.

**Actions:**
- Drag the budget: the bar fills, and "Tokek reads out a sample of what a day would sound like at that level" (TTS).
- Roundup time picker (toast "Roundup at 20:00. Change the time any day.").
- Toggles.
- Crew chat submenu (options not drawn; toast "Crew chat: mentions only.").

**Motion:** segment fill on drag (implied haptic tick per segment); the audio sample plays.

**States MISSING:**
- OS notifications off / time-sensitive off (banner + "Open Settings");
- save error;
- per-crew overrides;
- relation to 3n-7 "Quiet on the road (22:00–07:00, temples)" and 3n-2 "How chatty";
- roundup off;
- sample playback control (stop, mute when on silent);
- slider accessibility (VoiceOver adjustable).

**AI:**
- A sample-day script per level. Prefer 10 canned scripts per guide, pre-rendered TTS audio.
- The guide's TTS voice is shared with 3j "Talk out loud".

**Native/OS:**
- iOS has no channels, so prefs are server-side.
- Android: mirror categories to `NotificationChannel`s and reconcile with OS-level channel changes on launch.

**Gates:** FREE.

### 5c-1 Home screen, before (Countdown S, Critterdex S, Vote M)

**UI composition:**
- **Countdown** (160², yellow + dot texture):
  - "BALI IN" (10px, .16em) / "17" (64px, stretch 62%) / "DAYS";
  - gecko 98px pose `wave`, bottom-right, bleeding off the edge (`bob`).
- **Critterdex** (ink):
  - "CRITTERDEX" / "9/150" (40px; "/150" muted `#6f698c`);
  - 3 stickers: gecko (collected, green fill), sardine (collected), tanuki (locked silhouette).
- **Vote** (342×160):
  - diagonal orange/blue split;
  - "KYOTO"/"LISBON" (34px);
  - tanuki 70 and sardine 78;
  - bottom row: ink pills "KYOTO · 4" (orange text) | "FRI" (cream chip = closes Friday) | "LISBON · 2" (blue text).

**Actions:**
- Tap a vote side → `Button(intent: CastVoteIntent)` → the count rolls. Prototype: "Voted Kyoto from the widget. It's 5–2."
- Countdown → Home / Trip hub.
- Critterdex → 3l.

**Motion:**
- "Countdown drops a day at midnight with a page-flip" → timeline entry at local midnight + `.contentTransition(.numericText(countsDown:true))` / `.transition(.push(from:.top))` (a system animation, not a page-flip).
- "Tokek waves when you unlock" is **not feasible** (no unlock hook, no loops).
- The vote count rolls via `numericText`.
- "Turns into the result when the vote closes": a timeline entry at `closesAt` + push.

**States MISSING:**
- no upcoming trip;
- no open vote;
- **you voted** (your side marked);
- closed/result;
- more than 2 options;
- signed out;
- config picker (multi-crew);
- stale/offline marker;
- the Critterdex widget's tier and gallery entry.

**Gates:** "Three free widgets": Countdown, Critterdex and Vote are FREE, though the matrix lists only "Countdown, vote, Today and Balances".

### 5c-2 Home screen, on the trip (Today L, Balances S, Crew S)

**UI composition:**
- **Today** (342×354):
  - "DAY 4 · BATUR" (yellow 10px) / "TODAY" (34px);
  - weather chip (sun + "31°");
  - 4 rows: 6×34 colour bar + time (11px muted) + title (14px bold);
  - done row: opacity .45 + strikethrough;
  - guide bubble (Caveat 16 yellow): "Rain after two. Springs are indoors.";
  - gecko pose `point` 84px bottom-right.
- **Balances** (160², green + dots): "YOU'RE OWED" / "$186" / ink button "NUDGE DEV" (green text).
- **Crew** (160², stripes): BOOST pill; "RIDGE · 17:00"; "Jordan 8 min out"; 5 avatar dots scattered around a ⚑.

**Data:**
- `TodaySnapshot{dayIndex, title, weather{icon, tempC}, items[{time, title, colour, endAt, done}], guideLine}`
- `BalanceSummary{net, topDebtor}`
- `CrewSnapshot{meetUp, closestLabel, members[{initial, colour, relPos}]}`

**Actions:**
- NUDGE DEV → `NudgeIntent` → server pushes a friendly reminder to Dev. Prototype: 'Nudge sent. Dev says "tonight, promise".'
- Today → Day-of.
- Crew → Crew map.

**Motion:**
- "Finished stops strike through and fade": timeline entries at each item's end.
- "Tokek's line changes with the forecast": server push / reload.
- **Native:** transitions only on entry change.

**States MISSING:**
- more than 4 items (truncate / "+2");
- free day;
- weather unavailable;
- stale;
- "all square" ($0);
- you owe (negative);
- multiple debtors (who is nudged?);
- nudge sent / cooldown;
- crew widget **locked** (unboosted) and "sharing paused";
- medium crew size (gallery says "Small or medium").
- **Data inconsistency:** here "06:02 Summit, sunrise"; 3k-2 has "06:10 SUNRISE AT THE SUMMIT".

**Gates:** Today and Balances FREE; Crew BOOST.

### 5c-3 Lock screen widgets

**UI composition:**
- **Inline** (above the clock): gecko glyph + "Bali in 17 days". The date "Fri 25 Sep ·" is system.
- **Circular 66px:** ring 72% + "17D" / "BALI".
- **Circular:** "4–2" / "KYOTO" (leader).
- **Rectangular 150×66:** "CRITTERDEX" / "9 OF 150" + bar at 18%.
- A designer annotation card sits on the wallpaper; it is not UI.

**Motion:** none. System tint.

**Native/OS:**
- `.accessoryInline` (text + one template image), `.accessoryCircular` (`Gauge` capacity style), `.accessoryRectangular`;
- vibrant rendering → art must be a **monochrome template** ("drawn to still read in one colour");
- `.widgetAccentable()`.
- Also: iOS 18+ **tinted/clear home screens** render home widgets in accented mode too, so "Colour comes back on the home screen" is not always true. Provide `widgetAccentedRenderingMode` variants.

**States MISSING:**
- no trip;
- vote closed;
- redacted on the locked screen (privacy).
- **Undefined:** what the ring's 72% represents with 17 days left. **Inconsistency:** 9/150 = 6%, but the bar shows 18%.

**Gates:** FREE.

### 5c-4 StandBy (landscape, charging)

**UI composition** (844×390):
- **Left panel** (ink, dotted):
  - "02:48" pink `#ff5fa8` (150px, stretch 62%);
  - "z z z" (muted 22px);
  - sleeping gecko 110px breathing: `kf "0:ty0 s1; .5:ty-3 s1.02; 1:ty0 s1"` at 3600 ms.
- **Right panel** (300w, yellow):
  - "LEAVE BY 03:10";
  - two split-flap cards "2" "2" (130h, ink bg, yellow 110px numerals, hinge line at 50% opacity .3);
  - "minutes · Made is outside".

**Motion:**
- Breathing.
- Flap digits flip each minute.
- At 03:00 "night mode lifts", Tokek wakes with a stretch, and "the right side becomes the alarm".
- **Native:**
  - per-minute timeline entries with `numericText(countsDown:)` (no flap);
  - a pose swap entry at 03:00;
  - night mode (red monochrome) is **system/ambient-light controlled**;
  - at alarm time the AlarmKit alert takes over StandBy.
  - An active leave-by LA also competes for StandBy full-screen.

**States MISSING:**
- the night-mode rendering;
- nights without an early start;
- LA vs widget precedence.
- **Not in the gallery:** "sleepy clock" and "leave-by" widget kinds.

**Gates:** unstated (leave-by is free).

### 5c-5 Widget gallery (settings)

**UI composition:**
- "← SETTINGS"; "WIDGETS" (52px) + gecko `point` (`bob` 2400 ms);
- copy: "Put the trip on your home screen. Tokek keeps them up to date, even offline.";
- 6 rows (radius 22, `#1f1b38`, 64px preview tile, name 16px + tier pill, size/description, 30px "+" button):

| Widget | Tier | Description |
|---|---|---|
| COUNTDOWN | FREE | Small · home and lock screen |
| THE VOTE | FREE | Medium · tap to vote |
| TODAY | FREE | Large · the day's plan and weather |
| BALANCES | FREE | Small · who owes who, and a nudge |
| CREW, LIVE | BOOST | Small or medium · everyone near the meet-up |
| NEXT FLIGHT | PASS+ | Small · gate, seat, boarding time |

**Actions:**
- "+" opens the "system widget sheet on the right size". On iOS there is no API, so use a how-to overlay (and Android `requestPinAppWidget`).
- Locked ones "can still be added" and show "a gentle locked state that opens the right offer".
- Prototype:
  - CREW, LIVE → 5a-6;
  - NEXT FLIGHT → Paywall;
  - the others → toast "Added to your home screen."

**Motion:** previews are "the live widget at small scale". Reuse the widget views in-app.

**States MISSING:**
- already added;
- the locked widget visual;
- how-to overlay;
- Critterdex, StandBy and leave-by rows;
- lock-screen variants list;
- entry row in Settings.

### Spec card "WHO GETS WHAT, OFF THE APP"

Tagline: "Your own day is free. The crew's day is a boost."

| Tier | Surfaces |
|---|---|
| FREE | Leave-by Live Activity and alarm · Critter nearby · Vote closing · Countdown, vote, Today and Balances widgets · All notifications and the roundup |
| PASS+ | Flight and pickup Live Activity, from your email · Next flight widget · Guide voice in notifications |
| BOOST | Crew, live on all six lock screens · Crew widget · Leave-by pips for the whole crew |

Safety rule: "Anything that keeps someone safe or on time stays free: leave-by, SOS and flight changes always reach everyone, boosted or not."

### Motion feasibility on system surfaces

| Design claim | Surface | Feasible? | Implement as |
|---|---|---|---|
| Countdown ticks | LA/island/widget | Yes | `Text(timerInterval:)` / `Text(date, style:.timer)` |
| Tokek walks trail / avatars slide | LA | Partially | Position changes per push, system move transition |
| Pip "pop" | LA | Partially | Scale transition on update |
| Ring fills in pocket | LA | Yes | `ProgressView(timerInterval:)` + update on exit |
| Silhouette sharpens | LA | Partially | Discrete image stages |
| Countdown orange at T−10 | LA | Needs push | Priority-10 update at T−10 |
| Card flips to pickup | LA | Partially | Update + push/opacity transition |
| Island pulses yellow + double tap | Island | No | Alert push (system expand + default haptic) |
| Poster critters move, VS pulses | Notification long-press | Yes | Content Extension native animation (pre-rendered frames) |
| Stamp lands on notification | Notification | Partially | In-extension stamp (`.doNotDismiss`) and/or re-post |
| Glow pulses, Tokek hops, slide to confirm | Alarm | iOS no / Android yes | iOS: AlarmKit system UI; Android: full-screen Activity |
| Page-flip at midnight, count rolls | Widget | Partially | Timeline entry + `numericText`/push transition |
| Tokek waves on unlock, bob, breathing | Widget/StandBy | No | Static pose; pose swap per entry |
| Flap digits each minute | StandBy | Partially | Per-minute entries, numeric transition |
| Night mode lifts at 03:00 | StandBy | No | System |
| Budget bar fill + TTS sample | In-app | Yes | Native slider + audio |

---

## 3. Feature list

| # | Feature | Description | Screens | Cx | Why | Depends on |
|---|---|---|---|---|---|---|
| F1 | LA orchestration platform | Activity types, one shared `ActivityAttributes` with a kind enum (or one per kind), token registry (activity push, push-to-start per type), APNs LA sender, broadcast channel lifecycle, time-based transition scheduler (T−15/T−10/T0/end), relevance scoring, stale/dismissal policy, Android Live Update equivalent | 5a-* | XL | Multi-token lifecycle, per-device fan-out, budgets, 8 h cap, two OSes | APNs/FCM, device registry, F20 |
| F2 | Leave-by LA + island + I'M UP | Trail and progress, crew pips, button intent, T0 alert, optimistic local update, offline outbox | 5a-1, 5a-5 | L | Intent in app process + broadcast + scheduler; progress source undefined | F1, LeaveBy engine (3k), Readiness |
| F3 | Crew live LA (Boost) | Meet-up lane, straggler rows, RUNNING LATE, SOS from lock screen, auto-end | 5a-2 | XL | Background location on 6–16 phones + minute ETA engine + broadcast at priority 5/10 | F1, 3g-4 locations/ETA, routing API, 3k-10 SOS, entitlement |
| F4 | Flight day LA (Pass+) | Scheduled/push start, flight status updates, T−10 colour, landing flip to pickup | 5a-3 | L | Flight data provider + email parsing + long-haul restart | F1, 3h email import, flight status API |
| F5 | Critter nearby LA | Push-to-start on proximity, in-pocket dwell ring, drain, silhouette stages | 5a-4 | L | 50 m dwell below geofence resolution, battery, anti-cheat | F1, 3l encounters, location service |
| F6 | Vote closing LA | Live score until close; compact/minimal only | card | S | Small once F1 exists | F1, votes |
| F7 | Island compact/minimal/expanded per kind + priority | All kinds, relevance mapping, landscape (iOS 27), `.small` family | 5a-5, card | M | Many tiny layouts, width quirks of timer text | F1, F20 |
| F8 | Boost ask sheet | Upsell from crew map with mini animated LA | 5a-6 | S | In-app sheet; reuses 4b-3 | 4b checkout, 3g-4 (add trigger control) |
| F9 | Sender identity for notifications | NSE + Communication Notifications, guide/feature/crewmate avatars, threads; Android MessagingStyle + shortcuts | 5b-1 | M | Extension + intents donation + asset bundle | F20, router |
| F10 | Notification router + ping budget + roundup queue | Classify → prefs → quiet hours → daily ledger → deliver or queue; always-through class; dedupe/collapse/expiry; per-tz day | 5b-1, 5b-4 | L | Every slice's events funnel through it; correctness across timezones | Events from all slices, prefs |
| F11 | LLM roundup and guide-voice copy | Roundup composer, per-event voice rewrite, fallbacks, Pass+ gating of "voice" | 5b-1 | M | Batch LLM, cheap, needs guardrails and caching | LLM provider, persona prompts (3j) |
| F12 | Actionable rich vote notification | Category/actions, Content Extension animated poster, background ballot, stamp, closed-vote handling | 5b-2 | M | Extension memory and animation assets; idempotency | Votes API, F20 |
| F13 | Leave-by alarm | AlarmKit schedule/sync/cancel, stop/snooze intents, snooze-once + crew knock, pre-26 fallback, Android exact alarm + full-screen UI | 5b-3, 5c-4 | L | Platform permissions, local/offline scheduling, plan-change sync | Leave-by engine, Readiness, F10 |
| F14 | Ping settings screen | Budget slider, roundup time, toggles, crew chat mode, OS-permission banners, TTS sample | 5b-4 | M | UI simple; sample audio per guide | F10 prefs API, TTS assets |
| F15 | Widget platform | Widget extension, App Group snapshot store, shared auth, AppIntent config (trip/crew), timelines, WidgetKit push (26+), entitlement-locked state, Android Glance | 5c-* | L | Freshness budgets + offline + locked states on two OSes | Snapshot API, entitlements, F20 |
| F16 | Home widgets set | Countdown S, Critterdex S, Vote M (interactive), Today L, Balances S (nudge), Crew S/M (Boost), Next flight S (Pass+) | 5c-1, 5c-2, 5c-5 | L | 7 kinds × states × sizes | F15, votes, balances, plan, weather, flights, crew |
| F17 | Lock screen accessory widgets | Inline, circular countdown ring, circular vote, rectangular Critterdex; vibrant/accented art | 5c-3 | M | Monochrome art variants; small layouts | F15, F20 |
| F18 | StandBy widgets | Sleepy clock + leave-by flap, night entries | 5c-4 | M | New widget kinds; per-minute entries | F15, leave-by |
| F19 | In-app widget gallery | Live previews, tier pills, add flow (iOS how-to / Android pin), locked → offer | 5c-5 | M | No iOS add API; preview reuse | F15, 4e paywall, 4b boost |
| F20 | Critter asset export pipeline (native surfaces) | Render doodles.js/critters-draw to PNG/PDF per critter × pose × size × mode (full colour, monochrome template, accented, locked silhouette, blur stages, sticker outline), plus short frame sequences for the content extension | all | L | Shared across slices; Canvas2D can't run in extensions | critters-draw-*.js, build tooling |
| F21 | Android parity layer | Live Updates (ProgressStyle), status chip, channels, exact alarms, full-screen intent, Glance widgets, hub/DreamService, pin widget | all | XL | Different primitives; OEM variance; Play policy declarations | F1–F19 |

---

## 4. Data model contributions

Names align with sibling reports: `LeaveBy`, `Readiness`, `DeviceActivity`.

- **Device** `{id, userId, platform, osVersion, appVersion, locale, tz, apnsToken|fcmToken, liveActivitiesEnabled, frequentUpdatesEnabled, notifAuth{status, timeSensitive, scheduledSummary}, alarmAuth (AlarmKit | exactAlarm + fullScreenIntent), promotedNotifAllowed (Android 16), lastSeenAt}`
- **PushToStartToken** `{deviceId, activityType, token, updatedAt}`. One per ActivityAttributes type; rotates.
- **WidgetPushToken** `{deviceId, widgetKind, token}` (iOS 26+).
- **InstalledWidget** `{deviceId, kind, family, configuration(tripId|crewId)}`. From `getCurrentConfigurations` / Glance ids; used for targeted pushes and analytics.
- **DeviceActivity** (Live Activity instance):
  - `{id, deviceId, userId, tripId, kind: leave_by|crew_meetup|flight|encounter|vote_closing|sos|storm|alarm, refId, osActivityId, activityPushToken, broadcastChannelId, startedVia: local|scheduled|push_to_start, state: pending|active|stale|ended|dismissed, relevance, staleAt, endsAt, lastContentVersion}`
  - Hard limits: 8 h active + ≤4 h on the lock screen after end; ≈4 KB payload.
- **BroadcastChannel** `{id, apnsChannelId, scope: leave_by|meetup|vote, refId, storagePolicy, createdAt, deleteAfter}`. Channel count is capped, so GC is required.
- **LeaveBy** (+) `{legs[{label, plannedAt, lat/lng?}], progressMode: time|location, alarmPolicy{leadMin, onlyIfNotUp, snoozeLimit=1}, pickup{driverName, vehicle, plate, meetingPoint}}`
- **Readiness** (+) `{source: la|alarm|app|widget, snoozeCount, knockSentAt}`
- **Alarm** `{id, userId, deviceId, leaveById, fireAt, osAlarmId, state: scheduled|alerting|snoozed|stopped|cancelled, syncVersion}`. Device-authoritative, server-mirrored.
- **MeetUp / MemberEta** (3g) `{meetUpId, userId, distanceM, etaMin, mode, statusText, progress, sharing: live|paused|off, computedAt}`. Lock screen payloads carry **ETA/progress only, never raw coordinates**.
- **FlightSegment** (3h) (+) `{boardingAt, gate, seat, status, statusSource, laPhase: pre|boarding|in_air|landed|pickup}` and **Pickup** `{driverName, meetingPoint, vehicle, plate}`.
- **Encounter** (3l) (+) `{radiusM, requiredDwellS, progressS, drainRatePerS, silhouetteStage, deviceVerified, mockLocationFlag}`
- **Vote / Ballot** (+) `Ballot.source: app|widget|notification|la`, `idempotencyKey`.
- **Notification** (outbox):
  - `{id, userId, crewId?, tripId?, category: guide_tip|pitch|money|chat|mention|critter|vote|leave_by|sos|flight_change|cost_critical|roundup|system, class: always|budgeted|roundup_only, sender{kind, id, name, avatarKey}, title, subtitle, body, items[], deepLink, collapseKey, threadId, dedupeKey, llmGenerated, templateId, createdAt, notBefore, expiresAt, state: queued|sent|rolled_into_roundup|dropped_expired, roundupId?}`
- **NotificationPrefs** `{userId, budgetPerDay (1–10, default 5), roundupTime (local, default 20:00), roundupTz: trip|device, guideTips, money, crittersNearby, crewChatMode: all|mentions|off, leaveByDnd, chattiness: quiet|normal|chatty, quietHours (3n-7)}`
- **PingLedger** `{userId, localDate, sentBudgeted, queued}`
- **Roundup** `{id, userId, localDate, guideId, itemIds[], lines[], sentAt, fallbackUsed}`
- **Entitlement snapshot** (client cache in App Group) `{passPlus: bool, boostedTripIds[], boostExpiresAt, generatedAt}`
- **Widget snapshot** (client cache, not server) per trip:
  - countdown `{destination, startDate, guideId}`
  - critterdex `{count, total, recent[3]}`
  - vote `{…}`
  - today `{…}`
  - balances `{net, topDebtor}`
  - crew `{…}`
  - nextFlight `{…}`
  - `generatedAt`
  - Stored in the App Group / Android DataStore; never contains private budget maxes (3c).
- **CritterAsset** `{critterId, form, pose (wave|point|sleep|walk|sign|think…), mode (color|template|accented|locked|blur1..3), size, url/bundlePath, version}`

**Privacy notes:**
- Lock screens are visible to anyone. Crew whereabouts ("Just left the villa"), money ("$186 owed", "Dev owes you $41") and critter spots are exposed.
- Mitigations:
  - `.privacySensitive()` on Balances;
  - an optional "hide details on lock screen" preference;
  - honour iOS "Show Previews: When Unlocked";
  - sharing auto-off at midnight on the last day;
  - paused members excluded;
  - location retained minimally (ETA derived server-side, raw points TTL'd).
- Notification payloads: prefer `mutable-content` + NSE fetch of the full body over authenticated API, so APNs/FCM carry minimal PII (optional; costs latency).
- Voting from the lock screen without auth is acceptable for low stakes. Nudges and SOS are rate-limited and abuse-guarded.

---

## 5. Backend / API needs

### Endpoints

| Method + path | Purpose |
|---|---|
| `POST /devices` / `PATCH /devices/{id}` | Tokens (APNs/FCM), capability flags, tz |
| `PUT /devices/{id}/push-to-start/{activityType}` | Store push-to-start tokens |
| `PUT /devices/{id}/widget-tokens/{kind}` | Store widget push tokens |
| `POST /devices/{id}/activities` / `PATCH …/{actId}` (token rotation) / `DELETE` | Register LA instances started locally or by push |
| `POST /devices/{id}/installed-widgets` | Sync installed kinds |
| `POST /trips/{t}/leave-by/{id}/readiness` `{state: up, source, idempotencyKey}` | Called from LA intent, alarm stop intent, app, widget |
| `POST /trips/{t}/leave-by/{id}/snooze` `{count}` | Server decides the crew knock |
| `POST /meetups/{id}/late` `{minutes: 10}` | Chat message + ETA bump |
| `POST /sos` | 3k-10; from the LA via intent |
| `POST /votes/{id}/ballots` `{optionId, source, idempotencyKey}` | Returns tallies for the stamp |
| `POST /balances/nudges` `{toUserId, tripId}` | Rate limit 1 per pair per 24 h; returns reply preview if any |
| `GET /widgets/snapshot?tripId=` | Compact JSON, ETag; used by widget timeline providers and the app |
| `GET/PUT /me/notification-prefs`; `GET /me/notification-prefs/sample?level=` | Prefs + sample audio URL per guide/level |
| `GET /notifications/{id}` | NSE fetch of full content (if minimal-payload mode) |
| `POST /encounters/{id}/progress` | Batched dwell samples + mock-location flags; server validates and completes |
| `POST /flights/{segmentId}/subscribe` | Internal: on email import for Pass+ users |

### Background jobs
- **LA transition scheduler:** per LeaveBy, MeetUp, Flight and Vote:
  - enqueue push-to-start (leave-by: T−≤8 h or evening before; crew: T−30 min? unknown; flight: T−3 h; vote: T−24 h?);
  - relevance bump at T−15;
  - T−10 flight colour;
  - T0 alert;
  - end with dismissal date.
  - Reschedule on plan change.
- **Meet-up ETA engine:** every 60 s per active meet-up, compute ETAs from the latest member locations + routing (mode-aware), then broadcast at priority 5. Priority 10 on arrival, late, or everyone under 5 min (3g-4 "meet-up pin pulses once everyone is under five minutes away").
- **Flight tracker:** provider alert subscriptions → phase changes → LA push + always-through "flight change" notification.
- **Notification router:** consumes domain events from all slices → category/class → prefs → quiet hours → budget ledger (user-local day) → send or queue → collapse/dedupe/expire (e.g. drop "critter nearby" after leaving).
- **Roundup builder:** a cron per timezone bucket, ~10 min before each user's roundup time. Collects queued items + tomorrow's plan highlights → LLM composes → send. Template fallback on failure or timeout; skip if empty.
- **Guide-voice copywriter:** an LLM rewrite for eligible categories. Cached by `templateId + params hash`, ≤110 chars, safety filter, locale.
- **Widget refresher:** on vote, balance, plan, forecast or crew change → WidgetKit push to affected devices' kinds; FCM data → Glance update.
- **Alarm sync:** on LeaveBy change → background push (`content-available`) to reschedule local alarms (best-effort). On each app launch and LA intent run: reconcile.
- **Crew knock:** on the second snooze, or no "up" by T0+N → time-sensitive notification to awake members.
- **Token hygiene:** remove tokens on APNs 410 / FCM UNREGISTERED; GC broadcast channels via the APNs Channel Management API; expire ended activities.
- **Entitlement fan-out:** on boost purchase or expiry (midnight of the last day) → start or stop crew LAs, refresh widgets (locked state), stop broadcasts.

### Realtime channels
- APNs broadcast channels per LeaveBy / MeetUp / Vote (LA).
- The in-app realtime channel (WebSocket or similar, shared with 3g) mirrors the same state for open apps.
- iOS 27 home widgets update in real time while the app is active, so reload widgets on in-app events.

### 3rd-party
- APNs (token auth .p8, HTTP/2; push types `alert`, `background`, `liveactivity`, `widgets`; Broadcast capability); FCM HTTP v1.
- Flight status (e.g. FlightAware AeroAPI alerts, Cirium FlightStats, OAG): pick in the stack phase.
- Routing/ETA (Google Routes or Mapbox Directions/Matrix).
- Weather (WeatherKit REST or similar; shared with 3k).
- LLM provider (roundup, voice).
- TTS (guide voices; shared with 3j) or pre-rendered audio.

---

## 6. Cross-slice dependencies and shared components

### Dependencies

| Slice | Dependency |
|---|---|
| **3a-9** permissions | Add AlarmKit and Live Activities rationale. "Alarms and pings: about five a day" matches the 5b-4 default budget of 5. "Location, on trips" must cover background use. |
| **3b/3c** votes | Tallies, `closesAt`, showdown deep link (5b-2, vote widget, vote-closing LA). |
| **3g-1/3g-4** crew chat + map | Meet-ups, location sharing (pause, auto-off), ETAs every minute, RUNNING LATE → chat, **missing "put this on the lock screen" control**. |
| **3h-1/3h-2** bookings | Email import → FlightSegment/Pickup. 3h-1 says "pins itself to the lock screen three hours before boarding", which contradicts 5a-3 "morning you fly". Seat/time inconsistencies. |
| **3i** balances | Net owed, nudge (widget + roundup item). |
| **3j** guide | ASK TOKEK deep link; guide voice/TTS; persona prompts. |
| **3k-2/3k-3** Day-of + lock screen | Leave-by engine, Readiness, "Tokek rings Alex and Dev at 03:00"; **two LA layouts to reconcile**. |
| **3k-8** storm LA; **3k-10** SOS | Additional LA kinds (SOS top priority); 3k offline outbox for intents. |
| **3l** encounters | Dwell, silhouettes, anti-cheat, "It wandered off". |
| **3n-2** Settings | Leave-by DND toggle, crew chat mode, chattiness (overlaps the budget). **3n-6** needs a Widgets row. **3n-7** Quiet on the road (22:00–07:00): must not mute leave-by alarms or SOS. |
| **4b-3/4b-4/4c/4e** monetization | Boost purchase, Pass+ paywall, entitlement propagation to extensions; boost expiry at midnight of the last day. |

### Shared components
- **Critter asset export pipeline (F20).** Used by LA, island, notifications (INImage avatars), widgets, content extension, app icons, share images.
- **Avatar chip:** initial, member colour, ring; sizes 20/22/24/26/28.
- **Tier pill** (FREE / PASS+ / BOOST).
- **Trail/waypoint progress component:** in-app Day-of + LA + island + Android ProgressStyle mapping.
- **Countdown formatting:** mm:ss, "17D", "22m", "B7 · 22m".
- **Guide tile:** colour by guide or category.
- **Design tokens and fonts** bundled into the extensions: Archivo width axis as static instances (condensed 60/66/70/78/80%), Caveat, Geist, Geist Mono.
- **Entitlement snapshot reader** (app + extensions).
- **Deep-link router** (widgetURL, notification, LA).
- **Idempotent action client:** shared by App Intents, notification actions and the offline outbox.

---

## 7. Implementation risks / hard parts

1. **Motion fidelity gap** (§2 table). Widgets and LAs are static SwiftUI snapshots. Designers must approve static and transition variants before build; otherwise it's rework.
2. **Canvas2D critters in extensions.** Extensions can't run the JS renderer. Pre-render every needed critter, pose, size and rendering mode. Encounter silhouettes for up to 150 critters plus blur stages must sit in the extension bundle or the App Group (LA images must be local and small). Widget extension memory is ~30 MB.
3. **Background LA start is forbidden.** Critter-in-pocket, crew live, flight and vote all need push-to-start or a scheduled start:
   - push-to-start tokens exist only after the first launch;
   - they rotate and are per attributes type;
   - the user can disable Live Activities;
   - starts are throttled.
   Design a "didn't appear" fallback (a time-sensitive notification).
4. **APNs LA budgets.** Priority-10 updates are budgeted; minute ETAs must be priority 5 plus `NSSupportsLiveActivitiesFrequentUpdates` (user can turn it off). Broadcast channel count is capped, so GC is needed. The ≈4 KB content-state limit constrains a 16-member crew.
5. **Duration limits.** An LA lives at most 8 h active + 4 h. "Switches off at midnight on the last day" must mean per-meet-up activities, not one trip-long activity. Long-haul flights need an end plus a restart after landing.
6. **Background location cost and permission.**
   - Crew live needs every member sharing in the background.
   - The encounter's 50 m dwell is below region-monitoring resolution, so it needs continuous GPS near spots.
   - iOS: Always prompt, or When-In-Use + `CLBackgroundActivitySession` (blue indicator).
   - Android: FGS type location + `ACCESS_BACKGROUND_LOCATION` + Play Console location declaration and prominent disclosure.
   - Battery drain on multi-day trips.
7. **Alarm reliability.**
   - AlarmKit is iOS 26+ only.
   - The alarm must be scheduled locally ahead (works offline) and re-synced on plan change while the app may be dead (background pushes are throttled).
   - Conditional alarms ("only if not up") need cancellation in the LA intent's app process.
   - Snooze-once needs reschedule gymnastics.
   - The custom UI is impossible on iOS.
   - Below iOS 26 there is no Silent-switch bypass without the Critical Alerts entitlement (not for travel apps).
   - Android: default-denied `SCHEDULE_EXACT_ALARM` (14+), restricted full-screen intent, OEM battery killers (Samsung/Xiaomi).
8. **Communication Notifications for AI personas and a "Balances" feature sender.** Semantic mismatch with Apple's intent (person-to-person messages), which is an App Review risk. The avatar replaces the icon only with intent donation. Fallback: a normal notification with a guide image attachment.
9. **Ping budget as single choke point.**
   - Every slice must send via the router.
   - Locally scheduled notifications bypass it.
   - Define "day" in trip-local time when crossing timezones.
   - Handle interplay with iOS Scheduled Summary (time-sensitive bypasses it) and Focus.
   - Handle interplay with Quiet on the road (3n-7).
   - Classify the always-through class, i.e. what "costs money if you miss it" means (deadlines, free-cancellation expiry?).
10. **Actionable votes.** Background execution is ~30 s. Handle closed or changed votes, and make ballots idempotent. Content extension memory limits apply with animated critters. Stamp persistence means re-posting.
11. **Widget freshness.** ~40–70 reloads/day; widget push is budgeted (iOS 26). The Crew widget can't be "live" (minutes stale), and the design implies live positions. Interactive widget intents run in the widget extension process, so auth must be in a shared Keychain.
12. **No iOS add-widget API.** The 5c-5 "+" flow must become instructions (and possibly a Control/Shortcut). Measure installs via `getCurrentConfigurations`.
13. **StandBy.** Night-mode red tint and timing are system-controlled. Precedence among the LA, widgets and the AlarmKit alert is unclear. The designed pink/yellow looks won't survive night mode.
14. **Tinted/Clear home screens** (iOS 18+ / 26) break "full colour on home". Every widget needs accented-mode art.
15. **Fonts in extensions.** The Archivo variable width axis in SwiftUI needs static instances or a CoreText variation. Fonts are bundled per extension, which adds size.
16. **Entitlement propagation offline.**
    - Extensions read a cached snapshot.
    - Boost expiry at midnight must stop broadcasts server-side and flip widgets to the locked state.
    - The Pass+ lapse mid-flight: keep the active LA?
17. **Lock-screen privacy** of locations and money (see §4).
18. **SOS from the lock screen in one tap** risks accidental triggers. Needs a confirm pattern (tap → "tap again within 5 s", or long-press unavailable in LA) plus a cancel window. Must bypass budget and quiet hours.
19. **Android parity.**
    - No Dynamic Island.
    - Live Updates only on Android 16+, with no custom views (`customContentView` disqualifies promotion) and no colorized background.
    - Lock-screen widgets only on Pixel (16 QPR2) / OEM-dependent.
    - StandBy ≈ hub mode or DreamService.
    - Needs Android-specific layouts and a scope decision.
20. **Min OS choice.** Push-to-start 17.2, interactive widgets 17, broadcast 18, AlarmKit / scheduled LA / widget push 26, landscape island 27. A min of iOS 18 needs fallbacks for three 26-only features; a min of iOS 26 simplifies.
21. **Multi-device users** (phone + iPad): LA per device, dedupe readiness and ballots, alarms on one device only?
22. **Design data inconsistencies** to clean before build:
    - seat 14A vs 34A;
    - boarding 08:25 vs ~08:02;
    - summit 06:02 vs 06:10;
    - Critterdex bar 18% vs 6%;
    - Dev paused vs moving;
    - alarm 03:10 vs 03:00;
    - vote 4–2 (widget) vs 2–1 (notification) is fine as different moments.

---

## 8. Ambiguities and open product questions

1. Leave-by crew pips: FREE (5a-1 badge) or BOOST (matrix)? On an unboosted trip, does each person see only their own status?
2. What exactly is "Guide voice in notifications" (PASS+)? Persona-written copy, the guide avatar as sender, or spoken audio? What do free users get?
3. Leave-by trail progress: time-based between planned leg times, or location-based? Who defines the legs (guide, from the plan)?
4. When does the leave-by alarm fire? At leave-by (5b-3 shows 03:10) or leave-by −10 (5c-4, 3k-2: 03:00)? Is it user-configurable? Only for people not yet "up"?
5. Snooze-once: after the second attempt, does the alarm keep ringing or stop? What triggers the crew knock: the second snooze tap, or no "up" by T0+N? Who receives the knock?
6. LA start times per kind: leave-by (night before? T−30?), crew meet-up (T−?), vote closing (T−24 h?), critter nearby (on arrival).
7. Crew LA with more than 6 members (boost allows 16): layout, and which rows show?
8. Does the crew LA run per meet-up only (and end at the meet-up), or continuously during trip days until "midnight on the last day"?
9. Who creates the meet-up that triggers the crew LA? Is it auto-pushed to all members, or opt-in per member?
10. Roundup: trip-local or home timezone? One roundup across all crews or per crew? Is it skipped when empty? Can items carry actions (e.g. "Nudge Dev")? Where does a tap land (Guide chat vs Trip hub)?
11. Budget accounting: per user per day across crews? Are local notifications, the roundup itself and critter pings counted? Does "about 5" mean a soft or hard cap?
12. Crew chat submenu options ("Mentions only ›"): All / Mentions / Off?
13. Definition list for "anything that costs money if you miss it".
14. Is "Balances" a sender persona with the wallet avatar on iOS (a Communication Notification for a non-person)? Or is the app icon acceptable?
15. Pon's personalised pitch tap target: 3f "Your version" or 3c "Pon's draft" (prototype)?
16. Vote from a notification: can a vote be changed? What happens after close? Is re-posting the notification to show the stamp acceptable?
17. StandBy: are "sleepy clock" and "leave-by flap" two new widget kinds (missing from the gallery)? Or is the right half meant to be the Live Activity?
18. Critterdex widget: its tier (FREE?) and why it's absent from the gallery and the matrix. The Critterdex lock-screen rectangular widget too.
19. Lock-screen ring: what does 72% represent at 17 days (share of time since booking? since the vote?)?
20. The "put this on the lock screen" entry on the crew map is not drawn. Where does it live? Is it also on 4f-2?
21. The 5a-6 context: Bali map + Kyoto boost. Which trip is being upsold?
22. The flight LA start: "morning you fly" (5a-3) or "3 h before boarding" (3h-1)? For every flight or only email-imported ones? And Wallet boarding pass (.pkpass)?
23. Encounter parameters: required dwell (≈10.5 min implied by 62% = 4 min left), drain rate, radius per spot, and whether crewmates at the same spot share progress.
24. SOS from the LA: is a confirmation step required? Should it open the app?
25. RUNNING LATE: always 10 min, or pick a duration? Does it shift the meet-up for everyone?
26. The nudge from the widget: which debtor if several? Cooldown? Does the nudged person see "from Winston" or "from Tokek"?
27. Lock-screen privacy: should money and locations hide details when locked by default?
28. Minimum iOS version (17 / 18 / 26) and Android scope for v1 (full parity vs reduced: no island, Pixel-only lock-screen widgets)?
29. Apple Watch, CarPlay and Mac: Live Activities appear there automatically via the `.small` family. Ship it (cheap), or suppress for v1? The Watch face is listed only as "Try next".
30. Quiet on the road (3n-7, mutes 22:00–07:00): confirm that leave-by alarms and SOS override it, and whether budgeted pings in quiet hours are held or silent.
31. The 5b-4 TTS sample: is it Pass+-gated as "guide voice"? Does it respect the silent switch?

---

## 9. Platform research sources (checked 2026-09)

- [Live Activities essentials, WWDC26](https://developer.apple.com/videos/play/wwdc2026/223/): scheduled start, push-to-start, broadcast, iOS 27 landscape island, StandBy, Watch/CarPlay/Mac `.small`.
- [iOS 27 roundup (Tom's Guide)](https://www.tomsguide.com/phones/iphones/ios-27-is-official-all-the-new-upgrades-and-features-announced-at-wwdc-2026) and [TechCrunch](https://techcrunch.com/2026/06/09/ios-27-features-we-didnt-see-on-stage/): home widgets update in real time while the app is active; extra-large widgets.
- [Scheduled LA start (`startDate`, iOS 26)](https://tessl.io/registry/dpearson2699/swift-ios-skills/3.7.0/files/skills/activitykit/references/activitykit-patterns.md); [ActivityKit push docs](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications).
- [Broadcast updates, WWDC24](https://developer.apple.com/videos/play/wwdc2024/10069/); [Broadcast capability note (expo/eas-cli #3815)](https://github.com/expo/eas-cli/issues/3815).
- [AlarmKit (MacRumors)](https://www.macrumors.com/2025/06/11/ios-26-third-party-alarm-apps/); [Michael Tsai on AlarmKit](https://mjtsai.com/blog/2025/06/20/ios-26-alarmkit/).
- [WidgetKit push notifications](https://developer.apple.com/documentation/widgetkit/updating-widgets-with-widgetkit-push-notifications?changes=_3); [WidgetPushHandler](https://developer.apple.com/documentation/widgetkit/widgetpushhandler); [What's new in widgets, WWDC25](https://developer.apple.com/videos/play/wwdc2025/278/).
- [Communication notifications](https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications); [WWDC21 communication + Time Sensitive](https://developer.apple.com/videos/play/wwdc2021/10091/).
- [iOS add-widget prompt: no API, only `promptsForUserConfiguration`](https://onmyway133.com/posts/how-to-prompt-users-to-configure-widgets-in-ios-18/); [forum thread](https://developer.apple.com/forums/thread/656476).
- [Android Live Updates docs](https://developer.android.com/develop/ui/views/notifications/live-update); [Android Authority, 16 QPR1 Live Updates](https://www.androidauthority.com/android-16-qpr1-live-updates-3573399/).
- [Android lock-screen widgets FAQ](https://android-developers.googleblog.com/2025/03/widgets-on-lock-screen-faq.html); [16 QPR2 phones, hub mode](https://9to5google.com/2025/08/20/android-qpr2-lock-screen-widgets/).
