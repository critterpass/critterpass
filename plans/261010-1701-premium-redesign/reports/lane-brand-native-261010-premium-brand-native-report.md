# Lane report: premium brand and native surfaces

Branch `feat/premium-brand-native` (from `origin/feat/premium-redesign`, with `origin/feat/premium-kit` merged for the tokens). Nothing here was compiled locally: Xcode and Gradle don't run on this Mac. The two native builds below are the compile check.

## What was built

### 1. App icons
- Four icons exported from `design/premium/App Icon.dc.html` by `tools/design-renders/export-app-icons.mjs`: passport (the default, plus development and staging badges), face, stamp and sticker.
- iOS: Icon Composer `.icon` bundles (`assets/app-icons/ios/*.icon`) with light, dark and tinted (mono) layers. SDK 58 takes them through `ios.icon`. The clear appearance is the system's own treatment of those layers.
- Android: adaptive foreground and background plus a monochrome themed layer for every icon.
- Alternate icons (face, stamp, sticker) go through `cp-app-icon` (`plugin/with-app-icons.ts`, tested).

### 2. Splash and launch (10.01, 10.02)
- iOS launch screen: the passport launch cover on its glow, light and dark (`assets/launch/splash-ios*.png`).
- Android 12+: a static splash icon with the wordmark as the branding image (`plugins/with-splash-branding.ts`, tested). It replaces the egg wobble, which is deleted.
- JS launch, first launch only (`src/features/launch/premium/`):
  - The ISSUED stamp drops on the cover with the squash, confetti and a heavy thud.
  - The cover lifts on the Smooth spring while Tokek, the plane and the puffin pop in.
  - Later launches render nothing.
  - `onSettled(cover)` hands over the cover's resting frame (`launchCoverFinalFrame`) so 2.01 starts from it.
  - The timeline and first-launch state are tested.

### 3. Native surfaces restyle (part 6 §6)
- **Shared tokens.** `plugins/premium-native-tokens.ts` commits the kit's generated Swift and Kotlin tokens where each target compiles them:
  - `targets/_shared/Tokens/CPPremium.swift`, which compiles into every Apple target;
  - `modules/cp-notifications/.../tokens/CpPremium.kt`.

  A Jest test fails when a copy drifts; `tsx plugins/premium-native-tokens.ts --write` rewrites them. `LAPalette` (Live Activities and widgets) and `PosterPalette` (posters) now read the tokens and adapt to dark mode.
- **Live Activities.** The lock screen uses system glass (`activityBackgroundTint(nil)`) with ink text and sentence case. Every island region resolves dark (`islandAppearance()`).
  - Leave-by (6.27 island, lock screen in the 6.32 language): badge 34, eyebrow plus title, the leave time 34/700 in sun, a solid trail, "I'm up" and "Ask <guide>" (which becomes "Snooze" at go or late).
    - Tapping opens the hub on the pickup (`trips/<id>?focus=leave_by:<id>`).
    - "Ask" passes the trip and the leave-by to `guide/new`.
  - Meet-up (6.32): Tokek badge, place 17/700, ETA 24/800, an ink lane fill, the straggler row with its minutes, "Running late" and an 80 pt SOS.
  - Critter nearby (6.30): a mint tile with the silhouette and "?", the place as the headline, `ends_at` counted to the second, and a linear bar. The island keeps the ring.
  - Vote, flight, storm, SOS and ride: palette and copy only (undesigned). SOS draws on the destructive tint while it is open.
- **Widgets.**
  - Today (6.31): eyebrow, "Today" 30/800, weather plus the high, rows of time 44 wide, a 4×28 bar and the title, and Tokek's line over a hairline.
  - Balances: a light card on every face, with an ink "Nudge <name>".
  - Crew: an ink card with a Boost chip, "n of m there" and initials.
  - StandBy left (6.28): warm dark ground, glow, sleeping Tokek, Borel "z z z", and no clock (StandBy draws one).
  - StandBy right: "LEAVE BY 03:10" in tangerine and the minutes at 72/700, which StandBy scales about 2×.
  - Accessories: numerals marked `widgetAccentable`.
  - Borel is bundled in the widget extension (`targets/widgets/Fonts/Borel-400.ttf` plus `UIAppFonts`).
