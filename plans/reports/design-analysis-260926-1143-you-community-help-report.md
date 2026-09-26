# Design analysis: slice 3n (You), 3o (Community), 3p (Help and feedback)

Date 2026-09-26. Sources: 21 screenshots (3n-1..11, 3o-1..4, 3p-1..6), captions, raw `Critterpass.dc.html` offsets 799838–993894, prototype `<script type="text/x-dc">` (per-screen `b:` maps, `PARENT` map, `avatarPick`, `iconPick`, `rateNext`, `ratePrompt`, `holdSetup`, `trans()`), `doodles.js` motion engine, and cross-refs 3a-6, 3b, 3c-8/9, 3d-1, 3e-1, 3i Settle up, 3l-2/3, 3m-1/3, 4a-1, 4b-2, 4c-2, 4d-1/2, 4e-1/2/3, 5b-4, 5c-5.

**Motion engine reference** (all specs below use it): `tg-motion` keyframe DSL `offset:tokens` over `dur` ms. Tokens are tx/ty (px or %), s/sx/sy, r (deg) and o. Per-segment easing `e=`: in = cubic-bezier(.55,0,1,.45), out = (0,.55,.45,1), **io = (.65,0,.35,1) (default)**, lin, back = (.34,1.56,.64,1). Loops run on a global clock unless `iter=1`, and all motion is off under `prefers-reduced-motion`, so the native build must honour Reduce Motion and the Android animator scale. Presets:
- bob: ty 0→−6→0, 2400ms
- float: ty0 r−2 → ty−9 r2, 4200ms
- wiggle: r −4→4→−4, 1600ms
- hop: squash sy.9 at 10% (out), jump ty−14 sy1.05 at 22% (in), land sy.94 at 34% (out), rest at 42%; 2600ms
- pulse: s 1→1.07, 1600ms

Prototype helpers:
- `pop`: scale 1.12 at 40%, 360ms ease-out
- `shake`: translateX −8/7/−5/3/0, 420ms
- `float(el,s)`: glyph rises −40px and fades, 800ms
- `thud`: whole screen translateY 0/5/−2/0, 280ms, with SFX and haptic
- toast: Dynamic-Island-style pill that expands from 122×35 to 360×62 in 440ms, cubic-bezier(.2,1.25,.3,1). Children fade in with 150ms + 40ms stagger. Default visible 2800ms. Optional OPEN action.

Screen transitions, with E = cubic-bezier(.32,.72,0,1):
- **push**: 480ms. Incoming X 100%→0; outgoing −30%; scrim 0→.5.
- **pop**: 420ms.
- **sheet**: 540ms. Foreground rises by (844−sheetTop); background elements fade 320ms; underlying screen scales to .93; scrim .45.
- **rise**: 620ms with 120ms delay.
- **dismiss**: 420ms.
- **zoom**: 560ms shared-element. clip-path grows from the source rect, radius 22→54; underlying screen scales .94. **unzoom** is 460ms.
- **burst**: out 360ms ease-in to scale .9; in 640ms cubic-bezier(.2,1.3,.35,1) from scale 1.2, 120ms delay, plus a white flash of .55 over 460ms.

**Tokens**:
- Colours: app background `#17142a`, surface `#1f1b38`, raised `#2c2750`, off-track and locked `#3a3466`, text `#f4efe4`, muted `#a9a3c0`, faint `#6f698c`.
- Accents: yellow `#ffd84a`, pink `#ff5fa8`, blue `#4f86ff`, green `#54d6a4`, orange `#ff9a4d`; paper `#f4efe4`.
- Rarity rings: common none or `#3a3466`, **rare `#4f86ff`**, **epic `#ff5fa8`**, **legendary `#ffd84a`** (from `data-ring` on 3n-4 and the 3n-3 box-shadow).
- Toggle: 46×28, on `#54d6a4`, off `#3a3466`, knob 22 `#f4efe4`.
- Fonts: Archivo 900 at font-stretch 62–80% (headings); Geist (body); Geist Mono (meta and MRZ); Caveat (guide handwriting).

---

## 1. Slice overview

**User goals**
- **3n You.** See my traveller identity (stamps, stats, taste, crews). Control how the guide behaves, sounds, notifies and uses my data. Personalise my avatar and app icon. Set language and currency. Leave safely, with a 30-day way back.
- **3o Community.** Before a trip: borrow proven itineraries from crews who went (whole plan or single days) and have the guide fit them into our draft. After a trip: rate places in about 30 seconds and publish our plan with explicit control over what leaves the crew.
- **3p Help.** Get help, report bugs with context (shake, auto-screenshot), send feedback, vote on and suggest features (deduplicated), and be asked for an App Store rating only at the best moment.

**Entry points (in)**
| Into | From |
|---|---|
| 3n-1 Profile | Home avatar (`cp:'me'`) on 3b-2 and 3b-6; PARENT = Home. |
| 3n-2 Settings | 3n-1 SETTINGS. |
| 3n-3 Edit profile | 3n-1 EDIT. |
| 3n-4 Avatar | 3n-3 avatar or CHANGE AVATAR. |
| 3n-5 App icon | 3n-3 "App icon" row; 4e-3 Welcome to Pass+ "PICK A NEW ICON" (Pass+ styles already unlocked). |
| 3n-6 Settings, more | 3n-2 scrolled (same screen, lower half; proto `cp:'more'`); 3p-3 BACK TO SETTINGS. |
| 3n-7 Sound | 3n-2 "Music and effects"; 3n-6 Music. |
| 3n-8 Language and currency | 3n-6 row. |
| 3n-9 Delete account | 3n-6 Delete account. |
| 3n-10 Hold to delete | 3n-9 CONTINUE (sheet). |
| 3n-11 Account closed | 3n-10 hold complete. |
| 3o-1 Crew plans | 3d-1 Destination guide "1,240 CREW PLANS ›" (caption: "Opens from the Kyoto guide"). |
| 3o-2 Shared plan | 3o-1 card (zoom / "poster grows into this page"). |
| 3o-3 Rate the trip | 3m-1 Recap: toast "Rate the trip? Thirty seconds, and it helps the next crew." appears 1600ms after entering, shows 5600ms, has an OPEN action, and fires once per session. |
| 3o-4 Share the plan | 3e-1 Trip plan SHARE (sheet); 3o-3 SHARE THE PLAN TOO (sheet). |
| 3p-1 Help and feedback | 3n-6 Help centre. |
| 3p-2 Send feedback | 3p-1 REPORT A PROBLEM / SEND FEEDBACK; 3n-6 Send feedback; **device shake anywhere in app**. |
| 3p-3 Feedback sent | 3p-2 SEND IT. |
| 3p-4 Idea board | 3p-1 SUGGEST A FEATURE; 3n-6 Suggest a feature; 3p-3 "See what others asked for". |
| 3p-5 Suggest an idea | 3p-4 + SUGGEST AN IDEA (sheet). |
| 3p-6 Rate the app | 3m-1 Recap after the story finishes (system sheet); 3n-6 "Rate Critterpass" (caption: opens the App Store review page directly; proto shows the sheet instead); 3p-1 RATE THE APP. |

**Exits (out)**
- 3n-1:
  - PASS+ chip → 4d-1 Your plan.
  - ALL 12 › → stamps list (not designed; proto toast "12 stamps from 7 trips. Bali stamps itself when you land.").
  - RETAKE → 3a This-or-that quiz (sheet).
  - THE BALI SIX → Home tab.
  - Past crew (UNI HOUSEMATES) → proto toast "The album is still there" (past-crew view not designed).
- 3n-2:
  - PASS+ · YEARLY › → 4d-1.
  - NOTIFICATIONS header → 5b-4 How much we ping.
  - Crew chat "Mentions only ›" and Location "During trips ›" → pickers (not designed).
  - Music and effects → 3n-7.
- 3n-5 STAMP (Pass+) → 4e-1 Paywall.
- 3n-6 Download my data → async export (proto toast "We'll email a zip within the hour."); Sign out → Splash (proto toast "Signed out. Your crews and critters are saved for when you're back.").
- PARENT map also puts 5b-4 How much we ping and 5c-5 Widget gallery under "Settings, more", but **3n-6 has no rows for them**.
- 3n-9: SETTLE UP → 3i Settle up, then returns here. "Manage subscription ›" → App Store subscriptions sheet.
- 3n-10 Keep my account → pops 2 levels, with toast "Glad you're staying."
- 3n-11 UNDO → ENTRY re-stamp, then Home, with toast "Welcome back. Everything's where you left it." Close → Splash (signed out).
- 3o-2 COPY INTO OUR TRIP → 3c-9 Pon's draft (push), with toast "Pon merged four days into your draft. Only you can see it." Per-day + → stays; toast "Added to your draft. Pon checked it against the must-dos."
- 3o-4 PUBLISH → dismiss, with toast "Published. Crews planning Bali will see it." "Copy a read-only link" → clipboard.
- 3p-3 → 3n-6, or → 3p-4. Later: Inbox card from Tokek when the fix ships (3b Inbox).
- 3p-4 idea shipped → note from Tokek to every voter (Inbox and push).

---

## 2. Per-screen specs

### 3n-1 Profile
- **Purpose**: identity hub, styled as a passport page. Shows achievements, taste and crews, and routes to edit and settings.
- **UI** (top to bottom):
  - Nav: ← HOME; pills EDIT and SETTINGS (h32, r16, `#2c2750`).
  - Avatar: 84px circle, sticker Temple Tokek 76px, ring box-shadow `3px #54d6a4, 6px bg, 7px rgba(84,214,164,.4)`. **Colour conflict:** rare is blue elsewhere.
  - Name "WINSTON" in Archivo 900 44px at 70% stretch; "@winston · Singapore".
  - Chips: PASS+ (yellow, spark doodle, `data-cp=plan`) and "RARE · TEMPLE TOKEK" (green on surface).
  - 3 stat tiles (yellow, pink, green; r20): 7 TRIPS, 12 COUNTRIES, 8 CRITTERS.
  - STAMPS row with ALL 12 › link: 70px circular stamps with double ring, rotated −8/6/−4/9°, overlapping −6px, each in a city colour (LISBON JUN 2024 blue, HÀ NỘI orange, SEOUL pink, CDMX green). The upcoming trip stamp is dashed `#3a3466`, "BALI / IN 17 DAYS".
  - HOW YOU TRAVEL with RETAKE: taste chips (SUNRISE CHASER, STREET FOOD, MUSEUMS, PHOTO DUMPS, EASY-ISH PACE; h34 r17, one colour each).
  - YOUR CREWS card list: stacked initial avatars (26px, −7px overlap), crew name, status line ("Bali in 17 days · Kyoto voting" / "Lisbon, June 2024"), ›.
  - Footer: dashed rule, MRZ line `P<SGPWINSTON<<CP0427` and SINCE 2022 (Geist Mono 10px `#6f698c`).
- **Data**:
  - User{display_name, username, home_city, member_since, passport_no "CP0427"}.
  - Entitlement{pass_plus}.
  - Avatar{critter_form, rarity}.
  - Stats{trips_count, countries_count, critters_count}.
  - Stamp[]{place, month-year, colour, status upcoming or stamped, days_until}.
  - TasteProfile.tags[].
  - CrewMembership[]{crew name, member initials and colours, status summary}.
- **Actions**: see Exits. Tapping a stamp (not designed) could open its trip or recap.
- **Motion**:
  - Stats count up on open (odometer `tg-count`; proto `count()` uses ease-out cubic, 700ms).
  - Avatar sticker loops `bob` 2600ms, and **its eyes follow scroll offset**. This needs an eye-target parameter in the procedural renderer.
  - Stamps land one after another with a small thud (stagger around 80–120ms, drop plus screen thud and haptic).
  - The Bali stamp stays dashed until arrival, then "stamps itself in yellow" (same trigger as the 3l-1 landing hatch).
