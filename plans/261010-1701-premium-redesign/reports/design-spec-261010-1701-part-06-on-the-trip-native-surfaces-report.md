# Design spec: Part 6 "On the Trip" (6.01–6.38) and the native surfaces

Inputs read: `$Z/CritterPass 06 On the Trip.dc.html` (styled tree plus the inline data script `Src2/4/5/6/8`), `$SP/txt-06-On-the-Trip.txt`, all 36 phone PNGs in `$SP/shots/06/`, plus 6.28 and 6.37 rendered from their `data-screen-label` frames (`$SP/lane06/shots/6.28.png`, `6.37.png`; the detector missed them because they are an 844×390 StandBy frame and an Android frame), Foundations 1.05 and 1.08 keyframes, and `$R` at `fc1a78d21` (routes, features, `targets/**`, `modules/**`, `docs/api-contracts-async.md` §3–6, `packages/domain/src/notifications.ts`).

Notation: `16/600` means size/weight. "card shadow" means `0 0 0 .5px rgba(20,22,40,.05), 0 1px 2px rgba(20,22,40,.04), 0 14px 34px -12px rgba(20,22,40,.16)`. "glass btn" means a 44×44 r22 nav button, `rgba(255,255,255,.62)` blur 18 saturate 1.8, inset top 1px white .95, inset .5px white .6, `0 0 0 .5px rgba(20,22,40,.07)`, `0 8px 20px -6px rgba(20,22,40,.16)`. "ink pill" means the Foundations ink pill (gradient `#30313b→#16171d`, inset top white .18, shadow `0 16 32 -10` ink .5), h56 r28 17/600, placed `left/right 24, bottom 28–40` unless noted. "ink btn" means a flat `#1c1d24` pill with white text (secondary dark). Avatar initials are 9–26/700 in `#17142a` on the person's crew colour (W sun, M pink, A sky, J mint, R tangerine, D crew neutral `#f4efe4`).

---

## 1. Summary

- **38 screens**: 25 in-app phones (6.01–6.25 plus 6.38), 1 in-app or system full-screen alarm (6.26), and 12 OS surfaces (6.27 Dynamic Island, 6.28 StandBy, 6.29 lock-screen vote, 6.30 and 6.32 Live Activities, 6.31 home widgets, 6.33–6.36 iOS notifications, 6.37 Android shade).
- **The logic mostly exists.** Hub with briefing, tiles and ticker; day-of; forecast; storm; running late; flight disruption; crew live map with primer, offline and gate states; offline card with queue sheet; help; SOS; the whole driver flow; the leave-by alarm (AlarmKit and Android full-screen); 9 Live Activity kinds; 9 widgets plus Controls; communication notifications; vote and RSVP posters; Android channels, MessagingStyle and Live Updates; ping settings. The redesign is mainly a **visual and structural restyle**.
- **New relative to the current app:**
  - 6.03 check-in hero with rooms waiting on a nod.
  - 6.05 free-day suggestions.
  - 6.14 meet-up compass, an AR-style camera view plus a compass dial.
  - 6.34 changeset rich notification (new poster).
  - 6.36 roundup as a rich multi-line notification.
  - 6.38 per-crew chat modes and the "hide message text" switch on this page.
  - The light "Liquid Glass" look for every Live Activity and widget. Today they are dark ink-purple (`LAPalette.card #120F22`).
- **Hardest pieces:**
  1. Restyling every native surface onto the new tokens. There is no shared Swift token file: `LAPalette` and `PosterPalette` are hand-copied old-brand colours, and `packages/design-tokens` emits `generated/swift/CPTokens.swift`, which no target uses. The Android Glance and Compose mirrors need the same restyle.
  2. 6.32 meet-up Live Activity. The drawn card is about 196 pt tall, but iOS clips lock-screen activities at 160 pt.
  3. 6.14 compass: device heading, crew bearings, a camera overlay and turn-by-turn walking steps.
  4. Rich notifications the OS cannot draw as designed. 6.36 shows five lines on a collapsed notification; 6.33 has a third footer line; 6.29 has a coloured action.
  5. The ticker marquee, hero zoom (1.05) and island growth (1.08) at 60 fps with the Reduce Motion fallbacks.

## 2. Screen table

| code | title | screen type | header left / right | primary action | current route file(s) in $R | logic |
|---|---|---|---|---|---|---|
| 6.01 | Trip hub, pre-trip | Root (Trips tab, glass tab bar) | none / none (hero text) | briefing CTAs, 4 tiles | `app/(tabs)/trips/[tripId]/index.tsx` → `features/trip/hub/*`, `trip/briefing/*` | exists (Quests tile registered by quests area) |
| 6.02 | Hub, briefing failed | Root, large title | — / glass search | Try again | same | exists (`briefing-model` `failed`); "what I know without it" lines partial |
| 6.03 | Hub, check-in day | Root, large title | — / glass search | See rooms | same | partial: rooms exist (`packages/domain/src/setup/rooms.ts`), hub check-in hero and nudge missing |
| 6.04 | Day-of, 2:48 am | Push, full-bleed hero | none drawn / none | (none; GO lives elsewhere) | `app/(tabs)/trips/[tripId]/day/[date].tsx` → `features/trip/day-of/*` | exists |
| 6.05 | Day-of, free day | Push, inline title | glass ‹ / glass + | Add (rows), Join | same | partial: free-day hero exists; nearby suggestions and Join missing |
| 6.06 | Forecast | Push | glass ‹ / caption "Checked 07:30" | a risk row | `app/(trip)/forecast/[tripId].tsx` | exists |
| 6.07 | Storm swap | Push | glass ‹ / caption date (sky text) | Swap the days | `app/(trip)/storm/[pollId].tsx` | exists |
| 6.08 | Running late | Push over map, fixed sheet | glass ‹ (tap list says Close) / ETA pill | Push to 14:30 | `app/(trip)/late/[id].tsx` | exists |
| 6.09 | Flight delayed | Full screen with ✕ | glass ✕ / centred 2-line title | Tell the crew | `app/(trip)/disruption/[id].tsx` | exists |
| 6.10 | Crew map | Push over map | glass ‹ / glass broadcast + mint dot | I'm on my way | `app/(trip)/map/[tripId].tsx` → `features/crew/live-map/*` | exists |
| 6.11 | Crew map, sharing off | Push over map | ‹ / ⋯ | Share on trip days | same (`states/share-primer.tsx`) | exists |
| 6.12 | Crew map, offline | Push over map | ‹ / ⋯ | Resume | same (`states/map-banners.tsx`) | exists |
| 6.13 | Crew map, before trip | Push over map | ‹ / none | Set the first meet-up | same (`states/gate-card.tsx`) | exists |
| 6.14 | Meet-up compass | Full screen over camera | clear ← / clear AR icon | (instruction bar) | none | **missing** |
| 6.15 | Offline at the top | Push (no back drawn) | "No signal" pill / date caption | Open today's plan | `app/(trip)/hub/[tripId]/offline.tsx` → `features/trip/offline/*` | exists |
| 6.16 | Help | Push (tap list says Close) | ‹ / "Crew can see you · 1h" chip | Call 112 | `app/(trip)/help/index.tsx` → `features/safety/help/*` | exists |
| 6.17 | Crew SOS | Full-screen takeover (no ✕ drawn) | SOS pill / distance caption | I'm going | `app/(trip)/sos/[id].tsx` → `features/safety/sos/*` | exists |
| 6.18 | Queued send | Sheet with grabber | (no Cancel or verb row) | Save edit | `features/trip/offline/queued-item-sheet.tsx` | exists |
| 6.19 | Find a driver | Push | ‹ + inline caption / — | Compare (bar) | `app/(trip)/[tripId]/drivers/index.tsx` | exists |
| 6.20 | Driver detail | Push over photo | ‹ / source chip | Message on WhatsApp | `drivers/directory/[listingId].tsx` | exists |
| 6.21 | Private tours | Push | ‹ + caption / — | Add to compare | `drivers/tours.tsx` | exists |
| 6.22 | Check the card | Push | ‹ / caption | Confirm 2 more | `drivers/check.tsx` | exists |
| 6.23 | Compare | Push | ‹ / caption | Pick Komang | `drivers/compare.tsx` (+ `pick.tsx` sheet) | exists |
| 6.24 | Rate your driver | Full screen in recap (‹ drawn, tap list says Close) | ‹ / "Recap · 4 of 11" | Send to the next crew | `drivers/ours/rate/[providerId].tsx` | exists |
| 6.25 | Nobody listed | Push | ‹ / centred "Drivers" | Include Komang in Sidemen | `drivers/directory/index.tsx` | exists |
| 6.26 | Leave-by alarm | Full screen, system alarm | — | slide, I'm up | `features/trip/alarm/in-app-alarm.tsx`; `modules/cp-alarm` (iOS AlarmKit, Android `LeaveByAlarmActivity`/`AlarmScreen.kt`) | exists |
| 6.27 | Dynamic Island expanded | OS | — | I'm up | `targets/widgets/LiveActivities/DynamicIsland/LeaveByIsland.swift` | exists, restyle |
| 6.28 | StandBy | OS (2 small widgets) | — | — | `targets/widgets/Widgets/StandBy/{SleepyClock,LeaveByAlarm}.swift` | exists, restyle |
| 6.29 | Vote from lock screen | OS rich notification | — | Vote Kyoto / Lisbon | `targets/notification-content/VotePosterView.swift` | exists, restyle and payload |
| 6.30 | Critter nearby Live Activity | OS | — | (tap) | `targets/widgets/LiveActivities/CritterNearbyLiveActivity.swift` | exists, restyle and payload |
| 6.31 | Home screen widgets | OS | — | Nudge Dev | `targets/widgets/Widgets/{TodayWidget,BalancesWidget,CrewWidget}.swift`; Android `cp-android-surfaces/widgets/*` | exists, restyle |
| 6.32 | Meet-up Live Activity | OS | — | Running late / SOS | `targets/widgets/LiveActivities/MeetUpLiveActivity.swift` | exists, restyle and payload |
| 6.33 | Trip morning lock screen | OS communication notifications | — | — | `targets/notification-service/*` | exists, small changes |
| 6.34 | Long-press: yes to a change | OS rich notification | — | Yes, swap | category `cp.changeset` (no poster) | **new poster** |
| 6.35 | Time-sensitive through Sleep | OS | — | — | `services/worker/src/push/payload.ts` (`interruption-level`) | partial: entitlement missing |
| 6.36 | Evening roundup | OS | — | — | `notifications.ts` `evening_roundup` (`cp.generic`) | partial: rich view missing |
| 6.37 | Android shade | OS | — | Reply / Yes | `modules/cp-notifications/android/*` | exists, small changes |
| 6.38 | Notification settings | Push | ‹ / centred "Notifications" | (settings) | `app/you/pings.tsx` → `features/you/ping-settings/*` | partial: per-crew modes, hide-text row and today list missing |

