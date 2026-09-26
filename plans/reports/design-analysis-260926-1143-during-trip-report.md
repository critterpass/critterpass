# Design analysis: 3k During trip (3k-1 to 3k-10)

Sources: `design/Critterpass.dc.html` (screen HTML slices), `design/Critterpass Prototype.dc.html` (flow graph `PARENT`, per-screen `b:` bindings, helper animations), `design/doodles.js` (`tg-motion` presets, `tg-count`), rendered shots 390x844, adjacent screens 3b-4, 3e-1, 3g-4, 3h-1, 3h-3, 3j-1, 3l-1, 4a/4b/4e/4f, 5a-1..6, 5b-1..4, 5c-2..4.
Cast used throughout the design: W = Winston (viewer, organiser), M Maya, J Jordan, R Rin, A Alex, D Dev. Guide = Tokek (gecko, Bali). Humans in the story: Ketut (trek guide), Made (driver). Timeline: Mon 12 Oct land, Wed 14 Ubud (ceremony, 3k-7 and 3k-9), Thu 15 Batur (3k-2 to 3k-4, storm alert 18:10 3k-8), Fri 16 boat day, Sat 17 meet-up and SOS (3k-10), Mon 19 fly home.

---

## 1. Slice overview

**User goals**
- Know at a glance what matters today and what the guide already handled (hub, briefing).
- Get up and out on time as a group (leave-by, crew "I'm up", lock screen, alarms).
- Keep working with no signal and trust queued actions will send.
- Handle disruptions (flight delay, weather or sea, road closure, lateness) with little effort: the guide pre-solves, the user approves only what costs money or affects others.
- Get help in an emergency (numbers, phrase, nearest clinic, insurance, crew sees location). Respond when a crewmate hits SOS.

**Entry points into the slice**
| From | To | How (prototype) |
|---|---|---|
| 3b-2 Home, BALI card | 3k-1 | `zoom` shared-element |
| Tab bar TRIPS | 3k-1 | tab switch |
| 3l-1 Egg hatch "Show me around later" | 3k-1 | tab |
| 3e-1 Trip plan, BATUR SUNRISE card | 3k-2 | push |
| 3k-3 LA tap or Tokek notification | 3k-2 | `zoom` |
| 3b-4 Inbox "MOVE DINNER TO 21:00?" | 3k-5 | push (same decision also answerable inline in Inbox) |
| Flight-change push (always breaks through, 5b-4), 5a-3 Flight day LA | 3k-5 | implied |
| 3j-1 Guide chat PHARMACY quick action | 3k-6 | fade, replace |
| Long-press centre guide button (anywhere) | 3k-6 | caption only, not in prototype |
| 3k-2 "9° AT THE TOP" | 3k-7 | push |
| 3k-7 watch item 1 / storm LA (push-to-start) | 3k-8 | push |
| 3k-7 watch item 2 (demo) / lateness trigger | 3k-9 | push |
| 3g-4 Crew map, 5a-2 crew LA SOS, SOS push (any screen) | 3k-10 | `rise` takeover |
| Connectivity loss | 3k-4 | automatic state |

**Exits**: 3k-1 tiles to 3e-1 Plan, 3h-1 Bookings, 3i-1 Balances, 3l-7 Crew quests; centre button to 3j-1 (sheet). 3k-2 to 3k-7, 3h-1. 3k-3 Maya notification to 3g-1 Crew chat. 3k-4 to 3k-2. 3k-5 TELL THE CREW to 3g-1, then a "landed" toast to 3l-1 Egg hatch (burst). 3k-6 GO to 3h-3 Getting around; insurance card in 3h-1. 3k-8 and 3k-9 CTAs return to the plan or Today. 3k-10 "See him on the map" to 3g-4.

---

## 2. Global motion and UI tokens (used by every screen below)

- Standard easing `E = cubic-bezier(.32,.72,0,1)`.
- Transitions:
  - push: 480ms, incoming from translateX 100%, outgoing to -30%, scrim 0 to .5. pop: 420ms.
  - sheet: 540ms. rise: 620ms + 120ms delay. Background scales to .93, scrim .45.
  - zoom: 560ms shared-element from the source card rect. Clip-path radius 22 to 54px, fade 0 to 1 by 35%, background scale .94. Back: 460ms.
  - burst: 640ms `cubic-bezier(.2,1.3,.35,1)` from scale 1.2, plus a white flash.
- Toast = Dynamic Island morph: 122x35 to 360x62, 440ms `cubic-bezier(.2,1.25,.3,1)`. Contains a guide sticker, 2-line text and an optional OPEN button (tap navigates). This is the in-app confirmation pattern for every action in this slice.
- Micro-animations:
  - pop: scale 1.12 at 40%, 360ms ease-out.
  - flap (label change): rotateX 0 to 90 to 0 in perspective 300px, 340ms ease-in-out, text swaps at 170ms.
  - thud: whole view translateY 0/5/-2/0 over 280ms. Pair with a haptic.
  - glow: box-shadow ring 0 to 16px, yellow fading out, 900ms x2.
  - slideOff: translateX 110% + rotate 4deg + fade, 360ms `cubic-bezier(.5,0,.75,0)`, then height/padding collapse over 320ms E.
  - tick-in: scale 0 to 1.25 to 1, 380ms ease-out.
  - drop: translateY -18px to 0, 380ms `cubic-bezier(.3,1.5,.5,1)`.
- Loop presets (`tg-motion`, all on one global clock so loops stay in sync):

  | Preset | Movement | Default |
  |---|---|---|
  | bob | ty 0 to -6 | 2400ms |
  | float | ty 0 to -9, rot ±2deg | 4200ms |
  | wiggle | rot ±4deg | 1600ms |
  | pulse | scale 1.07 | 1600ms |
  | blink | opacity 1 to .25 | 1200ms |
  | marquee | tx 0 to -50%, linear | 16000ms |

  Easing between keyframes is ease-in-out (`cubic-bezier(.65,0,.35,1)`). **OS Reduce Motion disables all loops**, and the app must honour this.
- Palette: bg `#17142a`, card `#1f1b38`, raised `#2c2750`, bar `#120f22`, text `#f4efe4`, muted `#a9a3c0`, yellow `#ffd84a`, pink `#ff5fa8`, blue `#4f86ff`, green `#54d6a4`, orange `#ff9a4d`. Hero cards carry a dot texture: radial-gradient dots on an 8px grid, 36 to 40px bottom radius.
- Type: Archivo 900 condensed (`font-stretch` 62 to 80%) for display, Archivo 700 11px with .16em tracking for labels, Geist for body, Geist Mono for times, Caveat for guide handwriting and phrase cards.
- Critter poses used in this slice: wave (LA), think (3k-5, 3k-6, 3k-8, 3k-10), cheer (3k-4, orange colourway), point (3k-7). These must also exist as **pre-rendered raster/vector assets** for LA, widget and notification extensions, which cannot run the Canvas2D JS renderer.

---

## 3. Per-screen specs

### 3k-1 Trip hub
- **Purpose**: the trip's home tab. It combines the countdown, the guide's daily briefing, 4 module tiles and a live crew activity ticker. **The designed state is pre-trip (T-17d)**, although the section intent calls it "during the trip".
- **UI composition**, top to bottom:
  1. Meta line "OCT 12–19 · 6 GOING".
  2. Destination wordmark "BALI": Archivo 900 84px, stretch 64%, yellow.
  3. "WHEELS UP IN 17D 05:26:29": `tg-count` in dhms format with tabular numerals.
  4. **Briefing card** (yellow, r24): guide sticker 40px, "TOKEK'S BRIEFING", "today". It has 3 rows, each with a doodle icon (plane, wallet, bed), 13.5px text and an action chip. Chip styles: DONE is green, NUDGE is dark with yellow text, SET is cream.
  5. **2x2 tiles** (112px tall, r22), each with label, icon, big value (Archivo 900 26px) and subline:
     - PLAN (pink, cal): "8 DAYS / 2 votes open"
     - BOOKINGS (blue, ticket): "9 SAVED / all offline"
     - MONEY (green, wallet): "+$186 / owed to you"
     - QUESTS (orange, star): "3 LIVE / crew level 7"
  6. **Ticker strip**: 36px, bg `#120f22`. Items are separated by pink dots.
  7. **Tab bar**: HOME, TRIPS (active), a raised 66px yellow guide button, WALLET, PASS.