- **States**:
  - Designed: Pass+ user with history.
  - MISSING: new user with 0 trips or stamps (anonymous-first pass from 3a), no crews, free user (no chip, or an upgrade chip?), unsaved or anonymous account banner, loading skeleton, offline (cached), many stamps (horizontal scroll?), stamp-arrival animation replay.
- **AI**: none.
- **Realtime**: crew status lines update from the crew or trip state; no live presence.
- **OS**: haptic on stamp thuds; SFX "thud" (respects 3n-7 toggles).
- **Gates**: PASS+ chip only; free otherwise.

### 3n-2 Settings (top)
- **Purpose**: guide behaviour, notifications, privacy, offline, sound entry.
- **UI**:
  - ← PROFILE; yellow pill "PASS+ · YEARLY ›"; large title SETTINGS.
  - Grouped cards (r20 `#1f1b38`):
    - YOUR GUIDE: How chatty segmented QUIET / NORMAL / CHATTY (NORMAL selected, paper pill); Talk out loud toggle ("Voice replies when you speak first").
    - NOTIFICATIONS: Leave-by alarms toggle ("Can ring through Do Not Disturb"); Crew chat "Mentions only ›".
    - PRIVACY: Location "During trips ›"; Find bookings in my email toggle ("Read-only, confirmations only"); Budget max "Never shown to anyone, guides included" with a lock and "Private" (read-only row).
    - OFFLINE: "Bali trip saved offline / Bookings, maps, phrases · 84 MB" with a green check.
    - SOUND: "Music and effects / Gamelan lo-fi · effects on ›". This row fades under the bottom gradient; the list continues on 3n-6.
- **Data**: UserSettings{guide_chattiness, talk_out_loud, leave_by_alarms, crew_chat_notify_level, location_mode, email_import_enabled (+ connected mailbox), music/sfx summary}; OfflinePack{trip, size_bytes, status}; Entitlement{plan, period}.
- **Actions and results**:
  - Chattiness change plays a one-line voice sample in the guide's voice. Proto lines: QUIET "I'll only speak up when it matters."; NORMAL "Leave by 03:10. The headlamp is by the door."; CHATTY "Leave by 03:10! Headlamp by the door, snacks in the left pocket. I checked the weather twice."
  - Toggles persist immediately.
  - Location opens a picker (not designed).
  - Enabling the email toggle triggers the mailbox connect flow (not designed here; 3h).
  - The offline row presumably manages packs (not designed).
- **Motion**: toggles snap with a small overshoot (knob spring, about 1.1 overshoot). The list continues under a bottom fade.
- **States**:
  - Designed: Pass+ with everything on.
  - MISSING:
    - Free user: email import is a Pass+ perk (4e-3 "Bookings pulled from your email"), so the toggle needs a locked state.
    - OS notification permission denied, so Leave-by and Crew chat rows must show "Off in iOS Settings" and deep-link to the app's settings.
    - Location permission denied or restricted.
    - Critical alert or AlarmKit authorisation denied.
    - Offline pack downloading, failed or out of storage; no trip saved.
    - Email connect error or token expired.
    - Voice sample loading or offline.
- **AI**: chattiness is a guide persona and verbosity parameter fed into every LLM prompt and into proactive-message frequency. Samples can be pre-rendered TTS per guide × level × language (no live LLM).
- **Realtime**: none.
- **OS**:
  - Notification authorisation.
  - Leave-by "ring through DND" needs AlarmKit (iOS 26+) or the Critical Alerts entitlement, which requires Apple approval. Details in slice 5b.
  - Location permission (Always vs When-In-Use) combined with app-level "During trips" gating.
  - Mail OAuth (Gmail / Microsoft Graph read-only scopes) or a forwarding address.
  - TTS audio playback.
- **Gates**: email import is Pass+; the plan chip is Pass+.

### 3n-3 Edit profile
- **Purpose**: edit public-to-crew identity.
- **UI**:
  - ← PROFILE; yellow SAVE pill; title EDIT PROFILE.
  - Avatar: 84px sticker, ring `0 0 0 3px #17142a, 0 0 0 5px #4f86ff` (rare blue). Beside it "TEMPLE TOKEK / Rare form · found Oct 14" and a CHANGE AVATAR pill.
  - Field card with in-place-editable rows: NAME Winston; USERNAME @winston; HOME AIRPORT "SIN · Singapore Changi"; LANGUAGES "English, Mandarin"; each with ›.
  - LOOK: App icon row with 36px icon thumbnail and "Classic · 5 of 9 unlocked".
  - Footer: "Your crews see your name, avatar and home airport. Nothing else."
- **Data**: User{display_name, username, home_airport (IATA and name), spoken_languages[]}; avatar form (name, rarity, found_at); AppIcon{current name, unlocked_count, total}.
- **Actions**:
  - Fields edit in place (keyboard slides up under the field). The airport row likely reuses the 3a airport search.
  - Languages open a multi-select.
  - Avatar opens 3n-4; the App icon row opens 3n-5.
  - SAVE pops back with toast "Profile saved."
- **Motion**: the keyboard slides up under the edited field (scroll-into-view). The avatar keeps its idle wobble here and everywhere.
- **States**:
  - Designed: filled.
  - MISSING: username taken or invalid, with live availability check; username change rate-limit; empty name validation; unsaved-changes on back; save error or offline; home airport change side effects (3d prices by crew airports, home currency in 3n-8 "from your home airport").
- **AI**: none. Spoken languages feed guide translation and phrase-card behaviour (3j, 3h).
- **Realtime**: name and avatar changes propagate to all crews (chat, map, votes).
- **OS**: keyboard; none else.
- **Gates**: none.
- **Inconsistencies**: "Classic" style name does not exist on 3n-5 (FACE, PASSPORT, STAMP, STICKER). The thumbnail shows the yellow FACE-like art while 3n-5 says PASSPORT is "In use". "5 of 9" conflicts with 3n-5 "4 STYLES · 3 EARNED" / "3 OF 6".

### 3n-4 Avatar
- **Purpose**: choose how you appear, with a critter sticker as the default identity.
- **UI**:
  - ← EDIT PROFILE; DONE pill.
  - Big 98px sticker preview in a ring.
  - "HOW THE CREW SEES IT" previews: chat bubble with mini avatar 26px ("on my way!") and crew-map name pill with 22px avatar "WINSTON" (`data-cp=avmini`).
  - Segmented control INITIALS / CRITTER / PHOTO (CRITTER active).
  - "FROM YOUR CRITTERDEX · 10 UNLOCKED": 4-column grid of 62px stickers on paper circles (`#f4efe4`). Each carries a ring from `data-ring`: common `#3a3466` 2px, rare `#4f86ff`. Selected = `0 0 0 3px #17142a, 0 0 0 5px #ffd84a`.
  - Locked tiles: dark silhouette with "?". Epic has a pink ring (note "Sunrise Tokek is an epic form. Summit Batur by sunrise."); legendary has a gold ring (note "Legendary avatars come with a gold ring. Golden Tokek needs all six of you at the top.").
  - Footer: "Rare forms and up keep their coloured ring wherever your avatar shows up. Legendary rings are gold."
- **Data**: CritterFormOwnership[] (form_id, kind, fill/spot/accent/belly/pose attrs, rarity, found_at); locked forms with unlock hint text; Avatar{type, form_id or photo_id or initials+colour}.
- **Actions**:
  - Tap an owned sticker: the big preview and every mini preview update at once. The selected ring moves; the big circle ring becomes the rarity colour.
  - Tap a locked sticker: shake plus toast with the unlock hint.
  - INITIALS: proto toast "Initials on a colour you pick." (colour picker not designed).
  - PHOTO: proto toast "Photos only show inside your crews." (picker and crop not designed).
  - DONE: pop plus toast "New avatar. Your crews see it everywhere."
- **Motion**:
  - Pick: big circle `scale .85 → 1.06 (60%) → 1`, 420ms ease-out; the tapped tile `pop`.
  - Locked tile: `shake` 420ms.
  - Avatar keeps the sticker's idle wobble in chat and on the crew map.
- **States**:
  - Designed: CRITTER tab with 10 unlocked.
  - MISSING: INITIALS tab UI; PHOTO tab (library or camera permission, crop, moderation, upload progress or fail); zero critters found (new user: common guide form after first hatch? or fall back to initials); legendary gold-ring selected state; network error on save.
- **AI**: none (optional photo moderation classifier).
- **Realtime**: avatar change fans out to crew members' clients (chat, map, votes, idea-board faces).
- **OS**: Photos picker (PHPicker, no full library permission needed); camera optional. The avatar must be **rasterised to PNG** for OS surfaces: communication notifications (`INSendMessageIntent` sender image), Live Activities, widgets and the share sheet. These cannot animate.
- **Gates**: 4b-2 / 4e-2 "Icon styles, avatars: Free 2 / Pass+ ALL" conflicts with this screen, which shows no Pass+ lock on avatars. 4d-2 says "Your icons and avatar stay on while paused". Unresolved.

### 3n-5 App icon
- **Purpose**: choose an alternate home-screen icon. The 4 styles match the store icons; critter icons are earned on the road.
- **UI**:
  - ← EDIT PROFILE; pill "4 STYLES · 3 EARNED"; title APP ICON.
  - Home-screen preview: dotted dark panel with 2 blank neighbour icons and the big current icon (`data-cp=iconbig`) labelled "Critterpass".
  - STYLE row ("SAME AS THE STORE ICONS"), 4 tiles, with the selected tile outlined yellow:
    - FACE: yellow, big gecko face; Free.
    - PASSPORT: dark, gecko holding an orange passport; "In use".
    - STAMP: paper, pink ring stamp "HÀ NỘI", PASS+ tag; Pass+ (`data-cp=iconplus`).
    - STICKER: dark, sticker gecko wave; Free.
  - Appearance segmented control AUTO / LIGHT / DARK / TINTED, with 3 small previews (Light, Dark, Tinted; tinted = greyscale art).
  - "EARNED ON THE ROAD · 3 OF 6": TEMPLE (green, Temple Tokek), SARDI (blue sardine), HOME SET (orange, cp-001 turtle); locked silhouettes PON, GOLDEN (gold "?"), BALI SIX (striped crew colours).
  - Footer: "Styles come with Pass+. Critter icons are earned by being there, and none of them can be bought."
- **Data**:
  - AppIconCatalog{id, family style or earned, entitlement free / pass_plus / earned, unlock_rule, asset names per appearance}.
  - UserIconUnlock[].
  - Current icon: a device-local OS state, not server state.
- **Actions**:
  - Tap a free or unlocked icon: swap the preview (proto `iconPick`) and call the OS alternate-icon API.
  - Tap STAMP without Pass+: 4e-1 Paywall.
  - Tap a locked earned icon: shake plus "how to earn" toast.
  - Appearance: redraw previews in light, dark and tinted.
- **Motion**:
  - Preview swap: `scale .82 → 1.08 (60%) → 1`, 420ms ease-out, plus the iOS-like squash.
  - Big icon idle loop: `0:sx1 sy1; .05:sx1.14 sy.86 e=out; .1:sx.94 sy1.06; .16:sx1 sy1 e=back; 1:sx1 sy1`, dur 5000. That is a squash at 250ms, rebound at 500ms and settle at 800ms, then rest; repeats every 5s in the mock. In the app, play once per selection.
  - Tile `pop`; locked `shake`.
