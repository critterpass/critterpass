# Design spec: Part 5 "Chat and Guide" and Part 8 "Critters and Memories"

Lane: design analysis, 10 Oct 2026. Inputs: `$Z/CritterPass 05 Chat and Guide.dc.html`, `$Z/CritterPass 08 Critters and Memories.dc.html`, `$Z/doodles.js`, `$Z/critters-*.js`, `$Z/ref/chat-parts.js` (the same card markup as the 5.D board), text extracts, shots `$SP/shots/05|08/`, filmstrips under `$SP/film/05-lane/` and `$SP/film/08-lane/`. Current app `$R` = `/Users/quocs/Projects/critterpass-worktrees/deploy`. Token names follow `plans/261010-1701-premium-redesign/foundations-spec.md` (type: `navTitle`, `largeTitle`, `emptyTitle`, `display`…; shadows: `card`, `raised`, `float`, `sticker`, `ink`, `segment.thumb`; materials: Clear / Regular / Sheet glass, Ink).

**Numbering note.** Four inline Part 5 frames print stale labels; their `data-screen-label` gives the real codes, used throughout: **5.14** guide plan card (prints 5.09, shot `5.09-13.png`), **5.15** voice (5.10, `5.10-14.png`), **5.16** point and ask (5.11, `5.11-15.png`), **5.24** getting around (5.19, `5.19-23.png`).

## 1. Summary

**39 phones**: 24 in Part 5 (5.01–5.24), plus the 5.D board of every chat card (12 message types + sticker, 27 card states), and 15 in Part 8 (8.01–8.15).

**What is new compared with the current app.** Most of the logic exists; the redesign mostly changes the look, plus these new pieces:
- **Critter stickers as chat messages** and the sticker tray (5.08). The board itself says "Not in MESSAGE_TYPES yet: needs adding".
- **Critter and doodle reactions**, replacing the emoji quick set 👍❤️😂😮🔥🙏.
- "Read by N", "Pin to the trip" / "Add to Day N", "Ask to rejoin" / "Remove chat", and starter prompts in an empty crew chat.
- Cards for `meetup` and `supplier_order` (both kinds fall back to the unknown card today), a "settled" strip, and a counted "3 New messages ↓" pill.
- In the guide: a working-steps card with Ping me / Stop, "Ask it differently", an offline-tools card, editing a queued question, and a quota chip that counts down ("27 left").
- Part 8 is a restyle of existing screens. The only data and token changes are the epic Tokek palette and lighter locked silhouettes (§4c).

**Hardest to build well**
1. The chat keyboard/tray system. The sticker tray swaps with the keyboard at keyboard height, the composer rides on top, the list stays pinned to the bottom, the header stays put, and dismissal is interactive.
2. Stickers end to end: the new message kind and its sync, critter reactions in the database, the tray built from the Critterdex with locked silhouettes, the lift on long-press, and a "sticker lands" motion that the design leaves unspecified.
3. Long-press on a message: a blurred, dimmed backdrop, the bubble lifted to 1.03, a custom reaction bar and a glass menu. This is a custom Reanimated overlay, not a native `UIContextMenu`.
4. The guide's working state (5.18). It needs labelled tool steps streamed from the server; today there is only a filler line.
5. The celebration scenes (8.03–8.05): Skia stickers at 170–220 pt with hop, ping, spinning rays, confetti and the "BEFRIENDED!" stamp on the Lively spring, plus hold-to-befriend.

## 2. Screen table

Routes are relative to `$R/apps/mobile/src/app/`.

| code | title | screen type | header left / right | primary action | current route file(s) | logic |
|---|---|---|---|---|---|---|
| 5.01 | Crew chat | Push | glass back 44 / glass "Map" pill 44 | Send | `crew/[crewId]/chat/index.tsx` | partial (no sticker, critter reactions or read receipts) |
| 5.02 | Brand new chat | Push | back / glass pin 44 | Starter prompt | same | partial (no starter prompts) |
| 5.03 | Offline, queue, bounced | Push | back / pin; NO SIGNAL chip under the title | Retry | same | exists ("too big for this signal" reason is new) |
| 5.04 | Long-press, react, act | Overlay on Push | n/a (blurred) | React | same | partial (no Pin / Add to day; different reaction set) |
| 5.05 | Mic is off | Sheet (glass, ✕ right) | — / ✕ | Open Settings | same (voice recorder) | exists, as a card |
| 5.06 | You left, read-only | Push | back / pin | Ask to rejoin | same | partial (no rejoin / remove) |
| 5.07 | Group offer claim | Sheet over Push | back / — | Count me in | same + guide offer | partial (inline confirm, no sheet, no slot row) |
| 5.08 | Sticker tray | Push + input tray | back / Map | Tap a sticker to send | same | missing |
| 5.09 | Sticker long-press | Overlay on Push | n/a (blurred) | React with a critter | same | missing |
| 5.10 | Plan cards (changeset, meetup) | Push | back / Map | Yes, swap | same | partial (meetup card missing) |
| 5.11 | Photo, voice, ride, boost | Push | back / Map | Message Made | same | partial (supplier_order card missing) |
| 5.12 | Housekeeping | Push | back / Map | New messages ↓ | same | partial (settled is not a kind; the pill has no count) |
| 5.13 | Guide empty | Modal, Push-styled | glass back 44 / "27 left" chip | Starter card | `(modal)/guide/[threadId].tsx` | partial (chip copy) |
| 5.14 | Guide plan card | Modal | ✕ 44 / Group·Me segment | Propose to group | same | exists |
| 5.15 | Voice | Full screen | ✕ / "CC" 44 | Send to the group | `(modal)/guide/voice.tsx` | exists |
| 5.16 | Point and ask | Full screen (camera) | ✕ clear 40 / — | Order for 6 | `(modal)/guide/camera.tsx` | exists |
| 5.17 | Guide offline + failed turn | Modal | back / NO SIGNAL chip | Try again | `(modal)/guide/[threadId].tsx` | partial (no "Ask it differently", no offline tools card) |
| 5.18 | Slow answer working | Modal | back / "26 left" | Ping me | same | missing (step list, Ping me) |
| 5.19 | Out of questions (Pon) | Modal | ✕ + Pon identity / — | Get Pass+ | same (`meter/limit-card.tsx`) | exists |
| 5.20 | Queued for midnight | Modal | ✕ + "Tokek" / "30 of 30 today" | Ask now | same (`queued/`) | partial (no edit before midnight) |
| 5.21 | Dietary consent | Modal | ✕ / caption | Share flags | `(modal)/guide/dietary.tsx` | exists |
| 5.22 | Dietary form | Modal | ✕ / "Sharing flags" chip | Save | same | exists |
| 5.23 | Phrase show mode | Full screen | language chip / ✕ (right) | Play it out loud | `(modal)/guide/phrase.tsx` | partial (no brightness) |
| 5.24 | Getting around | Push over map + sheet | back / route pill | Book | `(trip)/getting-around.tsx` | exists (copy differs) |
| 8.01 | Critterdex | Root (Pass tab) | — / — | Here-now card | `(tabs)/pass.tsx` → `features/critters/dex/pass-screen.tsx` | exists |
| 8.02 | Critter detail | Push over photo | clear back 40 / clear share 40 | Make it my guide | `critters/[critterId].tsx` | exists |
| 8.03 | Encounter | Full screen | ✕ clear 40 / — | Hold to befriend | `(trip)/encounter/[id].tsx` | exists |
| 8.04 | Befriended | Full-screen celebration | none | Add to your pass | same (result view) | exists ("Share" only opens the chat) |
| 8.05 | Egg hatch | Full-screen celebration | none | Say hi | `(modal)/hatch/[tripId].tsx` | exists |
| 8.06 | It wandered off | Full screen | chip / ✕ (right) | Remind me at 07:00 | `(trip)/encounter/[id].tsx` | exists |
| 8.07 | Crew quests | Root-styled (tab bar, no back) | — / — | A quest | `(trip)/quests/[tripId].tsx` | exists |
| 8.08 | Legendary calendar | Push | back / ink "Remind me" | Remind me | `critters/legendaries.tsx` | exists |
| 8.09 | Recap | none shown | — / — | Share recap | `(trip)/recap/[tripId]/index.tsx` | exists |
| 8.10 | Story: route | Full-screen story | none shown | Tap for next | `(trip)/recap/[tripId]/story.tsx` | exists |
| 8.11 | Story: money | Full-screen story | none shown | Tap for next | same | exists |
| 8.12 | Trip journal | Root-styled (Trips tab) | — / glass search + ink `+` | A day pocket | `(trip)/album/[tripId]/index.tsx` | exists |
| 8.13 | Story: cover | Full-screen story | presenter / ✕ 36 | Tap to start | `(trip)/recap/[tripId]/story.tsx` | exists |
| 8.14 | Postcard | Story's last card | — / ✕ 36 | Send to the crew | `(trip)/recap/[tripId]/postcard.tsx` | exists |
| 8.15 | A year later | Full screen (dark photo) | chip / ✕ (right) | Plan a reunion | `memory/[memoryId].tsx` | exists |

**Tab bar.** Part 5 shows none: the chat is a Push and the guide is a modal. Part 8 uses the `Tabs.dc.html` rendering on 8.01 (Pass active), 8.07 (imported, Pass active) and 8.12 (Trips active): a glass pill, Tokek raised 56 in the middle, the active tab as an ink pill with its label. Phone 1.04's native bar does not appear in these parts.

## 3. Per-screen spec

### Shared chat anatomy (5.01–5.12)

The design draws two chat chromes. The 5.01 family (5.01 and 5.08–5.12) is the hero; build that one (§8 Q1).

**Header, 5.01 family**
- Gradient fade, 112 high, `linear-gradient(180deg, #f5f5f7 62%, transparent)`, no blur. Controls row at top 56, inset 16.
- Left: glass back circle 44 in the Regular glass nav variant (`.62`, blur 18, sat 1.8, top inset white .95, .5 white ring .6, .5 ink ring .07, `0 8 20 −6 .16`), chevron 18.
- Centre: title 16.5/700 with an 11.5 muted subtitle ("6 people · Tokek's in here", or "6 people · Rin is typing"). **OFF-TOKEN**: `navTitle` is 19/700 + 12.
- Right: glass pill 44 high, padding 0 14, 14/600, pin icon 14, label "Map".

**Header, 5.02 family (5.02–5.06)**
- Blur bar, 112 high, `rgba(245,245,247,.78)`, blur 24, sat 1.8, .5 bottom hairline `rgba(28,29,36,.08)`. Controls row at top 58, inset 20.
- Title 17/600 with a 12 subtitle (**OFF-TOKEN**). Right: glass circle 44 with a pin icon, no label.