- **AlarmKit countdown and paused faces**: restyled to the 6.28 night palette, with "Time to go" and "I'm up".
- **Notification content extension.**
  - Vote poster (6.29): header, two answer tiles carrying their critter, colour and count from `ctx`, "VS", and the turnout line ("3 of 6 have voted. It closes Friday."). The stamp lands on the Lively spring.
  - New changeset poster (6.34): title, body, before → after rows, a voter stack and "2 of 3 yeses · closes 18:00".
    - Its buttons are "Yes, swap" (or "Yes" when it isn't a swap), "Not this one" and "Open the plan".
    - Yes and no are handed on to the app, which already runs `approve_changeset`.
  - New roundup poster (6.36): up to five rows, each an icon tile, title and sub.
  - The poster height now follows its content.
  - `cp.changeset` and `cp.roundup` are registered in the extension's Info.plist.
  - The poster model's parsing is covered by host XCTests (`pnpm --filter @cp/mobile ios:test`).
- **Notification service**: a member with no photo is their initial on their crew colour (`sender.tone`), never the gecko.
- **Time-sensitive entitlement**: in `app.config.ts`.
- **Android**:
  - Channels: Money and Critters are recreated silent (LOW) as `cp_money_quiet` and `cp_critters_quiet`, and the old ids are deleted.
  - Notifications: the header names the channel; every notification gets the sun accent; chat senders without a photo show their initial on their crew colour.
  - "Manage" opens the in-app notification settings (a `NOTIFICATION_PREFERENCES` activity routing to `/you/pings`).
  - Live Updates use the premium tones.
  - The alarm screen follows 6.26: ink with a tangerine glow, a 104 sp time, a Borel guide line, a 72 dp slider with a 60 dp sun knob, and the wobble.
  - Glance widgets: light cards that go dark in dark mode; the crew card stays ink.
  - The StandBy screen saver follows 6.28.
  - The Compose token dependency is added to cp-notifications, and cp-alarm now depends on cp-notifications.

### 4. Payload fields
All of these are in the worker push builders, with tests in `services/worker/test/{polls/poster,plan/changeset-poster,roundup-lines,push-send}.test.ts`, and documented in `docs/api-contracts-async.md` §3.1 and §3.4:
- vote `options[{critter, tone, count}]`, `voted`, `eligible` and `closes_at`;
- changeset `diff`, `yes_count`, `needed`, `closes_at` and `voters`;
- roundup `lines` under its own `cp.roundup` category;
- member `sender.tone`;
- Live Activity `CritterNearby.ends_at` and `MeetUp.stragglers[].min`.

## Platform limits hit and how they were resolved
- **The Live Activity lock screen is clipped at 160 pt.** 6.32 draws about 196, so it keeps one straggler row (the furthest out, with their minutes), uses a 24 pt lane and 32 pt buttons. The second row lives in the app's crew map.
- **The meet-up lane fill.** The activity is broadcast, so it can't mean "my progress". It fills to the furthest-out member's position: full means everyone is at the flag.
- **Live Activities have no long-press menu** (6.30 "End early or mute"). Nothing was added; it is still a founder question.
- **Notification action buttons** are drawn by the system: they can't be coloured (6.29's sky "Open the showdown") or made bold ("Yes, swap"). The titles are set per notification.
- **The roundup's rows** show only on long-press; the collapsed notification keeps the one-line summary.
- **Android small icon** stays monochrome, with `setColor(sun)`.
- **Android channel importance** can't change after creation, hence the new ids. Users' settings for Money and Critters reset once.
- **Compose can't blur what is behind a view**: the 6.26 slider track is the translucent fill without the blur.

## Not done, or left to other owners
- **AlarmKit tint and title** come from the app's `scheduleLeaveByAlarm` request (`tintHex`, `title`). The caller should send sun `#ffd84a` and "Leave by 03:10 · Batur". This is app code outside this lane.
- **The alarm slider label** comes from the app's alarm strings. It should be sentence case: "slide, I'm up →".
- **`providesAppNotificationSettings`** plus `openSettingsFor` (iOS "Turn off" → 6.38) need the app's permission request and AppDelegate. That is outside this lane.
- **Today widget row colours**: the snapshot has no per-row accent, so the bars rotate through the crew colours. A per-row `accent` in `widget-snapshot.ts` (app side) would fix that.
- **Driver presence** ("Made is outside", "Made is told"): no data exists, so the copy is not shown.
- **The 6.26 bell sticker** on Android: no asset in the module.
- **Undesigned states, for `docs/undesigned-states.md`** (not in this lane's files; the controller should log them):
  - leave-by compact, minimal and lock screen;
  - meet-up island;
  - vote, flight, storm, SOS and ride activities;
  - countdown, vote, critterdex and next-flight widgets;
  - the alarm countdown faces.

## Native builds
- iOS `native-build.yml` (e2e-test): run 38134501240 (dispatched, not awaited)
- Android `native-build.yml` (e2e-test): run 38134503921 (dispatched, not awaited)

## Open questions for the founder
1. 6.32 at 160 pt: one straggler row (as built), or tighten further and keep two?
2. Meet-up lane fill: is "the furthest-out member's progress" the meaning you want?
3. Today widget: keep the Done/Nudge buttons and packing chips? They are kept for now; the design drops them.
4. Crew widget: initials only (as built, per the privacy rule), or the first name the design shows?
5. "Tokek" versus "Tokek · AI guide" as the sender name on communication notifications. The AI-disclosure name is unchanged.
6. Android: accept that Money and Critters settings reset once with the new silent channels?
