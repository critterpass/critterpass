# Design spec: Part 2 "First run and joining" + Part 10 "Icon, splash and store"

Sources: `$Z/CritterPass 02 First Run and Joining.dc.html`, `$Z/CritterPass 10 Icon Splash and Store.dc.html`, `$Z/App Icon.dc.html`, `$Z/Store Shot.dc.html`, text extracts, shots `$SP/shots/02|10`, filmstrip `$SP/film/10/strip1.png` (10.02, 14 frames × 400 ms), icon renders `$SP/lane0210/cards01.png`, `cards23.png`, `droids.png`, `panes.png`. Current app `$R` = `critterpass-worktrees/deploy` @ `fc1a78d21`. Token names are from `foundations-spec.md`; px = pt at 390 wide.

## 1. Summary

- **Part 2: 19 screens** (2.01–2.19); **Part 10: 5 launch frames** (10.01–10.05), **4 app icons × 4 iOS modes + 4 Android renders**, **6 store shots × 2 platforms**, **Play feature graphic**, **6 listing fields**.
- **Shot file / code fix-ups** (the inline sc-if labels are stale; `data-screen-label` is right): `shots/02/2.05-6.png` = **2.07** This or that, `2.09-10.png` = **2.11** Pass issued, `2.12-13.png` = **2.14** Invite ticket. 10.04 / 10.05 (Android splash) are inline frames with no shot; rendered to `$SP/lane0210/droids.png`.
- **No tab bar on any Part 2 or 10 phone.** Both renderings are irrelevant here.
- **What is new versus the current app** (current flow is the old 3a-1 … 3a-13 with almost all logic present):
  - Launch: the egg hatch (`features/onboarding/hatch/*`, `splash-launch.png` egg + halftone, Android egg wobble) is replaced by the **passport cover + ISSUED stamp** (10.01–10.05). Returning cold starts lose the "Tokek waves" beat (10.B: "Returning users skip the stamp and go straight to Home").
  - Icons: all four arts are redrawn (Passport crest, Face without halftone, Stamp scalloped seal, Sticker on sky), with **iOS 26 Clear** mode and new Android themed colours. The current primary PNG `assets/icon.png` is the old **Face on halftone yellow**, even though the catalogue's primary id is `passport`.
  - New screens or states: 2.02 "Welcome back" offline, 2.04 pasted non-invite link "saved for later", 2.06 name-limit suggestions, 2.08 camera-off options list, 2.10 "Did you mean" + airports near you + one-shot GPS, 2.16 Scan QR, 2.17 three-way recovery list, 2.18 waitlist sheet with place in line and seat-opened banner.
  - Store: a new frame template (sticker-colour ground, kicker sticker, tilted phone, dotted route running across shots, sticky note, critter), a Play feature graphic (no tooling today) and changed Play title/short description and App Store promo/keywords.
- **Hardest pieces to build well:**
  1. **Launch handoff 10.01 → 10.02 → 2.01**: the native still must match the first RN frame to the pixel; the stamp drop plus page squash plus confetti plus lift must run on the UI thread; the final 10.02 frame is **not** 2.01 (different cover art, position and collage), so a shared-element bridge must be designed (§8 Q1).
  2. **Icon pipeline for iOS 26**: four Icon Composer `.icon` bundles (Default / Dark / Mono, layered so the system makes Clear and Tinted), plus Android adaptive and monochrome layers per icon, plus alternate-icon switching through `cp-app-icon`, plus pre-release badges.
  3. **Keyboard-docked wizard pages** (2.05 name with the Next bar docked on the keyboard, 2.16 code tiles with the QuickType paste bar) with the pass card typing live above the keyboard, and a header progress that animates between pages rather than sliding with them.
  4. **Stamp family** (10.02 ISSUED, 2.09 HOME, 2.11 ISSUED + HOME, 2.17 EXPIRED, 2.19 ADMITTED): one component and one 1.07 choreography (fall, squash, ink ripple, page jolt, confetti, haptic, thud SFX).
  5. **Store frame compositor + Play feature graphic** in `tools/scripts/store-kit`, with captions that differ per platform (shot 3 says "Dynamic Island").

## 2. Screen table

Route files are under `$R/apps/mobile/src/`. "Logic" = whether behaviour exists today.

| code | title | screen type | header left / right | primary action | current route file(s) | logic |
|---|---|---|---|---|---|---|
| 2.01 | Splash · collage of the six guides | Full screen, no chrome | none / none | Open your pass (ink) | `app/onboarding/index.tsx` → `features/onboarding/splash/SplashScreen.tsx`, `Floaters.tsx`, `passport-opening.ts` | exists |
| 2.02 | Splash · returning, offline on first launch | Full screen | NO SIGNAL chip centred / none | Sign in with Apple (ink) | none (variant of SplashScreen) | partial: offline draft exists; "returning install" detection + splash sign-in missing |
| 2.03 | First launch · crew link copied, paste | Full screen ✕ | none / ✕ glass **top-right** | Paste (UIPasteControl) | `features/launch/PasteLinkOffer.tsx`, `DeferredLinkGate.tsx`, `lib/links/SplashResolveGate.tsx` | exists (bare visuals) |
| 2.04 | Pasted · not a crew link | Full screen ✕ | none / ✕ glass top-right | Type a crew code (ink) | none (today the `invalid` outcome) | missing |
| 2.05 | Your name · types onto the pass | Wizard page (push) | glass back / 4-segment progress + "1 of 4" | Next (keyboard bar) | `app/onboarding/name.tsx` → `features/onboarding/name/NameScreen.tsx`, `name-reaction.ts` | exists |
| 2.06 | Name · 24-letter limit | Wizard page | glass back / "1 of 4" chip | Next (ink) | same | partial (limit exists, `GIVEN_NAME_MAX = 24`; "Try" shortenings + reading line missing) |
| 2.07 | This or that · photo cards | Wizard page | glass back / 6-segment quiz progress + "3 of 6" | tap a card | `app/onboarding/taste.tsx` → `taste/TasteScreen.tsx`, `TasteQuiz.tsx`, `QuizCard.tsx`, `TagStamp.tsx` | exists |
| 2.08 | Real photo · camera off | Wizard page (state) | glass back / "2 of 4" chip | Choose from Photos (row) | `app/onboarding/photo.tsx` → `photo/PhotoScreen.tsx`, `RealPhotoSheet.tsx`, `use-real-photo.ts` (`camera_denied`) | exists (new options layout) |
| 2.09 | Home base · first stamp | Wizard page | glass back / 4-segment progress + "4 of 4" | That's home (ink) | `app/onboarding/home.tsx` → `home/HomeScreen.tsx`, `home-search.ts` | exists |
| 2.10 | Home base · nothing found | Wizard page (state) | glass back / "Home base" 17/600 / "3 of 4" chip | Use (small ink) / Use my location | same | partial: "Did you mean" town → airport and one-shot GPS missing |
| 2.11 | Pass issued · stamps slam | Full screen, no chrome | none / none | Save my pass (ink) | `app/onboarding/issued.tsx` → `issued/IssuedScreen.tsx` | exists |
| 2.12 | Save your pass · a sheet | Sheet with grabber (choice sheet, no Cancel/verb) | — | Continue with Apple (ink) | `app/onboarding/save.tsx` → `save/SaveScreen.tsx`, `SaveSheet.tsx`, `use-save-flow.ts`, `MergeChoice.tsx`; phone `app/onboarding/phone.tsx` → `phone/PhoneScreen.tsx` | exists |
| 2.13 | Permissions · three asks | Wizard page | glass back + "Last step" / none | Let's go (ink) | `app/onboarding/permissions.tsx` → `permissions/PermissionsStep.tsx`, `ui/permission-primer/*` | exists |
| 2.14 | Invite · crew ticket with a seat | Full screen, **no chrome** | none / none | Take the seat (ink) | `app/onboarding/invite/ticket.tsx` → `invited/TicketScreen.tsx`, `InviteTicket.tsx`, `ticket-model.ts` | exists; trailer row partial |
| 2.15 | Join with a code · found it | Push | glass back / "Paste a link" floating pill | Join the Bali Six (ink) | `app/onboarding/invite/code.tsx` → `invited/CodeScreen.tsx`, `FoundCrewCard.tsx` | exists |
| 2.16 | Join with a code · wrong code | Push | glass back / title "Join a crew" | Paste (small ink) | same | partial: Scan QR missing |
| 2.17 | Invite ticket · ran out | Full screen ✕ | ✕ glass top-left / none | rows (no ink pill) | `invited/InviteProblem.tsx` (in Ticket/Code screens) | partial: "Ask Maya" request missing |
| 2.18 | Trip full · glass sheet, place in line | Sheet with grabber over photo + banner | — | Join the waitlist (ink) | `invited/TicketScreen.tsx` (`full`), `use-seat-join.ts` | partial: position line + seat-offer banner need data check |
| 2.19 | You're in · crew manifest | Full screen, no chrome | none / none | See the plan (ink) | `app/onboarding/invite/manifest.tsx` → `invited/ManifestScreen.tsx`, `ManifestGrid.tsx` | exists (copy-rule conflict §8) |
| 10.01 | iOS launch · still, light | Native launch screen | — | — | `apps/mobile/app.config.ts` `SPLASH_PLUGIN_OPTIONS`, `assets/splash-launch.png` | replace |
| 10.02 | First launch · stamp, then welcome | In-app overlay | — | — | `features/onboarding/hatch/LaunchHatch.tsx`, `HatchStage.tsx`, `timeline.ts`, `launch-state.ts` | replace |
| 10.03 | iOS launch · dark | Native launch screen | — | — | `app.config.ts` (no `dark` today) | missing |
| 10.04 / 10.05 | Android 12+ splash light / dark | Native splash | — | — | `plugins/with-splash-wobble.ts`, `assets/splash-android-wobble*` | replace |
| Icons | Passport, Face, Stamp, Sticker | — | — | — | `assets/icon*.png`, `assets/android-icon-*.png`, `modules/cp-app-icon/plugin/with-app-icons.ts`, `tools/design-renders/export-app-icons.mjs`, `app-icon-monochrome.mjs`, `design/App Icon.dc.html` | replace |
| Store | 6 shots, feature graphic, listing | — | — | — | `tools/scripts/store-kit/*`, `packages/content/src/store/{listing,templates}`, `apps/mobile/store.config.json` | partial |