- **Data**:
  - Trip{dest, dates, memberCount}.
  - Viewer's outbound departure (countdown target; per-user, since crew fly separately).
  - Briefing{date, items[]}.
  - Plan{dayCount, openVoteCount}.
  - Bookings{count, allOfflineAvailable}.
  - Balance{viewerNet}.
  - Quests{liveCount, crewLevel}.
  - ActivityEvent[] (actor, verb, object) for the ticker: "ALEX MOVED SNORKELLING TO 14:00", "MAYA VOTED NUSA PENIDA", "TOKEK HELD 6 BOAT SEATS", "JORDAN ADDED 12 PHOTOS".
- **Actions**:
  - DONE: item slides off (acknowledged).
  - NUDGE: pushes a reminder to named members (Dev, Alex). Chip flaps to "SENT". Toast: "Nudged Dev and Alex about visa cash."
  - SET: confirms a scheduled guide action. Chip flaps to "SET ✓". Toast: "The door code will pin itself to Day 1."
  - Tiles navigate. Guide button tap opens Guide chat as a sheet. Long-press opens Help.
  - The ticker has no tap behaviour defined.
- **Motion**:
  - Countdown ticks at 1Hz.
  - Briefing items "slide off with a check" (slideOff, above). The briefing content is replaced each morning; no re-entry animation is specified.
  - Ticker: marquee 22000ms linear infinite. Content is duplicated twice for a seamless -50% loop. New events append to the next cycle.
  - Entry from Home uses zoom.
- **States**:
  - Designed: pre-trip populated.
  - MISSING:
    - Phase layouts: in-trip (Day N instead of "wheels up"?), travel day, post-trip.
    - Briefing: generating, empty, failed, and stale/offline.
    - Money: negative balance ("you owe") and settled.
    - Empty cases: 0 bookings, no quests, empty ticker.
    - Other: loading skeleton, multiple concurrent trips, guest-guide destination, unboosted trip.
- **AI**: briefing generation (daily background job per user, in guide persona). Inputs: plan, bookings, flight status, balances, crew readiness (e.g. visa cash), pending host info. Output JSON `{items:[{icon, text, action:{type: done|nudge|set|open, targets[], payload}, status, sourceEventId}]}`. There is also event-driven insertion: "Rin's flight moved… I moved her pickup" is a DONE item produced by the action engine (F9). Not streamed.
- **Realtime**: ticker (crew and guide events); live tiles (vote count, balance); briefing chip state (does Maya see that W already nudged?).
- **Native**: haptic on chip actions. Sibling surfaces are the countdown widget, lock screen inline widget and Today widget (5c).
- **Entitlements**: none visible. Bali is the "first trip free" boost, so every Bali screen shows the boosted state.

### 3k-2 Day-of
- **Purpose**: the "today" view for an early-start day. It shows the leave-by time, crew readiness, packing list and timeline.
- **UI composition**:
  - Pink hero (420px) with meta "THU OCT 15 · DAY 4" and "9° AT THE TOP" (tappable).
  - "LEAVE BY" + **"03:10"** (Archivo 900 132px, stretch 62%).
  - Guide note: "Pickup at the villa gate, 03:30. Bring the headlamp, the path is dark."
  - **Countdown ring** 96px: conic gradient at 72% remaining, inner `tg-count` in ms format ("21:29 TO GO").
  - **Readiness row**: 6 initials avatars (32px, member colours, -8px overlap). Not-up members are at 55% opacity and bobbing. Text: "4 OF 6 ARE UP" and "Tokek rings Alex and Dev at 03:00".
  - **PACK chips**:
    - Checked: bg `#2c2750`, grey text with line-through, green check doodle.
    - Unchecked: 2px yellow outline.
    - Items: HEADLAMP, WARM LAYER, RP 50K FOR COFFEE, TRAIL SHOES.
  - **Timeline rows** (mono time, Archivo title, grey subline):
    - 06:10 Sunrise at the summit / "Guide: Ketut · 2h climb"
    - 09:30 Toya Devasya Hot Springs / "Tickets in Bookings"
    - 13:00 "NAP. TOKEK IS GUARDING IT." / "Nothing booked until 16:00"
  - Tab bar.
- **Data**:
  - DayPlan{date, dayIndex, items[]}.
  - LeaveBy{leaveAt, pickupAt, pickupPlace, note, windowStart}.
  - PointForecast{location = summit, time = sunrise, temp}. This is elevation-specific: 9° at the summit vs 30° daily in 3k-7.
  - Readiness[memberId]{state, at}.
  - Packing[]{label, checked} (per user?).
  - ItineraryItem{start, title, subtitle, guideName, duration, bookingRef}.
- **Actions**:
  - Tap a chip to toggle strike.
  - Tap the temperature to open 3k-7.
  - Tap an item to open its booking or detail (prototype routes SUNRISE to 3k-4 as a demo only).
  - **There is no in-app "I'M UP" control on this screen.** It exists only on the LA (5a-1), the alarm (5b-3) and the Dynamic Island (5a-5).
- **Motion**:
  - Ring drains in real time (conic % = remaining / window). Window length is undefined; 72% at 21:29 implies about 30 min.
  - Countdown at 1Hz.
  - Sleeping friends "snore" with bob (1800ms, second avatar delayed 600ms, opacity .55). When they tap I'm up they "pop awake": pop plus opacity to 1.
  - Pack items "strike through with a pen stroke". Design intent is an animated hand-drawn line. The prototype approximates it with CSS line-through, opacity .5 over 200ms and a pop.
- **States**:
  - Designed: 22 min before leave-by, 4 of 6 up.
  - MISSING:
    - Before the leave-by window.
    - At or after 03:10 (in transit or driver ETA).
    - Overdue with members still asleep.
    - All up.
    - A normal day with no early start.
    - Viewer not in this item (subgroup).
    - Empty pack list.
    - Offline banner (3k-4 is a separate composition).
- **AI**:
  - Guide note and timeline copy ("Tokek is guarding it").
  - Packing list from activity + point forecast (9° leads to warm layer).
  - Precomputed the evening before and included in the offline bundle.
- **Realtime**: readiness changes fan out to all crew in about 1s. They also drive the LA (3k-3) and the alarm escalation.
- **Native**:
  - Leave-by alarm on each member's device: iOS AlarmKit (iOS 26+) or Android `AlarmManager.setAlarmClock` + full-screen intent.
  - "Tokek rings Alex and Dev at 03:00" is an escalation alarm on *their* devices. It is either pre-scheduled locally with cancel-on-"I'm up", or server-triggered.
  - LA, haptics, StandBy (5c-4).
- **Entitlements**: leave-by LA is free for yourself (5a-6: "always free"). Crew readiness across phones is unclear (see Q).

### 3k-3 Lock screen
- **Purpose**: the Leave-by Live Activity plus guide and crew notifications on the lock screen.
- **UI composition**:
  - Lock screen chrome: date "Thursday 15 October", clock 2:48.
  - **LA card** (dark, r28):
    - Guide sticker 58px, pose wave.
    - "LEAVE BY" yellow label, "03:10" 44px.
    - Right side: live countdown "21:28" in yellow + "Pickup at the villa gate".
    - **6-segment crew bar** (green = up, `#3a3466` = not up) + "4 OF 6 UP".
  - Two notifications:
    - Tokek "Rise and shine. The headlamp's by the door. Four of you are up." (now).
    - Maya "I'm up!! who has the good coffee" (2m). Both show the **gecko icon**, which conflicts with 5b-1's "crewmate as sender".