## 3. Per-screen spec

Shared frame: 390×844, ground `#f5f5f7`, status row 54 tall (time 16/600). Unless noted, nav controls sit at `left/right 20, top 58–60`. Glass nav buttons are drawn at **44** pt (Foundations says 40 pt with a 44 hit target; see §8).

### 6.A Today

**6.01 Trip hub, pre-trip (T−17 d)**
- **Header**, absolute:
  - `left 24 top 64`: caption "Oct 12–19 · 6 going" 13/600 muted.
  - "Bali" **60/800** −.05em lh 1, margin-top 2. OFF-TOKEN: Hero is 66, Display is 34.
  - Right block `right 22 top 72`, right-aligned: "Wheels up in" 12.5 muted; countdown "17d 05:26:29" 22/700 −.02em tabular, live, 1 s tick.
  - Crew stack 22×22 r11, 2px ground border, overlap −7, initials 9/700, margin-top 8.
- **Briefing card** `left/right 20, top 168`, r26, white, shadow `0 2 4 .05` + `0 16 36 .08`, padding 14 16 6.
  - Tokek sticker (gecko 78, pose point) overhangs at `right -8 top -34`.
  - Title "Tokek's briefing" 17/700, then "today" 12.5 muted, baseline gap 8.
  - Rows: gap 12, padding 11 0, `.5px rgba(28,29,36,.08)` divider except on the last; icon box 32 (doodle 30); text 14/1.35.
  - CTA pill h30 px12 r15 12.5/600, in three styles:
    - **Done**: booked tint `#e3f6ec/#1f7a55`.
    - **Nudge**: ink `#1c1d24/#fff`.
    - **Set**: control `#f1f1f4`/ink.
- **Tiles** ("four doors") `left/right 20, top 432`, 2 columns, gap 10.
  - Tile h118 r24 white, card shadow, padding 14 16.
  - Label 13/600 muted; sticker 40 rotated 8° at `right 10 top 8`; value 28/800 −.035em pushed to the bottom; sub 12.5 muted.
  - Set: Plan "8 days / 2 votes open"; Bookings "9 saved / all offline"; Money "+$186 / owed to you"; Quests "3 live / crew level 7".
- **Ticker** `left/right 20, top 686`, h40 r20 white, card shadow. Marquee of 12.5/600 items, gap 14, padding-left 14, separated by 6×6 crew-colour dots (§5).
- **Tab bar**: an inline variant of `Tabs.dc.html`, bottom 26, padding 6, gap 2, r**32**, `rgba(255,255,255,.64)` blur 24 saturate **1.8**. OFF-TOKEN against Tabs.dc.html (.56, saturate 1.9, r34).
  - Active "Trips" ink pill h46, padding 0 16 0 13, r23, 14/600.
  - Tokek 56 raised −14, sun radial gradient, 3px white border.
- **Scroll**: the content scrolls under the status bar. The current hub fades the status-bar backing over 32 pt (`STATUS_BAR_FADE_PT`); keep that. There is no large-title collapse because the title is a hero.
- **Taps**: no list is given. Inferred: briefing CTAs act on that line (`act_briefing_item`); tiles open Plan (4.x day plan), Bookings (7.x), Money (7.x) and Quests (8.07); the ticker is undecided (§8).
- **Motion**: arrives through the 1.05 zoom (§5); the ticker loops.

**6.02 Hub, briefing failed (Day 5)**
- **Header**: large title "Bali" 34/700 −.035em lh 1.1 at `left 24 top 60`; glass search button on the right. "Day 5 of 8 · Thursday" 14 muted at top 108.
- **Failure card** `left/right 16, top 142`, h250 r28 white, card shadow, padding 16.
  - Avatar 40 r20 `#fff3c4` with gecko 40 (think pose).
  - Eyebrow "THIS MORNING'S BRIEFING" 12/700 +.06em `#a8501a` (OFF-TOKEN tangerine text); title "I couldn't write today's yet" 17/700.
  - Body 13.5/1.42 `#3d404c`, margin-top 10.
  - Three known lines, gap 8, 14 px: a mint ✓ marks done, a tangerine clock marks pending.
  - Buttons, margin-top 14, gap 8, h34 px14 r17 13.5/600: "Try again" ink btn with a ↻ icon; "Yesterday's briefing" on `rgba(118,118,128,.12)`.
- **Tiles** `top 410`, 2 columns, gap 10.
  - Tile **h92** r24, padding 12 14: doodle 30 at the top; title 14.5/700; sub 12 muted.
  - Set: Bookings "2 today"; Money "You owe $41"; Crew map "4 sharing"; Phrases "Saved offline".
- **Tab bar** from Tabs.dc.html (active trips).
- **Ways out**: Try again · Yesterday's briefing · tiles still work.

**6.03 Hub, check-in day (Day 1)**
- Same header as 6.02, subtitle "Day 1 of 8 · Monday".
- **Check-in hero** `left/right 16, top 142`, h282 r30, gradient 150° `#e6eeff → #f3f6ff 60% → #fff`, shadow `0 24 44 -26 rgba(47,95,196,.5)`.
  - Bed sticker 92 rotated 10° at `right -8 top -10`.
  - Eyebrow "CHECK-IN 3 PM" 12/700 +.08em `#2f5fc4`; "Villa Lumbung" **24/800** −.03em (OFF-TOKEN); body 13.5 `#3d404c`.
  - Rooms grid at hero-relative top 142, left/right 12, 3 columns, gap 6. Room tile h76 r18 `rgba(255,255,255,.78)`, inset top white plus a .06 hairline, padding 9 10.
    - Label "Room 1" 11.5/700 with "King" 11.5/500 muted.
    - Avatars 26 r13, 2px white border, overlap −8, 10/700.
    - **My room** gets a 2px sky ring.
  - Buttons at the hero bottom, inset 16, left/right 18, gap 8, h42 r21 14/600: "See rooms" ink btn; "Nudge Maya" on `rgba(255,255,255,.85)` with a .1 hairline and a bell icon.
- **Tiles** `top 440`, h92 style: "Landing 11:40 / SQ 938 · on time"; "Komang at 12:10 / Arrivals, gate 2"; "Money / All square"; "Phrases / Saved offline".
- **Guide note bar** `left/right 16, top 650`: glass `rgba(255,255,255,.66)` blur 20, r22, padding 8 14 8 8, gap 10. Avatar 36 `#fff3c4`; 13/1.38 `#3d404c` text with a bold ink "Tokek" lead.
- **Ways out**: See rooms · Nudge organiser · Ignore (beds first-come) · tiles.

**6.04 Day-of, one number at 2:48 am**
- **Photo hero** `top 0`, h330, radius 0 0 40 40, image plus gradient 180° `rgba(10,10,25,.55) → .1 at 40% → .6`. White status bar.
- **Chips** at top 60, `left/right 20`, h34 px13 r17, `rgba(255,255,255,.2)` blur 16 saturate 1.6, 13/600 white: "Thu Oct 15 · Day 4" and "9° at the top".
- "Leave by" 16/600 at 92% opacity, at `left 24 top 178`; "03:10" **92/800** −.05em lh .9 tabular (OFF-TOKEN: Hero is 66).
- **Pickup card** `left/right 20, top 300` (overlapping the hero by 30), r24 white, padding 14 16, shadow `0 2 4 .06` + `0 16 36 .1`.
  - Text 15/1.4/500.
  - Divider `.5 rgba(28,29,36,.1)` with margin and padding 12.
  - Readiness stack 28 r14 with 2px white borders, overlap −8. Members not up yet: `#e9eaee` fill, 2px dashed `#b9bbc4` border, muted letter.
  - "4 of 6 are up" 14/600; "Tokek rings Alex and Dev at 03:00" 12 muted.
- **Pack** label 13/600 muted at `top 478`. Chips at `top 500`, wrapping, gap 8, h34, padding 0 12 0 8, r17, 13/600.
  - Checked: ink fill, white text, 18 mint circle with a check.
  - Unchecked: white with shadow `0 1 2 .06, 0 4 12 .06`, 18 circle with a 2px `#c4c6ce` ring.
- **Timeline card** `left/right 20, top 596`, r24, card shadow, padding 4 16. Rows: gap 14, padding 9 0; time 44 wide 14/700 tabular; title 14.5/600; sub 12 muted.
- **No back control, tab bar or tap list is drawn.** Recommend the edge swipe plus a glass ‹ in place of the left chip (§8).

**6.05 Day-of, a free day**
- **Background**: gradient 180° `#e6f6fb → #f5f5f7 46%` (OFF-TOKEN tint).
- **Nav**: glass ‹; centred "Day 6 · Friday" 17/600 (ellipsis) with "Oct 17" 12 muted; glass "+" on the right (add an idea).
- **Doodle cluster** 260×170 centred at top 124: sun 88; wave 70 rotated −8°; tanuki 80 (sleep pose) rotated 10°.
- **Title** "A free day, on purpose" **28/700** −.03em, centred, `left/right 28, top 308` (OFF-TOKEN); sub 15/1.42 muted.
- **Section** "If you feel like it, near the villa" 13/600 muted at top 404.
- **Suggestions card** `left/right 16, top 428`, r24.
  - Rows min-h 62, padding 0 14, gap 12.
  - Icon tile 40 r12 `#f6f6f8` (OFF-TOKEN; control is `#f1f1f4`) with doodle 28.
  - Title 15.5/600; sub 12.5 muted.
  - "Add" pill h30 px12 r15 on control colour, 13.5/600.
- **Join bar** `left/right 16, top 648`, h52 r20 `rgba(255,255,255,.7)` with a .06 hairline: avatars 24 overlapping; 13 px `#3d404c` text; ink "Join" pill h30.
- **Ways out**: Add an idea · Join Maya and Ray · Previous / next day · Back.
- **Copy bug**: "Ray" should be "Rin".

