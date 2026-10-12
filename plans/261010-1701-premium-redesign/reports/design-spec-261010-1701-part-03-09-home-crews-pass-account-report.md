# Design spec: Part 3 "Home, Crews and Inbox" and Part 9 "Pass and Account"

Lane: design analysis, 10 Oct 2026. Sources: `$Z/CritterPass 03 Home Crews and Inbox.dc.html`, `$Z/CritterPass 09 Pass and Account.dc.html` (inline styles, data scripts `Src1/Src7/Src10`, `f4/f6/f8/f10`), text extracts, shots `$SP/shots/03|09/*.png` (each viewed once at 1×), Foundations 1.04/1.05 keyframes, current app `$R` = `/Users/quocs/Projects/critterpass-worktrees/deploy` at `fc1a78d21`.

## 1. Summary

- **44 phones + 1 gate map**: Part 3 has 20 (3.01–3.20), Part 9 has 24 (9.01–9.24) plus the 9.D gate map (10 gates, 5 rules).
- **Phone codes confirmed** against the text order: no duplicate codes in either part. 3.02, 3.17, 9.01 and 9.04 are inline frames (not `dc-import Phone`), so they carry their own status bar and home indicator.
- **New compared with the current app** (details in §7):
  - Part 3: Home becomes one large-title root whose hero changes over the trip's life (no trip, collage card with a live countdown, first-sync progress, a photo hero after the trip). The Trips list leads with a live card that zooms into the hub (1.05). Crew identity becomes a "crew pass" (sticker + cover colour) built live as you type. The inbox is answered from the card. The not-found and crash screens are redesigned.
    - Already in `$R`: the 3.02 header, countdown and vote board; the crew switcher (as a sheet); referrals; the inbox with inline answers and Undo; the shared-element zoom engine (built but not wired to any trip card); `LargeTitle` collapse.
    - Missing outright: Edit crew (3.13), the member sheet (3.14), the inbox first-time state (3.18), organiser handover, the crew cover colour, resend invite, and remove Undo. The tab bar today is a full-width solid JS bar, not the glass pill.
  - Part 9: a passport-page profile, an app-wide **Appearance** setting (Follows the phone / Light / Dark: a new theme preference), an offline-storage meter with a Wi-Fi-only toggle, one-screen hold-to-delete, and the FTF-ending screen (9.21). Monetisation (paywall, compare, boost, stamp, welcome, plan, cancel, billing issue, seat cap, last redraft, live-map gate, someone-already-boosting lock) **already exists** in `$R` with the same visa/stamp metaphor, so most of Part 9.C/9.D is a visual rebuild.
- **The 5 hardest pieces to build well**:
  1. **Home hero state machine and the scroll**. Four hero variants (3.01/3.02/3.03/3.04) under one large-title header that collapses on scroll. A photo hero (3.04) needs header ink that flips white to ink and a Clear-glass to Regular-glass button swap as the photo scrolls away.
  2. **Trip card → hub zoom (1.05) from 3.05**. The clip-path grows from the card rect (`inset(164 16 368 16 round 34)`) to full screen (`round 56`). The card label fades, the hub content rises 24 px, the list steps back, and the tab bar hides. This is custom Reanimated work on a shared element; the iOS 26 native zoom transition only covers part of it.
  3. **The live crew pass (3.08/3.13)**. The name types straight onto a 230×226 pass, the sticker "slaps" in (Lively), the cover recolours with an ink flip on light covers, the pass idles with a 4.8 s bob, and in 3.13 it flips to its back (code + members).
  4. **Stamp slam choreography (9.14, 9.15, 9.10)**, the 1.07 signature. A 2.3× stamp falls in 600 ms, squashes to `scale(.92,.84)`, settles with overshoot, then an ink ring ripples out, confetti fires, the critter pops in, and perk chips stagger in 240 ms apart. It has to be one timeline with a reduced-motion fallback.
  5. **Destructive and recovery grammar made consistent**. The part draws three alert materials (3.15 glass, 9.08 opaque, 9.22 glass .86), two destructive pinks (`#d93a62` vs token `#d6337f`) and two hold patterns (9.09 hold ring vs Remove + Undo). The kit needs one GlassAlert, one destructive token and one HoldToConfirm before these screens land.

## 2. Screen table

Logic: **E** exists, **P** partial, **M** missing (see §7 for gaps). Route paths are relative to `$R/apps/mobile/src` unless they start with `packages/` or `services/`.

| code | title | screen type | header left / right | primary action | current route file(s) in $R | logic |
|---|---|---|---|---|---|---|
| 3.01 | Home · crew ready, nothing planned | Root, large title | title "Bali Six ⌄" / glass bell + ink `+` | Start the vote | `app/(tabs)/index.tsx` → `features/home/home-screen.tsx` (`no_trip`), `features/home/trip-state-cards.tsx` | P (no step card, Start the vote, free days link) |
| 3.02 | Home · trip collage card | Root, large title (greeting variant) | "Hey Winston" + "The Bali Six ⌄" / chat (5) + bell (3) | Tap trip card | same; `features/home/home-header.tsx`, `ui/shell/HomeHeader.tsx`, `features/home/next-up-card.tsx`, `countdown-chip.tsx`, `features/vote/board/*` | E (plan % is a pill, not a ring; single photo) |
| 3.03 | Home · first sync | Root, skeleton | title / glass bell | none (progress card) | same; `HomeLoading`, `features/home/data/use-home-state.ts`, `ui/states/Skeleton.tsx` | P (no MB/% sync card or byte source) |
| 3.04 | Home · just back | Root over photo hero | white title / Clear-glass bell | Pay (row pill) | same; `features/home/post-trip-card.tsx`, modes in `packages/domain/src/home/mode-machine.ts` | P (no photo hero, owe row, rate driver, next trip) |
| 3.05 | Trips · live trip leads | Root, large title | "Trips" / glass search + ink `+` | Live card → hub zoom | `app/(tabs)/trips/index.tsx` → `features/trip/trip-list/{screen,trip-list-view,trip-row}.tsx` | P (plain rows; no filter, live card, zoom) |
| 3.06 | Trips · empty passport | Root, large title | "Trips" / none | Pitch a place | same, `EmptyState` in `trip-list-view.tsx` | P (only "No trips yet" + Go to Home) |
| 3.07 | Crew switcher | Popover from title | (Home header) | Pick a crew | `app/crew/index.tsx` → `features/crew/crews-sheet/CrewsSheet.tsx` | E (a sheet today, not a title popover) |
| 3.08 | Start a crew | Modal form (✕) | glass ✕ / spacer, title "New crew" | Start the crew | `app/crew/new.tsx` → `features/crew/start-crew/StartCrewScreen.tsx` | P (no cover colour, no live pass, no counter) |
| 3.09 | Crew is on | Full screen, celebrate | none | Invite the crew | inside `crew/new.tsx` → `features/crew/start-crew/crew-created.tsx` | P (plain code; split-flap exists in `motion/patterns/split-flap.ts`) |
| 3.10 | Invite sheet | Sheet, grabber | none | Share app tile | `app/crew/[crewId]/invite.tsx` → `features/crew/invite-composer/*` | P (no resend, seats left, 7-day copy; server mints 14 d) |
| 3.11 | Invite friends (referrals) | Push, title in content | glass back / "Referral terms" text | Share my link | `app/crew/invite-friends.tsx` → `features/crew/referral/*` | E (covers as a list, not a track; no vanity URL) |
| 3.12 | Crew settings (organiser) | Push, inline | glass back / glass "Edit" | rows | `app/crew/[crewId]/settings.tsx` → `features/crew/settings/CrewSettingsScreen.tsx`, `features/crew/members/MembersList.tsx` | P (no Edit, grid/ORG, trips list, Undo) |
| 3.13 | Edit crew | Push, inline (form) | glass back / ink "Save" | Save | none (server `update_crew` takes name + art) | M |
| 3.14 | A member | Sheet, grabber + ✕ | — / grey ✕ 32 | Message | none (`features/crew/live-map/states/member-sheet.tsx` is map-only) | M (no transfer organiser anywhere) |
| 3.15 | Remove a member | Alert (glass) | — | Remove Dev (destructive) / Keep Dev | inside settings: `MembersList.tsx` ConfirmSheet, `REMOVE_MEMBER` | P (no 10 s Undo) |
| 3.16 | Leave the crew · hand over | Push, inline | glass back / none | Hand over to Maya and leave | inside settings: `LEAVE_CREW` with `keep_in_chat` | P (no handover picker) |
| 3.17 | Inbox · answer from the card | drawn as Root (tab bar shown) | "Inbox" / white "Mark all read" | inline card buttons | `app/inbox/index.tsx` → `features/home/inbox/{inbox-screen,filter-tabs,action-card,use-inbox-actions,earlier-row}.tsx` | E |
| 3.18 | Inbox · first time | Push, inline | glass back / glass gear | Allow notifications | same | M (no first-time state) |
| 3.19 | Lost link | Full screen ✕ | glass ✕ / — | Go to Home row | `app/+not-found.tsx` | P (no Search trips, no Report link) |
| 3.20 | Something broke | Sheet over blurred page | (page header blurred) | Try again | `ui/shell/RootErrorBoundary.tsx` (Root/GroupErrorBoundary) exported from `app/_layout.tsx`, `(tabs)`, `(trip)`, `(modal)` layouts | P (no "Send a report") |
| 9.01 | Profile · passport page | drawn as Push (Foundations: Root) | glass back / white "Edit" + glass gear | Edit | `app/(tabs)/pass.tsx` (today: Critterdex), `app/you/index.tsx` → `features/you/profile/*` | E |
| 9.02 | Edit profile | Push, inline | glass back / ink "Save" | Save | `app/you/edit.tsx` → `features/you/edit-profile/*` | P (no Appearance row) |
| 9.03 | App icon | Push, inline | glass back / — | Pick a style | `app/you/app-icon.tsx` → `features/you/app-icon/*` | P (no "Clear", no "Auto" label) |
| 9.04 | Settings | Push, title in content | glass back / yellow "Pass+ · yearly ›" chip | rows | `app/you/settings/index.tsx` → `features/you/settings/*` | E |
| 9.05 | Offline storage | Push, inline | glass back / — | Save now / Remove | `app/(trip)/hub/offline-storage.tsx` → `features/trip/bundle/storage-settings.tsx` | P |
| 9.06 | Help and feedback | Push, inline | glass back / — | Search, rows | `app/help-centre/index.tsx` → `features/help/hub`, `features/help/shake/ShakeListener` | E |
| 9.07 | Idea board | Push, title in content | glass back / yellow "3 votes left" chip | Suggest an idea | `app/help-centre/ideas/index.tsx` → `features/help/ideas/BoardView.tsx` | E |
| 9.08 | Confirm destructive (pattern) | Alert | — | Cancel for everyone / Keep it | per caller (e.g. supplier cancel `app/(modal)/supplier/cancel.tsx`) | E (pattern) |
| 9.09 | Delete account · hold | Push, back-label | glass back + "Settings" label / — | Hold to delete | `app/you/delete/index.tsx` → `features/you/account/delete-view.tsx`, `ui/inputs/HoldRing.tsx` | E (2-step today) |
| 9.10 | Pass+ paywall | Full screen ✕ (dark) | glass ✕ + context chip / "Restore" | Get Pass+ · $29.99 a year | `app/(modal)/paywall/index.tsx` → `features/monetize/paywall/*`, `ui/monetize/VisaPaywall.tsx` | E |
| 9.11 | What's in each | Push, inline | glass back / — | Pass+ · $29.99 / Boost · $12 | `app/(modal)/paywall/compare.tsx` → `features/monetize/compare/*` | E |
| 9.12 | Boost Kyoto · who pays | Modal form (✕) | glass ✕ / 2-line centred title | Boost for $12 · you pay $2 | `app/(modal)/boost/[tripId].tsx` → `features/monetize/boost/*` | E |
| 9.13 | Checkout | System StoreKit sheet | system | system | native (`data/billing`) | E |
| 9.14 | Boosted · stamp | Full screen, celebrate (paper) | none | Tell the crew | `app/(modal)/boost/stamped.tsx` → `features/monetize/boost/stamped-*` | E |
| 9.15 | Welcome to Pass+ | Full screen, celebrate (dark) | none | Try the Stamp icon | `app/(modal)/paywall/welcome.tsx` → `features/monetize/welcome/*` | E |
| 9.16 | Boost lands in chat | Push (chat, Part 5) | glass back / avatar stack | Settle $2 | `app/crew/[crewId]/chat/index.tsx` + `features/monetize/boost-card/boost-chat-card.tsx` | E |
| 9.17 | Your plan | Push, inline | glass back / — | rows; Cancel Pass+ | `app/you/plan/index.tsx` → `features/monetize/plan/plan-*` | P (no Redeem a code row) |
| 9.18 | Last free redraft | Sheet, grabber | — | Use my last one | `app/(trip)/[tripId]/draft/last-redraft.tsx`, `features/plan/draft/redraft/boost-offer.tsx` | E |
| 9.19 | Crew map, unboosted | Full-bleed map + bottom card | glass back / centre "PREVIEW" pill | Boost Kyoto · $2 each | `app/(trip)/map/crew/[crewId].tsx`, `features/crew/live-map/states/gate-card.tsx` | P (no "opened it 41 times" count) |
| 9.20 | Seat 7 | Push, inline | glass back / — | Boost Kyoto · $12 | `features/monetize/seat-cap/seat-cap-sheet.tsx` (sheet today) | E |
| 9.21 | Free first trip ending | Push, inline ("Recap") | glass back / — | Boost Kyoto · $2 each | none (`ftfEnding` hard-coded `false` in `features/help/rating/RecapEndArbiter.tsx:67`) | M |
| 9.22 | Someone's already boosting | Alert (glass) over 9.12 | — | Tell me when it's done | `features/monetize/boost/boost-model.ts` phase `locked` | E (no "notify when done") |
| 9.23 | Cancel · pause till Kyoto | Push, inline | glass back / — | Pause till Kyoto | `app/you/plan/cancel.tsx` → `features/monetize/plan/cancel-*` | P (pause monthly-only) |
| 9.24 | Card declined · grace | Push, back-label | glass back + "Your plan" / — | Update card | `app/you/plan/billing-issue.tsx` → `features/monetize/plan/billing-issue-*` | E |
| 9.D | Gate map | doc board | — | — | `packages/domain/src/paywall/{entries,governor}.ts` | E (9.21 trigger M) |

