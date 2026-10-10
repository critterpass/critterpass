# Design spec: Part 5 "Chat and Guide" and Part 8 "Critters and Memories"

Lane: design analysis, 10 Oct 2026. Inputs: `$Z/CritterPass 05 Chat and Guide.dc.html`, `$Z/CritterPass 08 Critters and Memories.dc.html`, `$Z/doodles.js`, `$Z/critters-*.js`, `$Z/ref/chat-parts.js`, text extracts, shots `$SP/shots/05|08/`, filmstrips under `$SP/film/05-lane/` and `$SP/film/08-lane/`. Current app `$R` = `/Users/quocs/Projects/critterpass-worktrees/deploy`. Token names follow `plans/261010-1701-premium-redesign/foundations-spec.md` (type: `navTitle`, `largeTitle`, `emptyTitle`, `stat`…; shadows: `card`, `raised`, `float`, `sticker`, `ink`, `segment.thumb`; materials: Clear / Regular / Sheet glass, Ink).

Numbering note: four Part 5 frames are inline and print stale labels. Their `data-screen-label` gives the real codes: **5.14** Guide plan card (prints "5.09", shot `5.09-13.png`), **5.15** Voice (prints "5.10", shot `5.10-14.png`), **5.16** Point and ask (prints "5.11", shot `5.11-15.png`), **5.24** Getting around (prints "5.19", shot `5.19-23.png`). The rest of this report uses the real codes.

## 1. Summary

- **39 phones**: 24 in Part 5 (5.01–5.24) plus the 5.D board of every chat card (12 message types + sticker, 27 card states), and 15 in Part 8 (8.01–8.15).
- **What is new compared with the current app.** Most of the logic exists. The redesign mostly changes the look, plus these new pieces:
  - **Critter stickers as chat messages** and the sticker tray (5.08). The board says so itself: "Not in MESSAGE_TYPES yet: needs adding".
  - **Critter and doodle reactions.** They replace the current emoji quick set 👍❤️😂😮🔥🙏.
  - "Read by N", "Pin to the trip" / "Add to Day N", "Ask to rejoin" / "Remove chat", and starter prompts in an empty crew chat.
  - Cards for `meetup` and `supplier_order` (the kinds exist but fall back to the unknown card today).
  - A "settled" strip and a counted "3 New messages ↓" pill.
  - In the guide: a working-steps card with Ping me / Stop, "Ask it differently", an offline-tools card, editing a queued question, and a quota chip that counts down ("27 left").
  - Part 8 is a restyle of existing screens. The only data change is the epic Tokek palette and lighter locked silhouettes (§4c).
- **Hardest to build well**:
  1. The chat keyboard/tray system. The sticker tray swaps with the keyboard at keyboard height, the composer rides it, the list stays pinned to the bottom, the header stays, and dismissal is interactive (§3 5.01/5.08).
  2. Stickers end to end: the new message kind and its sync, critter reactions in the database, the tray built from the Critterdex with locked silhouettes, the lift on long-press, and a "sticker lands" motion the design leaves unspecified (§5).
  3. Long-press on a message: a blurred, dimmed backdrop, the bubble lifted to 1.03, a custom reaction bar and a glass menu. This is a custom Reanimated overlay, not a native `UIContextMenu`.
  4. The guide's working state (5.18). It needs labelled tool steps streamed from the server; today there is only a filler line.
  5. The celebration scenes (8.03–8.05): Skia stickers at 170–220 pt with hop, ping, spinning rays, confetti and the "BEFRIENDED!" stamp, on the Lively spring, plus hold-to-befriend.

## 2. Screen table

Routes are relative to `$R/apps/mobile/src/app/`.

| code | title | screen type | header left / right | primary action | current route file(s) | logic |
|---|---|---|---|---|---|---|
| 5.01 | Crew chat | Push | glass back 44 / glass "Map" pill 44 | Send (composer) | `crew/[crewId]/chat/index.tsx` | partial (no sticker, critter reactions or read receipts) |
| 5.02 | Brand new chat | Push | back / glass pin 44 | Starter prompt | same | partial (no starter prompts) |
| 5.03 | Offline, queue, bounced | Push | back / pin; NO SIGNAL chip under title | Retry | same | exists ("too big for this signal" reason is new) |
| 5.04 | Long-press, react, act | Overlay on Push | n/a (blurred) | React | same | partial (no Pin / Add to day; reaction set differs) |
| 5.05 | Mic is off | Sheet (glass, ✕ right) | — / ✕ | Open Settings | same (voice recorder) | exists (as a card) |
| 5.06 | You left, read-only | Push | back / pin | Ask to rejoin | same | partial (no rejoin / remove) |
| 5.07 | Group offer claim | Sheet over Push | back / — | Count me in | same + guide offer | partial (inline confirm, no sheet, no slot row) |
| 5.08 | Sticker tray | Push + input tray | back / Map | Tap sticker = send | same | missing |
| 5.09 | Sticker long-press | Overlay on Push | n/a (blurred) | React with a critter | same | missing |
| 5.10 | Plan cards (changeset, meetup) | Push | back / Map | Yes, swap | same | partial (meetup card missing) |
| 5.11 | Photo, voice, ride, boost | Push | back / Map | Message Made | same | partial (supplier_order card missing) |
| 5.12 | Housekeeping | Push | back / Map | New messages ↓ | same | partial (settled strip not a kind, pill has no count) |
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
| 8.04 | Befriended | Full screen celebrate | none | Add to your pass | same (result view) | exists ("Share" only opens chat) |
| 8.05 | Egg hatch | Full screen celebrate | none | Say hi | `(modal)/hatch/[tripId].tsx` | exists |
| 8.06 | It wandered off | Full screen | chip / ✕ (right) | Remind me at 07:00 | `(trip)/encounter/[id].tsx` | exists |
| 8.07 | Crew quests | Root-styled (tab bar, no back) | — / — | A quest | `(trip)/quests/[tripId].tsx` | exists |
| 8.08 | Legendary calendar | Push | back / ink "Remind me" | Remind me | `critters/legendaries.tsx` | exists |
| 8.09 | Recap | none shown | — / — | Share recap | `(trip)/recap/[tripId]/index.tsx` | exists |
| 8.10 | Story: route | Full-screen story | none shown | Tap = next | `(trip)/recap/[tripId]/story.tsx` | exists |
| 8.11 | Story: money | Full-screen story | none shown | Tap = next | same | exists |
| 8.12 | Trip journal | Root-styled (Trips tab) | — / glass search + ink `+` | A day pocket | `(trip)/album/[tripId]/index.tsx` | exists |
| 8.13 | Story: cover | Full-screen story | presenter / ✕ 36 | Tap to start | `(trip)/recap/[tripId]/story.tsx` | exists |
| 8.14 | Postcard | Story's last card | — / ✕ 36 | Send to the crew | `(trip)/recap/[tripId]/postcard.tsx` | exists |
| 8.15 | A year later | Full screen (dark photo) | chip / ✕ (right) | Plan a reunion | `memory/[memoryId].tsx` | exists |

Tab bar: Part 5 shows none (chat is a Push, the guide is a modal). Part 8 uses the `Tabs.dc.html` rendering on 8.01 (Pass active), 8.07 (imported, Pass active) and 8.12 (Trips active): a glass pill with Tokek raised 56 in the middle and the active tab as an ink pill with its label. Phone 1.04's native bar does not appear in these parts.

## 3. Per-screen spec

### Shared chat anatomy (5.01–5.12)

The design draws two chat chromes. The 5.01 family (5.01, 5.08–5.12) is the hero, so build that one (see §8 Q1).

**Header, 5.01 family**
- Background: gradient fade, height 112, `linear-gradient(180deg, #f5f5f7 62%, transparent)`. No blur, z 8.
- Controls row: top 56, inset 16.
- Left: glass back circle 44. Regular glass nav variant (`.62`, blur 18, sat 1.8, top inset white .95, .5 white .6 ring, .5 ink .07 ring, `0 8 20 −6 .16`), chevron 18.
- Centre: title 16.5/700, subtitle 11.5 muted ("6 people · Tokek's in here", or "6 people · Rin is typing" while someone types). **OFF-TOKEN**: `navTitle` is 19/700 + 12.
- Right: glass pill 44 high, padding 0 14, 14/600, pin icon 14, label "Map".

**Header, 5.02 family** (5.02–5.06)
- Background: blur bar height 112, `rgba(245,245,247,.78)`, blur 24, sat 1.8, bottom hairline .5 `rgba(28,29,36,.08)`.
- Controls row: top 58, inset 20.
- Title 17/600 with subtitle 12 muted. **OFF-TOKEN**, as above.
- Right: glass circle 44 with a pin icon and no label.

**Message list**
- Absolute from top 118 to the composer top − 8. Insets 14 (5.01) or 16 (5.03).
- Content is justified to the end: messages stack from the bottom.
- Gap between items 10 (5.01) or 12 (5.03).
- No date headers are drawn. The guide uses "Today 14:02" 12 muted, centred (5.14).

**Bubble: theirs**
- White, radius 20 20 20 **6**, padding 9 13, `body` 15 / line-height 1.38, ring `0 0 0 .5 rgba(20,22,40,.05)`.
- Avatar 28 in the crew colour, 2 px ground border, initial 11/700 `#17142a`, aligned to the bottom of the bubble, gap 8.
- Sender name 11.5/600 muted, padding-left 36 (so it lines up with the bubble), 3 px above.
- Group max width 300. The 5.03 family drops the avatar: name padding 0 12, bubble max 258, padding 9 14.

**Bubble: yours**
- Ink `#1c1d24`, white text, radius 20 20 **6** 20, max width 270 (258 in the 5.03 family).
- Status line under it, gap 4, right-aligned, 11/600 `#9a9daa`: "Read by 4".
- Reply quote inside the bubble:
  - left bar 3 px in the quoted person's crew colour (`#ffd84a` for Maya), padding 2 0 2 8, margin-bottom 6;
  - 12.5 `rgba(255,255,255,.72)`, with the name bold in the crew colour.
- `@tokek` mention: `#ffd84a`, weight 600 (5.07).

**Grouping**
- The name and avatar show once per run; the tail corner (6) sits on the last bubble of the run.
- The design shows runs of one only. Keep the current run rule in `features/crew/chat/components/timeline-rows.ts`: a new run starts on a day change, a system row, or after 5 minutes.

**Tokek in the crew chat (guide_offer / guide text)**
- Avatar 28 circle `#fff3c4` with the gecko 28 aligned to the bottom (cropped bust).
- Bubble 282 wide, radius 22, `#fff6c9` (the Tokek tint), padding 12 14.
- Name "Tokek" in Borel 12 `#8a6a0c`.
- Body 14.5 / 1.4, `#3d3210`.
- Actions row: margin-top 10, gap 8.

**Reactions**
- A row of chips under the bubble or sticker: gap 4, margin-top −2.
- Chip: height 24, padding 0 7 0 3, radius 12, white, text `#3d404c` 11.5/700, ring .5 `.08`.
- The critter icon sits in a 20 box, aligned to the bottom and cropped; the count follows after a 3 px gap.

**Sticker message (new)**
- No bubble. The sticker is `size` 112 (5.01) or 96 (5.09, board), with the white edge, rotated −6° or +5°.
- Caption tag:
  - centred at bottom 4, rotated by about −1.6 × the sticker's angle (9.6° for −6°, −8° for +5°);
  - ink, white 800 12/1, padding 5 9, radius 9, 2.5 white border, shadow `0 4 10 rgba(20,22,40,.25)`.