**List.** Absolute from top 118 to the composer top − 8. Insets 14 (5.01) or 16 (5.03). Content is justified to the end, so the newest message sits at the bottom. Item gap is 10 (5.01) or 12 (5.03). No date headers are drawn in the crew chat; the guide uses "Today 14:02" 12 muted, centred.

**Their bubble**
- White, radius 20 20 20 **6**, padding 9 13, `body` 15 with line-height 1.38, ring `0 0 0 .5 rgba(20,22,40,.05)`.
- Avatar 28 in the crew colour, 2 px ground-colour border, initial 11/700 `#17142a`, bottom-aligned, gap 8.
- Sender name 11.5/600 muted, padding-left 36, 3 px above the bubble. Group max width 300.
- The 5.03 family has no avatar: name padding 0 12, bubble max width 258, padding 9 14.

**Your bubble**
- Ink `#1c1d24`, white text, radius 20 20 **6** 20, max width 270 (258 in the 5.03 family).
- Status line 4 below, right-aligned, 11/600 `#9a9daa` ("Read by 4").
- Reply quote inside: 3 px left bar in the quoted person's crew colour, padding 2 0 2 8, margin-bottom 6, 12.5 `rgba(255,255,255,.72)`, name bold in the crew colour.
- `@tokek` renders in `#ffd84a` at weight 600.

**Grouping.** The name and avatar show once per run, and the 6 tail corner sits on the last bubble of the run. The design only shows runs of one, so keep the current rule (`features/crew/chat/components/timeline-rows.ts`): a new run starts on a day change, a system row, or after 5 minutes.

**Tokek in the crew chat (guide_offer and guide text)**
- Avatar: 28 `#fff3c4` circle with a gecko 28 aligned to the bottom (a cropped bust).
- Bubble: 282 wide, radius 22, Tokek tint `#fff6c9`, padding 12 14.
- Name "Tokek" in Borel 12 `#8a6a0c`; body 14.5/1.4 `#3d3210`; actions row margin-top 10, gap 8.

**Reactions.** Chips sit under the bubble or sticker: gap 4, margin-top −2. Each chip is 24 high, padding 0 7 0 3, radius 12, white, `#3d404c` 11.5/700, .5 ring at .08. The critter sits in a 20 box (bottom-aligned, cropped), then the count after 3 px.

**Sticker message (new)**
- No bubble. Sticker at size 112 (5.01) or 96 (5.09 and the board), with the white edge, rotated −6° or +5°.
- Caption tag centred at bottom 4 and counter-rotated by about −1.6× the sticker angle (9.6° for −6°, −8° for +5°).
- Tag style: ink, white 800 12/1, padding 5 9, radius 9, 2.5 white border, shadow `0 4 10 rgba(20,22,40,.25)`.
- Captions per pose: "YES PLS" (cheer), "NOOO" (sleep); in the tray: "hi!", "yes pls", "hmm", "omw", "zzz" (§8 Q6).

**Delivery states (5.03)**

| State | Bubble | Status line |
|---|---|---|
| Sent | normal | "Sent 4:10" 11.5/600 `#1f7a55` with a 12 check |
| Waiting | whole row at .55 opacity | clock 12, "Waiting for signal" muted; media adds " · 2.4 MB" |
| Failed | white with a 1.5 `#ff5fa8` ring, ink text | `#b0306b` "Didn't send · too big for this signal" |

For a failed send, right-aligned below: "Retry" (ink pill 32 high, padding 0 13, radius 16, 13.5/600, retry icon 13) and "Delete" (control fill `rgba(118,118,128,.12)`). The text is kept.

**System rows**
- Pill: centred, padding 4 10 4 4, radius 14, `rgba(118,118,128,.1)`, 12 `#3d404c`, with a 20 avatar at 8/700 ("Rin joined the crew", "Maya renamed…", "Dev left the crew").
- Offline marker: 12/600 `#a8501a` on `#fff1e6`, padding 5 12, radius 12.
- "You left" marker: muted on `rgba(118,118,128,.1)`.

### Composer and keyboard (5.01, 5.08)

| Variant | Where | Spec |
|---|---|---|
| **A** (crew chat; use this) | 5.01, 5.08, 5.10–5.12 | See below |
| **B** (legacy; §8 Q1) | 5.02–5.04, 5.13, 5.17, 5.18 | Bar 96 high, `rgba(248,248,250,.8)` blur 24 sat 1.8 with a top hairline. Control-fill `+` 40. Field 40 high, radius 20, inset .5 `rgba(28,29,36,.14)`, placeholder 15.5. Mic 30 inside the field (ink on 5.13) |
| **C** (guide) | 5.14, 5.16, 5.19, 5.20 | The Foundations composer, floating: white 56 pill, radius 28, left/right 16, bottom 30, padding 0 6 0 8, gap 10, shadow `0 1 2 .06, 0 10 28 .1`. `+` 40 `#f1f1f4`, placeholder 15, mic icon 22, send 44 ink circle |

Composer A:
- Bar: bottom 0, 92 high including the home-indicator area, `rgba(245,245,247,.9)` blur 20, top hairline.
- Row: padding 10 12 0, gap 8.
  - `+`: 38 white circle with a .5 ring.
  - Field: flex, 40 high, radius 20, white, .5 ring, padding 0 6 0 14, placeholder "Message, or @tokek" 15 `#9a9daa`.
  - Sticker button inside the field: a **32 gecko circle**, `#fff3c4`, turning **ink `#1c1d24` while the tray is open**.
  - Mic: 38, transparent, icon 18.
- No send button is drawn (§8 Q2).

**Placeholder and lock states**

| Context | Composer shows |
|---|---|
| New crew | "Say hi to the crew" |
| Offline | "Sends when you're back" |
| Guide offline | "Questions wait for signal" |
| Guide slow answer | "Ask something else meanwhile" |
| Guide queued | "Ask now, Tokek answers at midnight", no `+`, send `#e9eaee` |
| Guide locked (5.19) | Pill `#e9eaee`, lock 16, "Pon is back in 7h 12m" 15 `#9a9daa` |
| Read-only (5.06) | A bar replaces the composer |

**Sticker tray open (5.08)**
- The tray replaces the keyboard: a white sheet, 392 high, radius 28 28 0 0, shadow `0 −10 30 −10 .2`.
- The composer docks on top at bottom 392 and is 62 high, losing the home-indicator padding: padding 10 12.
- The list bottom becomes the composer top − 8 (the design shows 500). The header stays.

**Keyboard open.** Not drawn; this is derived from the tray state and the Foundations rules.
- The composer docks above the keyboard at 62 high, and the last message stays pinned just above it with no jump.
- The header and gradient stay fixed.
- Dragging the list down dismisses the keyboard interactively, and the composer follows the finger.
- The sticker button swaps keyboard and tray at the same height (tray height = the last keyboard height). Tapping again brings the keyboard back; swiping down closes the tray.
- The field is multi-line: return inserts a newline and the send button sends.

Most of this already exists: `ui/layout/KeyboardFooter.tsx` (`useAnimatedKeyboard`) and `features/crew/chat/components/message-list.tsx` (FlashList 2, `maintainVisibleContentPosition.startRenderingFromBottom`, `keyboardDismissMode="interactive"`). The tray-as-keyboard swap is missing.

### 5.01 Crew chat (polls, offers, stickers, splits inline)

Top to bottom, under the header:
1. **Poll card**: 282, radius 22, `card`, padding 12 14.
   - Title 16/700 "Spa on day 3?"; meta 11.5 muted "Maya · 4 of 6".
   - Options: gap 6, margin-top 10, each 38 high, radius 12 on `#f1f1f4`.
   - Fill behind each option: `#ffd84a` for the leading or your choice, `#e3e4e9` otherwise, width = share of votes.
   - Label 14, weight 700 when leading and 500 otherwise, padding 0 10 0 12.
   - On the right: an 18 avatar stack (2 px border in the fill colour, −8 overlap, 7/700) and a bold count.
2. **Tokek offer bubble**: ink pill "I'm in · 2 slots left" (36 high, padding 0 14, radius 18, 13.5/600) and a 22 stack of the people who claimed (2 px `#fff6c9` border).
3. **Jordan's sticker**: gecko cheer 112 with "YES PLS", reactions [gecko-wave 3] [tanuki 1].
4. **My reply bubble** quoting Maya ("@tokek can we catch sunset somewhere after?") with "Read by 4".
5. Composer A.

| Tap | Result |
|---|---|
| Back | Home (3.01) or wherever you came from |
| Map | Crew map (6.C) |
| Poll option | Votes; the bar fills and your face joins it (Snappy) |
| I'm in | Claims a slot; Tokek books it and the split posts |
| Long-press a sticker | 5.09 |
| Reaction chip | Who reacted, with their critters |
| @tokek | Tokek answers in the thread; counts as a question |
| Sticker button | Tray (5.08) |
| `+` | Photo, poll, expense, meet-up, location |
| Hold the mic | Voice note |
| View (expense) | 7.21 |

**Dark (1.10).** Their bubbles sit on `#1c1d24`, yours flip to light ink, Tokek's offer uses `#2f2914` with cream text, and stickers keep their white edge.

### 5.02 Brand new, Tokek breaks the ice

- **Members ring** at top 150: a 200×110 box with six 40 avatars on an ellipse (16/700) and a gecko cheer 64 with its sticker edge in the centre.
- "The Bali Six is on" 20/700 −0.02 (**OFF-TOKEN**). "Maya made the crew · today 9:12" 13 muted.
- Tokek bubble, white (§8 Q3), top 360, max width 258.
- **Starter chips** at top 460, gap 8, left-aligned: 44 high, padding 0 16 0 8, radius 22, white, shadow `0 0 0 .5 .08, 0 6 14 −8 .2`, 14.5/600, each led by a 28 doodle.
  - cal: "When is everyone free?"
  - temple: "Pitch a place to go"
  - wallet: "Set a rough budget"
- Footnote at top 640: "Messages stay on everyone's phone, offline too" 12.5 `#9a9daa`.
- Ways out: a starter (prefills or asks Tokek), the crew map, back to Home.

### 5.03 Offline, sends queue, one bounced

- The header subtitle becomes a NO SIGNAL chip: 30 high, padding 0 11, radius 15, `rgba(118,118,128,.12)`, `#a8501a` 12/700 +.04em, 7 tangerine dot.
- Rows use the delivery states and the offline marker. The composer reads "Sends when you're back"; typing still queues.
- Ways out: Retry, Delete the failed one, keep typing, Back. Foundations' general offline pattern is an ink pill at the top; this part uses the chip instead (§8 Q4).

### 5.04 Long-press, react and act