- **States**:
  - Designed: Pass+-less user with PASSPORT in use and STAMP locked. The header chip says 4 styles, which implies a Pass+ user.
  - MISSING:
    - Pass+ user (STAMP unlocked, tag removed).
    - Newly earned icon ("new" badge, celebration).
    - OS alternate icons unsupported (iPad or Android launcher quirks).
    - The iOS system alert "You have changed the icon for Critterpass" appears on every change and cannot be suppressed via public API.
    - Pass+ lapses while STAMP is in use: revert or keep? (4d-2 implies icons are lost on cancel and kept on pause.)
- **AI**: none.
- **Realtime**: none. The BALI SIX icon is a crew achievement, so it unlocks for all crew members at once.
- **OS**:
  - iOS `setAlternateIconName`; all icons must be **bundled in the binary** (no download).
  - Appearance: iOS 18+ dark and tinted, plus iOS 26 Liquid Glass "clear" modes via Icon Composer `.icon`. The user cannot force per-app appearance; the system follows the home-screen setting. **AUTO/LIGHT/DARK/TINTED can only be emulated by shipping forced-appearance variants as separate alternate icons.** That multiplies the asset count.
  - Android: `activity-alias` enable/disable. It can kill the task and remove pinned shortcuts on some launchers. Themed monochrome icons on Android 13+.
- **Gates**: STAMP is Pass+; FACE and STICKER are free; PASSPORT is the default. Earned icons are unlock-by-achievement ("none can be bought"), but 4d-2 lists "Icons: Sakura Pon and 11 more" as lost on cancel. **Contradiction.** 4b-2: free = 2 icon styles.

### 3n-6 Settings, more (lower half of Settings)
- **Purpose**: app prefs, help entry points, account.
- **UI**:
  - Collapsed nav bar: 44px, centred "SETTINGS" 15px, hairline.
  - APP card:
    - Music: "Gamelan lo-fi, follows your guide", live 4-bar equaliser (green) and ›.
    - Sound effects toggle ("Sticker slaps, stamps, pops").
    - Language and currency: "English · prices in S$ and local ›".
  - HELP AND FEEDBACK card (28px colour icon tiles):
    - Rate Critterpass (pink heart), "On the App Store", yellow star.
    - Send feedback (yellow chat), "Or shake your phone on any screen".
    - Suggest a feature (blue spark), "48 ideas to vote on · 3 of yours".
    - Help centre (green pin).
  - ACCOUNT card: Download my data ("Plans, photos and chat as a zip ›"); Sign out; Delete account (pink text).
  - Footer: 40px Tokek sticker wiggling above "CRITTERPASS 1.0 (214)" (Geist Mono).
- **Data**: settings summary strings; IdeaBoard{total_open, mine_count}; build version.
- **Actions**:
  - Rows route per Exits.
  - Rate: the caption for 3p-6 says open the App Store write-review page directly. The proto shows the system prompt instead.
  - Download: start an export job.
  - Sign out: confirm (not designed), then Splash.
  - Easter egg: tap Tokek 5 times to play his theme.
- **Motion**:
  - The header collapses from large title to inline title as you scroll past Offline.
  - Music bars: `tg-motion stagger=140 kf="0:sy.3;.5:sy1;1:sy.3" dur=900 origin="50% 100%"`. Each of the 4 bars is offset by 140ms and should follow the actual playing theme's amplitude, or at least its tempo.
  - Tokek `wiggle` 2400ms.
- **States**:
  - MISSING:
    - Sign-out confirm, especially for an **anonymous, unsaved pass**: sign-out loses data (3a anonymous-first).
    - Export in progress, ready or failed.
    - Music off (bars static).
    - Free user (idea counts still shown).
    - Widgets and "How much we ping" rows are absent though the prototype PARENT map places them here.
- **AI**: none.
- **Realtime**: none.
- **OS**: App Store review URL (`itms-apps://…?action=write-review`) and Android Play listing; email for the export link; audio.
- **Gates**: none.

### 3n-7 Sound
- **Purpose**: music themes (one per guide) and effects, quiet rules, haptics.
- **UI**:
  - ← SETTINGS; title SOUND with 5 yellow equaliser bars (26px) and a bobbing Tokek (cheer, 64px, `bob` 1800ms).
  - MUSIC card:
    - Play music toggle ("Each guide has a theme. It changes when you land.").
    - Volume slider: green fill 58%, − and + end labels, paper knob.
    - Horizontal theme carousel, 138×112 r18 cards: TOKEK "Gamelan lo-fi" (yellow, selected with double outline, live bars 14px); PON "Koto and rain" (orange); LUNDI "Slow sea shanty" (blue); more off-screen.
  - EFFECTS card: effects volume slider (yellow fill 80%); toggles Stickers and stamps ("The slap, the thud, the peel"), Critter voices ("A chirp when a guide pops up"), Quiet on the road ("Mutes everything 22:00–07:00 and inside temples").
  - Separate card: Haptics toggle ("Taps on stamps, holds and votes").
- **Data**: AudioPrefs{music_enabled, music_volume, theme_mode follow-guide or pinned theme_id, sfx_volume, sfx_stickers, critter_voices, quiet_on_road, haptics}; MusicTheme{guide_id, title, asset_url, loop points}.
- **Actions**:
  - Dragging a slider plays a sample at that level: a gamelan phrase for music, a sticker slap for effects.
  - Tapping a theme card crossfades to it. Proto toast "Playing: Tokek, gamelan lo-fi." Whether it pins the theme or only previews it is unclear.
  - Toggles persist.
- **Motion**: title and playing-card bars move with the music (stagger 140, 900ms); crossfade on theme change (duration not specified; suggest 600–800ms equal-power); Tokek `bob`.
- **States**:
  - MISSING: silent switch on (iOS mutes the ambient category and should show a hint); another app playing audio (duck vs mix); theme asset not downloaded or offline; theme for guest-guide cities; music off (carousel disabled).
- **AI**: none.
- **Realtime**: none.
- **OS**:
  - Audio session: **ambient + mixWithOthers**, so it respects the silent switch and does not stop the user's podcast. No background audio.
  - Core Haptics or UIFeedbackGenerator gated by the toggle.
  - Quiet on the road needs a **local-time window in the trip timezone** and a **"inside temples" geofence**: POI category place-of-worship with location while in foreground.
  - "Changes when you land" is driven by trip state and arrival detection.
- **Gates**: none shown.

### 3n-8 Language and currency
- **Purpose**: app language (the guide keeps local words), home currency, price display mode, formats.
- **UI**:
  - ← SETTINGS; title LANGUAGE AND CURRENCY.
  - APP LANGUAGE card: English ("Guides mix in a few local words", yellow check), 中文（简体）Chinese simplified, Bahasa Indonesia, 日本語 Japanese, "12 more ›". Proto: "Español, Português, Français, 한국어, ไทย, Tiếng Việt and six more"; 16 total.
  - CURRENCY card:
    - Home currency "SGD · from your home airport" with "S$ ›".
    - Show prices in: HOME / LOCAL / BOTH segmented (BOTH selected).
    - Sample price row with Tokek wiggle: "Rp 75.000 ≈ S$6.40 · Tirta Empul".
  - FORMATS: Time and distance "24-hour · km ›".
  - Footer: "Balances split in the crew's currency. Rates work offline."
- **Data**: Prefs{app_locale, home_currency ISO-4217 (default derived from home airport country), price_display, clock 12/24, distance km/mi}; FXRate snapshot {base, quote, rate, as_of}; sample Place price.
- **Actions**:
  - Pick a language: the screen redraws in place, and Tokek speaks one line in it. Proto: 中文 "早上好！凌晨 3:10 出发。", Bahasa "Selamat pagi! Berangkat jam 03:10.", 日本語 (Pon) "おはよう！3:10 に出発だよ。".
  - Flip HOME / LOCAL / BOTH: the sample price rewrites with an odometer roll, and **every price in the app follows it** (proto toasts: "Prices in S$ only." / "Prices in rupiah only." / "Rupiah with S$ next to it.").
  - Currency and formats open pickers (not designed).
- **Motion**: in-place redraw on language change (crossfade of text, no navigation); odometer roll on the sample (`tg-count`); Tokek `wiggle` 2400ms.
- **States**:
  - MISSING: language pack or TTS voice downloading; RTL layout if Arabic or Hebrew are among the "six more"; FX rate stale (show as-of) or never fetched offline; currency picker; home currency differs from crew currency (explanatory state).
- **AI**: the guide LLM output language follows app_locale while persona injects local words. TTS voice per guide × language is needed for the sample line (pre-renderable).
- **Realtime**: none.
- **OS**: in-app runtime locale switching. iOS per-app language lives in system Settings and relaunches the app; the design wants an in-place redraw. Locale-aware number, currency and date formatting.
- **Gates**: none.

### 3n-9 Delete account (pre-flight)
- **Purpose**: informed consent. What goes, what the crew keeps, money owed, and subscription caveat.
- **UI**:
  - ← SETTINGS; title DELETE YOUR ACCOUNT?; Tokek thinking (72px, `kf 0:r-3 ty0; .5:r3 ty2; 1:r-3 ty0`, dur 3400).
  - Subtitle "Here's what goes with you, and what the crew keeps."
  - Card, GOES (pink bullets): "Your pass, your 8 critters and your stamps"; "Your profile, uploads and chat messages".
  - Card, THE CREW KEEPS (green bullets): "Plans you helped make, shown as 'former member'"; "Expenses you added, so Balances still add up".
  - Orange card: "YOU'RE OWED $186.40 / Settle up first, or the Bali Six keep it." with dark SETTLE UP pill.
  - Lock note: "Pass+ is billed by the App Store. Deleting doesn't cancel it, so cancel it there too. Manage subscription ›".
  - Pink CONTINUE button; "Download my data first" link.
- **Data**: counts (critters, stamps); per-crew net balance for the user (owed to, or owes); subscription source and status (App Store / Play / web or gift); crew names.
- **Actions**:
  - SETTLE UP → 3i Settle up, then return here.
  - Manage subscription → OS subscriptions sheet.
  - Download first → export job.
  - CONTINUE → 3n-10 sheet.
- **Motion**: Tokek rocks (3400ms loop). The two lists fill in one line at a time (suggest `reveal` 460ms E, stagger around 80ms). If money is owed, the orange card slides up last and nudges once (suggest translateY 12→0 then a translateX nudge).
- **States**:
  - Designed: owed money, Pass+.
  - MISSING:
    - **User owes money** (block? warn?).
    - Multiple crews with balances.
    - User is **organiser of an active or upcoming trip** (ownership transfer).
    - Sole member of a crew.
    - **Deletion during an active trip**.
    - Purchased Trip Boost with outstanding split IOUs.
    - Play-billed subscription (Android copy).
    - Anonymous (never-saved) account (instant delete, no email).
    - Loading of balances.
- **AI**: none.
- **Realtime**: none.
- **OS**: `AppStore.showManageSubscriptions(in:)`; Play subscription deep link.
- **Gates**: n/a.

### 3n-10 Hold to delete (sheet)
- **Purpose**: final friction plus optional exit reason.
- **UI**:
  - Dimmed list behind (rgba(8,6,18,.62)).
  - Bottom sheet r32 with grabber: LAST CHECK (pink), title HOLD TO DELETE, "Your account is closed now and erased after 30 days. Sign in before Oct 26 and everything comes back."
  - "WHY ARE YOU LEAVING? OPTIONAL" chips (single-select look): TRIP'S OVER, TOO MANY PINGS (selected, paper), CREW MOVED APPS, PRIVACY, SOMETHING ELSE.
  - Hold ring 86px: conic `#ff5fa8` progress over `#2c2750`, inner 70px "HOLD"; beside it "HOLD FOR 3 SECONDS".
  - Critter stickers (30px) peeling: opacity 1 / .7 / .4 with rotation −4 / 4 / 12°; label "peeling off…".
  - "Keep my account" link.