### 6.B When the day changes

**6.06 Forecast (7:30)**
- **Nav**: glass ‹; "Checked 07:30" 12.5/600 muted on the right.
- **Title** "The rest of the trip" 30/700 −.03em at `left 24 top 116`; sub 13.5/1.4 muted.
- **Day strip** `left/right 20, top 208`, 6-column grid, gap 6. Tile r18, padding 10 0, gap 4: day 11/700; doodle 28; temperature 15/700; rain chance 10.5/600 at 75% opacity. The risky day is inverted (ink fill, white text).
- **Section** "What could change the plan" at top 350.
- **Risks card** at top 374, r24, padding 2 14.
  - Rows gap 12, padding 11 0: 8 px colour dot; title 14.5/600; sub 12/1.35 muted.
  - Status chip h28 px11 r14 12/600: "Plan B" ink; "Watching" maybe tint; "Go" booked tint; "Set" unopened tint.
- **Taps**: Back → 6.01; a day → that day's plan with the weather band; a risk → 6.07 when live.

**6.07 Storm warning: swap the days (18:10)**
- **Band** 300 tall, gradient `#dfe8ff → #f5f5f7` (OFF-TOKEN, near the rain tint).
- **Nav**: glass ‹; "Fri Oct 16 · Boat day" 12.5/600 `#2f5fc4` on the right. Wave sticker 110 rotated 8° at `right 16 top 106`.
- **Title** "Rough seas / Friday" **44/800** −.045em lh .95 (OFF-TOKEN).
- **Compare card** `left/right 16, top 222`, h112 r26, grid `1fr 40px 1fr`, padding 14 16.
  - Each side: an 8-wide bar, r4, on `#eef0f4`, filled 92% `#e0468e` (Friday) or 38% `#2e9a74` (Saturday).
  - Day label 11/800 +.08em in the same colour; value 26/800; wind 12 muted.
  - Chip h22 px8 r11 11/700: "Harbour may close" on vote-open tint; "Flat calm" on booked tint.
  - Centre: a 36 ink circle with ⇄ and shadow `0 6 14 -6 .5`.
- **Options** at top 352, gap 10. Radio card r22 white, padding 13 14; title 15.5/600; sub 12.5/1.35 muted.
  - Selected: `0 0 0 2px #1c1d24` ring plus `0 10 24 .08`.
  - "TOKEK PICKS" sticker on the recommended card: sun, 2px white border, r7, 10.5/800, rotated 5°, at `right 12 top -10`.
- **Vote line** at top 664: stack 24 plus "4 of 6 said swap. Dev and Rin are napping." 12.5 muted.
- **CTA** ink pill "Swap the days", bottom 40.
- **Taps**: Swap → boat moves to Saturday, crew told, toast with Undo; Keep Friday → refund rules shown; Skip the boat → waterfall plan, $38 back each; a day tile → the full forecast; Back → 6.06.

**6.08 Running late (13:46)**
- **Map** `bali-map ?v=day`, 380 tall, with a 110 top fade from `#f5f5f7` at .95.
- **Nav**: glass ‹. On the right, an ETA chip h32 px12 **r12** ink 12.5/600 "ETA 14:25 · Karsa Spa 14:00".
- **Fixed sheet** from top 340: r32 top corners, solid ground, shadow `0 -10 30 .12`, grabber 36×5 `rgba(60,60,67,.3)` at margin-top 8.
  - "+25" 52/800 −.05em with "min late" 20/700.
  - Body 13.5 `#3d404c`, padding 8 24.
  - Options at margin 14 20, gap 8, r20 white, padding 12 14. The selected one has a 2px ink ring plus a booked chip "Karsa said yes" h22 11/700.
- **CTA** ink pill "Push to 14:30".
- **Taps**: Close → hub, nothing changed; ETA pill → live map of Made's route; Push → already agreed, crew told; Walk → walking directions; Skip → cancels, half back.

**6.09 Flight delayed (9:41)**
- **Nav**: glass ✕; centred "SQ 938 · SIN → DPS" 17/600 over "Mon 12 Oct" 12 muted.
- **Hero card** `left/right 20, top 118`, r28 white, padding 18, shadow `0 2 4 .05, 0 18 40 .09`.
  - Plane sticker 84 rotated −8° at `right 6 top -12`.
  - "Delayed" stamp: pink fill, 2.5px white border, r9, padding 6 11, 13/800, rotated −4°.
  - "2h 10m" **60/800** tabular (OFF-TOKEN).
  - Route row at margin-top 12, 14 px: "SIN 09:05"/600 · a 2px dashed `#d0d1d8` flex line · "11:40" `#9a9daa` struck through · "DPS 13:50"/700.
  - Note 14 muted.
- **"Already done"** at top 352, plus an affected stack 20 and "3 affected". Done card r24, padding 2 16, rows with a 22 `#e3f6ec` check and 14/1.35 text.
- **"Needs a yes"** at top 570. Card r24, padding 14 16:
  - "Dinner" 15/600, "19:30" struck through in muted, →, "21:00" 22/700.
  - Sub 13 muted.
  - h40 r20 buttons: "Approve" ink btn; "Keep 19:30" control.
- **Footer** at bottom 30: ink pill "Tell the crew"; "Undo everything" 13/600 muted text button, gap 8.

### 6.C Crew map (`bali-map.html?v=crew` behind every map)

**6.10 Crew map, who arrives when (16:38)**
- **Map** 440 tall with a 120 top fade.
- **Nav**: glass ‹. Centre: ink pill h34 px14 **r12** 13/600 "The Bali Six · 5 of 6 sharing". Right: a glass broadcast icon with a 9 mint dot (2px white border) at `right 2 top 2`, meaning my sharing is live.
- **Panel** from top 404: solid ground, r32 top corners, shadow `0 -10 30 .12`, grabber 40×5 `#d0d1d8` (OFF-TOKEN grabber colour).
- **Meet-up card** `left/right 20, top 24`, r22, padding 14 16.
  - "Meet-up at Campuhan Ridge" 13 muted; "Sharing ends Oct 19 at midnight" 11.5 `#9a9daa`; "17:00" 28/700 tabular.
  - Lane h34: track 3 `#e3e4e9`; ink fill to my position (30%); avatars 26 with 2.5px white border and shadow `0 2 6 .2` at their ETA steps; flag on the right.
- **ETA rows** from top 146, gap 8.
  - Row r18 white, padding 9 14 9 10, shadow `0 12 28 -14 .18`.
  - Avatar group 44 wide (30 avatars overlapping −16); name 15/600; status 12 muted; time 15/600 tabular.
  - A paused member drops to 0.55 opacity with "–".
- **Bottom**: a 128 white fade; h52 r26 buttons, gap 10. "Ping all" is control-coloured with a shadow; "I'm on my way" is an ink pill at flex 1.6.

**6.11 First open, your sharing is off**
- **Map** 470 tall (saturate .9).
- **Nav**: ‹; "Crew map" 17/600; ⋯.
- **Glass panel** from top 400: r34, `rgba(248,248,250,.9)` blur 30 saturate 1.8, inset top white .9, shadow `0 -14 40 -14 .28`, padding 10 16, grabber 36×5.
- **Ask card** r26 white, padding 16.
  - Avatar 48 sun "W" 19/700 with a 22 white eye badge.
  - "Share where you are with the crew?" 18/700 −.02em; body 13.5 `#3d404c`.
  - h46 r23 buttons: "Share on trip days" ink btn (flex); "Not now" 96 wide, control.
- **Member list** r24: rows min-h 58; avatar 36; name 15.5/600; status 12.5 muted. My row shows an "Off" chip h26 on control `#6e7180`.
- **Ways out**: Share on trip days · Not now (map still works) · Back.

**6.12 Offline, last fixes fade, pings queue**
- **Map** grayscale .55, brightness 1.03.
- **Offline pill** centred at top 112: glass h32 px12 r16, 12.5/600 `#a8501a`, with a 7 tangerine dot.
- **Panel** (6.11 glass): "Last seen" 20/700 with "Updates when you're back" 12.5 muted.
  - Stale avatars at .55 opacity, location-off at .9.
  - My row: "Paused until 6 PM" plus a "Resume" ink chip h28 px11 r14 12/600.
- **Disabled buttons** h46 r23 `rgba(118,118,128,.1)` `#9a9daa`: "Ping all · queued" with a clock icon; "I'm on my way".

**6.13 Before the trip**
- **Map** grayscale 1, contrast .85, brightness 1.08, opacity .6.
- **Empty card** `left/right 24, top 170`, h240, glass `rgba(255,255,255,.82)` blur 18, r30: gecko 96 (sleep pose); "The map wakes up on Oct 12" 22/700 −.025em; body 14 `#3d404c`.
- **Panel** from top 470, "Meanwhile". Rows min-h 62, with icon tiles 40 r12 and a chevron:
  - "Set the first meet-up" (pin on `#ffe4f0`).
  - "Remind me on Oct 12" (bell on `#fff6c9`).
  - "Who will share / 4 of 6 said yes" (people on `#f1f1f4`).

**6.14 Meet-up compass (missing feature)**
- **Top 340**: the live camera, an AR-style view. The design uses a photo with a gradient to the ground colour.
- **Nav**: 40×40 r20 clear buttons at `rgba(255,255,255,.2)` blur 16 (← and an AR/scan icon). Centred "17:00 meet-up" 20/600 with "Campuhan Ridge · 22 min" 12.5 at .9.
- **Floating crew pins** on the camera: avatar 34 with a 3px white border, shadow `0 4 12 .25`, a 2px white stem whose length encodes distance (28/18/60), and a 6 dot.
- **Route card** `left/right 20, top 262`, r24.
  - 52-tall dotted sketch from me (28 avatar) to a 28 ink flag.
  - "470 m north-west of you · ridge path, gentle climb" 13.
  - Progress track 4 `#e3e4e9`, ink fill 34%, 16 ink knob with a 3px white ring.
- **Dial** 300×300 at `left 45, top 450`, white disc with a soft shadow.
  - 60 ticks every 6°: major every 30° (12 tall, `#9a9daa`), minor 6 tall (`#d0d1d8`), inset 8.
  - N, W, E 15/700; S `#e0468e`.
  - Halo 160 `rgba(84,214,164,.22)`; core 120 `#2e9a74` "470 m" 28/700 with "6 min walk" 13.
  - Heading arrow at −58°; crew dots 26 on the rim at their bearings (M −8°, A −96°, J 132°).