- **Backdrop**: the chat gets `blur(14) saturate(1.2)` at .8 opacity, plus a `rgba(20,22,40,.12)` scrim.
- **Reaction bar**: at (16, 226), 54 high, padding 0 8, radius 27, `rgba(255,255,255,.9)` blur 18 sat 1.8, nav-glass shadow.
  - Five 44 cells holding 32 doodles: heart `#ff5fa8`, star `#ffd84a`, flame `#ff9a4d`, check `#54d6a4`, spark `#4f86ff`. The selected cell gets a tint disc (`rgba(255,95,168,.14)`).
  - A sixth cell: control-fill `+` 44 for more reactions.
- **Lifted bubble** at y 292: scale 1.03 from top-left, radius 22 (6 bottom-left), padding 12 16, 15.5/1.4, shadow `0 20 40 −14 .35`. Name inside at 12/700 in the sender's text accent (`#b0306b` for Maya).
- **Menu**: 250 wide at y 398, radius 22, `rgba(250,250,252,.92)` blur 30 sat 1.8, shadow `0 24 50 −16 .4`.
  - Rows 48 high, padding 0 16, 16 ink, trailing 18 icon, hairline .1: Reply, Pin to the trip, Add to Day 5, Copy.
  - A 6 px band `rgba(118,118,128,.1)`, then Report in `#e0468e` (**OFF-TOKEN**: destructive is `#d6337f`).
- Ways out: React, Reply, Pin / add to day, Report, tap outside to close.

### 5.05 Voice note: the microphone is off

- Scrim `rgba(20,22,40,.3)`.
- Sheet glass: inset 8, top 430, radius **46**, `rgba(248,248,250,.88)` blur 34 sat 1.8, padding 10 18 0, grabber 36×5 `rgba(60,60,67,.3)`, glass ✕ 44 at the right. There is no Cancel / verb pair (§8 Q5).
- Hero: 86 `#ffe4f0` disc with a 36 mic and a 56×3 `#b0306b` strike at −45°, margin-top −16.
- Title 24/700 −0.025 (**OFF-TOKEN**). Body 14.5/1.42 muted.
- At bottom 24, gap 8:
  - Ink pill 56 "Open Settings": iOS app settings or Android app details.
  - Control pill 52, radius 26, 16/600 "Type it instead": closes the sheet and focuses the field.
- Today this is a PermissionCard in `features/crew/chat/media/voice-recorder.tsx`; move it into this sheet.

### 5.06 You left, you can still read

- Subtitle "Read only · you left on Oct 2"; the list sits at .9 opacity.
- A bar replaces the composer: padding 16 16 34, `rgba(248,248,250,.86)` blur 24, top hairline.
  - 40 `#f1f1f4` lock disc, "You're not in the Bali Six now" 15/600, and "Photos and the recap stay yours. To post again, ask to rejoin." 12.5 muted.
  - Buttons 48 high, radius 24, flex 1, gap 8, margin-top 14: ink "Ask to rejoin" and control "Remove chat".
- "Remove chat" is destructive: confirm with an Alert (not drawn).

### 5.07 Group offer, claim a slot

- Header: no bar. Title 17/600 "The Bali Six", subtitle "Tokek is in this chat", a 40 spacer on the right (no Map).
- My @tokek bubble at right 16, top 124.
- **Offer place card**: Tokek 28 `#ffd84a`, then a flex card, radius 24, shadow `0 2 4 .05, 0 14 32 .1`.
  - Photo 120 high, margin 6 6 0, radius 19.
  - Body padding 12 14: "Menega Café, beach table at 18:15" 16/600; "6 slots held for 30 min · grilled fish by weight" 12.5 muted.
  - Slot row: 6 flex cells, 30 high, radius 10, gap 4. Taken cells use the crew colour with the initial 11/700; free cells are transparent with a 1.5 dashed `#c4c6ce` border.
- **Sheet**: inset 8, radius 36 36 48 48, solid `#f5f5f7` (**OFF-TOKEN**: not Sheet glass), padding 12 20 30.
  - Grabber; "Take one of the slots?" 22/700 (`title`); "Nothing is booked or paid yet." 13.5 muted.
  - Ink pill "Count me in · 2 slots left", 54 high (**OFF-TOKEN**: 56), 16/600.
  - "Not now" text button 44 high.
- The scrim (`rgba(20,22,40,.25)`) covers only the bottom 300 px in the design; use a full scrim.

| Tap | Result |
|---|---|
| Count me in | Claims a slot; Tokek holds it 30 min |
| Not now | Hides the offer for you |
| The card | Place sheet (menu and map) |
| "2 slots left" | Who has claimed |

### 5.08 Sticker tray: your Critterdex, one tap from the keyboard

- **Tab row**: padding 0 14, gap 6.
  - "Recent": 34 high, padding 0 12, radius 17, `#f1f1f4`, 13/600.
  - Critter tabs: 40×34, radius 17. Active is ink (gecko); inactive is `#f1f1f4` with a 32 critter cropped at the bottom (tanuki, sardine, puffin).
  - "12 of 150" 12/700 muted on the right.
- Set label "TOKEK · BALI" 12/800 +.06em `#8a6a0c`, padding 12 18 0.
- **Grid**: 4 columns, row gap 4, padding 6 8 0.
  - Each cell is a 76×76 tile, radius 20, transparent (the recently pressed one shows `#fff3c4`), holding a 68 sticker with its edge.
  - Label 10.5/700 `#3d404c` (hi!, yes pls, hmm, omw, zzz).
  - Locked critters (Ora `cp-113`, Kukang `cp-114`) are silhouettes with labels in `#9a9daa`. The last cell reads "Meet more in Indonesia" 10.5/700 muted.
- The design's `locked=true` is not a valid colour, so it rendered black (§8 Q7).

| Tap | Result |
|---|---|
| Sticker | Sends it "with a little pop" |
| Hold | Bigger preview; drag up to send it as a reply |
| Critter tab | That critter's set (earned on its trip) |
| Silhouette | Where to meet it (8.A, `critters/where/[formId].tsx`) |
| Recent | Your most-sent stickers |
| Sticker button | Back to the keyboard |
| Swipe down | Closes the tray |

### 5.09 A sticker lands: react with a critter, reply in kind

- **Backdrop**: `rgba(245,245,247,.55)` with blur 14, a light frost rather than 5.04's dark scrim.
- **Critter bar** at (20, 262): padding 6, radius 30, white, shadow `0 18 40 −12 .35`, gap 6. Six 46 cells with 44 critters: gecko cheer, gecko think (selected, on `#fff3c4`), tanuki, sardine, puffin, gecko sleep.
- **Lifted sticker**: grows from 96 to **150** (×1.56) at (44, 332), keeping its +5° tilt and caption.
- **Menu**: 230 wide at y 500, radius 20, white, shadow `0 18 40 −12 .3`, rows padding 12 16 at 15, hairline .08.

| Menu row or tap | Result |
|---|---|
| Critter in the bar | Reacts; tap again to take it back |
| Reply with a sticker | The tray with the reply attached |
| Save to my tray | Only for critters you've met; others say where to find them |
| Who reacted | Faces and their critters |
| Copy | The sticker as an image (`ui/sticker/export-png.ts`) |
| Outside | Back to the chat |

The frame is static. The filmstrip `$SP/film/05-lane/strip8.png` has a pixel difference of 0 between frames; §5 gives the proposed motion.

### 5.10 Plan cards: a change to say yes to, a meet-up

**Changeset card**: 282, radius 22, `card`, padding 12 14.
- Eyebrow "A CHANGE · NEEDS 3 YESES" 10.5/800 +.07em `#2f5fc4`, with a 26 Tokek bust `#fff3c4` on the right. Title 16/700.
- Rows (gap 4, 13): 6 sky dot, name, old time `#9a9daa`, "→", bold new time.
- Voters: 22 stack + "2 of 3 yeses · closes 18:00" 12 muted.
- Buttons 36 high, radius 18: ink "Yes, swap" (flex 1), `#f1f1f4` "Not this one".

**Meetup card**: 282, radius 22, no padding, shadow `0 0 0 .5 .05, 0 14 34 −12 .2`.
- Live map 104 high on `#eef0e8`, with a "LIVE" chip (white, 24 high, `#1f7a55` 11.5/700, 6 `#34c77b` dot).
- Body padding 10 14 12: title 15.5/700. Members (gap 10): 26 avatars with a status under each at 10.5/700 ("here" in `#1f7a55`, minutes muted).
- Buttons 36 high: ink "I'm on my way", `#f1f1f4` "Running late".

| Tap | Result |
|---|---|
| Yes, swap | Your yes; at 3 the plan moves and the card says so |
| Not this one | Your no, with an optional line |
| The change | Review it (4.48) |
| I'm on my way | Shares your ETA until you arrive |
| Running late | Tells the crew, offers a new time |
| The map | Crew map at the meet-up (6.C) |

### 5.11 Money, rides and boosts

**Photo grid**: 230 wide, columns 1.3fr / 1fr, rows 84 / 84, gap 3, radius 20 20 20 6. The first image spans both rows. The "+4" overlay is `rgba(20,22,40,.45)` with white 17/800. Uploading shows a ring; a failure shows Retry.

**Voice note**: padding 8 12 8 8, radius 20 20 20 6.
- 34 ink play button.
- 34 bars, each 3 wide with radius 2, gap 2, up to 22 high: ink once played, `#c4c6ce` before.
- "0:14" 12/600 muted, tabular figures. Speed toggles 1× / 1.5×.

**Supplier order (ride) card**: 282, radius 22, `card`, padding 12 14.
- 40 mint "M" (15/800), "Made · Jatiluwih pickup" 15/700, "Wed 14 · 06:40 · 7 seats" 12 muted.
- Status tag: Held (`#fff3c4` / `#8a6a0c`), Confirmed (`#e3f6ec` / `#1f7a55`) or Declined (`#ffe4f0` / `#b0306b`).
- Three-step bar (margin-top 12, gap 4): bars 4 high, radius 2. Done is `#34c77b`, to do is `#e3e4e9`, refused is `#ff5fa8`. Labels 10.5/700, green when done, `#9a9daa` otherwise: Asked / Made said yes / Paid on the day.
- Footer, margin-top 10, 12.5: muted detail plus a bold action.
  - Held: "Hold till 18:00 · Rp 650k" · **Message Made**
  - Confirmed: "Rp 650k for the car"
  - Declined: "Pon found 2 others" · **See them**

**Boost card**: 282, radius 22, white, **2 px dashed `#ff9a4d`** border, padding 12 14.
- Tanuki 38 on a 40 tile, radius 12, `#ffe9d6` (**OFF-TOKEN**).
- "Winston boosted Kyoto" 15/700; "For everyone on this trip" 12 muted.
- Perk chips 24 high, radius 12, `#ffe9d6` / `#a8501a` 11.5/700.
- Footer: "$2 each, already in Balances" 12 muted.