- The caption comes with the sticker: "YES PLS" for cheer, "NOOO" for sleep. The tray names are "hi!", "yes pls", "hmm", "omw", "zzz" (§8 Q6).

**Delivery states (5.03)**

| State | Bubble | Status line |
|---|---|---|
| Sent | normal | "Sent 4:10" 11.5/600 `#1f7a55` with a check 12 |
| Waiting | whole row at opacity .55 | clock 12 + "Waiting for signal" muted, with " · 2.4 MB" for media |
| Failed | white with a 1.5 `#ff5fa8` ring, ink text | `#b0306b` "Didn't send · too big for this signal" |

For a failed send, the controls sit right-aligned below it:
- "Retry": ink pill 32 high, padding 0 13, radius 16, 13.5/600, retry icon 13.
- "Delete": control fill `rgba(118,118,128,.12)`.

The text is kept (Foundations: nothing typed is lost).

**System rows**
- Pill centred, padding 4 10 4 4, radius 14, `rgba(118,118,128,.1)`, 12 `#3d404c`, with a 20 avatar (8/700). Copy: "Rin joined the crew", "Maya renamed…", "Dev left the crew".
- Offline marker: "You went offline at 4:12 PM" 12/600 `#a8501a` on `#fff1e6`, padding 5 12, radius 12.
- Left marker: "You left the crew · Oct 2" 12/600 muted on `rgba(118,118,128,.1)`.

### Composer and keyboard (5.01, 5.08)

**Composer A (crew chat, use this)**
- Bar: bottom 0, height 92 (row plus home-indicator area), `rgba(245,245,247,.9)`, blur 20, top hairline `0 −.5 0 .08`.
- Row: padding 10 12 0, gap 8.
  - `+`: 38 white circle, ring .5 `.08`, icon 16.
  - Field: flex, height 40, radius 20, white, ring .5 `.08`, padding 0 6 0 14.
  - Placeholder "Message, or @tokek" 15 `#9a9daa`.
  - Sticker button inside the field on the right: a **32 gecko circle**. Background `#fff3c4` at rest, **ink `#1c1d24` while the tray is open**.
  - Mic: 38 transparent, icon 18.
- No send button is drawn. Assume the mic swaps for an ink send circle once text exists (§8 Q2).

**Composer B (5.02–5.04, 5.13, 5.17, 5.18; legacy variant, §8 Q1)**
- Bar: height 96, `rgba(248,248,250,.8)`, blur 24, sat 1.8, top hairline.
- `+`: 40 control-fill circle.
- Field: 40 high, radius 20, white, inset .5 `rgba(28,29,36,.14)`, placeholder 15.5.
- Mic: 30 inside the field; ink-filled on 5.13.

**Composer C (guide, 5.14, 5.16, 5.19, 5.20)** follows the Foundations composer:
- Floating white pill, 56 high, radius 28, left/right 16, bottom 30, padding 0 6 0 8, gap 10, shadow `0 1 2 .06, 0 10 28 .1`.
- `+`: 40 `#f1f1f4`.
- Placeholder 15 ("Ask, or hold to talk").
- Mic icon 22, then the send button: 44 ink circle with an up arrow.

**Composer states**

| State | Placeholder or look |
|---|---|
| Brand-new crew | "Say hi to the crew" |
| Offline | "Sends when you're back" |
| Guide offline | "Questions wait for signal" |
| Guide slow answer | "Ask something else meanwhile" |
| Guide queued | "Ask now, Tokek answers at midnight"; no `+`; send 44 at `#e9eaee` |
| Locked (5.19) | 56 pill `#e9eaee`, lock 16, "Pon is back in 7h 12m" 15 `#9a9daa`; no input |
| Read-only (5.06) | the composer is replaced by a bar (see 5.06) |

**Sticker tray open (5.08)**
- The tray replaces the keyboard. It is a white sheet 392 high from the bottom: radius 28 28 0 0, shadow `0 −10 30 −10 .2`, padding-top 10.
- The composer row sits on top of it at bottom 392. While docked it is 62 high: `rgba(245,245,247,.9)`, blur 20, padding 10 12, so it loses its home-indicator padding.
- The list bottom moves above the composer (the design has bottom 500; use composer top − 8).
- The header stays.

**Keyboard open** is not drawn in Part 5. Derived from the tray state and the Foundations rules:
- The composer bar docks above the keyboard at 62 high.
- The list keeps its last message pinned just above the composer: it scrolls with the keyboard frame, with no jump.
- The header and gradient stay fixed.
- Dragging the list down dismisses the keyboard interactively and the composer follows the finger.
- Tapping the sticker button swaps the keyboard for the tray at the same height with no layout jump (the tray height = the last keyboard height, 392 in the design). Tapping it again brings the keyboard back; swiping the tray down closes it.
- Return key: the field is multi-line, so return inserts a newline and sending happens from the send button (§8 Q2).

The current app already has most of this:
- `ui/layout/KeyboardFooter.tsx` follows the keyboard with `useAnimatedKeyboard`.
- `features/crew/chat/components/message-list.tsx` uses FlashList 2 with `maintainVisibleContentPosition.startRenderingFromBottom` and `keyboardDismissMode="interactive"`.

What is missing is the tray-as-keyboard swap.

### 5.01 Crew chat (polls, offers, stickers, splits inline)

Layout top to bottom: header (above), then the list:

1. **Poll card.** Width 282, radius 22, `card` shadow, padding 12 14.
   - Title 16/700 "Spa on day 3?", meta 11.5 muted "Maya · 4 of 6".
   - Option rows: gap 6, margin-top 10, each 38 high, radius 12 on `#f1f1f4`.
   - The fill bar behind each row: `#ffd84a` for the leading or your option, `#e3e4e9` for the others. Width = share of votes.
   - Label: 14, weight 700 on the leading option and 500 on the others, padding 0 10 0 12.
   - On the right: an avatar stack of 18 circles (2 px border in the fill colour, overlapping −8, 7/700) and the count in bold.
2. **Tokek offer bubble** with the ink pill "I'm in · 2 slots left" (36 high, padding 0 14, radius 18, 13.5/600) and a 22 avatar stack of the people who claimed (2 px `#fff6c9` border).
3. **Jordan's sticker**: gecko cheer 112 with "YES PLS" and reactions [gecko-wave 3][tanuki 1].
4. **My reply bubble**, quoting Maya, with "@tokek can we catch sunset somewhere after?" and "Read by 4".
5. Composer A.

Every tap:

| Tap | Result |
|---|---|
| Back | Home (3.01) or wherever you came from |
| Map | Crew map (6.C) |
| Poll option | Votes; the bar fills and your face joins the stack (Snappy) |
| I'm in | Claims a slot; Tokek books it and the split posts |
| Sticker, long-press | 5.09 |
| Reaction chip | Who reacted, with their critter |
| @tokek | Tokek answers in the thread; counts as a question |
| Sticker button | Tray (5.08) |
| `+` | Photo, poll, expense, meet-up, location |
| Mic, hold | Records a voice note |
| View (on an expense card) | The expense (7.21) |

Dark (1.10): theirs sit on `#1c1d24`, yours flip to light ink, Tokek's offer uses the deep yellow tint `#2f2914` with cream text, and stickers keep their white edge.

### 5.02 Brand new, Tokek breaks the ice

- **Members ring** at top 150: a 200×110 box with six 40 avatars on an ellipse (16/700 initials) and the gecko cheer 64 with sticker edge in the centre.
- Title "The Bali Six is on" 20/700 −0.02 (**OFF-TOKEN**, between `title` 22 and `headline`); sub "Maya made the crew · today 9:12" 13 muted.
- **Tokek bubble** (5.02-family style: white, not tinted, §8 Q3), top 360, max 258.
- **Three starter chips**, top 460, gap 8, left-aligned:
  - 44 high, padding 0 16 0 8, radius 22, white, shadow `0 0 0 .5 .08, 0 6 14 −8 .2`, 14.5/600.
  - A 28 doodle leads each: cal "When is everyone free?", temple "Pitch a place to go", wallet "Set a rough budget".
- Footnote at top 640: "Messages stay on everyone's phone, offline too", 12.5 `#9a9daa`, centred.
- Ways out: a starter (prefills or asks Tokek), the crew map, back to Home.

### 5.03 Offline, sends queue, one bounced

- Header subtitle becomes the NO SIGNAL chip: 30 high, padding 0 11, radius 15, `rgba(118,118,128,.12)`, `#a8501a` 12/700 +.04em, tangerine dot 7.
- Rows: the delivery states above, plus the offline system marker.
- Composer placeholder "Sends when you're back". Typing still works; new messages queue (ways out: Retry, Delete failed, keep typing, Back).
- Foundations' general offline pattern is an ink pill at the top. This part puts the chip in the header instead (§8 Q4).

### 5.04 Long-press, react and act

**Backdrop**
- The whole chat blurs: filter `blur(14) saturate(1.2)` at opacity .8.
- Scrim `rgba(20,22,40,.12)` over it.

**Reaction bar**
- Position: left 16, 12 above the lifted bubble (y 226).
- Bar: 54 high, padding 0 8, radius 27, `rgba(255,255,255,.9)`, blur 18, sat 1.8, nav-glass shadow.
- Five 44 cells with 32 doodles: heart `#ff5fa8`, star `#ffd84a`, flame `#ff9a4d`, check `#54d6a4`, spark `#4f86ff`. The selected cell gets a tinted disc (`rgba(255,95,168,.14)` for heart).
- A sixth cell: control-fill 44 with `+` (more reactions).

**Lifted message**
- The bubble is copied at y 292: scale 1.03 from the left-top origin.
- Radius 22 (6 bottom-left), padding 12 16, 15.5 / 1.4, shadow `0 20 40 −14 .35`.
- The name sits inside at 12/700 in the sender's accent text colour (`#b0306b` for Maya).

**Menu**
- Width 250 at y 398, radius 22, `rgba(250,250,252,.92)`, blur 30, sat 1.8, shadow `0 24 50 −16 .4`.
- Rows 48 high, padding 0 16, 16 ink, trailing icon 18, hairline `.1`: Reply, Pin to the trip, Add to Day 5, Copy.
- A 6 px separator band `rgba(118,118,128,.1)`, then Report in pink `#e0468e` (Foundations destructive is `#d6337f`; OFF-TOKEN).

Ways out: React, Reply, Pin / add to day, Report, tap outside to close.

### 5.05 Voice note: microphone is off

- Scrim `rgba(20,22,40,.3)`.
- Sheet: inset 8 left/right/bottom, top 430, radius **46**, `rgba(248,248,250,.88)`, blur 34, sat 1.8 (Sheet glass), padding 10 18 0.
- Grabber 36×5, `rgba(60,60,67,.3)`.
- ✕ glass 44 on the right. **No Cancel / verb pair**, which differs from the Foundations sheet (§8 Q5).
- Hero: 86 `#ffe4f0` disc, mic 36 with a 56×3 `#b0306b` strike at −45°, margin-top −16.
- Title 24/700 −0.025 (**OFF-TOKEN**: between `emptyTitle` 26 and `title` 22).
- Body 14.5 / 1.42, muted.
- Buttons, bottom 24, gap 8:
  - Ink pill 56 "Open Settings": opens the iOS app settings, or Android app details.
  - Control pill 52, radius 26, `rgba(118,118,128,.12)`, 16/600 "Type it instead": closes the sheet and focuses the field.
- Swipe down closes. Current app: a PermissionCard in `features/crew/chat/media/voice-recorder.tsx`; move it into this sheet.

### 5.06 You left, you can still read