- **Instruction bar** `left/right 30, bottom 34`, h52 **r16** ink: mint 12 dot with a 4 halo; "Take the ridge path left in 120 m" 15/600.

### 6.D Safety and offline

**6.15 Offline at the top**
- **No back control is drawn.** Top left: "No signal" ink chip h32 r16 12.5/600 with a tangerine dot. Top right: "Thu Oct 15 · Day 4" 12.5/600 muted.
- **Polaroid card** `left/right 20, top 110`, h190, padding 6, r26, rotated −1.5°, with the photo at r21 and "Offline at the top" 30/800 with "Batur summit, 06:14" 13 in white.
- "Today was saved…" 13.5 `#3d404c` at top 318.
- **"Still works"** 13/600 `#1f7a55`. Card r22 rows with a 20 `#e3f6ec` check and 13.5 text.
- **"Sends when you're back"** 13/600 `#a8501a`. Dashed chips h32 px11 r16 with a 1.5px dashed `#c4c6ce` border, 12.5/600.
- **Footer**: ink pill "Open today's plan"; "Last synced 03:02 at the villa" 12.5 muted.
- **Taps**: plan → 6.04 saved copy; a queued item → 6.18; still-works rows open offline; last synced retries.

**6.16 Help**
- **Nav**: glass ‹. Right chip h30 px11 r15 `#e3f6ec/#1f7a55` with a 6 `#2e9a74` dot: "Crew can see you · 1h".
- **Title** "Need a hand?" 32/700 −.03em; "You're on Jalan Raya Sayan, Ubud." 13.5 muted.
- **Emergency row** at top 194, gap 10:
  - "Call 112" tile flex 1.6, h92 r24, **pink fill**, `#17142a` text 13/700 plus 13/600.
  - "110" white tile 22/800 with "Tourist police" 12 muted.
- **Helper grid** 2 columns, gap 8, h58 r18: doodle 32 plus 13.5/600.
- **Clinic row** r22: 15/600 plus 12.5 muted, with a "Go" ink btn h38 px18.
- **"SHOW THIS" card** r24 **ink**, padding 16: 11.5/700 +.06em at .6; "Saya butuh dokter." 30/700; italic 13 at .75; a 40 white play circle.
- **Footer**: insurance line 12.5 muted.
- **Taps**: Close → back where you were, crew still sees you 1 h; numbers → dialer; Go → Maps; Show this → 5.23; Insurance → 7.13; chip → stop or extend.

**6.17 Crew SOS (16:42)**
- **Band** 330 tall, gradient `#ffd6e8 → ground` (OFF-TOKEN).
- **Top row**: SOS chip pink h32 12.5/800 with an 8 ink dot; "1.2 km from you" 12.5/600 `#b0306b`.
- **Avatar** 68 mint with a 4px white border and an `8px rgba(255,95,168,.25)` ring.
- **Title** "Jordan needs help" 34/800 −.04em; body 14 `#3d404c`.
- **Bubble** at `left 24, right 60, top 300`, radius 20 20 20 6, white, 14.5/1.35, with "Jordan · 16:43" at 11.
- **"Tokek's on it" card** r24 with rows: 18 check plus 13 text.
- **Responder line**: "Alex is going. 4 minutes away on foot."
- **Footer** h56 buttons, gap 8: "I'm going" ink pill at flex 1.4, 16/600; "Call Jordan" white. "See him on the map" 14/600 muted text button.
- **No ✕.** See §8.

**6.18 Queued send: edit or cancel**
- **Background**: photo 440 tall with a fade at 300, plus a scrim `rgba(20,22,40,.16)`.
- **Top status** at top 58, **clear glass** `rgba(18,20,28,.4)` blur 22, h36 r18 13/600 white with a weak-wifi icon: "Weak signal · 2 waiting to send".
- **Conflict banner** at `left/right 10, top 104`: regular glass .74 blur 30 saturate 1.9, r26, padding 12 14. A 36 `#ffe4f0` "!" icon; 13 `#3d404c` text with a bold lead; "OK" h30 on `rgba(118,118,128,.14)`.
- **Sheet** inset 8 from the sides and bottom, r46, `rgba(248,248,250,.86)` blur 34 saturate 1.8 (Foundations sheet ✓), padding 10 20 24, grabber 36×5.
  - A pulsing 8 tangerine dot with "Waiting for signal since 06:14" 12.5/600 `#a8501a`.
  - "To the Bali Six" 22/700.
  - **Editable bubble** at margin-left 30, radius 22 22 6 22, ink, 16/1.4 white, caret `#7fb0ff` (OFF-TOKEN).
  - Meta line 11.5 muted with a clock icon: "Sends itself when you're back".
  - Attachment row h54 r20: thumb 30 r8; "Photo · summit" 14/500; "4.2 MB · queued".
  - h54 r27 buttons: "Don't send" `rgba(255,59,92,.1)/#d93a62` (OFF-TOKEN destructive); "Save edit" ink pill at flex 1.4.
- **Keyboard** (undesigned): the bubble is a multiline field. The keyboard rises, the sheet rides on it at full height, and the buttons stay pinned above the keyboard. Return inserts a newline; there is no Return button. Dismiss with a sheet swipe or by tapping the photo area.

### 6.E Drivers and private tours

The header pattern on these screens is a glass ‹ with a 15/600 muted inline caption (6.19, 6.21) or a right 12.5/600 caption (6.22, 6.23), then a 32/700 −.03em title in the content at top 114–116 with a 13.5–14 muted sub.

**6.19 Find a driver**
- **Day chips** at top 210, gap 6, h34. Selected: ink, padding 0 10 0 7, 18 mint check, 13/600. "+ Day": 1.5px dashed `#b9bbc4`, muted.
- **Source cards** from top 262, gap 10.
  - Card r22, padding 12 14 12 10, card shadow.
  - Sticker 50 rotated −6/5/−4/4°; title 16/600; desc 12.5 muted.
  - CTA h32 px12 r16 control 12.5/600: See 4 · Browse · Add · Draft it.
- **Shortlist bar** `left/right 20, bottom 34`, h64 r32 ink, shadow `0 14 30 rgba(28,29,36,.3)`.
  - Avatars 32 `#f4efe4` with a 2px ink border, overlap −10. They read "Md"; use single initials.
  - "Shortlist · 2" 12 at .7; "Made, Komang" 14/600.
  - "Compare" h46 px18 r23 **sun** `#17142a` 14/700.

**6.20 Driver detail**
- **Photo** 290 tall, radius 0 0 36 36.
- **Right chip** "Crews' drivers" h30, white, shadow. It is a source badge, not an action.
- "Runs his own listing" mint sticker rotated −5°; car sticker 72.
- **Name** 32/700; "Driver-guide · Ubud" 14 muted.
- **Stats card** at top 374, 3 columns: 20/800 over 11.5 muted.
- **Facts card**: rows padding 7 0, doodle 28, 14/600 over 12 muted.
- **Quote card** `#fff6c9`, r20, inset .5 `rgba(150,120,20,.2)`: 14 italic `#3d3210`; 11.5 `#6b5a24`.
- **Footer** h52 r26: "Message on WhatsApp" ink pill at flex 1.5; "Shortlist" white.

**6.21 Private tours**
- **Tour card** r26: photo mx8 h128 r20.
  - "FROM KLOOK" 12/700 +.04em muted; "★ 4.8 · 2,140 reviews" 12.5/600.
  - Title 15/600/1.3; price line 12.5 muted.
  - Tokek note r14 `#fff6c9`, padding 8 10.
  - h40 r20 buttons: "Add to compare" ink btn; "Open Klook ↗" control.
- **Second card** is compact (no photo).
- **Disclosure** 11.5 muted, centred, at bottom 28.

**6.22 Check the card**
- **Card** at top 208, r26.
  - Header padding 14 16 with a 1.5px dashed `#e3e4e9` bottom: avatar 48 `#f4efe4`; "Made" 18/700; sub 12.5; "3 of 6" 12/700 muted (meaning unclear, §8).
  - **Line rows** padding 11 16 with a .5 divider: key 11.5/600 muted, value 14.5/600, note 11.5, and a ✎ on the right.
    - Confirmed: 22 mint circle with a check.
    - Unconfirmed: white 22 with a 2px `#c4c6ce` ring on a `#fffbe8` row (OFF-TOKEN).
  - **Includes chips** h28 px10 r14 12/600: "✓ Fuel" on booked tint; "Tolls?" white with a 1.5px dashed `#ffb37a` border and `#a8501a` text.
- **Tokek bar** r20 `#fff6c9` with an "Ask Made" ink btn h32.
- **CTA** ink pill "Confirm 2 more".
- **Keyboard** (undesigned): tapping ✎ turns the value into a field in place; the keyboard pushes the card up; return key "Done" confirms the line.

**6.23 Compare**
- **Table card** at top 170, r26, padding 12 12 6, grid `76px repeat(3,1fr)`, gap 6.
  - Column head: avatar 40 15/800; name 13/700; chip h20 px7 r10 10/700, either "N missing" (maybe tint) or "Complete" (booked tint).
  - Rows padding 8 0: key 11.5/600 muted; value 12.5 centred; "Not said" 600 `#a8501a`.
- **Tokek note** at top 628.
- **Footer** h54 r27: "Pick Made" white; "Pick Komang" ink pill at flex 1.2.

**6.24 Rate your driver (recap card 4 of 11)**
- **Top right**: chip "Recap · 4 of 11" h30 on `rgba(118,118,128,.12)` 12.5/600 `#3d404c`.
- **Polaroid** 196×220 at `left 40, top 116`, padding 7 7 30, r10, rotated −5°, with a Borel 11 caption.
- **Driver card** 146×164 r24 sun, rotated 6°: avatar 62 with a 3px white border; "Made" 16/800; "Avanza · 2 days" 11/700 `#5c4a08`.
- **Title** "How was Made?" 30/700; sub 13 muted.
- **3-way segmented** at top 432, h76, padding 4, r26 on `rgba(118,118,128,.12)`. Selected: ink pill r22 with doodle 28 and 13/600 white. Others: icon plus 13/600 `#3d404c`.
- **Tag chips** h36 px14 r18 13.5/600: on = ink with "✓"; off = white with shadow.
- **Tip card** r22: label 12/600 muted; 14.5/1.4 text.
- **CTA** ink pill "Send to the next crew".
- **Keyboard** (undesigned): the tip card becomes a multiline field; the content scrolls the card above the keyboard; the CTA rides on the keyboard.