## 3. Per-screen spec

### Shared pieces used below (defined once)

- **GlassBtn44**: 44×44, r22, `rgba(255,255,255,.62)` blur 18 saturate 1.8, inset top `1px rgba(255,255,255,.95)`, inset `.5px rgba(255,255,255,.6)`, ring `0 0 0 .5px rgba(20,22,40,.07)`, shadow `0 8 20 −6 rgba(20,22,40,.16)`. OFF-TOKEN against Foundations Regular glass (`.56`, blur 24, sat 1.9) and against the 40 pt icon button (44 hit). Glyph ink 1.8 stroke. Placement: header row `left/right 20, top 58–60`.
- **GlassCapsule** ("Edit"): same material, height 44, padding 0 16, 15/600.
- **InkCapsule** ("Save"): height 44, padding 0 16–18, r22, either flat `#1c1d24` (3.13) or the ink-pill gradient `#30313b→#16171d` with inset top white 18% and shadow `0 10 20 −8 ink .5` (9.02). Pick the gradient.
- **InkPill** (primary button): height 56, r28, Ink pill material, 17/600 −0.01em white. Bottom block at `left/right 24, bottom 28–30`. A secondary text button sits under it: 15/600 muted, padding 6 0, gap 4–10.
- **Card**: `#fff`, shadow `0 0 0 .5px rgba(20,22,40,.05), 0 1 2 rgba(20,22,40,.04), 0 14 34 −12 rgba(20,22,40,.16)`, r22–26. Rows inside: padding 0 14–16, min-height 48–62, hairline `.5px rgba(28,29,36,.08)`, 15–15.5 title / 12–12.5 muted subtitle, chevron.
- **GuideNote**: glass `rgba(255,255,255,.66)` blur 20 sat 1.8, r22, padding 8 14 8 8, inset top 1px white, ring .5 ink .06, shadow `0 10 24 −14 ink .25`. A 36 circle avatar (Tokek bg `#fff3c4`, Pon bg `#ffe6d3`/`#ffe9d6`, the critter 36 px aligned to the bottom). Text 13/1.38 `#3d404c` with the bold speaker name in ink. "Guide note tinted by the speaker" is only the avatar disc here; the card itself is neutral glass.
- **Segmented**: height 34 (filters) or 40 (Inbox, Idea board, Who pays), padding 3, r17/20, bg `rgba(118,118,128,.12)`. Selected: `#fff`, r14/16/17, shadow `0 0 0 .5 ink .04, 0 3 8 ink .12`. 13/600, unselected `#3d404c`.
- **Toggle**: 52×32 r16, on `#34c77b` (OFF-TOKEN: iOS green; Foundations has mint `#54d6a4`). Knob 28 white, shadow `0 2 6 rgba(0,0,0,.18)`.
- **Avatar**: crew colour disc, 2 px white border (or the ground colour when on the ground), initial 700 in `#17142a`. Overlap −7 to −9. Sizes 18/20/22/24/26/28/34/36/40/42/58/72/76.
- **Status chip**: height 22–24, padding 0 8–9, r11–12, 11–11.5/700, Foundations status tints (`#e3f6ec/#1f7a55` booked/on, `#ffe4f0/#b0306b` voting, `#e6eeff/#2f5fc4` joined, `#f1f1f4/#6e7180` ended).
- **Off-token colours used across both parts** (need tokens or a fix): secondary text `#3d404c`; tertiary `#9a9daa` (Foundations lists it only as dark muted); unselected border `#c4c6ce`; on-accent ink `#17142a`; link blue `#2f5fc4` (= the rain text tint); Pon eyebrow `#a8501a`; destructive `#d93a62` (3.12/3.14/3.15) vs token `#d6337f` (9.17/9.23); remove badge `#ff3b5c`; stamp inks `#e0468e`, `#2e9a74`; paper inks `#9a917e`, `#7a7264`, `#5d564b`, `#b3a993`; Borel guide ink `#6b5a24`/`#8a4a12`; Pass+ night `#17142a`/`#332e5e`/`#100e1e`; gold `#ffe48a`; Sam's lilac `#c9b8ff`/`#6b5cc4`/`#f5f2ff`.

### Part 3.A Home over a trip's lifetime (`(tabs)/index`)