- Header subtitle "Read only · you left on Oct 2". The list is at opacity .9.
- The composer is replaced by a bottom bar: padding 16 16 34, `rgba(248,248,250,.86)`, blur 24, top hairline.
  - Lock disc 40 `#f1f1f4`.
  - "You're not in the Bali Six now" 15/600, with "Photos and the recap stay yours. To post again, ask to rejoin." 12.5 muted / 1.35.
  - Two buttons, 48 high, radius 24, flex 1, gap 8, margin-top 14: ink "Ask to rejoin" and control "Remove chat".
- "Remove chat" is destructive. Confirm with an Alert (Foundations), not shown.

### 5.07 Group offer, claim a slot

- Header: no bar background. Title 17/600 "The Bali Six", subtitle "Tokek is in this chat". A 40 spacer on the right (no Map button here).
- My @tokek bubble: right 16, top 124, radius 20 20 6 20.
- **Offer place card**: Tokek avatar 28 `#ffd84a`, then a card with flex, radius 24, white, shadow `0 2 4 .05, 0 14 32 .1`.
  - Photo 120 high, margin 6 6 0, radius 19.
  - Body padding 12 14: title 16/600 "Menega Café, beach table at 18:15", meta 12.5 muted "6 slots held for 30 min · grilled fish by weight".
  - Slot row: 6 cells, flex, 30 high, radius 10, gap 4. Taken cells are filled in the crew colour with the initial 11/700; free cells are transparent with a 1.5 dashed `#c4c6ce` border.
- **Sheet**: inset 8, radius 36 36 48 48, **solid `#f5f5f7`** (**OFF-TOKEN**: not Sheet glass), padding 12 20 30.
  - Grabber, then "Take one of the slots?" 22/700 (`title`) and "Nothing is booked or paid yet." 13.5 muted.
  - Ink pill 54 high, 16/600 "Count me in · 2 slots left" (**OFF-TOKEN** height: `button` is 56).
  - Text button 44 high, "Not now" 15/600 muted.
- The scrim `rgba(20,22,40,.25)` covers only the bottom 300 px in the design. Use a full scrim.

| Tap | Result |
|---|---|
| Count me in | Claims a slot; Tokek holds it 30 min |
| Not now | Hides the offer for you |
| The card | Place sheet with the menu and map |
| "2 slots left" | Who has claimed |

### 5.08 Sticker tray (your Critterdex, one tap from the keyboard)

- **Tab row**, padding 0 14, gap 6:
  - "Recent": 34 high, padding 0 12, radius 17, `#f1f1f4`, 13/600.
  - Critter tabs: 40×34, radius 17. The active tab is ink (gecko); the others are `#f1f1f4` with a 32 critter cropped to the bottom (tanuki, sardine, puffin).
  - On the right: "12 of 150" 12/700 muted.
- Set label "TOKEK · BALI": 12/800 +.06em `#8a6a0c`, padding 12 18 0.
- **Grid**: 4 columns, row gap 4, padding 6 8 0.
  - Each cell is a 76×76 radius-20 tile holding a 68 sticker (white edge). The tile is transparent; the recently picked or pressed one shows `#fff3c4`.
  - Label under it: 10.5/700 `#3d404c` (hi!, yes pls, hmm, omw, zzz).
  - **Locked critters** (Ora `cp-113`, Kukang `cp-114`) show as silhouettes with the label in `#9a9daa`.
  - The last cell says "Meet more in Indonesia", 10.5/700 muted.
- In the design the silhouette attribute `locked=true` is not a valid colour, so it rendered black (visible in the shot). Use the Foundations locked colour (§8 Q7).

| Tap | Result |
|---|---|
| Sticker | Sends it "with a little pop" |
| Hold a sticker | Bigger preview; drag up to send it as a reply |
| Critter tab | That critter's set (earned on its trip) |
| Silhouette | Where to meet it (Critterdex 8.A / `critters/where/[formId].tsx`) |
| Recent | Your most-sent stickers |
| Sticker button | Back to the keyboard |
| Swipe down | Closes the tray |

### 5.09 A sticker lands (react with a critter, reply in kind)

- **Backdrop**: `rgba(245,245,247,.55)` + blur 14, z 10. Light frosting, unlike the 5.04 dark scrim.
- **Critter reaction bar**: left 20, y 262, padding 6, radius 30, white, shadow `0 18 40 −12 .35`, gap 6.
  - Six 46 cells with 44 critters in different poses: gecko cheer, gecko think (selected on `#fff3c4`), tanuki, sardine, puffin, gecko sleep.
- **Lifted sticker**: grows from 96 to **150** (scale 1.56) at (44,332), keeping its +5° and the caption.
- **Menu**: 230 wide at y 500, radius 20, white, shadow `0 18 40 −12 .3`. Rows padding 12 16, 15, hairline `.08`: Reply with a sticker, Save to my tray, Who reacted, Copy.

| Tap | Result |
|---|---|
| Critter in the bar | Reacts; tap again to take it back |
| Reply with a sticker | Tray with the reply attached |
| Save to my tray | Only for critters you have met; for others, says where to find them |
| Who reacted | Faces with their critters |
| Copy | The sticker as an image (PNG via `ui/sticker/export-png.ts`) |
| Outside | Closes |

Motion: the design frame is static. Filmstrip `$SP/film/05-lane/strip8.png` shows a pixel difference of 0 across frames. §5 gives the proposed motion.

### 5.10 Plan cards: a change to say yes to, a meet-up

**Changeset card** (282, radius 22, `card`, padding 12 14)
- Eyebrow "A CHANGE · NEEDS 3 YESES": 10.5/800 +.07em `#2f5fc4`, with a 26 Tokek bust `#fff3c4` on the right.
- Title 16/700.
- Change rows: gap 4, 13. A 6 sky dot, the name, old time `#9a9daa`, "→" `#9a9daa`, new time bold.
- Voters: 22 avatar stack, then "2 of 3 yeses · closes 18:00" 12 muted.
- Buttons: "Yes, swap" ink, flex 1, 36 high, radius 18; "Not this one" `#f1f1f4`.

**Meetup card** (282, radius 22, no padding, shadow `0 0 0 .5 .05, 0 14 34 −12 .2`)
- A live map 104 high on `#eef0e8` with a "LIVE" chip: white, 24 high, `#1f7a55` 11.5/700, dot 6 `#34c77b`.
- Body padding 10 14 12: title 15.5/700.
- Members row, gap 10: 26 avatars with the status under each at 10.5/700 ("here" in `#1f7a55`, minutes in muted).
- Buttons: "I'm on my way" ink, "Running late" `#f1f1f4`, both 36 high.

| Tap | Result |
|---|---|
| Yes, swap | Your yes; at 3 the plan moves and the card says so |
| Not this one | Your no, with an optional line |
| The change | Review it (4.48) |
| I'm on my way | Shares your ETA until you arrive |
| Running late | Tells the crew and offers a new time |
| The map | Crew map at the meet-up (6.C) |

### 5.11 Money, rides and boosts

**Photo grid**
- 230 wide; columns 1.3fr / 1fr; rows 84 / 84; gap 3; radius 20 20 20 6.
- The first image spans both rows.
- The "+4" overlay: `rgba(20,22,40,.45)`, white 17/800.
- States from the board: uploading shows a ring; failed shows Retry.

**Voice note**
- Padding 8 12 8 8, radius 20 20 20 6, white.
- Play: 34 ink circle.
- Waveform: 34 bars, 3 wide, radius 2, gap 2, 22 high; played bars ink, the rest `#c4c6ce`.
- Duration "0:14" 12/600 muted, tabular figures. Playback speeds 1× and 1.5×.

**Supplier order (ride) card** (282, radius 22, `card`, padding 12 14)
- 40 mint circle "M" 15/800; "Made · Jatiluwih pickup" 15/700; "Wed 14 · 06:40 · 7 seats" 12 muted.
- Status tag on the right: Held `#fff3c4`/`#8a6a0c`; Confirmed `#e3f6ec`/`#1f7a55`; Declined `#ffe4f0`/`#b0306b`.
- Three-step progress: margin-top 12, gap 4. Bars 4 high, radius 2: `#34c77b` done, `#e3e4e9` to do, `#ff5fa8` refused. Labels 10.5/700: green when done, `#9a9daa` otherwise. Steps: Asked / Made said yes / Paid on the day.
- Footer, margin-top 10, 12.5:
  - Held: muted "Hold till 18:00 · Rp 650k" with bold "Message Made".
  - Confirmed: "Rp 650k for the car".
  - Declined: "Pon found 2 others" with bold "See them".

**Boost card**
- 282, radius 22, white, **2 px dashed `#ff9a4d`** border, padding 12 14.
- Tanuki 38 on a 40 radius-12 tile in `#ffe9d6` (**OFF-TOKEN** tint).
- "Winston boosted Kyoto" 15/700; "For everyone on this trip" 12 muted.
- Perk chips: 24 high, padding 0 9, radius 12, `#ffe9d6` / `#a8501a` 11.5/700.
- Footer "$2 each, already in Balances" 12 muted.

| Tap | Result |
|---|---|
| Photo | Full screen; swipe through, save to the trip album |
| +4 | The other photos |
| Play | Plays the note |
| Message Made | WhatsApp with Pon's message ready |
| Ride card | The driver (6.E) |
| Boost card | What the crew gets (9.16) |
| $2 each | Balances (7.16) |

### 5.12 Housekeeping: joins, renames, typing, a card from the future

- System pills (as above).
- **Unknown card**: 282, radius 22, **1.5 dashed `#c4c6ce`**, `rgba(255,255,255,.5)`, padding 12 14, gap 12. Gecko think 40, "A card this app can't show yet" 14/700, "Update CritterPass to see it" 12 muted, and "Update" on control fill (36 high).
- **Settled strip**: centred, padding 8 14 8 8, radius 24, `#e3f6ec`. Gecko cheer 40 with sticker edge; "All square" 13.5/700 `#174a35`; "Lisbon is settled · 6 of 6" 11.5 `#1f7a55`. Posted once, when the last payment lands.
- **Typing**: a Tokek bust 28 with a bubble (padding 12 14, radius 20 20 20 6, `#fff6c9`) holding three 7 dots in `#8a6a0c` at opacity .35 / .6 / .85. Animate them as a wave. Live only, never stored.
- **New messages pill**: centred, bottom 108 (composer + 16). Ink, 34 high, padding 0 12 0 8, radius 17, white 13/600, shadow `0 10 20 rgba(28,29,36,.3)`. Badge: minimum 20 high, pink `#ff5fa8`, 11/800, "3". Text "New messages ↓". Tap jumps to the first unread.
- Taps: a system line opens that member (3.14); Update opens the App Store page; All square opens Balances (7.16) read-only.

### 5.D Board: every card and state

The board uses the same metrics as above, at 282 wide on a `#f5f5f7` well (padding 16, radius 24).