**6.25 Nobody listed in Amed**
- **Nav**: ‹ with a centred "Drivers" 17/600, **and** a large "Drivers our / crews used" 30/700 lh 1.05 (a double title, §8).
- **Filter chips** at top 196, h36 px14 r18 13.5/600: "Amed" ink with a pin icon; "English" and "7+ seats" white with a hairline.
- **Map card** at top 248, h236 r30 `#e6eef0` (OFF-TOKEN), drawn with grid lines and a road.
  - Area circle 110: pink .5 ring with .08 fill and a **ping** animation.
  - Pin 30 pink with a 3px white border; Komang pin 44 sun plus a glass label chip h22 10.5/700.
  - Glass note card inside, at bottom 10, `rgba(255,255,255,.72)` blur 24, r22: gecko 42; "Nobody listed in Amed yet" 15/700; sub 12.5.
- **Below**: ink pill "Include Komang in Sidemen"; a list card r24 with rows h62, tinted icon tiles 38 r11, and chevrons ("Ask for me", "Private tours").

### 6.F Off the app (in-app part)

**6.26 Leave-by alarm, full screen**
- **Background** `#1c1d24` with a radial glow at 50% 36%, `rgba(255,154,77,.4)` fading to 0 by 60%. Status "03:10" in white.
- **Eyebrow** "LEAVE-BY ALARM · BATUR" 13/700 +.08em at .7, at top 82. Time "03:10" **104/700** −.04em tabular (OFF-TOKEN). Sub 15 at .8.
- **Gecko** 160 (cheer pose) at `left 115, top 300`, wobbling (§5); bell sticker 56 rotated 14°.
- **Guide line** Borel 17/1.5 sun, centred, at top 500.
- **Slider** at `left/right 24, bottom 120`, h72 r36 `rgba(255,255,255,.14)` blur 16, padding 6. Knob 60 r30 sun with →; label "slide, I'm up →" 17/600 white at .8.
- **Snooze** at bottom 58: "Snooze 5 min" 15/600 over "(Tokek will sigh)" 12 at .6.
- **Taps**: Slide → stops the alarm and opens the pickup card; Snooze → snoozes, Tokek sighs, "Made is told" (driver gap, §7).
- **Platform**: iOS uses the AlarmKit system alert (title, Stop, secondary snooze, `tintColor`). This full screen exists only in-app (`in-app-alarm.tsx`) and on Android (`AlarmScreen.kt` with `SlideToConfirm.kt`).

### 6.G Notifications settings (in-app)

**6.38 Notifications**
- **Nav**: top 56; glass ‹; centred "Notifications" 17/600.
- **Today card** `left/right 16, top 108`, r22, padding 14 16.
  - "TODAY" 11/800 +.06em muted; "3 of 6 pushes" 22/800.
  - Six segments h6 r3, gap 4: ink for used, `#e3e4e9` for unused.
  - "Past six, the rest wait for your roundup." 12 muted.
  - Tokek 56 on `#fff3c4`.
- **"Always gets through"**: group label 13/600 muted at `left 28` (12 px inside the card edge). Chips h30 px12 r15, white with a hairline, **13/700**: Flight changes · SOS · Leave-by alarms · Crew knocks · Card problems.
- **Groups** r22, card shadow, rows padding 8 16 with a .5 divider; title 15; sub 12 muted; value 14 muted with "›"; toggle 51×31 `#34c77b` (the Foundations toggle green).
  - **Timing**: Quiet hours "22:00–07:00 ›"; Evening roundup "20:00 ›"; Hide message text (toggle).
  - **Crew chats**: The Bali Six "Everything ›"; Kyoto in April "Mentions only ›"; Lisbon 2025 "Off ›".
  - **From Tokek**: Tips and nudges ON; Money ON; Critters nearby OFF.
- **Scroll** continues to an email row for data export and deletion, and a system settings link.
- **Single-line rows render about 38 pt tall**, below the 44 pt minimum (§8).
- **Taps**: Today → every push today, sent and held; a chip → why it can't be muted; quiet hours and roundup → time picker (roundup can also be turned off); a crew → Everything · Mentions only · Off; a toggle mutes that kind.

## 4. Components

**(a) Foundations components used**
- Glass nav button (drawn at 44, not 40).
- Ink pill (one per screen, mostly).
- Ink btn as the secondary dark.
- Control pill (`#f1f1f4`) and the grey `rgba(118,118,128,.12)` control.
- Status tint chips (booked, vote open, maybe, unopened, rain).
- Cards on the ground colour (r22–r28 with card shadow).
- Crew stack and avatars (one colour per person).
- Guide note tinted by speaker (`#fff6c9`/`#3d3210` for Tokek, `#fff3c4` avatar disc).
- Stickers, tags and stamps ("Delayed", "TOKEK PICKS", "Runs his own listing").
- Segmented control (6.24 3-way), toggle (6.38), progress bar (6.10, 6.14, 6.30, 6.38).
- Radio option cards (6.07, 6.08).
- Sheet with grabber (6.18); Regular glass (banners, pills); Clear glass (6.04 chips, 6.14 buttons, 6.18 status).
- Tab bar: the `Tabs.dc.html` rendering (glass pill, active ink pill with label, Tokek raised 56). 6.01 draws it inline with OFF-TOKEN material. The 1.04 native bar does not appear in Part 6.

**(b) New components** (metrics in §3; likely reuse in brackets)