**Tab bar (3.01–3.06, 3.17)**: the `Tabs.dc.html` rendering on every Part 3 root phone. Glass pill centred `bottom 26`, padding 6, gap 2, r34, `rgba(255,255,255,.56)` blur 24 sat 1.9 (3.02/3.17 inline copies use `.64`, blur 24, sat 1.8, r32: OFF-TOKEN drift). The active tab is an ink pill 46 h with label (14/600, padding 0 16 0 13). Other tabs are 46 icon-only. Tokek is raised 56 in the middle (`margin −14 2 0`, radial gold `#fff3b8→#ffd84a→#f2b92e`, 3 px white rim, gecko 46). Order: Home, Trips, Tokek, Wallet, Pass (the same order as today's `ui/shell/TabBar.tsx` + `GuideFab.tsx`). The native iOS 26 1.04 rendering does not appear in Parts 3 or 9. No Part 9 phone shows a tab bar. Content must pad about 110 px at the bottom (the pill sits 26 px up and is 58 px tall, plus the raised Tokek).

**3.01 Home · crew ready, nothing planned yet**
- Header `left 24 right 20 top 60`: title "Bali Six" 34/700 −0.035em + chevron (crew switcher). Right: GlassBtn44 bell + ink `+` 44 (gradient, shadow `0 10 20 −8 ink .5`), gap 10.
- Crew line `top 108 left 24`: 6 avatars 26 (−8 overlap), then "6 in the crew · no trip yet" 13/600 muted.
- Step card `left/right 16, top 156, h 300, r32`, white Card. Two radial washes: sun `rgba(255,216,74,.55)` at 80% 10% and pink `.28` at 0% 100%. Plane sticker 92 at right 14 top 16, rotated 8°. Eyebrow "STEP 1 OF 3" 12/700 +0.1em `#8a6a0c` at 20/22. Title 30/800 −0.035em lh 1.05 at top 44, right 120. Body 14.5/1.42 `#3d404c` at top 126. InkPill "Start the vote" bottom 20, inset 20.
- "While you wait" 13/600 muted at top 480. Two-column grid `top 504`, gap 10. Tiles h 118, r24, padding 14, doodle 40 at top, title 15/700, sub 12 muted, space-between.
- GuideNote (Tokek, wave pose) at `top 640`.
- Taps: Start the vote → new poll (4.01). Pitch a place → places search (4.02). Share free days → availability (Part 4). Title → crew switcher 3.07. Bell → inbox 3.17/3.18. `+` → new poll (4.01) with the 1.06 morph.
- Motion: none in the frame. Card entrance is not specified (use a Smooth fade-up on first paint only).

**3.02 Home · the trip as a collage card**
- Header `top 62`: a greeting row (20 px W avatar + "Hey Winston" 14/500 muted, gap 6), then "The Bali Six" 28/700 −0.03em + chevron, margin-top 2. Right: two **white** 42 buttons (`#fff`, shadow `0 0 0 .5 ink .06, 0 1 2 ink .04, 0 8 20 −6 ink .14`), chat (badge 5) and bell (badge 3). Badge: min 18, r9, `#ff5fa8`, 2 px ground border, 10/700 `#17142a`, at −3/−3. This conflicts with 3.01 (34/700 title, glass bell + ink `+`): see §8.
- Trip card `left/right 20, top 136, h 256, r30`, white, shadow `0 2 4 ink .05, 0 18 40 ink .09`. "Next up · Oct 12" 13/600 muted. "Bali" at Hero 66/800 −0.05em lh .95. Countdown pill at top 132: 32 h, r16, ink bg, 14/600 tabular, mint dot 7 ("17d 05:26:47", ticks every second). Plan pill: 32 h, `#f1f1f4`, a 20 px conic ring (`#1c1d24` 80% / `#dcdde3`) with a 12 control-colour hole, "Plan 80%". Crew stack 26 + "6 going" at bottom 18.
- Collage: polaroid 1 (124×150, padding 5, r14, rotated 8°) at 196/30; polaroid 2 (116×134, rotated −7°) at 170/96; "Day 4" sticker tag (tangerine, 2 px white, 12/800, rotated 8°) at 268/150. Gecko 92 at 262/−44 hangs **out of the card top** (allow overflow). Plane 40 at 150/12, rotated −12°.
- "Where next?" Title 22/700 at top 414 + pink dot "Vote open · 4 of 6 in" 13/600 muted. Three pitch cards `top 476`, gap 10: h 138, r22, critter 76–92 overhanging at top −20…−34, tag sticker at top 70 (5 px 9 px, r8, 13/800, rotated ±3–5°), voter avatars 22 at bottom 12 or "No votes yet" 11.5 muted.
- Dashed "+ Pitch a place": h 46, r23, 1.5 px dashed `#c4c6ce`, 15/600 muted, at top 626. Pon GuideNote at top 686.
- Taps: trip card → trip hub (6.01, the 1.05 zoom from this card). Pitch card → that pitch / vote (4.A). Chat → crew chat (5.A). Bell → inbox.

**3.03 Home · first sync on a new phone**
- Header as 3.01, with only the bell. Shimmer blocks use `linear-gradient(90deg,#ebebef,#f6f6f8 45%,#ebebef 90%)` (animate the sweep, about 1.2 s loop): name line 180×18 r9 at top 110; hero 250 h r32 at top 150 with two white-70% text bars; label 110×14; two rows 72 h r24 at 452/534.
- Progress card at `top 626`, white Card r24, padding 14 16. Pon think 36 on `#ffe6d3`. "Bringing the trip to this phone" 14.5/600. "Plan, bookings, chat · 38 of 84 MB" 12.5 muted. "45%" 13/700 tabular. Bar 6 h r3 `#eeeef2`, fill `linear-gradient(90deg,#ffd84a,#ff9a4d)`.
- Ways out: tabs stay usable; Wallet passes load first; keeps going in the background. This is the offline/first-sync state, not an error.

**3.04 Home · just back**
- Photo hero, full width, 420 h, `object-fit cover`. Overlay `linear-gradient(180deg, rgba(10,12,20,.35), 0 at 30%, 0 at 50%, #f5f5f7 at 100%)`. Header title in white. Bell in **Clear glass** (`rgba(18,20,28,.34)` blur 22 sat 1.6, inset top white .22, inset .5 white .14). On scroll past the photo, swap to Regular glass and ink.
- At top 236: "HOME 3 DAYS · OCT 22" 13/700 +0.1em ink, then "Bali is a memory now" 34/800 −0.04em lh 1.02 (over the fade).
- Action card `top 348`, r24, three rows min-height 62 with 40×40 r12 icon tiles (pink tint, rain tint, `#fff6c9` + star doodle). Row 1 ends in a small ink "Pay" pill (30 h, r15, 13.5/600). Rows 2–3 end in a chevron.
- "Same crew, next trip?" card `top 560, h 120, r26`, gradient `135deg #fff1e6→#ffe4f0`, tanuki 86 overhanging at right −4 top −6 rotated 10°. Title 18/700, body 13 `#3d404c`, ink pill "Plan the next one" 34 h r17.
- Taps: Pay → settle with Maya (7.16). Recap → recap (8.B). Rate → driver rating. Plan the next one → a new poll seeded with old pitches.

### Part 3.B Trips (`(tabs)/trips`)

**3.05 Your trips · live trip leads**
- Header: "Trips" 34/700. Right: GlassBtn44 search + ink `+` 44.
- Segmented filter `left 20 top 116`, 34 h, hugging its content (padding 0 14 per item): "All · 4" / "Planning" / "Home again".
- **Live card** `left/right 16, top 164, h 312, r34`. Shadow `0 0 0 .5 ink .08, 0 30 50 −24 ink .5`. Full-bleed photo with gradient `rgba(10,12,20,.25)→0 at 30%→0 at 55%→.35`.
  - "Live now" Clear-glass chip (30 h, r15, 12/600 white) with a blinking mint dot (glow `0 0 8 #54d6a4`).
  - Crew stack 28 (2 px white 90%) top right.
  - Bottom Clear-glass panel `inset 10, h 96, r26` (`rgba(18,20,28,.30)` blur 24 sat 1.6). "Bali" 30/800 −0.04em white; "Day 4 of 8 · Nusa Penida today" 13 at 85%; 8 day ticks 18×4 r2 (past white, today sun, future white 30%); a white 48 circle chevron button.
  - Gecko 78 at right 20 top 118, rotated 8°.
- "Coming up" 20/700 + "2 trips" 13/600 muted at top 494. Two-column grid at top 528, gap 10. Each card is 142 h, r26, padding 14:
  - a 96 tinted disc at top-right (−10/−8), with the critter 74 rotated on it;
  - name 19/700, sub 12 muted;
  - a 5 px progress bar (fill `#ff9a4d` or `#ffd84a`) and label 11/700 `#3d404c` ("2 of 4", "Planning").
- Past row `top 684, h 58, r22`, `rgba(255,255,255,.7)`, opacity .9. Tilted polaroid thumb 40×44, "Lisbon · home again" 14.5/600, "Recap ready · 312 photos" 12 muted, "Jun 2024" 12.5/600 muted.
- Taps:
  - Filter → filters the list (Snappy spring for the selection).
  - Live card → **zooms into the trip hub 6.01 (1.05)**.
  - Coming-up card → its plan (4.25) or vote (4.A).
  - Lisbon → recap (8.B).
  - `+` → new poll (4.01).
- Scroll: the large title collapses into the bar. The tab bar does not hide on root. The 1.04 shrink applies only if the native rendering is chosen.

**3.06 No trips yet**
- Title "Trips" only, no header actions. Radial sun wash `rgba(255,216,74,.22)` at 50% 32%.
- Open passport 318×206 at 36/150, idling with `ty 0→−6, r −2→−1` over 5200 ms. Two pages `#fffdf6` with a 115° hatch `rgba(23,20,42,.035)`, inner gutter shadows, mono "VISAS · STAMPS" 8.5 +0.12em `#9a917e`. Dashed placeholders: a 74 circle "YOUR FIRST STAMP" (`#e0b7c9` border, `#d47aa0` 8.5/800 text, rotated −12°); 50/60/72×46 shapes in `#e3dccb`.
- Plane 58 at 250/116, rotated 14°. Gecko 112 (point) at 228/286 with the `hop` loop.
- Copy at top 412: "Your first stamp / is waiting" 30/700 −0.03em; body 15 muted lh 1.45.
- Buttons at top 534, gap 10: InkPill "+ Pitch a place". Then a glass input pill 56 h r28 (`rgba(255,255,255,.7)` blur 20) "Join with a crew code" 16/600 with six 22×30 r7 empty code cells (`#f1f1f4`, inset 1 px `#e3e4e9`).
- Pon GuideNote at top 668.
- Taps: Pitch → places search 4.02. Join → code entry 2.15. Pon note → Kyoto guest guide.

### Part 3.C Running a crew (`crew/*`)

**3.07 Crew switcher** (popover, not a sheet)
- The Home header stays. The chevron flips up. The page below dims with a scrim `rgba(245,245,247,.55)` blur 6 from y 110 down.
- Menu `left 20, top 112, w 290, r24`, `rgba(255,255,255,.98)`, shadow `0 2 6 ink .08, 0 24 60 ink .22`. Rows have padding 12 14, gap 12, hairline. Each row: an avatar trio 24 in a 52 box, name 15/600, sub 12 muted, then a check (current crew) or an unread badge (20 r10 pink, 11/700).
- Action rows: 30 circle `#f1f1f4` with + or "#" (11/800), label 15/600.
- Taps:
  - Crew row → switches Home; "the title animates" (Snappy text cross-slide).
  - Badge row → switches and opens on what's new.
  - Start a crew → 3.08.
  - Join with a code → 2.15.
  - Tap outside → close.
- Motion: scale from the title anchor (0.9→1, opacity) on Snappy. On iOS this could be a native pull-down menu, but the avatar rows and badges need a custom popover.

**3.08 Start a crew**
- Header `top 58`: GlassBtn44 ✕ left, "New crew" 17/600 centred, 44 spacer right. Tangerine radial wash `#ff9a4d44` behind the pass (y 104–374).
- **Crew pass** at 80/114, 230×226, r `12 26 26 12`, background = cover colour, inset spine `12px 0 0 rgba(0,0,0,.09)`, inset top white .35, shadow `0 2 4 ink .12, 0 30 50 −18 ink .45`. Inner frame `inset 10 10 10 22`, r `5 18 18 5`, 1.5 px `rgba(255,243,196,.55)`.
  - "CREW PASS" 10/800 +0.32em.
  - Crest: 92 circle, white 24%, sticker 78.
  - Name 20/800 +0.06em uppercase.
  - Seats row: 18 avatars plus 5 dashed empty seats.
  - Ink on the pass is `#fff3c4`, flipping to `#17142a` on light covers (3.13 sun).
  - Idle loop: `r −4→−3, ty 0→−5`, 4800 ms.
- Labels 13/600 muted at 364/460/566.
- Name field at top 386: 56 h, r20, white, focused ring `0 0 0 2px #1c1d24` + shadow `0 10 24 −12 ink .3`, 19/600. Caret 2×22 `#4f86ff` (blink 1 s). Counter "10/32" 12/600 `#9a9daa`.
- Sticker strip card at top 482, r22, padding 6, six 52×56 cells. Selected: a white 26-radius bubble with shadow `0 10 20 −8 ink .35`, the sticker scaled 1.08 and rotated −8°, translateY −3, plus an ink check badge 18 with a 2 px white ring. Unselected opacity .92.
- Cover row at top 588: six 40×52 book swatches, r `4 10 10 4`, inset spine 5 px. Selected: lifted `translateY(−8) rotate(−4°)`, double ring `0 0 0 3 ground, 0 0 0 5 ink`, check badge.
  - Swatches drawn: `#ff9a4d #4f86ff #54d6a4 #ff5fa8 #ffd84a #1c1d24`.
  - The data script lists `#1f2a52` (navy) instead of sun: navy is the referral reward cover (3.11), so it is locked until earned (see §8).
- Footer `bottom 30`: hint 12.5 muted "Five seats wait on the pass. Tokek joins with your first trip." + InkPill "Start the crew" (disabled until there is a name).
- Keyboard: the name field focuses on entry. Return key "Done" dismisses it. The pass and field must stay visible above the keyboard: the field sits at y 386–442, the keyboard covers about y 510+, so the sticker and cover rows scroll under. The footer CTA rides the keyboard. Any script; max 32 characters.
- Taps: ✕ → back to 3.07, nothing saved (ask first if a name was typed, per "Nothing typed is lost"). Sticker → swaps the crest "with a slap" (Lively spring: scale 1.25→1, rotate). Cover → recolours (Smooth colour cross-fade, ink flips). Start → 3.09.

**3.09 Crew is on**
- Confetti burst, 40 pieces, origin (.5, .24), at t+700 ms. "Crew made" 13/600 muted + "Ramen club is on" 34/800 −0.04em, centred at top 70.
- **Ticket** at 28/156, w 334, r28, Card shadow `… 0 34 60 −24 ink .38`. It enters `ty 30, o 0 → ty 0, r −2°` in 840 ms with the `back` overshoot (Lively).
  - Stub: 150 h, in the cover colour. A 96 r30 crest tile (white 24%) holding sticker 84; "CREW PASS" 10/800 +0.26em `#fff3c4`; name 24/800 +0.04em white on two lines.
  - Perforation: 2 px dashed `#e3e4e9` with 24 px ground-colour notches at both edges, top 139.
  - Body padding 16 18 18: "CREW CODE" / "TAP TO COPY" 10.5/700 +0.12em muted; six split-flap tiles (grid gap 6, h 58, r12, halves `#2a2b34`/`#1c1d24`, a 1 px black-50% seam, 28/800 white).
- Share row at top 470: four 60 circles with labels 12/600 `#3d404c`. Messages is `#34c77b` (OFF-TOKEN); Copy code, QR and More are white.
- Tokek GuideNote (cheer) at top 578: "Ten crews max. You've got room for nine more."
- Footer: InkPill "Invite the crew" + "Done" 15/600 muted.
- Taps:
  - Messages → system share with the invite text and link.
  - Copy code / tiles → copy "RAMEN4", toast "Copied".
  - QR → full-screen QR.
  - Invite the crew → 3.10.
  - Done → Home for the new crew (3.01).
- Haptic: success on land (recommended; not stated).

**3.10 Invite sheet**
- The underlying page is dimmed by `rgba(20,22,40,.2)`. Sheet `left/right/bottom 8, top 120, r46`, `rgba(248,248,250,.86)` blur 34 sat 1.8, padding 12 18 0, inset top white .9, shadow `0 −18 50 −10 ink .28`. Grabber 36×5 r3 `rgba(60,60,67,.3)`, margin-bottom 14.
- Title "Invite to the Bali Six" 26/700 −0.025em. Sub "One seat left. The code works for 7 days." 13.5 muted.
- Code card: r26, padding 16, gap 14. QR 124×124 r16 (inset 1.5 `#e3e4e9`, padding 10, 9×9 grid gap 2, r1.5 modules). "Crew code" 11.5/600 muted; "BALI6X" 30/800 +0.08em; "Copy link" 34 h r17 `#f1f1f4` 13/600.
- "Send with" 13/600 muted. Five 58×58 r16 app tiles with labels 11.5: WhatsApp `#3fb27f`, Messages `#5ac85a`, Telegram `#4f86ff`, Mail `#5aa0f0`, More `#9a9daa`. Use real app icons where the platform allows; otherwise use the system share sheet with the targets pre-ranked.
- "Tokek suggests" card (r20, padding 10 12): Dev 36 avatar, "Hasn't opened his invite · opens things at night" 12 muted, ink "Resend" 34 h.
- Taps: QR / Copy link → copy the link + toast. App → opens it pre-filled. Resend → now; **long-press = schedule for 21:00**. Swipe down → closes.
- Half or full height: content ends about y 600, so use a large detent at top 120.

**3.11 Invite friends · referrals** (opened from Pass 9.01)
- Header: GlassBtn44 back; right is a plain text link "Referral terms" 13/600 muted (no capsule). Title "Invite friends" 32/700 at top 114. Sub 14 muted.
- Stamp page `left/right 16, top 200, h 236, r26`. Paper `#fffdf6` + 115° hatch, inset `.5 rgba(120,100,60,.15)`, shadow `0 2 4 ink .05, 0 24 44 −20 ink .3`. Mono header "PAGE 07 · REFERRALS" / "2 / 5" 9.5 `#9a917e`.
  - Two real stamps: an 84 circle in pink `#e0468e`, rotated −14°; a 90×66 r12 rect in green `#2e9a74`, rotated 9°. Both use a triple-ring box-shadow, "JOINED" 9/800, name 20/800, date 8.5, opacity .92.
  - Three dashed placeholders.
  - Reward track: 4 px rail `#ece5d3`, ink progress 40%, dots 12 at 6/22%/40% (the next one is a hollow ring), a navy `#1f2a52` cover book 30×40 at 60%, a sun book at 100%. Labels 11/700 `#6e6658`.
- Link row `top 452, h 54, r27`: "critterpass.app/w/**winston**" 15/500 `#3d404c` + "Copy" 42 h `#f1f1f4` 14/600.
- "Friends you invited" card: 34 avatars, name 15/600, status sub 12 muted, chip "Stamped" (booked tint) or "Joined" (rain tint).
- InkPill "Share my link" with a share glyph.
- Taps: Back → 9.01. Terms → plain terms page. Stamp → who and when. Copy → toast. Friend → status, plus Nudge if they have not planned. Share → system share.

**3.12 Crew settings · organiser**
- Header: GlassBtn44 back, "Crew" 17/600, GlassCapsule "Edit".
- Crest at top 110: a 78×76 book tile r `8 18 18 8` in the cover colour, rotated −4°, sticker 62, shadow `0 14 26 −12 rgba(200,140,0,.6)` (cover-tinted). "The Bali Six" 24/700; "6 members · since March 2026" 13 muted.
- Members card `top 252`, r22, padding 12 8 10. "Members · 6" 13/600 muted + "+ Invite" 13/700 `#2f5fc4`. Six-column grid: 42 avatars, name 11/600 `#3d404c`. ORG badge: 8/800 white on ink, r6, 2 px white border, at right −4 bottom −3.
- Trips card `top 372`: rows 52 h, name 15/600, sub 12 muted, status chip ("On now" booked, "Voting" vote), chevron. "Plan a trip" row 44 h in `#2f5fc4`.
- Code card `top 530`: QR thumb 46 (7×7), "Crew code · 7 days left" 11.5/600 muted, "BALI6X" 21/800 +0.08em, "Share" 34 h `#f1f1f4`.
- Settings card `top 612`: "Notifications" (15/400) with value "Mentions" muted + chevron; "Keep chat if I leave" with a Toggle.
- "Leave the crew" button `top 722, h 48, r22`, white Card, 16/600 `#d93a62` (OFF-TOKEN, use `#d6337f`). Footnote 11.5 muted: "You run this crew, so you'll hand it over first."
- Taps:
  - Edit → 3.13. "+ Invite" → 3.10. Member → 3.14 sheet.
  - Bali → hub 6.01. Kyoto → vote 4.A. Plan a trip → 4.01.
  - Share → 3.10; **long-press → New code**.
  - Notifications → Everything · Mentions · Nothing, per crew (half-height sheet, one choice).
  - Keep chat toggle → saves at once, toast with Undo.
  - Leave → 3.16 for the organiser; members get the 9.08-style confirm.
- Role variant: members see no Edit, no ORG controls and no New code (the "Roles shape the screen" rule; this view is not drawn).

**3.13 Edit crew**
- Header: GlassBtn44 back, "Edit crew", InkCapsule "Save". The body is identical to 3.08 with a sun cover: ink on the pass flips to `#17142a`, frame ring `rgba(23,20,42,.35)`, wash `#ffd84a44`. The seats row shows the 6 real avatars (18, borders in the cover colour, −8 overlap). "12/32".
- Tokek GuideNote at the bottom (bottom 30): "Everyone sees the new pass, and invites you've already sent update too."
- Taps:
  - Back → "Discard changes?" alert if dirty, else 3.12.
  - Save → toast "Pass updated" and back to 3.12.
  - Pass preview → flips to its back (code + members). Use a rotateY 180° Smooth spring with perspective; the back face is not drawn.
- Keyboard as in 3.08. Return "Done".

**3.14 A member** (sheet)
- Scrim `rgba(20,22,40,.3)`. The sheet is **opaque** `#f5f5f7` (not glass), `left/right/bottom 8, r44`, padding 12 16 26, shadow `0 −18 50 −10 ink .3`. Grabber, then a 32 close circle `rgba(118,118,128,.14)` at the right.
- Identity: 76 avatar (30/700), "Maya" 24/700, "Joined March · 2 trips together · Rare Temple Tokek" 13 muted.
- Three action tiles (grid gap 8, h 92, r22, Card, doodle 40 + 13/600): Message (chat, sky), Her pass (ticket, pink), Owes you $24 (wallet, mint).
- Row card: "Make organiser" / "You stay in as a member"; "Kyoto" / "Her RSVP · voted Nusa Penida" with value "In"; "Remove from the crew" 15/400 `#d93a62`.
- Taps: Message → crew chat with "@Maya" pre-filled. Her pass → 9.01 crew view. Owes → balances with Maya (7.B) with Nudge. Make organiser → confirm alert, then she runs the crew. Kyoto → who's in (4.51). Remove → 3.15. Close / swipe → 3.12.

**3.15 Remove a member** (glass alert)
- Backdrop: `rgba(20,22,40,.24)` + blur 8 saturate 1.2 over 3.12.
- Alert `left/right 30, top 226, r36`, `rgba(250,250,252,.8)` blur 40 sat 1.9, padding 26 18 16, inset top white .95, inset .5 white .7, shadow `0 40 80 −20 ink .5`.
  - Avatar 72 with a 4 px white ring and a `#ff3b5c` minus badge 28 (3 px white).
  - Title "Remove Dev from / the Bali Six?" 20/700 lh 1.2.
  - Two consequence lines 13.5/1.4 `#3d404c` with 22 tinted icon dots.
  - Buttons 52 h r26, gap 8: "Remove Dev" in tint `rgba(255,59,92,.12)` / text `#d93a62` (OFF-TOKEN), then "Keep Dev" as an ink pill.
- Enter: `scale 1.08, o 0 → 1` in 360 ms ease-out (Smooth).
- Taps: Remove → removes; **toast with Undo for 10 s**; back to 3.12. Keep → closes. This is reversible, so a tap is enough (not hold).

**3.16 Leave the crew · hand over**
- Header: back, "Leave the crew". Title "Who runs the Bali Six next?" 30/800 −0.04em lh 1.02 at top 116. Sub 14 muted.
- Radio list card `top 242`: rows 56 h with a 36 avatar, name 15/600, reason 12 muted. Radio 22: selected = ink ring with a white inner and an ink dot (`inset 0 0 0 6 ink, inset 0 0 0 11 #fff`); unselected = 2 px `#c4c6ce`. Dev's row at opacity .55 ("quiet", still selectable).
- Tokek GuideNote at top 540 (keeps critters; "$186 stays in Balances").
- Footer: InkPill "Hand over to Maya and leave" (the label follows the pick) + "Hand over, but stay in".
- Taps: Back → 3.12, nothing changed. Pick → updates the label. Hand over and leave → Maya is told, you leave, Home switches crew. Stay → you become a member, settings lock to Maya.

### Part 3.D Inbox and recovery

**3.17 Inbox · answer from the card**
- Drawn with the tab bar (Home active) and a large title: see §8.
- Title "Inbox" 32/700 at top 64. Right: a white capsule "Mark all read" 36 h, r18, 14/600, shadow as the 3.02 buttons.
- Segmented 40 h at top 118: All / "Needs you" + pink count badge 18 (flex 1.4) / Crew / Guides.
- "Needs you" 13/600 muted at top 178. Cards at top 200, gap 10, r22, padding 14, gap 12:
  1. Vote card: polaroid photo 48 (padding 3, r12, rotated −5°), "Boat day closes Friday" 16/600, "You haven't voted. Penida leads 4–2." 13 muted. Two 38 h r19 buttons: ink "Nusa Penida 4" (count at 60% opacity) and `#f1f1f4` "Gili T 2".
  2. Decision card: Tokek think 44 on `#fff6c9`, "Move dinner to 21:00?". Ink "Approve" + grey "Keep 19:30".
  3. Nudge card: Pon in a dashed 48 ring `#b9bbc4`, "Kyoto: replies due Sep 30", grey "Nudge Dev" 34 h on the right.
- "Earlier" list `top 600`: rows padding 11 14, 32 avatar, 14/1.3 text, an optional "Undo" 13/600, time 12 muted.
- Taps: an answer button resolves inline. The card should collapse out (Smooth height + fade) and the count badge decrements. Undo reverts. "Mark all read" clears the unread state.

**3.18 Inbox · first time**
- Push header: GlassBtn44 back, "Inbox" 17/600, GlassBtn44 gear (inbox settings).
- Segmented 34 h without the Needs-you tab.
- Three example cards, 72 h r22, ring only, with a stepped fade (opacity .7/.45/.25, scale 1/.97/.94). Each has a 40 r12 tinted icon tile, 15/600 + 12.5 muted, and "EXAMPLE" 11/700 +0.06em `#9a9daa`.
- Bell 70 sticker at top 430. "Nothing here yet" 24/700. Body 15 muted.
- InkPill "Allow notifications" + "Not now — I'll check in here" (36 h, 15/600 muted).
- Taps: Allow → the OS permission prompt (iOS/Android). Not now → stays. Gear → inbox settings. Back → Home.

**3.19 Lost link** (`+not-found`)
- Background radial `#e6f6fb→#f5f5f7` at 50% 34%. GlassBtn44 ✕ at top-left.
- Art 240×220 at top 150: a floating gecko 140 (think, `float` loop 0→−9 px, r −2↔2), a pink pin 54 rotated 12°, and an elliptical ground shadow.
- "This page wandered off" 28/700 −0.03em lh 1.1; body 15 muted.
- Row card `top 520`, r24: "Go to Home" (40 tile `#f1f1f4`) and "Search your trips" (rain tint), rows 62 h.
- Text button "Tell us this link is broken" at the bottom.
- Taps: ✕ / Home → Home. Search → trip search. Report → feedback form with the URL attached.

**3.20 Something broke** (error boundary)
- The page behind is kept (header "Day 4 · Nusa Penida", skeleton) under `blur(2px)` at opacity .6, plus a scrim `rgba(20,22,40,.18)`.
- Sheet `left/right/bottom 8, top 372, r46`, `rgba(248,248,250,.88)` blur 34 sat 1.8, padding 10 18 0, grabber.
  - Pon think 52 on `#ffe6d3`.
  - Eyebrow "ON OUR SIDE, NOT YOURS" 12/700 +0.08em `#a8501a`. "That didn't load" 24/700.
  - Body 14.5 muted ("Your plan is safe, and nothing you typed was lost").
  - Two tiles 84 h r22 (ring only): ‹ "Go back", ⌂ "Go home".
  - Footer at bottom 24: InkPill with ↻ "Try again" + "Send a report with this screen".
- The rule "three ways forward" is satisfied. The report attaches a screenshot (privacy-blurred like shake).
- Motion: the sheet rises on Smooth. The page blur animates 0→2 px.

### Part 9.A Profile and settings

**9.01 Profile · passport page** (drawn without a tab bar)
- Header `top 60`: GlassBtn44 back; right: a white "Edit" capsule 40 h (padding 0 16, r20, 14/600, white with the button shadow) + GlassBtn44 gear, gap 8.
- Passport card `left/right 20, top 118, r28`, padding 16. Paper `#fffdf6` with `repeating-radial-gradient(circle at 20% 120%, rgba(23,20,42,.04) 0 1px, transparent 1px 7px)`, shadow `0 2 4 ink .05, 0 16 36 ink .08`.
  - Avatar 82 on `#e3f6ec`, double ring `0 0 0 3 #fff, 0 0 0 5 #4f86ff` (the tier colour), worn critter 78.
  - "Winston" 28/700; "@winston · Singapore" 13 `#5d564b`.
  - Sticker tags 11/800 (Pass+ sun, rotated −3°; "◆ Temple Tokek" sky, rotated 2°).
  - Stats row, separated by a 1.5 px dashed `rgba(23,20,42,.14)` rule: 24/800 numbers, 12 labels `#5d564b`.
  - MRZ line in Mono 10 +0.12em `#5d564b`: "P<SGPWINSTON<<CP0427" / "SINCE 2022".
- "Stamps" 15/700 + "All 12 ›" 13/600 muted at top 342. Five 68 white circles, rotated, with a triple-ring stamp border (the last one single ring, "Bali IN 17 DAYS" = upcoming), place 13/800 + date 8.5/800 +0.1em.
- "How you travel" + "Retake" at top 466. Sticker tags (padding 6 11, r9, 2.5 px white, 13/800, rotated ±2–3°).
- "Your crews" card at top 628: avatar trio 26, name 15/600, sub 12 muted, chevron.
- Taps (not listed; inferred): Edit → 9.02. Gear → 9.04. Stamps → all stamps (`you/stamps`). Retake → taste quiz. Crew → 3.12. Invite friends (3.11) is reached from here per 3.11's back.
- Scroll: content scrolls; the header buttons stay on glass.

**9.02 Edit profile**
- Header: back, "Edit profile", InkCapsule "Save" (gradient).
- Passport data page `left/right 16, top 118, h 214, r24`, rotated −1.2°. Paper with the 115° hatch, inset `.5 rgba(120,100,60,.18)`, shadow `… 0 26 44 −22 ink .35`. Mono header "CRITTERPASS · PASSPORT" / "CP-0417" 9.5.
  - Photo 104×124 r12 with a glass "Change" pill (26 h, white 62% blur 14).
  - Field labels in Mono 8.5 `#9a917e`; values 20/800 ("Winston") and 13.5/700.
  - "◆ Temple Tokek" tag at right 14 top 30, rotated 6°.
  - MRZ 10.5 +0.14em `#b3a993`.
- Eye note at top 346: "This page is all your crews ever see" 12.5 muted.
- Field card at top 380: rows 52 h, key 14 muted (104 w), value 15.5/500, chevron. Fields: Name, Username, Home airport, Languages.
- Card at top 604: "App icon" (38 r10 tangerine tile with a ring glyph) "Passport · 3 earned"; "**Appearance**" (38 ink tile with a sun glyph) "Follows the phone".
- Taps:
  - Save → back to 9.01.
  - Change → camera or library.
  - Field → edit in place: inline editing or a field sheet. Today this is `field-sheets.tsx`; keep the sheets, Return "Done".
  - App icon → 9.03.
  - Appearance → Follows the phone · Light · Dark (half-height sheet, one choice).
- The live preview updates the passport card as fields change.

**9.03 App icon**
- Home-screen preview `left/right 16, top 114, h 226, r30`. Photo with an overlay `rgba(10,20,40,.1→.3)`. 4×2 app grid of 56 icons r15 (others are glass white 28%; ours is the real icon at scale 1.06 with a 3 px white ring and a shadow). Labels 10.5/600 white with text-shadow. Dock: 64 h r26 white 22% blur 20.
- Style card at top 358: four 60 icons + name 12/600 + status 10.5 muted ("In use", "Free", "Pass+"). The selected one gets a double ring `0 0 0 3 #fff, 0 0 0 5.5 ink`. A "PASS+" sticker tag sits on the Stamp icon.
- Appearance segmented (34 h) inside the card: Auto / Light / Dark / **Clear** / Tinted.
- "Earned on the road" + "3 of 6" at top 566. Six 52 r14 tiles: earned ones have a tint bg and shadow; locked ones have a 1.5 px dashed `#c4c6ce` border, a lock glyph and a `#9a9daa` label.
- Tokek GuideNote at top 676.
- Taps:
  - Style → swaps with the system "icon changed" prompt.
  - Stamp without Pass+ → paywall 9.10 (explicit entry, not governed).
  - Appearance → redraws the preview (Smooth cross-fade).
  - Locked critter → shakes (horizontal 6 px ×3, about 300 ms) and says how to earn it.

**9.04 Settings**
- Header: back; right: yellow chip "Pass+ · yearly ›" (32 h, r16, `#ffd84a`, 12.5/700 `#17142a`). Title "Settings" 32/700 −0.03em at top 114, in content. It should collapse into the inline bar on scroll; `features/you/settings/collapsing-header.tsx` already exists.
- Groups at top 166, gap 6. Header 12.5/600 muted, padding 8 6 2. Cards r20, shadow `0 1 2 ink .04, 0 6 18 ink .05` (lighter than Card: OFF-TOKEN drift). Rows padding 10 14, min-height 52, title 15/600, sub 12 muted.
  - Your guide: "How chatty" with a mini segmented control (30 h, `#f1f1f4`, selected ink pill r12, 11.5/600 Quiet/Normal/Chatty); "Talk out loud" toggle.
  - Notifications: "Leave-by alarms" toggle; "Crew chat" "Mentions only ›".
  - Privacy: "Location" "During trips ›"; "Find bookings in my email" toggle; "Budget max" "Private".
  - Offline: "Bali trip saved offline" ✓.
- No Appearance row here: it lives on 9.02 (see §8).

**9.05 Offline storage**
- Header: back, "Offline".
- Meter card `left/right 16, top 116, r28`, **ink** `#1c1d24`, padding 18, mint glow radial at the top right.
  - "Saved for no signal" 13/600 at 70%.
  - "212" 44/800 −0.04em + "MB" 18/700 at 80% + "3.1 GB free" 12.5 at 70%.
  - Stacked bar 10 h r5, gap 2: Bali mint 84, Kyoto tangerine 96, Recaps sky 32, free white 12%.
  - Legend 11.5/600 with 8 px dots.
- List card at top 300: 50 r15 critter tiles, name 15.5/600, sub 12 muted. Action pills 32 h r16 12.5/600: "Saved" (booked tint), "Save now" (ink), "Remove" (vote tint `#ffe4f0/#b0306b`).
- Toggles card at top 528: "Save the next trip automatically", "Only on Wi-Fi" (rows 52 h, 15.5).
- Tokek GuideNote at top 640: "I pack the next trip the night before you fly."
- Taps: trip → what's saved and its size; remove it (confirm alert, as today's "Take this trip off this phone?"). Toggles save at once.