| Type | States drawn | Notes |
|---|---|---|
| text | plain; reply | quote bar in the author's colour |
| sticker | one | new kind |
| photo | grid with +N | uploading ring, failed Retry (not drawn) |
| voice | note | mic refused → 5.05 |
| poll | open | — |
| poll | closed | "Closed · 6 of 6", fill widths 66/17/17; winner line 12.5/700 `#1f7a55` with a 16 `#34c77b` check disc: "Yes won · added to Wed 14:00" |
| guide_offer | open | ink "I'm in · 2 slots left" |
| guide_offer | you're in | tag 30 high, `#e3f6ec` / `#174a35` 13/700 with a 14 `#1f7a55` check disc: "You're in · 1 left" |
| guide_offer | full | white tag, muted: "All 3 slots taken" |
| expense | new | 44 tile, radius 13.2, `#ffe4f0`, food doodle 40 pink; "Maya paid Rp 1.08M" 15/700; "Babi guling · split 6 ways"; "View" control pill 36; footer with hairline top "Your share $11.37" 13 |
| expense | paid | "Paid" tag `#e3f6ec` / `#1f7a55` replaces View; no footer |
| changeset | needs yeses | as 5.10 |
| changeset | applied | eyebrow "CHANGED · WED 14" `#1f7a55`; old times struck through; footer `#1f7a55` 12.5/700 with check disc, "3 yeses · the plan moved", "Undo" in ink on the right |
| changeset | not changed | eyebrow "NOT CHANGED" `#9a9daa`; title muted; new times struck; "Alex and Dev said not this one" |
| changeset | expired | eyebrow "EXPIRED · NOTHING CHANGED"; "Nobody answered by 18:00" |
| proposal | open | see below |
| proposal | everyone boarded | "All 6 boarded" with a "Boarded" tag in the booked tint |
| meetup | live | as 5.10 |
| meetup | done | no LIVE chip; "Everyone made it · 17:04" as a 30-high booked-tint tag replaces the buttons |
| supplier_order | held / confirmed / declined | as 5.11 |
| boost_card | boosted | as 5.11 |
| system | joined / left / renamed | pills |
| settled strip | all square | as 5.12 |
| typing | guide or member | as 5.12 |
| unknown | newer card | "Any newer card, so old apps never crash" |

Proposal card, open:
- Top panel: `#ffd84a` with a dot grid `radial-gradient(rgba(23,20,42,.12) 1.2px, transparent 1.7px) 0 0 / 9px 9px`, padding 12 14 14.
- Eyebrow "WINSTON'S PROPOSAL · V2" 10.5/800 +.08em `#5d4a14`.
- "BALI" 30/800 −0.04 `#17142a`; "Oct 12–19 · 8 days · $1,240 each" 12.5/600 `#3d3210`.
- Gecko wave 68 with sticker edge, rotated 8°, top right.
- Perforation: 2 px dashed `#e3e4e9`, margin 0 10.
- Footer padding 10 14 12: 22 avatar stack, "4 of 6 boarded · reply by Oct 5" 12.5 muted, ink "Board" 36.
- Each new version posts again.

### 5.13 Guide chat, empty (four starts)

- Background `radial-gradient(90% 50% at 50% 20%, #fff6c9, #f5f5f7 70%)`.
- Header at y 58, inset 20:
  - Glass back 44 (the other guide frames use ✕, §8 Q8).
  - Centre "Tokek" 17/600 with "Bali guide" 12 muted.
  - Quota chip: 30 high, padding 0 10, radius 15, `#fff6c9` / `#8a6a0c` 12/700, a 6 `#ffd84a` dot with a 2 px halo `rgba(255,216,74,.35)`, "27 left".
- Gecko wave 128 with sticker edge at y 132, centred, **bob** (§5).
- Greeting at y 280: 26/700 −0.03 / 1.12 (`emptyTitle`) "Selamat pagi, Winston". Sub 15 muted / 1.42: "I know your plan, your bookings and Bali. Ask in any language."
- **Starter cards** at y 388, inset 16, 2×2, gap 10:
  - Each 112 high, radius 24, white, `card` shadow, padding 12 14, laid out with space-between.
  - A 34 doodle in an accent (food tangerine, boat sky, chat pink, camera mint), then 14 / 1.3 text: a 600 line and a muted line.
- Footnote at y 640: "30 answers a day on the free pass · resets at midnight" 12.5 `#9a9daa`.
- Composer B: "Ask Tokek" with a 30 ink mic.
- Ways out: starter cards, point camera (5.16), voice (5.15), back.

### 5.14 Guide chat, answers as a plan card

**Header** (y 60)
- ✕ glass 44.
- Identity: 36 `#ffd84a` disc with gecko 34; "Tokek" 17/600; "All six can see this" 12 muted.
- Segmented "Group | Me": 34 high, padding 3, radius 17, track `#e9eaee` (**OFF-TOKEN**: control is `rgba(118,118,128,.12)`). Thumb white, radius 14, 12/600, shadow `0 1 3 .1`.

**Thread**
- Timestamp "Today 14:02".
- Maya's question: 28 avatar, white bubble, padding 11 14, radius 20 20 20 6, 15 / 1.35, shadow `0 0 0 .5 .05, 0 1 2 .04, 0 12 28 −14 .18`.

**Plan card**
- Tokek 28 `#ffd84a` (crew chat uses `#fff3c4`, §8 Q3).
- Card: flex, radius 24, white, padding 14, gap 12, shadow `0 2 4 .05, 0 12 30 .08`.
- Intro in **Borel 14** `#6b5a24`: "Rain till three. Two dry swaps:".
- Two swap rows:
  - old item 12.5 `#9a9daa` struck through;
  - new item 16/600, meta 12.5 muted;
  - a sticker 50 (food / temple, white edge) rotated ±6°.
  - Hairline between the rows.
- Cost row: padding 10 12, radius 14, `#f5f5f7`. "+$22 each" 13/600 and "Dinner unchanged" 13 muted.
- Buttons, 42 high, radius 21, gap 8: ink "Propose to group" flex 1.4; `#f1f1f4` "Just me" flex 1.

**Below**
- Quick chips at y 648, scrolling sideways, padding 0 16, gap 8, mask fade on the last 16%. Each 38 high, padding 0 13 0 6, radius 19, white, `raised`-like shadow, a 26 doodle and 13/600: Call a car, Translate a menu, Pharmacy.
- Composer C: "Ask, or hold to talk".

Streaming: the design draws no streaming state. Keep the current word-by-word reveal (`features/guide/chat/components/guide-answer.tsx`) and let the plan card rise in when its data lands (Smooth).

### 5.15 Voice: talk, see the swap, send it

- Background `radial-gradient(circle at 50% 30%, rgba(255,216,74,.32), transparent 58%)`.
- Header: ✕ glass 44; "Tokek · group mode" 15/600; glass 44 "CC" 11/800 (captions toggle).
- Stage:
  - Two **ping rings**: 220 circles, 2 px `#ffd84a` border, at (85,122).
  - White disc 180 at (105,142), shadow `0 2 4 .06, 0 24 50 .14`, holding the gecko think 132 with **bob** (2400 ms).
- "Listening" pill: ink, 28 high, padding 0 12, radius 14, 12/600, 7 mint dot, at y 338.
- Transcript at y 390: 22/600 −0.02 / 1.25. Answer in **Borel 15** `#6b5a24` / 1.5.
- Waveform at y 528: 34 bars, 4 wide, radius 2, gap 3, inside a 34-high box; spoken bars ink, the rest `rgba(28,29,36,.18)`. It is live.
- Result card at y 584: radius 24, `card` shadow. Rows padding 12 16 12 10: sticker 40, title 15/600, meta 12.5, price 15/600; hairline between.
- Bottom row (bottom 36): white mic circle 56 + Ink pill 56 "Send to the group" flex.

### 5.16 Point and ask (translations stick to the menu)

- Camera background `#2a2622` with `radial-gradient(circle at 40% 30%, #4a4038, #221e1a 70%)`. The status bar is white.
- Header:
  - ✕: 40, `rgba(255,255,255,.18)`, blur 16 (**OFF-TOKEN**: Clear glass is a tint of `rgba(18,20,28,.30)`, blur 24).
  - Centre pill "Indonesian → English": 34 high, radius 17, 13/600 white, same glass.
- Viewfinder corners: 34×34, 3 px white, radius 10, at the four corners of 30 → 360 × 112 → 464.
- Translation labels sit on top of each detected line:
  - Sticker tags: padding 5 9, radius 8, 2 px white border, shadow `0 4 10 rgba(0,0,0,.3)`, 800 12 `#17142a`.
  - Rotated −2 to −7°, fill cycling sun / tangerine / pink / mint.
- Bottom sheet: 372 high, radius 34 34 0 0, `#f5f5f7`, grabber 40×5 `#d0d1d8`.
  - Diet chips: 30 high, radius 15, 12.5/600, 18 avatar: "Jordan · veg ✓" booked tint, "Alex · no peanuts" vote-open tint.
  - Tokek 34 `#ffd84a` with the answer 15 / 1.42.
  - Action chips: 36 high, radius 18, 13/600 (white, one ink: "Order for 6").
  - Composer C: "Ask about this menu".

### 5.17 Guide offline: the question waits, a failed turn retries

- Header chip NO SIGNAL: `#fff1e6` / `#a8501a`, tangerine dot.
- "What time does Tirta Empul open?" with "✓ Answered" `#1f7a55`.
- Tokek reply: **white** bubble ("That one tripped me up…").
  - Below it, two white pills 32 high, radius 16, 13.5/600: "↻ Try again" and "Ask it differently".
  - Then 11.5 `#9a9daa`: "This one didn't count toward your 30".
- Queued question at opacity .6, with a clock and "Asks when you're back online".
- **Offline tools card** at y 490: radius 24, `card` shadow, padding 14.
  - 36 `#fff1e6` disc with a wifi-off icon; "Still works offline" 15/600; "Saved on this phone for Bali" 12.5.
  - Chips 32 high, radius 16, `#f1f1f4`, 13.5/600: Phrasebook, Emergency numbers, Today's plan, Bookings.
- Composer B: "Questions wait for signal".

### 5.18 A slow answer shows its working

- Chip "26 left". The question shows "Read".
- **Working card**: left 16, right 40, y 212.
  - Tokek 34 `#fff3c4` with the think pose.
  - Card: radius 22 (6 bottom-left), white, shadow `0 0 0 .5 .06, 0 14 30 −16 .25`, padding 14 16.
  - Title 15/600 "Checking a swap to Friday".
  - Steps: gap 10, 14 ink.
    - Done: 20 `#34c77b` disc with a white check 11.
    - Active: 20 ring (inset 2.5 `#ffd84a`) with an 8 `#ffd84a` dot **pulsing**; text weight 600.
    - Pending: ring 1.5 `#c4c6ce`; text `#9a9daa`.
- Note at left 60, y 446: 13 muted / 1.4, "The spa is taking a while. I'll ping you when I have it, so you can leave this screen."
- Buttons at y 500: white pills 34 high, radius 17. "🔔 Ping me" and "■ Stop" with `#b0306b` text.
- Composer stays active: "Ask something else meanwhile".
- Ways out: Ping me later (a push, §6), Stop, ask something else, back.

### 5.19 Out of questions: the limit, in Pon's voice

- Header: ✕ glass 44; Pon 36 `#ff9a4d` disc with the tanuki; "Pon" 16/600; "Just me · Kyoto, Apr 2–9" 12 muted.
- The question bubble on the right.
- **Limit card**: radius 24, padding 16.
  - **Borel 14** `#8a4a12`: "That's my thirtieth answer today…".
  - Ring 62: `conic-gradient(#ff9a4d 0 100%)` with a white inner 50, "30" 16/800 and "of 30" 9/600 muted.
  - 12.5 muted copy beside it.
  - Buttons 42 high: "Get Pass+" ink, flex 1.3 → paywall 9.10. "At midnight" `#f1f1f4` → queues the question (5.20).
- Handoff row at left 52, y 500: radius 20, white, padding 10 12. Maya 30 avatar, "Maya has Pass+. Ask in the crew chat and Pon answers there." 13, chevron. Opens the crew chat with the question moved over.
- Locked composer: "Pon is back in 7h 12m".

