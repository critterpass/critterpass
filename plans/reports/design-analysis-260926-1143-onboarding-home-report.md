# Design Analysis: 3a Onboarding + 3b Home (21 screens)

Date 2026-09-26. Sources: `design/Critterpass.dc.html` (screen offsets 9619–176261), `Critterpass Prototype.dc.html` (x-dc script: flow(), trans(), otp(), badCode(), handle(), slideOff(), wake()), `doodles.js` (tg-motion presets, EASE map, doodle-art, tg-count/type/confetti), `critters-data.js`, `Site - Invite.dc.html`, `Site - Referral.dc.html`, 21 rendered screenshots, and cross-slice screen text (3c-1, 3d-1, 3f-3, 3g-3, 3l-2, 3n-1/2/4/6, 4e-1, 4f-1, 5b-4).
Stack-agnostic. "MISSING" means the design does not show that state.

Screenshot note: grey blobs in 3a-8, 3a-10, 3a-11, 3b-1, 3b-5 and 3b-8 are doodle-art captured mid draw-on. The source draws those critters in full colour. The only real silhouettes (`locked` attribute) are the 3a-9 gecko and the Morocco locals cp-097/098/099 in 3b-7/3b-8.

---

## 0. Key findings

1. **The pass is issued before any account exists.** The app needs a local-first draft-pass state machine, an anonymous user identity and a later upgrade to a permanent account, including a merge policy when the chosen Apple, Google or phone identity already owns a pass. The merge UI is MISSING.
2. **The splash has no "I already have an account / Sign in" path.** A returning user on a new phone would have to rebuild a pass before reaching 3a-7. This is a blocking gap.
3. **Invite fast path (3a-10) needs a deferred deep link that carries personal data** (invitee name, inviter, channel, seat). Firebase Dynamic Links shut down in Aug 2025. On iOS, deterministic deferred linking needs a pasteboard read (UIPasteControl or a paste prompt) or a third-party SDK, and fingerprinting is disallowed. So 3a-11 (code entry) is the real fallback and must be first-class. The web invite page already shows the code, with an expiry.
4. **Permissions are three toggles but four or more OS permissions.**
   - Alarms and pings = notifications + iOS 26 AlarmKit (to ring through DND) + Android exact alarm / full-screen intent (policy-restricted).
   - Location on trips = when-in-use, then background/Always, plus precise.
   - Calendar = iOS 17 full access (write-only is not enough).
   Re-ask-in-context needs a permission orchestrator. The invited path (3a-10→3a-13) skips 3a-9 entirely.
5. **3a-5 uses location ("nearest airports", "40 min away") before 3a-9 primes location.** Use coarse IP geolocation or locale, not a GPS prompt.
6. **Home is a crew-scoped state machine** (first_run / everyday / final_vote) fed by realtime crew events: votes, members, unread, needs-you. Its inbox resolves items from many other slices (3c, 3f, 3g, 3i, 3k) and supports undo of autonomous guide actions.
7. **LLM surfaces in this slice:** the streamed guide pitch (3b-3), the guest-guide place brief (3b-8), the Home tip (3b-2), the welcome line (3a-13), taste-tag inference from the inviter (3a-12), nudge copy, and city blurbs. All numbers shown in pitches (prices, flight hours, "$180 less") must come from data tools. The LLM only phrases them.

---

## 1. Slice overview

### 1.1 User goals
- New user: create an identity ("pass") in about 45 s with no password, feel the guide personality, save the pass, and grant only the permissions that matter.
- Invited user: get from a link or code to "I'm in the crew" in about 15 s, with prefilled data they can correct.
- Everyday user: see the next trip at a glance, take part in the "where next" argument, clear things that need them, and explore places, including places with no live guide.

### 1.2 Flows (from the prototype `flow()` and PARENT map)
```
NEW   3a-1 ─OPEN YOUR PASS→ 3a-2 → 3a-3 → 3a-4 (x6 Qs; proto jumps after 1) → 3a-5 → 3a-6
        3a-6 ─SAVE MY PASS→ 3a-7 (sheet) ─Apple/Google→ 3a-9 → 3b-1
                                          └─phone→ 3a-8 ─(auto after OTP)→ 3a-9 → 3b-1
      3a-1 ─"I have an invite code"→ 3a-11
INVITED  deep link → 3a-10 ─TAKE THE SEAT→ 3a-12 ─ISSUE→ [3a-7 sheet] → 3a-13 ─SEE THE PLAN→ 3f-3
                     └─"Just look around first"→ 3f-2          └─"Say hi to the crew"→ 3g-1
         3a-11 ─JOIN THE BALI SIX→ 3a-12 (same as above)
HOME  3b-1 ─guide cell→ hop + zoom → 3d-1 (new trip) | SOMEWHERE ELSE → 3b-7 (sheet) → 3b-8 (zoom)
      3b-1 ─JOIN WITH A CODE→ 3a-11 (sheet)
      3b-2/3b-6 header: HEY WINSTON → 3n-1 | crew name ▾ → 3g-3 (sheet) | crew pill → 3g-1 | bell → 3b-4 (or 3b-5 if 0)
      3b-2: Bali card → 3k-1 (zoom) | WHERE NEXT?/KYOTO → 3c-1 | LISBON sticker / +PITCH → 3b-3 (sheet) | Pon tip → 3d-1
      3b-6: split card → 3c-1 (zoom) | tally strip → 3c-1
      3b-4: boat card → 3g-2 | dinner card → 3k-5 | Kyoto replies → 3f-6 | Maya reacted → 3f-2 (sheet) | Jordan paid → 3i-5
      3b-8: PITCH TO THE CREW → Home(final) + "joins the vote after this one" | SOLO TRIP → solo trip
      Tab bar: HOME | TRIPS → 3k-1 | centre guide button → 3j-1 (sheet) | WALLET → 3h-1 | PASS → 3l-2
```

### 1.3 Entry points into the slice
- Cold launch (first install) → 3a-1.
- Universal link / App Link from the invite URL (web landing `Site - Invite`: "YOUR INVITE CODE SUNNY4, EXPIRES IN 3D 23:12:04", QR code, "app opens straight into the Bali Six, or the store") → 3a-10. Deferred after install.
- Code entry from: 3a-1 link, 3b-1 pill, 3g-3 Crews sheet "JOIN WITH A CODE", `Site - Home` "I have a code".
- 3n-1 Profile "RETAKE" (how you travel) → 3a-4 as a sheet. The quiz must run standalone.
- Tab HOME from anywhere. Widgets 5c-1/5c-2 (countdown, vote) and notifications (5b) deep-link to Home, Inbox or the vote.
- Referral link `critterpass.app/i/WINST8` (Site - Referral) is a second invite type (no crew).

### 1.4 Exits to other slices
3c-1 Vote showdown, 3c-2 winner reveal (after final closes), 3d-1 Destination guide, 3f-2 Proposal trailer, 3f-3 Your version, 3f-6 Who's in, 3g-1 Crew chat, 3g-2 Live collab, 3g-3 Crews, 3h-1 Bookings, 3i-5 Settle up, 3j-1 Guide chat, 3k-1 Trip hub, 3k-5 Flight delayed, 3l-2 Critterdex, 3n-1 Profile, 4f-1 seat-7 paywall (inviter side).

### 1.5 Motion vocabulary used by this slice (exact values from source)
- **Easing tokens** (doodles.js EASE): in `cubic-bezier(.55,0,1,.45)`, out `(0,.55,.45,1)`, io `(.65,0,.35,1)` (default), back `(.34,1.56,.64,1)`, lin. Screen transitions use `E = cubic-bezier(.32,.72,0,1)`.
- **Loop presets** (name: keyframes, ms):
  - bob: ty 0→-6→0, 2400
  - float: ty0 r-2 → ty-9 r2, 4200
  - wiggle: r-4↔4, 1600
  - pulse: s1→1.07, 1600
  - ping: s.6 o.8 →s1.5 o0 (out), 1800
  - blink: o1→.25, 1200
  - hop: squash sy.9 → jump ty-14 sy1.05 → land sy.94 → settle in the first 42%, 2600
  - rise, grow, tug, spin, marquee also exist.
  All loops share a global clock so loops stay in sync. Honour reduced motion: doodles.js skips all animation under `prefers-reduced-motion`.
- **Screen transitions** (prototype `trans()`):

  | Name | Spec |
  |---|---|
  | push | 480 ms; in from 100%, out to -30%, scrim 0→.5 |
  | pop | 420 ms |
  | sheet | 540 ms; out scales to .93, scrim .45 |
  | rise | 620 ms, +120 ms delay |
  | dismiss | 420 ms |
  | zoom (shared-element "grow into page") | 560 ms: scale from source rect, clip-path inset radius 22/s → 54 px, opacity 0→1 by 35% |
  | unzoom | 460 ms |
  | burst | out 360 ms ease-in to scale .9; in 640 ms `cubic-bezier(.2,1.3,.35,1)` from scale 1.2, delay 120 ms; white flash 460 ms peaking .55 |
  | fold | out 380 ms `(.5,0,.75,0)`; in translateY 70 px, 560 ms, delay 160 ms |
  | flip | out rotateY 0→90°, 260 ms; in -90→0°, 420 ms, delay 260 ms, perspective 1600 px |
  | tab | fade 240 ms + content translateY 12 px → 0 over 420 ms; tab icon bounce -5 px, scale 1.18, 420 ms |
  | fade | 300 ms |

- **Micro-interactions:**
  - Press: scale .92/.96/.975 depending on width (<120, <240, larger), 130 ms `(.3,.7,.4,1)`. Release overshoot to 1.035, 420 ms ease-out.
  - Toggle: 380 ms knob overshoot `(.3,1.5,.5,1)`, bg .25 s.
  - drop: -18 px → 0, 380 ms `(.3,1.5,.5,1)`.
  - shake: ±8/7/5/3 px, 420 ms.
  - slideOff: translateX(110%) rotate 4°, 360 ms `(.5,0,.75,0)`, then height collapse 320 ms E.
  - pop: scale 1.12, 360 ms.
- **Island toast** (in-app confirmation): pill 122×35 → 360×62, 440 ms `(.2,1.25,.3,1)`; content fades in 220 ms, staggered 40 ms; auto-hide 2800 ms; collapse 400 ms. This is an in-app overlay mimicking the Dynamic Island, not a real Live Activity. Non-DI devices need a top-banner variant.
- **Gestures:** left-edge (<28 px) swipe back, commit at >110 px or velocity >.55. Sheet drag-down commits at >150 px.
- **doodle-art:**
  - Critters draw themselves on in 1500 ms (other doodles 700 ms), easeInOutQuad, with a sticker outline that fades in.
  - Blink every 2.6–6.2 s for 150 ms.
  - Poses: idle, wave, cheer, point, think, sleep, crack (egg).
  - A `locked` colour gives a flat silhouette.
- Canvas designs loop entrance keyframes on 9000 ms cycles. In the app, all "enter" keyframes (e.g. `0:ty-40 … .07:ty0`) are one-shot: keyframe fraction × 9000 ms = real duration.