| Tap | Result |
|---|---|
| A photo | Full screen; swipe through, save to the album |
| +4 | The other photos |
| Play | Plays the note |
| Message Made | WhatsApp with Pon's message ready |
| Ride card | The driver (6.E) |
| Boost card | What the crew gets (9.16) |
| $2 each | Balances (7.16) |

### 5.12 Housekeeping: joins, renames, typing, a card from the future

- **Unknown card**: 282, radius 22, 1.5 dashed `#c4c6ce`, `rgba(255,255,255,.5)`, padding 12 14, gap 12. Gecko think 40, "A card this app can't show yet" 14/700, "Update CritterPass to see it" 12 muted, a control "Update" button 36 high.
- **Settled strip**: centred, padding 8 14 8 8, radius 24, `#e3f6ec`. Gecko cheer 40 with its edge, "All square" 13.5/700 `#174a35`, "Lisbon is settled · 6 of 6" 11.5 `#1f7a55`. Posted once, when the last payment lands.
- **Typing**: Tokek bust 28 and a bubble (padding 12 14, radius 20 20 20 6, `#fff6c9`) holding three 7 dots in `#8a6a0c` at .35 / .6 / .85 opacity, animated as a wave. Live only, never stored.
- **New messages pill**: centred at bottom 108. Ink, 34 high, padding 0 12 0 8, radius 17, 13/600, shadow `0 10 20 rgba(28,29,36,.3)`. Pink badge (minimum 20 high, `#ff5fa8`, 11/800, "3"), then "New messages ↓". Tapping jumps to the first unread.

| Tap | Result |
|---|---|
| A system line | That member (3.14) |
| Update | The App Store page |
| All square | Balances (7.16), read-only |

### 5.D Board: every card and state

Each card is 282 wide on a `#f5f5f7` well (padding 16, radius 24). Metrics are as above unless noted.

| Type | State | Notes |
|---|---|---|
| text | plain, reply | Quote bar in the author's colour |
| sticker | one | New kind |
| photo | grid, +N | Uploading ring; failed shows Retry (not drawn) |
| voice | note | Mic refused → 5.05 |
| poll | open, closed | Closed: "Closed · 6 of 6", widths 66/17/17, winner line 12.5/700 `#1f7a55` with a 16 `#34c77b` check disc "Yes won · added to Wed 14:00" |
| guide_offer | open | Ink "I'm in · 2 slots left" |
| guide_offer | you're in | Tag 30 high, `#e3f6ec` / `#174a35` 13/700 with a 14 `#1f7a55` check disc |
| guide_offer | full | White tag, muted "All 3 slots taken" |
| expense | new | 44 tile, radius 13.2, `#ffe4f0`, food doodle 40 pink; "Maya paid Rp 1.08M" 15/700; "View" control 36; hairline footer "Your share $11.37" 13 |
| expense | paid | "Paid" booked-tint tag instead of View; no footer |
| changeset | needs yeses, applied, not changed, expired | Applied: eyebrow "CHANGED · WED 14" `#1f7a55`, old times struck, green footer "3 yeses · the plan moved" with "Undo" in ink. Not changed: eyebrow `#9a9daa`, muted title, new times struck, "Alex and Dev said not this one". Expired: "EXPIRED · NOTHING CHANGED", "Nobody answered by 18:00" |
| proposal | open, everyone boarded | See below |
| meetup | live, done | Done: no LIVE chip; a 30-high booked-tint tag "Everyone made it · 17:04" replaces the buttons |
| supplier_order | held, confirmed, declined | As 5.11 |
| boost_card | boosted | As 5.11 |
| system | joined, left, renamed | Pills |
| settled strip, typing, unknown | — | As 5.12; unknown is "Any newer card, so old apps never crash" |

**Proposal card**
- Top panel: `#ffd84a` with a `radial-gradient(rgba(23,20,42,.12) 1.2px, transparent 1.7px)` dot grid on 9 px, padding 12 14 14.
  - Eyebrow "WINSTON'S PROPOSAL · V2" 10.5/800 +.08em `#5d4a14`.
  - "BALI" 30/800 −0.04, then "Oct 12–19 · 8 days · $1,240 each" 12.5/600 `#3d3210`.
  - Gecko wave 68 with its edge, rotated 8°, at the top right.
- Divider: 2 px dashed `#e3e4e9` perforation.
- Footer: 22 stack, "4 of 6 boarded · reply by Oct 5" 12.5 muted, ink "Board" 36. When everyone has boarded: "All 6 boarded" with a "Boarded" tag.
- Each version posts again.

### 5.13 Guide chat, empty: the guide offers four starts

- Background `radial-gradient(90% 50% at 50% 20%, #fff6c9, #f5f5f7 70%)`.
- Header at y 58: glass back 44 (§8 Q8); "Tokek" 17/600 / "Bali guide" 12 muted.
- **Quota chip**: 30 high, padding 0 10, radius 15, `#fff6c9` / `#8a6a0c` 12/700, a 6 `#ffd84a` dot with a 2 px `rgba(255,216,74,.35)` halo, "27 left".
- Gecko wave 128 with its edge at y 132, **bobbing**.
- At y 280: "Selamat pagi, Winston" in `emptyTitle` (26/700 −0.03 / 1.12), then "I know your plan, your bookings and Bali. Ask in any language." 15 muted / 1.42.
- **Starter cards** at y 388, inset 16, 2×2, gap 10. Each is 112 high, radius 24, `card`, padding 12 14, laid out with space-between: a 34 accent doodle (food tangerine, boat sky, chat pink, camera mint), then 14/1.3 text with a 600 line and a muted line.
- Footnote at y 640: "30 answers a day on the free pass · resets at midnight" 12.5 `#9a9daa`.
- Composer B "Ask Tokek", with a 30 ink mic.
- Ways out: a starter card, point the camera (5.16), voice (5.15), back.

### 5.14 Guide chat: answers as a plan card

**Header** (y 60)
- ✕ glass 44.
- Identity: 36 `#ffd84a` disc with gecko 34, "Tokek" 17/600, "All six can see this" 12 muted.
- Segmented "Group | Me": 34 high, padding 3, radius 17, track `#e9eaee` (**OFF-TOKEN**). Thumb white, radius 14, 12/600, shadow `0 1 3 .1`.

**Thread**
- "Today 14:02". Maya's question: 28 avatar; white bubble, padding 11 14, radius 20 20 20 6, 15/1.35, shadow `0 0 0 .5 .05, 0 1 2 .04, 0 12 28 −14 .18`.
- **Plan card**: Tokek 28 `#ffd84a` (§8 Q3); flex card, radius 24, padding 14, gap 12, shadow `0 2 4 .05, 0 12 30 .08`.
  - Intro in **Borel 14** `#6b5a24`: "Rain till three. Two dry swaps:"
  - Two swap rows split by a hairline: the old item 12.5 `#9a9daa` struck through; the new item 16/600 with 12.5 muted meta; a 50 sticker with its edge, rotated ±6°.
  - Cost row: padding 10 12, radius 14, `#f5f5f7`. "+$22 each" 13/600 · "Dinner unchanged" 13 muted.
  - Buttons 42 high, radius 21, gap 8: ink "Propose to group" (flex 1.4), `#f1f1f4` "Just me" (flex 1).

**Below the thread**
- Quick chips at y 648, scrolling sideways, padding 0 16, gap 8, fading over the last 16%. Each is 38 high, padding 0 13 0 6, radius 19, white, a `raised`-like shadow, a 26 doodle and 13/600: Call a car, Translate a menu, Pharmacy.
- Composer C, "Ask, or hold to talk".

No streaming state is drawn. Keep the current word-by-word reveal (`features/guide/chat/components/guide-answer.tsx`); the plan card rises in when its data lands (Smooth).

### 5.15 Voice: talk, see the swap, send it

- Background `radial-gradient(circle at 50% 30%, rgba(255,216,74,.32), transparent 58%)`.
- Header: ✕ 44, "Tokek · group mode" 15/600, glass "CC" 44 (11/800, captions).
- **Ping rings**: two 220 circles, 2 px `#ffd84a`, at (85, 122). A white 180 disc at (105, 142) with shadow `0 2 4 .06, 0 24 50 .14` holds a **bobbing** gecko think 132.
- "Listening" pill at y 338: ink, 28 high, radius 14, 12/600, 7 mint dot.
- Transcript at y 390: 22/600 −0.02 / 1.25. Answer: **Borel 15** `#6b5a24` / 1.5.
- Live waveform at y 528: 34 bars, 4 wide, radius 2, gap 3, in a 34-high box. Bars already spoken are ink; the rest `rgba(28,29,36,.18)`.
- Result card at y 584: radius 24, `card`. Rows padding 12 16 12 10: 40 sticker, 15/600 title, 12.5 meta, 15/600 price.
- At bottom 36: a 56 white mic circle and an Ink pill 56 "Send to the group".

### 5.16 Point and ask: translations stick to the menu

- Camera background `#2a2622` with a `radial-gradient(circle at 40% 30%, #4a4038, #221e1a 70%)`; white status bar.
- ✕ 40 and a centre pill "Indonesian → English" (34 high, radius 17, 13/600 white), both on `rgba(255,255,255,.18)` blur 16 (**OFF-TOKEN**: Clear glass is `rgba(18,20,28,.30)` blur 24).
- Viewfinder corners: 34×34, 3 px white, radius 10, framing x 30–360, y 112–464.
- **Labels** stick to each detected line: sticker tags with padding 5 9, radius 8, 2 px white border, shadow `0 4 10 rgba(0,0,0,.3)`, 800 12 `#17142a`, rotated −2° to −7°, cycling sun / tangerine / pink / mint.
- **Sheet**: 372 high, radius 34 34 0 0, `#f5f5f7`, grabber 40×5 `#d0d1d8`.
  - Diet chips 30 high, radius 15, 12.5/600, 18 avatars: "Jordan · veg ✓" (booked tint) and "Alex · no peanuts" (vote-open tint).
  - Tokek 34 `#ffd84a` answering in 15/1.42.
  - Actions 36 high, radius 18, 13/600; "Order for 6" is ink.
  - Composer C, "Ask about this menu".

### 5.17 Guide offline: the question waits, a failed turn retries