### 5.20 Out of answers: queue it for midnight

- Header: ✕ 44; "Tokek" 16/600 left-aligned; chip "30 of 30 today" (`#ffe4f0` / `#b0306b`).
- The last answer bubble.
- **Waiting card** at y 236, inset 20: radius 24, white, padding 14 16, ring `0 0 0 2 #ffd84a`.
  - Header row: "WAITING FOR 00:00" 11.5/800 +.06em `#8a6a0c` and "Cancel" 13/600 muted.
  - Question 16/600.
  - Note 12.5 muted: "Tokek answers this at 00:00 and lets you know quietly. It counts towards tomorrow."
- Sleeping gecko 120 in a 160 white disc at (115,410).
- **Borel 14** `#6b5a24`: "Saving my voice. Back in 7h 12m."
- Composer C without `+`: "Ask now, Tokek answers at midnight" with a `#e9eaee` send.

| Tap | Result |
|---|---|
| Cancel | Unqueues the question, back to typing |
| The waiting question | Edit before midnight |
| Send | Queues it; counts toward tomorrow |

### 5.21 Dietary: consent first

- ✕ glass 44 on the left; caption on the right "From the guide · You settings" 13/600 muted.
- Title at y 116, left 24, right 120: 32/700 −0.03 / 1.05 (`largeTitle`) "Food and getting around".
- Food sticker 96 rotated 8° at the top right.
- **Consent card** at y 214, inset 20: radius 28, **paper `#fffdf6`**, padding 20, shadow `0 2 4 .06, 0 20 44 .12`.
  - Gecko think 44 with "Share flags with your crew and guide?" 19/700.
  - Body 14 `#3d3a34` / 1.5.
  - Preview tags: "Vegetarian" mint at −3° and "No peanuts" pink at +3° (sticker tags 12.5/800). "your notes" in 2 px dashed `#c4c6ce`, struck through, `#9a9daa`.
  - Footnote 12.5 muted.
- Bottom 34: Ink pill "Share flags" → 5.22; text button "Not now" → back to the guide, nothing shared.
- "What they see" shows a preview of the flags.

### 5.22 Dietary: the form

- ✕ on the left; chip "Sharing flags" on the right (`#e3f6ec` / `#1f7a55` 12/600).
- Title 30/700 (**OFF-TOKEN**: `largeTitle` is 32).
- Section labels 13/600 muted at x 24: Diet, Allergies, "Rather not eat · only you see this", Spice, Getting around.
- Chips: 34 high, padding 0 13, radius 17, 13/600. On = ink with white text. Off = white with shadow `0 1 2 .06, 0 4 12 .06`.
  - Diet: No restrictions, Vegetarian, Vegan, Pescatarian, Halal, Kosher.
  - Allergies: Peanuts, Tree nuts, Shellfish, Fish, Dairy, Eggs, Gluten, Soy, Sesame.
- Fields: 46 high, radius 16, white, inset 1.5 `#e3e4e9`, padding 0 14, 14 (**OFF-TOKEN**: the Foundations field is 52 high, radius 18, 16/500).
- Spice: a 4-segment control (None / Mild / Medium / Hot).
- Save: Ink pill at bottom 34.

Keyboard state (not drawn):
- The form scrolls. The focused field scrolls to sit above the keyboard. Save stays docked above the keyboard (or hides while it is up, §8 Q9).
- "Something else? Type it and tap done": return key **Done** adds a chip and clears the field.
- "Rather not eat" and "Getting around": return key **Done**, which dismisses.
- Swiping down asks before discarding edits (Foundations rule for sheets).

### 5.23 Phrase, show mode, full screen

- Background `#1c1d24` with `radial-gradient(circle at 50% 40%, rgba(255,216,74,.18), transparent 60%)`.
- Language chip at (24,68): 30 high, `rgba(255,255,255,.14)`, blur 16, 12.5/600 white.
- ✕ 44 at the **top right** (Foundations puts ✕ top-left and keeps phrase cards light, §8 Q10).
- Phrase at y 200, inset 30: 58/800 −0.04 / 1.02, white. Translation 18 italic, opacity .7, margin-top 20.
- Play: 64 `#ffd84a` circle with a play icon, and "Play it out loud" 14 `rgba(255,255,255,.75)`, at bottom 150.
- Gecko point 96 rotated −8° at bottom right.
- Hint 12.5 `rgba(255,255,255,.55)`: "Brightness up · tap anywhere to close".
- Behaviour: maximum brightness while open (reuse `features/bookings/boarding-pass/use-full-brightness.ts`); tapping anywhere goes back to the guide chat.

### 5.24 Getting around: the ride and a card for the driver

- Map from y 0 to 460, with a top fade 120 (`rgba(245,245,247,.95)` 40% → transparent).
- Header:
  - Glass back 44.
  - Ink route pill: 34 high, padding 0 14, **radius 12** (**OFF-TOKEN**: pills are fully rounded), 13/600 "Airport → Villa · 1h 05m".
- Sheet at y 420: radius 32 32 0 0, `#f5f5f7`, shadow `0 −10 30 .12`, grabber 40×5 `#d0d1d8`.
  - Ride row: car sticker 58 at −6°; "Made is 4 min away" 20/700; "White Avanza · DK 1234 AB · booked by Tokek" 12.5; a white 44 message circle.
  - Driver phrase card: radius 24, white, padding 16. "Show this to Made" 13/600 muted with a 34 ink speaker button; phrase 22/700 / 1.22; translation 13.5 italic muted. It **stays light** per Foundations.
  - "Later today" label, then a ride row: radius 20, padding 12 12 12 16, "Villa → Warung Biah Biah" 15/600, "12 min by car · Rp 60k, split 6", ink "Book" 36 high.

### 8.01 Critterdex: here now, then the sets

- No nav bar. "Your Critterdex" 13/600 muted at (24,62).
- Count: 56/800 −0.05, tabular figures, "9" in ink and "/150" in `#b9bbc4` (**OFF-TOKEN** size and colour; nearest is `hero` 66).
- Right, at y 74: a pink sticker tag rotated 3° ("6 of 61 places": padding 5 10, radius 9, 2.5 white, `sticker` shadow, 12/800) and "Maya has 14" 12.5 muted.
- Segmented at y 150, inset 20: All / Found / Near me.
- **Here-now card** at y 206: radius 26, white, padding 14 14 12, ring `0 0 0 2 #ffd84a` + `0 16 36 .08`.
  - "Here now · Bali" 16/700; "Tokek · 2 of 4 forms" 12 muted.
  - 4-column grid: stickers 66 with tier labels 11/700.
    - "● Common" `#6e7180`; "◆ Rare" `#2f5fc4` (fill `#54d6a4`, spot `#2e9a74`).
    - Locked epic: mask `#e3e4ea` with "?" 20/800 `#d6337f` at top 20, label "★ Epic" `#b0306b`.
    - Locked legendary: mask `#efe2b4` with "?" `#a8800f`, label "✦ Legendary" `#8a6a0c`.
  - Footer: hairline, 13 `#3d404c`, "Epic is tomorrow: summit Batur by sunrise."
- **Legendary banner** at y 420: 64 high, radius 20, ink. Tanuki silhouette 48 `#6b5a24` with "?" 16/800 `#ffd84a`; eyebrow 11/700 +.06em `#ffd84a` "LEGENDARY ON YOUR DATES"; 15/600 white "Sakura Pon · Kyoto, Apr 2–9"; chevron.
- **Home set card** at y 498: radius 24, `card`. "Vietnam" 16/700 with "3/10 · home set" 12 muted. 5-column grid of 52×50 cells: found = sticker 46; locked = mask 42 `#e3e4ea`.
- **Country row** at y 672: radius 20, padding 8 12. "#01" `#9a9daa` + "France" 14/700; "2/5 found" 11.5; five 34 cells (found 34, locked 30).
- Tab bar: Tabs rendering, Pass active.
- Scroll: the 9/150 block behaves as the large title of a Root screen and collapses into a bar on scroll.

### 8.02 Critter detail: sticker over the place it lives

- Hero photo 330 high, radius 0 0 40 40, top fade `rgba(10,15,25,.5)` to transparent at 40%. White status bar.
- Controls at y 60:
  - Clear-ish glass 40 (`rgba(255,255,255,.2)`, blur 16, sat 1.6; **OFF-TOKEN** vs Clear glass).
  - Back **arrow** (not a chevron).
  - "#112" chip in the centre: 30 high, 13/600, tabular figures.
  - Share 40 on the right.
- Rare tag at (24,252) rotated −6°: `#4f86ff`, 13/800.
- Sticker 210, wave pose, rare palette, **floating** at (150,176). It overlaps the bottom edge of the hero.
- Name 34/700 (`display`) at y 410: "Temple Tokek". Field note in **Borel 13.5** `#1f6b4c`; "From Tokek's field notes" 11.5 muted.
- Facts card at y 536: radius 22, three columns. Label 11.5 muted, value 14/600: Found / Where / Also has it (18 avatar).
- "One Tokek, four ways · 2 of 4" 13/600 muted. 2×2 form grid, gap 8, cells 44 high, radius 14:
  - Found: white with an 18 `#e3f6ec` check disc; name 12.5/700 in the tier colour; condition 11 muted.
  - Locked: 1.5 dashed `#c4c6ce`, with an 18 "?" disc (epic `#ffe4f0` / `#b0306b`, legendary `#fff3c4` / `#8a6a0c`).
- Ink pill "Make it my guide" at bottom 36.
- Push; the tab bar hides.

### 8.03 Encounter: hold to befriend

- Full-bleed photo with a gradient `.55 → .05 (30%) → .2 (50%) → .85`. White status bar and home indicator.
- Top: ✕ 40 glass; pill "You're at Tirta Empul" 34 high, 7 mint dot.
- Rare tag centred at y 124, rotated −3°.
- Ground shadow: 180×30 ellipse, `rgba(0,0,0,.35)`, blur 8, at (105,410).
- **Ping ellipse**: 200×110, 2 px `rgba(84,214,164,.9)`, at (95,340).
- Sticker 170 idle with **hop** at (110,212).
- Title 32/700 white at y 494. Body 15 / 1.45 at opacity .92 ("It's shy around crowds…").
- **Hold button**, centred at bottom 72:
  - 108 ring: `conic-gradient(#54d6a4 0 P%, rgba(255,255,255,.25) P% 100%)`, shown at 38%.
  - Inner white 92 disc, "Hold" 17/700.
- Caption at bottom 40: 12.5 `rgba(255,255,255,.9)`, "Hold to befriend · Tokek's rare form, 2 of 4".
- The befriend timer is the stay rule ("You stayed 11 minutes"). The ring shows the hold or stay progress.

### 8.04 Befriended: rays, stamp, sticker

- Ground `#f5f5f7`.
- **Rays**: a 700 disc at (−155,−110) of `repeating-conic-gradient(rgba(255,216,74,.32) 0 9deg, transparent 9deg 18deg)`, masked by a radial (black 18% → transparent 62%), **spinning** (24 s per turn).
- **Confetti**: 46 pieces from (.5,.32).
- Chip "◆ Rare form · 2 of 4": white, 30 high, `float` shadow.
- Sticker 220 cheer with **hop** at (85,116).
- **Stamp "BEFRIENDED!"**:
  - 280 wide, rotated −5°, at y 356, padding 10 0, radius 14.
  - Rings inset 3.5 `#e0468e` / 7 ground / 8.5 `#e0468e`; fill `rgba(245,245,247,.6)`.
  - Text 38/800 −0.03 `#d6337f`.