- **Relationship to 5a-1**: 5a-1 (Leave-by) is richer: trail progress villa, pickup, trailhead, summit; an **I'M UP button**; a FREE badge. 3k-3 is a compact variant without the button, so the canonical layout needs a decision.
- **Actions**:
  - Tap LA or Tokek notification: Day-of (zoom).
  - Tap Maya notification: Crew chat.
  - (5a-1: I'M UP from the lock screen without unlocking.)
- **Motion**:
  - Countdown uses a system self-updating timer, so no per-second pushes are needed.
  - "Crew row fills as people tap I'm up" is a remote update per tap. 5a-1 adds a small pop per pip, which is limited to system content transitions in LA.
  - "At 03:10 the card flips to show the driver's ETA" is a state switch at the deadline (scheduled update or push). It needs a driver ETA source.
- **States**:
  - MISSING:
    - Pre-window and start trigger.
    - Post-03:10 driver-ETA face.
    - All up.
    - Ended/dismissed, and stale (no updates, `staleDate`).
    - LA disabled by user.
    - Android rendering.
    - Dynamic Island compact/minimal (see 5a-5).
- **AI**: persona notification copy from templates + state. Must be low-latency, so pre-generate variants.
- **Native**:
  - ActivityKit LA (lock screen + DI compact/minimal/expanded) with remote updates via APNs liveactivity push.
  - **Push-to-start** (iOS 17.2+) so the server can start it.
  - **Broadcast channels** (iOS 18+) to update one shared crew state on up to 6 devices.
  - Interactive button via App Intents (iOS 17+).
  - LA lifetime is at most 8h active plus up to 4h on the lock screen, so start no earlier than about 8h before the deadline.
  - Communication Notifications (INSendMessageIntent) for per-sender avatars.
  - Android: Android 16 Live Updates (ProgressStyle promoted ongoing notification) with a chronometer countdown; MessagingStyle + Person icons.
- **Entitlements**: own leave-by LA is free. Crew-wide LA on all 6 phones is Boost (5a-2, 5a-6). Whether the "4 of 6 up" row needs Boost is unanswered.

### 3k-4 Offline at the top
- **Purpose**: offline-state UI. It shows what still works (pre-downloaded) and what is queued to send.
- **UI composition**:
  - Night-blue hero (332px, `#2c2750` with light dots).
  - Meta row: "THU OCT 15 · DAY 4" + **NO SIGNAL** chip (dark, yellow, blinking dot).
  - Headline "OFFLINE AT THE TOP" (56px).
  - Location-aware body: "Batur summit, 06:14. Today was saved to your phone before you left the villa."
  - Floating guide sticker 112px (orange colourway `#ffb86b`/`#e07a3a`, pose cheer).
  - **STILL WORKS** card (green label + green ticks):
    - "Today's plan and the 09:00 pickup with Ketut"
    - "Trail map, downloaded at 03:02"
    - "Phrase cards and Ketut's number"
    - "Hot spring tickets for 09:30"
  - **SENDS WHEN YOU'RE BACK** card (yellow label + yellow clock glyph):
    - "12 sunrise photos" to crew album
    - "\"we made it!!\" to the crew chat"
    - "Your vote: Nusa Penida"
  - CTA OPEN TODAY'S PLAN, footer "Last synced 03:02 at the villa".
- **Data**:
  - OfflineBundle{tripId, date, assets[]: kind (plan | mapRegion | phrasePack | contacts | ticket), label, downloadedAt}.
  - OutboxOp[]{id, type, summary, destination, createdAt, status}.
  - lastSyncAt + lastSyncPlaceLabel.
  - Current place label, resolved offline from the nearest itinerary item location.
- **Actions**:
  - Open today's plan.
  - The prototype's tap on NO SIGNAL simulates reconnect.
  - MISSING: inspect, cancel or edit a queued op; retry; see the conflict result.
- **Motion**:
  - On signal drop, the top card cross-fades bg pink to night blue with a "soft thud" (thud, above) + light haptic.
  - NO SIGNAL dot blinks at 1400ms.
  - Gecko float at 4600ms.
  - New queued actions append to the SENDS list with the clock mark (drop-in suggested).
  - **On reconnect**:
    1. Chip becomes "BACK ONLINE" (green bg/colour transition 300ms + pop).
    2. Each clock turns into a tick (tick-in 380ms), staggered 350ms + 330ms x n.
    3. Section label flaps to "SENT" at about 1400ms.
    4. Toast: "Back online. 12 photos and a message sent."
    5. "Banner lifts away": translate up + fade. Duration is unspecified; suggest 400ms with E.
- **States**:
  - Designed: offline with a prefetched bundle and 3 queued ops.
  - MISSING:
    - Went offline without a bundle.
    - Partial download or low storage.
    - Sync results: partial failure or conflict after reconnect (e.g. vote closed while offline, plan changed by crew, upload failed).
    - Slow or captive network.
    - Guide chat offline (ask Tokek with no signal).
    - Help/SOS offline (the most important case).
    - Money entry offline.
    - Crew-visible "last seen offline" indicator.
- **AI**: none at runtime. Offline guide Q&A is not designed.
- **Realtime**: the outbox flushes in order and the server acks. The crew sees your items only after sync. Idempotency keys prevent duplicates.
- **Native**:
  - Network path monitoring (NWPathMonitor / ConnectivityManager).
  - Background prefetch (BGTaskScheduler / WorkManager).
  - Geofence exit from the stay or a pre-leave trigger ("saved before you left the villa"; trail map at 03:02 means a refresh at wake time).
  - Background photo upload (URLSession background / WorkManager with network constraint).
  - Encrypted local DB.
  - Offline map tiles (licence must allow caching).
  - Tickets as Wallet passes where possible.
- **Entitlements**: "offline maps … stay free for everyone" (4e-2).
- **Structural Q**: is this a standalone screen, or an offline state/banner applied to hub and Day-of? The caption says "top card" and "banner lifts away", which suggests an app-wide state.

### 3k-5 Flight delayed
- **Purpose**: a disruption report. It shows what the guide auto-fixed, what needs a yes, lets the user broadcast to the crew, and offers undo.
- **UI composition**:
  - Pink hero (318px), meta "SQ 938 · SIN → DPS · MON 12 OCT".
  - Headline "DELAYED 2H 10M" (64px). Body: "New arrival 13:50. Tokek has already sorted most of it."
  - Gecko, pose think, wiggling.
  - **ALREADY DONE** card (green ticks):
    - "Made rebooked for a 13:50 pickup, same car"
    - "Villa knows you'll check in around 15:30"
    - "Rin still lands at 22:40, nothing changes for her"
  - **NEEDS A YES** card (2px yellow inset outline, pulsing):
    - "DINNER: 19:30 → 21:00" / "Locavore can hold the table for 6 until 21:00."
    - Buttons: APPROVE (green), KEEP 19:30 (outline).
    - Avatars W M A + "3 AFFECTED".
  - CTA TELL THE CREW, text link "Undo everything".
- **Data**:
  - Flight{carrier, number, dep/arr IATA, sched/est times, status}.
  - Travellers on the flight (W, M, A).
  - Disruption{type=flight_delay, delta=+2h10, newArrival}.
  - GuideAction[]{description, status, reversible, vendor}.
  - DecisionRequest{title, from→to, vendor note, deadline (hold until 21:00), options, affectedUserIds}.
- **Actions**:
  - APPROVE:
    - Pop, then the card slides off after 160ms.
    - A new ALREADY DONE row "Locavore moved to 21:00 for six" fades in (translateY -8 to 0, 380ms at +560ms).
    - Toast: "Dinner is at 21:00 now. Locavore confirmed."
  - KEEP 19:30: same motion. Row "Dinner stays at 19:30". Toast: "Kept 19:30. You'll go straight from the airport."
  - TELL THE CREW: push to Crew chat with a summary. Toast "Crew told. Three of you land at 13:50." Later a "SQ 938 has landed at DPS." toast with OPEN leads to Egg hatch.
  - Undo everything: reverts all guide actions. Toast: "Undid Tokek's changes. Pickup is back at 11:40."
- **Motion**:
  - Banner "drops in with a thud": hero translateY -90 to +6 (at 75%) to 0, 560ms ease-out, 380ms delay, plus haptic.
  - Fix ticks tick-in at 900ms + 420ms x n. **In production these are driven by real action-completion events, not timers.**
  - Pending card pulse: scale 1 to 1.07 to 1 over 2000ms loop. 7% on a full-width card is heavy; a glow or outline pulse may be preferable.
  - Gecko wiggle 1800ms.
- **States**:
  - Designed: all auto-fixes done, 1 pending decision.
  - MISSING:
    - Fixes in progress (a dashed-circle row pattern exists in 3k-10).
    - Fix failed (driver unreachable, no table).
    - Multiple decisions.
    - Decision taken by another crew member.
    - Hold expiring.
    - Delay changes again (re-plan loop), cancellation or diversion, missed connection.
    - Delay affecting another member (Rin's view).
    - Post-undo.
    - Notification and LA faces (5a-3 has on-time only).
    - Free tier (no email import, no Flight Day LA).
- **AI**: an agentic pipeline.
  1. Flight status change event.
  2. Impact analysis over itinerary, bookings and people.
  3. Action plan classified by policy: autonomous (reversible, zero-cost, informational) vs needs approval (cost, affects others, irreversible).
  4. Execute through vendor channels (F10).
  5. Stream status.
  6. Persona summary.

  Output: `{summary, newTimes, actions:[{id, kind, target, text, status, reversible, requiresApproval, costDelta, affectedUserIds, compensatingActionId}]}`. It runs as a background job; progress is pushed.
- **Realtime**: action progress to affected members; the decision is mirrored in Inbox (3b-4) for the same user; TELL THE CREW posts to chat. Why the broadcast is manual when fixes were automatic is unexplained.
- **Native**:
  - Time-sensitive push ("flight changes always get through", 5b-4).
  - Flight Day LA update with new times; it flips to pickup on landing (5a-3).
  - Landed detection triggers Egg hatch (3l-1).
  - Haptic thud.
- **Entitlements**: Flight Day LA is badged PASS+ (5a-3). Bookings from email is Pass+ only (4e-2 table). Whether auto-fix works for manually added flights or on the free tier is unanswered.

### 3k-6 Help
- **Purpose**: the emergency and assistance hub. It is location-aware and starts temporary location sharing with the crew.
- **UI composition**:
  - Pink hero (300px): "← TOKEK" + live indicator "CREW CAN SEE YOU · 1H" (blinking dot).
  - "NEED A HAND?" (56px) + "You're on Jalan Raya Sayan, Ubud. Tokek has the numbers and the words."
  - Gecko, pose think, wiggling.
  - **CALL 112** primary tile (cream, bell icon, "Ambulance, police, fire") + **110 Tourist police** tile (112px wide).
  - **2x2 problem tiles** (90px):
    - HURT OR SICK (heart, pink)
    - LOST OR STOLEN (wallet, yellow)
    - I'M LOST (pin, blue)
    - MISSED A RIDE (car, green)
  - **Nearest facility row**: "BIMC UBUD · OPEN 24H" / "9 min by car · takes your insurance" + GO.
  - **Phrase card** (cream): "Saya butuh dokter." (Caveat 24px) / "\"I need a doctor.\" Show it, or tap to play." + play button.
  - Footer: "Insurance: Chubb Travel · the policy card is in Bookings".
- **Data**:
  - Device location + reverse geocode (street, area).
  - Country emergency numbers (general, tourist police).
  - Nearest facility{name, hours, open24h, travelTime, acceptsInsurance(policy)}.
  - PhraseCard{lang, text, gloss, audio}.
  - InsurancePolicy{provider, policyNo, docRef, assistanceLine}.
  - LocationShareSession{startedAt, expiresAt = +1h, audience = crew}.
- **Actions**:
  - CALL 112: glow + OS dialer. Toast "Calling 112. Your location is going to the crew."
  - Tiles open the guide as a problem checklist with the right phrase card on top. **The 4 checklist screens are not designed.** Prototype toasts:
    - HURT OR SICK: "BIMC Ubud is 9 minutes away. The phrase card is ready."
    - LOST OR STOLEN: "Freeze your cards first. Tokek has the police report steps."
    - I'M LOST: "Your pin went to the crew. Stay where you are."
    - MISSED A RIDE: "Made is 20 minutes out. Tokek rebooked him."
  - GO: Getting around (3h-3) ride to the clinic.
  - Phrase: TTS playback + glow. "Show it" implies a full-screen large-text show mode, which is not designed.
- **Motion**:
  - Location sharing starts on open.
  - Blink dot 1400ms. Gecko wiggle 1800ms.
  - Glow on CALL and the phrase card.
  - Tile-to-checklist transformation is unspecified.
  - Open from long-press of the guide button: transition unspecified.
- **States**:
  - MISSING:
    - 4 checklist views.
    - Location denied or unavailable.
    - **Offline** (numbers + phrases must work; dialing emergency with "No Service" is OS-handled).
    - No facility found. No insurance on file.
    - Sharing: extend, stop, and expired.
    - Guest-guide or unsupported country.
    - Entry-context variants (from PHARMACY vs long-press).
    - Call failed.
- **AI**:
  - Checklist per problem: safety content should be **curated templates**, localized and personalized by the LLM, not free-generated.
  - Phrase selection by context.
  - Facility ranking.
  - Guide questions spent here should not count toward the quota.
- **Realtime**: location stream to the crew (crew map 3g-4) for 1h, then auto-off enforced server-side and client-side.
- **Native**:
  - Phone dial (iOS `tel:` confirmation; no silent auto-call). The OS handles AML on 112.
  - Foreground + background location for the 1h session (iOS background location indicator; Android foreground service type location).
  - Reverse geocoding.
  - TTS or prerecorded audio for local languages (id, ja, is, es-MX, pt-PT, es-PE), cached offline.
  - Global long-press gesture on the tab-bar guide button. Haptics.
- **Entitlements**: none shown. Must be free (recommend). Live crew map is Boost-only, which conflicts with "crew can see you".

### 3k-7 Forecast
- **Purpose**: a risk dashboard for the rest of the trip. It has daily weather plus a watch list of things that could change the plan.
- **UI composition**:
  - "← BALI" / "CHECKED 07:30".
  - Gecko, pose point, 72px + "THE REST OF THE TRIP" (44px).
  - Guide line: "Weather, roads, crowds and the volcano. I check every three hours and only ping you when it changes the plan."
  - **Day strip card** with 6 columns. Today's column is highlighted (bg `#2c2750`, yellow day label).
  - Each column shows: day, plan theme label (UBUD, BATUR, BOAT, FREE, ULUWATU, FLY), sun/rain icon, temp, **precip bar** (10x30px, fill height = %), and % in mono.
  - "WHAT COULD CHANGE THE PLAN" list. Each row has an icon disc (wave, temple, volcano, car), title, detail and a **status chip**:
    - ROUGH SEAS FRIDAY: PLAN B (yellow)
    - CEREMONY IN UBUD TODAY: WATCHING (blue)
    - BATUR TOMORROW: GO (green)
    - AIRPORT RUN MONDAY: SET (cream)
- **Status semantics (inferred)**:
  - PLAN B: alternative prepared, action advised.
  - WATCHING: monitoring.
  - GO: conditions fine.
  - SET: guide set a time or reminder ("Leave by 13:00").
- **Data**:
  - DailyForecast per plan day at the day's main location (hi temp, condition, precip %).
  - WatchItem{kind: marine | weather | event | volcano | traffic | crowd, title, detail, status, impactScore, dayRef, itemRef, sourceSnapshot, checkedAt}.
  - lastCheckedAt.
- **Actions**: watch rows open detail. Prototype routes:
  - Row 1: Storm warning.
  - Row 2: Running late (demo link).
  - Row 3 toast: "Clear at the summit, 80%. Leave by 03:10."
  - Row 4 toast: "Airport run: leave the villa by 13:00 on Monday."
  - Day column tap: undefined.
- **Motion**:
  - Rain bars fill from the bottom (height 0 to %; stagger suggested).
  - The list "sorts itself by impact": animated reorder (FLIP).
  - A new warning slides in at the top with **one soft buzz** (single light haptic).
  - No loops.
- **States**:
  - MISSING:
    - Checking/loading.
    - Source failure or stale (>3h).
    - Offline cached view.
    - All clear (empty watch list).
    - More than 6 days (scroll).
    - Hourly or day detail.
    - Beyond forecast horizon (pre-trip).
    - Unit preference (°C/°F, 3n-8).
    - Guest-guide or low-data destinations.
    - Resolved or expired watch items.
- **AI**: a 3-hourly job per active trip.
  1. Ingest sources.
  2. Diff against the last snapshot.
  3. LLM + rules map signals to itinerary items and score impact.
  4. Produce WatchItems and persona copy.
  5. Notify only when status escalates into plan-changing. That escalation may create a DecisionRequest (3k-8) or start the Storm LA.
- **Realtime**: the watch list is shared crew-wide. Pings are per user and subject to the ping budget (5b-4). Plan-changing ones are "things that cost money if you miss" and bypass it.
- **Native**: push, haptic, push-to-start LA (3k-8).
- **Entitlements**: not shown.

### 3k-8 Storm warning
- **Purpose**: a decision screen for a plan-threatening marine forecast, with a guide recommendation and crew consensus.
- **UI composition**:
  - Blue hero (372px): "← TOKEK" / "FRI OCT 16 · BOAT DAY", headline "ROUGH SEAS FRIDAY" (64px, 3 lines).
  - Metric chips (dark, blue text): WAVES 2.5M, WIND 35 KM/H, HARBOUR MIGHT CLOSE.
  - Handwritten guide line (Caveat 20px): "Saturday is flat calm. Swap the days and nobody spends Friday seasick."
  - 2 rain doodles bobbing. Gecko 132px, pose think, wiggling.
  - **PICK ONE** option cards (selected = 2px yellow inset):
    - SWAP FRIDAY AND SATURDAY + **TOKEK PICKS** badge: "Boat on Saturday, waves 1.1m. Friday becomes the free day. Seats moved, no fee."
    - KEEP FRIDAY: "If the harbour closes you get a full refund, but the day's gone."
    - SKIP THE BOAT: "Tegenungan waterfall and a long lunch instead. $38 back each."
  - Consensus row: avatars M A J W + "4 of 6 said swap. Dev and Rin are napping after Batur."
  - CTA "SWAP THE DAYS". Its label follows the selection.
- **Data**:
  - MarineForecast{waveHeight, wind, harbourStatus} per day.
  - DecisionRequest{options[]{id, title, detail, perPersonCostDelta, refundPolicy, vendorChanges[], recommended}, votes[], quorum?, deciderRole}.
  - Member presence or activity ("napping", inferred from the plan: rest after Batur).
- **Actions**:
  - Select an option: radio + pop, CTA flaps to SWAP THE DAYS / KEEP FRIDAY / SKIP THE BOAT.
  - Caption: "Picking an option re-prices it for the crew": the per-person cost delta shows to everyone.
  - CTA commits. Toasts:
    - "Swapped. Boat day is Saturday now. Seats moved, no fee."
    - "Kept Friday. Tokek watches the harbour from 5am."
    - "Boat skipped. $38 back each, waterfall at 10."
  - Commit mutates the plan (3e-1), vendor bookings (fast-boat seats) and Balances (refunds).
- **Motion**:
  - Rain bob 2600ms and 3000ms (delay 700). Gecko wiggle 2000ms.
  - Selection: pop + CTA flap.
  - On SWAP: the two day cards in the plan swap with a "quick card-trick flip". Spec missing; suggest 3D rotateY + position exchange, about 500 to 600ms.
  - "Arrives as a live activity the moment the marine forecast turns."
- **States**:
  - MISSING:
    - **The Storm LA itself** (not drawn in 5a).
    - Voting in progress or quorum not met.
    - Non-organiser view (vote vs decide).
    - Decided by someone else.
    - Vendor can't move seats.
    - Forecast improves (auto-withdraw).
    - Harbour actually closed.
    - Refund processing or failed.
    - Deadline.
- **AI**:
  - Option generation under constraints: seat availability, fees, refund rules, alternatives nearby, dependencies with other days.
  - Recommendation + rationale.
  - Consensus summary copy.
- **Realtime**: live vote tally; commit propagates plan, bookings and balance changes to all.
- **Native**:
  - LA **push-to-start** from the server (iOS 17.2+) + Dynamic Island.
  - Actionable notification (vote from lock screen like 5b-2?).
  - Haptic.
- **Entitlements**: not shown.

### 3k-9 Running late
- **Purpose**: a live in-transit disruption. The route is redrawn around a closure and the user chooses how to handle a late arrival to a booked slot.
- **UI composition**:
  - **Map** (top 318px, dark stylized, "map · Ubud centre").
  - Top pills: "← TODAY" and pink "ETA 14:25".
  - Closure callout "CLOSED TILL 15:00" (pink, temple icon) on a pink segment.
  - Destination pin "KARSA" (green, heart icon).
  - Car marker (yellow disc, bobbing). Route: solid yellow travelled + **dashed detour**.
  - **Bottom sheet** (r36):
    - "KARSA SPA · 14:00" + "+25 MIN" chip.
    - "RUNNING 25 MIN LATE" (42px).
    - Reason: "A temple procession closed Jalan Raya until 15:00. Made is looping round through Penestanan."
  - Radio list:
    - **PUSH THE SPA TO 14:30** + "KARSA SAID YES" (green): "Maya and Rin start on time. You and Jordan slot in after."
    - WALK THE LAST BIT: "Made drops you at the rice fields. 12 minutes on foot."
    - SKIP IT: "Half back, that's Karsa's rule. Tokek will ask for more."
  - CTA "PUSH TO 14:30" (flaps with selection).
- **Data**:
  - Active transfer{driver, vehicle, live position, route, ETA}.
  - Closure{geometry, reason, until, source}.
  - Target item{vendor, start, participants split (M+R on time; W+J later)}.
  - Options with vendorConfirmation state and refundPolicy.
- **Actions**:
  - Select an option: radio fill + CTA flap.
  - Caption: "Choosing an option messages whoever's waiting before you've even pressed the button". The heads-up to waiting crew (Maya, Rin) is sent on selection; exact semantics are open.
  - CTA commits. Toasts:
    - "Spa moved to 14:30. Maya and Rin start without you."
    - "Made drops you at the rice fields. Left at the warung."
    - "Skipped. Tokek is asking Karsa for the full refund."
- **Motion**:
  - Route redraws as the detour is taken (stroke-dash path animation).
  - The closed stretch pulses pink (opacity/width loop).
  - ETA ticks live (recount at least every minute).
  - Car bob 1600ms.
  - Radio pop + CTA flap.
- **States**:
  - MISSING:
    - Vendor pending or declined (the design shows only pre-confirmed).
    - No longer late.
    - No driver feed (own scooter or walking; use the device's own GPS).
    - Walking directions after WALK THE LAST BIT.
    - Refund status.
    - The waiting crew's view (Maya).
    - Map loading or offline.
    - Multiple late parties.
- **AI**:
  - Reason summary.
  - Option generation.
  - **Vendor negotiation before the user sees the screen** ("KARSA SAID YES").
  - Messages to the waiting crew and the vendor.
- **Realtime**: position and ETA stream; messages to a subgroup; per-person schedule split for one item.
- **Native**:
  - Location (the user is in the car, so their own GPS can proxy the driver).
  - Maps SDK with custom dark style.
  - Routing with closures (avoid areas) and traffic.
  - Haptics.
  - Crew LA "RUNNING LATE" one-tap (5a-2).
- **Entitlements**: unknown. The crew LA is Boost.

### 3k-10 Crew SOS
- **Purpose**: the view every *other* crew member gets when someone triggers SOS. It coordinates the response.
- **UI composition**:
  - Pink hero (404px): "● SOS · 16:42" (fast blink) + "1.2 KM FROM YOU".
  - Avatar 68px "J" + "JORDAN NEEDS HELP" (50px).
  - Guide-written situation summary: "He came off his scooter on Jalan Raya Campuhan. He's sitting up and talking."
  - Jordan's message bubble: "knee's scraped up, bike's fine. i'm ok. mostly" + "JORDAN · 16:43".
  - **TOKEK'S ON IT** card:
    - ✓ "SOS sent to all five of you"
    - ✓ "His location stays live until he's safe"
    - ✓ "Called BIMC Ubud. They know he may come in"
    - Dashed/pending: "Sending his insurance details to the clinic"
  - Responder row: avatar A + "**Alex is going.** 4 minutes away on foot."
  - CTAs: I'M GOING (yellow) + CALL JORDAN (outline). Link "See him on the map".
- **Data**:
  - SOSIncident{id, userId, startedAt, location stream, distance to viewer, status}.
  - Sender message(s).
  - AI summary.
  - Steps[]{text, status}.
  - Responders[]{userId, state going/arrived, ETA, mode}.
- **Actions**:
  - I'M GOING: once, flaps to "GOING ✓". Toast "Jordan knows you're coming. 7 minutes on foot." The map becomes walking directions.
  - CALL JORDAN: phone.
  - See him on the map: Crew map.
- **Motion**:
  - "Breaks through whatever screen you are on with one long buzz" (full-screen `rise` takeover + long vibration).
  - SOS dot blinks at 900ms (faster than elsewhere) **until someone answers**.
  - Steps tick in as they complete. The prototype flips the insurance step at 2200ms: dashed to green check pop, text becomes "Sent his insurance details to the clinic".
- **States**:
  - MISSING:
    - **Sender flow**: trigger, confirm or cancel countdown, "I'm OK" / resolve.
    - Resolved / "he's safe".
    - False alarm.
    - No responder yet.
    - Responder arrived.
    - Sender offline (SMS fallback?).
    - Escalate to 112 from SOS.
    - Lock-screen, notification and LA faces.
    - Crew member far away (other city).
    - Unboosted crew.
    - Viewer has sharing paused.
- **AI**:
  - Situation summary from sender input. Must be fast, with fallback to raw text.
  - Guide steps: **phone the clinic** (implies an outbound AI voice call or a human service) and **send insurance details** (needs sender consent).
  - Fan-out must be deterministic and must not depend on the LLM.
- **Realtime**: sub-second fan-out; live sender location; responder states and ETAs; message thread.
- **Native**:
  - iOS **Critical Alerts** (Apple entitlement, approval uncertain) or the Time-Sensitive interruption level.
  - Full-screen in-app takeover.
  - Android high-priority FCM + full-screen intent (restricted on Android 14+ for non-alarm/calling apps) + DND-bypass channel.
  - Sender background location until resolved.
  - Phone call. Core Haptics long buzz in foreground.
  - Crew LA SOS (5a-2).
- **Entitlements**: 4f-2 markets "the live map … with walking times and SOS" as Boost. **Gating SOS behind payment is a safety/ethics issue; recommend free.**

---

## 4. Feature list

| # | Feature | Screens | Size | Why | Depends on |
|---|---|---|---|---|---|
| F1 | Trip hub shell (phase-aware header, countdown, 4 live tiles, tab bar with guide tap/long-press) | 3k-1 | M | aggregates 4 domains + phase variants | trips, bookings, balances, quests |
| F2 | Guide daily briefing (typed actionable items, lifecycle, event-inserted items) | 3k-1 (+5b-1, 5c-2) | L | daily LLM job per user, action types, dedupe with roundup | LLM infra, F9, push |
| F3 | Crew activity feed + ticker | 3k-1 | S | event log + subscription + marquee | realtime, event emitters in all modules |
| F4 | Day-of view (leave-by hero, ring, timeline, packing) | 3k-2 | M | one day payload, mostly presentational | plan, point forecast, bookings |
| F5 | Leave-by engine + crew readiness ("I'm up") + wake escalation | 3k-2, 3k-3 (+5a-1, 5b-3, 5c-4) | L | travel-time calc, per-member state, alarms on others' phones, snooze, escalation | F6, alarms, push, routing |
| F6 | Live Activities platform (leave-by, storm, flight, crew) + Android Live Updates | 3k-3, 3k-8 (+5a) | L | extension, push tokens, push-to-start, broadcast, App Intents, pre-rendered critter assets, 8h limit | APNs/FCM, asset pipeline |
| F7 | Offline mode: day bundles, offline tiles, outbox, sync and conflicts, offline UI state | 3k-4 | XL | local-first store, prefetch triggers, idempotent writes on every API, conflict rules | all write APIs, map provider |
| F8 | Flight status monitoring | 3k-5 (+3h-1, 5a-3) | M | provider subscription/webhooks, match to members, change detection, landed event | flight data vendor, bookings |
| F9 | Guide action engine (agentic auto-fix, approval policy, progress stream, undo, audit) | 3k-5, 3k-8, 3k-9, 3k-10 | XL | tool-calling with autonomy policy, compensating actions, idempotency, liability | LLM, F10, plan/bookings/balances write APIs |
| F10 | Vendor communications (driver, villa, restaurant, spa, clinic) incl. reply parsing | 3k-5, 3k-9, 3k-10 | XL | no APIs for most local SMEs; WhatsApp/SMS/email/voice; confirmations | messaging providers, vendor directory |
| F11 | Help hub (emergency numbers dataset, reverse geocode, nearest facility + insurance fit, 4 problem checklists) | 3k-6 | L | curated per-country safety content + localization + offline | places data, F12, F17, F18 |
| F12 | Temporary location sharing sessions (Help 1h, SOS until safe) | 3k-6, 3k-10 (+3g-4) | M | background location, expiry enforced both sides, audience | crew map |
| F13 | Forecast and watch list (multi-source ingest, 3h job, impact scoring, ping-on-change) | 3k-7 | XL | heterogeneous sources (marine, volcano, ceremonies, traffic, crowds) + LLM impact | weather/marine/volcano/traffic/events vendors, LLM |
| F14 | Plan-change decisions (options, re-pricing, crew votes, commit, swap days, refunds) | 3k-8 (+3b-4, 3e-1) | L | shared DecisionRequest used by 3k-5/3k-8/3k-9 + inbox; plan and balance mutation | F9, polls, balances |
| F15 | Running-late detection and rerouting (live ETA, closures, options, subgroup split) | 3k-9 | XL | live tracking + closure-aware routing + lateness trigger + vendor confirm | routing/traffic API, F9, F10, F12 |
| F16 | Crew SOS (trigger, breakthrough alerting, takeover, responders, guide steps, resolve) | 3k-10 (+5a-2, 3g-4) | L (XL with AI calls) | safety-critical reliability, OS entitlements, sender flow undesigned | F12, push entitlements, F10 |
| F17 | Phrase card + TTS (offline audio) | 3k-6 (+3h-3) | S | shared component; pre-generated audio per phrase and language | TTS vendor |
| F18 | Insurance policy vault + consented sharing | 3k-6, 3k-10 | S | doc storage in Bookings + consent + send to clinic | bookings, F10 |

---

## 5. Data model contributions

- **Trip** (+): `phase` (planning | pre_trip | in_trip | post_trip), `tz` (destination), `boostStatus`, `countdownTargetPerUser` (derived from the user's outbound flight).
- **Briefing** {id, tripId, userId, date, generatedAt, model, items[]}. **BriefingItem** {id, icon, text, action{type: done | nudge | set | open, targetUserIds[], payload}, status: pending | done | dismissed, source: daily_job | event, sourceEventId}.
- **ActivityEvent** {id, tripId, actor: user | guide, verb, objectType, objectId, text, at}. Append-only; feeds the ticker and recap (3m).
- **ItineraryItem** (+): `participantUserIds[]` (subgroups: spa split), `pointLocation`, `bookingId`, `providerId`, `guideHold` (e.g. "Tokek is guarding it"), `leaveBy`.
- **LeaveBy** {itemId, leaveAt, pickupAt, pickupPlace, computedFrom{travelMin, bufferMin}, windowStart, alarmPolicy}.
- **Readiness** {tripId, itemId, userId, state: asleep | up, at, source: la | alarm | app | widget, snoozeCount, escalatedAt}.
- **PackingItem** {id, tripId, dayId, userId?, label, checked, suggestedBy: guide | user}.
- **DeviceActivity** {userId, deviceId, kind: leave_by | storm | flight | crew | encounter, activityId, pushToken, pushToStartToken, broadcastChannelId, startedAt, endsAt, state}.
- **OfflineBundle** {tripId, date, version, assets[]{kind, ref, bytes, downloadedAt}, mapRegion{bbox, zoom}}. **OutboxOp** (client) {clientOpId (UUIDv7, idempotency key), type: chat_msg | photo | vote | expense | readiness | …, payload, summary, createdAt, attempts, status, serverResult}.
- **Flight** {carrier, number, date, depIata, arrIata, sched/est/actual dep and arr, status, gate, providerRef}. **FlightTraveller** {flightId, userId, bookingId}.
- **Disruption** {id, tripId, kind: flight_delay | weather | marine | closure | late | sos, severity, detectedAt, sourceSnapshot, affectedUserIds[], affectedItemIds[], status}.
- **GuideAction** {id, disruptionId?, kind: reschedule_transfer | notify_host | hold_table | move_item | swap_days | request_refund | call_facility | send_document, targetProviderId, channel, text, status: planned | running | done | failed | needs_approval | undone, reversible, compensatesActionId, costDelta{currency, perUser[]}, executedAt, auditLog[]}.
- **DecisionRequest** {id, tripId, disruptionId?, title, options[]{id, title, detail, recommended, costDelta, providerChanges[], vendorConfirmed}, votes[]{userId, optionId, at}, deciderPolicy: organiser | majority | any_affected, deadline, decidedOptionId, decidedBy}. Shared by 3k-5, 3k-8 and 3k-9 and mirrored in Inbox.
- **Forecast snapshots**: DailyForecast {tripId, date, location, hi, lo, condition, precipPct}. PointForecast {itemId, time, temp, conditions, elevation}. MarineForecast {area, time, waveM, windKmh}.
- **WatchItem** {id, tripId, kind, title, detail, status: plan_b | watching | go | set, impactScore, dayId, itemId, decisionRequestId?, checkedAt, resolvedAt}.
- **Provider** {id, kind: driver | stay | restaurant | spa | clinic | tour_guide | boat, name, contact{phone, whatsapp, email}, vehicle{model, plate}, policies{refund, reschedule}, acceptsInsurance[]}. It has a relationship to Bookings (3h).
- **CountryEmergency** {country, general, police, ambulance, fire, touristPolice, notes, verifiedAt}. **Facility** {name, kind, hours, geo, insuranceNetworks[]}.
- **PhraseCard** {id, lang, text, gloss, audioUrl, contexts[] (hurt, lost, …), offline: true}.
- **InsurancePolicy** {userId, provider, policyNo, assistancePhone, docRef}. Sensitive; per-user.
- **LocationShareSession** {id, userId, tripId, reason: help | sos | crew_map, audience, startedAt, expiresAt | untilResolved, pausedAt}.
- **SOSIncident** {id, tripId, userId, startedAt, status: active | responding | resolved | false_alarm, summary, messages[], steps[] (GuideAction refs), responders[]{userId, state, eta, mode}, resolvedBy, resolvedAt}.

**Privacy notes**:
- Precise location is limited to trip days, with auto-expiry. Crew map sharing ends "Oct 19 at midnight".
- Help and SOS sessions override a paused crew-map share (needs explicit copy).
- Health context (hurt/sick, clinic call) and the insurance policy are sensitive data. Sharing them with a clinic needs the **sender's explicit consent** (pre-consent in settings or at SOS time).
- Vendor messages expose traveller names and times.
- Call recordings or transcripts, if AI voice is used, need disclosure and retention rules.
- Briefing items naming members ("Dev and Alex haven't got any yet") reveal other members' status; per-viewer visibility rules are needed.
- Offline bundles must be encrypted at rest (tickets, contacts, policy card).

---

## 6. Backend / API needs

**Endpoints** (REST or RPC; illustrative)
- `GET /trips/{id}/hub`: phase, countdown target, tiles summary, briefing, ticker seed.
- `POST /briefing-items/{id}/actions` {type: dismiss | nudge | confirm}.
- `GET /trips/{id}/days/{date}`: day-of payload (leave-by, items, point forecast, packing, readiness).
- `PUT /trips/{id}/items/{itemId}/readiness` {state}. `PATCH /packing-items/{id}`.
- `POST /devices/{id}/activities` (register LA push and push-to-start tokens, broadcast channel subscriptions). `DELETE` on end.
- `GET /trips/{id}/offline-bundle?date=` (manifest + signed asset URLs). `POST /sync/outbox` (batch, per-op idempotency keys, per-op results including `conflict` or `rejected: vote_closed`).
- `GET /disruptions/{id}`, `POST /disruptions/{id}/undo`, `POST /disruptions/{id}/announce`.
- `POST /decisions/{id}/votes`, `POST /decisions/{id}/commit`.
- `GET /trips/{id}/forecast`, `GET /trips/{id}/watchlist`.
- `GET /help/context?lat&lng&tripId`: place label, emergency numbers, nearest facilities with insurance fit, phrase cards. It must also ship inside the offline bundle.
- `POST /location-shares` {reason, ttl}, `PATCH /location-shares/{id}` (stop/extend), `POST /location-shares/{id}/points` (batched).
- `POST /sos`, `POST /sos/{id}/messages`, `POST /sos/{id}/respond` {state}, `POST /sos/{id}/resolve`.
- Webhook ingress: flight status provider, messaging provider (vendor replies), voice provider (call outcomes).

**Background jobs**
- Morning briefing generator (per user, local morning or before the day's first item). Dedupe with the 20:00 evening roundup (5b-1).
- Day bundle builder + prefetch trigger. Night before + on geofence exit from the stay + at wake.
- Leave-by scheduler:
  - Compute leave-by from routing.
  - Schedule the LA start via push-to-start at T-≤8h.
  - Schedule alarms.
  - Escalate at T-10 for not-up members ("Tokek rings Alex and Dev").
  - After a second snooze, ping the crew (5b-3).
- LA updater (fan-out of readiness, ETA, flip at deadline); respects the APNs budget.
- Flight monitor (webhook + poll fallback) that emits Disruption and landed events (Egg hatch, pickup flip).
- Forecast watcher (every 3h per active trip; plus a faster cadence for high-severity marine and volcano alerts).
- ETA monitor for active transfers (≤1 min cadence) that emits "running late" when ETA > item start + threshold.
- Guide action executor (queue, retries, timeouts, compensation, audit).
- SOS orchestrator. Deterministic fan-out first, then AI steps, then an escalation timer if no responder.
- Location share expiry sweeper.
- Outbox processor (server-side idempotency store).

**Realtime channels**
- `trip:{id}`: activity events, plan and tiles changes, readiness, decisions and votes.
- `disruption:{id}`: action progress.
- `sos:{id}`: location, responders, steps, messages.
- `user:{id}`: briefing, outbox acks, personal alerts.
- Push: APNs (alert with time-sensitive or critical level, liveactivity, background) and FCM (high priority).

**3rd-party data and services** (candidates, 2026)
- Flight status: FlightAware AeroAPI (alerts), Cirium, OAG.
- Weather: Apple WeatherKit (REST works cross-platform), Open-Meteo, Tomorrow.io. Point/elevation forecasts are needed.
- Marine: Open-Meteo Marine, Stormglass.
- Volcano: MAGMA Indonesia / PVMBG VONA; generalize via Smithsonian GVP/USGS for Iceland and Mexico.
- Traffic, routing, closures: Google Routes, HERE, TomTom Traffic Incidents, Mapbox. Closure-aware rerouting uses avoid-areas.
- Local events and ceremonies: no reliable API; use curated calendars + LLM web search with verification.
- Crowds: BestTime.app or similar.
- Places and hospitals: Google Places / Foursquare. Insurance network fit comes from insurer assistance APIs (mostly unavailable, so manual curation).
- Maps with offline tiles: Mapbox or MapLibre + self-hosted tiles. Google Maps Platform terms restrict offline caching.
- Messaging: WhatsApp Business Platform (template + 24h window rules), Twilio SMS, email.
- Voice: telephony + realtime speech LLM for AI calls, or a human assistance partner.
- TTS: neural TTS for id/ja/is/es/pt/qu variants, pre-rendered to files.
- Push: APNs, FCM.

---

## 7. Cross-slice dependencies and shared components

**Dependencies**
- 3b-2 Home (BALI card zoom into hub; countdown also in 5c-1 widget).
- 3b-4 Inbox (the same dinner DecisionRequest; UNDO for "Tokek moved Rin's pickup").
- 3e-1 Trip plan (PLAN tile; BATUR card to Day-of; storm swap reorders day cards).
- 3h-1 Bookings (tile, "all offline", tickets, SQ 938, policy card).
- 3h-3 Getting around (driver Made tracking, car ETA, phrase card TTS, GO ride).
- 3i-1 Balances (MONEY tile; refunds "$38 back each"; re-pricing).
- 3l-7 Crew quests (QUESTS tile, crew level).
- 3l-1 Egg hatch (triggered by the flight-landed event after 3k-5).
- 3j-1 Guide chat (centre button, PHARMACY quick action).
- 3g-1 Crew chat (TELL THE CREW, queued messages, Maya notification).
- 3g-4 Crew map (SOS parent, 1h help sharing, location sessions).
- 3m-2 Photos (queued uploads to the crew album); 3m recap consumes ActivityEvents.
- 5a-1 Leave-by, 5a-2 Crew live (RUNNING LATE, SOS), 5a-3 Flight day, 5a-5 Dynamic Island, 5a-6 boost upsell.
- 5b-1 roundup vs morning briefing; 5b-3 leave-by alarm; 5b-4 ping budget (exempt: leave-by, SOS, flight changes, money-critical).
- 5c-2 Today widget (same day payload; NUDGE), 5c-4 StandBy.
- 4e-2 / 4f-2 entitlements (live map Boost; Pass+ email bookings).
- 3n-8 units and currency.

**Shared components**
- Dotted hero card (pink, blue, night variants) with guide sticker pose.
- Status chip (DONE, NUDGE, SET, PLAN B, WATCHING, GO, KARSA SAID YES, TOKEK PICKS, +25 MIN).
- Checklist row with 3 states: done tick, queued clock, in-progress dashed.
- Initials avatar stack (member colour, overlap, dim + bob when inactive).
- Option radio card list with recommended badge + CTA whose label flaps to the selection.
- Primary pill CTA 58px + secondary text link.
- `tg-count` countdown (dhms/ms) and conic countdown ring.
- Phrase card (Caveat + play) with TTS.
- Stylized dark map with route, closure and pin callouts.
- Tab bar with centre guide button (tap = chat, long-press = Help).
- Dynamic Island toast.
- Marquee ticker.
- Motion presets and micro-animations (section 2).
- Critter raster export for LA, notifications and widgets.

---

## 8. Implementation risks / hard parts

1. **Real-world agentic actions (F9/F10)**. "Made rebooked", "Villa knows", "Locavore can hold", "Karsa said yes", "Called BIMC Ubud" all assume the guide can contact and get confirmations from small local vendors that mostly have no APIs.
   - WhatsApp Business needs approved templates, and replies are only possible inside the 24h window.
   - AI outbound calls carry disclosure, consent and robocall rules and accuracy risk.
   - Liability when the guide acts wrongly.
   - "Undo everything" cannot unsend messages. Only compensating actions are possible, which must be modelled per action.
   - MVP likely needs pre-integrated partners (transfer and boat operators), user-sent drafts ("send this to Made"), or a human ops desk.
2. **Safety-critical delivery (SOS, leave-by alarm)**.
   - iOS Critical Alerts need Apple approval, which is not guaranteed. Time-Sensitive does not bypass silent mode.
   - AlarmKit (iOS 26+) fits leave-by alarms but not remote SOS.
   - Android 14+ restricts the full-screen intent permission. The Play policy declaration may be refused for a travel app.
   - SOS must work on poor networks (SMS fallback?) and must not wait on the LLM.
   - False alarms, legal disclaimers, and accuracy of the emergency-number dataset.
3. **Live Activities constraints**.
   - 8h active cap: Batur LA started at night is fine; the SOS "until he's safe" may exceed it.
   - APNs update budget: high-frequency ETA updates need the frequent-updates key and careful priority use.
   - Push-to-start is required for storm and flight. Broadcast channels are needed for crew-wide readiness.
   - Interactive buttons run App Intents in the background with limited time.
   - Only system transitions are available, so the "card flips" are approximations.
   - Critter art must be pre-rendered assets, since the Canvas2D renderer is unusable in extensions, and asset sizes are small.
   - Android has no 1:1 equivalent (Live Updates on 16+, OEM variance).
4. **Offline-first correctness (F7)**. Prefetch timing ("before you left the villa"), offline tile licensing, an idempotent write API for every op type, ordering, conflicts (vote closed or plan edited while offline), large photo uploads, clock skew, encrypted storage size budgets. Every other module's write path must be outbox-compatible, which is cross-cutting.
5. **Forecast impact reasoning (F13)**. Mapping heterogeneous signals to itinerary items, avoiding noisy pings ("only when it changes the plan"), no data source for local ceremonies or closures (hallucination risk from LLM web search), elevation and point-in-time forecasts (9° at the summit vs 30° daily), cost of 3-hourly LLM runs per active trip.
6. **Live tracking and lateness (F15)**. The driver's position is not available unless the provider integrates, so use the traveller's device as a proxy. Closure data freshness; ETA flapping causing alert churn; per-person schedule splits in the plan model.
7. **Leave-by computation**. The design is inconsistent: leave-by 03:10 vs "pickup at the villa gate, 03:30" (3k-2) vs "Made is outside" at 03:10 (5b-3). The source of truth for pickup and buffer is unclear. Escalation "rings" on other people's phones needs their alarm permission.
8. **Time zones**. All times are destination-local; devices may still be on home time; alarms and LAs must use the correct zone; crew may be split across zones on travel days.
9. **Multi-surface consistency**. The same state (readiness, ETA, decisions) renders in the app, LA, Dynamic Island, widgets, notifications, Inbox and chat. A single source of truth + versioned state + surface-specific throttles are needed.
10. **Entitlement ambiguity on safety features**. Live map (and SOS per the 4f-2 copy) is Boost-gated; Help location sharing needs the crew to see you. Must be resolved before build.
11. **LLM cost and latency**. Per-user daily briefings, 3h watch jobs, disruption planning and SOS summaries. Per-trip budgets and caching are needed; SOS and disruption paths need a hard timeout with template fallback.

---

## 9. Ambiguities and open product questions

1. Hub phases: what does 3k-1 look like during the trip (Day N, today's next item?) and after? Only the T-17d state is drawn, despite the section intent being "during the trip".
2. Is the briefing per user or per crew? Who sees NUDGE/SET chips (organiser only)? Once W nudges, do others' briefings update?
3. Morning briefing vs 20:00 evening roundup (5b-1) vs Inbox (3b-4): which items go where, and how are they deduped?
4. Leave-by semantics: is 03:10 "leave your room" with pickup at 03:30, or is the driver there at 03:10? How is the buffer computed, and can the user edit it?
5. Is "I'm up" available in-app on Day-of? What happens to people who never confirm (after escalation: crew knock, guide calls)?
6. Is the 3k-3 LA layout canonical, or 5a-1's (trail + I'M UP button)? What is on the post-03:10 "driver ETA" face?
7. Is the crew readiness row on the LA free (5a-1 shows FREE with "4 OF 6 UP") or Boost (5a-6 "crew on all six phones")?
8. Pack list: per person or shared? Guide-generated, user-editable, or both?
9. Offline: is 3k-4 a screen or an app-wide state/banner? Which modules must work offline (guide chat, money entry, Help)? What happens to a queued vote if the poll closed meanwhile?
10. Flight delay auto-fix: which actions may the guide take without asking (autonomy policy)? Does it work for manually entered flights on free, or only email-imported (Pass+)? Why is TELL THE CREW manual? Who may approve the dinner move for all 6 (the viewer, organiser, or any affected member)? What does "3 AFFECTED" count when the table is for 6?
11. "Undo everything": what is its scope and time window, and what happens to messages already sent to vendors?
12. How does the guide contact vendors (WhatsApp, SMS, calls, partner APIs, human ops)? Does the user see or approve outgoing vendor messages? Is it OK for the guide to phone a clinic on a user's behalf?
13. Help: tile checklists (4 screens) are undesigned; is the content curated or generated? Can the user stop or extend the 1h sharing? Does opening Help (not pressing anything) really start sharing automatically? Consent copy?
14. Does Help/SOS share location even if the user paused crew-map sharing (Dev "paused sharing at 14:00")?
15. SOS: how does the sender trigger it (button location, confirm, cancel window)? Who resolves it ("he's safe")? Does SOS escalate to 112 automatically if no one responds? Is SOS free for unboosted crews? (4f-2 lists SOS as a Boost live-map perk.)
16. Insurance details to the clinic: needs explicit consent. Is it pre-authorised at setup or asked at SOS time? What is the channel?
17. Forecast: when do the 4 status chips transition? Can the user mute a watch item? What does tapping a day column do? Is there hourly detail?
18. Storm decision: vote or organiser decision? Quorum and deadline? What if seats cannot move? Does "picking an option re-price it for the crew" publish on selection, before commit?
19. Storm Live Activity layout is not designed (not among the 5a screens).
20. Running late: "messages whoever's waiting before you've even pressed the button": sent on selection, or pre-sent when lateness is detected? What happens if the selection changes? How was "KARSA SAID YES" obtained before the user chose?
21. Running late: driver position source (partner app, Grab/Gojek API, or the traveller's phone)? What happens when there is no driver (scooter, walking)?
22. Sub-group schedules ("Maya and Rin start on time; you and Jordan slot in after"): does the plan model support per-person times within one booking?
23. Notification sender icon: the lock screen shows the gecko for Maya's message, while 5b-1 says crewmates are senders with their own avatar.
24. Trip hub "WHEELS UP IN": whose flight, the viewer's or the first crew member's? What about crew on different flights (Rin)?
25. Guest-guide destinations: is the same during-trip feature set available (data coverage for emergency numbers, forecasts, phrases)?
26. Entitlements for F13/F15/F9 (forecast watch, rerouting, auto-fixes) are not stated anywhere. Are they free, Pass+ or Boost? And does guide work triggered by disruptions consume the 30/day question quota?

Status: DONE
Summary: 10 screens specced with exact motion params from the HTML and prototype, plus 18 features, data model, APIs/jobs, risks and 26 open questions.