- NO SIGNAL chip (`#fff1e6` / `#a8501a`, tangerine dot). The first question is marked "✓ Answered" in `#1f7a55`.
- Tokek's reply bubble is white ("That one tripped me up…"). Under it, two white pills 32 high, radius 16, 13.5/600: "↻ Try again" and "Ask it differently". Then 11.5 `#9a9daa` "This one didn't count toward your 30".
- The queued question sits at .6 opacity with a clock and "Asks when you're back online".
- **Offline tools card** at y 490: radius 24, `card`, padding 14. A 36 `#fff1e6` disc with wifi-off, "Still works offline" 15/600, "Saved on this phone for Bali" 12.5. Chips 32 high, radius 16, `#f1f1f4`, 13.5/600: Phrasebook, Emergency numbers, Today's plan, Bookings.
- Composer B, "Questions wait for signal".

### 5.18 A slow answer shows its working

- Chip "26 left"; the question is marked "Read".
- **Working card**: left 16, right 40, y 212. Tokek 34 `#fff3c4` (think). Card radius 22 (6 bottom-left), shadow `0 0 0 .5 .06, 0 14 30 −16 .25`, padding 14 16. Title 15/600 "Checking a swap to Friday". Steps: gap 10, 14 ink.

| Step state | Marker | Text |
|---|---|---|
| Done | 20 `#34c77b` disc with a white check 11 | ink |
| Active | 20 ring, inset 2.5 `#ffd84a`, with an 8 `#ffd84a` dot that **pulses** | weight 600 |
| Pending | 1.5 `#c4c6ce` ring | `#9a9daa` |

- Note at left 60, y 446: 13 muted / 1.4.
- Buttons at y 500: white pills 34 high, radius 17. "🔔 Ping me" and "■ Stop" (`#b0306b`).
- The composer stays live: "Ask something else meanwhile".
- Ways out: Ping me later (a push, §6), Stop, ask something else, back.

### 5.19 Out of questions: the limit, in Pon's voice

- Header: ✕ 44, a 36 `#ff9a4d` Pon disc with the tanuki, "Pon" 16/600, "Just me · Kyoto, Apr 2–9" 12 muted.
- **Limit card**: radius 24, padding 16.
  - **Borel 14** `#8a4a12` "That's my thirtieth answer today…"
  - A 62 ring (`conic-gradient(#ff9a4d 0 100%)`) around a 50 white centre showing "30" 16/800 and "of 30" 9/600, with 12.5 muted copy beside it.
  - Buttons 42 high: ink "Get Pass+" (flex 1.3) → paywall 9.10; `#f1f1f4` "At midnight" → queues the question (5.20).
- Handoff row at left 52, y 500: radius 20, padding 10 12. Maya's 30 avatar, "Maya has Pass+. Ask in the crew chat and Pon answers there." 13, a chevron. It opens the crew chat with the question moved over.
- The composer is locked: "Pon is back in 7h 12m".

### 5.20 Out of answers: queue it for midnight

- Header: ✕ 44, "Tokek" 16/600 left-aligned, chip "30 of 30 today" (`#ffe4f0` / `#b0306b`).
- **Waiting card** at y 236, inset 20: radius 24, padding 14 16, ring `0 0 0 2 #ffd84a`.
  - "WAITING FOR 00:00" 11.5/800 +.06em `#8a6a0c` with "Cancel" 13/600 muted on the right.
  - The question 16/600.
  - "Tokek answers this at 00:00 and lets you know quietly. It counts towards tomorrow." 12.5 muted.
- A sleeping gecko 120 in a 160 white disc at (115, 410), with **Borel 14** `#6b5a24` "Saving my voice. Back in 7h 12m."
- Composer C without `+`, send in `#e9eaee`.

| Tap | Result |
|---|---|
| Cancel | Unqueues it; back to typing |
| The waiting question | Edit before midnight |
| Send | Queues; counts toward tomorrow |

### 5.21 Dietary: consent first

- ✕ 44 on the left; on the right, "From the guide · You settings" 13/600 muted.
- `largeTitle` 32/700 / 1.05 at y 116 (left 24, right 120): "Food and getting around". Food sticker 96 at 8°, top right.
- **Consent card** at y 214, inset 20: radius 28, paper `#fffdf6`, padding 20, shadow `0 2 4 .06, 0 20 44 .12`.
  - Gecko think 44 beside "Share flags with your crew and guide?" 19/700.
  - Body 14 `#3d3a34` / 1.5.
  - Preview tags: "Vegetarian" mint at −3° and "No peanuts" pink at +3° (12.5/800), plus "your notes" struck through in a 2 px dashed `#c4c6ce` box, `#9a9daa`.
  - Footnote 12.5 muted.
- At bottom 34: Ink pill "Share flags" → 5.22; "Not now" → back to the guide, nothing shared. "What they see" previews the flags.

### 5.22 Dietary: the form

- ✕ on the left; chip "Sharing flags" (`#e3f6ec` / `#1f7a55` 12/600) on the right. Title 30/700 (**OFF-TOKEN**).
- Labels 13/600 muted at x 24: Diet, Allergies, "Rather not eat · only you see this", Spice, Getting around.
- Chips 34 high, padding 0 13, radius 17, 13/600. On: ink with white text. Off: white with shadow `0 1 2 .06, 0 4 12 .06`.
  - Diet: No restrictions, Vegetarian, Vegan, Pescatarian, Halal, Kosher.
  - Allergies: Peanuts, Tree nuts, Shellfish, Fish, Dairy, Eggs, Gluten, Soy, Sesame.
- Fields 46 high, radius 16, inset 1.5 `#e3e4e9`, padding 0 14, 14 text (**OFF-TOKEN**: Foundations is 52 / r 18 / 16/500).
- Spice: segmented None / Mild / Medium / Hot. Save: Ink pill at bottom 34.
- **Keyboard (not drawn)**: the form scrolls so the focused field sits above the keyboard. Save docks above the keyboard or hides while it is up (§8 Q9). "Something else?" uses return key **Done**, which adds a chip and clears the field; the other fields use **Done**, which dismisses. Swiping down asks before discarding edits.

### 5.23 Phrase: show mode, full screen

- Background `#1c1d24` with `radial-gradient(circle at 50% 40%, rgba(255,216,74,.18), transparent 60%)`.
- Language chip at (24, 68): 30 high, `rgba(255,255,255,.14)` blur 16, 12.5/600. ✕ 44 at the **top right** (§8 Q10).
- Phrase at y 200, inset 30: 58/800 −0.04 / 1.02 white. Translation 18 italic at .7 opacity, margin-top 20.
- At bottom 150: a 64 `#ffd84a` play button with "Play it out loud" 14 at .75. Gecko point 96 at −8° in the bottom right. Hint 12.5 at .55: "Brightness up · tap anywhere to close".
- Maximum brightness while open (reuse `features/bookings/boarding-pass/use-full-brightness.ts`). Tapping anywhere goes back to the guide chat.

### 5.24 Getting around: the ride and a card for the driver

- Map from y 0 to 460, with a 120 top fade (`rgba(245,245,247,.95)` 40% → transparent).
- Header: glass back 44 and an ink route pill, 34 high, padding 0 14, **radius 12** (**OFF-TOKEN**), 13/600 "Airport → Villa · 1h 05m".
- **Sheet** at y 420: radius 32 32 0 0, `#f5f5f7`, shadow `0 −10 30 .12`, grabber.
  - Ride row: car sticker 58 at −6°, "Made is 4 min away" 20/700, "White Avanza · DK 1234 AB · booked by Tokek" 12.5, a white 44 message circle.
  - **Driver phrase card** (it stays light): radius 24, padding 16. "Show this to Made" 13/600 muted with a 34 ink speaker; the phrase 22/700 / 1.22; the translation 13.5 italic muted.
  - "Later today": a ride row (radius 20, padding 12 12 12 16), "Villa → Warung Biah Biah" 15/600, "12 min by car · Rp 60k, split 6", ink "Book" 36.

### 8.01 Critterdex: here now, then the sets

- No nav bar. "Your Critterdex" 13/600 muted at (24, 62). The count is 56/800 −0.05 with tabular figures: "9" in ink, "/150" in `#b9bbc4` (**OFF-TOKEN**).
- At y 74 on the right: a pink sticker tag at 3° "6 of 61 places" (padding 5 10, radius 9, 2.5 white, `sticker`, 12/800) and "Maya has 14" 12.5 muted.
- Segmented at y 150: All / Found / Near me.
- **Here-now card** at y 206: radius 26, padding 14 14 12, ring `0 0 0 2 #ffd84a`, shadow `0 16 36 .08`.
  - "Here now · Bali" 16/700 with "Tokek · 2 of 4 forms" 12 muted.
  - A 4-column grid of 66 stickers with tier labels 11/700:

| Form | Art | "?" overlay | Label |
|---|---|---|---|
| Common | normal | — | "● Common" `#6e7180` |
| Rare | fill `#54d6a4`, spot `#2e9a74` | — | "◆ Rare" `#2f5fc4` |
| Epic (locked) | mask `#e3e4ea` | 20/800 `#d6337f` at top 20 | "★ Epic" `#b0306b` |
| Legendary (locked) | mask `#efe2b4` | `#a8800f` | "✦ Legendary" `#8a6a0c` |

  - A hairline footer, 13 `#3d404c`: "Epic is tomorrow: summit Batur by sunrise."
- **Legendary banner** at y 420: 64 high, radius 20, ink. A 48 tanuki silhouette `#6b5a24` with "?" 16/800 `#ffd84a`; eyebrow 11/700 +.06em `#ffd84a` "LEGENDARY ON YOUR DATES"; 15/600 "Sakura Pon · Kyoto, Apr 2–9"; a chevron.
- **Home set card** at y 498: radius 24, `card`. "Vietnam" 16/700 with "3/10 · home set". A 5-column grid of 52×50 cells: found critters as 46 stickers, locked ones as 42 masks in `#e3e4ea`.
- **Country row** at y 672: radius 20, padding 8 12. "#01" `#9a9daa` + "France" 14/700, "2/5 found" 11.5, and five 34 cells (found 34, locked 30).
- Tab bar with Pass active. The 9/150 block acts as the Root large title and collapses on scroll.

### 8.02 Critter detail: sticker over the place it lives