- "+150 XP" sun tag rotated 8°.
- Name 32/700. A 26 avatar stack with "2 in the crew" 14 muted. **Borel 16** `#1f6b4c`: "You stayed 11 minutes. It noticed."
- Ink pill "Add to your pass" and text "Share with the crew" (it should post to the crew chat, not just open it).
- No ✕ is drawn (§8 Q11).

### 8.05 Egg hatch: welcome to Bali

- Status time shows 13:50.
- Mint rays (`rgba(84,214,164,.25)`, 26 s) and confetti 40 from (.5,.36).
- Ink chip "DPS · 13:50 · you landed" with a mint dot.
- Egg halves: 86 / 78, accent `#fff1d6`, rotated −24° / 28°.
- Gecko 210 wave with **hop** (2400 ms).
- Eyebrow "TOKEK HATCHED" 13/700 +.06em `#1f7a55`.
- Title "Welcome to Bali": 44/800 −0.045 (**OFF-TOKEN**).
- Body 15 `#3d404c`: "Your guide for the next eight days, and critter #1 in the Bali set."
- Sun tag "#1 of 4 in the Bali set" rotated −4°.

| Tap | Result |
|---|---|
| Say hi (ink pill) | Guide chat (5.B) |
| Show me around later | Trip hub (6.01) |
| The tag | The Bali set (8.A) |

### 8.06 It wandered off: a gentle miss

- Photo at saturate .6, with a gradient to `#f5f5f7` at 72%.
- Chip "Encounter over · you stayed 4 min" 32 high. ✕ 40 on the **right**.
- A ghost gecko 110 (mask `#ffffff`, opacity .5, mirrored) with footprint dots (8×5 white at .75) and a shadow ellipse.
- Rare tag. Title 38/800 −0.04 (**OFF-TOKEN**). Body 14.5 `#3d404c`.
- **Chance card** at y 574: radius 24, `card`, padding 14 16.
  - "Best chance" 12.5/600 muted with "Tomorrow, 07:30" 17/700.
  - 14 bars, flex, gap 3, 46 high box, radius 4, height = value × .46. The best bar is `#54d6a4`, the rest `#e3e4e9`.
  - Axis 11 `#9a9daa`: 6am / noon / 6pm.
  - Tapping the chart picks another time.
- Ink pill "Remind me at 07:00": sets a local notification and shows a toast.
- "Back to the day": Day-of (6.04).

### 8.07 Crew quests: a team sport

- Eyebrow "Bali Six · crew level 7" 13/600 muted. Title 32/700 (`largeTitle`). Star sticker 62 rotated 10°.
- **XP card** at y 138: ink, radius 22, padding 14 16.
  - "640" 22/800 with "/ 1000 XP" 15 at opacity .5; "Lvl 8 unlocks a crew sticker" 12 at opacity .7.
  - Bar 10 high, radius 5, track `rgba(255,255,255,.15)`, fill 64% `linear-gradient(90deg, #ffd84a, #ff9a4d)`.
- **Featured quest**: radius 24, padding 14, ring `0 0 0 2 #ffd84a`.
  - "Sunrise squad" 16/700; description 12.5.
  - Squad of 24 avatars: joined members get rings `0 0 0 2 #fff, 0 0 0 3.5 #54d6a4`; the others sit at opacity .35.
  - Reward tile: 74×84, radius 16, `#fff8dc` (**OFF-TOKEN**), gold silhouette 54 with "?" and "LEGENDARY" 9.5/800 `#8a6a0c`.
- **Quest rows**: radius 22, `card`, padding 12 14.
  - Sticker 44 in the accent; title 15/600; description 12.
  - Progress 5 high, radius 3, track `#f1f1f4`, fill in the accent.
  - Reward 11.5/700 muted: "+120 XP", "Settled Tokek", "+80 XP".
- Tab bar: Pass active, and no back button, although the route is a trip Push (§8 Q12).

| Tap | Result |
|---|---|
| A quest | Its detail and who has signed up |
| Join | Signs you up; the crew sees it |
| XP bar | What level 8 unlocks |

### 8.08 Once a year: the legendary calendar

- Push: glass back 44 on the left; an ink small pill "Remind me" (36 high, radius 18, 13/600) on the right. It sets a reminder before each legendary day.
- "Once a year" 36/800 −0.04 (**OFF-TOKEN**: `display` is 34/700). Body 13.5 muted.
- **Month strip** at y 234: 12 columns, gap 3, 36 high, radius 9, 11/700. Months with a legendary are filled (Apr tangerine `#ff9a4d` = your dates; Jun / Aug / Nov sun `#ffd84a`); the rest white.
- **Rows** at y 284, gap 8: radius 20, padding 9 12 9 9.
  - Date tile 52, radius 14, `#fff8dc`: month 10/800 `#8a6a0c`, day 17/800 ("Early", "12", "Late", "1–2", "Day").
  - Name 15/700; place line 12 muted.
  - "Your dates": sun tag rotated 4°, 10.5/800.
  - Silhouette 42 `#efe2b4` with "?" 14/800 `#a8800f`.
  - Your-dates row ring: `0 0 0 2 #ffd84a`.
- A date opens where to go and what to do that day.

### 8.09 Recap: the trip in four stickers

- No back button or ✕ is drawn (§8 Q11).
- Eyebrow "Oct 12–19 · The Bali Six"; title 34/700 −0.035 (`display`). Gecko cheer 78 rotated 8°.
- **2×2 tiles**: 148 high, radius 24, gap 12, rotated −2 / 2.5 / 1.5 / −1.5°.
  - Stat tiles: white, padding 14, value 36/800 −0.04, caption 12.5 muted, sticker 46 in the corner.
  - Photo tiles: 5 px white frame, inner radius 19, bottom gradient, white 30/800 (26 for "312 photos").
- **Forms card** at y 476: three 60 stickers (common, rare, epic `#ff8fbf` / `#d6337f` cheer) and the gold silhouette with "?". **Borel 12.5** `#6b5a24`: "The Golden Tokek got away…"
- Two award tiles: radius 18, label 11.5 muted, value 14/600.
- Buttons at bottom 36: Ink pill "Share recap" flex 1.3, 56 high; white `raised` "Where next? →" flex 1.

### 8.10 / 8.11 / 8.13 / 8.14 Recap story cards