- **Data**: purge date = now + 30 days (Oct 26 from Sep 26); reason enum.
- **Actions**:
  - Press and hold 3000ms to fire deletion, then 3n-11.
  - Releasing early drains the ring (encounter `holdSetup` drains in 450ms) and the critters slap back on.
  - Reason is optional and never blocks.
  - Keep my account → back 2, with toast.
- **Motion**:
  - Sheet rises (540ms E; background scales to .93).
  - Ring fills linearly with hold time; the ring presses to scale .94 (150ms) on touch-down.
  - Critters peel one by one with a soft rip SFX, keyed to progress thresholds (about 1/n each).
  - Early release slaps them back (slap SFX, haptic).
  - Completion: heavy haptic.
- **States**:
  - MISSING: "Other" free-text for SOMETHING ELSE; request failure or offline (must not show 3n-11); accessibility alternative to long-press (VoiceOver: double-tap-and-hold or an explicit confirm button); "Reduce Motion".
- **AI**: none.
- **Realtime**: server marks the account closed immediately. Crew clients should render the user as "former member", either immediately or at purge (unclear).
- **OS**: haptics (continuous ramp via Core Haptics), SFX.
- **Gates**: n/a.

### 3n-11 Account closed
- **Purpose**: confirmation with an undo path; emotional "exit stamp".
- **UI**:
  - Paper page (`#f4efe4` with faint radial guilloche lines); header "DEPARTURES · DÉPARTS" / "LAST PAGE".
  - Tokek waving (170px, `float` 4200ms).
  - Blue rectangular stamp rotated −6°, 270×120 with double inset border `#4f86ff`: "EXIT · SORTIE / SEE YOU / 26 SEP 2026".
  - Title CLOSED FOR 30 DAYS. Body: "Nothing is erased until Oct 26. Sign in before then and your pass, critters and crews come back as they were. We emailed this to w•••@gmail.com."
  - Row of the 8 critters (34px) at opacity 1.0→0.3; Caveat line "Your 8 critters will wait by the door." (`#c4623e`).
  - Dark button "UNDO, KEEP MY ACCOUNT" (yellow text); "Close" link.
- **Data**: closed_at, purge_at, masked email, critter list.
- **Actions**:
  - UNDO: restore, then the page re-stamps with ENTRY, then Home.
  - Close: signed-out Splash.
- **Motion**:
  - EXIT stamp lands (scale-in slam like 3p-3: s2.2 o0 → .94 → 1.04 → 1) and the page shakes once (`thud`).
  - Tokek waves continuously.
  - The critter row fades a little each second and **stops at half opacity** ("waiting, not gone").
  - UNDO: ENTRY stamp over EXIT, then tab-transition to Home.
- **States**:
  - MISSING:
    - Undo failure.
    - The user has no email: phone-only SMS sign-in, so how is confirmation delivered? SMS?
    - Signed back in within 30 days via the auth flow (restore interstitial not designed).
    - Signing in after purge (fresh account messaging).
    - Relaunching the app while closed (must land on a restore-or-close screen, not Home).
- **AI**: none.
- **Realtime**: restore re-activates crew memberships; crews see the name again.
- **OS**: sessions and tokens revoked on all devices; push tokens disabled; Live Activities ended; widgets cleared; Keychain session wiped.
- **Gates**: n/a.

### 3o-1 Crew plans (browse)
- **Purpose**: browse published itineraries for a destination, filtered and ranked by fit with my crew.
- **UI**:
  - ← KYOTO; pill "1,240 SHARED"; title CREW PLANS; intro "Real Kyoto trips, shared by the crews who took them. Copy a whole one, or just the good days."
  - Horizontal filter chips (yellow = on): 7–8 DAYS, APRIL, CREWS OF 5–6; off (`#1f1b38`): UNDER $1,500, SUNRISE CHASERS (a taste tag).
  - Hero card (orange `#ff9a4d`, halftone dots, r28):
    - Chip "PON'S PICK FOR YOU"; ★ 4.8.
    - Title "SLOW KYOTO, FAST FOOD"; "The Osaka Four · 8 days · April 2025".
    - Day chips 1–8.
    - Stat chips "$1,240 EACH", "91% YOUR TASTE", "212 COPIES".
    - Footer with Sakura Pon sticker (tanuki pink form): "THEY FOUND SAKURA PON ON DAY 2".
  - Compact rows: "TEMPLES BEFORE 8AM ★4.6 / Mia and three friends · 7 days · Nov 2025 · $1,560 each"; "KYOTO ON A BUDGET ★4.4 / The Hostel Crew · 6 days · Jan 2026 · $780 each".
- **Data**:
  - SharedPlan{title, crew_display_name (named or anonymised), days_count, month_year, crew_size, cost_per_person (rounded, optional), rating_avg, rating_count, copies_count, taste_tags[], critter_highlights[], day summaries}.
  - Match score vs **the crew's** taste chips.
  - Destination total count.
- **Actions**:
  - Toggle chips: the list re-sorts or filters.
  - Tap a card: 3o-2 (zoom). Proto toasts for the other cards: "Mia's crew did Kiyomizu at 6 every morning. Brutal, apparently."
  - Tapping a day chip on the card may deep-link to that day (not specified).
- **Motion**:
  - Filters slide in as chips (from the right, staggered).
  - The list re-sorts with a shuffle (FLIP reorder with a slight rotation; suggest 360–420ms E).
  - Card open: shared-element zoom (560ms).
- **States**:
  - Designed: rich corpus.
  - MISSING:
    - **Empty or cold start** (destination with 0 shared plans; at launch every destination starts at 0).
    - No results for the filters (clear-filters CTA).
    - Loading and pagination.
    - Offline (cached?).
    - Guest-guide city (no live guide, so "Pon's pick" copy changes).
    - User not in a crew or planning solo (match against personal taste).
    - Reporting or hiding a plan.
- **AI**:
  - "Pon's pick" = top match by taste. The caption says it is **not most-copied**, so ranking is personalised.
  - Plan tagging (taste tags, pace) can be LLM-derived at publish time.
  - Highlight line derived from trip events (critter found day N).
- **Realtime**: none (counts eventually consistent).
- **OS**: none.
- **Gates**: none shown (browse free). "Sponsored picks shown" for free (4b-2) might mean sponsored plans here. Unknown.

### 3o-2 Shared plan (detail)
- **Purpose**: evaluate one plan and copy it whole or per day into our draft.
- **UI**:
  - Orange hero (halftone): ← CREW PLANS; "♡ SAVE" dark pill.
  - Eyebrow "THE OSAKA FOUR · APRIL 2025"; title "SLOW KYOTO, FAST FOOD".
  - Chips 8 DAYS / $1,240 EACH / ★ 4.8 · 212 CREWS.
  - Pon waving sticker (116px, `bob` 3000ms).
  - Caveat note from Pon: "Four of these days overlap with my draft. Day 3 alone is worth it."
  - DAY BY DAY with hint "+ ADDS ONE DAY". Rows: orange number tile, title, and "weekday · detail", with a + (`data-cp=sday`):
    1. NISHIKI BEFORE LUNCH, "FRI · Ryokan in Higashiyama"
    2. INARI AT 6AM, "SAT · Then Tōfuku-ji while it's empty"
    3. RAMEN, THREE WAYS, "SUN · Kōji, Menbaka, a Gion stall"
  - "+ 5 MORE DAYS" expander.
  - WHAT THEY'D CHANGE: quote card with initial avatar K, "Skip Nara on a weekend. Go on a Tuesday or don't go.", "Kenji · pace 4 of 5".
  - Sticky bottom: yellow "COPY INTO OUR TRIP", outline "DAY 3 ONLY".
- **Data**: SharedPlan + SharedPlanDay[]{index, title, weekday, summary, items (place refs, times)}; retrospective tips {author first name or initial, text, pace 1–5}; my trip's current draft and must-dos (for overlap and fit).
- **Actions**:
  - ♡ SAVE: bookmark.
  - + on a day: drop that day into Pon's draft. Pon **checks it against must-dos before anything moves**, then toast plus a "+1" float.
  - COPY INTO OUR TRIP: merge the whole plan, then 3c-9 Pon's draft with toast "Pon merged four days into your draft. Only you can see it."
  - DAY 3 ONLY: merges the AI-recommended single day.
  - + 5 MORE DAYS expands.
- **Motion**:
  - Enter: the poster from the list grows into the page (zoom shared element 560ms, clip radius 22→54).
  - + tap: a small **paper-plane arc** from the row to Pon or the draft (suggest a 600ms bezier path plus fade), `pop` on the row, "+1" float 800ms.
  - Pon `bob` 3000ms.