## 3. Per-screen spec

Shared values used below: **back** = glass nav circle 44, `rgba(255,255,255,.62)` blur 18 sat 1.8, inset top 1px white .95, .5 white .6, .5 ink .07, `0 8 20 −6 rgba(20,22,40,.16)` (on-token per foundations "nav buttons"), chevron icon; placed left 20, top 58–60. **Ink pill** = h 56 r 28, `#30313b→#16171d`, `ink` shadow, 17/600 white. **Text button** = 15/600 muted, padding 6 0. **Tokek glass note** = l/r 16, padding 8 14 8 8, r 22, `rgba(255,255,255,.66)` blur 20 sat 1.8 (OFF-TOKEN: regular glass is .56/24/1.9), 36 avatar disc `#fff3c4` with 36 gecko, text 13/1.38 `ink.secondary`, bold "Tokek" `ink`. **Phone ground** `#f5f5f7`.

### 2.01 Splash · collage of the six guides
- **Layout** (absolute, 390×844): photo 1 (Batur sunrise) at 26,92, 166×206, white frame pad 6, r 16, rotate −8°, shadow `0 2 4 .1, 0 18 34 .18`, image r 11. Photo 2 (Kelingking) at 196,112, 162×198, rotate 7°. Place tags: "Batur" sun at 34,266 rotate −9°, "Penida" sky at 262,282 rotate 8° (tag spec = foundations sticker tag 14/800 `on.accent`). Passport at 103,232: **184×250**, r 10/22/22/10, fill **tangerine `#ff9a4d`** flat, inset 10 `rgba(0,0,0,.08)` spine, `0 2 4 .12, 0 26 46 .26`; inner frame inset 11 11 11 20 r 6/15/15/6 1.5px `rgba(255,216,74,.6)`; stack centred gap 16, sun ink: "CRITTERPASS" 12/800 +.32em, globe emblem 72 (3.5 sun ring, meridian ellipse 28 wide 3px, equator 3px), "PASSPORT · PASSEPORT" 10/700 +.26em. Floaters (z 4): tanuki 92 at 12,356; puffin 72 at 300,62; sardine 96 at 276,470; camera 48 (pink accent) at 44,470 rot −12°; plane 54 (sky) at 150,72 rot 14°; Tokek wave 128 at 174,404 (z 5). Sticky note "Hi, I'm / Tokek!" at 254,378 rot 7°: padding 12 12 8, `#fff6c9`, r 4, Borel 14/1.3 `#6b5a24` (OFF-TOKEN Borel 14 and colour; guide = Borel 15), tape 44×14 white .7 rot −4° at top −8. Bottom block l/r 24, bottom 40, gap 14: headline 27/700 −0.025em lh 1.12 centred, mb 10 (OFF-TOKEN size 27), ink pill "Open your pass", text button "I have an invite code".
- **Motion within**: passport bob `0:r−4 ty0; .5:r−2 ty−6; 1:r−4 ty0` 4200 ms (exists as `PASSPORT_BOB`); Tokek pop `0:ty0;.4:ty0;.5:ty−10 out;.6:ty0 in` 3600 ms (exists as `TOKEK_POP`); float preset `0:ty0 r−2;.5:ty−9 r2;1:ty0 r−2` at 4600 / 5000 (+700) / 4400 (+300) ms. Idle loops pause off-screen and under Reduce Motion (existing `useIdleLoopRunning`).
- **Taps**: Open your pass → 2.05 (current cover-swing `passport-opening.ts` lands the page on the pass card; keep, retarget to 2.05's card rect l/r 22 top 118 h 170 rot −1.5°). I have an invite code → 2.15.
- **Motion in**: from 10.02 (see §5 M1). Photos, tags and the note are not in 10.02's final frame; they must fade/pop in after (Lively, staggered 60 ms) or 10.02 must be redrawn to end on this frame (Q1).

### 2.02 Splash · returning, offline on first launch
- **Layout**: ground radial `120% 70% at 50% 30%, #fff6c9 0%, #f5f5f7 62%`. NO SIGNAL chip centred top 64: h 30, padding 0 11, r 15, `segment.track` fill, 12/700 +.04em `#a8501a` (OFF-TOKEN), 7 dot tangerine. **Navy passport** 200×262 at 94,150, r 12/18/18/12, `linear(160deg,#2a2f5a,#1f2a52)` (OFF-TOKEN), inset 6 `rgba(0,0,0,.18)`, `0 30 50 −20 .5`; "PASSPORT" mono 10 +.3em `#e9c77a` at top 34; crest 92 ring 2px `#e9c77a` at top 76 with 84 gecko line art in `#e9c77a`; Borel 20 "CritterPass" bottom 30. Bob `0:ty0 r−4;.5:ty−8 r−2` 5200 ms. Text block top 444 l/r 28 centred: "Welcome back" 30/700 −0.03em lh 1.1 (OFF-TOKEN 30), body 15 muted lh 1.42 mt 8. Buttons l/r 24 bottom 30 gap 10: ink pill with Apple glyph 16×19 "Sign in with Apple"; secondary h 52 r 26 `segment.track` fill 16/600 ink "Make a new pass offline"; text 36 high 15/600 `#2f5fc4` (rain text) "I have an invite code".
- **Ways out**: Sign in when online · New pass, syncs later · Join with a code.
- **Offline behaviour**: Sign in with Apple needs signal: tap shows inline "Needs signal, I'll try when you're back" and retries on reconnect (undesigned; log in `docs/undesigned-states.md`). Make a new pass offline → 2.05 with a local draft (draft-store is local-first today). Android shows Google, not Apple (undesigned).

### 2.03 First launch · a crew link you copied
- **Layout**: top band h 470 sun `#ffd84a` with dot texture `radial-gradient(rgba(23,20,42,.12) 1.2px, transparent 1.7px) 0 0/10px`. ✕ glass 44 at right 20, top 58 (Foundations says ✕ top-left: Q4). Ticket illustration: 250×290 box centred at top 118; card 190×230 at 30,40, r 22, white, rotate −5°, `0 30 50 −24 rgba(60,40,0,.45)`, padding 16: "CREW INVITE" 10.5/800 +.08em placeholder; "The Bali Six" 24/800 −0.03em mt 6; dashed 2px `field.border` divider mt 58 pt 12; code "KQ7·M3P" mono 20/700 +.12em `outline.empty` (greyed: not read). Tokek point 118 at 150,−26 rot 10°. Text top 500 l/r 28 centred: 30/800 −0.035em lh 1.08 (OFF-TOKEN), 15 muted lh 1.45 mt 10. Paste = **system UIPasteControl** 200×50 r 25 ink `#1c1d24` solid, icon + label 17/600, centred bottom 118. "No link, start fresh" text button bottom 56.
- **Taps**: Paste → reads only on tap; crew link → 2.14; code → 2.15; other link → 2.04. ✕ → 2.01, never asked again. No link, start fresh → 2.05. No paste control (iOS < 16 / Android) → skipped, straight to 2.01.
- **Note**: the ticket text must be a generic illustration (nothing is read before Paste), not the real crew name.

### 2.04 Pasted · not a crew link
- **Layout**: sun dot band h 300. ✕ glass top-right. Tokek think 160 centred top 96. Text top 330 l/r 28 centred: "That's a TikTok, not an invite" 28/800 −0.035em lh 1.1; 14.5 muted lh 1.45 mt 8. Saved card l/r 20 top 446 r 22 white `card` padding 12 gap 12: 52 thumb r 12; "SAVED FOR LATER" 11/800 +.06em muted; title 14/600 ellipsis; 22 check disc `#34c77b` (`toggle.on`). Hint row top 540 l/r 20: padding 8 10 8 6, r 16, `#fff6c9`, 28 white avatar disc with 28 gecko, 12.5/1.35 `#3d3210` "Invites look like go.critterpass.app/i/… or a 6-letter code." Bottom l/r 24 bottom 40 gap 6: ink pill "Type a crew code", text "Start fresh".
- **Taps**: Type a crew code → 2.15. Start fresh → 2.05; the link waits in Ideas for the first trip. ✕ → 2.01. Saved card → remove (gesture unspecified: Q8).
- **Variants**: title names the source by host (TikTok, Instagram, YouTube, Maps); unknown host → generic "That's a link, not an invite" (undesigned).

### 2.05 Your name · it types onto the pass (keyboard up)
- **Header** top 60 l/r 20 gap 14: back; 4 segments flex gap 4, h 5 r 3, done `ink`, todo `#dcdde3`; count "1 of 4" 14/600 muted (foundations "2 of 4" spec says 13/600 inside a white r 20 h 56 bar; here on ground: OFF-TOKEN size and container).
- **Pass card** l/r 22, top 118, h 170, rotate −1.5°, r 22, paper `#fffdf6` + guilloche `repeating-radial-gradient(circle at 20% 120%, rgba(23,20,42,.045) 0 1px, transparent 1px 7px)`, `0 2 4 .08, 0 18 36 .14`, padding 14 16, text `#17142a`. Row: mono 10 +.08em `#5d564b` "CRITTERPASS · PASSEPORT" / "CP-0427". Body mt 10 gap 14: photo slot 68×84 r 12 2px dashed `#d6ccb6`, "?" 26/800 `#c4b99f`; grid 2 cols gap 8 10: label 9.5/600 +.08em `#5d564b` "GIVEN NAME · PRÉNOM", value 22/700 + caret 2×22 `caret`; HOME / STYLE values 13/600 `#b0a890` "Not yet" / "We'll ask". MRZ bottom 10, mono 10 +.12em `#5d564b`, live `P<CP` + MRZ name + `<` fill. (Pass-paper inks `#5d564b #b0a890 #c4b99f #d6ccb6` are OFF-TOKEN; propose a `pass.*` token group shared with Part 9.)
- **Title** top 312 l/r 24: "What should the guides call you?" 28/700 −0.03em lh 1.1 (OFF-TOKEN 28).
- **Field** top 390 l/r 20, h 56 r 18, white, **focused** ring 2 `ink`, padding 0 16, 20/600, caret 2×24 `caret` (foundations field is h 52, 16/500: OFF-TOKEN).
- **Tokek note** top 460 (glass note): "Just a first name is fine. I'm Tokek, so I can't judge." Lines vary with the name (`name-reaction.ts`).
- **Keyboard state**: system keyboard h 296 (design draws an iOS 18 keyboard; iOS 26 draws its own glass). **Next bar docked on top of the keyboard**: h 44, r 12, `ink` solid, 16/600 white, side inset 6 (2 + 4 keyboard padding), 8 above the key rows; moves with the keyboard (KeyboardStickyView pattern, `ui/layout/KeyboardFooter.tsx` exists). Everything above stays visible: keyboard top is y 548, Tokek note ends ≈ 512. Return key **done** = Next. Autofocus after the page lands (current NameScreen delays focus until the fade finishes; keep). Keyboard dismiss: none offered (no tap-out), Back pops.
- **Taps**: Back → 2.01. Name field: any script, emoji, 24 characters (grapheme count via `givenNameLength`). Next / done → next wizard page (Q2: order). Typing updates GIVEN NAME and MRZ per keystroke.

### 2.06 Name · at the 24-letter limit (keyboard down)
- **Header** top 58: back; centred empty title slot 17/600; right chip "1 of 4" h 30, padding 0 12, r 15, `segment.track`, 12.5/700 `ink.secondary` (a second progress style: Q3).
- Title block top 120 l/r 28: "What goes on your pass?" 28/700 (different title from 2.05: Q3); sub 15 muted lh 1.42 mt 8.
- **Name slip** l/r 36 top 262 h 150 r 16 rotate −2°, paper + `repeating-linear-gradient(115deg, rgba(23,20,42,.035) 0 1px, transparent 1px 6px)`, `0 2 4 .06, 0 24 40 −20 .35`: label mono 9 +.16em `#9a917e` "NAME · NOM · 名前" at 16,14; name 23/700 −0.02em ellipsis at top 34; reading line "ウィンストン" 14 muted at top 66 (no data source: Q9); MRZ mono 10 +.08em `#b9b0a0` bottom 14; photo 46×56 r 8 `#e9e2d0` with tanuki 44 at right 14 top 14.
- **Field, error**: top 444 l/r 20 h 64 r 20 white, ring 2 `#ff5fa8` + `0 14 30 −14 rgba(224,70,142,.45)`; floating label "Name" 11.5/600 `#b0306b`; value 18/600 + caret; counter "24/24" 13/700 `#b0306b` tabular. Helper top 518 l/r 28, 13 `#b0306b` lh 1.4.
- **"Try" chips** top 566 l/r 20 gap 8 wrap: label 12.5/600 muted full row; chips h 36 padding 0 14 r 18 white 13.5/600 ink: first name, first + initial, short form. Tap = replace the field value (and clear the error).
- Next ink pill bottom 30 (enabled at 24/24: the limit blocks typing, not saving).
- **Ways out**: Next · Back to splash · Edit name later in Pass.
- **Haptic**: warning tick when the 25th character is refused (undesigned; Snappy shake 0 → 6 → −4 → 0 on the field).

### 2.07 This or that (quiz question 3 of 6)
- Header top 60: back; **6** segments (3 done) gap 4 h 5; "3 of 6" 14/600 muted. This counts questions, not wizard pages.
- Title block top 122 l/r 24: "This or that" 32/700 (`largeTitle`); Tokek line: 34 gecko point + Borel 13.5/1.5 `#6b5a24` "No wrong answers, only late ones." (OFF-TOKEN Borel size).
- Card A l/r 22 top 222 h 230: white frame padding 6 r 26 rotate −1.5°, `0 2 4 .08, 0 18 36 .16`, z 2; image r 21 with bottom fade `transparent 30% → rgba(10,10,20,.7)`; title 28/700 −0.025em white + sub 15 at .92, left 18 bottom 16; Tokek cheer 98 at right −6 top −34; sun doodle 40 at right 22 bottom 22.
- "or" disc 52 centred top 446, `ink` fill, 4px ground border, 15/700 white, z 5.
- Card B l/r 22 top 480 h 212, rotate 1.2°, text right-aligned (right 18 bottom 16); Tokek sleep 92 at left −8 bottom −26.
- "On your pass so far" top 722 l/r 24: 13/600 muted, gap 12; tag stickers 13/800 (pink "Street food" rot −4°, mint "Easy-ish pace" rot 3°) + empty slot 2px dashed `outline.empty` "?".
- **Taps / motion** (current behaviour, keep): tap a card → the other flings away (Lively), the answer tag thuds onto "On your pass so far" (Lively), next pair rises (Smooth); undo and skip exist today but are not drawn (undesigned placement).

### 2.08 Real photo · camera off
- Header top 58: back; chip "2 of 4".
- Avatar 184 centred top 128: 2px dashed `outline.empty` ring; inner disc inset 16 r 76 `control` with tanuki sleep 132; badge 48 white disc `0 6 14 −4 .25` at right 6 bottom 10 with camera glyph and a 30×2.5 `#b0306b` slash rotated −45°.
- Title top 334 l/r 28 centred: 26/700 −0.03em lh 1.12 (`emptyTitle`); body 15 muted mt 8.
- Options card l/r 16 top 476 r 24 `card`: three rows min-h 62, padding 0 14, gap 12, hairline separators: tile 40 r 12 (rain tint `#e6eeff` + photo icon; `#ffe6d3` OFF-TOKEN + tanuki 34; `control` + settings icon), title 15.5/600 (OFF-TOKEN 15.5), sub 12.5 muted, trailing chevron.
- "Skip this step" text button bottom 30.
- **Taps**: Choose from Photos → system PHPicker (no permission; "Only the one you pick is shared"). Use a critter for now → guide stand-in, swap later in Pass. Turn the camera on → `Linking.openSettings()`, re-check on return to foreground. Skip → next page.
- The happy-path photo page (guide faces, "Use a real photo") is **not drawn** in Part 2; restyle current `PhotoScreen` with these components.

### 2.09 Home base · your first stamp (keyboard implied up)
- Header top 60: back; 4 segments all done; "4 of 4".
- Title block top 118 l/r 24: "Where's home?" 32/700; sub 15 muted lh 1.4 mt 4.
- Search field top 206 l/r 20 h 50 r 18 white, `0 1 2 .05, 0 6 18 .06`, search glyph, 17/500 text, caret (2.10 uses the system search capsule instead: Q3).
- Results card top 270 l/r 20 r 22 `card`, rows padding 12 14 gap 14: IATA 20/800 −0.01em width 52; name 15/600; sub 12.5 muted ("Singapore · SGD", "Malaysia · 40 min away"); selected row `#fffbe8` (OFF-TOKEN) + 24 ink check disc.
- **HOME stamp** 200 circle at 95,478, rotate −10°: rings `inset 0 0 0 4px #e07a2a, inset 0 0 0 10px transparent, inset 0 0 0 11.5px #e07a2a`, white fill, text `#c45f16`: "HOME · RUMAH" 11/800 +.2em, city 30/800 −0.02em, "STAMP No. 1" 11/800 +.16em. Tokek cheer 96 at 250,600.
- Ink pill "That's home" bottom 40.
- **Keyboard**: the shot shows no keyboard; with it up (live search) the stamp hides under it. Spec: the keyboard dismisses when a result is picked (the stamp then lands, Lively), returns on field focus. Return key **search**.
- **Taps**: Back → previous page. Search → live results, offline over bundled airports; nothing found → 2.10. Result → stamps it as home. That's home → 2.11.

### 2.10 Home base · nothing found
- Header top 58: back; centred "Home base" 17/600 (navTitle is 19/700: OFF-TOKEN); chip "3 of 4" (conflicts with 2.09's "4 of 4": Q2).
- Search capsule top 116 l/r 16 h 48 r 24 `segment.track` fill, glyph, 16.5 text + caret, clear button 22 disc `outline.empty`.
- "No town called "Ubdu"" top 186 l/r 28: 20/700 −0.02em; sub 14 muted mt 4.
- "Did you mean" label top 256 13/600 muted padding-left 10; card top 280 l/r 16 r 24: row 62 with 40 tile pink tint + pin doodle 30, "Ubud" 15.5/600, "Bali, Indonesia · nearest airport DPS" 12.5 muted, small ink pill "Use" h 30 padding 0 12 r 15 13.5/600.
- "Airports near you" top 368; card top 392: rows with 40 `control` tile holding mono 12/800 IATA, name 15.5/600, distance 12.5 muted, chevron.
- Bottom l/r 24 bottom 30 gap 10: secondary h 52 r 26 `segment.track` "Use my location" with location glyph; line 15/600 muted "Location is only used for this, once".
- **Keyboard**: shown down with the caret in the field; the field stays focused, return key **search**.
- **Taps**: Did you mean / Use → sets home to the town, stamp shows the nearest airport. Airport row → home. Use my location → one-shot when-in-use location (system prompt) → nearest airports. Back → previous page.

### 2.11 Pass issued · stamps slam onto the page
- **Pass** l/r 22 top 92 h 300 rotate −2°, r 24, paper + guilloche, `0 2 4 .08, 0 22 44 .16`, padding 18, column gap 14: mono 10.5 row "CRITTERPASS · PASSEPORT" / "CP-0427"; photo 92×114 r 14 booked tint `#e3f6ec` with 90 gecko (fill mint, spots `#2e9a74`); grid gap 10 12: labels 10/600 +.08em `#5d564b`; GIVEN NAME 22/700; HOME 14/600; ISSUED 14/600 "26 Sep 2026"; TRAVEL STYLE 14/600 "Sunrise · Street food · Easy"; MRZ two lines mono 10.5 +.12em lh 1.5 under a 1.5 dashed `rgba(23,20,42,.18)` rule.
- **ISSUED stamp** 122 at right 30 top 306 rotate −14°: rings 3 / gap / 1 in `#e0468e` (stamp ink pink), fill `rgba(255,253,246,.25)`, "CRITTERPASS" 9/800 +.16em, "ISSUED" 26/800, date 9/800 +.16em. **HOME stamp** 84 at 150,350 rotate 10°, orange `#e07a2a`, "HOME" 8/800 + "SIN" 24/800.
- Tokek cheer 112 hopping (`hop` preset 2600 ms) at 30,378; spark 30 (sun) at 142,446 rot −10°; star 26 (pink) at 24,410 rot 16°.
- Text top 540 l/r 24: "Your pass is ready" 34/700 (`display`); 16 muted lh 1.45 mt 8.
- Bottom l/r 24 bottom 40 gap 12: ink pill "Save my pass"; 13 muted "Takes ten seconds. No password."
- **Motion in** (1.07 Stamp, current IssuedScreen order): pass drops in (Smooth) → ISSUED falls `translateY(−120) scale(2.2) rotate(−30°)` → hits `scale(.9,.84)` → settles (Lively); page jolts (3 down, 2 up, ±.4°); ink ripple; 44 confetti; heavy haptic + thud SFX; HOME stamp lands 300 ms later (Lively); Tokek hops in. Swipe back is off from here (keep `gestureEnabled: false`).
- **Offline**: placeholder pass number + SYNCING until the server number arrives (exists).

### 2.12 Save your pass · a sheet, not a wall
- Behind: 2.11 page dimmed by scrim `rgba(20,22,40,.28)` (the drawing shows a photo and skeleton cards; treat as "the page beneath").
- **Sheet**: inset 8 left/right/bottom, r 46, sheet glass `rgba(248,248,250,.86)` blur 34 sat 1.8, inset top 1px white .9, `0 −18 50 −10 rgba(20,22,40,.28)`, padding 12 18 30. Grabber 36×5 r 3 `rgba(60,60,67,.3)` mb 14. Title row: "Keep it safe" 26/700 −0.025em; sub 14 muted lh 1.4 max-width 250 mt 4; Tokek think 78 top-right, mt −30 (overhangs the sheet top). Buttons gap 10 mt 18: ink pill **h 54 r 27** 16/600 with Apple glyph "Continue with Apple" (OFF-TOKEN 54/16 vs 56/17); white h 54 r 27 `float` shadow with "G" 18/800 sky + "Continue with Google" (must use Google's official multicolour G: Q10); text h 46 15/600 `ink.secondary` "Use my phone number". Legal 11.5 muted centred mt 4 with tappable "Terms" and "Privacy Policy".
- No Cancel / verb header (deviates from the foundations sheet grammar on purpose: one-choice sheet). Height = content (~370), single detent.
- **Taps**: Apple / Google → system sign-in → 2.13. Use my phone number → phone + SMS code (screens not drawn in any part: build from 2.05 field + 2.15 code tiles; log as undesigned) → 2.13 (text says "then 2.11": Q11). Terms / Privacy → each in a sheet. Swipe down → skip; asked again after the first trip.
- **Motion**: sheet rises over 2.11 (Smooth; native form sheet).

### 2.13 Permissions · three asks, each with a why
- Header top 60 gap 12: back; "Last step" 14/600 muted.
- Title top 116 l/r 24: "Three things, and why" 32/700 lh 1.05.
- Cards l/r 20 top 200 gap 12; each r 24 white `card` padding 14 gap 14 centred: art tile 84 r 20 rotated (−4°, 3°, −2°): (1) `ink` tile, "LEAVE BY" 9.5/700 +.08em at .7, "03:10" 24/800; (2) booked tint tile, locked gecko 70 (`#b9e6d2`) + "?" 22/800 `#2e9a74`; (3) white tile with 1.5 `field.border` ring, 24-high pink header "APR" 11/800 +.06em `on.accent`, "2" 36/800. Text: title 16/600 (`headline`), sub 13 muted lh 1.4 mt 2.
- Tokek glass note top 578: "Say no to any of them. I'll ask again when it actually matters."
- Bottom l/r 24 bottom 34 gap 8: ink pill "Let's go"; text "Ask me later".
- **Taps**: each card → that permission's system prompt (primer first is this page itself; no extra sheet). Say no → card greys out, asked again in context. Tokek's note → why each matters (expands). Let's go → Home (3.01) or the crew just joined (or a link that arrived before the pass existed, as today). Ask me later → same destination, nothing asked.
- **States not drawn**: granted (propose: tile keeps colour, mint check badge 22 at tile corner, Lively pop); denied ("greys out": opacity .45 + grayscale tile, sub line becomes "Off. I'll ask on your trip."). Log both in `docs/undesigned-states.md`.

### 2.14 Invite · a crew ticket with a seat for you
- **No header buttons** (Q4: needs a way back/✕).
- Inviter row l/r 20 top 62, r 20 white `card`, padding 10 14 10 10 gap 10: 36 avatar in the inviter's crew colour, 15/700 initial; title 15/600 "Winston saved you a seat"; sub 12.5 muted "Opened from WhatsApp · 2 min ago".
- Headline top 138 l/r 24: "Rin, you're coming to Bali" 32/700 lh 1.05.
- **Crew ticket** l/r 20 top 226 r 26 white, `0 2 4 .06, 0 20 40 .12`: photo strip inset 8 h 110 r 20 (object-position 50% 60%) with date tag sticker (sun, rot −7°, 13/800, at 18,20) and Tokek wave 84 at right −10 top −40; mono row padding 14 18 0, 10.5 +.08em muted "CRITTERPASS AIR · CREW TICKET" / "BALI-6X"; route row padding 10 18 16 gap 12: "YOU" 30/800 + "Wherever" 12 muted; dashed 2px `outline.empty` line with plane glyph on a 28×24 white chip; "DPS" 30/800 right + "Bali"; perforation: dashed 2px `field.border` with 20 ground-colour notch discs at both edges (−30 offset); 3-col grid padding 14 18 16 gap 8: label 12 muted, value 16/600 (Dates, Seat "5 of 6", Each "~$1,240").
- Crew row top 560 l/r 24 gap 12: crew stack 30 avatars, 2.5 ground border, overlap −9, plus a 30 dashed `#b9bbc4` empty seat; line 13 muted.
- Trailer row top 620 l/r 20 r 20 `card` padding 8 14 8 8 gap 12: 60 thumb r 14 with 26 glass play disc; title 15/600; sub 13 muted.
- Bottom l/r 24 bottom 34 gap 10: ink pill "Take the seat"; text "Just look around first".
- **Taps** (not listed in the design; from current behaviour + 2.03): Take the seat → no pass yet: the short invited pass (current `invite/pass.tsx`), then 2.19; has a pass: join → 2.19; trip full → 2.18. Trailer → plays the trip trailer (full screen ✕). Just look around first → guest browse. Inviter row → none.

### 2.15 Join with a code · found it
- Header top 60: back; right floating pill "Paste a link" h 34 padding 0 13 r 17 white 13/600 `float` (should be the UIPasteControl styled to match: Q12).
- Title block top 116 l/r 24: "Got a code?" 32/700; 14.5 muted lh 1.4 mt 4.
- **Code tiles** top 220 l/r 20: 6-col grid gap 8; tile h 64 r 16 white, ring 2 `ink` (filled), 30/800 SF (not mono).
- Pasted line top 296 left 24: 16 mint disc with check, 12.5/600 `#1f7a55` "Pasted from Winston's message".
- **Found card** l/r 20 top 340 r 26 white `0 2 4 .06, 0 20 40 .12` padding 16 18: Tokek wave 86 at right −6 top −38; mono 10.5 muted "FOUND IT · WINSTON'S CREW"; "The Bali Six" 30/800 −0.035em mt 6; chips mt 8 gap 6 h 26 padding 0 10 r 13 `control` 12/600; footer mt 14 pt 12 over 1.5 dashed `field.border`: crew stack 28 (2 white border, overlap −8) + 13 muted "4 already in. Tokek is guiding."
- Bottom l/r 24 bottom 34 gap 8: ink pill "Join the Bali Six"; 13 muted "Wrong crew? Ask Winston for a new code".
- **Keyboard**: down in this state (code complete, card found). With the field focused the keyboard is up and the found card hides behind it; dismiss when the 6th character resolves.
- **Taps**: Paste a link → reads the clipboard (control). Code tiles → edit (focus the hidden input, keyboard up). Crew card → trip preview + who's in. Join → 2.19, or 2.18 if full. Wrong crew? → message Winston for a new code.

### 2.16 Join with a code · wrong code (keyboard up)
- Header top 58: back; centred "Join a crew" 17/600; 44 spacer.
- Title block top 120 l/r 28: "Type the crew code" 28/700; 15 muted mt 8.
- **Tiles, error**: top 236 l/r 24 grid 6 gap 8, h **62** r 16 white, ring 2 `#ff5fa8`, **mono 26/700** (different metrics from 2.15: Q3).
- Error line top 314 l/r 28 gap 8: error glyph + 13.5/1.4 `#b0306b` "No crew uses QX7BLI. Codes never use 0 or O, so check those letters." (copy is wrong for the real alphabet: Q13).
- Tokek glass note top 380: "Maya's message on your clipboard has **BALI6X**. Use that one?"
- Buttons top 448 l/r 16 gap 8: small ink "Paste BALI6X" h 48 r 24 15/600 with paste glyph; secondary h 48 r 24 `segment.track` "Scan QR" with QR glyph.
- **Keyboard** h 290 `#d1d3d9`: QuickType bar h 44 r 12 white .7 "Paste from Messages · BALI6X" (system AutoFill suggestion), then letter rows only (no bottom row drawn). Spec: `autoCapitalize="characters"`, `autoCorrect={false}`, `keyboardType="ascii-capable"` (codes contain digits: the bottom row must show), `textContentType="oneTimeCode"` only if we accept iOS's SMS code suggestion; return key **join** (or go); auto-submit at the 6th valid character. What stays visible above the keyboard (top y 554): title, tiles, error, note, the two buttons (end y 496).
- **Clipboard rule**: showing "BALI6X" before a tap requires reading the pasteboard (system paste alert). Keep "nothing is read until you tap": Tokek's note says "There's a code on your clipboard" via `detectPatterns` without the value, and the Paste button is UIPasteControl (Q12).
- **Taps**: Paste suggestion → fills and submits. Scan QR → camera code scanner (full screen ✕). Back → previous. Ask friend for link (way out; no control drawn).
- **Motion**: wrong code → tiles shake (Snappy, 3 cycles ±6 px) + error haptic; error line fades in (150 ms).

### 2.17 Invite ticket · ran out, three ways in
- Ground `linear(180deg, #eceef3, #f5f5f7 40%)` (OFF-TOKEN). ✕ glass top-left 20,58.
- Ticket l/r 36 top 128 h 232 r 26 white `0 0 0 .5 .06, 0 30 50 −24 .35`, clipped; content padding 18 at opacity .55 + grayscale: inviter 36 avatar, 12 muted "Maya invited you to", 22/800 crew name; three columns mt 22: label 10/700 +.1em placeholder, value 16/700 (code mono); dashed `field.border` rule at 150; crew stack 26 at bottom 18 opacity .5. **EXPIRED** rectangular stamp right 20 top 58 rotate −14°: padding 6 14, border 3 `#e0468e`, r 10, mono 22/900 +.12em `#e0468e`, fill white .6.
- Title top 384 l/r 28 centred: 26/700 (`emptyTitle`) "This invite ran out on Oct 3"; 15 muted mt 8 "Codes last 7 days. Maya can send a fresh one in a tap."
- Options card l/r 16 top 492 r 24 (rows as 2.08): pink tint tile + 32 inviter avatar "Ask Maya for a new code / She gets a one-tap "Send new invite""; rain tint + QR glyph "Use a different code / Type it or scan a QR"; booked tint + plus "Start your own crew / Plan a trip of your own".
- "Look around first" text button bottom 30.
- **Ways out**: Ask organiser · Other code (2.16) · Own crew (crew/new) · Browse as guest.
- The same layout serves revoked / used up / trip closed / unknown (current `InviteProblem` kinds) with the stamp word swapped (undesigned variants).

### 2.18 Trip full · glass sheet, your place in line
- Behind: trip photo h 420 with fade to ground from y 300; scrim `rgba(20,22,40,.18)`.
- **Banner** (in-app presentation of the `seat_opened` push) l/r 10 top 54 r 28 `rgba(250,250,252,.72)` blur 30 sat 1.9, inset top white .9, `0 20 40 −16 .4`, padding 12 14 gap 12: 38 tile r 11 mint with ticket doodle 32; title 14/700 "A seat opened on Lisbon" + "now" 12 muted; body 13 `ink.secondary`.
- **Sheet** inset 8, r 46, `rgba(248,248,250,.84)` blur 34 sat 1.8 (OFF .84 vs .86), padding 10 22 26, grabber mb 18: seat row h 64 r 20 white, 7 seats 36×40 r 12/12/8/8 gap 6 (crew colours, 12/700 `on.accent`; last "+" 2px dashed `#b9bbc4`); "Kyoto is full at 6" 24/700 centred mt 18; 14.5 muted centred mt 6; position pill mt 14 h 32 padding 0 12 r 16 maybe tint `#fff3c4` / `#8a6a0c` 13/700 with 20 sun disc "2"; buttons mt 20 gap 4: ink pill "Join the waitlist", "Not now" h 44 text; boost line: pink tag "BOOST" 10/800 padding 2 7 r 6 + 12 muted "Boosted trips fit 16".
- **Taps**: banner → take the seat within 24 h. Join the waitlist → second in line, pinged when a seat opens. Boost chip → ask the organiser to boost (9.20). Not now → back, nothing changes. Swipe down = Not now.

### 2.19 You're in · the crew manifest
- No header buttons. Mono header top 70 l/r 24, 10.5 +.08em muted "CREW MANIFEST · THE BALI SIX" / "5 OF 6".
- List card l/r 20 top 96 r 24 `card`: rows padding 10 14 gap 12: 34 avatar 13/700; name 15/600; status 12.5 muted (organiser, "6 critters", "just now", "not yet"); the newcomer's row `#fffbe8`; not-joined rows opacity .5.
- **ADMITTED stamp** 170 at 180,300 rotate −12°: rings 4 / gap / 1.5 `#e0468e`, text `#d6337f`, fill white .7: "ADMITTED" 10/800 +.2em, "RIN'S IN" 36/800, "BALI · OCT 12" 10/800 +.18em. Tokek cheer 120 hopping at 24,380 (overlaps the list on purpose).
- Text top 524 l/r 24: Borel 14/1.5 `#6b5a24` welcome line (api line or scripted, as today); 14 muted mt 10 "Five of six. Dev is the last one, and Tokek has already nudged him." (rule conflict: Q14).
- Bottom l/r 24 bottom 34 gap 8: ink pill "See the plan"; text "Say hi to the crew".
- **Taps**: person → member sheet (3.14). See the plan → trip plan (4.25). Say hi → crew chat (5.A) with a wave ready.
- **Motion in**: stamp falls (1.07, Lively) + confetti + Tokek hop; rows sync in as they arrive (fade 150 ms each).

### 10.01 iOS launch screen · still, light
- Ground radial `120% 70% at 50% 50%, #fff6c9 0%, #f5f5f7 62%`. **Passport cover** 200×262 centred (95,291), r 12/20/20/12, `linear-gradient(165deg, #ff9f55, #f47f2e 50%, #de6a1f)`, `inset 14px 0 rgba(110,35,0,.22), inset 15px 0 rgba(255,255,255,.12), 0 2 4 rgba(120,40,0,.15), 0 30 50 −20 rgba(160,70,10,.55)`; frame inset 12/12/12/24 r 12 1.5px `rgba(255,216,74,.7)`; "PASSPORT" mono 10/600 +.32em sun at top 34 (left 14); crest 96 at 59,68 gold conic (§6 icon table, Passport) inset 5 radial `#fffdf6→#ffefc2`, gecko wave 88 bottom −8; "CritterPass" Borel 21 sun, bottom 28. Gradient colours `#ff9f55 #f47f2e #de6a1f` are OFF-TOKEN (icon art).
- Build: one image (cover + glow, transparent outside the glow) on `backgroundColor #f5f5f7`, centred; RN first frame draws the identical cover at the identical centre.

### 10.02 First launch · stamp, then the welcome (filmed: `$SP/film/10/strip1.png`)
Design loop 5600 ms; the app plays once from the moment the native splash hides (skip the loop's 0–1.0 s hold, or keep ≤ 200 ms). Fractions × 5600:
| t (ms) | what |
|---|---|
| 1008 → 1568 | ISSUED stamp (112 disc at cover 104,150) appears at `translateY(−90) scale(2.2) rotate(−34°)`, falls to `scale(.9,.84) rotate(−14°)`, ease-in `cubic-bezier(.55,0,1,.45)` |
| 1120 → 1624 → 1960 | cover squash `translateY(4) scale(1.03,.96)` then rest |
| 1568 | 40 confetti from (.55,.55) of the screen; heavy haptic + thud SFX |
| 1568 → 1960 | stamp settles to `scale(1) rotate(−14°)` with overshoot `cubic-bezier(.2,1.4,.4,1)` → **Lively** |
| 3024 → 3808 | cover (with stamp) lifts to `translateY(−176) scale(.72) rotate(−5°)`, `cubic-bezier(.32,.72,0,1)` → **Smooth** ("zoom spring") |
| 3696 → 4144 | Tokek wave 116 sticker at 232,250 pops `scale 0→1, rotate −20°→−6°` (`cubic-bezier(.2,1.5,.4,1)`) → **Lively** |
| 3920 → 4312 / 4032 → 4424 | plane 58 at 40,120 (→ rot 12°), puffin 76 at 36,300 (→ rot −10°) pop → Lively, staggered 110 ms |
| 3920 → 4480 | bottom block (2.01's headline, ink pill, text button) rises 30 → 0 and fades in, `cubic-bezier(.2,.9,.3,1)` → Smooth |
- Stamp: 112 circle, rings `inset 0 0 0 3.5px #e0468e, inset 0 0 0 8px transparent, inset 0 0 0 9.5px #e0468e`, fill `rgba(255,253,246,.55)`, `#e0468e` text: "CRITTERPASS" 8 +.18em, "ISSUED" 23/800 lh 1.05, install date 8 +.14em ("10 OCT 2026", uppercase, localised).
- Reduce Motion: the stamp fades in (150 ms), no fall, no confetti; the cover cross-fades to its lifted state.
- Returning users: no stamp, no "Tokek waves" beat; native splash hides straight onto Home.

### 10.03 iOS launch screen · dark
- Ground `#1c1d24` + radial `90% 55% at 50% 50%, #2e2f3a 0%, #1c1d24 70%` (dark ground token is `#0e0f13`: OFF-TOKEN, Q15). Same orange cover; shadows `0 2 4 rgba(0,0,0,.3), 0 30 60 −20 rgba(0,0,0,.7)`. "The orange stays orange in dark mode."
- Build: `expo-splash-screen` `dark: { backgroundColor, image }` with a dark glow image.

### 10.04 / 10.05 Android 12+ splash (light / dark)
- Ground `#f5f5f7` / `#1c1d24`. Icon: the selected icon variant, **circle**, 160 visible inside a 240 dp icon (dashed guide circle at 75,302 marks the 240; note "240 dp icon · 160 dp shows") centred at 115,342. Light uses the light icon; **dark uses the dark icon variant** (charcoal Passport), contradicting 10.03 (Q15). Branding "CritterPass" Borel 22 at bottom 56: tangerine `#ff9a4d` (light) / sun `#ffd84a` (dark).
- Build: `windowSplashScreenAnimatedIcon` = adaptive-style icon drawable (240 dp with `windowSplashScreenIconBackgroundColor` = the icon's background), `windowSplashScreenBrandingImage` = wordmark PNG (≤ 200×80 dp), values-night for dark. No animation (the egg wobble frames and `with-splash-wobble.ts` go). The Borel wordmark must be an image (no fonts in the system splash).

## 4. Components

### (a) Foundations components used
Ink pill (primary), pressed/loading states (Save, Join, Sign in), secondary `segment.track` pill (52/r26), text button, small ink pill (Use, Paste BALI6X 48), floating white pill (Paste a link), glass nav circle (back, ✕), "2 of 4" progress (on ground, no white bar), field (focused, error with helper), place tags / sticker tags, round stamps, rectangular stamp (EXPIRED), list card + rows (40 tile, 15.5/600, 12.5 muted, chevron), crew stack, guide note (glass variant), photo card (white frame), sheet glass + grabber, crew colours, `card`/`float`/`ink`/`sticker` elevations.

### (b) New components this part needs
| Component | Metrics / states | Reused by |
|---|---|---|
| **PassportCover** | 200×262 r 12/20/20/12, three variants: launch (gradient + gecko crest, 10.01–10.03, feature graphic), welcome (flat tangerine + globe, 2.01, 184×250), returning (navy + gold line gecko, 2.02); props: scale, rotation, stamp slot | Part 9 pass, Part 10 store graphic |
| **PassCard** (paper pass) | paper `#fffdf6`, guilloche radial or linear, r 22–24, rotated −1.5…−2°; slots: number, photo (dashed empty / critter / photo), GIVEN NAME (live caret), HOME, STYLE, ISSUED, TRAVEL STYLE, MRZ 1–2 lines; sizes 170 (2.05), 150 slip (2.06), 300 (2.11) | Part 9 pass page, invited pass |
| **Stamp** | round: diameter 84–200, ring widths (3/8, 4/10–11.5), ink colour {pink `#e0468e`/`#d6337f`, orange `#e07a2a`/`#c45f16`, green `#2e9a74`}, fill paper alpha .25–.7, three text lines; rectangular: border 3 r 10 mono 22/900; `land()` runs 1.07 (fall, squash, ripple, jolt, confetti, haptic, SFX), Reduce Motion fade | 1.07, 4.x votes, 8.x critters |
| **WizardHeader** | back 44 + progress (n segments h 5 r 3 gap 4) + count 14/600, or chip variant (h 30 r 15 `segment.track` 12.5/700); persists across pages, segment fill animates (Snappy) | Part 4 wizards, Part 9 |
| **KeyboardDockedNext** | 44 high r 12 ink, 16/600, docked 8 above keys, side 6; mirrors the page's primary when the keyboard is down | all text-entry pages |
| **CodeTiles** | 6 tiles gap 8, states: empty, focused (caret tile), filled (ink ring), error (pink ring + shake), found; one hidden TextInput; paste, auto-submit | phone SMS code (undesigned), Part 9 join-by-code |
| **CrewTicket** | perforated boarding-pass card: photo strip 110, mono header, YOU → IATA route, notches 20, 3-col facts; expired variant (grey + stamp) | 3.x crew invites, store shot |
| **SeatRow** | seats 36×40 r 12/12/8/8, crew colours, dashed "+" | 3.x crew, 9.20 boost |
| **OptionsList** | card r 24 with 62 rows (tinted 40 tile, title, sub, chevron) | 2.08, 2.10, 2.17, Part 9 settings |
| **YellowHalftoneBand** | sun + dot texture 10 px, h 300–470 | 2.03, 2.04, empty states |
| **StickyNote** | `#fff6c9` r 4, Borel 14, tape 44×14 white .7, rotated ±5–7° | 2.01, store shots, feature graphic |
| **NoSignalChip** | h 30 r 15 `segment.track`, tangerine dot 7, 12/700 | Foundations offline pill differs (ink pill at y 56): reconcile |
| **LaunchStamp overlay** | §3 10.02 timeline as data (compile with `motion/dsl/compile` after converting the CSS keyframes) | — |
| **StoreFrame** (tooling, not app) | §6 | store-kit |

## 5. Motion and transition inventory

| # | Trigger | What moves | Properties | Spring / easing + duration | Evidence | Native or custom |
|---|---|---|---|---|---|---|
| M1 | App ready on first launch | 10.02 timeline (stamp, squash, confetti, lift, stickers, footer) | translate, scale (non-uniform), rotate, opacity | §3 10.02 table; Lively for settle/pops, Smooth for lift/footer | `film/10/strip1.png`; HTML `tg-kf` lines 64–75 of Part 10 | custom Reanimated on the UI thread; native splash hides under frame 1 |
| M2 | 10.02 end → 2.01 | cover, Tokek, plane, puffin hand over; collage appears | position/scale bridge | Smooth, then photos/tags/note pop staggered (Lively) | 10.02 final ≠ 2.01 | custom shared element (Q1) |
| M3 | 2.01 idle | cover bob, Tokek pop, five floaters | ty, r | linear loops 3600–5200 ms | Part 2 `tg-motion` lines 31–45 | existing presets |
| M4 | Open your pass | cover swings open, page grows into the pass card | rotateY (1600 perspective), rect | existing `passport-opening.ts` (0/260/560/680 ms) | current code; not in design | custom (keep) |
| M5 | Wizard page change | page content | slide | native stack push; WizardHeader stays put, segment fills | — | native stack + Snappy segment |
| M6 | Typing (2.05) | name + MRZ on the pass | text, caret | instant per keystroke | 2.05 | — |
| M7 | Name over limit | field ring pink, shake, haptic | translateX | Snappy | 2.06 (state) | custom |
| M8 | Quiz pick (2.07) | other card flings, tag thuds, next pair rises | translate, rotate, scale | Lively / Smooth | current `TasteQuiz` | custom (exists) |
| M9 | Home picked (2.09) | HOME stamp lands | 1.07 | Lively | 2.09 | Stamp component |
| M10 | Pass issued (2.11) | pass in, ISSUED + HOME stamps, confetti, Tokek hop | 1.07 + `hop` | Smooth, Lively | 2.11 + 1.07 | custom (exists, restyle) |
| M11 | Save sheet / waitlist sheet | sheet rises, page dims | translateY, scrim | Smooth | 2.12, 2.18 | native form sheet (iOS 26 inset glass sheet) |
| M12 | Permission granted / denied | tile badge pops / card greys | scale, opacity, saturation | Lively / 150 ms | 2.13 (undrawn) | custom |
| M13 | Code wrong | tiles shake, error line in | translateX, opacity | Snappy | 2.16 | custom |
| M14 | Code found | found card rises | translateY 24 → 0, opacity | Smooth | 2.15 | custom |
| M15 | Seat banner | banner drops from the top | translateY | Smooth | 2.18 | in-app banner (foreground push) |
| M16 | Admitted (2.19) | ADMITTED stamp, confetti, Tokek hop | 1.07 | Lively | 2.19 | Stamp component |
| M17 | Store shot 1 / 2 loops | swipe-vote card, marquee | — | — | Part 10 store HTML | not shipped (static captures) |

Reduce Motion: all of the above become 150 ms cross-fades; stamps appear without falling; idle loops park at rest; confetti off.

## 6. Native platform surfaces

### App icons (Part 10.A) — every variant × mode × shape
Design box 200×200; iOS mask radius 22.37%; Android shapes circle 50%, squircle 30%, teardrop `50% 50% 50% 14%`, art scaled **.8** inside non-iOS shapes. Rim: `inset 0 0 0 .5px rgba(255,255,255,.1)`; Clear rim `inset 0 1.5px 0 rgba(255,255,255,.75), inset 0 0 0 1px rgba(255,255,255,.35)`. Gold = `conic-gradient(from 210deg, #fff0a8, #e2a92a, #fff6c9, #c8901a, #ffe48a, #e2a92a, #fff0a8)`.

| Icon (gate) | Background (Light / Dark) | Layers back → front (full colour) | Mono layer (Clear, Tinted, Android themed) |
|---|---|---|---|
| **Passport** (default, free) | `linear(165deg, #ff9f55, #f47f2e 50%, #de6a1f)` / `linear(165deg, #2c2d36, #15161c)` | 1 spine x 0 w 22 full height, `rgba(110,35,0,.22)` (dark `rgba(0,0,0,.4)`) + 1px white .14 edge · 2 frame 36/14/14/14 r 16, 2px sun at .6 · 3 crest 122 at 50,39 gold, `0 3 8 rgba(80,25,0,.4)`, 1px white .55 ring; disc inset 7 radial `#fffdf6→#ffefc2` at 40% 28%, inner shadow; gecko wave 114 (seed 3) bottom −10 · 4 gloss `linear(140deg, white .2, transparent 38%)` | frame 2px em at .45; crest ring 6px em; gecko line art em; no spine |
| **Face** (free) | `radial(circle at 35% 25%, #fff3b8 0, #ffd84a 45%, #f2b92e 100%)` / `radial(circle at 35% 25%, #3a3b46, #16171d 72%)` | gecko 380 (seed 41) at −90,−30, full colour, cropped to the face | gecko line art em |
| **Stamp** (Pass+) | `radial(circle at 50% 30%, #2c2a44, #141226 78%)` / `radial(circle at 50% 30%, #22202e, #0c0b12 78%)` | 1 twenty 24 scallop dots `#d4a020` on r 78 around the centre · 2 seal 156 at 22,22 gold, `0 8 18 rgba(0,0,0,.5)` · 3 inner disc inset 11 `radial(circle at 50% 30%, #34305a, #17142a 80%)`, inner ring inset 6 1.5px sun .65 · 4 gecko cheer 116 (seed 9) ink sun, eye `#17142a`, no fill · 5 sparkles: 10 diamond `#fff0a8` at 26,30, 7 diamond at 170,156, sun glow | ring 6px em + ring at 14px em; gecko line em; no scallops/sparkles |
| **Sticker** (free) | `radial(circle at 28% 18%, #a6c4ff, #4f86ff 52%, #2c5fd2)` / `linear(165deg, #2c2d36, #15161c)` | 1 star 62 white sticker sun accent at 126,12 rot 16°, `drop-shadow(0 4 5 rgba(10,30,90,.3))` · 2 gecko wave 168 (seed 41) white sticker at 14,22 rot −8°, `drop-shadow(0 6 7 rgba(10,30,100,.38))` (dark `0 6 8 rgba(0,0,0,.5)`) · 3 gloss `linear(150deg, white .22, transparent 34%)` | gecko line art em; no star |

Mode colours: **Clear** bg `linear(160deg, white .46, white .14)` + blur 14 sat 1.7 (system glass), em `rgba(255,255,255,.97)`; **Tinted** bg `linear(165deg, #2e2e33, #111114)`, em = user tint (design default sun `#ffd84a`); **Android themed** bg `#e2e7d0`, em `#39461f` (system colours shown for preview; we ship only the white monochrome layer). Actual-size checks at 60 / 40 / 29 pt light and 40 / 29 dark.

**Export plan**
- iOS 26: one Icon Composer `.icon` per icon with groups = the layer numbers above; **Default** and **Dark** appearances set the fills above; **Mono** appearance = the line layers in white (the system derives Clear and Tinted from it). Drop the gloss layers on iOS 26 (the system adds specular), keep them in the legacy PNG fallback. `ios.icon` accepts a `.icon` path in current Expo; alternates through `cp-app-icon` need `.icon` support in `with-app-icons.ts` (verify Xcode 26 alternate `.icon` handling; today it copies baked light/dark/tinted appiconsets).
- Android: adaptive `background` = gradient (+ spine and frame for Passport, scallops for Stamp) on the 108 dp canvas; `foreground` = crest/gecko/star art inside the 66 dp safe zone (art .8); `monochrome` = line art from the mono render (update `app-icon-monochrome.mjs` FILL `#dfe5cc → #e2e7d0`, LINE `#3a4720 → #39461f`). One activity-alias per alternate, each with its own adaptive + monochrome.
- `export-app-icons.mjs` default `--variant face` → `passport`; design source `design/App Icon.dc.html` is replaced by the new file (complete redraw: halftone dots gone, Passport/Stamp/Sticker new).
- `with-app-icons.ts` `DEFAULT_ALTERNATE_IDS` `['face','pon','sardi','temple']` → `['face','stamp','sticker']` (Part 10 shows four icons; earned icons are Part 9's call: Q16). Pre-release DEV / STAGING badges stay.
- Switching an alternate icon on iOS shows the system "You have changed the icon" alert; nothing to design.

### Launch surfaces
| Surface | Today | Change |
|---|---|---|
| iOS launch | egg + halftone glow PNG 736 pt on `semantic.bg.base` | passport cover + sun glow, light + **dark** images, centred |
| Android 12+ splash | egg wobble animation-list (`with-splash-wobble.ts`, ≤ 1 s) | static icon in 240 dp with icon background + branding wordmark, light/night; delete wobble frames and plugin, or repurpose the plugin to set `windowSplashScreenIconBackgroundColor` and `windowSplashScreenBrandingImage` (expo-splash-screen does not write these) |
| First-launch overlay | `LaunchHatch` / `FirstHatch` (egg hatch, then "Tokek waves" on every later cold start) | 10.02 stamp once; later cold starts show nothing |
| Deferred link | `DeferredLinkGate` holds the splash ≤ timeout; iOS paste offer | unchanged logic; 2.03 visuals; decide stamp-vs-paste order (Q5) |

### Other native surfaces in Part 2
- System permission prompts from 2.13: notifications; **iOS 26 AlarmKit** authorisation for leave-by alarms (`plugins/with-alarmkit.ts` exists) — "Alarms and pings" is one card but two system prompts on iOS 26; Android 13+ `POST_NOTIFICATIONS` + exact alarms (`SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`); location when-in-use (2.10 one-shot, 2.13 trips); calendar full access (EventKit read; write-only is not enough to find free weeks).
- Camera (2.08 denied state, 2.16 QR scan via `react-native-vision-camera` code scanner), PHPicker (no permission).
- Sign in with Apple / Google system sheets (2.02, 2.12); Apple's button rules allow the custom ink pill with the Apple glyph; Google requires its multicolour G.
- UIPasteControl (2.03, 2.15, 2.16) via `expo-clipboard` `ClipboardPasteButton` (iOS 16+); Android has no equivalent (skip 2.03 there).
- `seat_opened` push (2.18 banner): system banner when backgrounded; in-app banner as drawn when foregrounded.
- Settings deep link (2.08, 2.13 denied).

### Store screenshots, feature graphic and listing (10.C, 10.D)

**Frame (`Store Shot.dc.html`)**: canvas 360×780 (App Store 6.9″, export ×3.583 → 1290×2796) and 360×640 (Play phone, ×3 → 1080×1920). Caption block top 50 (iOS) / 34 (Android), l/r 26, gap 14: kicker sticker padding 6 11 r 9, 2.5 white border, rotate −3°, 11.5/800 +.08em, default `ink` fill / white text, `0 4 10 .2`; title 38/800 (Android 33) −0.045em lh .98, ink `#17142a` (white on dark). Phone: left −15, top 272 / 212, 390×844 scaled .8 / .72, rotate = tilt, origin 50% 0, radius 56 / 44, bezel `0 0 0 10 #0b0b0d, 0 0 0 11 #2a2b30, 0 0 0 13 #9a9ca3, 0 50 80 −20 .55` (Android 9/10 rings), island 126×37 or punch-hole 20. Route: `M0 rin C120 rin−6, 240 rout+6, 360 rout`, `rin = py − 14 + (rin − .25) × 120`, stroke 3, dash 1 9 round, `rgba(23,20,42,.45)` (white .75 on dark); each shot's `rout` equals the next shot's `rin` (verified: .22, .29, .23, .28, .22). Sticky note max-w 150 at x 196 (side left) / 14 (side right), y py + 214 (Android +170), rotate ±5°, Borel 14 `#6b5a24` on `#fff6c9` with tape. Critter sticker 124 at x −14 / 248, y py + 330 (Android +262), rotate ∓10°, `drop-shadow(0 8 10 .28)`.

| # | Kicker | Title | Note | Ground | Critter, side, tilt | Source screen |
|---|---|---|---|---|---|---|
| 1 | DECIDE TOGETHER | Swipe to vote. The crew decides in minutes. | I'M IN!! | sun `#ffd84a` | gecko, right, −2° | 1.09 |
| 2 | PLAN | Pon drafts the whole trip while you watch | Must-dos first, naps after | tangerine `#ff9a4d` | tanuki, left, 2° | 4.17 |
| 3 | ON THE TRIP (sun kicker) | Your pickup, live in the Dynamic Island | Outside in 4 min | sky `#4f86ff`, dark text, phone `#7a8fa0` | puffin, right, −2° | 6.27 |
| 4 | WALLET | Boarding passes that work with no signal | Saved for the plane | mint `#54d6a4` | sardine, left, 2° | 7.10 |
| 5 | COLLECT (sun kicker) | Land somewhere new. Hatch a local. | Welcome to Bali! | ink `#1c1d24`, dark, time 13:50 | egg, right, −2° | 8.05 |
| 6 | REMEMBER | Every trip ends as a story | Day 1 to Day 8, wrapped | `#ff8fbf` (OFF-TOKEN) | axolotl, left, 2° | 8.10 |

Store-kit today captures real screens and composes a different frame from `packages/content/src/store/templates`; it needs this template (and the 6.3″ and tablet sizes in `devices.json` are not designed). Play shot 3 cannot say "Dynamic Island" (Q17).

**Play feature graphic 1024×500**: ground `radial(80% 120% at 72% 40%, #ffe58a 0%, #ffd84a 50%, #f4c535 100%)`, ink `#17142a`; dotted route `M470 470 C600 380, 560 250, 700 200 S900 90, 1010 40` stroke 4 dash 1 12 at .4; left block at 64,62 w 470 gap 24: App Icon 92 + "Group trips, planned with the locals." 62/800 −0.05em lh .96 + sticky note rotate −3° padding 13 16 10 paper `#fffdf6` Borel 19 "The locals happen to be animals."; launch cover at 650,96 scale 1.2 rotate 8° with ISSUED stamp "BALI · 2026"; stickers: gecko 160 at 560,28 (−10°), tanuki 120 at 880,46 (10°), puffin 124 at 560,330 (−12°), axolotl 130 at 868,318 (8°), plane 56 at 964,12 (24°), each `drop-shadow(0 8 10 rgba(120,80,0,.3))`. No tooling exists for it.

**Listing copy (en-GB, both stores)** — all within limits (checked):
| Field | Copy | n / max | Today |
|---|---|---|---|
| App Store name | CritterPass: Group Trips | 24/30 | same |
| App Store subtitle | Plan, vote and split together | 29/30 | same |
| App Store promo | Get your crew's next trip out of the group chat. Vote on where, let a local guide draft the days, split rooms and bills fairly, and hatch a critter wherever you land. | 166/170 | different |
| App Store keywords | group,travel,planner,itinerary,friends,split,bills,vote,holiday,budget,shared,critters,guide | 92/100 | different (repeats "group" from the name; Apple indexes the name already) |
| Play short description | Plan group trips together: vote, draft the days, split costs, collect critters. | 79/80 | "Group trips, planned with the locals. The locals happen to be animals." |
| Play title | CritterPass: Group Trip Plans | 29/30 | "CritterPass: Group Trips" |
Locale: design says en-GB; `store.config.json` and `listing/` are en-US + vi (Q18).

## 7. Logic and backend gaps (short)

1. **Ask the organiser for a fresh invite** (2.17): new command + notification kind with a one-tap "Send new invite" action; `packages/domain/src/notifications.ts` has only `crew_invite_received`, `invite_opened`, `seat_opened`. Backend.
2. **Waitlist place before joining** (2.18 "You'd be second in line") and the **seat-offer banner** with a 24 h window: tables exist (`invites.waitlist_position`, `seat_waitlist_offers` in `packages/db/migrations/20260928143000_invites_referrals_waitlist.sql`); verify the invite preview returns the would-be position. Possibly an API field.
3. **Trip trailer on the ticket** (2.14): proposal `trailer` format exists (`packages/domain/src/proposal/schemas.ts`); the invite preview must carry its media URL. Verify / API field.
4. **Town → nearest airport "Did you mean"** (2.10): the home search is bundled airports only (`features/onboarding/home/home-search.ts`); a misspelt town needs an online place lookup (existing places search or an LLM tool call per the agentic-first direction); offline keeps airports near you.
5. **One-shot GPS** for home (2.10): app-only (`modules/cp-location`); today only an IP hint.
6. **Pasted non-invite link saved for the first trip** (2.04): app-only device store, handed to Ideas when the first trip exists (`features/explore/search/link-paste.tsx` handles social links once a trip exists).
7. **Returning-install detection offline** (2.02): needs a reinstall-surviving marker (iOS keychain item; Android Block Store) to say "Welcome back" without signal. App-only native.
8. **Scan QR for a code** (2.16, 2.17): app-only (`react-native-vision-camera` is installed; no scanner in onboarding).
9. **Name reading line** (2.06 "ウィンストン"): no data; drop unless the founder wants it (Q9).
10. **Store kit**: new frame template, Play feature graphic renderer, listing copy updates. Tooling only.

## 8. Open questions

1. **10.02 → 2.01 handoff.** 10.02 ends on the gradient gecko-crest cover lifted to `translateY(−176) scale(.72) rotate(−5°)` with Tokek, plane and puffin; 2.01 shows a different cover (flat tangerine 184×250 with a globe, at 103,232, rotate −4°), two photos, two tags, five floaters and a sticky note. Pick one cover for both and let 2.01's collage pop in after the lift? (Recommended: keep the launch cover everywhere so "tapping the icon feels like opening it".)
2. **Wizard order.** Every-tap says name → taste (2.05 Next → 2.07) and home ← photo (2.09 Back → 2.08), i.e. name, taste, photo, home. The counters say name 1, photo 2, home 4 (2.10 says 3 of 4). Current app: name, photo, taste, home. Which order?
3. **Two page styles per step.** Header: segment progress + muted count (2.05, 2.07, 2.09) vs chip "n of 4" (2.06, 2.08, 2.10). Title: "What should the guides call you?" (2.05) vs "What goes on your pass?" (2.06). Field: h 56 r 18 20/600 (2.05) vs h 64 r 20 with floating label + counter (2.06). Search: white h 50 r 18 (2.09) vs system capsule h 48 r 24 (2.10). Code tiles: h 64 SF 30/800 (2.15) vs h 62 mono 26/700 (2.16). Proposed: one each, the first of every pair, with the edge states as states of the same page.
4. **Header buttons off-grammar.** ✕ top-right on 2.03/2.04 (Foundations: top-left; current `PasteLinkOffer` also puts it at the end); 2.14 and 2.19 have no way back at all.
5. **Paste offer vs stamp order** on a first launch with a probable link: show 2.03 before the stamp (current: over the native splash) or after it?
6. **Page titles off the type scale**: 27 (2.01), 28 (2.04–2.06, 2.16), 30 (2.02, 2.03), 32 / 34 / 26 elsewhere. Map to `largeTitle` 32 / `display` 34 / `emptyTitle` 26?
7. **Off-token colours** to accept or map: `#a8501a` NO SIGNAL text, navy passport `#2a2f5a/#1f2a52/#e9c77a`, pass-paper inks `#5d564b #b0a890 #c4b99f #d6ccb6 #9a917e #b9b0a0 #e9e2d0`, `#dcdde3` progress todo (foundations lists it under "2 of 4"), `#fffbe8` selected row, `#ffe6d3` tanuki tile, `#6b5a24` Borel note text, `#eceef3` gradient, `#ff8fbf` store ground, icon gradients.
8. **2.04 "Saved card · Remove it"**: swipe, a ✕ on the card, or tapping the check?
9. **2.06 reading line** (katakana under the name): keep (needs transliteration/reading data) or drop?
10. **Google button** must use Google's multicolour G (design shows a sky "G").
11. **2.12 "Use my phone number → SMS code, then 2.11"**: should be 2.13? The phone and SMS-code screens are not drawn in any part; build from the 2.05 field and 2.15 tiles?
12. **Clipboard privacy on 2.15/2.16**: "Paste a link" and "Paste BALI6X" + Tokek quoting BALI6X need a pasteboard read (system paste alert). Use UIPasteControl and a value-free note ("There's a code on your clipboard")?
13. **Code format.** The real alphabet `23456789ABCDEFGHJKMNPQRSTVWXYZ` (`packages/domain/src/links/codes.ts`) has no 0, 1, I, L, O, U, so the design's BALI6X and QX7BLI are impossible codes, and the helper should say "Codes never use 0, O, 1, I or L". Also the code appears as "KQ7·M3P" (2.03), "BALI-6X" (2.14) and "BALI6X" (2.15, 2.17): one display format?
14. **Naming people who haven't joined.** 2.14 "Dev hasn't opened his yet" and 2.19 "Dev is the last one, and Tokek has already nudged him" break the current rule in `ticket-model.ts` / `manifest-copy.ts` (a count, never a name, never claim a nudge we did not send). Keep the rule, or allow names and add an automatic nudge?
15. **Dark launch.** 10.03 ground `#1c1d24` + `#2e2f3a` glow (dark ground token `#0e0f13`); 10.03 keeps the orange cover "because it's the thing people tapped", but 10.05 Android dark shows the charcoal dark icon. Which way for Android?
16. **Earned icons** (`temple`, `sardi`, `home-set`, `pon`, `golden`, `bali-six` in `APP_ICON_CATALOGUE`) are not in Part 10's "four icons". Keep them (Part 9 9.03 decides) and redraw them in the new style?
17. **Play shot 3** says "Dynamic Island": Android needs its own caption (live notification / "on your lock screen").
18. **Listing locale and copy**: en-GB copy versus the en-US + vi listings today; replace the current Play title and short description with the design's?
19. **2.02 offline Sign in with Apple** is drawn enabled; disabled with a hint, or tap → "needs signal" and retry on reconnect?
20. **2.13 Let's go**: run the not-yet-asked prompts in sequence, or only finish (current: finishes)?
21. **10.02 date and double ISSUED**: the cover is stamped ISSUED with the install date at first launch, before any pass exists, then 2.11 stamps ISSUED again with the issue date. Intended?

Status: DONE_WITH_CONCERNS
Summary: Wrote the build spec for Part 2 (2.01–2.19) and Part 10 (launch 10.01–10.05 with the 10.02 timeline filmed, all four icons × light/dark/clear/tinted × Android shapes with layer construction, store frame and shots, Play graphic, listing copy), mapped to current routes, kit, native config and tooling.
Concerns/Blockers: Founder calls needed before building: the 10.02 → 2.01 handoff (cover art differs), wizard step order (taps and counters disagree), paired page styles that disagree, a privacy-rule conflict (naming people who haven't joined), and design invite codes that are impossible in the real code alphabet. iOS 26 alternate icons from `.icon` bundles through `cp-app-icon` still need checking.