**Shared chrome**
- Progress: 8 segments, 3 high, radius 2, gap 4, inset 16, y 58. Done segments ink; the rest `#d6d7dd` (**OFF-TOKEN**: Foundations' "2 of 4" uses `#dcdde3`).
- Gestures: tap = next card, hold = pause, swipe down = close.
- ✕ 36: white circle with `float` shadow (8.13, 8.14 only).
- Card length: `motion.duration.story` (5 s) exists in the current tokens.

**8.10 The route**
- "The route" 13/600; "214 km" 64/800 −0.05 / .95; **Borel 14** `#6b5a24`.
- A 420 map at y 220 with top and bottom fades.
- Car sticker 78 **floating**.
- Caption card (radius 22, `card`). "Tap for the next card" 12 muted.

**8.11 Money, wrapped**
- "$460 under" 44/800.
- **Receipt**:
  - Paper `#fffdf6`, radius 4, rotated −2°, inset 36, at y 166.
  - **Scalloped bottom**: a mask of 6 px circles every 16 px.
  - Padding 20 20 26, text `#2a2620`.
  - Heading 14/700 +.14em; date line 10.5 +.08em `#6e6658`.
  - Dashed rules 1.5 `#cfc6b2`; lines 12.5; TOTAL 16/700; PLANNED / EACH 11.5.
- **Round stamp** 110: rings 3 / gap / 8.5 `#2e9a74`, rotated −14°, text "BALANCES · PAID · IN FULL" (9/800 +.14em and 24/800). Tapping it opens Balances (7.16) read-only.
- Wallet sticker 70.

**8.13 Cover**
- Presenter row: 32 `#ffd84a` Tokek, "Tokek presents" 14/600, "Bali, the recap · ♪ gamelan lo-fi" 11.5 muted.
- Polaroid: 228×270, padding 8 8 36, rotated −5°, Borel 13 caption.
- Sticky note: `#d8f3ff` (**OFF-TOKEN**), Borel 15 `#2f5fc4`, rotated 9°, a tape strip of white .75.
- A second photo 150×180, radius 14, rotated 8°.
- Place tags (sky, pink). Stickers: sun 44, plane 62, camera 48. Gecko 140 cheer **floating** (4600 ms).
- "Bali" 96/800 −0.06 / .9 (**OFF-TOKEN**). Tags: "8 days" sun, "6 of you" mint, "1 volcano" tangerine.
- "Tap to start · hold to pause".

**8.14 Postcard** (all 8 segments done)
- "Last card" 13/600; "Send it home" 30/700.
- Back of the card: 320×210, `#fffdf6`, radius 10, rotated 4°.
  - Divider `#e3dccb`; Borel 13.5 message.
  - Stamp box 52×62, 2 px dashed `#d6ccb6`, holding the rare gecko 46.
  - Postmark 58 with rings `#e07a2a`, "DPS", rotated −14°.
  - Three address lines.
- Front of the card: 320×216, white frame 8, radius 12, rotated −4°. Photo with Borel 15 "Greetings from" and 64/800 "BALI".
- Volcano sticker 58.
- Segmented 42 high, radius 21 (**OFF-TOKEN**: 40 / 20): Postcard / Story 9:16 / Poster.
- Ink pill "Send to the crew"; white 50-high, radius-25 button "Mail a real one to each of you" with a "Pass+" sun tag (radius 7, 11/800).

### 8.12 Trip journal: one photo pocket per day

- Title 30/700 (**OFF-TOKEN**: `largeTitle` 32). On the right: glass search 44 and ink "+" 40 (Root pattern).
- Segmented at y 116: "Best · 24" / "All · 312" / "By person".
- **Tokek note bar**: inset 16, glass `.66`, blur 20, radius 22, padding 8 14 8 8. Avatar 36 `#fff3c4` with the point pose; 13 / 1.38 `#3d404c` with "Tokek" in bold.
- **Pockets**: 2 columns, gaps 22 / 12.
  - A 150-high stack: two polaroids 84×66 (padding 3, radius 10, rotated −7° / 6°), then a white pocket from y 40 (radius 22) holding:
    - a tag rotated −4° at 11/800;
    - a sticker 44 at top −14, right 6, rotated 10°;
    - a 22 avatar stack (overlap −7).
  - Title 14.5/600 ("Day 4 · Batur sunrise"); count 12 muted.
- Tab bar: Trips active.

### 8.15 A year later: the memory resurfaces

- Full photo with a gradient. Chip "One year ago today" (clear glass, 32 high). ✕ 40 on the right.
- Sun round stamp 96 rotated 12°: "BATUR / 06:02 / 15.10.26".
- "Batur, a year on" 40/800 −0.045 white. Body 15 at .92.
- **Reaction chips**: glass `rgba(255,255,255,.2)`, blur 16, 32 high, padding 0 10 0 4, radius 16, 12.5/600 white, 24 avatar: "♥ 2", "'again??'", "+1".
- CTA: a **white** pill 56 "Plan a reunion" (ink text, the inverted primary on a photo) → new poll in the crew (4.01) with Bali prefilled.
- Text button "Share the memory" `rgba(255,255,255,.85)` → system share with the photo.
- ✕ goes Home.

## 4. Components

### (a) Foundations components used

Glass back circle 44; glass label pill; ✕ glass; segmented control (h 40 / thumb r 16); Ink pill 56; text button 15/600 muted; small ink pill (36–42 here); control pill; sticker tags (rotated, 2.5 white border); round stamps; rectangular stamp ("BEFRIENDED!"); crew avatar and stack; status tags h 24 (booked / vote-open / maybe tints); critter tiers ● ◆ ★ ✦ with "?" for locked; guide note tinted by speaker (Tokek `#fff6c9`, Pon tangerine); Sheet glass (5.05); stat-tile-like recap tiles; photo card frames; composer (guide); tab bar (Tabs rendering); offline state (chip variant); toasts (encounter reminder).

### (b) New components

| Component | Metrics and states | Reused by |
|---|---|---|
| `ChatHeader` | Gradient fade 112 + back 44 + centred 16.5/700 title, 11.5 subtitle + right glass "Map" pill. Subtitle variants: count, typing, read-only, NO SIGNAL chip | Part 3 crew, Part 6 crew map |
| `MessageBubble` | Theirs / yours / guide. Radius 20 with a 6 tail on the last of a run; padding 9 13; 15 / 1.38; max 270 / 300 group; reply quote; mention colour; dark variant | Guide chat, Part 3 inbox previews |
| `DeliveryLine` | Sent (green check) / waiting (clock, row at .55) / failed (pink ring + Retry / Delete) / "Read by N" | Guide (Answered / Read / waits) |
| `StickerMessage` | Sticker 96–112, rotation ±5–6°, caption tag, reactions row; long-press lift to 150 | Part 3 previews, Part 9 sharing |
| `CritterReactionChip` + `ReactionBar` | Chip 24 high; bar 54 glass with 44 cells (doodles) or 46 white cells (critters) + more | 8.15 memory reactions |
| `MessageContextMenu` | 250 wide glass menu, rows 48, separator band, destructive row; blur + scrim backdrop; lifted preview at 1.03 | Any long-press list (4.x plan items) |
| `ChatComposer` | Bar 92 (62 docked); `+` 38; field 40 / r 20; gecko sticker toggle 32 (rest / active); mic 38 ⇄ send; placeholder states; disabled / locked variant | Guide uses the Foundations composer |
| `StickerTray` | Height = keyboard height (392 in the design); tab row 34; set label; 4-column grid of 76 tiles with 68 stickers; locked silhouettes; Recent; "12 of 150" | 8.A "save to tray" |
| `SystemPill`, `OfflineMarker`, `SettledStrip`, `TypingBubble`, `NewMessagesPill`, `UnknownCard` | As in §3 5.12 | Guide (typing) |
| Chat cards | `PollCard` (open / closed / winner), `GuideOfferCard` (open / in / full), `OfferPlaceCard` + `SlotRow`, `ExpenseCard` (new / paid), `ChangesetCard` (needs / applied + Undo / not changed / expired), `ProposalCard` (open / boarded), `MeetupCard` (live / done), `SupplierOrderCard` (held / confirmed / declined + 3-step bar), `BoostCard`, `PhotoGrid`, `VoiceNote` | Part 4 (changeset, proposal, poll), Part 6 (meetup, rides), Part 7 (expense) |
| `QuotaChip` | 30 high: "N left" sun tint / "30 of 30 today" pink / NO SIGNAL tangerine | Part 9 Pass+ |
| `StarterCardGrid` | 2×2, 112 high, r 24, doodle 34 | Part 2 first run |
| `QuickChipRow` | 38 high chips, r 19, doodle 26, scrolls sideways with an edge fade | Part 6 day-of |
| `GuidePlanCard` | Borel intro, struck-old / new rows with ±6° stickers, cost row, two buttons | Part 4 |
| `WorkingStepsCard` | Steps done / active (pulse) / pending, title, Ping me / Stop | Part 6 disruption handling |
| `QueuedQuestionCard` | Sun ring card, "WAITING FOR 00:00", Cancel, editable | — |
| `LimitCard` | Ring 62 conic, Borel line, two buttons, Pass+ handoff row | Part 9 |
| `OfflineToolsCard` | 36 disc, title, chips | Part 6 offline |
| `VoiceStage` | Ping rings, 180 disc, critter 132 bob, Listening pill, transcript, live waveform | — |
| `MenuLabelSticker` | Rotated tag on a camera frame, colour cycling | — |
| `PhraseShowMode`, `DriverPhraseCard` | 58/800 phrase; light card 22/700 with speaker 34 | Part 6 (6.E), Part 9 (help) |
| `DietChipGroup` | 34-high toggle chips; diet preview sticker tags | Part 9 settings |
| Critters | `TierLabel` (● ◆ ★ ✦ + colours), `LockedSilhouette` (mask colour + "?" glyph sized 14–20), `HereNowCard`, `LegendaryBanner` (ink 64), `SetCard` (5 columns), `CountryRow`, `FormGrid` 2×2, `HoldRing` (108 conic), `EncounterStage` (photo + shadow + ping + hop), `CelebrationRays` (700 conic, spin), `Confetti` (Skia), `XPCard`, `QuestRow`, `MonthStrip`, `LegendRow` | Part 6 (encounter entry), Part 9 (pass) |
| Memories | `RecapTile` (stat / photo, rotated), `StoryProgress` (8 × 3 px), `ReceiptCard` (scalloped mask), `RoundStamp` (2–3 rings), `PhotoPocket`, `Polaroid`, `StickyNote`, `PostcardPair`, `GlassReactionChip` | Part 7 (receipt), Part 9 (pass stamps) |

### (c) Critter renderer: can the current one draw the new doodle style?

**Yes.**
- `$Z/doodles.js`, `critters-data.js`, `critters-draw-1.js` and `critters-draw-2.js` are **byte-identical** to `$R/design/*.js` (checked with `diff -q`).
- `@cp/critter-art` (`$R/packages/critter-art`) is a faithful port of those files, with fidelity tests that run the original `design/doodles.js` (`core/design-doodle-kit-reference.ts`).

Attribute mapping:

| Design attribute | Current renderer | Status |
|---|---|---|
| `pose` idle / wave / cheer / think / point / sleep (+ egg `crack`) | `Pose` union in `packages/critter-art/src/core/model.ts`, plus `tilt` / `hop` for kinds without poses; `kinds/guides/gecko.ts` matches the design line for line | supported |
| `sticker="#ffffff"` die-cut edge, width 5, pad +4, drop shadow `rgba(0,0,0,.32)` blur 5 dy 2.5 | `StickerSpec` + `stickerOutline` in `model.ts`, shadowed sub-layer in `backends/skia/render.ts`; `Sticker` defaults to the paper edge | supported (check the edge colour: design `#ffffff`, the app uses `tokens.color.paper.base` `#f4efe4`, §8 Q13) |
| `seed` | `RenderSpec.seed`; `Sticker` defaults to 7, the design default | supported |
| `fill` / `spot` (+ `accent`, `belly`) | `FormSpec.palette` `f` / `dk` / `bl` / `accent` | supported, but only through a `FormSpec`; `Sticker` has no direct `fill` / `spot` props |
| `locked="#hex"` silhouette | `variant: 'mask'` + `maskColor` (`ui/sticker/SilhouetteSlot.tsx`) | supported |
| `blink` | `closedEyes` model + motion runtime | supported |
| draw-on (`anim`: 1500 ms creatures, 700 ms icons, ease-in-out quad) | `drawProgress` shared value | supported |
| sizes up to 220 | buckets `[24, 36, 48, 60, 96, 150, 232, 300]` in `ui/sticker/bucket.ts` | covered |

What has to change (data and tokens, not the renderer):
1. **Epic Tokek palette.** The design uses fill `#ff8fbf`, spot `#d6337f`, cheer pose (Foundations tiers, 8.09). `packages/critter-art/src/forms/designed.ts` has `#ff9a4d` / `#c4623e`; update it.
2. **Locked silhouettes go light.** The design uses:
   - `#e3e4ea` for unfound and epic, on light backgrounds;
   - `#efe2b4` for legendary, on light backgrounds;
   - `#6b5a24` for legendary on ink;
   - `#ffffff` at 50% for the 8.06 ghost.

   `forms/tier-palette.ts` `TIER_COLORS.lockedMask` is the dark `#3a3466` (legendary `#6b5a24`). Retune these and the `SilhouetteSlot` callers. The "?" glyph is a UI overlay, not renderer art.
3. **Tier edge rings** (`EDGE_RING_STYLES`: epic pink 2 pt, legendary gold 3 pt) appear nowhere in Parts 1, 5 or 8. The epic form shows a plain white edge. Likely drop them or switch them off (§8 Q14).
4. Sticker reactions draw critters at 20 / 44 with **no** edge (`blend` default, cropped bust). Tray tabs and avatars crop the 32 gecko to the bottom of a circle. Both need a "bust" layout (bottom-aligned with overflow clipped), which `Sticker` callers can do with a clipping `View`.

## 5. Motion and transition inventory

Springs: Snappy (.30 / .86), Smooth (.45 / 1.0), Lively (.50 / .68). Reduce Motion → 150 ms cross-fades; doodles draw finished; loops stop.

| Trigger | What moves | Properties | Spring / timing | Evidence | Native or custom |
|---|---|---|---|---|---|
| Open chat from Home or Inbox | Page | push | native stack push | — | iOS / Android native |
| Keyboard open / close | Composer, list inset | translateY with the keyboard frame; list keeps its bottom offset | follows the keyboard (interactive) | derived (§3) | Reanimated `useAnimatedKeyboard` (exists) |
| Sticker button | Keyboard ⇄ tray | tray slides in at keyboard height; the gecko button fills ink | Smooth | 5.08 | custom |
| Send a sticker | New sticker in the list | "a little pop": scale .6 → 1 with the rotation settling from 0 to ±6° | **Lively** (Foundations: stickers) | none in the design (5.09 is static, `$SP/film/05-lane/strip8.png` diff = 0) | custom Reanimated |
| Sticker arrives from someone else | Same pop, plus a soft haptic | — | Lively | proposed | custom |
| Long-press a message (5.04) | Backdrop blur + scrim; bubble lifts to 1.03 with a deeper shadow; reaction bar and menu fade and scale in from the bubble | blur 0 → 14, scale, opacity | Snappy in, Smooth out | 5.04 frame | custom (custom bar, so not `UIContextMenu`) |
| Long-press a sticker (5.09) | Sticker grows 96 → 150 in place; light frosted backdrop | scale 1.56 | Lively | 5.09 frame | custom |
| React | Chip appears or count bumps | scale .8 → 1 | Snappy | — | custom |
| Poll vote | Fill width; your avatar joins the stack | width, insert | Snappy | 5.01 every tap | custom |
| Offer claim | "I'm in" pill → "You're in · 1 left" tag | cross-morph | Snappy | board | custom |
| Changeset reaches 3 yeses | Card swaps state to CHANGED (eyebrow colour, strike-throughs) | cross-fade | 150 ms fade token | board | custom |
| Delivery waiting → sent | Opacity .55 → 1; status swaps | fade | Smooth | 5.03 | custom |
| Typing dots | Three dots wave | opacity .35 / .6 / .85 cycling | loop about 1.2 s | 5.12 (static) | custom |
| New messages pill | Pill slides up from the composer; tap scrolls to the first unread | translateY, opacity | Smooth | 5.12 | custom |
| Guide gecko (5.13) | Bob, plus draw-on at mount | ty 0 → −6 → 0, 2400 ms in-out loop; draw-on 1500 ms ease-in-out quad | loop | `$SP/film/05-lane/combo.png` (top row) | Reanimated loop + Skia `drawProgress` |
| Voice listening (5.15) | Two ping rings + bob | scale .6 → 1.5, opacity .8 → 0, ease-out 2200 ms, second ring delayed 1100; bob 2400 | loop | `combo.png` (bottom row) | custom |
| Working step (5.18) | Active dot pulse | scale 1 → 1.07 → 1, 1600 ms | loop | `$SP/film/05-lane/strip17.png` | custom |
| Guide answer streams | Words reveal; the plan card rises 16 → 0 | — | Smooth | not drawn; current word-by-word reveal | custom (exists) |
| Sheet (5.05 / 5.07) | Sheet up, page behind | — | Smooth | — | native form sheet where possible |
| Phrase show mode (5.23) | Full-screen cover, brightness to max | fade / scale | Smooth | — | native modal + brightness |
| Critter detail (8.02) | Sticker float | ty 0 → −9, r −2° → 2°, 4200 ms in-out | loop | 8.02 HTML | custom |
| Dex → detail | Here-now sticker → detail hero sticker | shared element | Smooth (Foundations 1.05 zoom) | proposed | custom |
| Encounter (8.03) | Hop + ground ping | hop over 2800 ms: sy .9 at 10%, ty −14 / sy 1.05 at 22%, land sy .94 at 34%, rest at 42%; ping ellipse scale .6 → 1.5, opacity .8 → 0 over 2400 ms | loop | `$SP/film/08-lane/combo.png` (top row; also shows a blink) | custom |
| Hold to befriend | Ring fills; haptics ticks | conic progress | linear with the hold; release springs back Smooth | 8.03 | custom (Skia sweep) |
| Befriended (8.04) | Rays spin; confetti burst; sticker hop; **stamp lands** | rays 360° in 24 s linear; 46 pieces from (.5, .32); stamp | Lively (Foundations 1.07 stamp drop) | `$SP/film/08-lane/combo.png` (bottom row) | custom (Skia confetti) |
| Hatch (8.05) | Mint rays 26 s, confetti 40, egg halves, hop 2400 | — | Lively for the reveal | 8.05 HTML | custom |
| Story cards (8.10–8.14) | Progress fill per card; tap to next; hold to pause; swipe down closes | width over 5 s; card cross-fade | linear progress; Smooth close | 8.10 HTML | custom (exists) |
| Recap stickers (8.10 car, 8.13 gecko) | Float 4200 / 4600 ms | as 8.02 | loop | HTML | custom |
| Creature blink | Eyes closed for 150 ms every 2.6–6.2 s | swap of the closed-eye model | — | doodles.js `startBlink` | exists (motion runtime) |

## 6. Native platform surfaces

No widget, Live Activity or lock-screen design appears in Parts 5 or 8. The screens imply these:

- **Chat push.** The current `targets/notification-service` already sets the sender identity and avatar (communication notifications), and `cp-notifications` handles delivery.
  - Sticker messages need a push body. Proposal: "Jordan sent a sticker: YES PLS", with the sticker PNG attached by the service extension (§8 Q15).
  - Reactions with critters need copy, e.g. "Maya reacted with Tokek".
- **Guide "Ping me"** (5.18) and the **midnight answer** (5.20, "lets you know quietly").
  - iOS: the answer is a `passive` interruption-level notification.
  - Android: a low-importance channel.
  - New notification kinds are needed (backend gap).
- **Encounter reminder** "Remind me at 07:00" (8.06) and **legendary reminders** (8.08). Local notifications; they exist (`features/critters/encounter/quiet-reminder.ts`, `features/critters/legendary/legendary-view.tsx`).
- **A year later** (8.15) arrives as a push that deep-links to `memory/[memoryId]`. It exists (`features/recap/memory`).
- **Mic permission** (5.05): Open Settings → iOS app settings and Android app details (`cp-permissions` exists).
- **Brightness** (5.23): reuse `use-full-brightness.ts`. Android uses the window brightness attribute.
- **System share** (8.09, 8.15, postcard) and **Copy sticker as image** (5.09): use the pasteboard image API (`expo-clipboard` `setImageAsync`).
- **App Store / Play page** for the unknown card's Update (exists).

## 7. Logic and backend gaps (design needs data the app lacks)

1. **`sticker` message kind**: domain `MESSAGE_TYPES`, API `services/api/src/commands/chat/send-message.ts`, sync schema and the mobile PowerSync schema regen. Payload `{critterId, formId?, pose, caption}`. Evidence: the board text "Not in MESSAGE_TYPES yet: needs adding" (5.D) and `packages/domain/src/chat/message-types.ts`.
2. **Critter reactions**: `message_reactions.emoji` is validated as a pictographic emoji (`isReactionEmoji` in `packages/domain/src/chat/validation.ts`), so critter ids are rejected. Allow `critter:<id>` values or add a column. The 5.04 doodle set (heart, star, flame, check, spark) can stay emoji-backed (❤️ ⭐ 🔥 ✅ ✨) and be drawn as doodles client-side. Evidence: 5.01, 5.09.
3. **"Read by N"**: per-member read markers exist only for unread counts. Expose the per-message read count to members in sync. Evidence: 5.01, 5.08.
4. **Pin to the trip / Add to Day N** from a message: new commands. Evidence: 5.04.
5. **Ask to rejoin / Remove chat** for former members: a rejoin request to the organiser, plus a local hide. Evidence: 5.06.
6. **Settled strip** is posted once when the last payment lands. Today it is only a UI variant (`ui/chat/ChatRichCard.tsx`), so a system message must be emitted from money settle. Evidence: 5.12.
7. **Guide working steps**: the server must stream labelled tool steps (done / active / pending) and support "ping me when done" (push) and Stop. Today `features/guide/chat/data/turn-state.ts` has only a filler line. Evidence: 5.18.
8. **Edit a queued question** before midnight (an update command on the queued turn). Evidence: 5.20.
9. **Offline phrasebook / emergency numbers** packaged per destination. Check whether the offline pack includes phrases; the copy says "Saved on this phone for Bali". Evidence: 5.17.
10. **"Too big for this signal"** as a failure reason for media sends (client-side, by connection type and size). Evidence: 5.03.
11. **Data change**: the epic Tokek palette (§4c). **Token change**: locked silhouette colours (§4c).

Front-end only, no backend: the `meetup` and `supplier_order` cards (the kinds exist), the starter prompts, the counted New messages pill, the quota chip as "N left", the brightness in show mode, and "Share with the crew" posting the befriended sticker. The last one depends on gap 1.

## 8. Open questions

1. **Two chat chromes.**
   - 5.01-style: gradient-fade header, "Map" label pill, 92 composer with a 38 `+`, gecko sticker toggle and bare mic.
   - 5.02-style: blur bar with hairline, pin-icon button, 96 composer with a control `+` and the mic inside the field.

   Recommendation: 5.01 for all crew-chat states. Founder to confirm.
2. **Send affordance.** Composer A shows no send button. Assume the mic morphs into a 32–38 ink send button when text exists (iMessage-like). Return key = newline.
3. **Tokek's colour.**
   - Avatar: `#fff3c4` in the crew chat (5.01, 5.10), `#ffd84a` in the guide (5.14, 5.16, 5.20).
   - Bubble: white in 5.02 and 5.17, `#fff6c9` in 5.01.

   Pick one rule. Suggestion: tinted bubble when Tokek speaks in the crew chat, white in its own thread; avatar `#fff3c4` in the crew chat, `#ffd84a` in the guide.
4. **Offline indicator.** A header chip (5.03, 5.17) versus the Foundations top ink pill "Offline · changes send when you're back". Chip for chat and guide?
5. **5.05 permission sheet** uses ✕ only, not Cancel + verb, and 5.07 uses a solid `#f5f5f7` floating sheet, not Sheet glass. Align both to Sheet glass r 46?
6. **Sticker captions.** Each pose has a label (hi! / yes pls / hmm / omw / zzz, "YES PLS", "NOOO"). Are captions fixed per pose, editable, or per critter set? Localised?
7. **`locked=true`** in the 5.08 tray renders black (an invalid colour in the design). Use `#e3e4ea`, like 8.01?
8. **Guide header.** A back chevron on 5.13, 5.17, 5.18 versus ✕ on 5.14, 5.19, 5.20, 5.21. The route is `(modal)`. Use ✕ everywhere (Foundations: full screen / modal) or a chevron?
9. **5.22 keyboard.** Does Save dock above the keyboard or hide while typing?
10. **5.23 phrase show mode** is dark with ✕ at the top right. Foundations says phrase cards stay light and ✕ goes top-left. The same ✕-right appears on 8.06 and 8.15, and the story ✕ is on the right in 8.13 and 8.14. Story and photo screens may be meant to put ✕ on the right; confirm.
11. **No exit drawn** on 8.04, 8.05 (CTA-only celebrations), 8.09 (recap) and 8.10 / 8.11 (story; swipe down only). Add a ✕ or back?
12. **8.07 Crew quests** shows the tab bar with Pass active and no back button, but it is reached from a trip. Root under Pass, or a Push with a hidden tab bar?
13. **Sticker edge colour.** The design uses `#ffffff` everywhere (Foundations: "white sticker edge"); the current `DEFAULT_STICKER_EDGE` is paper `#f4efe4`. Switch to white?
14. **Tier edge rings** (epic pink / legendary gold) are not drawn in the redesign. Drop them?
15. **Sticker push body** and whether the notification service attaches the sticker image.
16. **Off-token type sizes to map or keep**:
    - headers: 16.5/700 and 17/600 (vs `navTitle` 19/700);
    - display sizes: 20, 24, 30, 36/800, 38/800, 40, 44, 56, 64, 96;
    - guide voice: Borel 12, 13, 13.5, 14, 16 (token is 15).
17. **Off-token colours.**
    - Borel speaker colours: `#6b5a24` (Tokek), `#8a4a12` (Pon), `#1f6b4c` (field notes, green). Make them guide tokens?
    - Tints and accents: `#ffe9d6` (boost), `#fff8dc` (legendary tiles), `#d8f3ff` (sticky note), `#b9bbc4` (dex "/150"), `#d6d7dd` (story bars).
    - Report pink `#e0468e` vs destructive `#d6337f`.
    - `#e9eaee` as a segmented track.
18. **Off-token geometry.**
    - Nav glass at `.62` / blur 18 (Foundations lists it as the nav-button variant, so acceptable).
    - Clear-ish photo buttons `rgba(255,255,255,.2)` / blur 16 on 8.02, 8.03, 8.06, 8.15 vs Clear glass `rgba(18,20,28,.30)` / blur 24.
    - Fields 46 / r 16 vs 52 / r 18; buttons 54 vs 56; route pill r 12; segmented 42 / r 21.
19. **Stale labels.** Frame labels 5.09 / 5.10 / 5.11 / 5.19 inside the inline frames should read 5.14 / 5.15 / 5.16 / 5.24 (design-file fix, for the founder or the design owner).

```
Status: DONE_WITH_CONCERNS
Summary: Exact build spec for 39 phones (5.01–5.24 with the 5.D board, 8.01–8.15): layouts, tokens, every tap, the composer, keyboard and tray behaviour, every chat card state, motion with filmstrip evidence, and the critter renderer check. The current @cp/critter-art already draws the new doodle style (byte-identical design sources); only the epic palette, the locked silhouette colours and the edge rings change.
Concerns/Blockers: The design draws two chat chromes and no keyboard-open or "sticker lands" motion, so §3 derives those. Stickers in chat and critter reactions need backend changes (§7). Several header and exit inconsistencies need a founder call (§8 Q1, Q8, Q10–Q12).
```