- **States**:
  - MISSING:
    - **No active draft for this destination** (copy creates a new trip? prompts to pitch?).
    - User is not the organiser (the draft is organiser-only per 3c; toast says "Only you can see it").
    - Fit-check conflict (day doesn't fit dates or must-dos, so a diff or reject UI; 3c-12 redraft diff reuse).
    - Season mismatch (an April plan copied into November).
    - Redraft-limit interaction (free = 3 redrafts per trip: does a copy count?).
    - Loading of Pon's note (streaming?).
    - Plan removed or unpublished.
    - Saved state.
- **AI**:
  - (a) Overlap note. LLM input: shared-plan days, current draft, must-dos, crew taste. Output: {overlap_days count, best_day index, one-line note in guide voice}. Cached per (plan, draft version).
  - (b) Merge or fit-check: the guide's itinerary engine (LLM plus constraints: dates, opening hours, travel time, must-dos, budget). Output: a proposed diff to the draft, a background job with visible progress, reusing 3c-8 / 3c-12 infrastructure.
- **Realtime**: the draft update is visible only to the organiser until published (3c rules).
- **OS**: haptic on +.
- **Gates**: copy may consume redrafts (free 3 per trip); undecided.

### 3o-3 Rate the trip
- **Purpose**: quick post-trip place ratings and optional anonymous tips for future crews.
- **UI**:
  - ← RECAP; counter "3 OF 11" (yellow); title RATE THE TRIP with Tokek cheer (68px).
  - Intro "One tap a place. Your tips show up for crews planning Bali, and nothing else about you does."
  - Card stack (r28, second card peeking below): photo area (placeholder "photo · Tirta Empul", green stripes), name TIRTA EMPUL, DAY 3 chip, memory line "The spring temple. You found Temple Tokek here."
  - 3 buttons: LOVED IT (pink heart), FINE (check), SKIP IT (✕).
  - Tip input "ONE TIP FOR THE NEXT CREW" (filled example "Get there before 8. The tour buses start at 9.").
  - Outline button "SHARE THE PLAN TOO".
- **Data**: VisitedPlace[] for the trip (11): place_id, day, photo (from the crew album), memory line (trip events: critter found, etc.). PlaceRating{verdict}; PlaceTip{text}.
- **Actions**:
  - Tap a verdict: the card flings and the next card deals.
  - Typing a tip attaches it to the current place (optional).
  - After the last card: toast "All rated. Your tips are live for crews planning Bali."
  - SHARE THE PLAN TOO → 3o-4 sheet.
- **Motion** (proto `rateNext`):
  - LOVED: card `translateY(-440px) rotate(-6deg)` to opacity 0, with a ♥ float.
  - SKIP: `translateX(-440px) rotate(-14deg)`.
  - FINE: `translateX(+440px) rotate(14deg)`.
  - All exits 380ms cubic-bezier(.5,0,.8,.4).
  - Next card: from `translateY(26px) scale(.94) opacity 0` to rest, 420ms cubic-bezier(.3,1.4,.5,1) (overshoot).
  - The counter ticks. Tapped button `pop`.
  - A swipe gesture equivalent is implied ("card on a small stack") but not specified.
- **States**:
  - MISSING: no photos for a place (fallback art); partially rated then leave (resume later?); all rated (end card not designed, only a toast); offline (queue); tip moderation rejected; editing a past rating.
- **AI**: memory line generated from trip data (templated or LLM); optional tip suggestion; tip moderation classifier (PII, toxicity, spam).
- **Realtime**: none. Aggregates later feed destination data and place-level social proof. **Where tips surface is not designed.**
- **OS**: haptics on verdict.
- **Gates**: free.

### 3o-4 Share the plan (publish sheet)
- **Purpose**: publish the crew's plan to Crew plans, with granular control over what leaves the crew.
- **UI**:
  - Sheet over the trip plan; title SHARE THE PLAN.
  - Live preview card (yellow halftone, r24): "HOW OTHER CREWS WILL SEE IT", title "EIGHT DAYS, ONE VOLCANO", "A crew of six · 8 days · October 2026", Tokek cheer sticker, chips 8 DAYS / 12 PHOTOS / 3 OF 4 FORMS.
  - WHAT OTHER CREWS SEE toggles:
    - Our names: OFF ("Off: you show up as 'a crew of six'").
    - What it cost: ON ("Per person, rounded to $10").
    - 12 best photos: ON ("Picked by Tokek, faces blurred").
    - The chat: locked "Private" ("Never leaves the crew").
  - Yellow "PUBLISH TO CREW PLANS"; link "Copy a read-only link instead".
- **Data**: Trip → SharedPlan projection: generated title, crew_size, days, month, cost_per_person_rounded, curated photo_ids (blurred derivatives), critter forms found (3 of 4), toggles.
- **Actions**:
  - Toggles rewrite the preview live.
  - PUBLISH: creates the SharedPlan, dismisses, toast "Published. Crews planning Bali will see it."
  - Copy link: generates an unlisted read-only URL (toast "Read-only link copied.").
- **Motion**: the preview card rewrites itself per toggle (text crossfade and chip in/out). Publish: the card **folds into an envelope and flies off the top** (fold 2–3 panels via perspective rotateX, then translateY −900 with rotation; suggest about 900ms total). Sheet 540ms.
- **States**:
  - MISSING:
    - **Consent of other crew members** (who may publish? notify the crew? veto?).
    - Already published (edit, unpublish, stats: copies and ratings).
    - Photos still processing (curation or blur job) and blur failure.
    - Trip not finished (can you share mid-trip or before? Entry from Trip plan SHARE suggests any time).
    - Photo count below 12.
    - Publishing error or offline.
    - Read-only link web viewer (web page not designed; marketing site has an Invite landing only).
    - Link revocation.
- **AI**:
  - Title generation (LLM from trip highlights: "Eight days, one volcano").
  - "12 best photos picked by Tokek": a vision-model ranking of the crew album (quality, variety, landmarks, dedupe).
  - **Face detection and blur** (on-device Vision or server; must be conservative).
  - Taste and pace tagging for 3o-1 matching.
  - PII scrub of day notes (booking refs, private addresses, phone numbers).
- **Realtime**: the crew may see "Winston published our plan" in chat (not designed).
- **OS**: clipboard; share sheet (for the link, arguably).
- **Gates**: none shown.

### 3p-1 Help and feedback (hub)
- **Purpose**: one hub for bugs, feedback, ideas, rating, help articles.
- **UI**:
  - ← SETTINGS; title HELP AND FEEDBACK.
  - Tokek pointing (56px, `bob` 2400ms) beside a speech card in Caveat yellow: "Something broke, or something's missing? Tell me. I pass it straight to the humans."
  - 2×2 tiles (r24, 30px doodle icons):
    - REPORT A PROBLEM: pink, flame, "Or shake any screen".
    - SEND FEEDBACK: yellow, chat, "What you love, what bugs you".
    - SUGGEST A FEATURE: blue, spark, "Vote on 48 ideas".
    - RATE THE APP: green, heart, "Takes ten seconds".
  - HELP CENTRE: search field (pin icon, placeholder "Refunds, offline maps, splitting…"); article rows "Splitting a Trip Boost ›", "Why can't I buy critters? ›".
  - Footer: "A human replies by email within two days."
- **Data**: HelpArticle[] (title, slug, locale, popularity or context relevance); idea count.
- **Actions**:
  - Tiles route (bug and feedback both open 3p-2; bug presumably preselects a "problem" mode).
  - Search opens results (not designed).
  - Article opens a reader (not designed; proto toasts; "Why can't I buy critters?" → "Because you have to be there. That's the whole point.").
- **Motion**: Tokek points while his line types out (`tg-type`); tiles lift slightly on press (translateY −2 and shadow). Shake anywhere opens REPORT A PROBLEM with a screenshot attached.
- **States**:
  - MISSING: search results, no results (fallback "ask a human"), article reader, offline help (cached articles?), localisation of articles (16 languages).
- **AI**: none designed. RAG answers in search would be a natural extension; not in the design.
- **Realtime**: none.
- **OS**: shake detection (global).
- **Gates**: none.

### 3p-2 Send feedback
- **Purpose**: structured feedback with context attached.
- **UI**:
  - ← HELP; pill "TO THE HUMANS"; title SEND FEEDBACK.
  - HOW'S IT GOING? 5 critter mood buttons (56px circles): GRR (axolotl), MEH (puffin), OKAY (sardine), GOOD (Tokek, selected: yellow fill and ring, colour sticker), LOVE IT (tanuki). Unselected are greyed silhouettes (`locked="#6f698c"`).
  - ABOUT chips: PLANNING, MONEY, GUIDE CHAT (selected), CRITTERS, OTHER.
  - Textarea (r20, min-h 104) with the example note typing itself.
  - Attachments: 60×78 screenshot thumb "shot" with × badge; dashed + tile.
  - Device info toggle ON: "iOS 20.1 · v1.0 (214)". The OS version is a placeholder; real naming is iOS 26/27.
  - Yellow SEND IT with a periodic light sweep.
- **Data**: Feedback draft {mood 1–5, category, text, attachments[], include_device_info, context: last screen id, trip id, app version, OS, device model, locale}.
- **Actions**:
  - Pick mood: the critter hops and the others go grey.
  - Pick category chip.
  - Type.
  - × removes the screenshot.
  - + adds an image (photos picker).
  - Toggle device info.
  - SEND IT → 3p-3.
- **Motion**:
  - Selected critter `hop` 2000ms.
  - Example note typewriter (`tg-type` speed 45ms/char, hold 4000). This is a demo; in-app it should be placeholder text.
  - × peels the screenshot like a sticker (rotate plus lift plus fade).
  - SEND IT: sweep `kf 0:tx-140 e=io; .3:tx420; 1:tx420`, dur 3600 (a 60px skewX(−20°) white gradient crosses in about 1080ms every 3.6s).
  - On send: the note folds and flies off the top (fold 380ms, then burst into 3p-3).
- **States**:
  - MISSING: empty text validation (is mood alone enough?); sending progress; offline (queue into the outbox, like 3k-4 "sends when you're back"); upload failure; attachment too large; report-a-problem variant (maybe forces a bug category and log capture).
- **AI**: optional triage (classify, dedupe, summarise). Not user-visible except maybe the shortened note on 3p-3.
- **Realtime**: none.
- **OS**:
  - **Shake gesture**: iOS `motionEnded(.motionShake)`; conflicts with system Shake-to-Undo inside text fields. Android accelerometer detector.
  - In-app **screenshot capture** of the current view hierarchy before presenting (not a system screenshot). Must exclude secure or private content.
  - PHPicker; device info APIs.
- **Gates**: none.

### 3p-3 Feedback sent
- **Purpose**: confirmation and closed-loop promise.
- **UI**:
  - Paper top half (guilloche), header "POST · COURRIER" / "#CP-2291".
  - Pinned note card (rotated about −3°, pink pin): "GUIDE CHAT · GOOD", Caveat "Tokek suggested the boat on a rainy morning. Could the guide check the forecast first?" (a shortened version of the typed note), screenshot placeholder strip.
  - Pink round stamp "HQ · POST / RECEIVED / 26 SEP 2026".
  - Tokek cheer (104px, `hop`).
  - Dark lower half: title PINNED TO THE BOARD; "Thanks, Winston. A human reads every one of these. If we need more we'll email you, and Tokek will tell you when it's fixed."
  - Paper button BACK TO SETTINGS; link "See what others asked for ›".
- **Data**: Feedback{ticket_no, category, mood, text summary, received_at}.
- **Actions**: BACK TO SETTINGS → 3n-6; the link → 3p-4. Later: Inbox card from Tokek linking this note when the fix ships.
- **Motion**:
  - The note drops onto the page and the pink pin pushes in (`drop` 380ms cubic-bezier(.3,1.5,.5,1)).
  - RECEIVED stamp: `kf 0:s2.2 o0 e=in; .05:s.94 o1; .08:s1.04; .11:s1`, dur 9000, delay 500. In real time: slam from 2.2× to .94 at 450ms, rebound 1.04 at 720ms, settle at 990ms. Play once in the app (the mock loops).
  - Thud plus haptic, with confetti `tg-confetti count=50 origin (.5,.4)`.
  - Tokek hops once.
- **States**:
  - MISSING: queued-offline variant ("will post when you're back"); follow-up email (not designed); the "fixed" Inbox card itself (not designed here).
- **AI**: the displayed note is condensed from the typed text. Truncation or LLM summary is unspecified.
- **Realtime**: none.
- **OS**: haptic, SFX. Later push when fixed.
- **Gates**: none.
- **Ambiguity**: "PINNED TO THE BOARD" suggests feedback becomes visible on the public idea board. Probably metaphorical (internal board).

### 3p-4 Idea board
- **Purpose**: public feature voting, mirroring crew-vote mechanics.
- **UI**:
  - ← HELP; pill "3 VOTES LEFT"; title WHAT'S NEXT?
  - Segmented TOP / NEW / SHIPPED.
  - Idea rows (r20 `#1f1b38`). Each has a vote box 52×58 r14: yellow fill = my vote (▲ plus count), outline = not voted. Title in Archivo caps; status chip PLANNED (blue) / BUILDING (orange) / LOOKING AT IT (paper).
  - Row 1: PACKING LISTS PER CREW 412, PLANNED, crew faces M J with "Maya and Jordan too".
  - SPLIT RECEIPTS BY ITEM 356, BUILDING.
  - LEAVE-BY ALARMS ON THE WATCH 288, LOOKING AT IT (not voted).
  - A GUIDE FOR MARRAKECH 241, PLANNED, "Tokek: I know a guy".
  - OFFLINE VOICE FOR THE GUIDE 198, LOOKING AT IT (not voted).
  - Sticky yellow "+ SUGGEST AN IDEA".
- **Data**: Idea{id, title, status, vote_count, team_note (in guide voice), voters_in_my_crews[]}; my votes; vote budget (3 left while 3 are used, so 6 total?).
- **Actions**:
  - Tap the vote box to toggle my vote (change any time; proto toast "Vote counted. You can change it any time.").
  - Switch tabs.
  - Suggest → 3p-5.
  - Tapping a row for detail is not designed.
- **Motion**:
  - Vote: the box fills yellow with a small stamp (scale slam about 300ms, `pop`, count odometer +1).
  - Ideas the crew voted for show faces.
  - When one ships it slides to SHIPPED with a confetti pop, and every voter gets a note from Tokek.
- **States**:
  - MISSING: out of votes (what happens on tap: shake plus explain?); NEW and SHIPPED tabs; idea detail or description; empty NEW; loading; offline (vote queue?); declined or merged status; idea posted by me (badge; settings says "3 of yours").
- **AI**: none (team notes are human-authored in guide voice).
- **Realtime**: counts can be eventually consistent. Crew faces require a crew-graph join (only crewmates, never strangers).
- **OS**: haptic on vote. Push or Inbox when a voted idea ships.
- **Gates**: none.

### 3p-5 Suggest an idea (sheet with duplicate detection)
- **Purpose**: capture new ideas while funnelling duplicates into votes.
- **UI**:
  - Sheet over the dimmed board: "NEW IDEA" (blue), title SUGGEST AN IDEA.
  - Field "IN A FEW WORDS": "Shared packing list".
  - Blue match card: Tokek pointing (`wiggle` 1800ms) with Caveat "Sounds like this one. Vote for it and it gets there faster." Nested dark card "PACKING LISTS PER CREW / 412 votes · Planned" with yellow "VOTE ▲".
  - Field "WHAT WOULD IT DO? OPTIONAL" (placeholder "One list the whole crew can tick off…").
  - Outline "MINE'S DIFFERENT, POST IT".
- **Data**: query text, candidate matches (idea, similarity), new idea draft.
- **Actions**:
  - Typing: the board behind filters to matches, and when one is close Tokek slides in with it.
  - VOTE: the sheet closes and that card is stamped on the board (toast "Voted for Packing lists per crew. That makes 413.").
  - MINE'S DIFFERENT: posts as NEW (toast "Posted under NEW. Tokek will tell you if it moves.").
- **Motion**: sheet 540ms; the match card slides in from the side with Tokek (suggest 420ms back-ease); the board behind live-filters (FLIP collapse); vote stamp on dismiss.
- **States**:
  - MISSING: no match; multiple matches; typing debounce and loading; post validation (min length, profanity); no votes left when voting on a duplicate; moderation queue ("under review") vs instant publish; posted in another language (multilingual matching).
- **AI**: **semantic duplicate detection**. Embeddings of the title and description, with ANN search over ideas (multilingual model, since 16 app languages), a similarity threshold, and top-k. Optional LLM rerank. Synchronous API with a debounce of about 300ms.
- **Realtime**: none.
- **OS**: keyboard.
- **Gates**: none.

### 3p-6 Rate the app (system prompt on Recap)
- **Purpose**: App Store rating at a high-delight moment, under strict rules.
- **UI**: the 3m-1 Recap page dimmed behind a **system** SKStoreReview alert (app icon, "Enjoying Critterpass?", "Tap a star to rate it on the App Store.", 5 stars, "Not Now"). Tokek wave sticker (104px) hopping behind the alert's top edge.
- **Data**: RatingPromptState{last_prompt_at, count_365d (client estimate), last_error_at, last_paywall_at, trip_outcome_ok}.
- **Actions**: stars or Not Now are system-handled. The proto toast "Thanks. That helps the next crew find us." after a star tap is **not implementable**: StoreKit returns no callback and no signal about display or rating.
- **Motion**: Tokek hops up behind the sheet and waves (`hop` 2600ms). Timing: right after the recap story finishes playing.
- **Rules** (caption):
  - Only after a trip that ended well.
  - Never during a trip, after an error, or after a paywall.
  - At most the system's 3 per year.
  - The Settings row opens the App Store review page directly (write-review URL; no quota).
- **States**:
  - MISSING: the system suppressing the prompt (no display, so Tokek must not hop at nothing; tie the animation to the recap, not the prompt); Android Play In-App Review flow (different UI, opaque quota); sequencing with the 3o-3 "Rate the trip" toast (also on Recap at +1.6s) and 4c-2 Free boost ending (also surfaced on Recap).
- **AI**: none.
- **Realtime**: none.
- **OS**: StoreKit `AppStore.requestReview(in:)`; Android `ReviewManager`.
- **Gates**: n/a.

---

## 3. Feature list

| # | Feature | Description | Screens | Size | Justification | Depends on |
|---|---|---|---|---|---|---|
| F1 | Profile page | Passport-style profile: stats, stamps (upcoming stamp auto-stamps on arrival), taste chips, crews list, MRZ footer | 3n-1 | M | Aggregates across trips, critters and crews; bespoke motion (count-up, stamp thuds, eye tracking) | 3a taste quiz, 3l critters, 3g crews, 3k arrival detection, 4 entitlements |
| F2 | Edit profile | In-place fields (name, unique username, home airport, spoken languages); crew-visible scope | 3n-3 | S | CRUD plus username availability; reuses 3a airport search | 3a airport search, auth |
| F3 | Avatar system | Initials, critter sticker (from owned forms, rarity rings) or crew-only photo. Live previews. Rasterised avatar variants for OS surfaces | 3n-4 (+ every avatar render app-wide) | L | Procedural sticker renderer in native plus PNG render pipeline plus photo ACL plus fan-out to all crews | 3l ownership, doodle renderer port, media storage |
| F4 | Alternate app icons | 4 styles (1 Pass+), appearance previews, 6 earned critter or crew icons with unlock rules; paywall hook | 3n-5, 4e-3 | L | Asset pipeline (styles × appearances × earned), OS quirks (alert, bundle-only, Android alias), unlock service, entitlement | 4 entitlements, 3l achievements, asset design |
| F5 | Settings framework | Grouped settings with synced vs device-local prefs; guide chattiness (voice sample), talk out loud, notifications, privacy (location mode, email import, budget privacy), offline pack status | 3n-2, 3n-6 | M | Many toggles, but each maps to other slices' behaviour; permission-denied states | 3j guide, 5b notifications, 3h email import, 3k offline packs, 3c budget |
| F6 | Sound and music | Per-guide music themes (crossfade, follows landing), music and SFX volumes with live samples, SFX categories, critter voices, quiet hours plus temple geofence, haptics gate | 3n-7, 3n-6 | L | Audio engine plus licensed or commissioned themes plus contextual muting (time zone plus POI geofence) plus a global SFX/haptic bus | 3k trip state, place POI data, 3l arrival |
| F7 | Language, currency and formats | 16 app languages with in-place switch plus guide sample line; home currency (from airport); HOME/LOCAL/BOTH price mode applied app-wide; offline FX; 12/24h and km/mi | 3n-8 | XL | Runtime localisation of the whole app plus LLM output language plus TTS voices per guide per language plus a global money-formatting layer plus offline FX | All price-bearing slices (3d, 3i, 3c), 3j TTS/LLM |
| F8 | Data export | Async zip of plans, photos and chat, emailed link | 3n-6, 3n-9 | M | Background job over large media, signed expiring URL, GDPR/CCPA | Storage, email |
| F9 | Account deletion with 30-day undo | Pre-flight (what goes and what stays, balances owed, subscription caveat), hold-to-confirm, soft-close, email, restore on sign-in, purge job, anonymisation to "former member" | 3n-9, 3n-10, 3n-11 | L | Cross-domain data semantics (expenses, plans, chat, photos, critters), auth revocation (SIWA revoke), restore path, legal | 3i balances, 3g crews, auth (3a), 4 billing |
| F10 | Sign out | Sign out with anonymous-account safeguard | 3n-6 | S | Simple, but must block or warn for unsaved anonymous passes | 3a auth |
| F11 | Crew plans browse | Destination-scoped corpus, filters (days, month, crew size, budget, taste), taste-match ranking, "guide's pick" | 3o-1 | L | Search and ranking over structured plans; taste-match scoring; cold-start | F14 corpus, 3a taste, 3d destination |
| F12 | Shared plan detail and copy | Day list, save, retrospective tips, guide overlap note (LLM), copy whole, best day or single day into the draft via fit-check | 3o-2 | L | Merge semantics plus LLM or constraint fit-check plus diff; reuses the 3c draft engine | 3c draft, must-dos, redraft job infrastructure |
| F13 | Rate the trip | Card-stack verdicts per visited place, optional anonymous tip, progress, entry from Recap toast | 3o-3 | M | Simple data, but needs a visited-place list, album photos, moderation of tips | 3m recap and photos, 3e plan, places |
| F14 | Publish plan with privacy controls | Live preview, toggles (names, cost rounded, curated blurred photos, chat never), AI title, publish or unlisted read-only link, envelope animation | 3o-4 | XL | Photo curation plus face blur plus PII scrub plus consent model plus projection pipeline plus a web viewer for links | 3e plan, 3m album, 3i costs, web site |
| F15 | Help hub and help centre | Hub tiles, guide line, article search and reader (CMS, localised) | 3p-1 | M | CMS plus search plus localisation; reader not designed | CMS, F7 |
| F16 | Feedback and shake-to-report | Mood, category, text, auto-screenshot, attachments, device info; ticket number; offline queue; close-the-loop "fixed" Inbox card | 3p-2, 3p-3 | L | Global shake plus in-app snapshot plus support-tool integration plus release linkage plus Inbox or push | 3b Inbox, 5b push, 3k outbox |
| F17 | Idea board | Top, New, Shipped; per-user vote budget; toggle votes; status chips; crewmate faces; team notes; shipped fan-out notes | 3p-4 | M | CRUD plus counters plus crew-graph join plus admin statuses | 3g crews, 3b Inbox, admin |
| F18 | Suggest idea with duplicate detection | Live semantic matching while typing; vote-instead path; post as NEW | 3p-5 | M | Embeddings (multilingual) plus ANN plus debounce plus moderation | F17, embeddings infra |
| F19 | Rating prompt rules | Eligibility engine (trip ended well, not during trip, not after error or paywall), placement after the recap story; Settings direct link | 3p-6, 3n-6 | S | Client rules plus server trip-outcome flag; OS limits | 3m recap, error telemetry, 4 paywall events |
| F20 | Back-office (implied) | Admin for idea statuses and team notes, feedback triage, help articles, shared-plan and tip moderation | none designed | M | Required to operate F13–F18 | All above |

---

## 4. Data model contributions

**User and Profile** (extends 3a):
- User{id, display_name, username (unique ci, reserved list), home_city, home_airport_iata, spoken_languages[] (BCP-47), passport_no (e.g. CP0427, human-readable), member_since, status (active | closed | purged), closed_at, purge_at}.
- Avatar{user_id, type: initials | critter | photo, initials_bg, critter_form_id → CritterFormOwnership, photo_asset_id, rendered_png_urls{sizes}, updated_at}.
- Privacy:
  - Crewmates see name, avatar and home airport only.
  - The photo avatar is **crew-scoped**: signed URLs are issued only to co-members. Non-crew surfaces (idea-board faces are crewmates only; shared plans) fall back to initials or critter.

**UserSettings**, split by where it lives:
- Synced (server): guide_chattiness (quiet | normal | chatty); talk_out_loud; leave_by_alarms; crew_chat_notify (all | mentions | none), per crew or global?; location_mode (off | while_using | during_trips | always); email_import_enabled + MailboxConnection{provider, scopes, status}; app_locale; home_currency; price_display (home | local | both); clock_24h; distance_unit.
- Device-local: music_enabled, music_volume, theme_mode, sfx_volume, sfx_stickers, critter_voices, quiet_on_road, haptics, current_app_icon.

**Stamp**: {user_id, trip_id, place_id, label, month, colour, status upcoming | stamped, stamped_at, crew_signatures[] (3m-8)}.

**Stats** (derived and cached): trips_count, countries_count, critters_count (distinct locals or forms? define).

**App icons**:
- AppIcon{id, kind style | earned, style_key, entitlement free | pass_plus | earned, unlock_rule (form_found:X | set_complete:vietnam | legendary:golden_tokek | crew_trip_complete), bundle_asset_names{any, dark, tinted, forced_light, forced_dark, forced_tinted}}.
- UserIconUnlock{user_id, icon_id, unlocked_at, source_event}.

**AccountDeletion**: {user_id, requested_at, purge_at, reason enum (trips_over | too_many_pings | crew_moved_apps | privacy | other), reason_text?, balances_snapshot[{crew_id, net}], forgiven_balances[], subscription_state, email_sent_to, status pending | restored | purged, restored_at}.
- Purge rules:
  - Delete: profile, avatar photos, critter ownership, stamps, uploads, chat messages (tombstone "message removed"?).
  - Anonymise: plan authorship (→ "former member"), expenses (keep amounts, payer becomes "former member"), votes (keep tallies?).
  - Revoke: SIWA and Google tokens.
  - Delete: push tokens, mailbox tokens.

**DataExport**: {id, user_id, status queued | building | ready | failed | expired, requested_at, ready_at, url (signed), expires_at, size}.

**Community**:
- SharedPlan: {id, source_trip_id, crew_id (internal only), destination_id, published_by, published_at, status published | unlisted | removed, share_token (read-only link), title (generated, editable?), crew_display (named: member first names | anon: "a crew of N"), crew_size, days_count, start_month, year, show_cost, cost_per_person_rounded_10 (currency normalised), show_photos, photo_ids[12] (blurred derivatives only), critter_highlights[{form, day}], taste_tags[], pace, rating_avg, rating_count, copies_count, saves_count}.
- SharedPlanDay: {plan_id, idx, weekday, title, summary, items[{place_id, start_time?, note}]}. PII-scrubbed and without booking refs.
- PlanRetro ("What they'd change"): {plan_id, author_display (first name or initial, only if names on), text, pace 1–5}. **Collection point not designed.**
- PlanSave: {user_id, plan_id}.
- PlanCopy: {plan_id, target_trip_id, day_indices[], by_user, at, result_diff_id}.
- PlaceRating: {trip_id, user_id (internal; never exposed), place_id, verdict loved | fine | skip, at}. Aggregates per place.
- PlaceTip: {id, place_id, text, locale, month, moderation_status, internal author_id (for deletion or abuse), public display anonymous}.
- Privacy notes:
  - Tips are "attached to the place, not to you".
  - Budget maxes are never exposed. Cost is actuals per person, rounded.
  - Chat is never exported.
  - Faces are blurred.
  - A named crew requires consent (see Q).
  - Account deletion must cascade to published content: remove the user's photos and name from SharedPlan.

**Support**:
- Feedback: {id, ticket_no (#CP-nnnn), user_id, kind problem | feedback, mood 1–5, category planning | money | guide_chat | critters | other, text, summary, attachments[{asset_id, kind screenshot | image}], device_info{os, os_version, app_version, build, model, locale, tz} (opt-in), context{screen_id, trip_id, crew_id}, status received | triaged | in_progress | fixed | closed, linked_issue_ref, fixed_in_version, notified_at, created_at}.
- Idea: {id, title, description, author_id, locale, status new | looking | planned | building | shipped | declined | merged, merged_into, team_note (guide voice), vote_count, embedding, created_at, shipped_at}.
- IdeaVote: {idea_id, user_id, created_at}, unique (idea, user). VoteBudget: config N active votes per user (derive "votes left" = N − active votes).
- HelpArticle: {id, slug, locale, title, body_md, tags, context_keys (screens), updated_at}.
- RatingPromptLog: {user_id, device_id, at, surface recap | settings, trip_id, eligibility_snapshot}.

---

## 5. Backend / API needs

**Profile and settings**
- `GET /me` returns profile, entitlement summary and stats. `PATCH /me` updates name, username, home airport and languages. `GET /usernames/:u/availability`.
- `GET /me/stamps`, `GET /me/crews` (status line per crew), `GET /me/critter-forms` (owned plus locked with hints).
- `PUT /me/avatar` (type, form_id | upload), then an avatar render job produces PNG sizes (for push, Live Activities, widgets and share) and a CDN URL. `POST /media/avatar-upload` (presigned).
- `GET/PATCH /me/settings` (synced subset).
- `GET /me/app-icons` returns the catalog and unlocks. The unlock evaluator subscribes to events: critter.befriended, set.completed, legendary.found, trip.completed.
- `GET /fx/rates?base=` returns a daily snapshot (cache for offline, as_of). `GET /locales` lists supported languages. Guide sample audio: `GET /guides/:id/samples?locale=&kind=chattiness|language` (pre-rendered TTS on CDN).

**Account lifecycle**
- `GET /me/deletion/preflight` returns counts, per-crew net balances, organiser roles, active-trip flag, subscription source and status (App Store Server API / Play Developer API).
- `POST /me/deletion` {reason}: closes the account, revokes sessions, sends the email, schedules the purge. `POST /me/deletion/restore`, also called implicitly on sign-in within the grace period.
- `POST /me/export` then `GET /me/export/:id`, with the email when ready.
- `POST /auth/signout` (per device).
- **Jobs**:
  - `purge_closed_accounts` (daily): cascade delete or anonymise, revoke Sign in with Apple (`appleid.apple.com/auth/revoke`) and Google tokens, remove from SharedPlans.
  - `build_data_export`: zip of JSON, media and chat.
  - Balance write-off ledger entries for forgiven debts.

**Community**
- `GET /destinations/:id/shared-plans?days=&month=&crew_size=&max_cost=&tags=&sort=match&crew_id=` returns cards with match_pct and pick flag, paginated.
- `GET /shared-plans/:id`; `POST/DELETE /shared-plans/:id/save`.
- `GET /shared-plans/:id/guide-note?trip_id=`: LLM overlap note (cached per plan and draft version; stream or async).
- `POST /trips/:id/draft/import` {plan_id, days[] | 'best' | 'all'} runs a fit-check or merge job. The result is a diff; it reuses the 3c redraft job and progress channel.
- `POST /trips/:id/place-ratings` (batch verdicts and tips). `GET /trips/:id/visited-places` (with the photo pick and memory line).
- `POST /trips/:id/shared-plan/preview` {toggles} returns the projection: title, chips, photos (after curation).
- `POST /trips/:id/shared-plan` publishes. `PATCH` edits toggles; `DELETE` unpublishes. `POST /trips/:id/shared-plan/link` creates an unlisted token; `DELETE` revokes it.
- Public web: `GET /p/:token` read-only viewer (marketing-site route; needs design).
- **Jobs**:
  - `curate_trip_photos`: vision ranking, dedupe, top 12.
  - `blur_faces`: face detection then blurred derivative. Originals are never public.
  - `generate_plan_title`: LLM.
  - `tag_plan`: taste and pace tags via LLM.
  - `scrub_pii`.
  - `moderate_tip`.
  - `aggregate_place_ratings`.
  - `recompute_match_scores`, or compute on read (crew taste vector · plan tag vector).

**Help and feedback**
- `GET /help/articles?q=&locale=&context=`; `GET /help/articles/:slug` (CMS-backed; cache for offline).
- `POST /feedback` (multipart, idempotency key for offline retry) returns the ticket number. `GET /feedback/:id`.
- Integration: push to the helpdesk or tracker (e.g. Zendesk / Intercom / Linear / Jira), and receive a webhook on status fixed. That creates an Inbox card from the guide (3b) plus an optional push, gated on the user's app version ≥ fixed_in_version.
- `GET /ideas?tab=top|new|shipped&crew_faces=1` (faces = voters among the requester's crewmates). `POST/DELETE /ideas/:id/vote` returns 409 when over budget. `POST /ideas`.
- `POST /ideas/similar` {text, locale} returns the top-k with similarity, backed by a vector index. Debounced client call, p95 latency target < 300ms.
- Job `notify_idea_shipped`: fan-out to voters (Inbox and push).
- Admin API for statuses, team notes, merges, moderation.

**Rating prompt**
- `GET /me/rating-eligibility?trip_id=`: server flag for "trip ended well". Heuristics might be: recap completed, no SOS, balances settled or near, not a free-boost-expired paywall moment, no crash or error in the session. Final gating happens client-side (session error or paywall flags) and then the StoreKit call.

**Realtime channels**
- `user:{id}` for profile or avatar updates (fan-out to crew caches via `crew:{id}` member-updated events).
- `crew:{id}` for member closed or restored ("former member").
- `trip:{id}:draft` for import job progress (reuse 3c).
- `user:{id}:inbox` for feedback-fixed and idea-shipped cards.
- The idea board needs no realtime (poll or refresh).

**Third parties**
- FX rates provider (daily).
- App Store Server API and Google Play Developer API (subscription status).
- Sign in with Apple revoke endpoint; Google OAuth revoke.
- Email provider (deletion confirmation, export link, support replies).
- Helpdesk or issue tracker.
- Vision model for photo curation; face detection (Apple Vision on-device or a cloud API).
- Multilingual embeddings model and vector store.
- LLM (overlap note, title, tags, moderation assist).
- TTS voices per guide and language.
- Licensed or commissioned music.
- Help-centre CMS.
- POI dataset with categories (temples) for quiet mode.

---

## 6. Cross-slice dependencies and shared components

**Dependencies**
- 3a: anonymous-first pass, sign-in providers (restore after deletion requires sign-in); taste quiz (RETAKE); airport search (home airport); passport number.
- 3b: Home avatar entry; Inbox receives "fix shipped" and "idea shipped" cards.
- 3c: Pon's draft, must-dos, fit-check and redraft engine and diff UI (3o-2 copy); private budget max (3n-2 privacy row); redraft limits.
- 3d: Destination guide entry to 3o-1; place entities; month pricing uses home airport (3n-3).
- 3e: Trip plan SHARE entry to 3o-4.
- 3g: crew membership, chat (avatar render, "former member"), crew faces on ideas.
- 3i: balances and Settle up (3n-9); currency display mode (3n-8) must drive Balances and expense views.
- 3j: guide persona (chattiness, talk-out-loud), TTS voices.
- 3k: offline packs (3n-2 row), location gating "During trips", outbox for queued feedback; trip timezone for quiet hours.
- 3l: critter ownership, forms and rarity (avatar grid, rings, earned icons, counts); arrival detection (stamps, music switch).
- 3m: Recap, the entry for 3o-3 and 3p-6; album photos for 3o-3 and 3o-4 curation.
- 4: entitlements (PASS+ chip, STAMP icon, email import, possibly avatars); paywall 4e-1; Your plan 4d-1; Welcome to Pass+ → 3n-5.
- 5a/5b/5c: rasterised avatars and critters for notifications, Live Activities and widgets; "How much we ping" and Widget gallery reached from Settings; leave-by alarm toggle.

**Shared components**
- Settings group card and row (title, subtitle, trailing value in yellow, ›), toggle (46×28 snap overshoot), segmented control (paper pill on `#1f1b38`).
- Sticker avatar with rarity ring (sizes 22–98) and idle wobble. It is the same component in chat, map, crew stacks, profile, idea faces and toasts.
- Stacked initial avatars (−7px overlap, 2px ring).
- Passport stamp (circle, rectangle, dashed upcoming) with slam animation (s2.2→.94→1.04→1) plus thud. Shared with 3m-8, 3n-11 and 3p-3.
- Hold-to-confirm ring (conic progress, drain on release, haptic ramp). Shared with 3l-4/10 encounters.
- Card-stack fling deck. Shared with 3d Swipe together.
- Vote box and toggle vote. Shared with the crew vote UI in 3b/3c.
- Bottom sheet (r32, grabber) and system-like transitions (push, sheet, zoom, burst).
- Primary pill button (58px r29) with optional light-sweep.
- Toast (Dynamic Island morph) with a guide avatar.
- Odometer (`tg-count`); typewriter (`tg-type`); confetti (`tg-confetti`).
- Equaliser bars (music).
- Envelope or paper fold-and-fly (3o-4 publish, 3p-2 send) and paper-plane arc (3o-2).
- Paper page background (guilloche radial lines) for "document" moments (3n-11, 3p-3).
- MRZ text line.
- Money formatter honouring HOME / LOCAL / BOTH plus FX as-of. It must be the single implementation app-wide.
- Global SFX, haptics and music bus honouring 3n-7 prefs and quiet rules.
- Global shake handler with a view snapshot.

---

## 7. Implementation risks / hard parts

1. **Alternate icon appearance matrix.**
   - iOS picks light, dark, tinted or clear from the home-screen setting; apps cannot force it.
   - The design's AUTO/LIGHT/DARK/TINTED selector is only achievable by shipping forced-appearance duplicates as extra alternate icons, roughly (4 styles + 6 earned) × up to 4 variants.
   - All icons must be in the binary, which adds bundle size and review. iOS 26 Icon Composer layered `.icon` support for alternate icons must be verified against the toolchain in use.
   - Every change triggers a system alert.
   - Android activity-alias switching can close the app or drop pinned shortcuts; behaviour differs by launcher.
   - The "BALI SIX" icon cannot be crew-specific art (it has to be bundled), so it must be a generic "crew" icon.
2. **Avatars everywhere.** Procedural Canvas stickers with idle wobble must be ported to native. Static PNG renders are needed for notifications, Live Activities, widgets, share and the web, and caches must be invalidated when the avatar changes. The crew-scoped photo avatar needs per-viewer ACL (signed URLs), which complicates CDN caching.
3. **Deletion semantics.**
   - Balances owed to or by the user: the forgiven-debt ledger and the "user owes" case are undesigned.
   - Organiser transfer, and deletion during an active trip.
   - Shared-album photos disappearing from crew recaps and published plans.
   - Chat tombstones vs thread integrity (polls, votes).
   - Critter counts in the crew ("2 IN THE CREW").
   - Subscription not cancellable by the app.
   - SIWA token revocation (required by Apple) timed with the 30-day restore.
   - Anonymous accounts (no email) vs "We emailed this".
   - Reversible for 30 days means every table needs a closed-state filter, not an immediate delete.
4. **Publishing privacy.**
   - Multi-member consent (six people's trip, published by one person).
   - Face-blur false negatives are a privacy incident; blur must happen server-side before any public URL exists. Photos by other members raise a rights question.
   - Re-identification from itinerary, dates and crew size even with names off.
   - PII scrub of day notes (Airbnb addresses, booking refs).
   - Cascade on account deletion.
   - Moderation of tips and titles.
   - The read-only link needs a web viewer (not designed) and a revocation path.
5. **Copy and merge into draft.** Semantic merge across different dates or season (April → November), opening days, travel times, must-dos and budget. Needs fit-check (LLM plus constraints) to produce a reviewable diff. Must respect organiser-only draft visibility and the free redraft limit. "Four of these days overlap" requires place-level canonical IDs shared across trips.
6. **Taste-match ranking.** Needs structured tags on plans (LLM tagging), crew taste vectors aggregated from members' quiz results, and a calibrated "91%". Cold start: 0 plans per destination at launch, and the dev rules forbid fake seed data, so a product answer is needed (e.g. hide the entry until N plans exist, or guide-authored "starter plans" labelled as such).
7. **Runtime language switching.** In-place redraw means an in-app localisation layer independent of iOS per-app language. 16 locales touch all copy, including hand-lettered display type:
   - Archivo condensed has no CJK or Thai glyphs, so fallback display fonts need design.
   - RTL is possible if Arabic or Hebrew are included.
   - LLM output language and guide "local words" mixing need prompt contracts.
   - TTS voice per guide × language.
   - Help articles, the idea board and tips become multilingual, so duplicate detection must be cross-lingual.
8. **Global price display.** "Every price in the app follows it" requires one money-formatting primitive used by all slices, FX snapshots with an offline as-of, and rounding rules. Crew-currency balances differ from personal display.
9. **Audio.**
   - Ambient session that respects the silent switch and mixes with other apps.
   - Theme crossfades and "changes when you land".
   - Quiet hours in trip-local timezone; "inside temples" needs POI geofencing without always-on location (only while the app is foreground and playing).
   - Music licensing.
   - SFX and haptics must all go through a central gate.
10. **Shake-to-report.** Conflicts with iOS Shake to Undo in text inputs. The snapshot must be taken before the sheet appears. The screenshot may capture private data (budget max, chat, balances), so secure views need redaction markers. Android has no system shake event (accelerometer detector, false positives in vehicles, so throttle).
11. **Rating prompt.** No callback or display signal, so the Tokek choreography and "thanks" toast cannot depend on it. The yearly quota is enforced by the system, and in development builds the prompt always shows. Sequencing with the 3o-3 toast (+1.6s) and 4c-2 on the same Recap screen needs one arbiter for prompts on a screen.
12. **Close-the-loop feedback.** Mapping feedback to tracker issues to releases, and only notifying when the user's installed version ≥ fixed version. The promise "Tokek will tell you when it's fixed" is a support-ops process commitment.
13. **Idea-board integrity.** Vote budget semantics; abuse from anonymous-first accounts (vote farming; require a saved account to vote?); public UGC moderation; admin tooling (undesigned); "3 of yours" ownership.
14. **Offline.** Settings changes offline (queue and sync), feedback outbox, cached help articles, FX rates offline; community is online-only (needs an offline state).
15. **Accessibility.** Hold-to-delete and card-fling gestures need VoiceOver or TalkBack alternatives. Reduce Motion must disable loops (the tg-motion engine already does on web). Colour-only rarity rings need text labels.

---

## 8. Ambiguities and open product questions

1. **Icon and avatar entitlements.**
   - 3n-5 shows FACE and STICKER free, PASSPORT default and STAMP Pass+, while 4b-2/4e-2 say "Icon styles, avatars: Free 2 / Pass+ ALL". Which exactly are free?
   - Are avatars gated at all? 3n-4 shows no Pass+ locks.
   - 3n-5 says critter icons "can't be bought", yet 4d-2 lists "Icons: Sakura Pon and 11 more" as lost on cancel. Are earned icons Pass+-only to use?
   - What happens to an in-use Pass+ icon on lapse (revert automatically)?
2. **Icon counts and names.** "Classic · 5 of 9 unlocked" (3n-3) vs "4 STYLES · 3 EARNED" and "3 OF 6" (3n-5). "Classic" is not a style name. Which style is the default? What is the full earned-icon list and each unlock rule (TEMPLE, SARDI, HOME SET, PON, GOLDEN, BALI SIX)? Is BALI SIX per crew or generic?
3. **Appearance selector.** Should LIGHT/DARK/TINTED force the icon (duplicate forced icons) or only preview? Is iOS 26 "clear" in scope?
4. **Rarity ring colour.** Profile (3n-1) uses a green ring for rare while 3n-3 and 3n-4 use blue `#4f86ff`. Which is canonical?
5. **Past stamps and "SINCE 2022".** Stamps from 2023–24 and "7 trips, 12 countries" predate v1.0. Is there a past-trips import or manual add, or is this demo data only?
6. **Stats definitions.** Countries are counted from which trips? Is "critters" distinct locals or forms? (Profile 8, delete 8, avatar "10 UNLOCKED", 3l-2 "9/150".)
7. **Settings coverage.**
   - Where do Widgets (5c-5) and "How much we ping" (5b-4) live? PARENT says Settings, more, but there are no rows.
   - Location "During trips" options list?
   - Crew chat notification level: per crew or global?
   - Offline row actions (remove, redownload, storage)?
8. **Talk out loud and chattiness.** Does chattiness also change proactive push frequency (interaction with the 5b ping budget)?
9. **Music.**
   - Default on or off?
   - Does tapping a theme pin it (overriding "follows your guide") or only preview it?
   - Themes for guest-guide cities?
   - How is "inside temples" detected: POI category geofence, or only the plan's temple items?
   - Does "Quiet on the road" also mute haptics?
10. **Languages.** What is the full list of 16? Is any RTL? Do help articles and team notes on the idea board get localised? Does app language affect the guide's spoken-language TTS voice?
11. **Currency.** Can the user override the home currency independently of the home airport? Does LOCAL mean the current trip destination, or the price's native currency? What about BOTH on space-constrained widgets and Live Activities?
12. **Deletion edge cases.**
    - User owes money: block, warn, or record a debt to "former member"?
    - Organiser of an upcoming trip: transfer to whom?
    - Deleting mid-trip allowed?
    - Do crew-visible changes ("former member") happen at close or at purge?
    - Are chat messages removed or tombstoned?
    - Do the user's album photos vanish from the crew's recap and published plans?
    - Is the reason chip single- or multi-select, and does SOMETHING ELSE open free text?
    - Confirmation channel for phone-only accounts?
    - What does the app show on launch while closed, and what is the restore interstitial?
13. **Sign out of an anonymous pass.** Block, force "save your pass" first, or warn about loss?
14. **Publishing consent.** Can any member publish, or only the organiser? Is the crew notified, or is approval needed? Can a member hide their photos or name individually? Can the plan be edited or unpublished later, and do stats show back (copies, ratings)? Can you publish before or during a trip (the SHARE entry is on the Trip plan)?
15. **Named crews.** With names on, do full names, first names or initials show ("Mia and three friends", "Kenji · pace 4 of 5")? Where is "WHAT THEY'D CHANGE" (retro tip plus pace rating) collected? No screen captures it.
16. **Ratings semantics.** Is "★ 4.8 · 212 CREWS" a rating of the shared plan by copiers, or the source crew's self-rating from 3o-3? Is there a rating flow for copiers after their trip?
17. **Where tips surface.** "Your tips show up for crews planning Bali" appears on no designed screen (place detail 3d-3? guide suggestions?). Is the "Get there before 8" text user-typed or guide-suggested?
18. **Copy rules.** Who can copy (organiser only, since the draft is organiser-only)? What happens with no active trip for that city? Does a copy consume a free redraft? Does DAY 3 ONLY come from the LLM's "best day" pick? Must imported days carry season caveats?
19. **Crew plans monetisation.** "Sponsored picks shown" for free users (4b-2). Do sponsored items appear in Crew plans?
20. **Cold start.** What does Crew plans show for destinations with fewer than N shared plans, including every destination on launch day?
21. **Report a problem vs Send feedback.** Same form? Does the problem mode add logs or diagnostics, or force a category or mood?
22. **Feedback visibility.** Does "PINNED TO THE BOARD" mean feedback becomes a public idea, or is it only metaphorical? Is the 3p-3 note a truncation or an AI summary? Is text required?
23. **Idea board.** What is the vote budget: N concurrent votes (3 left with 3 used suggests 6), or per period? Do votes return when an idea ships? Does posting an idea cost a vote? Is posting immediate or moderated? Can anonymous (unsaved) users vote? Who writes team notes like "Tokek: I know a guy"?
24. **Rating prompt.**
    - How is "a trip that ended well" defined?
    - Which comes first on the Recap: the 3o-3 trip-rating toast, the App Store prompt, or 4c-2 Free boost ending?
    - Settings row: direct write-review link (caption) or system prompt (proto)?
    - Android parity?
25. **Help centre.** Which CMS or source? Is it offline? Is there an LLM-answered search? What is the article reader design, and is there a contact-a-human path (email only, "within two days")?
26. **Username.** What is it used for (mentions, invites, public idea author)? What are the change rules and the reserved or impersonation policy?
27. **Platform.** The design is iOS-only (system rating sheet, Dynamic Island toast, "iOS 20.1"). The Android equivalents for the icon switcher, the review prompt and subscriptions management need separate designs.