- Hero photo 330 high, radius 0 0 40 40, fading from `rgba(10,15,25,.5)` to transparent at 40%; white status bar.
- At y 60: glass 40 buttons on `rgba(255,255,255,.2)` blur 16 sat 1.6 (**OFF-TOKEN** vs Clear glass). Back is an **arrow**; the centre chip "#112" is 30 high, 13/600, tabular; share on the right.
- A rare tag at (24, 252), −6°, `#4f86ff` 13/800. The sticker is 210, wave pose, rare palette, **floating** at (150, 176) and overlapping the hero's bottom edge.
- "Temple Tokek" in `display` 34/700 at y 410. Field note in **Borel 13.5** `#1f6b4c`, then "From Tokek's field notes" 11.5 muted.
- **Facts card** at y 536: radius 22, 3 columns, label 11.5 muted, value 14/600: Found / Where / Also has it (18 avatar).
- "One Tokek, four ways · 2 of 4" 13/600 muted, then a 2×2 grid, gap 8, cells 44 high, radius 14:
  - Found: white, 18 `#e3f6ec` check disc, name 12.5/700 in the tier colour, condition 11 muted.
  - Locked: 1.5 dashed `#c4c6ce`, 18 "?" disc (epic `#ffe4f0` / `#b0306b`, legendary `#fff3c4` / `#8a6a0c`).
- Ink pill "Make it my guide" at bottom 36. It is a Push, so the tab bar hides.

### 8.03 Encounter: hold to befriend

- Full-bleed photo with a gradient `.55 → .05 (30%) → .2 (50%) → .85`; white system chrome.
- Top: ✕ 40; a pill "You're at Tirta Empul" 34 high with a mint dot. Rare tag centred at y 124, −3°.
- The critter: a ground shadow ellipse 180×30 (`rgba(0,0,0,.35)` blur 8) at (105, 410); a ping ellipse 200×110 (2 px `rgba(84,214,164,.9)`) at (95, 340); the sticker 170 idle with **hop** at (110, 212).
- Title 32/700 white at y 494; body 15/1.45 at .92.
- **Hold ring** centred at bottom 72: 108, `conic-gradient(#54d6a4 0 P%, rgba(255,255,255,.25) P%)` (shown at 38%), around a 92 white centre with "Hold" 17/700.
- Caption at bottom 40: 12.5 at .9, "Hold to befriend · Tokek's rare form, 2 of 4".

### 8.04 Befriended: rays, stamp, sticker

- On ground `#f5f5f7`: **rays**, a 700 disc of `repeating-conic-gradient(rgba(255,216,74,.32) 0 9deg, transparent 9deg 18deg)` masked by a radial (18% → 62%), spinning once every 24 s, and **confetti**, 46 pieces from (.5, .32).
- Chip "◆ Rare form · 2 of 4": white, 30 high, `float`. The sticker is 220 cheer with **hop** at (85, 116).
- **Stamp "BEFRIENDED!"**: 280 wide, −5°, y 356, padding 10 0, radius 14. Rings inset 3.5 `#e0468e` / 7 ground / 8.5 `#e0468e`, fill `rgba(245,245,247,.6)`, text 38/800 `#d6337f`. A "+150 XP" sun tag sits at 8°.
- Name 32/700; a 26 stack with "2 in the crew"; **Borel 16** `#1f6b4c` "You stayed 11 minutes. It noticed."
- Ink pill "Add to your pass"; text button "Share with the crew" (it should post to the chat). No ✕ (§8 Q11).

### 8.05 Egg hatch: welcome to Bali

- Status bar time is 13:50. Mint rays (`rgba(84,214,164,.25)`, one turn per 26 s) and 40 confetti pieces from (.5, .36).
- Ink chip "DPS · 13:50 · you landed". Egg halves 86 and 78 (accent `#fff1d6`) at −24° and 28°. Gecko 210 wave with **hop** (2400 ms).
- "TOKEK HATCHED" 13/700 +.06em `#1f7a55`; "Welcome to Bali" 44/800 −0.045 (**OFF-TOKEN**); body 15 `#3d404c`; a sun tag "#1 of 4 in the Bali set" at −4°.

| Tap | Result |
|---|---|
| Say hi (Ink pill) | Guide chat (5.B) |
| Show me around later | Trip hub (6.01) |
| The tag | The Bali set (8.A) |

### 8.06 It wandered off: a gentle miss

- The photo at saturate .6, fading to `#f5f5f7` at 72%. Chip "Encounter over · you stayed 4 min" 32 high; ✕ 40 on the **right**.
- A ghost gecko 110 (mask `#ffffff`, opacity .5, mirrored) with footprint dots (8×5 white at .75) and a shadow.
- Rare tag; "It wandered off" 38/800 (**OFF-TOKEN**); body 14.5 `#3d404c`.
- **Chance card** at y 574: radius 24, `card`, padding 14 16. "Best chance" 12.5/600 with "Tomorrow, 07:30" 17/700. Fourteen bars (gap 3, 46 box, radius 4, height = value × .46): the best one `#54d6a4`, the rest `#e3e4e9`. Axis 11 `#9a9daa`: 6am / noon / 6pm. Tapping picks another time.
- Ink pill "Remind me at 07:00" sets a local notification and shows a toast. "Back to the day" goes to day-of (6.04).

### 8.07 Crew quests: a team sport

- "Bali Six · crew level 7" 13/600 muted; "Crew quests" 32/700 (`largeTitle`); a star sticker 62 at 10°.
- **XP card** at y 138: ink, radius 22, padding 14 16. "640" 22/800 + "/ 1000 XP" 15 at .5; "Lvl 8 unlocks a crew sticker" 12 at .7. Bar 10 high, radius 5, track `rgba(255,255,255,.15)`, fill 64% `linear-gradient(90deg, #ffd84a, #ff9a4d)`.
- **Featured quest**: radius 24, padding 14, ring 2 `#ffd84a`.
  - "Sunrise squad" 16/700, description 12.5.
  - A squad of 24 avatars: joined members get a ring `0 0 0 2 #fff, 0 0 0 3.5 #54d6a4`; the others sit at .35.
  - Reward tile 74×84, radius 16, `#fff8dc` (**OFF-TOKEN**), with a gold silhouette 54, "?", and "LEGENDARY" 9.5/800.
- **Quest rows**: radius 22, `card`, padding 12 14. A 44 sticker in the accent, 15/600 title, 12 description, a 5-high progress bar (track `#f1f1f4`, accent fill), and the reward 11.5/700 muted: "+120 XP", "Settled Tokek", "+80 XP".
- Tab bar with Pass active; no back button (§8 Q12).

| Tap | Result |
|---|---|
| A quest | Its detail and who signed up |
| Join | Signs you up; the crew sees it |
| XP bar | What level 8 unlocks |

### 8.08 Once a year: the legendary calendar

- Push: back 44; an ink "Remind me" (36 high, radius 18, 13/600) on the right, which reminds you before each legendary day.
- "Once a year" 36/800 (**OFF-TOKEN**); body 13.5 muted.
- **Month strip** at y 234: 12 columns, gap 3, 36 high, radius 9, 11/700. Apr is `#ff9a4d` (your dates); Jun, Aug and Nov are `#ffd84a`; the rest white.
- **Rows** at y 284, gap 8: radius 20, padding 9 12 9 9.
  - A 52 date tile, radius 14, `#fff8dc`: month 10/800 `#8a6a0c`, day 17/800 ("Early", "12", "Late", "1–2", "Day").
  - Name 15/700, place 12 muted.
  - A "Your dates" sun tag at 4°.
  - A 42 `#efe2b4` silhouette with "?" 14/800 `#a8800f`.
  - Your row gets a 2 `#ffd84a` ring.
- Tapping a date shows where and what to do that day.

### 8.09 Recap: the trip in four stickers

- No back or ✕ (§8 Q11). Eyebrow "Oct 12–19 · The Bali Six"; `display` 34/700 "Bali, the recap"; gecko cheer 78 at 8°.
- **2×2 tiles**: 148 high, radius 24, gap 12, rotated −2°, 2.5°, 1.5°, −1.5°.
  - Stat tiles: padding 14, value 36/800, caption 12.5 muted, a 46 sticker in the corner.
  - Photo tiles: a 5 px white frame, radius 19 inside, a bottom gradient, white 30/800 (26 for "312 photos").
- **Forms card** at y 476: three 60 stickers (common, rare, epic in `#ff8fbf` / `#d6337f` cheer) and the gold silhouette with "?". **Borel 12.5** `#6b5a24` "The Golden Tokek got away…"
- Two award tiles: radius 18, label 11.5, value 14/600.
- At bottom 36: Ink pill "Share recap" (flex 1.3) and a white `raised` "Where next? →".

### 8.10, 8.11, 8.13, 8.14 Recap story cards

**Shared chrome**
- Progress: 8 segments, 3 high, radius 2, gap 4, inset 16, y 58. Done is ink; the rest `#d6d7dd` (**OFF-TOKEN**).
- Tap = next, hold = pause, swipe down = close.
- ✕ 36 (white, `float`) on 8.13 and 8.14 only.
- `motion.duration.story` (5 s) already exists.

**8.10 The route**
- "214 km" 64/800 / .95 with **Borel 14** `#6b5a24` "Made drove 180 of them."
- A 420 map at y 220 with fades; a car sticker 78 **floating**; a caption card (radius 22, `card`); "Tap for the next card".

**8.11 Money, wrapped**
- "$460 under" 44/800.
- **Receipt**: paper `#fffdf6`, radius 4, −2°, inset 36, y 166, with a **scalloped bottom** (a mask of 6 px circles every 16 px). Padding 20 20 26, `#2a2620`.
  - Heading 14/700 +.14em; meta 10.5 `#6e6658`.
  - Dashed 1.5 `#cfc6b2` rules; lines 12.5; TOTAL 16/700.
- **Round stamp** 110 at −14°: rings 3 / gap / 8.5 `#2e9a74`, "BALANCES / PAID / IN FULL" in 9/800 and 24/800. Tapping it opens Balances (7.16), read-only.
- A wallet sticker 70.

**8.13 Cover**
- Presenter row: 32 `#ffd84a` Tokek, "Tokek presents" 14/600, "Bali, the recap · ♪ gamelan lo-fi" 11.5.
- Collage:
  - a polaroid 228×270, padding 8 8 36, at −5°, with a Borel 13 caption;
  - a sticky note `#d8f3ff` (**OFF-TOKEN**) with Borel 15 `#2f5fc4` at 9° and tape;
  - a second photo 150×180, radius 14, at 8°;
  - place tags in sky and pink;
  - stickers: sun 44, plane 62, camera 48, and the gecko 140 cheer **floating** (4600 ms).
- "Bali" 96/800 −0.06 (**OFF-TOKEN**), with tags "8 days", "6 of you", "1 volcano".

**8.14 Postcard** (all 8 segments done)
- "Last card" / "Send it home" 30/700.
- **Back**: 320×210, `#fffdf6`, radius 10, at 4°.
  - A `#e3dccb` divider and a Borel 13.5 message.
  - A 52×62 stamp box (2 px dashed `#d6ccb6`) holding the rare gecko 46.
  - A 58 postmark (rings `#e07a2a`, "DPS", −14°) and three address lines.