---

## 2. Per-screen specs

### 3a-1 Splash
- **Purpose:** first impression and the fork between a new pass and an invite code.
- **UI:**
  - Bg #17142a with a yellow dot grid (radial 1.3 px at 10 px pitch, 14% alpha, mask fading at 55%).
  - Orange passport cover 240×330 (#ff9a4d, radius 12/24, inner gold rule, globe emblem, "CRITTERPASS" and "PASSPORT · PASSEPORT" in Archivo 800 with letter-spaced gold #ffd84a).
  - Five floating guide stickers (tanuki, puffin, sardine, axolotl, alpaca) and Tokek (gecko, pose wave) hanging off the top edge.
  - Tagline "Your pass to every place, and the locals who live there."
  - Primary CTA "OPEN YOUR PASS" (yellow pill 58 h with a skewed white sheen).
  - Text link "I have an invite code".
- **Data:** none (static, localised).
- **Actions:** OPEN YOUR PASS → 3a-2. Invite code → 3a-11.
- **Motion:**
  - Passport: kf `0:r-4 ty0; .5:r-2 ty-6`, 4200 ms io loop.
  - Cover sheen: gradient band 105°, sx 1→.3→1, 5000 ms.
  - Tokek pop-up: `0:ty0; .4:ty0; .5:ty-10 e=out; .6:ty0 e=in`, 3600 ms (≈360 ms up/down every 3.6 s).
  - Critters: float at 4200/4800/4400/5000/4600 ms with delays 0/600/300/900/1200 ms.
  - CTA sheen: `tx-140→420` over the first 30% of 3600 ms, io.
  - OPEN YOUR PASS "swings the cover open like a real passport and the first page fills the screen": 3D rotateY around the left spine (perspective ≈1600 px, flip timings 260+420 ms), then the inside page becomes the 3a-2 pass card (shared element).
- **States:** designed = idle only.
  - MISSING: "Sign in / I already have a pass" for returning users (critical); deep-link-in-progress / loading while a deferred link is resolved; offline first launch (fonts and critter code must be bundled).
- **AI:** none.
- **Realtime:** none.
- **OS:**
  - Haptic on cover open (medium impact).
  - Optional SFX (page flip). Respect the silent switch (ambient audio session).
  - Deferred deep link check on first launch (Play Install Referrer on Android; pasteboard/SDK on iOS). If found, skip to 3a-10.
- **Entitlements:** none.

### 3a-2 Your name (PAGE 1 OF 4)
- **Purpose:** capture the display name. The pass fills live.
- **UI:**
  - Progress "PAGE 1 OF 4" + 4 dots (active 18×8 yellow, rest 8×8 #3a3466).
  - Pass card (cream #f4efe4 with guilloché radial patterns, 250 h): "CRITTERPASS · PASSEPORT", number "CP-0427", dashed "?" photo slot, GIVEN NAME · PRÉNOM "Winst" with a pink caret.
  - Placeholders HOME "Not yet", ISSUED "Not yet", TRAVEL STYLE "We'll ask".
  - MRZ lines `P<CPWINST<<<…` / `CP0427<<<…<<00`.
  - H1 "WHAT SHOULD THE GUIDES CALL YOU?" (Archivo 900, 40 px, stretch 70%).
  - Input (56 h, #1f1b38, 2 px yellow focus ring).
  - Tokek (pose point, bob 2200 ms) + Caveat line "Just a first name is fine. I'm Tokek, so I can't judge."
  - CTA NEXT.
- **Data:** `pass_draft.given_name`. Pass number (already allocated: "CP-0427" is shown before the account exists). MRZ derived.
- **Actions:** type → mirror onto the pass + MRZ. NEXT → 3a-3.
- **Motion:**
  - Pass card enters `0:ty30 o0 e=out → .08:ty0 o1` (≈720 ms at 9 s scale; use 600–720 ms).
  - Each typed letter "lands" on the pass in the same frame (per-glyph drop/fade 120–180 ms). MRZ line rewrites itself (character substitution, optional odometer-style roll).
  - Tokek's line "reacts once you stop typing": debounce ≈600–800 ms, then swap the Caveat line (typewriter tg-type 40 ms/char, +260 ms at , . ?).
- **States:** designed = typing.
  - MISSING: empty (NEXT disabled?), max length / overflow on the pass (ellipsis exists in CSS), non-Latin names (Archivo has no CJK; MRZ needs ICAO 9303 transliteration), emoji, profanity policy, keyboard-dismissed layout.
- **AI:** the reaction line. Recommend a scripted pool (pre-account, offline, no user text sent to an LLM). If an LLM is used: input the name → one line ≤80 chars in Tokek's voice; moderate the input.
- **OS:** auto-focus with the keyboard up; `textContentType = givenName` (autofill from Me card); light haptic per glyph optional.
- **Entitlements:** none.

### 3a-3 Your photo (PAGE 2 OF 4)
- **Purpose:** avatar = a guide sticker (default) or a real photo as a sticker.
- **UI:**
  - H1 "PICK YOUR PASSPORT PHOTO", "Any guide works. You'll earn more faces on the road."
  - Photo frame 132×160 cream, rotated -3°, with the CP-0427 label; the selected sticker bobs inside.
  - 3×2 grid of 84 px circles for the 6 live guides; selected has a 3 px bg gap + 6 px yellow ring.
  - Chip "USE A REAL PHOTO". CTA "THAT'S ME".
- **Data:** `pass_draft.avatar = {type: guide|photo, guide_id | asset_id}`. Guides list: 6 live guides, not the full Critterdex.
- **Actions:** tap guide → select. USE A REAL PHOTO → camera or library → sticker cut-out. THAT'S ME → 3a-4.
- **Motion:**
  - Tapping a guide drops it into the frame with a camera-flash blink (white overlay 0→.55→0, ≈460 ms) and it switches to pose wave.
  - Frame tilts a little on each change (random ±2–4° spring).
  - Frame content bobs (2400 ms).
  - Real photo gets "the sticker treatment, a white cut-out edge".
- **States:**
  - MISSING: camera/photos permission denied; capture UI; crop; segmentation failure (no subject found); upload progress; moderation rejection; what a photo looks like in the pass slot.
- **AI/ML:** on-device subject segmentation to make the sticker. iOS Vision foreground instance mask (iOS 17+); Android ML Kit subject segmentation. Then an outline stroke. Optional server image moderation (crew-visible).
- **OS:** camera (NSCameraUsageDescription); PHPicker / Android Photo Picker (no permission). Haptic selection on tap.
- **Entitlements:** none. Future "earned faces" (critter avatars from the Critterdex, 3n-4) come later.

### 3a-4 This or that (PAGE 3 OF 4, "3 OF 6")
- **Purpose:** taste quiz, 6 binary questions replacing a chip list. "The crew's answers later drive the compromise."
- **UI:**
  - Two stacked cards 206 h, radius 26, halftone dots: top yellow "SUNRISE SUMMIT / Up at 3, on top by 6" (gecko cheer + sun doodle); bottom blue "SLEEP TILL TEN / Breakfast is a lifestyle" (gecko sleep).
  - "OR" disc 56 px.
  - "ON YOUR PASS SO FAR" stamp chips: STREET FOOD (pink outline, -4°), EASY-ISH PACE (green outline, +3°), dashed "?".
  - Tokek wiggle + "Tap one. There are no wrong answers, only late ones." No CTA: a tap answers.
- **Data:** `taste_answers[q_id] = option_id`. Derived `taste_tags[]` (e.g. SUNRISE CHASER / STREET FOOD / EASY-ISH PACE; pass shows short forms "SUNRISE · STREET FOOD · EASY").
  - Tag taxonomy seen across the design: SUNRISE CHASER, STREET FOOD, BEACH NO PLANS, MUSEUMS, NIGHT OWL, BIG HIKES, PHOTO DUMPS, CHAOS IS FINE, EASY-ISH PACE (prototype `taste()` legacy chips; 3n-1; 3f-3).
- **Actions:** tap a card → answer → next question; after Q6 → 3a-5. The prototype jumps to 3a-5 after one answer, with toast "Sunrise chaser. Tokek approves."
- **Motion:**
  - Top card bobs `0:ty0 r0; .5:ty-6 r-1`, 3000 ms.
  - Picking flings the other card away (prototype fling: translate ≈480 px along its vector, rotate ±50°, 560 ms `(.55,0,.8,.3)`).
  - The answer becomes a stamp that thuds onto ON YOUR PASS: stamp kf scale 2.2→.94→1.04→1, ≈1 s, with haptic + thud SFX.
  - The next pair enters (MISSING spec; suggest a rise from below, 460 ms E).
- **States:** designed = mid-quiz.
  - MISSING: the other 5 questions' content; back/undo an answer; skip; the final summary; the 3n-1 RETAKE entry (as a sheet), where the result overwrites the profile.
- **AI:** none at capture. Tags later feed pitch reasons (3b-3), personalised proposals (3f-3) and itinerary compromise (3c).
- **OS:** haptic (heavy impact on stamp), SFX.
- **Entitlements:** none.

### 3a-5 Home base (PAGE 4 OF 4)
- **Purpose:** home airport. Used for flights and budgets. It is also the first stamp.
- **UI:**
  - H1 "WHERE'S HOME?", "Flights and budgets start here. It's also your first stamp."
  - Search field (plane icon, "Sing").
  - Result rows: IATA (Archivo 22, yellow when selected), airport name, subline "Singapore · SGD" or "Malaysia · 40 min away". Selected row has a 2 px yellow ring and a check.
  - Circular stamp 150 px "HOME · RUMAH / SINGAPORE / STAMP No. 1" (local-language word for "home").
  - CTA "THAT'S HOME".
- **Data:** Airport {iata, name, city, country, currency, lat/lng}. Distance or drive time from the user. `pass_draft.home_airport`. Derived `home_country` (ISO alpha-3 SGP for the MRZ) and default `home_currency` (SGD, feeds 3n-8 and 3i). Localised home word per country (RUMAH).
- **Actions:** type → narrowed results (nearest first). Tap row → select + ink stamp. CTA → 3a-6.
- **Motion:**
  - Results narrow per keystroke (list diff animation).
  - Picking "inks the HOME stamp in its colour" (ink-spread/fill reveal ≈300–400 ms).
  - Stamp idles `0:r-8 s1; .5:r-6 s1.03`, 2600 ms.
  - The stamp is a shared element that lands on the pass in 3a-6.
- **States:**
  - MISSING: no results; offline (bundle the airport dataset); location unknown; city with multiple airports (e.g. "all London airports"?); user lives far from any airport; loading.
- **AI:** none.
- **OS:** location is needed for "nearest" and "40 min away" but has not been primed yet (3a-9 comes later). Use server IP geolocation / device region; no GPS prompt here.
- **Entitlements:** none.
- **Inconsistency:** the stamp is yellow here and orange (#ff9a4d) on 3a-6.

### 3a-6 Pass issued
- **Purpose:** the reward moment. Everything is combined and the pass is "issued" before any account.
- **UI:**
  - Full pass card 330 h: guide photo (gecko recoloured fill #54d6a4), WINSTON, HOME SINGAPORE · SIN, ISSUED 26 SEP 2026, TRAVEL STYLE SUNRISE · STREET FOOD · EASY.
  - MRZ `P<SGPWINSTON<<…` / `CP0427<<SGP<<SUNRISE<FOOD<EASY<<<<<<01` (trailing 00→01 appears to count stamps or pages; confirm).
  - Pink ISSUED stamp (124 px, -14°, "CRITTERPASS / ISSUED / 26 SEP 2026"). Orange HOME stamp (86 px, +10°, "HOME / SIN").
  - Tokek cheer hopping. H1 "YOUR PASS IS READY", "One stamp so far…".
  - CTA "SAVE MY PASS" + "Takes ten seconds. No password."
- **Data:** Pass {number, given_name, avatar, home_airport, issued_at (today, local), taste_tags, mrz_lines, stamps[{type: home, …}]}.
- **Actions:** SAVE MY PASS → 3a-7 (sheet).
- **Motion (one-shot):**
  - t0: pass drops `ty-40 r-8 o0 → ty0 r-2 o1` with back easing, ≈630 ms.
  - t=900 ms: ISSUED slams `s2.2 o0 (in) → .94 → 1.04 → 1` (contact at ≈450 ms, settle by ≈990 ms), with a thud (SFX + heavy haptic), a small screen jolt, and confetti (80 pieces from 50%/30%, colours yellow/pink/blue/green/cream/orange, gravity .32/frame, drag .985).
  - t=1500 ms: HOME stamp lands with the same kf.
  - Tokek hops in (hop 2600 ms loop).
- **States:** success only.
  - MISSING: pass-number allocation failure (if server-allocated), offline issuance (issue locally and sync later).
- **AI:** none.
- **OS:** haptics (heavy ×2), SFX, reduced-motion variant (no confetti, fade stamps).
- **Entitlements:** none.

### 3a-7 Save your pass (sheet)
- **Purpose:** convert anonymous → account. "So your pass, critters and crews survive a lost phone. We never post anything for you."
- **UI:**
  - Pass visible under a scrim (rgba(8,6,18,.6)).
  - Sheet (radius 32 top, grabber): "SAVE YOUR PASS" eyebrow, H1 "KEEP IT SAFE".
  - Buttons: Continue with Apple (cream #f4efe4 fill), Continue with Google (dark, blue "G"), Use my phone number (outline).
  - Legal line with Terms / Privacy.
- **Data:** auth identity; links the anonymous user to a provider.
- **Actions:** Apple/Google → native auth → 3a-9. Phone → 3a-8.
- **Motion:** sheet rises (540 ms E). After sign-in the sheet dismisses, the pass slides back up and a small SAVED tick lands in its corner (≈300 ms pop), then push to 3a-9.
- **States:**
  - MISSING: provider cancel, provider error, network error, identity already linked to another pass (merge vs switch), SIWA hide-my-email, "Not now / skip" (none drawn; the sheet has no close control apart from a drag-down), in-progress spinner.
- **AI:** none.
- **OS:**
  - Sign in with Apple (AuthenticationServices; required to offer when Google is offered, App Store Guideline 4.8).
  - Google via Credential Manager on Android and Google Sign-In SDK on iOS.
  - Compliance: the cream Apple button and single-colour "G" may violate Apple HIG button styles and Google branding. Use the approved styles.
- **Entitlements:** none.

### 3a-8 Phone sign-in
- **Purpose:** SMS OTP alternative.
- **UI:**
  - H1 "YOUR NUMBER" + copy. Lundi the puffin (pose wave, float 4000 ms) top-right; why the puffin rather than Tokek is unexplained.
  - Phone card: country chip "+65" (derived from home country) + "9123 4567".
  - "Code sent to +65 9123 4567". Six OTP boxes 46×56 (active box yellow ring with blinking caret, 900 ms).
  - "OR" divider; CONTINUE WITH APPLE / GOOGLE outlines; legal + "We never post anything for you."
- **Data:** phone E.164, verification id, code.
- **Actions:** enter number → send code (entry step not drawn; the screen shows the post-send state). Autofill code → verify → 3a-9.
- **Motion (prototype otp()):**
  - Remaining digits drop in at 450 / 710 / 970 ms (drop 380 ms `(.3,1.5,.5,1)`).
  - At 1350 ms all boxes ring green (#54d6a4, .2 s) and each hops -5 px (300 ms, staggered 45 ms).
  - Puffin switches to cheer + pop ("claps"); the pass gets its SAVED tick.
  - At 2150 ms auto-navigate to 3a-9.
- **States:** designed = mid-autofill.
  - MISSING: number entry + country picker; invalid number; send failure; resend with countdown; wrong code (shake + pink like 3a-11); expired code; too many attempts / rate limit; SMS not arriving (voice fallback?); change number; loading.
- **AI:** none.
- **OS:**
  - iOS: `textContentType .oneTimeCode`; SMS body with domain-bound code (`@critterpass.app #123456`).
  - Android: SMS Retriever API (app hash in SMS, no READ_SMS) or SMS User Consent.
  - Success haptic.
- **Backend:** SMS verification provider plus anti-SMS-pumping (per-number/IP/device rate limits, country allowlist, App Attest / Play Integrity).
- **Entitlements:** none.

### 3a-9 Permissions, in context (LAST STEP)
- **Purpose:** prime 3 permission groups, each with a live demo. "Say no to any of them. I'll ask again when it actually matters."
- **UI:** "← YOUR PASS", "LAST STEP" (yellow), H1 "THREE THINGS, AND WHY". Three cards (#1f1b38, radius 22), each with an 88×80 demo tile, title, reason and a 46×28 toggle:
  1. **ALARMS AND PINGS** — "Leave-by alarms and votes that need you. About five a day." Demo: a "LEAVE BY 03:10" mini card drops in. Toggle ON.
  2. **LOCATION, ON TRIPS** — "Critters only appear where you actually are. Off when you're home." Demo: green ping ring behind a locked gecko silhouette with "?". Toggle ON.
  3. **CALENDAR** — "So the guide can find a week everyone can make." Demo: mini availability bars (blue) with a pulsing yellow "fit" bar. Toggle OFF.
  Tokek (point, bob) + Caveat line. CTA "LET'S GO", "Ask me later".
- **Data:** client permission states + server mirror {notifications: granted|denied|provisional|not_determined, alarms (AlarmKit): …, location: none|when_in_use|always, precise: bool, calendar: none|full}. "Ask later" timestamps and trigger contexts.
- **Actions:**
  - Flip toggle ON → OS prompt(s); reflect the result. Flip OFF → cannot revoke an OS grant; only an app-level opt-out.
  - LET'S GO / Ask me later → 3b-1.
- **Motion:**
  - Leave-by card `0:ty-40 o0 e=back; .15:ty0 o1; .8:ty0 o1; .9:ty-40 o0`, 4000 ms loop (600 ms in, hold, 400 ms out).
  - Ping ring 2000 ms (ping preset). Calendar fit bar pulse 1400 ms.
  - Toggle knob overshoot 380 ms `(.3,1.5,.5,1)`.
- **States:** designed = two on, one off. Unclear whether the defaults are OFF or pre-ON (see Q).
  - MISSING: OS denied → toggle snaps back plus "Open Settings" affordance; previously denied (no re-prompt possible on iOS/Android after 2 denials); partial grants (approximate location, provisional notifications, when-in-use only); Android 13+ notification prompt; iOS <26 (no AlarmKit) fallback copy.
- **AI:** none.
- **OS mapping (critical):**
  - **Alarms and pings:**
    - iOS: UNUserNotificationCenter (alert, badge, sound) + time-sensitive notifications entitlement + Communication Notifications (per-guide sender avatar, 5b) + AlarmKit authorization (iOS 26+) for leave-by alarms that ring through DND/silent.
    - Android: POST_NOTIFICATIONS (13+); SCHEDULE_EXACT_ALARM (denied by default for new installs on 14+) or USE_EXACT_ALARM (Play policy, alarm apps only); USE_FULL_SCREEN_INTENT (14+ restricted); an alarm-usage notification channel.
  - **Location on trips:**
    - iOS: when-in-use first, then escalate to Always at trip start (encounter ring counts while locked, 3l/5a); temporary full accuracy for the 50 m radius; CLMonitor/geofences.
    - Android: FINE + BACKGROUND (separate Settings step on 11+) + a location-type foreground service; Play background-location declaration.
    - "Off when you're home" = app logic (trip dates / home geofence).
  - **Calendar:** iOS 17+ `requestFullAccessToEvents` (reads free/busy); Android READ_CALENDAR. Alternative: server OAuth free/busy (Google/Microsoft) for cross-device use.
  - "Ask me later" = provisional notifications (iOS quiet delivery) + scheduled contextual re-ask:
    - first vote needing you → notifications;
    - trip start / landing → location;
    - 3c date finding → calendar.
- **Entitlements:** none (the live crew map is Boost, but location permission is not gated).
- **Gap:** the invited path never visits 3a-9.

### 3a-10 Invite, a seat for you
- **Purpose:** a personalised crew ticket from a friend's link.
- **UI:**
  - Warm radial glow.
  - Inviter row: avatar "W", "Winston saved you a seat", "Opened from WhatsApp · 2 min ago".
  - H1 "RIN, YOU'RE COMING TO BALI" (46 px).
  - Yellow ticket card (radius 22, diagonal hatch, notch cutouts, perforation): "CRITTERPASS AIR · CREW TICKET", code "BALI-6X", "YOU / WHEREVER" --plane-- "DPS / BALI", DATES OCT 12–19, SEAT 5 OF 6, EACH ~$1,240; stub with avatars W M A J and "Winston, Maya, Alex and Jordan are in. Dev hasn't opened his yet."
  - Tokek waving (float 3800 ms).
  - Trailer card "THE 40-SECOND TRAILER / Volcano, boat day, the villa pool." with play button.
  - CTA "TAKE THE SEAT", link "Just look around first".
- **Data:** InvitePreview {invite_id, inviter {name, avatar}, invitee_name (Rin), channel (whatsapp), sent_at/opened_at, crew {name, member_count, cap}, trip {destination name, IATA DPS, dates, per_person_estimate {amount, currency}}, members[{initial, colour, status: joined|not_opened}], seat_no, trailer_id, code}. The origin is "WHEREVER" because the invitee's home is unknown (yet 3a-12 shows HOME SIN prefilled: conflict).
- **Actions:** TAKE THE SEAT → 3a-12. Just look around first → 3f-2 trailer (read-only browse before any account). Trailer tap → 3f-2.
- **Motion:**
  - Ticket slides up and settles crooked `0:ty60 r6 o0 e=back → .08:ty0 r-2 o1` (≈720 ms).
  - Plane wobbles along the dashed route tx 0→10→0 (2600 ms).
  - Tokek float. CTA sheen.
- **States:**
  - MISSING: invite expired/revoked; crew full (seat 7 on the invitee side); trip cancelled/past; already a member (route to Home); link opened by someone other than Rin (forwarded link shows another person's name); no deferred data (fallback to 3a-11); trailer not ready yet; loading skeleton.
- **AI:** the trailer is generated media in 3f (dependency). Ticket text is templated.
- **Realtime:** member statuses live (Dev opening his invite updates the line). Opening this screen emits an `invite.opened` event, so the inviter sees "opened" (4f-1 "Opened it 3 times").
- **OS:** Universal Links / App Links (apple-app-site-association, assetlinks.json); deferred deep link (Play Install Referrer; iOS pasteboard via UIPasteControl or SDK); share-channel attribution (per-channel link param) for "Opened from WhatsApp".
- **Entitlements:** free crews cap at 6 (SEAT n OF 6). A 7th seat → Boost (4f-1, inviter side).

### 3a-11 Join with a code
- **Purpose:** manual fallback. "Six letters from whoever invited you. The same code works for a crew or a single trip."
- **UI:**
  - Dot-grid header, "← BACK", "Paste a link" (top-right), H1 "GOT A CODE?".
  - Six boxes 48×60 (green ring when valid). "✓ Pasted from Winston's message".
  - Found card (yellow, radius 28): "FOUND IT · WINSTON'S CREW", "THE BALI SIX", chips "BALI · OCT 12–19", "~$1,240 EACH", avatars M A J R + "4 already in. Tokek is guiding."
  - Tokek sticker on the card corner (bob 2600 ms). CTA "JOIN THE BALI SIX", link "Wrong crew? Ask Winston for a new code".
- **Data:** code (6 chars; example BALI6X includes a digit; the web says "letters and numbers"; the web example SUNNY4 has an expiry). Resolve → {target_type: crew|trip, crew/trip preview, inviter name, guide}. Pasteboard provenance "from Winston's message" (needs the pasted text's sender, which is not knowable from the pasteboard; likely inferred from the resolved invite's inviter).
- **Actions:**
  - Type/paste → auto-lookup on the 6th char.
  - Paste a link → read the pasteboard (link or code).
  - JOIN → 3a-12. Wrong crew → back.
- **Motion:**
  - Boxes drop in staggered 70 ms from 420 ms.
  - "Pasted" line reveal at 900 ms and card reveal at 1000 ms (opacity + translateY 12 px, 460 ms E).
  - Tokek lands on the card corner: scale 0 rot -24° → 1, 520 ms `(.3,1.6,.5,1)`, delay 1300 ms.
  - "On the sixth, the boxes ring green and the crew card unfolds."
  - **Wrong/expired (designed in prototype):** boxes ring pink #ff5fa8, row shakes 420 ms, island toast "No crew uses BALI7Y. Ask whoever invited you for a new code." Recovers after 1700 ms.
- **States:** designed = found and wrong.
  - MISSING: lookup loading; expired (separate copy naming the inviter); crew full; already a member; rate-limited; offline; pasteboard empty or no code found.
- **AI:** none.
- **Realtime:** none (preview snapshot).
- **OS:** UIPasteControl (no paste prompt) or `UIPasteboard.detectPatterns` before reading; Android clipboard (Android 12+ shows a toast on read). Keyboard: `.asciiCapable`, autocapitalisation all-caps, `textContentType .oneTimeCode` off.
- **Entitlements:** crew cap as above.

### 3a-12 Your pass, three taps
- **Purpose:** invited-user pass with the inviter's knowledge prefilled. Taps: face, how you travel, issue.
- **UI:**
  - "← TICKET", "1 OF 1" (green), H1 "YOUR PASS, THREE TAPS", "Winston filled in what he knows. Change anything."
  - Mini pass (cream): photo axolotl, GIVEN NAME RIN, HOME SINGAPORE · SIN, provenance label "FROM WINSTON'S CONTACTS" (#c4623e).
  - "1 · YOUR FACE": row of 5 guide circles 56 px (axolotl selected, green ring).
  - "2 · HOW YOU TRAVEL": chips STREET FOOD (pink, on), SUNRISE CHASER (yellow, on), BEACH, NO PLANS (off, outline), "+ MORE" (dashed). Tokek wiggle + "Winston says you'll eat anything. I picked two."
  - Green CTA "3 · ISSUE MY PASS" + "Next you'll save it with Apple, Google or your number".
- **Data:** prefill {given_name, home_airport, avatar suggestion, taste tags} with a `source` per field (inviter_contact | inviter_note | guide_inference | user). Taste here is chips, not the 6-question quiz, so the profile must accept either input mode.
- **Actions:**
  - Tap face → pass updates live. Tap chips → toggle. + MORE → full tag list (not drawn). Tap name/home → edit (not drawn).
  - ISSUE MY PASS → stamps pass → the 3a-7 auth sheet → join crew → 3a-13.
- **Motion:**
  - "Two picks change the pass live above them" (cross-fade/drop of the photo and travel style).
  - Chip toggle (prototype chipStyle): on = fill + 3 px dark gap + 5 px colour ring, rotated ±2°, pop kf rot×3 scale .86 → 1.12 → 1, 420 ms.
  - ISSUE: stamp slam (as 3a-6) then the sheet.
- **States:**
  - MISSING: no prefill (code path with no personal data); name edit; home edit (3a-5 search reuse); + MORE list; auth failure; join failure (seat taken concurrently → full).
- **AI:** the inviter's free-text note ("eats anything") is mapped to the tag enum. LLM classification with constrained output: {tags: TagEnum[] (max 3), rationale_line (guide voice, ≤70 chars)}. Alternatively the inviter picks tags directly (the design implies the guide inferred them).
- **Privacy:** "FROM WINSTON'S CONTACTS" = personal data of a non-user supplied by the inviter. Only name and home hint should be sent; never upload the address book. Use a contact picker on the inviter side (no Contacts permission). Home was likely inferred from the phone country code (+65). Purge if the invite is not accepted within N days.
- **OS:** the same auth sheet; haptics.
- **Entitlements:** none.

### 3a-13 You're in (crew manifest)
- **Purpose:** celebrate joining and show the crew and who is missing.
- **UI:**
  - Cream paper background (#f4efe4), dark status bar. "CREW MANIFEST · THE BALI SIX", "5 OF 6".
  - 3×2 grid of member cards (#fffdf6, radius 18, rotated -4…4°): initial avatar in the member colour, NAME, subline (organiser / "6 critters" / "4 critters" / "11 critters" / "just now" / "not yet"). Rin has a green ring. Dev is dashed at 50% opacity.
  - Tokek cheer hop + dark speech bubble (Caveat): "Welcome, Rin. The volcano's on Day 4. You'll love it, eventually."
  - H1 "RIN'S IN", "Five of six. Dev is the last one, and Tokek has already nudged him."
  - Dark CTA "SEE THE PLAN", link "Say hi to the crew".
- **Data:** crew members ordered by `joined_at` (role, critter_count from the Critterdex, status, colour). Trip plan highlights (Day 4 volcano). Nudge status for pending invitees.
- **Actions:** SEE THE PLAN → 3f-3 "Your version" (personalised proposal). Say hi → 3g-1 crew chat.
- **Motion:**
  - Cards stamp down in join order: kf `s1.6 o0 (in) → .05:s.95 o1 → .08:s1` (≈450 ms contact, 720 ms settle), delays 0/260/520/780/1040/1300 ms. Rin lands last with a green ring. Dev stays dashed.
  - Confetti 70 pieces at 50%/35%. Tokek hop.
  - Speech line types out (tg-type 40 ms/char, 260 ms pauses).
  - Target: ≈15 s from link open to here.
- **States:**
  - MISSING: crew with 1–2 members; >6 members (Boosted crews up to 16 per 4e-1: grid overflow); all joined (no dashed card); join still pending server confirmation; offline.
- **AI:**
  - Welcome line: LLM or template. Inputs: invitee name + tags + plan highlights; output: one line ≤90 chars in guide voice. Can be pre-generated at join.
  - Auto-nudge to non-openers ("Tokek has already nudged him"): background job, guide-voice copy + send-time choice.
- **Realtime:** the join event fans out to crew members: Home avatars, chat system message "Rin's in", push to organiser, manifest counts.
- **OS:** haptic per card stamp (light), success haptic, SFX.
- **Entitlements:** crew cap (6 free / 16 boosted).

### 3b-1 Home, first run
- **Purpose:** first trip starter for a user with no crew or trip.
- **UI:**
  - "WELCOME, WINSTON", pill "JOIN WITH A CODE", H1 "WHERE TO FIRST?", "Pick a guide to start a trip. Your crew can vote on it later."
  - 3×2 guide cells (132 h, #1f1b38, radius 22): floating 88 px sticker + city chip in the guide colour (BALI #ffd84a, KYOTO #ff9a4d, ICELAND #4f86ff, MEXICO CITY #ff5fa8, LISBON #54d6a4, CUSCO #f4efe4).
  - Dashed "+ SOMEWHERE ELSE — No guide there yet. Tokek will cover until one moves in."
  - Tab bar (88 h, #120f22): HOME (pin, active yellow), TRIPS (ticket), centre raised 66 px yellow guide button (gecko), WALLET, PASS (egg).
- **Data:** live guides list {guide_id, name, critter kind, place_id, display city, colour}. User first name.
- **Actions:**
  - Guide cell → hop, then zoom into 3d-1 (a new trip starts there).
  - SOMEWHERE ELSE → 3b-7 sheet. JOIN WITH A CODE → 3a-11 sheet.
  - Tabs as in §1.2.
- **Motion:**
  - Cells idle with float (3800/4100/4400/4700/5000/5300 ms, delays 0–1500 ms step 300).
  - Tap: hop (translateY -20, scale 1.12, 320 ms ease-out), then at 200 ms zoom (560 ms).
  - Tab switch per §1.5.
- **States:**
  - MISSING: loading; offline; first run after the invited path (does an invited user ever see this? no, they land in the crew); more than 6 guides (grid scroll?).
- **AI:** none.
- **OS:** none beyond haptics.
- **Entitlements:** none.

### 3b-2 Home (everyday)
- **Purpose:** the trip coming up, the next-trip argument, and entry to everything crew-related.
- **UI:**
  - **Header:** "W HEY WINSTON ›" → profile; crew switcher "THE BALI SIX ▾"; crew pill (stack M A J + chat icon + badge 5 = unread chat); bell (badge 3 = needs-you count).
  - **Next-up card** (yellow, 178 h, halftone): "NEXT UP · OCT 12", "BALI" (90 px), countdown chip "17D 05:26:47" (tg-count dhms, 1 s tick, tabular numerals), chip "PLAN 80%". Tokek (138 px, wave) bobs over the top-right edge.
  - **"WHERE NEXT?"** + blinking pink dot "VOTE OPEN · 4 OF 6 IN".
  - **Vote board** (262 h, dotted surface): free-positioned stickers with a rotated label and voter avatars: Kyoto/tanuki (M J W), Lisbon/sardine (A), Reykjavík/puffin (none). Dashed "+ PITCH A PLACE" circle.
  - **Guide tip strip** (Pon, Caveat): "Blossoms peak around April 3. Flights from Singapore drop to $412 if you book by February."
  - Tab bar.
- **Data:**
  - HomeState {crew {id, name, members, unread_chat}, needs_you_count, next_trip {trip_id, destination, start_date, countdown_target_ts, plan_completeness_pct, guide}, poll {id, status: open, voters_in, member_count, candidates[{place, guide, sticker, label_colour, voters[]}], closes_at}, tip {guide_id, text, target}}.
  - Countdown = 1488420 s from 09:41 → Oct 13 15:08, which does not match "OCT 12": define the target (departure flight time from bookings vs trip start 00:00 destination tz).
- **Actions:** header per §1.2; Bali card → 3k-1 zoom; WHERE NEXT?/KYOTO → 3c-1; LISBON / + PITCH → 3b-3; tip → 3d-1.
- **Motion:**
  - Countdown ticks live; Tokek bob 2800 ms.
  - Stickers float (4400, 5000 +900, 4000 +1600 ms).
  - A new vote (realtime) drops an avatar onto the sticker with a bounce (drop 380 ms `(.3,1.5,.5,1)`).
  - Bell "rings once when something new needs you" (swing ±15° damped, ≈600 ms + light haptic) and the badge increments (pop 360 ms).
  - Status dot blink 1400 ms.
  - A new pitch "flies onto the board" from 3b-3 (shared-element flight, ≈600 ms, then settle).
- **States:** designed = everyday with an open poll.
  - MISSING: no upcoming trip (crew exists); trip in progress (Home vs Trip hub?); after the trip; no open poll; poll with 1 or 4+ candidates (sticker layout algorithm); loading skeleton; offline (cached HomeState, countdown still local); multiple crews (switch cross-fades per 3g-3).
- **AI:** the tip strip is a proactive insight job. Inputs: candidate places × crew home airports price history, seasonal events. Output {guide_id, text ≤120, facts_used[], cta_target}. Background job; price must be data-backed.
- **Realtime:** crew channel for ballots, candidates, members, unread counts, plan %. User channel for the needs-you count.
- **OS:** app icon badge = needs-you (and/or unread) count. Home-screen countdown widget 5c-1 and interactive vote widget mirror this card and board (shared data contract; WidgetKit/Glance timeline refresh on vote events via push).
- **Entitlements:** none directly. Free tier "sponsored picks" might appear in the tip strip or pitches; they need a label.

### 3b-3 Pitch a place (sheet)
- **Purpose:** a guide pitches a destination to the crew, streamed.
- **UI:**
  - Sheet over dimmed Home. Search field "Lisbon" + ✕.
  - Pitch card in the guide colour (Lisbon green #54d6a4, halftone): sardine sticker 100 px, "SARDI PITCHES", H "LISBON IN JUNE"; chips "16H FROM SIN", "$1,920 EACH", "JUNE FESTIVALS".
  - "WHY YOUR CREW MIGHT BITE": 3 rows with icon (food/wave/camera), reason text and matching member avatars (M J; R; A).
  - Caveat quote "Come for the grilled sardines. Stay for the grilled sardines."
  - "OR TRY" chips "PORTO · $180 LESS", "SEVILLE · WARMER".
  - CTA "ADD TO THE VOTE".
- **Data:** Pitch {id, crew_id, place_id, guide_id, month, headline, chips[{kind: travel_time|price_pp|event, value, label}], reasons[{icon, text, member_ids[]}], quote, alternatives[{place_id, delta_kind: price|weather, delta_value, label}], price_quote_refs[], created_by, created_at}.
- **Actions:**
  - Type → select place → stream pitch.
  - ADD TO THE VOTE → candidate added → sheet dismisses; card flies to the Home board; toast "Lisbon's on the board. 4 of 6 have voted."
  - OR TRY chip → re-pitch that place (prototype only toasts "Porto: $180 less, same sardines.").
- **Motion:**
  - "Streams in line by line as the guide works it out, with the sardine sticker slapping on first": sticker slap-in immediately (scale 1.3→1, rotate), then each section reveals as its tokens complete (headline → chips → reasons one by one → quote → alternatives), reveal 460 ms E each.
  - Sticker blink loop.
  - ADD: shared-element flight to the board.
- **States:** designed = completed pitch.
  - MISSING: streaming skeleton; LLM error/timeout; no price data; place not found; place already on board; poll closed or final in progress (the prototype queues: "joins the vote after this one"); free-tier guide question limit reached (if counted).
- **AI (core):**
  - LLM with tool calls: `get_flight_quotes(place, month, home_airports[])`, `get_travel_time`, `get_events(place, month)`, `get_crew_taste_profiles(crew)`, `suggest_alternatives`.
  - Persona = guide voice pack.
  - Structured streaming (partial JSON by section) over SSE/WebSocket.
  - Numbers are validated against tool outputs before display.
  - Cache per (crew, place, month) with a TTL tied to price freshness.
  - Must not use private budget maxes (3n-2 "Never shown to anyone, guides included").
- **Realtime:** adding a candidate broadcasts to the crew; others' boards animate it in.
- **Privacy:** reasons expose which member matches which taste (M/J like street food). Taste tags must be crew-visible by design (confirm).
- **OS:** keyboard; haptic on sticker slap.
- **Entitlements:** open question whether pitches consume the free "30 guide questions".

### 3b-4 Inbox
- **Purpose:** one place for everything that needs you.
- **UI:**
  - H1 "INBOX", "MARK ALL READ". Segmented control: ALL / NEEDS YOU · 3 (active cream pill) / CREW / GUIDES.
  - Action cards (#1f1b38, radius 22, 40 px coloured icon tile):
    1. Boat (blue): "BOAT DAY CLOSES FRIDAY — You haven't voted. Penida leads 4–2." Buttons [NUSA PENIDA (yellow)] [GILI T].
    2. Tokek (yellow): "MOVE DINNER TO 21:00? — Your flight's running late. Tokek has the restaurant on hold." Buttons [APPROVE (green)] [KEEP 19:30].
    3. Ticket (orange): "KYOTO: REPLIES DUE SEP 30 — 4 in, 1 maybe. Dev hasn't opened his invite." Button [NUDGE DEV].
  - "EARLIER" quiet list: "Maya reacted to the Kyoto trailer" 12m; "Jordan paid you back $92.10" ✓ 1h; "Tokek moved Rin's pickup to 22:40" UNDO 3h. Tab bar.
- **Data:** InboxItem {id, user_id, crew_id, trip_id, source: crew|guide|system, actor_id, kind: poll_vote|approval|rsvp_followup|reaction|payment|guide_action, needs_you: bool, title, body (live values, e.g. vote leader), actions[{id, label, style, effect}], deep_link, created_at, expires_at (closes Friday), resolved_at, resolution, read_at, undo {token, until}}.
- **Actions (prototype):**
  - Inline vote → toast "Voted Nusa Penida. It leads 5–2."
  - Approve / Keep → toasts.
  - NUDGE DEV → "Pon will nudge Dev at 21:00, when he opens things."
  - MARK ALL READ → "Marked read. The three on top still need you." (read ≠ resolved).
  - UNDO → "Rin's pickup is back at 21:10."
  - Card bodies deep-link (3g-2, 3k-5, 3f-6). Earlier rows → 3f-2 / 3i-5.
- **Motion:** handled card pops (360 ms), then slideOff right (360 ms, rotate 4°) + height collapse (320 ms); the count ticks down; when 3 are done → fade-replace to 3b-5 after 380 ms. Island toast confirms each action.
- **States:** designed = 3 pending; empty = 3b-5.
  - MISSING: loading; error; action failure/offline (queue + optimistic rollback); item expired while viewing (vote closed); CREW and GUIDES filter views; pagination; conflicting resolution from another device/widget/notification.
- **AI:** guide items originate in agentic jobs of other slices (flight delay → propose a dinner move; pickup auto-moved). Needs a policy for autonomous-with-undo vs needs-approval. Nudge scheduling picks the send time from engagement history ("when he opens things").
- **Realtime:** user channel for item create/update/resolve and live body values (vote tallies).
- **OS:** notification actions (5b vote without unlocking) resolve the same items (shared idempotent action endpoint). Badge count sync.
- **Entitlements:** none seen.

### 3b-5 All caught up
- **Purpose:** empty state for needs-you.
- **UI:** same header; NEEDS YOU · 0; Tokek sleeping (150 px, pose sleep, bob 3400 ms); H "ALL CAUGHT UP"; "Nothing needs you right now. Tokek will wake you if the boat vote changes."; EARLIER list persists.
- **Data:** the "watched" item referenced in the copy (the boat vote), i.e. a watch subscription on an open poll's lead change.
- **Actions:** tap Tokek → "opens one eye" (prototype: pose wave + jump 16 px 420 ms, toast "Nothing needs you yet. Back to sleep.", back to sleep after 2.2 s).
- **Motion:** the last card slides off; the count ticks to 0; Tokek curls up in the space and snores (sleep pose + "z" doodle loop; optional snore SFX). A new item lands on top and wakes it (insert drop + Tokek wake).
- **States:**
  - MISSING: first-ever empty (no EARLIER items); offline.
- **AI:** copy variant naming the watched item (template or LLM, ≤100 chars).
- **Realtime:** a new needs-you item arrives live and wakes the gecko.
- **OS:** push when the watched vote changes (within the ping budget, 5b-4).

### 3b-6 Home, final vote
- **Purpose:** Home when only 2 places remain; mirrors the 3c-1 showdown.
- **UI:**
  - Header and next-up card as in 3b-2. "WHERE NEXT?" + "FINAL · CLOSES FRI".
  - Split card 262 h, diagonal clip (62%/38%): KYOTO orange half (58 px title, tanuki cheer wiggle 2200 ms, voters M J W + "3"); LISBON blue half (sardine wiggle 2600 ms delay 500, "1" + A).
  - Centre "VS" disc pulsing (1400 ms).
  - Tally strip (#2c2750): 6 segments (3 orange, 1 blue, 2 dashed), "DEV AND RIN TO GO", "You voted Kyoto. A tie goes to Kyoto." Remaining voters' faces D R at 60% opacity bobbing (1800 ms, staggered 600 ms).
- **Data:** poll {status: final, closes_at, candidates[2] with votes[], remaining_voters[], my_vote, tiebreak {winner_if_tie, reason}}. 3c-1 reason: "it's $440 cheaper for the four flying from Singapore" = cost-based tie rule.
- **Actions:** split card → 3c-1 (zoom); tally → 3c-1. Header as 3b-2.
- **Motion:**
  - "Once two places are left, the pitch board folds into a split card": fold transition (out scale .9/fade 380 ms; in translateY 70 px, 560 ms, delay 160 ms).
  - A new vote drops an avatar onto its side with a bounce, and the strip fills one segment per vote (segment fill 300 ms + pop).
  - Remaining faces bob until they vote.
  - On close → 3c-2 reveal shown once to everyone.
- **States:**
  - MISSING: all voted but not yet closed; a closed poll on Home before the reveal is seen; tie visualisation; the user hasn't voted (the CTA to vote on Home is only via 3c-1).
- **AI:** tie-break reason text (template from computed cost delta).
- **Realtime:** ballots and changes of mind (avatar slides across per 3c-1), close event.
- **OS:** interactive vote widget / notification actions (5b-2, 5c) must stay consistent.
- **Entitlements:** Boost CTA on the final (the "Boost Kyoto" scenario starts from here) belongs to 4.

### 3b-7 Somewhere else (search sheet)
- **Purpose:** plan a place with no live guide.
- **UI:**
  - Sheet with the keyboard already up. Search "Morocco" (yellow focus ring, ✕).
  - Header row "MOROCCO" + "NO LIVE GUIDE YET" (orange).
  - Result rows: locked silhouette of the local (46 px, `locked #3a3466` + "?"), city, blurb + "· 1 local to find", chevron (MARRAKECH "Riads, souks, rooftop dinners"; CHEFCHAOUEN "The blue town in the Rif"; MERZOUGA "Sahara dunes, camp nights").
  - Tokek line "Nobody guides Morocco yet, so I'll cover it. The locals still turn up."
  - System keyboard with "go" return key.
- **Data:** PlaceSearchResult {place_id, city, country, blurb, guide {type: live|guest, guide_id}, locals[{local_id, silhouette_asset, found: bool}] (name hidden until found)}. The dataset is critters-data: 61 countries / 150 cities, 1 local per city (e.g. cp-097 Belarj stork Marrakech, cp-098 Magot macaque Chefchaouen, cp-099 Fanak fennec Merzouga).
- **Actions:** type → live results; tap city → 3b-8 (zoom from the row); "go" → first result. The prototype shows hint toasts for the other rows.
- **Motion:** sheet rise with the keyboard; results arrive as you type (stagger drop 380 ms); tap → zoom (grow into page).
- **States:**
  - MISSING: empty query (recent/suggested?); no results; city without a local (not in the 150); typo tolerance; a city that has a live guide (route to 3d-1 instead); loading; offline.
- **AI:** blurbs are editorial or LLM-generated and cached (≤50 chars).
- **Privacy/spoiler:** only silhouettes, never names. If critter data ships in the app bundle, names are datamineable (accept, or ship silhouettes only).
- **OS:** keyboard `returnKeyType .go`; autofocus.
- **Entitlements:** none.

### 3b-8 Marrakech (guest-guide destination page)
- **Purpose:** destination page covered by a guest guide; same structure as 3d-1.
- **UI:**
  - Pink hero (#ff5fa8, 388 h, radius bottom 40): "← MOROCCO", "♡ SAVE" pill, "MARRAKECH" (74 px).
  - Tokek (146 px, wave, bob 3000 ms) as "GUEST GUIDE: TOKEK" + Caveat "Not my island, but I've done my homework."
  - Chips "1 STOP FROM SIN", "10 MAD ≈ $1", "BEST: MAR · OCT".
  - "THE LOCALS" card: "0/3 · FOUND BY BEING THERE", 3 locked slots (Marrakech, Chefchaouen, Merzouga) breathing.
  - "WHAT TOKEK KNOWS SO FAR": facts with icons (bed: "Riads beat hotels for six. Most sleep six to eight."; sun: "Merzouga is a long day's drive. Give the desert two nights.").
  - CTAs "PITCH TO THE CREW" (yellow) + "SOLO TRIP" (outline).
- **Data:** PlaceDetail {place_id, hero_colour (guest page colour pick rule?), guide {guest, guide_id}, connectivity from the user's home (stops), fx {local ccy, rate, display}, best_months[], locals[{id, silhouette, found, hint}], brief_facts[{icon, text}], saved: bool}. The page shows country-level locals (3) on a city page.
- **Actions:**
  - SAVE → "♥ SAVED" flap + toast "Saved to your Marrakech list."
  - PITCH TO THE CREW → adds to the crew's candidate queue; with a final in progress → back to Home(final) + toast "Marrakech is pitched. It joins the vote after this one."
  - SOLO TRIP → "Solo trips skip the vote. Tokek plans for one."
  - Tap local → shake + hint ("Nests high up, near the old palace walls.").
- **Motion:** "Tokek hops onto the hero as a guest guide, the same way a live guide would" (hop-in on enter, then bob). Locals "breathe faintly" (opacity .85↔1 / scale 1↔1.03, ≈3 s). Save uses a flap (rotateX 340 ms).
- **States:**
  - MISSING: loading brief (streamed? "so far" implies growing knowledge); no connectivity data; places with 0 locals; saved-list screen; solo trip creation screen; which crew receives the pitch when the user has multiple crews; no crew (first-run user pitching?).
- **AI:**
  - Place brief: LLM + retrieval (travel knowledge), personalised to crew size. Output {facts[{icon enum, text ≤90}], best_months, tagline}. Cache per place with a crew-size bucket. The guest guide persona voice applies ("Not my island").
  - Local hints = authored content (spoiler-safe), not LLM.
- **Realtime:** a pitch added to the queue is visible to the crew.
- **OS:** none.
- **Entitlements:** none seen.
- **Inconsistency:** "10 MAD ≈ $1" is USD-like while the user's home currency is SGD (3n-8 "prices in S$ and local").

---

## 3. Feature list

| # | Feature | Description | Screens | Cx | Justification | Depends on |
|---|---|---|---|---|---|---|
| F1 | Local-first pass draft + issuance | Draft state machine (name, avatar, taste, home), live pass preview, MRZ generator (A–Z/`<` transliteration, fixed length), pass number allocation, issue before account, offline issue + later sync | 3a-2..3a-6, 3a-12 | M | Pure client logic + one allocation API; transliteration edge cases | F6, shared PassCard |
| F2 | Taste quiz ("this or that") | 6 binary questions (content-managed, versioned), answer → tag mapping, fling/stamp interaction, retake from 3n-1 | 3a-4 (+3n-1) | M | Small UI; taxonomy is a cross-slice contract for LLM prompts | F1 |
| F3 | Avatar: guide sticker or real photo | Guide picker; camera/library; on-device subject segmentation → sticker outline; upload; moderation | 3a-3, 3a-12 | M | Platform ML APIs differ; moderation pipeline | Media storage, 3n-4 |
| F4 | Home airport search | Bundled airport dataset (scheduled-service airports), fuzzy multilingual search (IATA/city/name), IP-geo nearest ranking, distance label, default currency, localised "home" stamp word | 3a-5, 3a-12 | M | Dataset curation + ranking; no permission | IP geo, currency map |
| F5 | Ceremony motion kit | Stamp slam, confetti, pass drop, card stamp-in sequence, haptics + SFX, reduced-motion fallbacks | 3a-4/5/6/13 | M | Reusable choreography; needs a sound/haptic system | Motion runtime (shared) |
| F6 | Auth + anonymous upgrade | Anonymous identity at first launch, SIWA, Google, phone OTP (autofill, resend, rate limits, fraud), link/merge conflicts, sessions, SIWA token revocation on delete | 3a-7, 3a-8, 3a-12 | L | 3 providers × 2 OS + merge semantics + SMS fraud | SMS provider, 3n delete account |
| F7 | Permission orchestrator | Primer UI with live demos; toggle → OS prompt(s); status mirror; denied/Settings deep link; provisional; contextual re-ask triggers; escalation when-in-use → always at trip start; AlarmKit / exact-alarm handling | 3a-9 (+3c, 3k, 3l, 5a, 5b) | L | Many OS permission variants, policy-restricted Android perms, cross-slice triggers | Notification infra, location engine |
| F8 | Invite links + deferred deep linking | Invite creation (per-invitee, channel-tagged), opaque token URLs, web landing (Site-Invite, OG image), Universal/App Links, deferred install attribution (Install Referrer; iOS paste control / SDK), open/view tracking, "Opened from WhatsApp · 2 min ago" | 3a-10 (+web, 3f-6, 4f-1) | XL | Web + iOS + Android + attribution; iOS deferred reliability; security of personal prefill | F9, web, 3f trailer |
| F9 | Join codes | 6-char codes targeting a crew or trip, human-friendly alphabet, expiry, rotation by organiser, rate-limited lookup, shake/toast error, pasteboard detect | 3a-11, 3b-1, 3g-3 | M | Simple model; abuse prevention needed | F8 |
| F10 | Invited fast-path pass | Prefill with per-field provenance, chips as taste input, LLM tag inference from inviter note, auth sheet reuse, transactional join with seat cap | 3a-12 | M | Composition of F1/F6/F9 + one LLM call | F1, F6, F9, LLM gateway |
| F11 | Join celebration + auto-nudge | Manifest ordered by join time, statuses, critter counts, welcome line, nudge scheduler for non-openers | 3a-13, 3b-4 | M | Nudge timing model + budget integration | Crew service, 5b budget |
| F12 | Home shell + mode machine | Tab bar, header (profile, crew switcher, chat pill, bell badges), modes first_run / everyday / final / (missing: no trip, in-trip), aggregated HomeState API, offline cache | 3b-1, 3b-2, 3b-6 | M | Aggregation + state rules; many deep links | 3g-3, 3k-1, 3n-1 |
| F13 | Next-trip card | Countdown to a defined target (tz-aware), plan % metric, guide sticker; mirrored in widgets | 3b-2, 3b-6 (+5c) | S | Local timer + one server metric | Trip/bookings, widgets |
| F14 | Destination poll (board + final) | Candidates, single-choice changeable ballots, "n of m in", deadline, elimination to final 2, tie-break by crew cost, live avatars, pitch queue for the next round, close → reveal once | 3b-2, 3b-6 (+3c-1/2, 5b-2, 5c) | L | Realtime consistency + rules + multi-surface voting (widget/notification) | Realtime infra, pricing |
| F15 | Guide pitch (streamed) | Place resolve, tool-grounded LLM structured stream, crew taste matching, alternatives, add to vote with flight animation | 3b-3 | L | Streaming structured output + price grounding + persona | LLM gateway, flight prices (shared with 3d), F14 |
| F16 | Inbox / action items | Event → item fan-out, needs-you vs earlier, filters, inline idempotent actions, live bodies, mark-read, guide-action undo, empty state, badge sync | 3b-4, 3b-5 (+5b) | L | Integrates events from ≥6 slices; idempotency across surfaces | Domain events, push |
| F17 | Place search (any city) | Global places index (countries, cities), locals mapping with silhouettes, blurbs, live-guide routing | 3b-7 | M | Index + ranking; the content gap for cities without locals | Critter catalog (3l) |
| F18 | Guest-guide destination page | Guest guide assignment, place brief LLM (cached), FX label, connectivity (stops), best months, locals hints, save, pitch-to-crew (queue), solo trip | 3b-8 | L | Several data sources + LLM + queue semantics | F15/F14, FX, route data, 3d-1 layout |
| F19 | Proactive guide tip | Background price-drop and seasonality insight per crew candidate, phrased in guide voice | 3b-2 | M | Needs price history per airport pair | Flight prices, LLM |
| F20 | Island-style toast + press/gesture kit | In-app confirmations near the notch, press scale, edge swipe, sheet drag | all | S | Shared UI infra | none |

---

## 4. Data model contributions

- **User**
  - Fields: id, status (anonymous|registered|deleted_pending), created_at, locale, home_airport_iata, home_country (ISO3), home_currency, display_name (given_name), avatar_ref, passport_no, taste_profile_id, timezone.
  - Privacy: PII = name, phone, email, photo.
- **AuthIdentity**
  - Fields: id, user_id, provider (apple|google|phone), subject (sub / E.164), email (maybe relay), linked_at, apple_refresh_token (for revocation).
  - Unique (provider, subject).
- **Installation/Device**
  - Fields: id, user_id, platform, os_version, app_version, push_token, voip/live-activity tokens (5a), attribution {invite_id, channel, source (install_referrer|paste|sdk)}, permission_state {notifications, provisional, alarms, location_level, precise, calendar, updated_at}, ask_later {perm: next_trigger}.
- **Pass**
  - Fields: user_id, number (CP-xxxx format TBD), issued_at, mrz_line1, mrz_line2 (derived, regenerable), cover (default|navy|gold from referrals), saved_at (null until auth).
  - Stamps[] → **Stamp**: id, pass_id, kind (home|issued|trip|referral), place_id/iata, colour, localised_word, stamped_at, co-signers (3m).
- **TasteProfile**
  - Fields: user_id, version, answers[{question_id, option_id, answered_at}], tags[TagEnum], source per tag (quiz|chips|inviter_note|guide_inference), updated_at.
  - Visibility: crew-visible (used in pitch reasons, 3f-3).
- **QuizQuestion** (content): id, version, option_a {title, sub, art, tag}, option_b {...}, order, locale strings.
- **Airport** (static): iata, icao, name, city, country, lat, lng, currency, scheduled_service, search_aliases[].
- **Place**
  - Fields: id, kind (country|city|region), name, country_code, parent_id, lat/lng, currency, best_months[], blurb, hero_colour, guide_coverage {live_guide_id | null}, local_ids[].
- **Guide**
  - Fields: id, name (Tokek…), critter_kind, place_id, colour, voice_pack_id, phrases, can_guest (bool).
  - Guest guide rule (TBD).
- **Local (critter ref, owned by 3l):** id (cp-097), place_id, city, silhouette_asset, name (hidden), hints[] (authored), tiers/forms.
- **Crew**
  - Fields: id, name, created_by, seat_cap (6 free / 16 boosted), active_code_id, created_at.
  - **CrewMember:** crew_id, user_id, role (organiser|member), colour, joined_at, status (active|left). The "N critters" count derives from 3l.
- **Trip**
  - Fields: id, crew_id (nullable for solo), place_id, guide_id, guest (bool), start_date, end_date, tz, countdown_target_ts, per_person_estimate {amount, ccy}, plan_completeness_pct, status (draft|proposed|booked|in_progress|done).
- **Invite**
  - Fields: id, crew_id, trip_id?, inviter_id, token (opaque, unguessable), code_id?, invitee_name?, invitee_home_hint?, invitee_note?, prefill_tags[]?, channel (whatsapp|messages|…), seat_no, created_at, expires_at, first_opened_at, open_count, accepted_by_user_id, accepted_at, revoked_at.
  - Privacy: non-user PII; delete or anonymise on expiry.
- **JoinCode**
  - Fields: code (unique, case-insensitive), target_type (crew|trip), target_id, created_by, expires_at, max_uses?, uses, rotated_from.
- **InviteEvent:** invite_id, type (link_opened|app_installed|preview_viewed|accepted), channel, ts, installation_id.
- **DestinationPoll**
  - Fields: id, crew_id, round, status (open|final|closed|revealed), closes_at, created_by, tiebreak_rule, winner_candidate_id, closed_at.
  - **PollCandidate:** id, poll_id, place_id, guide_id, pitch_id, added_by, added_at, eliminated_at.
  - **Ballot:** poll_id, user_id, candidate_id, cast_at, changed_count (unique per poll+user). Votes are crew-visible.
  - **CandidateQueue:** crew_id, place_id, pitch_id, queued_by, queued_at (the "joins the vote after this one" rule).
  - **RevealSeen:** poll_id, user_id, seen_at (3c-2 shown once).
- **Pitch:** as in 3b-3, + model, prompt_version, tool_results_hash, status (streaming|complete|failed), crew_id, place_id, month.
- **InboxItem:** as in 3b-4. **GuideAction:** id, trip_id, guide_id, kind, before, after (inverse patch), autonomous (bool), approved_by?, undo_until, undone_at.
- **Nudge:** id, crew_id, target_user_id / invite_id, reason, scheduled_for, sent_at, channel (push|share_via_inviter), message.
- **SavedPlace:** user_id, place_id, saved_at.
- **PlaceBrief (cache):** place_id, crew_size_bucket, facts[], generated_at, model, sources.
- **HomeTip:** crew_id, guide_id, text, facts, target, valid_until.
- **FlightQuoteCache / FxRate:** shared with 3d/3i.

**Relationships:**
- User 1–n AuthIdentity; User 1–1 Pass 1–n Stamp.
- User n–m Crew via CrewMember; Crew 1–n Trip; Crew 1–n DestinationPoll 1–n PollCandidate 1–n Ballot.
- Crew 1–n Invite; Invite n–1 JoinCode (optional).
- User 1–n InboxItem.

**Privacy notes:**
- Phone numbers hashed for lookup, encrypted at rest.
- Invitee prefill is minimal and TTL-purged.
- Taste tags are crew-visible (disclose this in onboarding?).
- Private budget is never an input to pitch generation.
- Real photos are crew-visible only, with a moderation log.
- Location permission state is stored, not location history (3l owns encounter data).
- Calendar: only derived free/busy leaves the device (3c).
- Delete account (3n) cascades: revoke SIWA tokens, remove the phone identity, anonymise ballots/messages.

---

## 5. Backend / API needs

**Endpoints** (verbs are indicative):
- **Bootstrap/auth**
  - `POST /installations` → anon user + token.
  - `POST /auth/apple|google` {id_token, nonce, link: true}.
  - `POST /auth/phone/start` {e164} → {verification_id, resend_after}; `POST /auth/phone/verify`.
  - `POST /auth/merge` {strategy}; `POST /auth/refresh`; `DELETE /sessions/current`.
- **Pass**
  - `POST /passes/allocate-number` (or lazy at issue).
  - `POST /me/pass/issue` {given_name, avatar, taste, home_iata} → Pass.
  - `GET /taste/questions?v=`; `PUT /me/taste`.
  - `POST /uploads/avatar` (signed URL) → moderation callback.
- **Geo/airports**
  - `GET /geo/hint` (IP → lat/lng, country) if the airport list is bundled; else `GET /airports/search?q=&near=`.
- **Permissions/devices:** `PUT /devices/{id}` {push_token, permission_state, attribution}.
- **Invites/codes**
  - `POST /crews/{id}/invites` → {url, code, expires_at}.
  - `GET /invites/preview?token=|code=` → public-safe preview (rate-limited, no auth or anon).
  - `POST /invites/{id}/events`.
  - `POST /invites/{id}/accept` (transactional seat allocation, idempotent).
  - `POST /crews/{id}/codes/rotate`.
  - `POST /attribution/claim` {install_referrer | pasted_token}.
- **Home**
  - `GET /home?crew_id=` → HomeState (mode, next_trip, poll, tip, badges).
  - `GET /guides`; `GET /crews`.
- **Poll**
  - `GET /crews/{id}/poll`.
  - `POST /polls/{id}/candidates` {place_id, pitch_id} (or → queue if final).
  - `PUT /polls/{id}/ballot` {candidate_id} (Idempotency-Key).
  - `POST /polls/{id}/reveal-seen`.
- **Pitch:** `POST /crews/{id}/pitches` {place_id, month?} → `text/event-stream` of section events (`sticker`, `headline`, `chip`, `reason`, `quote`, `alternative`, `done`, `error`); `GET /pitches/{id}`.
- **Inbox**
  - `GET /inbox?filter=all|needs_you|crew|guides&cursor=`.
  - `POST /inbox/{id}/actions/{action}` (idempotent, shared with notification/widget actions).
  - `POST /inbox/read-all`; `POST /guide-actions/{id}/undo`; `POST /nudges`.
- **Places**
  - `GET /places/search?q=`; `GET /places/{id}?crew_id=`.
  - `PUT|DELETE /me/saved-places/{id}`.
  - `GET /locals/{id}/hint`.
  - `POST /trips` {place_id, solo: true}.

**Background jobs:**
- Invite expiry/purge.
- Code rotation.
- Nudge scheduler (engagement-time model, quiet hours, ping budget, 20:00 roundup handoff).
- Poll lifecycle (deadline close, elimination to final, tie-break compute, reveal fan-out, queue promotion into the next round).
- Flight price refresh + price-drop detection (tip strip).
- Place brief and blurb generation/refresh.
- Pitch generation workers.
- Inbox fan-out from domain events + badge recompute.
- Avatar moderation.
- Anonymous account GC (unsaved passes after N days).
- Account merge.
- SMS fraud monitor.
- Referral stamp awarding (join + first plan).

**Realtime channels:**
- `crew:{id}`: member.joined/left, invite.opened, poll.candidate_added, ballot.cast/changed, poll.state_changed, plan_pct, chat.unread (per user derived).
- `user:{id}`: inbox.item_created/updated/resolved, badge counts, entitlement changes, session revoked.
- Pitch stream via SSE or the same socket.
- Widget/Live Activity updates via push (APNs/FCM), not sockets.

**3rd parties:**
- Apple (SIWA, APNs, AlarmKit on device, App Attest).
- Google (Credential Manager / Sign-In, FCM, Play Install Referrer, Play Integrity).
- SMS verification provider with fraud controls.
- Deep-link/attribution provider or self-hosted link service (Firebase Dynamic Links is gone).
- IP geolocation DB.
- Airport + route dataset (OurAirports/OpenFlights public; commercial schedule data for "1 stop" connectivity).
- Flight price API (shared with 3d).
- FX rates.
- Events/seasonality source.
- Places/geocoding (city index).
- LLM provider (streaming + tool use).
- Image moderation.
- Object storage + CDN (avatars, OG images for invite links).
- Analytics (funnel: 45 s and 15 s targets).

---

## 6. Cross-slice dependencies and shared components

**Shared UI components (tokens):**
- **Colours:** bg #17142a, surface #1f1b38, surface-2 #2c2750, line #3a3466, text #f4efe4, muted #a9a3c0, dim #6f698c, tab bar #120f22, paper #fffdf6, accents yellow #ffd84a, pink #ff5fa8, blue #4f86ff, green #54d6a4, orange #ff9a4d.
- **Fonts:** Archivo 800/900 with variable width 60–84% (the variable wdth axis is required natively); Geist 500/600/700; Geist Mono (labels, MRZ); Caveat 600 (guide voice).
- **Components:**
  - PassCard (3a-2/6/7/12, 3n-1, 4e-1 visa variant), MRZ line, Stamp (circle, double ring, rotation).
  - CrewTicket (3a-10, reused on web invite), CTA pill with sheen, Sheet with grabber and scrim, IslandToast.
  - TabBar with raised guide button, SegmentedControl, Toggle 46×28, OTP/code boxes.
  - AvatarInitial + AvatarStack (member colours), GuideLine (sticker + Caveat).
  - Sticker (doodle-art: draw-on, blink, poses, locked silhouette), Confetti, Countdown (tg-count), Typewriter (tg-type), guide-colour ChipLabel, SearchField, ResultRow with locked local.
- The critter renderer (Canvas2D procedural, about 140 KB of JS) must be ported or pre-rendered for native, widgets, notifications and OG images. This is the biggest shared infra item (owned cross-slice).

**Depends on other slices:**
- 3c: showdown, tie rule, reveal, date finding (calendar).
- 3d-1: destination page template; 3b-8 is its guest variant.
- 3f: trailer, "your version", who's in / RSVP.
- 3g: chat unread, crews switcher, live collab.
- 3h/3k: bookings for countdown target, trip hub, flight delay items.
- 3i: settle-up items, currency.
- 3j: guide chat sheet from the tab bar.
- 3l: locals catalog, critter counts, location engine.
- 3n: profile, retake quiz, avatar, settings, delete account, language/currency.
- 4: crew cap 6 / 16, paywall, first trip free, sponsored picks.
- 5b: ping budget, sender avatars, notification actions.
- 5c: countdown and vote widgets.
- Web: invite landing, referral link, OG images.

**Contracts other slices consume from here:** TasteProfile tags (3c, 3f, 3j prompts); home_airport / home_currency (3d prices, 3i); permission state + ask-later triggers (3c calendar, 3k/3l location, 5a/5b notifications); InboxItem schema (all event producers); Poll model (3c, 5b, 5c).

---

## 7. Implementation risks and hard parts

1. **iOS deferred deep link for the 3a-10 personalised ticket.** No IDFA and no fingerprinting allowed. Pasteboard reading prompts unless UIPasteControl is tapped. SDK vendors use clipboard or probabilistic methods. A web landing page with an "Open in app / copy code" step is safest, and 3a-11 must never feel like a failure path. Android is deterministic via Install Referrer.
2. **Anonymous-first merge.** A user issues a pass, then signs in with an Apple ID that already has a pass (reinstall or second device). Decide the policy: keep the existing account, discard the new draft, or offer to replace the name/avatar. Also: data written before auth (quiz, avatar upload) must be attached to the anon user and migrated. Phone number recycling means a new owner inherits the account; mitigate with re-verification on a new device + SIWA/Google as second factors.
3. **The splash has no sign-in entry for existing users.** Without one, the funnel forces returning users to re-onboard and creates duplicate accounts.
4. **SMS OTP cost and fraud** (SMS pumping to premium ranges). Needs geo allowlists, per-number/IP/device throttles, attestation, and a cost alarm. Deliverability varies by country; voice fallback.
5. **Leave-by alarms through DND.** iOS needs AlarmKit (iOS 26+) with its own authorization and UI constraints. Below iOS 26 there is no bypass (Critical Alerts is unlikely to be granted for travel). Android 14+ restricts exact alarms and full-screen intents (Play policy review). The single "Alarms and pings" toggle hides two or three prompts.
6. **Location escalation.** "Off when you're home" + background counting for encounters means Always location. App Review scrutinises Always; Play needs a background-location declaration and video. Priming must say "on trips" honestly. Android 11+ cannot prompt for background location in-app; it is a Settings trip.
7. **Location on 3a-5 before permission.** IP geolocation accuracy (VPN, carrier NAT) produces wrong "nearest" results; always allow search.
8. **Realtime poll correctness.** Ballots cast from app, inbox, notification actions and interactive widgets must be idempotent and ordered. Changing votes, the deadline race, elimination to the final, the tie rule depending on live flight prices (non-deterministic: freeze prices at close?), and the "reveal once for everyone" flag.
9. **Seat cap race.** Two invitees accepting the last seat at once; transactional accept with a clear "full" outcome (MISSING UI).
10. **LLM pitch grounding.** Prices, flight hours and "$180 less" must come from tool data; persona consistency across 6+ guides; streaming partial JSON reliability; cost per pitch × crews; caching vs freshness; prompt injection via place names / inviter notes; moderation of the inviter note.
11. **Personal data of non-users.** Invite prefill (name, home) and a public web invite page showing crew initials and a draft itinerary to anyone with the link. Needs GDPR lawful basis, TTL, and link-forwarding exposure controls (a forwarded "RIN, YOU'RE COMING" link opened by someone else).
12. **Join code design.** Vanity-looking codes (BALI6X, SUNNY4) imply generated-from-name codes, which are guessable. Enforce randomness, expiry, rate limits, and an ambiguity-safe alphabet (but BALI6X uses I and L).
13. **Motion and performance.** Home runs 4–7 concurrently animated procedural canvas stickers + countdown + blinking. It needs pre-rendered frames or GPU paths, a pause when off-screen, and battery budgets. Full reduced-motion parity. Haptic and SFX choreography timed to keyframes.
14. **Typography.** Archivo variable-width axis support in native text engines. Caveat for dynamic LLM text (legibility, line breaking). Non-Latin names on the pass (fallback fonts) and the MRZ transliteration table.
15. **Sign-in button compliance** (Apple HIG button styles, Google branding) versus the bespoke cream Apple button and single-colour "G".
16. **App Store 5.1.1.** Mandatory account vs "Just look around first". If sign-in is required to use the app, justify it. Browsing previews anonymously needs server support for anon read tokens.
17. **Inbox as integration hub.** Every producer slice must emit typed events with actions + inverse (undo). The approval vs autonomous policy for guide actions is product-critical (money/time impact).
18. **Countdown correctness.** Time zones (SIN vs WITA), DST (Lisbon, Iceland), and the target definition. Widgets and Home must agree.
19. **Anonymous user backlog.** GC and analytics for unsaved passes; pass number allocation for users who never save (number gaps are visible).

---

## 8. Ambiguities and open product questions

1. Is sign-in mandatory after 3a-6, or can a user skip 3a-7 and use the app anonymously? There is no skip control on the sheet.
2. Where does a returning user sign in? 3a-1 only offers "I have an invite code".
3. Merge policy when the chosen identity already has a pass (keep old, replace, or choose)?
4. The other 5 "this or that" questions and their answer → tag mapping. The final tag set and the maximum tags shown on the pass (3 on the pass vs 5 in 3n-1).
5. Can quiz answers be undone or skipped? What does RETAKE (3n-1) change for existing crews and plans?
6. 3a-9 default toggle states: all off (user flips) or pre-on? Does flipping ON request notifications and AlarmKit together, or AlarmKit later at the first leave-by?
7. The invited path skips 3a-9. When and where do invited users get primed?
8. 3a-5 "nearest to your location" and "40 min away" before the location priming: is IP-based OK, or should location be asked here?
9. Stamp colour rule (yellow on 3a-5 vs orange on 3a-6) and the "HOME · RUMAH" language choice for multilingual countries.
10. Passport number format and uniqueness (CP-0427 is 4 digits). Meaning of the MRZ trailing "00/01/07" digits. Fixed MRZ length (36–39 now).
11. Why is the 3a-8 mascot Lundi (puffin) rather than Tokek? Random guide per screen?
12. What exactly does the inviter provide for 3a-12 ("FROM WINSTON'S CONTACTS", "Winston says you'll eat anything")? Contact picker, free text, or the inviter answering tags? Is the home inferred from the phone country code?
13. The 3a-10 ticket origin shows "YOU / WHEREVER" while 3a-12 shows HOME SIN. Should the per-person estimate (~$1,240) depend on the invitee's origin?
14. What does "Opened from WhatsApp · 2 min ago" measure: time the link was sent, or first opened?
15. Invitee-side states for a full crew, expired invite, revoked invite, already a member, or a forwarded link opened by the wrong person.
16. Code semantics: letters only or alphanumeric (BALI6X, SUNNY4, WINST8)? Expiry length (web shows about 4 days)? Crew code vs trip code vs referral link: are they one system? Can organisers rotate codes?
17. 3a-11 avatars show M A J R while 3a-10 says W M A J are in. Which is right?
18. How does the guide "nudge Dev" if Dev has no app yet: push, SMS, or via the inviter's share sheet? Frequency caps?
19. Home modes when there is no upcoming trip, a trip in progress, or no open poll. Which trip is "NEXT UP" with multiple crews/trips? Is Home crew-scoped (header suggests yes) while the Inbox is global?
20. Definition of "PLAN 80%".
21. Countdown target: flight departure (bookings) or trip start in the destination timezone? The design math lands on Oct 13 15:08 while the card says OCT 12.
22. Poll mechanics: who can pitch; the maximum number of candidates on the board; how candidates are eliminated down to the final 2; who sets "CLOSES FRI"; whether votes are always public; the tie rule (3c-1 says the cheaper option for the crew). Does a queued pitch auto-start the next round?
23. Guide colours are inconsistent: Lisbon is green on 3b-1/3b-3 but blue on 3b-2/3b-6; Iceland is blue on 3b-1 but cream on 3b-2. Which palette is canonical per guide?
24. Do pitches, place briefs and tips count toward the free "30 guide questions"? Where do "sponsored picks" appear (OR TRY, tip strip) and how are they labelled?
25. Currency display: "$1,920", "$412", "10 MAD ≈ $1" — USD or the home currency (S$)? 3n-8 says S$ + local.
26. Guest guide rule: always Tokek, or the crew's current guide, or the user's home-region guide? Guide coverage granularity (city vs island vs country: Bali, Kyoto, Iceland).
27. Search for a city with no local in the 150 (e.g. Fes), or a city in a live-guide country but not the guide's city (e.g. Osaka)?
28. The 3b-8 city page lists the country's 3 locals: are locals per city or per country on the page? Where is the saved-places list? What does SOLO TRIP create (a crew of one)?
29. Inbox: are CREW/GUIDES filters by source? Retention of EARLIER items? The undo window for guide actions? Which guide actions may be autonomous vs need approval?
30. Can a first-run user (no crew) use PITCH TO THE CREW on 3b-8, and does it create a crew?
31. Are taste tags visible to the crew (3b-3 shows who matches which reason)? Is consent/disclosure needed in onboarding?
32. Real-photo avatars: moderation policy, and whether a real photo can be the "passport photo" on shared or recap images.
33. Localisation: onboarding copy in all 15 languages (3n-8) from day one? "PASSPORT · PASSEPORT" bilingual pairs per locale?