### Part 9.B Help and leaving

**9.06 Help and feedback**
- Header: back, "Help". Title "How can we help?" 32/700 lh 1.05 (right 120). Guide line in **Borel 12.5/1.5 `#6b5a24`** (the Guide token is Borel 15: OFF-TOKEN size). Gecko 96 (point) at the top right.
- Search pill `top 232, h 50, r25`, glass `.72` blur 24 sat 1.9, placeholder 16 `#9a9daa` "Refunds, offline maps, splitting…".
- Ink "Shake any screen" card `top 296, h 96, r24`. A phone glyph 38×64 that shakes: rotate 0→−10→10→−8→6→0 over 960 ms every 3200 ms, origin 50% 80%. Title 16/700, body 13 white 70%.
- Row card at top 408: 36 r10 accent tiles with doodles. Report a problem (pink), Send feedback (sky), Suggest a feature "Vote on 48 ideas" (sun), Rate the app (mint). Rows 58 h.
- "Asked this week" chips (38 h r19 white, 13.5/600), a horizontal scroller that bleeds off the right edge.
- Footer: three 22 dots + "A human replies within two days" 12.5 muted, at bottom 38.
- Keyboard: search focus raises the keyboard and the results replace the rows. Return "Search".

**9.07 Idea board**
- Header: back + yellow chip "3 votes left". Title "What's next?" 32/700 at top 116. Segmented 40 h: Top / New / Shipped.
- Idea cards (gap 8, r20, padding 10 14 10 10). Vote block 52×56 r14 (ink when voted, else `#f1f1f4`) with a ▲ + count 15/800. Title 14.5/600. Status chip 20 h r10 10.5/700 (Planned = booked tint, Building = rain tint, Looking at it = maybe tint) + note 11.5 muted.
- InkPill "Suggest an idea" at bottom 40.
- Taps: sort tabs; idea → detail and comments; vote → spends 1 of 3 (the block flips to ink, the count +1: Snappy + number roll); Suggest → form (sheet).