- **Front**: 320×216, an 8 white frame, radius 12, at −4°, with Borel 15 "Greetings from" and 64/800 "BALI".
- A volcano sticker 58.
- Segmented 42 / r 21 (**OFF-TOKEN**): Postcard / Story 9:16 / Poster.
- Ink pill "Send to the crew". A white 50 / r 25 "Mail a real one to each of you" with a "Pass+" sun tag (r 7, 11/800).

### 8.12 Trip journal: one photo pocket per day

- "Trip journal" 30/700 (**OFF-TOKEN**). Glass search 44 and ink `+` 40 on the right.
- Segmented at y 116: "Best · 24" / "All · 312" / "By person".
- **Tokek note bar**: inset 16, glass .66 blur 20, radius 22, padding 8 14 8 8. A 36 `#fff3c4` avatar (point pose) and 13/1.38 `#3d404c` text with "Tokek" in bold.
- **Pockets**: 2 columns, gaps 22 / 12. Each is a 150-high stack:
  - two polaroids 84×66 (padding 3, radius 10, −7° and 6°);
  - a white pocket from y 40 (radius 22) with a −4° tag at 11/800, a 44 sticker (top −14, right 6, 10°), and a 22 avatar stack (overlap −7).
  - Below it, the title 14.5/600 ("Day 4 · Batur sunrise") and count 12 muted.
- Tab bar with Trips active.

### 8.15 A year later: the memory resurfaces

- Full photo with a gradient. Chip "One year ago today" (clear glass, 32 high) and ✕ 40 on the right.
- A sun round stamp 96 at 12°: "BATUR / 06:02 / 15.10.26".
- "Batur, a year on" 40/800 white; body 15 at .92.
- **Reactions**: glass `rgba(255,255,255,.2)` blur 16, 32 high, padding 0 10 0 4, radius 16, 12.5/600, 24 avatars: "♥ 2", "“again??”", "+1".
- A **white** pill 56 "Plan a reunion" (the inverted primary on a photo) opens a new poll in the crew (4.01) with Bali prefilled. "Share the memory" (white at .85) opens the system share. ✕ goes Home.

## 4. Components

### (a) Foundations components used

Glass back circle 44; glass label pill; ✕ glass; segmented (h 40 / thumb r 16); Ink pill 56; text button 15/600 muted; small ink pill (36–42 here); control pill; sticker tags (rotated, 2.5 white border); round and rectangular stamps; crew avatar and stack; status tags h 24 (booked, vote-open, maybe); critter tiers ● ◆ ★ ✦ with "?" for locked; guide note tinted by speaker; Sheet glass (5.05); stat-like recap tiles; photo frames; guide composer; tab bar (Tabs rendering); offline (chip variant); toasts (encounter reminder).

### (b) New components

| Component | Metrics and states | Reused by |
|---|---|---|
| `ChatHeader` | Gradient fade 112, back 44, centred 16.5/700 + 11.5 subtitle, right "Map" glass pill. Subtitle shows count / typing / read-only / NO SIGNAL chip | Part 3 crew, Part 6 crew map |
| `MessageBubble` | Theirs / yours / guide; radius 20 with a 6 tail on the last of a run; padding 9 13; 15/1.38; max 270 (300 for the group); reply quote; mention colour; dark variant | Guide chat, Part 3 previews |
| `DeliveryLine` | Sent / waiting (.55) / failed (pink ring + Retry / Delete) / "Read by N" | Guide (Answered / Read / waits) |
| `StickerMessage` | Sticker 96–112, ±5–6°, caption tag, reactions; long-press lift to 150 | Part 3 previews, Part 9 sharing |
| `CritterReactionChip`, `ReactionBar` | Chip 24; bar 54 glass with 44 doodle cells, or 46 white critter cells; + more | 8.15 reactions |
| `MessageContextMenu` | Menu 250 wide, glass, rows 48, separator band, destructive row; blur + scrim backdrop; preview lifted to 1.03 | Long-press lists (Part 4) |
| `ChatComposer` | Bar 92 (62 docked); `+` 38; field 40 / r 20; gecko toggle 32 at rest / active; mic 38 ⇄ send; placeholder and lock states | — |
| `StickerTray` | Height = keyboard height (392); tab row 34; set label; 4-column grid of 76 tiles with 68 stickers; silhouettes; Recent; count | 8.A "save to tray" |
| `SystemPill`, `OfflineMarker`, `SettledStrip`, `TypingBubble`, `NewMessagesPill`, `UnknownCard` | §3 5.12 | Guide (typing) |
| Chat cards | `PollCard` (open / closed), `GuideOfferCard` (open / in / full), `OfferPlaceCard` + `SlotRow`, `ExpenseCard` (new / paid), `ChangesetCard` (four states + Undo), `ProposalCard` (open / boarded), `MeetupCard` (live / done), `SupplierOrderCard` (held / confirmed / declined + 3-step bar), `BoostCard`, `PhotoGrid`, `VoiceNote` | Part 4 (changeset, proposal, poll), Part 6 (meetup, rides), Part 7 (expense) |
| `QuotaChip` | 30 high: "N left" sun / "30 of 30 today" pink / NO SIGNAL tangerine | Part 9 Pass+ |
| `StarterCardGrid`, `QuickChipRow` | 2×2 cards 112 high / r 24 / doodle 34; chips 38 high / r 19 / doodle 26, scrolling sideways with a fade | Part 2, Part 6 |
| `GuidePlanCard` | Borel intro, struck-old / new rows with ±6° stickers, cost row, two buttons | Part 4 |
| `WorkingStepsCard`, `QueuedQuestionCard`, `LimitCard`, `OfflineToolsCard` | §3 5.17–5.20 | Part 6 offline and disruption, Part 9 |
| `VoiceStage`, `MenuLabelSticker`, `PhraseShowMode`, `DriverPhraseCard`, `DietChipGroup` | §3 5.15–5.24 | Part 6 (6.E), Part 9 |
| Critters | `TierLabel`, `LockedSilhouette` (mask colour + "?" 14–20), `HereNowCard`, `LegendaryBanner`, `SetCard` (5 columns), `CountryRow`, `FormGrid`, `HoldRing` (108 conic), `EncounterStage`, `CelebrationRays` (700 conic, spinning), `Confetti` (Skia), `XPCard`, `QuestRow`, `MonthStrip`, `LegendRow` | Part 6 encounter entry, Part 9 pass |
| Memories | `RecapTile`, `StoryProgress` (8 × 3 px), `ReceiptCard` (scalloped mask), `RoundStamp`, `PhotoPocket`, `Polaroid`, `StickyNote`, `PostcardPair`, `GlassReactionChip` | Part 7 receipt, Part 9 stamps |

### (c) Critter renderer: can the current one draw the new doodle style?

**Yes.**
- `$Z/doodles.js`, `critters-data.js`, `critters-draw-1.js` and `critters-draw-2.js` are **byte-identical** to `$R/design/*.js` (`diff -q`).
- `@cp/critter-art` (`$R/packages/critter-art`) ports them faithfully, with fidelity tests that run the original `design/doodles.js` (`src/core/design-doodle-kit-reference.ts`).

| Design attribute | Current renderer | Status |
|---|---|---|
| `pose` idle / wave / cheer / think / point / sleep (+ egg `crack`) | `Pose` in `src/core/model.ts` (+ `tilt` / `hop`); `src/kinds/guides/gecko.ts` matches the design line for line | supported |
| `sticker` die-cut edge (width 5, pad +4, shadow `rgba(0,0,0,.32)` blur 5 dy 2.5) | `StickerSpec` + `stickerOutline`, shadowed sub-layer in `backends/skia/render.ts` | supported. The edge colour differs: design `#ffffff`, app `paper.base` `#f4efe4` (§8 Q13) |
| `seed` | `RenderSpec.seed`; `Sticker` default 7 = design default | supported |
| `fill` / `spot` (+ `accent`, `belly`) | `FormSpec.palette` `f` / `dk` / `bl` / `accent` | supported, but only through a `FormSpec`; `Sticker` has no direct props |
| `locked="#hex"` | `variant: 'mask'` + `maskColor` (`ui/sticker/SilhouetteSlot.tsx`) | supported |
| `blink`, draw-on (`anim`: 1500 ms creatures / 700 ms icons, ease-in-out quad) | `closedEyes`, `drawProgress` | supported |
| Sizes up to 220 | Buckets `[24, 36, 48, 60, 96, 150, 232, 300]` (`ui/sticker/bucket.ts`) | covered |

What changes is data and tokens, not the renderer:
1. **Epic Tokek palette**: fill `#ff8fbf`, spot `#d6337f`, cheer pose (Foundations tiers and 8.09). `src/forms/designed.ts` has `#ff9a4d` / `#c4623e`.
2. **Locked silhouettes go light.** `src/forms/tier-palette.ts` `TIER_COLORS.lockedMask` is dark `#3a3466`. Retune it and the `SilhouetteSlot` callers. The "?" is a UI overlay.

   | Use | Colour |
   |---|---|
   | Unfound / epic on light | `#e3e4ea` |
   | Legendary on light | `#efe2b4` |
   | Legendary on ink | `#6b5a24` |
   | Ghost (8.06) | `#ffffff` at 50% |

3. **Tier edge rings** (`EDGE_RING_STYLES`: epic pink 2 pt, legendary gold 3 pt) appear nowhere in Parts 1, 5 or 8; the epic form wears the plain white edge (§8 Q14).
4. Reactions, tray tabs and avatars draw the critter with no edge as a cropped, bottom-aligned bust. Callers handle this with a clipping `View`.

## 5. Motion and transition inventory

Springs: Snappy (.30 / .86), Smooth (.45 / 1.0), Lively (.50 / .68). Reduce Motion: 150 ms cross-fades, doodles drawn finished, loops off.