| Component | Spec | States / variants | Reuse |
|---|---|---|---|
| `HubTile` (two sizes) | h118 r24, value 28/800, sticker 40 rotated 8°; **compact** h92 with doodle 30, 14.5/700 + 12 | pre-trip value / in-trip door | Part 3 home cards |
| `BriefingCard` | r26 white, rows with doodle 30, text 14/1.35, CTA chip h30 (done, nudge, set) | ready, failed (6.02), loading, none, stale | 5.x guide |
| `ActivityTicker` | h40 r20 marquee, 12.5/600, 6 dot separators | live, paused (Reduce Motion: static) | Part 3 crew |
| `CheckInHero` + `RoomTile` | §3 6.03; room tile h76 r18 white .78 with my-room sky ring | locked, waiting on nod, unset | 4.17, 7.07–7.09 (Pon's rooms) |
| `ReadinessStack` | avatars 28 overlapping; not-up = dashed `#b9bbc4` on `#e9eaee` | up, not up, sending | 6.27, 6.32 pips |
| `PackChip` | h34 r17; checked ink with mint check 18; unchecked white with ring | checked, unchecked | widgets Today |
| `DayForecastTile` | 6-up grid, r18, inverted for the risk day | normal, risk | 4.46 |
| `RiskRow` | dot 8, title, sub, status chip h28 | Plan B, Watching, Go, Set | 4.x |
| `DayCompare` | two halves, 8-wide gauge, value 26/800, chip; 36 ⇄ centre | — | 4.46 swaps |
| `OptionCard` | r22, selected = 2px ink ring, optional "TOKEK PICKS" sticker or status chip | idle, selected, recommended | 4.x votes |
| `MapSheet` | fixed panel r32 (solid) or glass r34 `.9`/blur 30, grabber | 3 variants exist (§8) | 4.x maps, 7.x |
| `EtaLane` | track 3 (app) or 4 (Live Activity), avatars 22–26 at ETA steps, flag | live, offline (faded) | 6.32, widget |
| `MemberEtaRow` | r18, avatar group 44, name 15/600, time 15/600 tabular | live, paused (.55), stale | 6.12 |
| `CompassDial` | §3 6.14 | heading live, no heading (calibrate), arrived | none |
| `QueuedChip` | h32 r16 dashed 1.5 `#c4c6ce` | queued, failed | 5.x chat |
| `EmergencyTile` | pink h92 r24 + white tile | — | 9.x |
| `PhraseCard` (dark inline) | ink r24, 30/700 phrase, play 40 | — | 5.23 |
| `ShortlistBar` | h64 r32 ink, sun CTA | 0, 1, n | 7.x |
| `CompareTable` | grid `76px repeat(n,1fr)` | complete, missing ("Not said") | 7.x quotes |
| `ConfirmLineRow` | ✓ or ring 22, key/value/note, ✎ | confirmed, unconfirmed (`#fffbe8`), editing | 7.05 imports |
| `RatingSegmented` | h76 r26 3-way with doodles | loved, fine, not again | 8.B recap |
| `SlideToConfirm` (restyle) | h72 r36 track `rgba(255,255,255,.14)`, knob 60 sun | idle, dragging, done | SOS send (exists) |
| `PushBudgetMeter` | 6 segments h6 r3, gap 4 | n of 6 | — |

## 5. Motion and transition inventory

No filmstrips were rendered. Every Part 6 motion is a `doodles.js` preset whose keyframes are in the HTML (`tg-motion` PRESETS); the island and hub zoom come from Foundations 1.08 and 1.05 keyframes.

| Trigger | What moves | Properties | Spring / easing, duration | Evidence | Native or custom |
|---|---|---|---|---|---|
| Hub opens from a trip card | card clip grows to full screen, hero lifts | clip inset(164 16 368 16 r34) → inset(0 r56); hero translateY −120, scale 1.04; content opacity 0→1, y 24→0 | `cubic-bezier(.32,.72,0,1)` over about 1.2 s (0.22→0.42 of 6 s) → **Smooth** | Foundations 1.05 | Custom Reanimated shared-element, or iOS zoom transition if the native stack exposes it |
| 6.01 ticker | strip | translateX 0 → −50% (content doubled), linear | 22 s loop | `tg-motion fx=marquee dur=22000` | Custom Reanimated `withRepeat`; pause when offscreen or backgrounded; Reduce Motion: static, cross-fade items every 4 s |
| 6.18 waiting dot | 8 px dot | scale 1 → 1.07 → 1, ease-in-out | 1.6 s loop | `fx=pulse` | Reanimated loop; Reduce Motion: none |
| 6.18 caret | text caret | opacity 1 → .25 | 1.0 s | `fx=blink dur=1000` | Native TextInput caret; no custom work |
| 6.25 area ping | 110 ring | scale .6 → 1.5, opacity .8 → 0, ease-out | 1.8 s loop | `fx=ping` | Reanimated; Reduce Motion: static ring |
| 6.26 alarm Tokek | sticker | rotate −8, 8, −8, 8, 0° over 0–40%, then rest | 1.8 s loop, ease-in-out | `kf="0:r-8;.1:r8;.2:r-8;.3:r8;.4:r0;1:r0"` | RN (in-app) plus Compose (`AlarmScreen.kt`); iOS AlarmKit cannot animate |
| 6.26 glow | radial glow | opacity pulse (current app) | — | `in-app-alarm.tsx` "pulses" | keep |
| 6.27 island grows | island | width 200→370, height 37→184, r19→48 with an overshoot `cubic-bezier(.3,1.25,.4,1)` (Lively); content fades and scales .9→1 | ~0.7 s | Foundations 1.08 keyframes | **System** ActivityKit animation; we only set content and `.contentTransition(.numericText())` |
| Live Activity number and pip changes | minutes, up count, pips | numeric text roll | system | current code | SwiftUI `.contentTransition(.numericText())` (keep) |
| 6.29 vote stamp | stamp | drop, squash, ink (1.07) | **Lively** | Foundations 1.07 | SwiftUI spring(response .5, damping .68) in the content extension (stamp exists) |
| 6.07, 6.08 option select | ring and sticker | 2px ring in, sticker stays | **Snappy** | static | Reanimated |
| 6.24 rating, 6.38 toggles | lens and knob | slide | **Snappy** | Foundations controls | Native `Switch`/`@expo/ui` where possible |
| 6.04 pack chip | fill and check | colour cross-fade plus check pop | Snappy (pop Lively) | static | Reanimated |
| Sheets (6.18, map panels) | sheet in; page steps back (1.06) | translateY, page scale .94 | **Smooth** | Foundations 1.06 | Native form sheet for 6.18; the map panel is a custom detent sheet |
| 6.10/6.12 lane avatars | dot x | position | Smooth | static | Reanimated; Live Activity moves only by push |
| 6.12 offline map | map tint | grayscale 0 → .55 | 150–300 ms cross-fade | static | View filter or overlay |
| 6.14 compass | dial and pins | rotation follows heading (low-pass), no spring | per frame | static | Custom: heading from the magnetometer, Reanimated `useFrameCallback` |
| 6.07 "Swap the days" result | toast with Undo | rise | Smooth | tap list | existing toast |

Reduce Motion everywhere: a 150 ms cross-fade, and loops off.

## 6. Native platform surfaces

**Cross-cutting.**
1. **There is no shared Swift token file.**
   - `targets/widgets/LiveActivities/LiveActivityStyle.swift` (`LAPalette`) and `notification-content/VotePosterView.swift` (`PosterPalette`) hand-copy the old ink-purple brand: card `#120F22`, chip `#2C2750`, muted `#A9A3C0`, night `#0D0B18`.
   - `packages/design-tokens/codegen/swift.ts` already emits `generated/swift/CPTokens.swift` (and `CpTokens.kt`), but no target compiles it.
   - **Change**: add `CPTokens.swift` plus a small semantic `SurfacePalette` (ink `#1c1d24`, muted `#6e7180`, ground, card, control, hairline, the five accents, status tints, dark set) to `targets/_shared`. Repoint `LAPalette` and `PosterPalette` at it, and mirror it on Android via `CpTokens.kt`.
2. **Material.** Lock-screen activities and widgets move from a dark card to light glass with ink text (6.30, 6.32 use `rgba(255,255,255,.66)` blur 24, r30). The Dynamic Island stays `#000` with sun accents (6.27).
   - Recommendation: on the lock screen use `.activityBackgroundTint(nil)` (system Liquid Glass, which adapts to dark mode) instead of a fixed colour. iOS owns the corner radius.
3. **Copy case.** Current surfaces use tracked capitals ("I'M UP", "RUNNING LATE", "STAY 4 MORE MIN"); the design uses sentence case ("I'm up", "Running late"). This is a copy change in every Swift view, plus the `xcstrings`.
4. **Fonts.** 6.26 and 6.28 use Borel. The widget extension has no `UIAppFonts` entry and does not bundle Borel; the new asset plus Info.plist key are needed. `CPFont.swift` exists in design-tokens.

### 6.1 Live Activities and Dynamic Island (iOS 26, `targets/widgets/LiveActivities/*`)

| Surface | Design | Current | Change |
|---|---|---|---|
| **Leave-by, expanded island (6.27)** | 370×184 r44 black, padding 18 22. Badge 34 r10 sun with gecko 32. "LEAVE BY" 11/700 at .6 +.04em; **title** "Batur sunrise" 15/600 white; **right** leave time "03:10" 34/700 −.03em sun tabular. Trail at margin-top 16: track 4 `rgba(255,255,255,.2)`, sun fill, 12 stop dots with a 2px black border (reached sun, upcoming `#555`), stop names 10.5/600 at .7 in sentence case. Buttons at margin-top 12, gap 8, h34 r17: "I'm up" sun `#17142a` 13/700; "Ask Tokek" `rgba(255,255,255,.18)` 13/600 | `LeaveByIsland.swift`: leading = badge 32 plus the **leave time** as headline; trailing = countdown timer; bottom = trail (CAPS labels, dashed track `#3A3466`) plus I'M UP and ASK TOKEK, which becomes SNOOZE at go/late | **Restyle**: leading = eyebrow plus `attributes.title`; trailing = leave time (keep the countdown as the compact trailing); solid track; sentence-case labels and buttons. **Taps**: island → hub on the pickup (set `widgetURL` to a hub path with a pickup focus); "Ask Tokek" → guide chat about the pickup (5.B). Today it is `guide/new`, so pass the leave-by context. **Data**: none new |
| Leave-by compact and minimal | not drawn in 6. Foundations 1.08 compact: 200×37 pill, 24 sun disc with art leading, minutes 14/700 tabular trailing | compact: guide art 22 plus a countdown or up/total; minimal: art 20; `keylineTint(guide.tint)` | **Restyle** colours only (sun); keep the structure. Log as undesigned in `docs/undesigned-states.md` |
| Leave-by lock screen | not drawn in 6 | dark card: badge 40, headline, countdown, trail, pips, I'M UP; "FREE" pill | **Restyle** to the 6.32 language (light glass, badge 34, ink text, sentence case). Undesigned, so log it |
| **Meet-up lock screen (6.32)** | card `left/right 12`, r30, glass .66, padding 14 16. Badge 34 r10 sun with gecko 32; eyebrow "MEET-UP · 17:00" 11.5/700 +.04em muted; place "Campuhan Ridge" **17/700 sentence case**; ETA "22 min" 24/800 right. Lane at margin-top 10, h28: track 4 r2 `#e3e4e9`, **ink fill to 62%**, dots 22 with a 2px white border and `0 1 4 .2` shadow, flag on the right. **Two** straggler rows, 13 px: bold name + "· scooter, 2 km", minutes 600 on the right. Buttons at margin-top 12, h40 r20: "Running late" control 14/600 (flex), "SOS" 80 wide pink 14/800 | `MeetUpLiveActivity.swift`: dark card; eyebrow yellow CAPS; BOOST pill; PLACE in CAPS 22 black; ETA 12 muted; a 3-thick lane with no fill; **one** straggler row (name plus line, no minutes); RUNNING LATE and SOS caps 12 | **Restyle**, plus **fit**: the drawn card is about 196 pt and iOS clips at 160 pt. Keep the design but drop the second straggler row, or shrink the lane and row gaps; the founder decides (§8). **Payload**: `LAMeetUpStraggler.min` (new) so each row shows its minutes. The lane fill needs a meaning (§8). BOOST pill: the design drops it on the Live Activity |
| Meet-up island | not drawn | expanded: eyebrow, place, ETA, lane, ON MY WAY / RUNNING LATE / PING ALL; compact flag plus ETA | **Restyle** only |
| **Critter nearby (6.30)** | glass card at top 470, r30, padding 14 16. Tile 64 r20 `#e3f6ec` with a locked gecko silhouette `#b9e6d2` and "?" 20/800 `#2e9a74`. Eyebrow "SOMETHING'S NEARBY" 11/700 +.06em `#1f7a55`; **place** "Tirta Empul" 18/700; "Stay within 50 m of the pools" 12 muted. Right: "4:00" 26/800 with "min left" 10.5/600 muted. **Linear** progress 6 r3 `#e3e4e9` with a mint fill. Plus a separate Tokek notification below | `CritterNearbyLiveActivity.swift`: dark glade `#122620`; ring 84; headline CAPS "STAY 4 MORE MIN"; FREE pill; place in the eyebrow row | **Restyle**: tile replaces the ring (keep the ring for compact and minimal); the place becomes the headline; progress = `ring/10`. **Payload (new)**: `ends_at` (unix s), so "4:00" counts mm:ss with `Text(timerInterval:)`, because `remain_min` has only minute resolution. "Stay within 50 m of the pools": the radius is static copy, or add `advice_line` if the place phrase matters. **Long-press** "End early or mute for today": Live Activities have no long-press menu, so §8 |
| Vote, Flight, Storm, SOS, Ride activities | not drawn in 6 | dark cards | **Restyle** with the same palette swap (undesigned, log). Foundations 1.08 draws a *driver pickup* island ("Made · Batur pickup / Outside in 4 min / Message / I'm coming out"); the current `RideActivityAttributes` is a Grab fare quote. That is a different kind; §7 |

### 6.2 Widgets, StandBy and Controls (`targets/widgets/Widgets/*`, Android `cp-android-surfaces/widgets/*`)

| Widget | Design (6.31, 6.28) | Current | Change |
|---|---|---|---|
| **Today**, systemLarge | 346×340 r30, glass .66, padding 18. "DAY 4 · BATUR" 12/700 +.04em muted; "Today" 30/800 −.04em; weather sun 28 + "31°" 22/700. Rows gap 10: time 44 wide 13.5/700 tabular; bar 4×28 r2 in the item colour; title 14.5/600. Footer: hairline top, gecko 34 + 12.5 `#3d404c` ("Rain after two. Springs are indoors.") | `TodayWidget.swift`: dark card; "TODAY" 28 black; briefing rows with DONE/NUDGE intents; packing chips with `PackingCheckIntent`; forecast line | **Restyle.** The design shows **plan rows only**: no briefing actions, no packing chips. Keep the interactive parts or drop them (§8). Item colour per row: the snapshot has start time and title only, so add an `accent` (day or category colour) to the today rows in `widget-snapshot.ts` (app-side) |
| **Balances**, systemSmall | 164×164 r30 glass, padding 14. "YOU'RE OWED" 11.5/700; "$186" 36/800; "Nudge Dev" ink h32 r16 12.5/600 | `BalancesWidget.swift`: coloured ground per face; amount 38 black; NUDGE pill (`NudgeIntent`) | **Restyle**: light glass for every face; sentence-case button |
| **Crew**, systemSmall | 164×164 r30 **ink `#1c1d24`**, padding 14. "RIDGE · 17:00" 11.5/700 at .7 + "BOOST" pink chip 9.5/800 r6; "**Jordan** 8 min out" 17/700; stack 24 | `CrewWidget.swift` (Boost): place in CAPS, "n of m there", member dots. Contract: "each member's ETA bucket and **initial, never a name**" | **Restyle**. **Conflict**: the design shows a first name; the privacy contract forbids it (§8) |
| Countdown, Vote, Critterdex, Next flight, accessories (`accessoryInline/Circular/Rectangular`) | not drawn | dark | **Restyle** only. The lock-screen accessories render monochrome or vibrant, so mark the numerals `widgetAccentable` |
| **StandBy left (6.28)** | panel 340×310 r40 (system), `#16110c` with a radial `rgba(255,154,77,.25)` glow at 50% 60%; sleeping Tokek 170; Borel "z z z" 18 sun at .8. **No clock** | `SleepyClock.swift`: systemSmall, clock 44 black + "z z z" 11 heavy | **Restyle**: drop the clock or keep it (the system already shows a clock in StandBy); use guide art from the App Group; Borel font |
| **StandBy right (6.28)** | `#1a0e0a`, padding 30 32. "LEAVE BY 03:10" 15/700 +.06em `#ff9a4d`; **"22"** 150/700 −.05em `#ff8a4d`; "minutes · Made is outside" 17 `#e8a77a` | `LeaveByAlarm.swift`: systemSmall and accessoryRectangular | **Restyle**. StandBy scales a small widget about 2×, so author at about 72/700 for the numeral in a 158 pt small family. Whole minutes via per-minute timeline entries. Night mode: the system tints red automatically, so accept the tint. "Made is outside": no data (§7) |
| Controls | not drawn | `ImUpControl`, `SOSControl` | none |
| Android Glance widgets (7 `cp_*_widget_info.xml`) | — | `WidgetUi.kt` | **Restyle** to parity (light cards; ink crew card) |

### 6.3 iOS notifications (`notification-service`, `notification-content`, `_shared/Categories`, worker `push/payload.ts`)

| Surface | Design | Current | Change |
|---|---|---|---|
| **Communication notifications (6.33)** | Avatar 38 circle with a **17 r4.4 app badge** (system). Tokek on `#fff3c4`; members as an **initial on their crew colour**. Title 14.5/700, time 12.5, body 14/1.35. Tokek's has a 3rd line "Morning briefing · 4 things today". "The Bali Six" stack (2 layers) reading "3 new messages". Money: "Maya added Babi guling / Rp 1.08M split six ways. Your share is $11.37." | NSE `NotificationService.swift`: `INSendMessageIntent` sender identity ✓; thread-id = crew_id ✓; avatar order: App Group → signed URL → **bundled gecko**; sets `subtitle` = display name when it differs from the title; guide name carries "· AI guide" | **Small changes**. (1) Draw initial avatars: when a member has no photo, render the initial on their crew colour with `UIGraphicsImageRenderer`, so add `colour` per member to `snapshot/crews.json` (app-side, §6 of async contracts). (2) The 3rd line becomes `content.subtitle` (it shows above the body; the design puts it below), or join it into the body (§8). (3) "Tokek" versus "Tokek · AI guide" (§8). (4) The stack face shows the latest message; "3 new messages" is not what iOS draws unless the server collapses. **Swipe-left options**: system "Mute 1 h / today / Turn off"; the "turn off money" path needs `providesAppNotificationSettings` plus `userNotificationCenter(_:openSettingsFor:)` → 6.38. **New**: neither exists today |
| **Vote poster (6.29)**, `cp.vote` content extension | Card r30 glass .66, padding 14 16. Header: 24 r7 app glyph, "The Bali Six · Final vote" 13/600, "now" 12 muted. Two tiles h100 r20 (**`#fff1e6` with tanuki 80**, **`#e3f6ec` with sardine 84** rotated −14°), sticker labels "Kyoto · 2" / "Lisbon · 1" 12/800 `#17142a` on tangerine / mint with a 2px white border r7; "VS" 14/800 between; caption 13 `#3d404c` "Three of six have voted. It closes Friday." Actions as three h48 r18 rows: "Vote Kyoto", "Vote Lisbon", "Open the showdown" (sky text) | `VotePosterView.swift`: blue/orange slant fight poster; **hard-coded** tanuki and sardine; "VS" in a night circle with a pulse; counts "n VOTES" from cast responses; stamp ✓; dynamic titles "Vote <label>" ✓ | **Restyle** to the two-tile layout. **Payload (new) in `cp.ctx`**: `options[].critter` (art key), `options[].tone`, `options[].count`, plus `voted`, `eligible`, `closes_at` so the first frame has counts and the caption. The **action rows are system-drawn**: we set titles only, and the sky colour on "Open the showdown" is not available. OPEN title → "Open the showdown". The stamp drop keeps the Lively spring |
| **Changeset poster (6.34)**, new | Expanded over blur. Card r26 white .78, padding 14 16. Header 20 r5 Tokek badge, "Tokek · a change" 13/600, "now". Title "Swap the ridge and the market?" **19/800**; body 14 `#3d404c`. Diff box r18 white, padding 10 12: rows 14 px, 6 sky dot, name flex, "13:00 →" muted, new time bold. Footer: stack 22 + "2 of 3 yeses · closes 18:00" 12.5. Actions: **"Yes, swap"** (bold, first), "Not this one", "Open the plan" | category `cp.changeset` with **no poster**; actions APPROVE "Yes", DECLINE "No" (destructive), UNDO "Undo" | **New surface**: add `cp.changeset` to `UNNotificationExtensionCategory`, a `ChangesetPosterView`, and per-notification action titles via `extensionContext.notificationActions`. Replace UNDO with OPEN (foreground, opens 4.46); DECLINE stays non-destructive in the design. **Payload (new) in `cp.ctx`**: `diff[{label, from, to}]`, `yes_count`, `needed`, `closes_at`, `voters[{initial, tone}]` (≤1 KB budget; or fetch with `full:false`) |
| **Time-sensitive (6.35)** | "TIME SENSITIVE" eyebrow 10.5/800 `#c4400b` (system), "Maya is knocking" / "SQ 938 now leaves 10:20"; Sleep focus pill; "3 more from CritterPass at 07:00" (system) | worker sets `interruption-level: time-sensitive` for `always` keys ✓; `crew_knock` and `flight_changed` are `always` ✓ | **Missing entitlement**: `com.apple.developer.usernotifications.time-sensitive` is not in `app.config.ts` `ios.entitlements` (only App Groups and Keychain; communication is added by plugin). Without it the level degrades to active and breaks through neither Sleep nor Focus. **Config change** plus a provisioning capability. The long-press "Snooze 5 min, tell Maya you're up" uses the existing `cp.leaveby` actions (IM_UP, SNOOZE) ✓ |
| **Evening roundup (6.36)** | One Tokek notification, "Tokek's roundup / Five small things from today", with **five rows** visible on the lock screen (icon tile 30 r10 white + 14/600 title + 12 sub) | `evening_roundup` is `roundup_only` → `cp.generic` (OPEN only), plain text | iOS cannot draw rows on a collapsed lock-screen notification. **New**: a `cp.roundup` category with a content-extension view showing the rows on long-press; the collapsed body becomes a one-line summary ("Bookings found, Kyoto invite, 3 quests…"). **Payload**: `ctx.lines[{kind, title, sub, deeplink}]` (≤5). "Clear" is a system action |
| Lock-screen vote **Live Activity** (`VoteLiveActivity.swift`) | not drawn | dark, CastBallot | restyle only |

### 6.4 Android (`modules/cp-notifications`, `modules/cp-android-surfaces`, `modules/cp-alarm`)

| Surface | Design 6.37 | Current | Change |
|---|---|---|---|
| Channels | header subtext names the channel ("Crew chat", "Votes", "Money", "Critters"). **"Silent" section** holds Money and Critters. Long-press lists: crew chat, votes, money, trip, guide, critters, roundup, alarm, SOS, always | `Channels.kt`: the 10 channels match ✓. Importance: always/alarm/crew_chat/sos HIGH; votes/money/trip/guide/critters DEFAULT; roundup LOW | Money and Critters must be **LOW** to sit under "Silent". Android forbids changing importance after creation, so this needs **new channel ids** (e.g. `cp_money_v2`, `cp_critters_v2`) and deleting the old ones, which resets user choices (§8). Header: `setSubText(channel label)` instead of the payload subtitle |
| Chat notification | MessagingStyle: conversation "The Bali Six"; lines "**Maya** who's up…", "**Jordan** sent a sticker"; avatar 36 initial on crew colour; actions "Reply" (tonal `#d6e3ff/#1b3a7a`) and "Mark read" | `SenderStyle.kt` + `ConversationShortcuts.kt` ✓; REPLY (RemoteInput) and READ ✓; a missing avatar falls back to the system initial on a system colour | **Small**: draw the initial avatar on the crew colour (same `colour` field) as the `Person` icon; button colours are system Material You (accept) |
| Vote notification | large icon Tokek on `#fff3c4`; "Spa on day 3?" / "4 of 6 voted. Closes at 18:00."; actions Yes / No | `cp.vote` VOTE_n with option labels ✓ | content only |
| Small icon | 16 r4 sun square with the gecko | `res/drawable/cp_notification_icon.xml` (monochrome vector) | Keep monochrome (platform rule) and add `setColor(#ffd84a)`. A full-colour gecko is not possible as the small icon |
| "Manage" | opens app settings 6.38 | no `NOTIFICATION_PREFERENCES` intent filter | **New**: an activity alias with `android.intent.category.NOTIFICATION_PREFERENCES` routing to `/you/pings` |
| Live Updates (6.27/6.32 parity) | not drawn | `LiveUpdateRenderer.kt` ProgressStyle (API 36+) with segments and points tinted by tone ✓; ongoing notification below 36 | **Restyle** tones to the new palette; the leave-by legs become segments, members become points |
| Full-screen alarm (6.26) | §3 | `LeaveByAlarmActivity` / `AlarmScreen.kt` Compose (tint, 104 sp time, italic guide line), `SlideToConfirm.kt` | **Restyle**: Borel guide line (bundle the font), knob 60 sun on a `rgba(255,255,255,.14)` track h72, wobble animation |
| StandBy equivalent | — | `SleepyClockDream.kt` (DreamService) ✓ | restyle to 6.28 |

### 6.5 Alarm (iOS AlarmKit, `modules/cp-alarm/ios/AlarmScheduler.swift`)
- The system alert offers only title, stop and secondary buttons plus `tintColor`.
- **Change**: set `tintColor` to sun `#ffd84a`, and set the title copy to "Leave by 03:10 · Batur" with the stop button "I'm up".
- The 6.26 artwork shows in-app only. The countdown presentation already renders the `LeaveByAlarmCountdown` widget (restyle as 6.28 right).

## 7. Logic and backend gaps (only what the design needs)

1. **Per-crew chat mode** (6.38 "The Bali Six: Everything / Kyoto: Mentions only / Lisbon: Off").
   - Today: `notification_prefs.crew_chat_mode` is one global value (`features/you/ping-settings/ping-prefs.ts`).
   - Needs a per-crew override (table or jsonb), a `set_notification_prefs` payload extension, and worker routing (`services/worker/src/jobs/notify/policy.ts`).
2. **"Today: every push, sent and held"** (6.38 tap). `ping_ledger.sent_budgeted` syncs (the count is fine), but held roundup items are not visible client-side. Expose held items with a status, verifying first whether inbox rows already carry them.
3. **Live Activity content-state fields** (`packages/domain/src/live-activities.ts` → generated `CPActivityAttributes.swift`):
   - `CritterNearby.ends_at`.
   - `MeetUpStraggler.min`.
   - A defined meaning for the meet-up lane fill (§8).
4. **Push `ctx` fields** (`packages/domain/src/push-payload.ts`, `docs/api-contracts-async.md` §3.4):
   - vote `options[].critter/tone/count`, `voted`, `eligible`, `closes_at`;
   - changeset `diff[]`, `yes_count`, `needed`, `closes_at`, `voters[]`;
   - roundup `lines[]`.
   - Plus the new `cp.roundup` category and the changeset poster flag.
5. **Driver presence** ("Made is outside" 6.26/6.28; "Snooze … Made is told" 6.26; "I'm up … tells Made" 6.27; 1.08 "Outside in 4 min").
   - There is no driver telemetry or driver messaging channel; drivers are external (WhatsApp).
   - Options: a crewmate taps "Driver's here", which sets a `driver_arrived` flag on the leave-by; or the copy is dropped. "Made is told" can only be a prepared WhatsApp message. Founder decides.
6. **Free-day suggestions** (6.05): nearby ideas with fit reasons ("Jun can eat here" from dietary data, "Komang is free" from driver availability, which is unknown), and "Join" on a crewmate's optional item. Partial: per-member skip exists in day-of; suggestions are missing.
7. **Check-in hero** (6.03): bed type per room ("King/Twin/Family") and per-member confirmation ("Maya hasn't confirmed, so nothing's locked"). Rooms exist in `setup/rooms.ts`; confirmation and lock state need verifying, likely missing.
8. **Meet-up compass** (6.14), all new:
   - device heading;
   - bearings to crew fixes (client-side);
   - walking-step guidance "Take the ridge path left in 120 m", which needs routed walking steps (the SOS session map draws a foot route; steps are likely missing);
   - a camera overlay.
9. **Crew widget first name** (6.31) contradicts the snapshot privacy rule (§6.2). If accepted, the snapshot adds the furthest member's first name.
10. **Config, not backend**: the time-sensitive entitlement (§6.3), `providesAppNotificationSettings`, the Android `NOTIFICATION_PREFERENCES` alias, Borel in the widget extension, and shared `CPTokens.swift`/`CpTokens.kt` wired into targets.

## 8. Open questions

1. **Hub structure.**
   - Foundations 1.05 draws the hub as a hero photo plus a **Today/Plan/Map/Money segmented row** (h34 chips, 13.5/600, active ink) over day rows.
   - Part 6 draws three other headers and no segmented row:
     - 6.01: 60/800 "Bali" + countdown.
     - 6.02/6.03: large title 34/700 + search.
     - Tiles act as the "four doors".
   - No other part uses the segmented control. Option: hub = 1.05 hero plus segments, with the Today segment holding 6.01–6.03 content (briefing, tiles, ticker). Founder decides.
2. **Back affordances.**
   - Not drawn on 6.04, 6.15 or 6.17.
   - 6.08, 6.16 and 6.24 draw a chevron while their tap lists say "Close".
   - 6.14 uses ← where Foundations has a chevron.
   - 6.17 is a full-screen takeover with no ✕, which Foundations requires.
3. **Push header pattern.** Three variants: a centred inline title (6.05, 6.11–6.13, 6.25, 6.38), a left caption beside the chevron (6.19, 6.21), and a right caption (6.06, 6.07, 6.22, 6.23). 6.25 shows a double title ("Drivers" plus "Drivers our crews used").
4. **One dark pill per screen** is broken on 6.03, 6.09 (Approve + Tell the crew), 6.16 (Go + dark phrase card), 6.19 (ink bar + sun Compare), 6.21 and 6.22. Is the flat ink btn an allowed "secondary dark"?
5. **Sheet rule.** 6.18 has no Cancel/verb header (its actions sit at the bottom). The map panels use three materials: solid r32 (6.08, 6.10), glass `.9` r34 (6.11–6.13), and the Foundations sheet `.86` r46 (6.18).
6. **Off-token type**:
   - 60/800 (6.01), 92/800 (6.04), 104/700 (6.26), 150/700 (6.28) against Hero 66.
   - 44/800 (6.07), 52/800 (6.08), 60/800 (6.09) display numerals.
   - 28/700, 30/700, 32/700 titles against Display 34 and Title 22.
   - 24/800 (6.03).
   - Should a "Numeral" and a "Page title 30–32" token be added?
7. **Off-token colours**:
   - text: `#3d404c` (secondary text, used everywhere, also in Foundations), `#17142a` (avatar letters), `#a8501a` (tangerine text), `#e0468e` and `#2e9a74` (dark pink and green, also in Foundations), `#c4400b`;
   - fills: `#f6f6f8`, `#fffbe8`, `#e6eef0`;
   - gradients: `#e6f6fb` (6.05), `#dfe8ff` (6.07), `#ffd6e8` (6.17), `#ff8a4d/#e8a77a/#16110c/#1a0e0a` (6.28);
   - accents: destructive `#d93a62` on `rgba(255,59,92,.1)` (6.18) against Foundations `#d6337f`; caret `#7fb0ff`; grabber `#d0d1d8` (6.10);
   - materials: nav glass `.62` blur 18 saturate 1.8 (against regular glass .56/24/1.9); 6.01 inline tab bar `.64/1.8/r32`.
   - Promote the de-facto values to tokens or snap them.
8. **6.32 height**: about 196 pt against the iOS 160 pt lock-screen limit. Cut the second straggler row or tighten?
   - What does the lane's **62% ink fill** mean (my progress, the leader, or elapsed time)?
   - The 6.10 lane fills to my position (30%). Is it the same rule?
9. **Live Activity long-press** (6.30 "End early or mute for today") is not an iOS capability. Use buttons in the expanded island, a Live Activity button, or app settings?
10. **Rich notifications versus OS limits**:
    - 6.36's five rows only on long-press;
    - 6.33's third line becomes a subtitle above the body;
    - the "3 new messages" stack face;
    - 6.29's sky-coloured "Open the showdown";
    - the coloured Android small icon.
    Accept the platform renderings?
11. **AI disclosure**: the contract requires "Tokek · AI guide" as the sender name; 6.33, 6.35 and 6.36 show "Tokek". Product decision.
12. **Android silent channels**: moving Money and Critters to "Silent" needs new channel ids, which reset user channel choices. Accept?
13. **Crew widget name** "Jordan 8 min out" (6.31) against "initials only" in the widget snapshot privacy rule.
14. **Today widget**: the design drops the interactive briefing DONE/NUDGE and packing checks. Keep them?
15. **6.38**:
    - the current per-day budget stepper (1–10) is not drawn, and the design says "six at most";
    - "Hide message text … until Face ID" is the iOS system "Show Previews" setting, which apps cannot set. The app-level switch maps to the existing `user_settings.hide_lockscreen_details` (generic text), not a Face ID gate;
    - single-line rows are about 38 pt (under 44 pt).
16. **Copy**:
    - "Maya and Ray" should be "Rin" (6.05);
    - sample names "Jun/Ari" in 6.11/6.12 against Jordan/Alex;
    - "Md" initials (6.19);
    - "3 of 6" on 6.22 (meaning?);
    - the app label "Critterpass" in 6.27/6.31 should be "CritterPass";
    - "Made is outside" (driver data, §7.5).
17. **Taps not given**: 6.01 ticker and tiles; 6.04 (no list at all); 6.09; 6.10; 6.14; 6.19–6.21 lists are partial.
18. **Brief mismatch**: there is no "slide to board" on the driver screens in Part 6. The only slide controls are the alarm (6.26) and the existing SOS send. "Slide to board" probably belongs to Part 7 (boarding pass).
19. **Haptics**: none are stated anywhere in Part 6. Use the Foundations defaults (alarm slide = success, SOS = heavy, toggles = selection)?

```
Status: DONE_WITH_CONCERNS
Summary: Exact build spec for all 38 Part 6 screens, including every native surface: what the current targets/modules already do and whether each change is a restyle, a new surface or a new payload field. Most logic exists; the work is a visual restyle onto shared native tokens plus a short list of payload and config additions.
Concerns/Blockers: Founder decisions needed on the hub structure (1.05 segmented versus 6.01 tiles), the 6.32 Live Activity exceeding 160 pt, AI-disclosure naming, driver "is outside" data, and the crew widget name versus the privacy rule. The time-sensitive notification entitlement is missing from app.config.ts today.
```