**9.08 Confirm · destructive** (the alert pattern)
- Scrim `rgba(20,22,40,.35)`, no blur. Alert `left/right 36, top 250, r30`, **opaque `#fff`**, padding 24 20 18, shadow `0 30 70 ink .35`. Boat sticker 86 overlapping the top (margin-top −62).
- Title 21/700. Body 14/1.45 muted.
- Buttons 50 h r25: destructive "Cancel for everyone" (`#ffe4f0` / `#b0306b`) on top, then the ink pill "Keep it".
- Taps: Cancel → cancels, refunds into Balances, tells the crew. Keep → closes.
- Unify with 3.15 (see §4).

**9.09 Delete account · hold to delete**
- Header: GlassBtn44 back + a "Settings" label 15/600 muted beside it (back-title style; the other pushes centre a title).
- Title "Delete your account?" 30/700 at top 116; sub 14 muted.
- Two cards at top 198 (gap 10, r22, padding 14): sticker tags "Goes" (pink, rotated −3°) and "Crew keeps" (mint, rotated 3°), lines 13/1.4.
- Owed card at top 372: `#fff6c9`, r22, padding 12 14, wallet 40, "You're owed $186.40" 15/700, sub 12 `#6b5a24`, ink "Settle up" 34 h.
- Billing note at top 458: 12.5/1.45 muted, ending in "**Manage subscription ›**" in ink.
- **Hold ring** 148 at top 540: conic pink `#ff5fa8` progress over `#ffe4f0`. Inner 128 white disc, shadow `0 8 20 ink .1`. "KEEP HOLDING" 11/700 `#b0306b` +0.06em (shown while held) and "Hold to delete" 17/700.
- Footer 12 muted: "Closed now, erased after 30 days. Sign in before Oct 26 and everything comes back."
- Taps: Settle up → Balances (7.16). Manage subscription → App Store / Play subscriptions. Hold → the ring fills (today 3 s via `HoldRing` + `motion/gestures/hold-fill.ts`); release early → it springs back (Smooth). "Download my data first" is listed in the taps but not drawn (keep today's link).
- Haptics: light ticks while filling, success/warning on complete (recommended; not stated).

### Part 9.C Pass+ and Trip Boost

**Pass+ night theme** (9.10, 9.15, 9.17 card): background `radial-gradient(90% 50% at 50% 30%, #332e5e, #17142a 62%, #100e1e)` with 3 gold diamond sparkles `#ffe48a` (4–6 px, rotated 45°, opacity .4–.7). Glass on dark: `rgba(255,255,255,.08–.10)` blur 18–20 sat 1.6, inset top white .16–.22, ring .5 white .10–.12. This is not the Foundations dark ground (`#0e0f13`); treat it as a fixed themed surface that does not change with Appearance.

**Visa card** (9.10/9.15): h 262 (9.10) or 250 (9.15), r24, paper `#fffdf6` + radial dot pattern pink `.07`, shadow `0 2 4 rgba(0,0,0,.2), 0 30 60 −20 rgba(0,0,0,.6)`, rotated −2°.
- Mono header "VISA · PASS+ · POUR VOUS" / "PAGE 07" 10 `#7a7264`.
- "Pass+" 54/800 −0.055em lh .9. "$29.99" 22/800 + "a year · $2.50/mo" 12.5/600 `#7a7264`.
- 2×2 fields (labels 9/700 +0.1em, values 13.5/700), width 196.
- MRZ 9.5.
- Holo ring 124 conic (pink, sun, mint, sky) at 75%, blur 1, spinning 10 s linear, with the Stamp app icon (circle, 108) on top.
- Shine sweep: a 110 px white 70% band, skewX −20°, translateX −120→440 over `.55–.80` of 5200 ms, `cubic-bezier(.4,0,.2,1)`.

**Gold CTA**: 56 h r28, `linear-gradient(180deg,#ffe78f,#ffd84a 48%,#f0b72c)`, 17/700 `#17142a`. Inset top white .75, inset bottom `−2 rgba(160,100,0,.22)`, ring `.5 rgba(160,100,0,.3)`, glow `0 18 34 −12 rgba(240,180,30,.6)`. Shine band 80 px every 4200 ms.

**9.10 Pass+ paywall**
- Header `top 58`: dark GlassBtn44 ✕. A context chip (32 h r16, white 8% glass, Pon 26 avatar on `#ffe9d6`, 12.5/600 white 85%) "Pon's 30th answer today" (= the entry point). "Restore" 14/600 white 70%.
- "Go further / than free" 36/800 −0.045em white at top 118.
- Visa at top 208. **"FIRST TRIP FREE" stamp** at 226/420 (Bali Six, Oct 12–26): blue `#2f5fc4` triple ring, r12, paper 92%.
  - It drops `ty −60, scale 2, r −20° → scale(.9,.84) r 9° → scale 1` (540 ms fall `cubic-bezier(.55,0,1,.45)`, then 360 ms settle `cubic-bezier(.2,1.4,.4,1)`).
  - It shows only when FTF covers this user.
- Boost row `top 500, h 74, r24`, dark glass: a pink "BOOST" ring stamp 52 (rotated −10°, text `#ff8fbf`), "Or boost Kyoto for the crew" 15/700, sub 12.5 white 65%, chevron.
- Plan tiles at top 590, two columns, gap 10, h 60, r20. Monthly is dark glass "$3.99". Yearly is selected: `rgba(255,216,74,.12)` with a 2 px `#ffd84a` inset, "Yearly" 12 `#ffe48a`, a "SAVE 37%" mint sticker tag rotated 6°.
- Footnote "Critters are never for sale. You earn every one." 12/600 white 50% at top 668.
- Gold CTA "Get Pass+ · $29.99 a year". Under it: "Boost Kyoto instead" / "What's in each ›" 14/600 white 72%.
- Taps: ✕ → back where you were (records a quiet no). Get → StoreKit sheet (then 9.15). Boost → 9.12. What's in each → 9.11. Restore → restore purchases (then 9.17 or a toast).
- Presentation: full-screen cover from the gate. Enter on Smooth: the page steps back, the visa drops in, then the stamp on Lively.

**9.11 What's in each**
- Light push: back, "What's in each". Title "Free already does most of it" 28/800 −0.04em at top 112; sub 13.5 muted.
- Table card `top 206`, r22: a header row 40 h with labels 11/800 +0.08em (FREE muted, PASS+ `#8a6a0c`, BOOST `#b0306b`). The Pass+ column is highlighted by a `#fff3b8` r16 band (x 197, w 68, inset 6).
- Rows min 36, label 12.5/600, values 12.5 (11 for long ones). Pass+ column 700 ink; "–" in `#c4c6ce`.
- Rows: guide 30/day vs ∞ vs ∞ on trip; redrafts 3 / 3 / ∞; email bookings; crew size 6 / 6 / 16; live map; lock screen; icon styles 3 / All 4 / –; sponsored Shown / None / None; who it covers.
- Footer two columns (gap 10, 52 h): a gold "Pass+ · $29.99" (15.5/700) and a white pink-outlined "Boost · $12" (`inset 0 0 0 2 #ff5fa8`, text `#b0306b`). Note 11.5 muted.
- Taps: back → 9.10. Pass+ → StoreKit. Boost → 9.12.

**9.12 Boost Kyoto · who pays**
- Header: GlassBtn44 ✕ + centred two-line title "Boost Kyoto" 16/600 / "The Bali Six · Apr 2–9" 12 muted.
- Entry stamp card `left/right 18, top 118, h 148, r20`, rotated −1.5°, paper + hatch, pink triple ring (`3 #ff5fa8 / 7 paper / 8.5 #ff5fa8`), shadow `0 18 36 −16 rgba(176,48,107,.45)`. Mono "TRIP BOOST · ENTRY" 10 +0.16em `#b0306b`, "Kyoto" 44/800 ink, "On until Apr 16, a week after you land" 12.5/600 pink. Tanuki 120 at 246/96, rotated 8°, overhanging.
- Perk chips at top 286 (30 h r15 white, 7 px coloured dots, 12.5/600).
- Option rows at top 368, gap 8, 62 h:
  - Selected: r20, 2.5 px ink ring, radio on, "This trip" 15/700, "Kyoto, Apr 2–16" 12 muted, "$12" 20/800.
  - Unselected: r22 Card, "Every trip, all year" "$59" + a "+ PASS+ FOR YOU" sun tag rotated −4°.
- "Who pays" segmented 40 h: "I'll cover it" / "Split 6 ways".
- Split avatars: six 40 avatars fanned on an arc (ty 6/0/−4/−4/0/6, r −8…8°), each "$2" 11.5/700. Note: "$2 each goes into Balances, like any shared expense."
- InkPill "Boost for $12 · you pay $2". Footnote "Trip cancelled? The boost moves to your next one."
- Taps: ✕ → close. Boost → StoreKit (9.13). Year option → StoreKit. What's in each → 9.11 (not drawn as a button here; it is in the text "ways out").
- Switching "Who pays": the avatars fan in/out (Snappy stagger) and the button label updates.

**9.13 Checkout** (system)
- Drawn as the Apple Pay sheet with "Split: $2 each in Balances". In-app purchases must use the StoreKit/Play billing sheet, which cannot show custom rows (see §6/§8). The app only dims 9.12 behind it.
- Cancel → back to 9.12, nothing charged. Pay → 9.14.

**9.14 Boosted · the entry stamp** (1.07 signature)
- Full-screen paper `#fffdf6` + hatch. Mono "ENTRIES · ENTRÉES" / "PAGE 08" 10.5 at top 66. Faded prior stamps: "ARRIVED SIN" green 96 circle (opacity .55), "DPS" blue 84 (opacity .5).
- **BOOSTED stamp** 270 w at 60/186. Ring `4.5 #e0468e / 9 transparent / 10.5 #e0468e`, r18, text `#d6337f`, mix-blend multiply. "THE BALI SIX" 11/800 +0.22em, "BOOSTED" 52/800, "KYOTO · APR 2–16" 11/800, three 5 px dots.
- Timeline (from 0 = screen shown):
  - +1080 ms: appears at `ty −140, scale 2.3, r −30°`.
  - Falls 600 ms (`cubic-bezier(.55,0,1,.45)`) to `ty 0, scale(.92,.84), r −7°`.
  - Settles 480 ms (`cubic-bezier(.2,1.4,.4,1)`) to scale 1.
  - +1830 ms: ink ring 280×160 r24 `3 px #e0468e` from scale .6 / opacity .7 to 1.8 / 0 over 810 ms; confetti 48 at (.5,.3).
  - +2400 ms: tanuki 120 cheer pops (scale .4→1, 360 ms `cubic-bezier(.2,1.5,.4,1)`, then `hop`).
  - +2640 ms: Borel line "Unlimited redrafts. I have ideas about Nara." 15/1.5 `#8a4a12`.
  - +3000/3240/3480/3720 ms: four perk chips pop (34 h r17 white, 22 tick disc in perk colour, 13.5/700).
  - In the app this plays once (the design loops at 6 s).
- Split card at top 560: avatar stack 28, "Maya, Jordan, Rin, Dev and Alex each owe you $2. It's in Balances." 13.
- InkPill "Tell the crew" + "Done".
- Taps: Tell the crew → posts the boost card (9.16) to chat. Done → Kyoto plan. The Balances link is implied.
- Haptic: a heavy impact at the squash (recommended).

**9.15 Welcome to Pass+ · admitted**
- Night theme. The visa drops at +360 ms from `ty −40, r −6°` to `r −2°` (720 ms, `cubic-bezier(.2,1.2,.4,1)`).
- The green "ENTRY ADMITTED 02 NOV 2026" stamp 120 circle (`#2e9a74` triple ring, paper 70%) lands at +1560 ms: fall 540 ms + settle 360 ms, final rotation −12°.
- Confetti 44 at (.3, .33). Gecko 110 cheer pops at +2520 ms.
- "You're in, Winston" 32/800 white at top 368; "Pass+ yearly · renews Nov 2, 2027" 13.5 white 65%.
- Perk list card at top 462, dark glass r26, padding 6 16. Rows padding 10 0 with hairline white 10%. Mint 24 tick discs pop at +3000/3360/3720/4080 ms. Text 14.5/600 + 12 white 55%.
- Gold CTA with an inline 30 Stamp icon: "Try the Stamp icon". "Done" 15/600 white 70%.
- Taps: Try → 9.03 (preselects Stamp). Done → back where you were.

**9.16 What the crew sees** (chat, Part 5 owns the screen; this part owns the card)
- Boost chat card `left 14, right 30`, r22, Card. Top strip 8 h: pink dashes `repeating-linear-gradient(90deg,#ff5fa8 0 10px,#fff 10px 14px)`. W avatar 36, "Winston boosted Kyoto" 15/700, "Apr 2–16 · split 6 ways" 12.5 muted. "BOOSTED" mini stamp (rotated 10°, double ring `#e0468e`, 12/800 `#d6337f`). Perk chips 26 h in vote tint. Buttons 40 h: ink "Settle $2" + grey "Thanks Winston".
- Pon bubble `#fff1dc` / text `#5a3410`. A settled pill (`#e3f6ec` / `#174a35`, avatars on mint border): "Maya and Jordan settled · 3 to go".
- Composer 56 h r28 white, + button 40 `#f1f1f4`, placeholder 15 `#9a9daa`.
- Taps: Settle → Balances. Thanks → posts a reaction/reply.

**9.17 Your plan**
- Header: back, "Your plan".
- Plan card `top 116, h 180, r28`, night radial `#332e5e→#17142a`. "PASS+" 11/800 +0.14em `#ffd84a`; "Yearly" 34/800 white; "Renews Nov 2, 2027 · $29.99" 13 white 70%; MRZ 9.5 white 30%; Stamp icon 96 at the right; shine sweep every 5600 ms.
- "Boosts" card at top 342: rows padding 12 16, name 15/600, sub 12.5 muted, chips "On" (booked) / "Ended" (unopened).
- "Manage" card at top 518: rows 50 h 14.5 ink + value 13.5 muted + chevron. Change plan "Yearly"; Payment method "•••• 4412"; Redeem a code; Restore purchases.
- "Cancel Pass+" 15/600 `#d6337f` centred at bottom 40.
- Taps: Back → Settings. Cancel → 9.23. Payment method → store management. Redeem → code entry (StoreKit offer-code sheet on iOS). Restore → restore.

### Part 9.D Gates, endings and errors

**Gate map → current logic** (`packages/domain/src/paywall/entries.ts` entry points, governor in `governor.ts`, resolvers in `packages/entitlements/src/resolve.ts`):

| gate | design trigger | offer | entry point | capability check | current UI | status |
|---|---|---|---|---|---|---|
| 5.14 | Pon's 30th answer today | Pass+ | `guide_limit` | `guideMeterSubject` + `quotaDecision` (30/day; unmetered when Pass+/Boost/crew holder) | `features/guide/meter/use-guide-meter-slots.tsx` | E |
| 7.05 | Find bookings in my email | Pass+ | none: `mailboxImport` is gated by `passPlus` | `resolveUserCapabilities().mailboxImport` | `features/bookings/mailbox/mailbox-slot.ts`, `MailboxSheet.tsx` | E (explicit, ungoverned) |
| 9.03 | Tap the gold Stamp | Pass+ | `plan_page` (explicit) | `iconStylesAll` (also true while paused) | `features/you/app-icon/app-icon-screen.tsx:91` | E |
| 8.11 | Mail a real postcard | Pass+ | `postcard` | `printedPostcardSender` | `app/(trip)/recap/[tripId]/postcard.tsx` → `features/album/postcard/postcard-screen.tsx` | E |
| 9.18 | Redraft with one left | Boost | `redraft_last` | `redraftLimit` 3 / ∞ + `redraftReservationDecision` | `app/(trip)/[tripId]/draft/last-redraft.tsx`, `features/plan/draft/redraft/boost-offer.tsx` | E |
| 9.19 | Open crew map, unboosted | Boost | `live_map` (quiet no per trip) | `TripCapabilities.liveMap` | `features/crew/live-map/states/gate-card.tsx` | P (no last-trip replay or open count) |
| 9.20 | Invite a seventh person | Boost or waitlist | `seat_cap` | `seatCap` 6 / 16 | `features/monetize/seat-cap/*` (a sheet today, a push in the design) | E |
| 2.16 | Join a full crew | Boost or waitlist | `seat_cap` | `seatCap` | `features/onboarding/invited/{ManifestScreen,InviteTicket,ticket-model}.tsx` + `features/crew/seat-limit/*` (waitlist) | E |
| 6.30 | Crew on the lock screen | Boost | `lock_screen_map` | `liveMap` | `features/trip/live-activities/lock-screen-offer/*` | E |
| 9.21 | Three days before FTF pauses | Both | `ftf_ending` | `FtfSource.endsAt` | none; `RecapEndArbiter.tsx:67` passes `ftfEnding: false`; no server push | **M** |

Rules: "never locks Help, SOS, on-time things" = `PAYWALL_SUPPRESS_CONTEXTS` (day_of, help, sos, disruption). "One offer a day" = `PAYWALL_DAILY_CAP = 1`. "Never right after an error" = `PAYWALL_ERROR_QUIET_MS` (10 min). "Maybe later means for this trip" = `quietNoPerTrip`. "Critters never for sale" holds: no product key sells critters. All implemented; only the 9.21 trigger is missing.

**9.18 Last free redraft** (sheet)
- The underlying "Pon's draft" list (62 h r22 rows, numbered 30 r9 day-colour chips) is under scrim .32.
- Sheet opaque white, `left/right/bottom 8, r44`, padding 12 22 30, grabber.
  - Pon think 72 on `#ffe9d6`. Eyebrow "KYOTO · REDRAFT 3 OF 3" 11/800 +0.1em `#a8501a`. "Last free redraft" 26/800.
  - Three 10 h r5 segments, gap 10: two used (`#e9eaee` with a struck diagonal `#c4c6ce`), one live tangerine pulsing a 7 px ring (1600 ms).
  - Body 14/1.45 `#3d404c`.
  - InkPill "Use my last one" + outlined pink "Boost · unlimited · $2 each" (52 h) + footnote "Redrafts reset every trip."
- Taps: Use → redraft (4.17). Boost → 9.12. Swipe down → keep the draft.

**9.19 Crew map, unboosted**
- Greyscale map `#e4e7e2` (roads white, parks `#d3dbd0`) replaying **last trip's** crew: 38 avatars floating 3.6–4.8 s; your sun dot 30 with a ping (scale 1→2.6, opacity .7→0, 2000 ms).
- Header: GlassBtn44 back + a centre pill "PREVIEW · YOUR BALI TRIP" (34 h r17, white 75% blur 16, 12/700 +0.06em `#3d404c`).
- Bottom card `left/right/bottom 10, r44`, glass `rgba(255,255,255,.78)` blur 30 sat 1.8, padding 22 22 24.
  - Eyebrow "KYOTO ISN'T BOOSTED" 11/800 `#b0306b`. "The live map" 28/800.
  - Body 14/1.45 with "You opened it 41 times in Bali…".
  - A safety note in the booked tint (`#e3f6ec` / `#174a35` 12.5/600, r16): "Help and SOS share your location on any trip, boosted or not."
  - InkPill "Boost Kyoto · $2 each" + "Maybe later".
- Taps: Boost → 9.12. Maybe later → gone until the next trip (quiet no). Back → chat.

**9.20 Seat 7**
- Push "Kyoto proposal". Eyebrow "KYOTO · SEAT 7" 11.5/800 muted; "Seven's a crowd" 36/800 −0.045em.
- Seat card `top 208, h 150, r22`: six 40 avatars on an arc (ty 14/4/0/0/4/14) with seat numbers 10/700 `#9a9daa`. Sam: dashed 52 circle (2.5 px `#c4c6ce`, bg `#f5f2ff`, text `#6b5cc4`) bobbing (1800 ms), with a lilac sticker tag "Sam · seat 7" `#c9b8ff`.
- Body 15/1.45 `#3d404c`. Price card: "$12, or $1.72 each" 22/800, "Split 7 ways, Sam included", a seven-avatar stack.
- Pon GuideNote. InkPill "Boost Kyoto · $12" + "Keep it at six".
- Taps: Boost → 9.12. Keep → Sam stays waitlisted (2.18). Back.

**9.21 Free first trip ending**
- Push "Recap". A split-flap "3" tile 120×150 r20 (halves `#2a2b33`/`#1c1d24`, 2 px seam `#0b0b0d`, 110/800 −0.06em `#ffd84a`). Beside it "days left on your free first trip" 22/800 and "Oct 23 · perks pause Oct 26" 13 muted.
- Tokek GuideNote at top 290.
- "KEPT FOR GOOD" 11.5/800 +0.1em `#1f7a55`, with chips (30 h r15, booked tint text `#174a35`, 16 mint tick disc): The plan, 312 photos, The recap, 4 critters, Map trail.
- "PAUSES OCT 26" `#9a9daa`, with chips `#f1f1f4` / `#9a9daa` struck through: Unlimited Tokek, Redrafts, Live map, All icons.
- Buttons: InkPill "Boost Kyoto · $2 each"; white 52 h "Pass+ just for me" (shadow `0 1 2 ink .06, 0 4 14 ink .1`); "Stay free".
- Taps: Boost → 9.12. Pass+ → 9.10. Stay free → quiet no.

**9.22 Someone's already boosting** (glass alert)
- Over a dimmed 9.12 (opacity .5) + scrim `rgba(20,22,40,.28)` blur 6.
- Alert `left/right 30, top 250, r36`, `rgba(255,255,255,.86)` blur 30 sat 1.8, padding 26 22 20.
  - Maya 58 avatar inside a 76 ring, spinning a conic pink 30% arc (1400 ms linear) = "in progress".
  - "Maya's boosting Kyoto" 22/800. Body 14 `#3d404c` ("you can boost in 13 minutes" = the lock expiry). "Nothing has been charged." 12.5/600 `#1f7a55`.
  - InkPill 50 h "Tell me when it's done" + "Message Maya".
- Taps: Tell me → back to the plan + a push when the boost confirms. Message Maya → DM/chat. Close.

**9.23 Cancel · pause till Kyoto**
- Push "Your plan". "Before you go" 34/800; body 14 muted.
- Pause card `top 236`, `#fff6c9`, r26, padding 18. Eyebrow "BETWEEN TRIPS?" 11/800 `#8a6a0c`. "Pause until Kyoto instead" 21/800 `#3d3210`. Body 13 `#5d4a14`.
  - Month bars N D J F M A: paused months 26 h hatched `rgba(138,106,12,.18)` with an inset 1.5 ring; active months 44 h ink; plane 32 over April.
  - Already exists as `ui/monetize/PauseBars.tsx`.
- "If you cancel, you'd lose" list: rows 46 h with an 18×2.5 `#d6337f` dash.
- Buttons: InkPill "Pause till Kyoto", white "Keep Pass+", "Cancel anyway" 15/600 `#d6337f`.
- Taps: Pause → 9.17. Keep → 9.17. Cancel anyway → the system subscription sheet.

**9.24 Card declined · seven days' grace**
- Back-label header "Your plan". Card art 300×186 r20, gradient `#2a2b33→#1c1d24`, rotated −5°, gold chip, mono "•••• 4412" 18 +0.14em, "WINSTON" / struck "EXP 10/27". A pink "Expired" sticker (14/800, rotated 10°).
- "The card didn't go through" 28/700; body 14 muted.
- Facts card: "Pass+ stays on until **Nov 9**"; "Kyoto boost" "Paid, not affected" 13/600 `#1f7a55`.
- Tokek GuideNote "Nothing gets locked mid-trip. Promise."
- InkPill "Update card" + "Try again".
- Taps: Update → store payment settings. Try again → re-checks entitlement. Back → 9.17.

## 4. Components

**(a) Foundations components used**: Root large-title header; push inline header with GlassBtn; sheet with grabber (Regular glass sheet .86/blur 34/r46); alert (two choices, destructive pink); full-screen ✕ (3.19, 9.10); InkPill primary + text button; small ink pills (Pay, Resend, Settle up, Nudge); icon buttons; segmented control; toggle; checkbox/radio; field focused state with counter; progress bar; stickers, tags, stamps; critter tiers (◆ Rare); cards and rows; guide note; stat tile (9.01 stats); crew stack; "2 of 4"-style progress (3.05); composer (9.16); `Tabs.dc.html` tab pill.

**(b) New components this part needs**

| component | metrics / states | variants | reused by |
|---|---|---|---|
| `HomeHero` | step card (300 h r32 + washes), collage card (256 h r30, polaroids, overflow sticker), sync card, photo hero (420 h + fade) | no trip / planning / on-trip (not drawn here) / syncing / back | 6 (on-trip home), 2 (first home) |
| `CountdownPill` | 32 h r16 ink, 14/600 tabular, mint dot; ticks 1 s | live / "Today" | 6, 4 |
| `PlanRing` | 20 conic ring, 12 hole, 32 h pill | 0–100% | 4.25 |
| `PolaroidPhoto` | white padding 5, r14, rotation, shadow `0 2 4 ink .1, 0 14 28 ink .18` | 40–124 sizes | 8 (album), 3.17 (inbox thumb) |
| `LiveTripCard` | 312 h r34 photo, Clear-glass chip + panel 96 h, day ticks, 48 white chevron | live / upcoming | 1.05 zoom source; 6.01 |
| `TripMiniCard` | 142 h r26, 96 disc + critter 74, 5 px progress | planning / voting / solo | 4 |
| `CrewSwitcherMenu` | 290 w r24 popover, rows 12/14 padding, badge | current ✓ / unread / invited | 2 (after join) |
| `CrewPass` | 230×226 book, spine, inner frame, crest 92, seats row; idle bob; flip to back | cover × 6 (ink flips on light covers), sticker × 6, front/back | 2 (invite pass), 3.12 (crest 78), 9 |
| `StickerPicker` / `CoverPicker` | 52×56 cells; book swatches 40×52 with the lifted selection | locked (navy reward) | 9.02 avatar? 8 |
| `CrewTicket` | 334 w r28, stub 150, perforation + notches, split-flap tiles 58 h | copyable | 2.15/2.16 code entry (tiles) |
| `SplitFlapDigit` | halves `#2a2b34`/`#1c1d24`, 1 px seam | 28/800 (code), 110/800 (9.21) | 6 (countdowns) |
| `ShareTargetRow` | 60 circles or 58 r16 tiles + labels | 4 or 5 targets | 8 (recap share), 7 |
| `MemberSheet` | 76 avatar, 3 action tiles 92 h, rows | organiser / member viewing | 4.51, 5 |
| `GlassAlert` | glass `rgba(250,250,252,.8)` blur 40, r36, inset 30; hero avatar/sticker; consequence lines; 52 h buttons | destructive / neutral / progress (9.22) | every destructive confirm (9.08 is the opaque variant: unify) |
| `RadioRow` | 56 h, 22 radio (ink dot / `#c4c6ce`), quiet .55 | — | 4 (polls), 9.12 options |
| `InboxActionCard` | r22 padding 14; thumb (polaroid / guide / dashed); 1–2 answer buttons 38 h | vote / approve / nudge | 5, 6 (notifications mirror) |
| `ExampleGhostCard` | 72 h r22 ring only, stepped opacity and scale, "EXAMPLE" | — | other first-run empties |
| `RecoveryScreen` / `ErrorSheet` | not-found full screen; error sheet r46 over a blurred page with 2 tiles + InkPill | — | every route error |
| `PassportCard` | paper + pattern, avatar ring, tags, stats, MRZ | profile (9.01) / data page (9.02, tilted −1.2°) / visa (9.10) | 2 (issued pass), 8 |
| `StampMark` | triple-ring stamp (`inset 2.5/5/6`), circle or rect, rotation; ink colours | joined / arrived / boosted / admitted / first-trip-free | 3.11, 8 (stamps), 6 |
| `StampSlam` | the timeline in §5 | 2.3× / 2× / 2.2× start scales | 1.07, 8 (critter caught), 2 |
| `HoldToConfirm` | 148 ring, conic fill, inner 128 disc, "KEEP HOLDING" | idle / holding / done / released | 3.16? (not used), any irreversible action |
| `StorageMeter` | ink card, 44/800 number, stacked bar 10 h | — | 6 offline |
| `GoldButton` | §3 Gold CTA + shine | full / half width | 9 only |
| `PerkChip` | 30–34 h white chip + colour dot or tick disc; struck "paused" variant | on / paused | 9.12, 9.14, 9.21 |
| `PlanCard` (night) | 180 h r28 night radial + stamp icon + shine | Pass+ / paused / grace | 9.04 chip, 9.23 |
| `BoostChatCard` | dashed pink strip, mini stamp, chips, 2 buttons | buyer / member (Settle) / settled | 5 |
| `SeatArc` | 40 avatars on an arc + dashed newcomer bobbing | 6–16 seats | 2.16, 4.51 |

## 5. Motion and transition inventory

| trigger | what moves | properties | spring / easing + duration | evidence | native or custom |
|---|---|---|---|---|---|
| Live trip card tap (3.05, 3.02) | card → trip hub 6.01 | clip-path `inset(164 16 368 16 round 34)` → `inset(0 round 56)`; list `ty −120, scale 1.04` (stepping back); card label fades out (360 ms at .26–.32); hub content `ty 24→0`, opacity 0→1 | 1200 ms `cubic-bezier(.32,.72,0,1)` in the design; Foundations name: Smooth | Foundations `code="1.05"` tg-kf | The engine already exists: `ui/transitions/use-shared-source.ts` (`zoomTo`, `useSharedSource`), `ui/transitions/SharedGrow.tsx`, host mounted at `app/_layout.tsx:297`, with a dev spike comparing teleport / shared-element / apple-zoom (`app/(dev)/spikes/grow-into-page*.tsx`). But `features/home/next-up-card.tsx:136` calls `zoomTo` without registering the card as a source (it falls back to a plain push), and the trips list never uses it. Wire both cards as sources; the iOS 26 native zoom is an option for the page itself |
| Pull-up scroll (3.01–3.06, 9.04) | large title → inline bar | title 34→17, opacity; bar material appears | scroll-linked | Foundations "title collapses" | Reuse `ui/shell/LargeTitle.tsx` (`useLargeTitleCollapse`, already used on 8 screens). Home, Trips, Inbox and Crew settings do not use it yet. Native `headerLargeTitle` would lose the glass buttons |
| Tab bar (all roots) | glass pill, active ink pill | Snappy lens between tabs | Snappy | `Tabs.dc.html` | Today `ui/shell/ShellTabs.tsx` + `ui/shell/TabBar.tsx` + `GuideFab.tsx` is a full-width solid JS bar that does not minimise. The glass pill is a rebuild (Foundations lane owns the choice of pill versus native 1.04) |
| Photo hero scroll (3.04) | header ink white→ink; Clear→Regular glass | colour + material cross-fade | scroll-linked | 3.04 HTML | custom |
| Title tap (3.07) | menu from the anchor; chevron flips | scale .9→1 + opacity, rotate 180° | Snappy | 3.07 | custom popover |
| Crew switch (3.07 → Home) | title text | cross-slide | Snappy | text "title animates" | custom |
| Sticker pick (3.08/3.13) | crest on the pass | scale 1.25→1, rotate ±8° | Lively | text "with a slap" | Reanimated |
| Cover pick | pass colour, ink colour, selected swatch lift `ty −8 r −4°` | colour + transform | Smooth (colour), Snappy (swatch) | 3.08 | Reanimated |
| Pass idle | crew pass | `r −4→−3, ty 0→−5` | 4800 ms loop, sine | `tg-motion kf` | Reanimated loop (stop under Reduce Motion) |
| Pass tap (3.13) | flip to back | rotateY 0→180 | Smooth | text only | Reanimated |
| Ticket arrives (3.09) | ticket | `ty 30, o 0 → ty 0, r −2°` | 840 ms back-overshoot = Lively | `tg-motion kf … e=back` | Reanimated + confetti |
| Confetti (3.09, 9.14, 9.15) | 40–48 pieces | burst | ~1.5 s | `tg-confetti` | Reanimated/Skia (reuse the existing confetti if `motion/**` has one) |
| Glass alert in (3.15) | alert | scale 1.08→1, opacity 0→1; backdrop blur 0→8 | 360 ms ease-out (Smooth) | 3.15 kf | custom (native `Alert` cannot carry the avatar/lines) |
| Sheet up (3.10, 3.14, 3.20, 9.18) | sheet | ty 100%→0 | Smooth | Foundations | native form sheet with detents (iOS 26 glass sheet) or the existing `ui/sheet` |
| Inbox answer (3.17) | card | collapse height + fade; badge count | Smooth | text | Reanimated layout animation |
| Empty-passport idle (3.06) | passport, gecko hop | `ty 0→−6`; hop | 5200 ms; hop preset | kf | Reanimated |
| Not-found gecko (3.19) | float | `ty 0→−9, r −2↔2` | ~4 s loop | `fx=float` | Reanimated |
| Skeleton (3.03, 3.20) | shimmer | gradient sweep | ~1.2 s loop | gradient stops | existing skeleton |
| Shake card (9.06) | phone glyph | rotate 0/−10/10/−8/6/0 | 960 ms every 3200 ms, origin 50% 80% | kf | Reanimated |
| Vote spend (9.07) | vote block | bg ink, count +1 | Snappy | text | Reanimated |
| Hold (9.09) | ring fill; release springs back | conic progress 0→100% | linear while held (3 s); Smooth back | 9.09 | existing `HoldRing` + `hold-fill` |
| Paywall in (9.10) | page steps back, visa drops, FTF stamp | stamp: 540 ms fall + 360 ms settle | Smooth + Lively | `tg-kf` 9.10 | Reanimated |
| Shine sweep (9.10, 9.11, 9.15, 9.17) | white band | translateX −120→440, skew −20° | 1050–1400 ms per 4.2–5.6 s | `tg-kf` | Reanimated (ambient; stop under Reduce Motion) |
| Holo ring (9.10/9.15) | conic ring | rotate 360° | 10 s linear | `fx=spin` | Reanimated |
| BOOSTED slam (9.14) | stamp, ink ring, confetti, critter, chips | see §3 9.14 | 600 ms ease-in fall, 480 ms overshoot settle; ring 810 ms; chips 360 ms each, 240 ms stagger | `tg-kf` 9.14 | Reanimated timeline; haptic on squash |
| Admitted (9.15) | visa drop, stamp, gecko, ticks | visa 720 ms; stamp 540+360 ms; ticks 360 ms stagger | Lively-like | `tg-kf` 9.15 | Reanimated |
| Who-pays switch (9.12) | avatar fan | ty/rotate per seat | Snappy stagger | 9.12 | Reanimated |
| Last-redraft pulse (9.18) | live segment | ring 0→7 px, fades | 1600 ms loop | `tg-kf` | Reanimated |
| Map preview (9.19) | avatars float; you-ping | ty; scale 1→2.6, o .7→0 | 3.6–4.8 s; 2000 ms | `fx=float`, `tg-kf` | Reanimated over the map |
| Seat 7 newcomer (9.20) | dashed avatar | bob 0→−6 | 1800 ms | `fx=bob` | Reanimated |
| Boost in progress (9.22) | conic arc | rotate | 1400 ms linear | `fx=spin` | Reanimated |
| Reduce Motion | all of the above | 150 ms cross-fade; stamps land without falling; ambient loops off | — | Foundations | `useReducedMotion` |

Filmstrips: not rendered. Another lane's headless Chromium was running throughout, and the one-Chromium rule applies. Every timing above is read straight from the `tg-kf` / `tg-motion` attributes in the HTML, which is the exact source a filmstrip would sample.

## 6. Native platform surfaces

- **Notifications (3.17/3.18)**:
  - The inbox mirrors actionable pushes (vote, approve/keep, nudge). 3.18's "Allow notifications" triggers the OS prompt.
  - Category actions already exist for supplier approval, plan review and safety (`features/*/notification-actions.tsx`). `targets/notification-content` and `targets/notification-service` exist on iOS.
  - New: a vote category ("Nusa Penida / Gili T") and a "Move dinner? Approve / Keep" category, so pushes answer like the cards. The visual restyle of the notification content extension belongs to Part 6/10.
- **Share sheets (3.09, 3.10, 3.11)**: the system share sheet with invite text + link. 3.10's app row implies direct targets (WhatsApp, Messages, Telegram, Mail). On iOS, use `UIActivityViewController`. Deep links to specific apps are optional (`whatsapp://send?text=`, `sms:`, `tg://msg?text=`).
- **App icon (9.03)**:
  - `modules/cp-app-icon` already switches icons.
  - New: the iOS 26 **Clear** appearance (icon assets with a clear/tinted layer) and an "Auto" label. iOS shows its own "You have changed the icon" alert, which the design accepts ("with the system prompt").
  - Android: activity-alias icons; no Clear/Tinted (themed icons only).
- **StoreKit / Play billing (9.10–9.13, 9.17, 9.23, 9.24)**:
  - The purchase sheet is system-owned. The design's 9.13 Apple Pay-style sheet with a "Split" row cannot be produced for in-app purchases: keep the split explanation on 9.12 and 9.14.
  - Restore, offer-code redemption (`presentCodeRedemptionSheet` on iOS), "Manage subscription" (`showManageSubscriptions`) and "Cancel anyway" (system subscription sheet) are system surfaces.
  - The App Store exposes no card number. 9.17's "•••• 4412" and 9.24's card art cannot show real digits; today's copy says "App Store" / "Google Play".
- **Shake to report (9.06)**: `features/help/shake/ShakeListener` is mounted in `app/_layout.tsx`. No change beyond the restyle.
- **System alerts**: 3.15, 9.08 and 9.22 are custom glass alerts, not `Alert.alert`, because they carry an avatar, consequence lines and an Undo toast. The system alert remains for the OS permission prompts only.
- **Live Activities / widgets**: Part 9 only references them as perks ("Crew on the lock screen", 6.30). No changes in these parts.

## 7. Logic and backend gaps

Only what the design shows that `$R` lacks. Each gap has its evidence.

1. **FTF-ending moment (9.21)**: no screen, no trigger.
   - The entry point `ftf_ending` exists (`packages/domain/src/paywall/entries.ts:20`) and the arbiter supports it (`packages/domain/src/help/rating-arbiter.ts:88`).
   - But the app passes `ftfEnding: false` (`apps/mobile/src/features/help/rating/RecapEndArbiter.tsx:67`), and no service sends the "three days before" push (no `ftf_ending` match under `services/*/src`).
   - Needed: a worker job keyed on `FtfSource.endsAt − 3 d` (push + recap card), plus the client screen.
2. **Pause on a yearly plan (9.23)**: `features/monetize/plan/plan-model.ts:41` says "Pausing is offered for a renewing monthly plan only: a year is already paid", but the design pauses a yearly plan. See §8: this is product, not code.
3. **Redeem a code row (9.17)**: missing from `plan-view.tsx` (its rows are Change plan, Payment method, Restore). `code_grant` exists in entitlements; the client needs the StoreKit offer-code sheet and/or our gift-code entry (`ui/documents/GiftCard.tsx` hints at gift redemption).
4. **"Tell me when it's done" (9.22)**: the boost lock is modelled (`boost-model.ts` phase `locked`, `BoostLock.expiresAt`), but there is no subscribe-to-completion. Needed: a push to the waiting member when the lock holder's boost confirms. The server already knows (boost lifecycle in `services/api/src/billing/boost-lifecycle.ts`).
5. **Live-map gate replay and count (9.19)**: "last trip's map, still moving" + "You opened it 41 times in Bali" need the last boosted trip's anonymised position replay (or a canned replay) and a per-user open counter. Neither exists in `features/crew/live-map/states/gate-card.tsx`. Cheapest: animate the crew avatars on a static map of the last trip's area and drop the count if no counter exists.
6. **Appearance setting (9.02)**: there is no app-level light/dark theme. `app.config.ts:171` is `userInterfaceStyle: 'automatic'`, but tokens have no dark ground/card set and nothing reads `useColorScheme`. A device-local preference (Follows the phone / Light / Dark) plus the Foundations 1.E dark token set is a Foundations-lane dependency. No backend.
7. **Offline storage meter (9.05)**: `features/trip/bundle/storage-settings.tsx` has saved trips, "Save trip days by themselves" and remove. The design adds total MB, free disk ("3.1 GB free"), a per-category stacked bar, recap media as an item, and "Only on Wi-Fi". All client-only (file sizes, `getFreeDiskStorageAsync`, NetInfo type check in `background-prefetch.ts`).
8. **Crew cover colour (3.08/3.13/3.12)**: crews have only `art` (sticker); there is no cover field anywhere (`services/api/src/commands/crews/`, `update_crew` takes name + art). Needed: a `cover` column + a schema change on create/update + the synced-schema regeneration.
9. **Transfer organiser (3.14 "Make organiser", 3.16 handover)**: no command in client or server. Today a solo-organised trip passes to the longest-standing member automatically. Needed: `transfer_organiser(crew_id, to_member_id, leave: bool)` with permission tests.
10. **Undo remove (3.15)**: `REMOVE_MEMBER` is immediate. A 10 s Undo needs a delayed commit or an `undo_remove_member` within a window. `motion/island-toast` already supports one action button.
11. **Resend invite, optionally at 21:00 (3.10)**: no resend command and no scheduling. Needed: `resend_invite(invite_id, at?)` on the worker queue. "Hasn't opened his invite · opens things at night" also needs per-invitee open tracking and a usual-active-hour hint (drop the "opens things at night" clause if that signal does not exist).
12. **Code validity is 7 days in the design but 14 days on the server** (`rotate-join-code`). Product picks one (§8).
13. **First-sync progress (3.03)**: no byte-progress source feeds Home. The PowerSync first-sync percentage plus the bundle prefetch sizes (`features/trip/bundle/*`) can drive it client-side; no backend change.
14. **Home post-trip rows (3.04)**: "You owe Maya $41 / settle before the recap locks on Nov 5" needs the recap-lock date. The other data exists in money, recap and drivers. Driver rating (`app/(trip)/[tripId]/drivers/ours/rate/[providerId].tsx`) just needs linking.
15. **Inbox first-time state (3.18)** and **not-found / error extras** (Search trips, "Tell us this link is broken", "Send a report with this screen"): client only. The report can reuse the shake-report pipeline (`features/help/shake/*`).

## 8. Open questions

1. **Home header has two versions.**
   - 3.01/3.03/3.04 show "Bali Six" 34/700 + glass bell + ink `+`.
   - 3.02/3.07 show "Hey Winston" + "The Bali Six" 28/700 with white chat + bell buttons (badged) and no `+`.
   - Foundations: Root = large title, ≤ 2 glass actions, `+` is the dark one. Recommend the 3.01 header everywhere. Open questions: where chat lives on Home, and whether the bell badge carries the inbox count.
2. **Inbox screen type.** 3.17 is drawn as a root with the tab bar and "Mark all read"; 3.18 is a push with back + gear. Inbox is not a tab (`app/inbox/index.tsx`). Recommend a push from the Home bell with the tab bar hidden. Then where does "Mark all read" go (the single right action, with the gear moved into ⋯)?
3. **Pass tab content.** Foundations says Pass is a root large-title tab. 9.01 draws the profile as a push (back, Edit, gear, no tab bar). Today `app/(tabs)/pass.tsx` renders the **Critterdex**. Does the Pass tab become the passport profile (with the Critterdex moving to Part 8), or does 9.01 stay a push from Home? This needs a cross-part decision with the Part 8 lane.
4. **Form screens drawn with ✕ + bottom CTA.** 3.08 New crew and 9.12 Boost are drawn this way. Foundations says forms are sheets with Cancel left and the bold verb right. 3.13 Edit crew is a push with Save. Pick one pattern for create/edit forms.
5. **Destructive styling is inconsistent.**
   - Text: `#d93a62` (3.12/3.14/3.15) vs token `#d6337f` (9.17/9.23).
   - Button tint: `rgba(255,59,92,.12)` (3.15) vs `#ffe4f0/#b0306b` (9.08).
   - Alert material: glass .8 (3.15), opaque white (9.08), glass .86 (9.22).
   - Recommend token `#d6337f`, the tint `#ffe4f0`, and one glass alert.
6. **Glass button spec drift.** GlassBtn is 44 visual at `rgba(255,255,255,.62)` blur 18 sat 1.8. Foundations has a 40 pt icon / 44 hit and Regular glass `.56` / blur 24 / sat 1.9. The inline tab bars in 3.02/3.17 use `.64`. Normalise to the Foundations values?
7. **Back-title headers.** 9.09 and 9.24 put a muted "Settings" / "Your plan" label beside the chevron. Every other push centres the title. Keep the iOS back-title style only there, or centre the titles?
8. **Pause a yearly plan (9.23).** The design pauses yearly Pass+ ("No charges from now until Mar 2"), but a yearly plan is already paid through Nov 2, 2027, and the current logic offers pause only on monthly. Founder: is pause yearly-capable (pause the next renewal), or should 9.23 show the monthly case?
9. **Card details (9.17/9.24).** Stores expose no card digits or expiry. Accept "App Store" / "Google Play" instead of "•••• 4412 / EXP 10/27"? The card art in 9.24 would become a generic store card.
10. **9.13 checkout.** In-app purchases cannot show the Apple Pay sheet or a custom "Split" row. Confirm that the StoreKit sheet is acceptable and the split stays on 9.12/9.14.
11. **Cover palette.** The 3.08 drawing shows a sun cover; the `Src10.covers` data has navy `#1f2a52` in that slot. 3.11 makes navy a referral reward. Is navy earned (locked in the picker) and sun free?
12. **Guide voice size.** 9.06 uses Borel 12.5; the Guide token is Borel 15. 9.14 uses Borel 15. Use 15 throughout?
13. **Toggle green.** `#34c77b` (iOS green) vs the Foundations mint `#54d6a4`. Native `Switch` tint, or mint?
14. **3.12 notifications values** ("Everything · Mentions · Nothing" per crew) vs 9.04 Settings "Crew chat: Mentions only" (global). Which wins: is the global setting a default that each crew overrides?
15. **3.10 resend at 21:00.** "Re-sends now, or at 21:00 if you hold it": the long-press gesture is not discoverable. Show a hint, or use a menu?
16. **Invite code validity.** The design says 7 days (3.10, 3.12); the server mints 14 days. Which is it?
17. **Crew switcher presentation.** The design is a popover under the title (3.07); today it is a modal sheet (`CrewsSheet.tsx`) that also handles pending invites (Join / Later). Do pending invites fit in the popover rows ("Ramen club · Dev invited you" suggests yes), and does the sheet go away?
18. **Trips tab with one trip.** Today a single trip makes the Trips tab that trip's hub directly. The design always shows the list (3.05) or the empty passport (3.06). Confirm the list is always shown.