| Trigger | What moves | Properties | Spring / timing | Evidence | Native or custom |
|---|---|---|---|---|---|
| Open chat | Page | push | native stack | — | native |
| Keyboard open / close | Composer, list inset | follows the keyboard frame; list keeps its bottom offset | interactive | derived (§3) | Reanimated `useAnimatedKeyboard` (exists) |
| Sticker button | Keyboard ⇄ tray | tray in at keyboard height; gecko button fills ink | Smooth | 5.08 | custom |
| Send / receive a sticker | New sticker | "little pop": scale .6 → 1, rotation 0 → ±6°, soft haptic on receive | **Lively** | not in the design (5.09 static; `$SP/film/05-lane/strip8.png` diff = 0) | custom |
| Long-press a message | Backdrop, bubble, bar, menu | blur 0 → 14 + scrim; bubble 1 → 1.03 with a deeper shadow; bar and menu scale and fade in from the bubble | Snappy in, Smooth out | 5.04 | custom (custom bar, so not `UIContextMenu`) |
| Long-press a sticker | Sticker | 96 → 150 in place; light frost | Lively | 5.09 | custom |
| React | Chip | appears or bumps, scale .8 → 1 | Snappy | — | custom |
| Poll vote | Fill, avatar | width; avatar joins the stack | Snappy | 5.01 | custom |
| Offer claim | Button → tag | "I'm in" morphs into "You're in · 1 left" | Snappy | board | custom |
| Changeset hits 3 yeses | Card state | cross-fade to CHANGED | 150 ms fade | board | custom |
| Waiting → sent | Row | opacity .55 → 1 | Smooth | 5.03 | custom |
| Typing | Dots | .35 / .6 / .85 wave | ~1.2 s loop | 5.12 | custom |
| New messages pill | Pill | rises from the composer; tap scrolls to the first unread | Smooth | 5.12 | custom |
| Guide gecko (5.13) | Gecko | bob ty 0 → −6 → 0 over 2400 ms in-out; draw-on 1500 ms | loop | `$SP/film/05-lane/combo.png` (top) | Reanimated + Skia `drawProgress` |
| Voice (5.15) | Rings, gecko | two rings scale .6 → 1.5, opacity .8 → 0, ease-out 2200 ms, second delayed 1100; bob 2400 | loop | `combo.png` (bottom) | custom |
| Working step (5.18) | Dot | pulse scale 1 → 1.07, 1600 ms | loop | `$SP/film/05-lane/strip17.png` | custom |
| Guide answer | Text, card | word reveal; plan card rises 16 → 0 | Smooth | current app | custom (exists) |
| Sheets (5.05, 5.07) | Sheet | up from the bottom | Smooth | — | native form sheet where possible |
| Show mode (5.23) | Cover, brightness | fade / scale; brightness to max | Smooth | — | native modal + brightness |
| Critter detail (8.02) | Sticker | float ty 0 → −9, r −2° → 2°, 4200 ms | loop | HTML | custom |
| Dex → detail | Sticker | shared element | Smooth (1.05 zoom) | proposed | custom |
| Encounter (8.03) | Sticker, ring | hop over 2800 ms: sy .9 at 10%, ty −14 / sy 1.05 at 22%, sy .94 at 34%, rest at 42%; ping ellipse scale .6 → 1.5, opacity .8 → 0 over 2400 ms | loop | `$SP/film/08-lane/combo.png` (top; also shows a blink) | custom |
| Hold to befriend | Ring, haptics | conic fill tracks the hold; ticks | release springs back (Smooth) | 8.03 | custom (Skia sweep) |
| Befriended (8.04) | Rays, confetti, sticker, stamp | rays 360° / 24 s linear; 46 confetti; hop; **stamp lands** | Lively (1.07 stamp) | `$SP/film/08-lane/combo.png` (bottom) | custom (Skia confetti) |
| Hatch (8.05) | Rays, confetti, eggs, sticker | rays 26 s; 40 confetti; egg halves; hop 2400 | Lively | HTML | custom |
| Story (8.10–8.14) | Progress, cards | fill over 5 s; cross-fade between cards; swipe down closes | linear; Smooth close | HTML | custom (exists) |
| Recap stickers | Car, gecko | float 4200 / 4600 ms | loop | HTML | custom |
| Blink | Eyes | closed for 150 ms every 2.6–6.2 s | — | doodles.js | exists |

## 6. Native platform surfaces

No widget, Live Activity or lock-screen design appears in these parts. What they imply:

- **Chat pushes**: `targets/notification-service` already sets sender identity and avatar (communication notifications).
  - Stickers need a body, for example "Jordan sent a sticker: YES PLS", with the PNG attached (§8 Q15).
  - Critter reactions need copy, for example "Maya reacted with Tokek".
- **Guide "Ping me"** (5.18) and the **midnight answer** (5.20, "lets you know quietly"): iOS `passive` interruption level, Android low-importance channel. These are new notification kinds.
- **Encounter reminder** (8.06) and **legendary reminders** (8.08): local notifications, which exist (`features/critters/encounter/quiet-reminder.ts`, `features/critters/legendary/legendary-view.tsx`).
- **A year later** (8.15): a push deep link to `memory/[memoryId]` (exists).
- **Mic permission**: Open Settings (`cp-permissions`). **Brightness** (5.23): `use-full-brightness.ts`; Android uses the window brightness attribute.
- **System share** (8.09, 8.15, postcard), **copy sticker as image** (pasteboard image API), and the **store page** for Update (exists).

## 7. Logic and backend gaps (the design needs data the app lacks)

1. **`sticker` message kind**: domain `MESSAGE_TYPES` (`packages/domain/src/chat/message-types.ts`), API `services/api/src/commands/chat/send-message.ts`, sync schema, mobile PowerSync schema regen. Payload `{critterId, formId?, pose, caption}`. Evidence: board text "Not in MESSAGE_TYPES yet: needs adding".
2. **Critter reactions**: `message_reactions.emoji` must be pictographic (`isReactionEmoji`, `packages/domain/src/chat/validation.ts`). Allow `critter:<id>` or add a column. The 5.04 doodle set can stay emoji-backed (❤️ ⭐ 🔥 ✅ ✨) and be drawn as doodles on the client. Evidence: 5.01, 5.09.
3. **"Read by N"**: read markers are only used for unread counts. Members need per-message read counts in sync. Evidence: 5.01, 5.08.
4. **Pin to the trip / Add to Day N** from a message: new commands (5.04).
5. **Ask to rejoin / Remove chat** for former members: a rejoin request to the organiser plus a local hide (5.06).
6. **Settled strip**: emit a system message when the last payment lands. Today it is only a UI variant in `ui/chat/ChatRichCard.tsx` (5.12).
7. **Guide working steps**: the server streams labelled steps (done / active / pending), plus "ping me when done" (push) and Stop. Today `features/guide/chat/data/turn-state.ts` has only a filler line (5.18).
8. **Edit a queued question** before midnight (5.20).
9. **Offline phrasebook and emergency numbers** per destination, "saved on this phone" (5.17). Check the offline pack.
10. **"Too big for this signal"** as a failure reason for media, decided on the client from connection type and size (5.03).
11. **Data and token changes**: the epic Tokek palette and the locked silhouette colours (§4c).

Front-end only: the `meetup` and `supplier_order` cards (the kinds exist), starter prompts, the counted New messages pill, the "N left" quota chip, show-mode brightness, and "Share with the crew" posting the befriended sticker (which needs gap 1).

## 8. Open questions

1. **Two chat chromes.**
   - 5.01-style: gradient header, "Map" label pill, composer 92 with `+` 38, gecko toggle and a bare mic.
   - 5.02-style: blur bar with a hairline, pin icon, composer 96 with a control `+` and the mic inside the field.

   Recommendation: 5.01-style for every crew-chat state.
2. **Send affordance.** Composer A shows no send button. Assume the mic morphs into an ink send button when there is text (iMessage-like), and return inserts a newline.
3. **Tokek's colours.**
   - Avatar: `#fff3c4` in the crew chat (5.01, 5.10), `#ffd84a` in the guide (5.14, 5.16, 5.20).
   - Bubble: white on 5.02 and 5.17, `#fff6c9` on 5.01.

   Suggestion: tinted bubble in the crew chat and white in its own thread; avatar `#fff3c4` in the crew chat and `#ffd84a` in the guide.
4. **Offline**: a header chip (5.03, 5.17) or the Foundations top ink pill?
5. **Sheets.** 5.05 uses ✕ only, no Cancel + verb. 5.07 is a solid `#f5f5f7` floating sheet. Align both to Sheet glass r 46?
6. **Sticker captions** per pose ("hi!", "YES PLS", "NOOO"…): fixed, editable, or per set? Localised?
7. **Tray silhouettes**: `locked=true` renders black. Use `#e3e4ea` as in 8.01?
8. **Guide header**: a chevron on 5.13, 5.17 and 5.18, but ✕ on 5.14 and 5.19–5.21, all on a `(modal)` route. Pick one.
9. **5.22**: does Save dock above the keyboard or hide while typing?
10. **✕ on the right** on 5.23, 8.06, 8.13, 8.14 and 8.15, while Foundations puts ✕ top-left. Also, 5.23 is dark while Foundations says phrase cards stay light. Intentional for photo and story screens?
11. **No exit drawn** on 8.04, 8.05, 8.09, 8.10 and 8.11. Add ✕ or back?
12. **8.07 Crew quests**: a Root under Pass (tab bar, no back) or a Push from the trip?
13. **Sticker edge** `#ffffff` (design, Foundations) versus the app's `paper.base` `#f4efe4`. Switch to white?
14. **Tier edge rings**: drop them?
15. **Sticker push** body and image attachment.
16. **Off-token type**: chat headers 16.5/700 and 17/600 (versus `navTitle` 19/700); display sizes 20, 24, 30, 36/800, 38/800, 40, 44, 56, 64, 96; Borel at 12, 13, 13.5, 14 and 16 (token 15).
17. **Off-token colours**:
    - Borel speaker colours `#6b5a24` (Tokek), `#8a4a12` (Pon) and `#1f6b4c` (field notes). Make them guide tokens?
    - `#ffe9d6`, `#fff8dc`, `#d8f3ff`, `#b9bbc4` and `#d6d7dd`.
    - Report `#e0468e` versus destructive `#d6337f`.
    - `#e9eaee` as a segmented track.
18. **Off-token geometry**: photo buttons `rgba(255,255,255,.2)` blur 16 versus Clear glass `rgba(18,20,28,.30)` blur 24 (5.16, 8.02, 8.03, 8.06, 8.15); fields 46 / r 16 versus 52 / r 18; buttons 54 versus 56; route pill r 12; segmented 42 / r 21. Nav glass at .62 / blur 18 matches the Foundations nav-button variant.
19. **Stale labels** in the design file: the inline frames print 5.09, 5.10, 5.11 and 5.19, which should read 5.14, 5.15, 5.16 and 5.24.

```
Status: DONE_WITH_CONCERNS
Summary: Build spec for 39 phones (5.01–5.24 with the 5.D board of every chat card state, and 8.01–8.15), covering layout, tokens, taps, composer, keyboard and tray behaviour, motion with filmstrip evidence, and the critter renderer check. The current @cp/critter-art already draws the new doodle style (its design sources are byte-identical); only the epic palette, the locked silhouette colours and the edge rings change.
Concerns/Blockers: The design draws two chat chromes and shows neither the keyboard open nor the "sticker lands" motion, so §3 and §5 derive those. Stickers in chat and critter reactions need backend work (§7). The header and exit inconsistencies need a founder call (§8 Q1, Q8, Q10–Q12).
```
