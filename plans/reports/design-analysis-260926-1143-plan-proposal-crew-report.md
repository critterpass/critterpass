# Design analysis: Plan / Proposal / Crew (3e, 3f, 3g)

Date 2026-09-26. Sources: `design/Critterpass.dc.html` (screens 3e-1..3g-4, captions, tg-motion attrs), `design/Critterpass Prototype.dc.html` (route table + helpers `boardSetup`, `notSure`, `trans`, `toast`, `count`, `flap`, `slideOff`), `design/doodles.js` (tg-motion presets/DSL), screenshots, cross-slice screens (3a-10/11/13, 3b-2/4/6, 3c-5..12, 3j-1/2, 3k-1/9/10, 4b-1/2, 4e-2, 4f-1/2/3, 5a-2/6, 5b-1/4).
Stack-agnostic. "MISSING" = not drawn anywhere in design.

---

## 0. Global motion vocabulary used by this slice (exact values from source)

| Name | Definition | Used on |
|---|---|---|
| tg-motion easing tokens | in `cubic-bezier(.55,0,1,.45)`, out `(0,.55,.45,1)`, io `(.65,0,.35,1)` (default), back `(.34,1.56,.64,1)`, lin | all |
| preset `pulse` | scale 1→1.07→1, 1600ms loop | 3e-2 ghost |
| preset `float` | ty 0/r-2° → ty-9/r2° → back, 4200ms loop | 3f-4, 3f-7 guide sticker |
| preset `rise` | ty14 o0 →(8%) ty0 o1 → hold → (90%) ty-6 o0, 6000ms, stagger 900ms/child | 3f-2 reactions |
| preset `blink` | opacity 1→.25→1, 1200ms (overridden 1400ms) | 3g-2/3g-4 LIVE dots |
| preset `hop` | squash-stretch jump ty-14, 2600ms (2400 on map) | 3g-4 guide sticker |
| preset `ping` | scale .6→1.5, opacity .8→0, ease-out, 1800ms (2000 on map) | 3g-4 own-location dot |
| typing dots | kf `0:ty0;.25:ty-4;.5:ty0;1:ty0`, 1200ms, stagger 160ms/dot | 3g-1, 3g-2 |
| tg-type | 34–40ms/char, +260ms after `, . ?`, reserves final text box (no layout jump), caret blink 480ms alternate | 3g-2 guide reply |
| tg-count | 1s tick countdown, format `dhms` → "3D 23:11:45" | 3f-3, 3f-6 room hold |
| odometer `count()` | 700ms, ease-out cubic (1-(1-k)^3), integer interpolation, formatted `$1,234` | 3f-3/4/7, 3e-3 total |
| `flap()` label swap | rotateX 0→90→0, perspective 300px, 340ms ease-in-out, text swaps at 170ms | CTA price text, ✓/✕, "BOOKED ✓", "FULL" |
| `pop()` | scale 1→1.12→1, 360ms ease-out | votes, pins, chips |
| `float('+1')` | "+1" rises 40px & fades, 800ms | vote taps |
| `slideOff()` | translateX(110%) rotate 4° o→0, 360ms `cubic-bezier(.5,0,.75,0)`, then height collapse 320ms (E) | Pon suggestions, invite LATER |
| screen transitions | push 480ms / pop 420ms; sheet 540ms; rise 620ms (+120ms delay); dismiss 420ms; fade 300ms; underlying screen scales to .93 + scrim .45–.5; E=`cubic-bezier(.32,.72,0,1)` | nav |
| island toast | expands from Dynamic-Island pill (122×35) to 360×62 in 440ms `cubic-bezier(.2,1.25,.3,1)`, children stagger 40ms, auto-hide 2800ms, optional OPEN action, guide sticker icon | all confirmations |
| thud | whole stage translateY 0→5→-2→0, 280ms (pair with impact haptic) | slide-to-board |
| Reduced motion | every tg-motion/doodle checks `prefers-reduced-motion` and renders static | must be honoured natively |

Palette/tokens seen: bg `#17142a`, card `#1f1b38`, chip `#2c2750`, border `#3a3466`, muted `#a9a3c0`, dim `#6f698c`, cream `#f4efe4`, yellow `#ffd84a`, pink `#ff5fa8`, blue `#4f86ff`, green `#54d6a4`, orange `#ff9a4d`. Member colours are stable per person (M pink, A blue, J yellow, R green, D orange, W cream) → member.colour must be a persisted crew-scoped attribute. Day tiles cycle the same palette. Fonts: Archivo 900 condensed (font-stretch 66–78%) headlines, Geist body, Geist Mono time axis, Caveat = guide's handwriting voice (guide messages in chat, suggestion banner).

---

## 1. Slice overview

**User goals**
- Organiser/crew: see trip day-by-day, rearrange days/items collaboratively, accept or reject guide-proposed changes (weather), get group consent for changes.
- Organiser: turn guide's draft into a persuasive proposal, send personalised versions, track who's in, act on guide nudges, handle dropouts with automatic cost/room re-split.
- Invitee: watch trailer, see why the plan fits *them*, privately negotiate cost/dates/plan with the guide, commit with slide-to-board.
- Crew: chat with the guide as a participant (polls, bookings, expenses), decide options live with presence, manage multiple crews, find each other on trip days (live map, meet-up, ETAs).

**Entry points (in)**
| Screen | Entered from |
|---|---|
| 3e-1 Trip plan | Trip hub PLAN card (3k-1); TRIPS tab; "Apply to my plan only" (3e-3) pops back here |
| 3e-2 Day planning | day card in 3e-1; day row in Pon's draft 3c-9 ("Tapping a day opens it in planning mode") |
| 3e-3 Review changes | MOVE IT / tap ghost in 3e-2; implied: forecast-triggered guide suggestion (3k-7/3j-1 produce same swap concept), push notification |
| 3f-1 Build the proposal | BUILD THE PROPOSAL in Pon's draft 3c-9 |
| 3f-2 Proposal trailer | push "Pon · Kyoto: I wrote a version just for you" (5b-1); Inbox "Maya reacted to the Kyoto trailer" (3b-4); invite landing "Just look around first" (3a-10); PREVIEW AS RIN/DEV (3f-1) |
| 3f-3 Your version | trailer ✕; "SEE THE PLAN" on You're in (3a-13) |
| 3f-4 Not sure yet | MAYBE on trailer (sheet over paused trailer) |
| 3f-5 Slide to board | I'M IN on 3f-2 / 3f-3 / 3f-4 (rise transition) |
| 3f-6 Who's in | after SEND (3f-1); Inbox "KYOTO: REPLIES DUE SEP 30"; hosts 4f-1 Seven's a crowd sheet |
| 3f-7 Dev's out | notification/toast "Dev replied to the Kyoto proposal" from 3f-6 |
| 3g-1 Crew chat | crew pill on Home (3b-2/3b-6); "Say hi to the crew" (3a-13); SEND TO CREW (3e-3); PROPOSE TO GROUP (3j-1/3j-2); Ask the crew first (3f-7); Out of questions hint (4b-1); Flight delayed (3k-5); lock screen (3k-3); chat notifications |
| 3g-2 Live collab | voting day card (BOAT DAY) in 3e-1; Inbox "BOAT DAY CLOSES FRIDAY"; vote notification/widget (5b-2, 5c) |
| 3g-3 Crews | crew name ▾ on Home (sheet) |
| 3g-4 Crew map | MAP in chat header; "See him on the map" (3k-10 SOS); tapping crew Live Activity (5a-2) |

**Exits (out)**: 3e-1→3e-2, 3g-2, 3o-4 Share the plan (SHARE), 3k-2 Day-of (today), 3h-3 Getting around (arrival day), 3j-1 guide chat (centre tab button). 3e-3→3g-1 (as vote) / 3e-1. 3f-1→3f-2 preview / 3f-6. 3f-2→3f-5 / 3f-4 / 3f-3. 3f-6→3f-7, 4f-1. 3f-7→3g-1 / 3f-6. 3g-1→3g-4, 3i-1 Balances (VIEW), 3j-1 guide sheet, 4f-2 teaser (unboosted). 3g-3→Home (crew switch), 3a-11 Join with a code, start-crew flow (MISSING). 3g-4→3k-10 SOS, 4f-2, 5a-6 (unboosted "put this on lock screen").

---

## 2. Per-screen specs

### 3e-1 Trip plan ("BALI, DAY BY DAY")
- **Purpose**: trip itinerary overview; day-level reordering; jump into days/votes.
- **UI**: back "← TRIPS"; presence avatar stack (M, A = who is viewing now); SHARE pill; 46px condensed title; segmented LIST / MAP / CALENDAR (only LIST drawn); day cards (64px, r20): coloured day tile (number + weekday), title (Archivo 17), one-line summary (ellipsised), trailing status chip (BOOKED green / "1 VOTE" pink / VOTE pink) or weather doodle (rain/sun/wave). Bottom tab bar HOME · TRIPS(active) · centre guide button (Tokek sticker, 66px yellow) · WALLET · PASS. Day 8 below fold ("DAY 3 / 8").
- **Data**: Trip{destination name, dayCount}; PlanDay{index, date→weekday, colour, title, summary (derived from items), statusChip derived: any booking → BOOKED, open polls count → "n VOTE"/"VOTE", else weather icon from forecast}; presence list.
- **Actions**: tap day → 3e-2 (or 3g-2 when day has an open decision poll; 3k-2 when day == today during trip); long-press/drag day → reorder (spring re-sort); SHARE → 3o-4; segment → Map/Calendar (MISSING); centre button → guide chat.
- **Motion**: days re-sort with a spring when *anyone* drags (remote reorders animate too); open-vote chips pulse softly (use `pulse` preset, 1600ms); a day the guide changed gets a one-off highlight sweep (gradient sweep across card, ~600–800ms, once per unseen guide edit).
- **States**: designed = populated. MISSING: empty plan (no draft yet), loading skeleton, offline/stale ("last synced"), reorder conflict (someone else moved same day), reorder blocked (booked day with fixed date), Map view, Calendar view, day 8 styling, read-only mode for non-editors, trip-in-progress (past days collapsed?).
- **AI**: none generated here; shows guide-touched markers (attribution from ChangeSet author=guide).
- **Realtime**: presence avatars; reorder ops broadcast to all trip participants instantly; vote counts and weather icons update live.
- **Native**: haptic on drag lift / each slot crossing / drop; share sheet (via 3o-4 "Copy a read-only link").
- **Entitlements**: none visible. Reorder by all members or organiser only = open question.

### 3e-2 Day planning ("SLOW UBUD", planning mode)
- **Purpose**: edit one day on a time grid; respond to guide suggestion (rain).
- **UI**: "← DAY 3 / 8", presence avatars; title; rotated "PLANNING MODE" sticker; "Wed Oct 14 · rain 13–15h"; time axis 07..19 (Geist Mono, 2h labels, 68px per 2h → 34px/h → 8.5px per 15-min slot at 390pt); hairline rows every 2h; blocks (r16, coloured, title uppercase + meta line): JATILUWIH TERRACES 07:00–11:00 · driver Made; LUNCH · BIAH BIAH "4 of 6 voted" (narrow, item with open venue vote); original RIDGE WALK 14:00 shown as dashed/struck-through outline ("in the rain"); KARSA SPA (narrow lane, attendees "Maya, Rin"); suggestion ghost RIDGE WALK 17:00 golden hour (yellow, rotated 2°, pulsing, sits in a parallel lane beside the spa); DINNER · LOCAVORE NXT 19:30 table held. Rain band = dotted blue overlay 13–15h with "RAIN" label. Remote cursor: pink arrow + "MAYA" label on the grid. Bottom guide banner (yellow outline): thinking gecko, Caveat "Rain till three. Move the walk?", "Drag it, or tap to accept", MOVE IT.
- **Data**: PlanItem{title, start, end, lane, colour/category, meta (driver name, vote progress "4 of 6", attendees, booking state "table held"), isBooked, attendees[]}; HourlyForecast{precip windows}; Suggestion{itemId, proposedStart/End, reason}; presence{userId, cursor pos}.
- **Actions**: drag block vertically (snap 15 min) and across lanes; resize (implied, MISSING handles); tap ghost or MOVE IT → accept suggestion → ChangeSet review 3e-3 (prototype: original block springs to ghost position 560ms `cubic-bezier(.3,1.3,.5,1)`, ghost fades 300ms, toast "Moved to 17:00. Golden hour, no rain.", after 1.3s push to 3e-3); tap block → item detail (MISSING); add item (MISSING).
- **Motion**: while dragging blocks snap to 15-min rows, others "shuffle out of the way" (collision push/lane reflow, spring). Rain band drifts: kf `0:ty0;.5:ty8;1:ty0`, 6000ms loop (idle drift) + animate to new window when forecast updates. Ghost `pulse` 1600ms. Remote cursor glides (interpolate between presence updates).
- **States**: designed = suggestion pending. MISSING: no suggestion, forecast unavailable, drag onto booked/fixed item (reject + shake?), overlapping travel-time violation warning, overnight items (03:30 pickup day 4 is outside 07–19 → axis must scroll/extend), empty day ("Free day"), offline edit queued, conflicting concurrent edit, read-only viewer, "exit planning mode" (what is non-planning mode? view mode vs 3k-2 day-of).
- **AI**: guide suggestion generated by background weather-replan job (see §5). Output shape: `{itemId, from:{start,end}, to:{start,end,lane}, headline (≤40 chars, guide voice), sub ("Drag it, or tap to accept"), reason, confidence}`. Deterministic validator must check opening hours, travel time, bookings, must-do lock.
- **Realtime**: every drag = op broadcast (throttled preview positions for remote viewers? decide) + commit on drop; presence cursors (~10 Hz throttle); forecast push updates move the band.
- **Native**: haptic selection tick per 15-min snap, impact on drop; long-press to lift; accessibility: VoiceOver adjustable actions "move 15 min earlier/later" (drag is not accessible).
- **Entitlements**: none visible. Does accepting guide suggestion consume a redraft (3/trip free)? open question.

### 3e-3 Review changes ("4 CHANGES FOR THE RAIN")
- **Purpose**: per-change accept/reject of a guide ChangeSet, then either apply to own plan or send to crew for approval.
- **UI**: "← DAY 3–4", RAIN FORECAST tag (trigger label); thinking gecko + headline; summary line ("Tokek rearranged Wednesday afternoon and one dinner. Nothing anyone marked as a must-do was touched."); change cards: check toggle (green ✓ / outlined ✕, rejected card at 60% opacity), old value struck (dim), new value bold uppercase, reason line, affected-member avatar stack. Summary chips: "+$22 EACH" (cost delta), "1 BOOKING MOVED", "0 MUST-DOS TOUCHED" (green). CTA "SEND TO CREW · NEEDS 3 YESES"; secondary "Apply to my plan only".
- **Data**: ChangeSet{trigger, headline, summary, changes[], costDeltaPerPerson, bookingsMoved, mustDosTouched, approvalThreshold=3}; Change{kind (retime/replace/move-day/retime-booking), before{day,time,title}, after, reason, affectedUserIds, costDelta, bookingRef, accepted}.
- **Actions**: tap check → toggle accept (flap ✓↔✕); chips recount; SEND TO CREW → posts ChangeSet as approval vote in crew chat (toast "Sent to the crew. It needs three yeses."); Apply to my plan only → personal-scope apply, pop to 3e-1.
- **Motion**: cards fan in like dealt cards (stagger ~80–120ms, slight rotation settling to 0, spring); toggling flips the check (flap 340ms); totals re-count via odometer (700ms).
- **States**: designed = 3 accepted / 1 rejected. MISSING: all rejected (CTA disabled?), change touching a booking that can't be moved (supplier refused / fee), change with must-do (warning variant), stale ChangeSet (plan edited since generation), approval in progress/approved/rejected/expired states in chat, apply failure, the crew-side vote card itself (not drawn in 3g-1).
- **AI**: headline, summary, per-change reason written by LLM; the set itself from replan job; numeric chips computed deterministically.
- **Realtime**: once sent → approval tally live in chat; auto-apply at threshold; everyone's 3e-1 shows highlight sweep.
- **Native**: haptic on toggle; push to crew "Tokek suggests 4 changes for the rain — needs 3 yeses" with actionable Approve/Reject (5b-2 pattern).
- **Entitlements**: not shown. Booking moves may need paid supplier actions.

### 3f-1 Build the proposal ("PITCH IT TO THE CREW")
- **Purpose**: organiser configures how the plan is pitched and sends personalised versions.
- **UI**: "← KYOTO PLAN", READY TO SEND (green); headline; sub "Pon wrote a version for each person. Pick how it arrives."; 3 format thumbnails (150px, selected = yellow ring): TRAILER (story mock with progress ticks, "10,000 GATES.", tanuki), POSTER (pink halftone "KYO TO", "$1,310 EACH" tag), POSTCARD (cream, "Dear crew,", stamp box). Settings card: toggle "Show cost per person" ($1,310 each, flights included); toggle "Personal versions" (One for each of the 5, written by Pon); row "Reply by  Sep 30 ›"; row "Hold the rooms for  5 days ›" (Free cancellation until then). Chips PREVIEW AS RIN / PREVIEW AS DEV (horizontally scrollable per recipient). CTA "SEND TO 5 FRIENDS".
- **Data**: Proposal{format, showCost, personalVersions, replyBy, holdDays → holdUntil, recipients[]}; PersonalVersion status per recipient; per-person cost; hotel free-cancel deadline.
- **Actions**: select format; toggles; date picker (reply-by), duration picker (hold, bounded by supplier free-cancel window); preview as X → opens that recipient's trailer as sheet; SEND → "SENDING…" flap → push to 3f-6 + toast "Sent. Five personal versions, written by Pon."
- **Motion**: switching format morphs preview (shared-element morph between the three thumbnail styles); send button stamps each friend's avatar onto itself as that person's version finishes generating (progress indicator = avatar stamps with thud).
- **States**: designed = ready. MISSING: generating (per-recipient pending), one version failed/retry, personal versions OFF variant, cost hidden variant, hold not available (no free-cancel rate), reply-by earlier than now, recipients who aren't in app (web link), editing after send (re-send/versioning), organiser preview of own version.
- **AI**: per-recipient generation job (see §5 ProposalVersion). Inputs: final plan, recipient taste profile (quiz stamps: STREET FOOD, SUNRISE CHASER, EASY-ISH PACE), recipient must-do, budget max (private! must not leak into copy), cost model, crew context, guide persona, format. Output JSON: trailer slides, poster copy, postcard letter, highlight picks w/ reason tags, savings suggestion. Background job w/ progress events; no streaming to user.
- **Realtime**: generation progress to organiser; after send → RSVP channel.
- **Native**: push to recipients (communication-style notification with guide avatar as sender, 5b-1); deep link into trailer.
- **Entitlements**: none shown (personal versions not gated). Holding rooms may require payment method.

### 3f-2 Proposal trailer (story, recipient view)
- **Purpose**: emotional pitch; capture fast yes/maybe; see live crew reactions.
- **UI**: full-bleed photo (Fushimi Inari at 6am) with slow push-in; 6 story progress bars (top; current fills linearly 5000ms, `0:sx0 e=lin;1:sx1`, origin left); header tanuki + "PON PRESENTS", "Kyoto · Apr 2–9 · for the Bali Six", ✕. Reactions column right (bubbles w/ avatar: "OKAY WOW", "6AM??", "I'M IN") rising (`rise` 6000ms, stagger 900ms). Slide copy: kicker "DAY 2 · 06:00" (orange), headline "10,000 GATES. NOBODY ELSE." (stamped word-by-word), Caveat tagline "Worth the alarm. Promise."; hint "Tap for Day 3 · hold to pause"; CTAs I'M IN (yellow), MAYBE, chat bubble button.
- **Data**: ProposalVersion.trailerSlides[{dayLabel, time, headline, tagline, photo, planItemId}], reactions live stream, proposal meta.
- **Actions**: tap → next slide (prototype resets progress + toast "Day 3: Arashiyama before the crowds."); hold → pause; ✕ → Your version (3f-3); I'M IN → 3f-5 (rise); MAYBE → 3f-4 (sheet, trailer keeps playing dimmed); chat icon → send reaction/reply (MISSING UI; "Jordan replied '6AM??'" proves text replies exist); swipe down dismiss (implied).
- **Motion**: 5s per slide, Ken-Burns push-in per photo, headline words stamp one at a time (scale-down + thud per word), reactions float up live "while others are watching" (only concurrent-viewer reactions are live; older ones replay?).
- **States**: MISSING: loading/buffering photos, last slide/end card, replay, offline, proposal expired/closed, already responded (show status instead of CTAs), organiser preview mode (preview-as banner), no reactions, muted/sound (music theme? sound unspecified), reduced motion.
- **AI**: slides content from ProposalVersion (pre-generated). Reaction text is user-authored.
- **Realtime**: presence of viewers on proposal; reactions broadcast; view/open events recorded (feed 3f-6 "Watched the trailer twice").
- **Native**: haptic on word stamps (light), audio optional; deep-link/universal-link entry; image prefetch/caching.
- **Entitlements**: none.

### 3f-3 Your version ("RIN, HERE'S YOUR VERSION")
- **Purpose**: personalised explanation + price; commit or ask guide.
- **UI**: "← PROPOSAL"; pink countdown pill "ROOMS HELD 3D 23:11:45" (live); headline with recipient name; sub "Pon rebuilt the plan around what you picked. Tap anything to see why it's there."; 3 highlight cards (colour, doodle icon food/sun/bed, title, "Day n · time/desc", dark reason tag: YOU PICKED STREET FOOD / SUNRISE CHASER / EASY-ISH PACE); share card: donut (cost categories: flights blue ~40%, stays pink ~36%, food green ~14%, fun orange ~10% — matches 3c-5 breakdown), "YOUR SHARE $1,310", toggle "Skip the Nara day and save $64"; CREW HYPE flame + 82% + gradient bar + social proof line ("Maya watched the trailer twice. Jordan replied '6AM??'"); CTAs I'M IN / ASK PON.
- **Data**: ProposalVersion.highlights[{planItemId, title, when, reasonTag, profileTraitId}], personal share + optional savings options, hold expiry, hype score + recent engagement events.
- **Actions**: tap highlight → reason toast in guide voice ("It's there because you picked street food."); toggle skip → share counts 1310↔1246 (odometer) + toast "Nara day skipped. $64 back."; I'M IN → 3f-5; ASK PON → private guide chat (3f-4 or 3j-1 "JUST ME").
- **Motion**: picks slide in one by one, reason tags stamp on; hype bar fill `0:sx0 e=out;.3:sx1` (1.5s fill in 5s loop in mock; real: animate on each reaction); countdown ticks per second.
- **States**: MISSING: hold expired, reply-by passed, personal versions off (generic version), already IN (post-board view), price changed since opened (re-split after dropout), option unavailable, loading.
- **AI**: highlights + reason tags + savings suggestion copy; savings amount computed.
- **Realtime**: hype % and social-proof line update on others' reactions; hold timer server-authoritative.
- **Native**: none special; haptic on toggle.
- **Entitlements**: none. Privacy: social proof exposes others' engagement ("watched twice") to all recipients — consent question.

### 3f-4 Not sure yet (private sheet)
- **Purpose**: private objection handling; guide offers alternatives; organiser sees only "maybe".
- **UI**: bottom sheet (r32, grabber) over dimmed still-playing trailer; lock icon "JUST YOU AND PON" (green); headline "WHAT'S HOLDING YOU BACK?"; floating thinking tanuki (`float` 4200ms); copy "Winston only sees 'maybe'. Pick one and I'll see what I can move."; 2×2 reason chips (THE COST / THE DATES / THE PLAN / SOMETHING ELSE; selected chip filled with per-chip colour yellow/pink/blue/green); options card "TWO WAYS TO BRING IT DOWN": SHARE THE BIG ROOM (Three beds in Shijo, with Maya and Jordan, −$140, toggle), SKIP THE NARA DAY (−$64, toggle); YOUR SHARE $1,170 with struck $1,310; "Rooms held until Sep 30"; CTA "I'M IN AT $1,170" (price follows); link "Still thinking. Ask me on Sunday".
- **Data**: PrivateThread{recipientId, reason, freeText}; PriceOption[{id, label, desc, delta, requires (room swap with named members), available}]; personal share; hold expiry.
- **Actions**: pick reason (radio; prototype responses: DATES "Apr 2–9 is locked, but I can fly you in a day later."; PLAN "Tell me which day bugs you and I'll redraft it."; SOMETHING ELSE "Type it here. Winston won't see it." → free-text input MISSING); options dim to .35 when non-cost reason selected; toggle options → share odometer + CTA flap; I'M IN AT $X → 3f-5 with chosen options; Still thinking → dismiss, schedule guide follow-up Sunday, toast 'Pon will ask on Sunday. Winston only sees "maybe".'
- **Motion**: sheet rises over trailer (trailer keeps playing, dimmed); picking reason → guide "thinks for a beat" (thinking pose ~0.6–1s) then options deal in (stagger); toggles re-count share like odometer (700ms), CTA price flaps.
- **States**: MISSING: DATES/PLAN/SOMETHING ELSE result layouts, free-text entry, no options available ("I can't bring it down, but…"), option requires others' consent (sharing the big room with Maya & Jordan — do they get asked?), loading/thinking, error.
- **AI**: option generation = LLM ranking over deterministic candidate generator (room-sharing swaps, optional-day skips, later flight). Guide lines generated. Free-text objection → LLM classify + respond privately.
- **Realtime**: none to crew (explicit). Organiser status → MAYBE only.
- **Native**: scheduled local/push reminder ("Ask me on Sunday") in recipient TZ.
- **Entitlements**: does this private guide chat count against 30/day questions? (4b-1 says "Your Kyoto plan and the vote don't count" → likely exempt). Open question.
- **Privacy conflict**: 3f-6 PON SUGGESTS says "Alex asked me privately about cost" to the organiser. Contradicts "Winston only sees maybe". Must resolve (see §8).

### 3f-5 Slide to board ("YOUR SEAT'S SAVED, RIN")
- **Purpose**: ceremonial commitment (RSVP = IN, with chosen price options).
- **UI**: header "KYOTO · APR 2–9", crew rail avatars (W M A J) + dashed empty slot, counter 4/6; headline; boarding-pass card (yellow halftone): CRITTERPASS AIR, GATE: YES, SIN ✈ KIX (recipient home airport → destination airport), PASSENGER Rin Sato, SEAT "Window, by Maya", DATES Apr 2–9, YOUR SHARE $1,310, waving tanuki; perforation (dashed) and stub (barcode, BOARDING GROUP: THE BALI SIX, A07); slider track 68px (knob = tanuki in yellow circle, "SLIDE TO BOARD →"); hidden: green fill, "BOARDED", egg "PON'S EGG HATCHES WHEN YOU LAND", confetti.
- **Data**: participant name, home airport IATA, destination airport IATA, dates, share, seat text (source unclear), crew name, boarding group code, crew rail with statuses.
- **Actions**: drag knob; commit threshold p > 0.7 of 282px track; release below → spring back (280ms, cubic ease-out); on commit → RSVP IN persisted → auto-navigate after ~6.2s (prototype: to Who's in + toast "Rin's in. Five of six have boarded.").
- **Motion (exact, 6000ms timeline; drag scrubs 600→2040ms portion)**:
  - 0.6–2.04s: knob tx 0→282 (io); green fill sx 0→1 (io, origin left); "SLIDE TO BOARD" fades out 0.72–1.44s; "BOARDED" fades in 2.04–2.4s.
  - Drag mapping: timeline time = 600 + inv(p)·1440 where inv inverts smoothstep and re-eases (cubic-bezier .65/.35) → scrubbing feels eased.
  - 2.04→2.28→2.64s: ticket thump scale 1→1.03→1 (back) + stage thud 280ms + haptic.
  - 2.28–3.24s: stub tears: translate(30,130) rotate 16° opacity→0, ease-in, origin 20% 0.
  - 2.4s: confetti burst at (50%, 62%), 70 particles, palette colours, gravity .32, life ~110 frames.
  - 3.24–3.72s: egg + label scale 0→1 (back) into the gap.
  - 3.6–3.96s: new avatar R pops into crew rail (s0→1 back); counter cross-fades 4/6 → 5/6 (green) at 3.6–3.72s.
  - Prototype pauses at 5.28s, navigates at ~6.2s.
- **States**: MISSING: commit failure (network) → rollback anim, already boarded, hold expired, accessibility alternative (VoiceOver button "Board"), reduced-motion variant, last person boarding (6/6 celebration?), payment step (is money collected? none shown).
- **AI**: none.
- **Realtime**: RSVP broadcast → organiser 3f-6 segment fill, others' rails/counters update, chat system message?
- **Native**: continuous haptic ramp during drag (optional), success notification haptic + sound at thump; confetti.
- **Entitlements**: none; the egg ties to critter hatch on landing (3l-1) — needs flight arrival detection.

### 3f-6 Who's in (organiser tracker)
- **Purpose**: RSVP tracking + guide nudges.
- **UI**: "← KYOTO PROPOSAL", ROOMS HELD countdown; headline; 6-segment bar (green IN ×4, yellow MAYBE, dark UNOPENED) + legend "4 IN / 1 MAYBE / 1 UNOPENED"; member rows: avatar, name, activity line (Sent Sep 24 / Watched the trailer twice / Replied "6AM??" / Boarded 2h ago / Opened it 3 times / Sent 2 days ago), status chip (ORGANISER / IN / MAYBE / UNOPENED); orange PON SUGGESTS card with actionable rows: "Dev opens things at night. Resend at 21:00 with the ramen crawl up front?" RESEND; "Alex asked me privately about cost. Offer everyone the cheaper room option?" OFFER.
- **Data**: TripParticipant.rsvp{status, updatedAt}, engagement aggregates (opens, trailer completions, replies, open-time histogram), Suggestion[{type resend|offer, text, params}].
- **Actions**: RESEND → schedule re-delivery at recipient-local 21:00 with reordered highlights (lead with ramen crawl) → card slides off; toast "Resending to Dev at 21:00, ramen crawl first."; OFFER → publish cheaper-room option to all recipients (toast "Offered the cheaper room to everyone. Nobody sees who asked."); tap row → member detail (MISSING); invite 7th → 4f-1 sheet (no invite button drawn here).
- **Motion**: segments fill as replies land, each with a small thump (scale + haptic); suggestions slide up when relevant, slideOff when handled (360+320ms).
- **States**: MISSING: all in (6/6 celebration), OUT status chip, reply-by passed (auto-close, unanswered→?), hold expiring soon warning, no suggestions, suggestion dismiss, member left crew, 16-seat boosted layout.
- **AI**: suggestion engine (behavioural + private-signal); resend content re-ordering (regenerate/reorder version).
- **Realtime**: status/engagement updates live; suggestions appear/disappear live.
- **Native**: push to organiser on each reply; scheduled send.
- **Entitlements**: 7th member → 4f-1 "Seven's a crowd" (Boost $12, split 7 ways $1.72). Crew size free 6 / Pass+ 6 / Boost 16.

### 3f-7 Dev's out (dropout re-split)
- **Purpose**: guide proposes plan/cost re-split after a decline; organiser applies or asks crew.
- **UI**: "← WHO'S IN", DEV REPLIED tag; "DEV CAN'T MAKE IT"; floating thinking tanuki; quote card (avatar, reply text, "Dev · replied to your proposal · 2m"); "WHAT PON WOULD CHANGE": RYOKAN, ROOM 3 ("Jordan and Dev" struck → released. Jordan joins Winston and Alex; the rooms sleep three.), SHIJO APARTMENT ("split six ways" → split five. Same three bedrooms.), NINTENDO LOTTERY ("six entries" → five. Dev's is withdrawn.); yellow EVERYONE'S SHARE $1,334 (struck $1,310) "+$24 EACH"; toggle "Keep Dev in the chat — He'll still get the photos and the recap" (on); CTA APPLY CHANGES; link "Ask the crew first".
- **Data**: decline reply (free text + intent), ChangeSet(trigger=dropout){room reassignment, booking release, split denominators, external entries}, new per-person share, crew membership flag.
- **Actions**: APPLY → execute ChangeSet (release room via supplier cancellation within free window, update RoomAssignment, recompute shares, withdraw entry = task/manual?) → back to 3f-6, toast "Re-split for five. $1,334 each."; Ask the crew first → posts ChangeSet to chat 3g-1 as vote; toggle keep-in-chat.
- **Motion**: Dev's avatar slides out of crew row, others close gap (row not drawn — MISSING element); changes deal in with old value struck first; share odometer $1,310→$1,334; "Nothing moves until you apply it."
- **States**: MISSING: cancellation fee/penalty case, hold already expired, dropout after trip booked (non-refundable), re-split exceeds someone's private budget max (must warn without revealing), Dev re-joins, other people's personal discounts (Rin's $1,170) vs "everyone's share", apply failure/partial failure, crew vote outcome.
- **AI**: classify reply intent (decline vs maybe vs question); produce ChangeSet narrative; room reassignment optimiser respects 3c-6 groupings (light sleepers/early risers).
- **Realtime**: after apply, all remaining participants see new share (3f-3 updates), chat system message.
- **Native**: push to organiser "Dev replied"; push to crew on new share.
- **Entitlements**: none shown; Boost freed seat logic (4f-1 "A seat opens if someone drops out" → waitlisted 7th invitee (Sam) should be offered the seat — not in 3f-7; flag).

### 3g-1 Crew chat ("THE BALI SIX")
- **Purpose**: group conversation with the trip guide as a participant; host polls, bookings, expenses.
- **UI**: header ← , crew name, "6 people · Tokek is in this chat", MAP pill; day separator TODAY; incoming bubbles (avatar, r18/18/18/4), poll card (title "SPA ON DAY 3?", "Maya's poll", option rows with fill bars (YES 60% green, MAYBE 20%, NO 0%), voter avatars, counts); guide message (gecko avatar, Caveat yellow text) with action button "I'M IN · 1 SLOT LEFT"; photo message (placeholder "warung lunch"); expense card (wallet icon, "Maya paid Rp 1.08M for lunch", "Split 6 ways · $11.37 each", VIEW); own message (yellow bubble right, "@tokek can we catch sunset somewhere after?"); guide typing dots; composer: + button, input "Message, or @tokek", mic button (cream circle).
- **Data**: Message{sender (user|guide|system), type, body, mentions, attachments, createdAt}; Poll{question, options, ballots}; GuideAction{kind book_slot, capacity 3, takers, price, split}; Expense{payer, amount, currency IDR, splitCount, perPerson in home currency}; unread markers.
- **Actions**: send text; @mention guide → guide replies (streamed); vote in poll (pop + "+1"); tap guide action → join slot; when capacity filled guide books & splits (prototype: button flaps "BOOKED ✓", slot chip "FULL", toast "Booked Karsa Spa at 14:00, split four ways."); VIEW → Balances 3i-1; + → attach menu (photo/poll/expense/location — MISSING); mic → voice note or hold-to-talk to guide (MISSING); MAP → 3g-4 (trip days, boosted) or 4f-2 teaser.
- **Motion**: new messages rise in with soft spring; poll bars slide when a vote lands; guide typing dots are "the only thing allowed to bounce" (kf ty -4, 1200ms, 160ms stagger).
- **States**: MISSING: empty crew chat (new crew), loading history/pagination, send failure/retry, offline outbox (3k-4 shows "sends when you're back"), guide unavailable/limit (4b-1 hint: "Maya has Pass+. Ask in the crew chat and Pon answers there"), moderation/report, message reactions/replies/edits/deletes, poll closed/result, guide action expired/full, photo upload progress, mentions autocomplete, read receipts.
- **AI**: guide replies to mentions (streamed, tool-using: search places, check availability, book, add expense, create poll, propose plan change); proactive guide posts on poll activity (availability offer). Output types: text | action card | poll | plan-change card.
- **Realtime**: messages, typing (user + guide), poll tallies, guide action takers, unread counts; SSE/WebSocket per crew channel; guide streaming tokens fan-out to all members.
- **Native**: push (per 5b-4 default "Mentions only" for crew chat; guide messages as communication notifications with guide avatar); photo picker/camera; mic permission; share extension (MISSING); notification reply action.
- **Entitlements**: guide in chat vs 30/day free quota; live map gated (Boost).

### 3g-2 Live collab ("BOAT DAY: PICK ONE")
- **Purpose**: real-time group decision on a day option with presence, comments, guide mediation.
- **UI**: "← DAY 5 · FRI OCT 16"; presence "● MAYA, ALEX HERE" (pink blink 1400ms); headline; two option cards side by side (photo, name, "45 min boat · $38", voter avatar stickers + count; leader = blue fill + yellow ring + LEADING tag); remote cursor (orange arrow + "ALEX" label) gliding over cards (mock path loop 7000ms: (0,0)→(-120,40)→(-60,120)→(10,60)); comment thread card "ON: KELINGKING VIEWPOINT" (anchored to a POI within option): Jordan's comment, "+1 from Rin · 4m", guide reply typing in via tg-type ("Broken Beach is a flat ten-minute walk from the car. I added it as Jordan's route."), KEEP IT / UNDO; "Maya is typing" with dots.
- **Data**: Poll(day-scoped){options[{placeId, photo, travelTime, price}], ballots}; Comment{anchor (optionId/POI), author, text, +1s}; GuideEdit{changes (per-person route variant), undoable}; presence{viewers, cursor, typing}.
- **Actions**: tap option → vote (pop, "+1" float; vote sticker lands; LEADING hops to leader); comment/+1 (compose MISSING); KEEP IT → confirm guide change (toast "Kept. Nusa Penida it is." — copy odd); UNDO → revert guide change.
- **Motion**: cursors glide; votes land as avatar stickers with pop; LEADING tag hops to new leader (hop preset-like); typing dots; guide reply writes itself in.
- **States**: MISSING: tie, poll closing/closed + result applied to plan, >2 options layout, no photo, comment composer, viewer alone (no presence), vote change/retract, poll deadline display ("closes Friday" per inbox).
- **AI**: guide reads comments and proposes accommodations (accessibility need → alternate route for one member) and applies with undo; streamed text.
- **Realtime**: cursors (ephemeral, throttled ~10–15 Hz), presence, typing, ballots, comments, guide edits.
- **Native**: haptic on vote; push "Boat day closes Friday" reminders; widget/lock-screen voting (5b-2, 5c) must write to same poll.
- **Entitlements**: voting free for everyone (4e-2).

### 3g-3 Crews (sheet)
- **Purpose**: switch between crews, answer crew invites, join/start crews.
- **UI**: sheet over dimmed Home; "YOUR CREWS" + JOIN WITH A CODE pill; crew cards: avatar stack (up to 6 shown), unread badge (pink "5 NEW" for active crew, dark "1 NEW"), name, status line ("Bali in 16 days · Kyoto vote in the final" / "Lisbon, June 2024 · nothing planned"), last message preview with chat icon; active crew outlined yellow; invite card (dashed): inviter avatar, "RAMEN CLUB", "Dev invited you · 4 people, talking about Tokyo", JOIN / LATER; START A CREW card ("Name it and share the code. The guide comes with the first trip.").
- **Data**: memberships[], per-crew unread count, last message, trip status summary (derived), pending invites.
- **Actions**: tap crew → set active crew, dismiss, Home cross-fades into crew (its trip + guide theme); JOIN → "JOINED ✓" (toast "You're in Ramen Club. Dev is thrilled."); LATER → slideOff (invite stays retrievable? "Invites sit here until you answer them" vs LATER removing it — ambiguity); JOIN WITH A CODE → 3a-11; START A CREW → create flow (MISSING).
- **Motion**: unread counts tick down as you read; crew switch cross-fades Home (guide colours/sticker change).
- **States**: MISSING: single crew, no crews (first run), start-crew form + code share, leave crew/archive/mute, crew settings (rename, members, remove), >N crews scrolling, invite expired, crew full (7th → boost).
- **AI**: none (status line could be templated).
- **Realtime**: unread counts, last message, new invites appear live.
- **Native**: share sheet for crew code/link; universal links; push for invites.
- **Entitlements**: max crews per free user not specified; crew size limits (6/16).

### 3g-4 Crew map (trip days, live)
- **Purpose**: see where everyone is, coordinate meet-up, ETAs.
- **UI**: full-bleed dark custom-styled map (Ubud); floating header pill: "← CHAT", crew name, "5 of 6 sharing · trip days only", LIVE (green blink); meet-up pin (yellow, star, "CAMPUHAN RIDGE / MEET 17:00"); guide sticker hopping near meet-up; person pins (dark capsule with member-colour border): clustered "MAYA + RIN · Karsa Spa", "ALEX · Warung Pondok", "JORDAN · On the scooter · 2 km"; own location blue dot with ping; dashed route to meet-up; dotted trail behind Jordan; bottom panel: MEET-UP · 17:00, CAMPUHAN RIDGE, MOVE IT; rows per person/cluster (avatar(s), name, status "Leaving Karsa Spa" / "Finishing lunch, 900 m" / "On the scooter, 2 km out" / "Paused sharing at 14:00", ETA clock 16:52 / 16:55 / 16:49 / –); PING ALL / I'M ON MY WAY; footer "Sharing switches itself off on Oct 19 at midnight."
- **Data**: LocationShare{status, pausedAt, window}, latest positions (lat/lng, accuracy, speed, activity type, place name), MeetUp{place, time}, ETA per member, trail points.
- **Actions**: tap pin → pop + details toast; drag meet-up pin / MOVE IT → relocate (notify crew, recompute ETAs); PING ALL → notify all ("Pinged everyone: Campuhan Ridge at 17:00."); I'M ON MY WAY → broadcast status + own ETA ("The crew can see you coming. 11 minutes." → likely starts crew Live Activity 5a-2); pause/resume own sharing (MISSING control); "put this on the lock screen" (referenced by 5a-6, MISSING on this screen).
- **Motion**: pins glide between updates; pins bunch/cluster when co-located; trail while moving fast (vehicle); ETAs recount every minute; meet-up pin pulses (ping) once everyone < 5 min away; LIVE dot blink; guide hop.
- **States**: MISSING: location permission denied / only "while using" (degraded), precise location off, member paused (designed as row only), stale location (last seen X min ago), no meet-up set (create meet-up flow), offline, low battery mode, outside trip days (map disabled explanation), unboosted (4f-2 teaser designed), SOS pin state (3k-10 cross), arrival state ("Arrived"), GPS inaccuracy/indoors.
- **AI**: status strings could be templated from activity+POI; guide presence decorative. No LLM required.
- **Realtime**: location fan-out to trip participants only, during window; ETA recompute 60s; meet-up changes; pings.
- **Native**: location (foreground + background), motion/activity recognition ("On the scooter"), reverse geocoding/POI lookup, maps SDK with custom style, Live Activity (crew converging) + push-to-update, time-sensitive notifications (PING ALL), battery-aware updates, geofence at meet-up (arrived), haptics on ping.
- **Entitlements**: Live crew map = Boost only (4e-2: Free –, Pass+ –, Boost ✓). Bali = first trip free (boost trial). Unboosted → 4f-2 grey preview teaser. Crew Live Activity on all phones = Boost (5a-6); own leave-by Live Activity free.

---

## 3. Feature list

| # | Feature | Description | Screens | Cx | Why | Depends on |
|---|---|---|---|---|---|---|
| F1 | Trip plan overview + day reorder | Day list, derived chips, weather icons, drag reorder w/ spring, presence avatars, guide-touched sweep | 3e-1 | M | list + reorder simple; booking/date constraints add edge cases | Plan model, realtime, weather |
| F2 | Plan views: Map & Calendar | Segments on 3e-1 (not designed) | 3e-1 | M | undesigned; reuse map component | F16 map comp |
| F3 | Day timeline editor | 15-min snap grid, lanes for subgroups, collision reflow, remote cursors, rain band overlay, fixed/booked items | 3e-2 | XL | custom gesture grid + collision + multiplayer + a11y alternative | F17, F18 validator |
| F4 | Weather watch & guide replan suggestions | Background forecast watch → LLM+solver suggestion → ghost + banner | 3e-2 | L | job infra + LLM + deterministic validation | weather API, F18, LLM |
| F5 | ChangeSet review & approval | Per-change accept/reject, recomputed deltas, apply personal vs send to crew w/ quorum, auto-apply | 3e-3 (+3c-12, 3j-1, 3k-5, 3f-7 reuse) | L | shared diff model, quorum, conflicts vs base version | F3, F13 chat, F18 |
| F6 | Proposal builder | Format choice, toggles, reply-by, hold duration, preview-as, send w/ generation progress | 3f-1 | M | UI + config; progress via job events | F7, booking holds |
| F7 | Personalised version generation | Per-recipient LLM content (slides, poster, postcard, highlights, reasons, savings) grounded in plan/profile/cost | 3f-1/2/3 | XL | N parallel LLM jobs, schema validation, grounding, eval, regeneration on changes | LLM, taste profiles (3a-4), cost engine |
| F8 | Story trailer player | 5s slides, progress bars, tap/hold, Ken-Burns, word stamps, live reactions | 3f-2 | L | media prefetch + choreography + realtime overlay; web parity for invite link | F7, photos source, realtime |
| F9 | Your version page | Highlights w/ reasons, share + savings toggle, hype meter, hold countdown | 3f-3 | M | mostly display + odometer | F7, F18 |
| F10 | Private guide objection sheet | Reason picker, option generation, repricing, CTA price, scheduled follow-up, strict privacy | 3f-4 | L | private data boundary + candidate generator + LLM | F18, LLM, scheduler |
| F11 | Slide-to-board RSVP | Scrubbed 6s choreography, commit threshold, haptics, confetti, crew rail update | 3f-5 | M | bespoke gesture-driven animation + a11y fallback | RSVP API |
| F12 | RSVP tracker + engagement + nudges | Status segments, activity lines, guide suggestions (smart resend time, offer to all), scheduled delivery | 3f-6 | L | event tracking, TZ-aware scheduling, suggestion rules, privacy | analytics events, notifications |
| F13 | Dropout re-split | Decline intent → recompute rooms/bookings/splits/entries → apply or ask crew; keep-in-chat | 3f-7 | XL | money + supplier cancellations + room optimiser + partial failure handling | F5, F18, booking APIs (3h), rooms (3c-6) |
| F14 | Crew chat with guide participant | Messages, rich cards (poll, expense, guide action, photo, changeset, boost), mentions, streamed guide replies, typing, unread | 3g-1 | XL | chat infra + guide agent w/ tools + moderation + offline outbox | realtime, LLM agent, 3i expenses, bookings |
| F15 | Live collaborative decisions | Presence, cursors, polls w/ leader, anchored comments + +1, guide accommodation edit w/ undo | 3g-2 | L | ephemeral presence + cursor mapping on mobile + undoable guide edits | F17, F5 |
| F16 | Crew live map | Location sharing window, pause, pins/clusters/trails, meet-up pin (drag), ETAs per minute, ping all, on my way, auto-off | 3g-4 | XL | background location, battery, platform policies, routing costs, privacy | maps SDK, routing API, Live Activities (5a), entitlements |
| F17 | Realtime presence/sync layer (shared) | Channels per plan/poll/chat/proposal/location; presence; ops w/ versions | all | L | foundation for many slices | backend realtime |
| F18 | Cost/share & constraint engine (shared) | Shared vs individual cost components, per-person options, re-split, rounding; itinerary constraint validator | 3e-3, 3f-3/4/7 | L | correctness-critical, used by 3c/3i | 3c-5 budget, 3c-6 rooms, 3i |
| F19 | Multi-crew management | Crews sheet, unread per crew, invites (join/later), join by code, start crew, context switch theming | 3g-3 | M | lists + invites; start flow undesigned | 3a-11, auth |
| F20 | Guide autonomy & undo policy (shared) | Rules for what guide may change unasked (with KEEP/UNDO) vs must propose | 3g-1, 3g-2, 3e-2 | M | policy + audit trail | F5 |

---

## 4. Data model contributions

- **Crew** {id, name, code (6 chars, unique, rotatable), createdBy, createdAt, activeTripId?, guideId (derived from activeTrip), boostState}. Rel: 1–N CrewMember, Trip, Message.
- **CrewMember** {crewId, userId, role organiser|member, colour (stable), joinedAt, status active|left|removed, chatMuted, lastReadMessageId, notificationPrefs}. Note: dropout keeps crew membership ("Keep Dev in the chat") → crew membership ≠ trip participation.
- **CrewInvite** {id, crewId, inviterId, inviteeUserId|contactHash|link, status pending|accepted|later|declined|expired, createdAt}.
- **Trip** {id, crewId, destinationId, guideId, startDate, endDate, tz, currency, status voting|drafting|proposed|confirmed|live|done, planVersion, entitlement none|trial|boost|boost_all_year}.
- **TripParticipant** {tripId, userId, rsvp unopened|opened|maybe|in|out, rsvpAt, chosenOptions[], share (money), homeAirport, boardingGroupCode, seatLabel?, waitlisted (7th, Sam)}.
- **PlanDay** {id, tripId, index, date, title, colour, order, summary (derived or LLM), lockedByBooking}.
- **PlanItem** {id, dayId, title, subtitle/meta, start, end (tz-aware), lane, placeId, lat/lng, category, outdoor bool, flexibility fixed|flexible, attendees[] (subset), isMustDo, mustDoOwnerId, bookingId?, costModel {perPerson|perGroup|perUnit, amount, currency}, status confirmed|proposed|voting, createdBy user|guide, lastEditedBy, version}.
- **PersonalItemOverlay** (if "Apply to my plan only" = personal fork) {userId, baseItemId|null, overrides} — open question.
- **Poll** {id, crewId, tripId?, dayId?, planItemId?, kind generic|day_option|changeset_approval|destination, question, options[], createdBy user|guide, closesAt, threshold?, status open|closed|applied}; **PollOption** {id, label, placeId, media, meta {travelTime, price}}; **Ballot** {pollId, userId, optionId|decision, castAt, source app|widget|notification}.
- **ChangeSet** {id, tripId, author user|guide, trigger weather|manual|dropout|flight_delay|comment, basePlanVersion, headline, summary, scope group|personal, status draft|sent|approved|rejected|applied|stale|failed, approvalPollId?, threshold, costDeltaPerPerson, bookingsMoved, mustDosTouched, createdAt, appliedAt}; **Change** {id, changeSetId, op retime|move_day|replace|add|remove|reassign_room|release_booking|withdraw_entry|split_change, targetRef, before, after, reason, affectedUserIds, costDelta, bookingImpact {bookingId, action, fee}, accepted bool}.
- **ForecastSnapshot** {placeId|geohash, fetchedAt, hourly [{t, precipProb, precipMm, conditions}]} (cache, TTL 1h).
- **Proposal** {id, tripId, organiserId, format trailer|poster|postcard, showCostPerPerson, personalVersions bool, replyBy, holdUntil, sentAt, status draft|sent|closed, version}.
- **ProposalVersion** {id, proposalId, recipientId, status queued|generating|ready|failed, trailerSlides[{i, planItemId, dayLabel, time, headline, tagline, photoAssetId}], posterCopy, postcardText, highlights[{planItemId, title, when, reasonTag, traitId}], savingsOptions[{id, label, delta}], leadItemId (for resend reorder), model, promptVersion, generatedAt}.
- **ProposalEngagement** {versionId, userId, event delivered|opened|trailer_view|trailer_complete|reaction|reply|cta, at, localHour, meta}. Aggregates: openCount, viewCount, typicalOpenHour. Privacy: visible to organiser only as activity lines; retention bounded.
- **ProposalReaction** {proposalId, userId, text/emoji, slideIndex, at} (visible to all recipients).
- **PrivateGuideThread** {id, tripId, userId, guideId, visibility private, reason cost|dates|plan|other, freeText, offeredOptions[], chosenOptions[], followUpAt, createdAt}. Privacy: never exposed to organiser/crew except as aggregate if product decides.
- **GuideSuggestion** (organiser nudges) {id, proposalId, type resend|offer_option|nudge, text, params {sendAtLocal, leadItemId, optionId}, status open|done|dismissed, sourceSignals (must not reference private threads by name unless consented)}.
- **ScheduledDelivery** {id, userId, kind resend|followup|ping, sendAtUtc, tz, payload, status}.
- **CostComponent** {tripId, kind flight|stay|activity|transport|fee, scope individual|shared, amount, currency, unit (room/apartment/ticket), participants[]}; **ShareCalc** {tripId, userId, total, breakdown by category (donut), appliedOptions[], computedAt, version}.
- **Stay/Room/RoomAssignment** {stayId, bookingId, holdStatus held|confirmed|released, freeCancelUntil, rooms [{id, capacity, price, occupants[]}]} (shared with 3c-6, 3h).
- **ExternalEntry** {tripId, kind lottery, provider "Nintendo Museum", entrants[], status, resultDate} (manual task likely).
- **Message** {id, crewId, tripId?, senderKind user|guide|system, senderId, type text|photo|poll|expense|guide_action|changeset|proposal|boost|location|meetup|system, body, mentions[], attachments[], replyTo?, clientMsgId (idempotency), createdAt, editedAt, deletedAt}.
- **GuideAction** {messageId, kind book_slot|hold|offer, capacity, takers[], price, splitMode, status open|full|booked|expired|failed, bookingId}.
- **Comment** {id, target poll_option|plan_item|place, anchorLabel, authorId, text, plusOnes[], createdAt}.
- **Presence** (ephemeral, not persisted) {userId, context (tripId/dayId/pollId/proposalId), cursor {targetId, relX, relY}, typing, lastSeen}.
- **LocationShare** {tripId, userId, status sharing|paused|off, windowStart, windowEnd (trip-local midnight after last day), pausedAt}.
- **LocationFix** (hot, TTL minutes; trail ≤ N points) {tripId, userId, lat, lng, accuracy, speed, heading, activity walking|cycling|automotive|stationary, placeLabel, at}. Privacy: short retention, never outside window, only to trip participants who are also sharing? (reciprocity question).
- **MeetUp** {id, tripId, placeId, lat/lng, name, at, createdBy, status}; **MemberEta** {meetUpId, userId, etaAt, distanceM, mode, statusText, onMyWay bool, computedAt}.
- **LiveActivityToken** {userId, deviceId, activityKind crew_converge, pushToken, startedAt} (5a cross).

---

## 5. Backend / API needs

**Endpoints (resource-level, transport-agnostic)**
- Plan: `GET trips/{id}/plan?since=version`; `POST trips/{id}/plan/ops` (batch ops: reorderDays, moveItem{start,end,lane}, resize, add, remove; with baseVersion; server validates constraints, returns new version or conflict + rebased suggestion); `GET trips/{id}/forecast`.
- ChangeSets: `GET trips/{id}/changesets?status`; `POST trips/{id}/changesets` (user-authored from drag, or from guide suggestion accept); `PATCH changesets/{id}/changes/{cid}` {accepted}; `POST changesets/{id}/send` → creates approval poll + chat message; `POST changesets/{id}/apply` {scope group|personal}; `POST changesets/{id}/approvals` {decision}.
- Proposals: `POST trips/{id}/proposals` (config); `POST proposals/{id}/versions:generate` (per recipient, returns job ids); `GET proposals/{id}/versions/{userId}`; `POST proposals/{id}/send`; `GET proposals/{id}/rsvps` (+engagement summaries, organiser only); `POST proposals/{id}/rsvp` {status, optionIds}; `POST proposals/{id}/reactions`; `POST proposals/{id}/events` (open/view, batched); `POST proposals/{id}/suggestions/{sid}:execute` (resend/offer) / `:dismiss`; `POST proposals/{id}/offers` (publish option to all).
- Private guide: `POST proposals/{id}/private/reason` {reason, text} → options (async, "thinking beat"); `POST proposals/{id}/private/followup` {at local}.
- Dropout: `POST trips/{id}/participants/{uid}/decline` (or inferred from reply) → job → ChangeSet(trigger dropout); `PATCH crews/{id}/members/{uid}` {keepInChat}.
- Crews: `GET me/crews` (unread, last message, status line, pending invites); `POST crews` {name} → code/link; `POST crews:join` {code}; `POST invites/{id}:accept|:later|:decline`; `POST crews/{id}/active` (server-side default crew for widgets/notifications).
- Chat: `GET crews/{id}/messages?before&limit`; `POST crews/{id}/messages` (idempotent clientMsgId; mentions); `POST polls`, `POST polls/{id}/ballots`; `POST guide-actions/{id}/take`; `POST crews/{id}/read` {messageId}; `POST comments`, `POST comments/{id}/plusone`; `POST guide-edits/{id}:keep|:undo`; media upload (pre-signed URLs).
- Map: `POST trips/{id}/locations` (batched fixes); `PATCH trips/{id}/location-share` {status}; `GET trips/{id}/locations` (snapshot); `POST trips/{id}/meetups`, `PATCH meetups/{id}`; `POST meetups/{id}/on-my-way`; `POST meetups/{id}/ping`; `POST live-activities/tokens`.

**Background jobs**
- Forecast watcher: per upcoming/live trip day within forecast horizon, hourly (more often ≤48h); detects outdoor items overlapping precip windows; emits forecast update to plan channel (band drift); triggers replan job if material.
- Replan suggestion job: candidate moves via deterministic solver (free slots, opening hours, travel time, bookings immovable unless supplier allows, must-dos locked, attendee overlap) → LLM picks/wording → ChangeSet(draft, author guide) → notify organiser/participants.
- Proposal version generation: fan-out 1 job per recipient; progress events; schema-validated JSON; retries; regenerate on plan/cost change; cost numbers injected, not generated.
- Engagement aggregation: open-hour histogram, view counts → suggestion rules (resend-at-hour, lead-item reorder based on recipient traits).
- Suggestion engine: rule triggers (unopened > 48h, maybe + cost reason from private thread → anonymised offer) → LLM copy.
- Scheduled deliveries: resend at recipient-local time; "Ask me on Sunday" follow-up; reply-by reminders; hold-expiry warnings; hold auto-release at expiry (supplier cancel).
- Reply intent classifier: free-text replies → intent {in, maybe, out, question} → state machine; out → dropout job.
- Dropout re-split job: room reassignment optimiser (respect 3c-6 grouping), release booking (supplier cancel), recompute ShareCalc, withdraw external entries (task), waitlist promotion (7th invitee).
- ChangeSet approval watcher: threshold reached → apply; expiry → close.
- Guide chat agent worker: mention/event triggered; tool calls (search places, availability, create poll, create booking hold, add expense, propose ChangeSet); streaming fan-out; rate/entitlement accounting.
- ETA job: every 60s per active meet-up: for each sharing member compute ETA (mode from activity) → MemberEta → push to map channel + Live Activity push updates; detect "all < 5 min" → pulse state; arrival geofence.
- Location window job: auto-off at trip-local midnight after last day; purge fixes (TTL).

**Realtime channels**
- `trip:{id}:plan` — ops, versions, guide-touched markers, forecast band updates.
- `trip:{id}:presence` — viewers per screen/day/poll, cursors (throttled), typing.
- `changeset:{id}` — accept states (author only), approval tallies.
- `proposal:{id}` — reactions (all recipients), hype score, RSVP statuses (organiser gets engagement detail; recipients get only statuses allowed), hold timer sync.
- `user:{id}` — private guide thread, inbox items, suggestions, generation progress.
- `crew:{id}:chat` — messages, typing (incl. guide), poll tallies, guide action updates, unread counters.
- `trip:{id}:locations` — fixes, meet-up, ETAs (only participants with sharing window open).

**3rd-party data sources (categories; selection is stack decision)**
- Hourly weather/precip forecast API (with minute/hourly precip), refresh cadence ≥ hourly.
- Places/POI (names, photos, opening hours, categories, indoor/outdoor), reverse geocoding for pin labels ("Karsa Spa", "Warung Pondok").
- Routing/ETA (walking, two-wheeler/scooter, driving) — matrix-capable; per-minute cost concern.
- Map tiles with fully custom dark styling (brand palette) on mobile.
- Accommodation supplier with free-cancellation rates / holds + cancellation API (room release).
- Activity/restaurant booking (spa slots, tables "held") or concierge fallback.
- Licensed destination photography for trailers (place photo licensing/attribution).
- FX rates (IDR → home currency in chat expense card).
- LLM provider (structured output + tool use + streaming).
- Push: APNs (alerts, communication notifications, Live Activity push incl. broadcast), FCM.

---

## 6. Cross-slice dependencies & shared components

**Upstream**: 3a-4 taste quiz traits (reason tags), 3a-5 home airport (SIN on boarding pass), 3a-10/11/13 invite + join code + crew manifest; 3b-2/3b-6 Home crew pill & crew name switcher, 3b-4 Inbox items (boat vote, replies due, nudge Dev); 3c-5 private budget maxes (never leak; re-split must check), 3c-6 rooms (grouping), 3c-7 must-dos (locked), 3c-8/9 draft & holds (rooms held), 3c-11/12 redraft diff (same ChangeSet UI), 4f-3 redraft limit.
**Downstream/shared**: 3h bookings (holds, releases, booking moved), 3i Balances (expense card, split, boost IOUs), 3j guide chat (GROUP / JUST ME, PROPOSE TO GROUP → poll in 3g-1), 3k-1 trip hub, 3k-2 day-of, 3k-4 offline outbox, 3k-5 flight delayed (ChangeSet), 3k-7 forecast, 3k-9 running late, 3k-10 SOS (map), 3l-1 egg hatch on landing (promise on 3f-5), 3o-4 Share the plan (SHARE), 4b-1 guide quota, 4c-1 boost card in chat, 4e-2 entitlements, 4f-1 7th seat, 4f-2 live map teaser, 5a-2 crew Live Activity, 5a-6 lock-screen upsell, 5b-1 guide-voiced notifications, 5b-2 vote from notification, 5b-4 ping budget + 20:00 roundup, 5c vote/crew widgets, marketing site invite page (web trailer parity).

**Shared components to build once**
- Avatar chip / stack (member colour, initial, ring), crew rail with dashed empty seat.
- Status chip (BOOKED/VOTE/IN/MAYBE/UNOPENED/ORGANISER/LEADING), rotated sticker label.
- Primary CTA (58px pill), secondary pill, text link; CTA with flap-animated label/price.
- Toggle (46×28), segmented control, reason chip grid (radio w/ per-option colour).
- Odometer number, countdown pill (dhms), progress/segment bar with thump, hype bar.
- Diff row (struck old → new + reason + affected avatars) + accept/reject check → used by 3e-3, 3f-7, 3c-12, 3j-1/2, 3k-5.
- Poll card (bars, voter avatars, counts) → 3g-1, 3g-2, 3b vote board, 5b-2, widgets.
- Guide sticker (doodle-art with poses: think, wave; float/hop/bob presets), guide handwritten message style (Caveat), guide typing dots, typewriter reply.
- Bottom sheet with grabber + dimmed live background; story player (progress bars, tap/hold).
- In-app island toast (expands from Dynamic Island pill, guide icon, optional OPEN).
- Map module (custom style, person pins/clusters, trails, meet-up pin, own dot) → 3d-4, 3g-4, 3k-9, 3k-10, 4f-2, 5a.
- Presence indicator ("MAYA, ALEX HERE" blink dot) + remote cursor.
- Confetti, stamp-with-thud, card-deal-in list animation, slideOff.
- Procedural critter renderer (doodles.js / critters-draw) must be ported natively or pre-rendered (poses/seeds) — used in every screen here.

---

## 7. Implementation risks / hard parts

1. **Time-grid editor (3e-2)**: 8.5pt per 15-min slot is below comfortable touch precision → need magnified drag / haptic per snap / vertical auto-scroll; collision "shuffle out of the way" semantics undefined (push later vs new lane vs swap); fixed bookings, travel time, subgroup lanes, items outside 07–19 (03:30 pickup). Accessible alternative required.
2. **Concurrent editing**: drag ops from multiple members + guide ChangeSets computed on older base version → need versioned ops, server validation, rebase or mark ChangeSet stale; optimistic UI rollback animations; offline edits (3k-4) merging.
3. **Constraint validation ≠ LLM**: times, costs, booking feasibility must be deterministic; LLM only ranks/words. Needs opening-hours + travel-time data per POI (coverage outside major cities is poor).
4. **Money correctness**: shared vs individual components (flights individual, apartment shared, rooms per unit); personal options (Rin $1,170) conflict with "EVERYONE'S SHARE $1,334"; rounding of cents across N people; multi-currency; re-split must not exceed private budget maxes silently; boost IOU entries. Numbers in LLM copy must be injected, never generated.
5. **"Rooms held" is a supplier/payment problem**: most hotel APIs don't hold without a booking; free-cancel rates need a payer/card, cancellation deadlines, fees; releasing a room on dropout (3f-7) and on hold expiry must be reliable with partial-failure handling and idempotency. Liability if hold lapses. Nintendo lottery-type entries can't be automated → manual task UX.
6. **Guide books & splits in chat** ("I'll book it and split it"): needs booking capability + payer + consent per taker; prompt-injection risk from crew messages driving tool calls; must require explicit human confirmation for spend.
7. **Personalised generation at scale (F7)**: N recipients × multi-artefact JSON; latency visible on send button; hallucinated claims ("no crowds", timing facts); must avoid leaking private data (budget maxes, private objections, other people's taste) into another person's version; regeneration when plan changes after send; eval harness + schema validation + fallbacks (generic version).
8. **Privacy contradictions & tracking**: organiser sees opens/views ("Opened it 3 times", "Watched the trailer twice", "opens things at night") and guide reveals "Alex asked me privately about cost" despite "Winston only sees maybe"; social proof shown to all recipients. Needs consent model, GDPR/DPDP disclosure, possibly aggregate/anonymised signals. App Store privacy labels.
9. **Live location**: background location on iOS needs Always (or When-In-Use + background indicator started in foreground), Android needs ACCESS_BACKGROUND_LOCATION + foreground service (type location) + Play policy declaration and prominent disclosure; battery drain; activity recognition permission (Android ACTIVITY_RECOGNITION, iOS Motion); auto-off guarantees; retention; SOS override interplay (3k-10 shares location beyond pause?).
10. **ETA cost & freshness**: recompute each minute × members × meet-ups on paid routing APIs; scooter mode support varies; on-device ETA vs server; staleness when app suspended.
11. **Crew Live Activity** (5a-2/5a-6): server-driven updates for other members' positions → APNs Live Activity push budget/throttling; update frequency limits; Android equivalent (ongoing notification / platform live updates) differs.
12. **Mobile "cursors"**: no hover on touch; must define cursor = last touch/viewport focus anchored to element ids (cards, time slots) with relative offsets; different screen sizes/scroll positions; throttle to avoid battery/network cost; hide when idle.
13. **Guide in group chat**: turn-taking and proactivity rules (when does guide speak unprompted), streaming tokens to all members consistently, cost per message, quota accounting (30/day free, "Maya has Pass+ → Pon answers in crew chat"), moderation, context window (long chat history + plan).
14. **Choreographed motion fidelity**: slide-to-board is a gesture-scrubbed 6s timeline with physics confetti and haptics; story trailer with Ken-Burns + word stamps; card-deal/odometer/flap everywhere — needs a native animation system that can scrub keyframed timelines; reduced-motion variants.
15. **Web parity**: proposal/invite links open in browsers for non-installed users (3a-10 "Just look around first" → trailer) → trailer/Your version must render on web + deferred deep link; RSVP from web?
16. **Timezones**: trip-local times (plan, midnight auto-off) vs recipient-local ("resend at 21:00", "ask me on Sunday") vs organiser-local displays ("Sent Sep 24").
17. **Crew switching**: all state (Home, widgets, notifications, guide theme) keyed by active crew; per-crew unread; notifications from inactive crews must deep-link and switch context.
18. **Entitlement gating across crew**: Boost is per trip for whole crew, Pass+ per person; map/Live Activity/crew size/redraft limits must be evaluated server-side per trip + per user; trial ("first trip free") expiry mid-trip.

---

## 8. Ambiguities & open product questions

1. **Private vs organiser visibility**: 3f-4 promises "Winston only sees maybe" / "Nothing on this sheet reaches the crew", but 3f-6 PON SUGGESTS tells Winston "Alex asked me privately about cost". Named, anonymised ("someone asked about cost"), or never?
2. **Engagement tracking**: may organiser (and all recipients via social proof) see opens, view counts, reply text, inferred habits ("opens things at night")? Opt-out? Retention?
3. **"Apply to my plan only"** (3e-3, also 3j-1 JUST ME): personal fork of the itinerary? Leave group item and create a personal copy? How displayed to others?
4. **Approval quorum "NEEDS 3 YESES"**: fixed 3, majority of participants, or of affected members? Who can veto? Expiry? Does organiser's yes count?
5. **Edit rights**: can every member drag days/items (3e-1/3e-2) or only organiser? Guide edits without asking (3g-2 "I added it as Jordan's route" + KEEP/UNDO) — what's the autonomy boundary?
6. **Redraft quota**: do weather replans (3e-3), guide chat swaps, dropout re-splits count toward "3 redrafts a trip"? Do @guide messages in crew chat count toward 30/day, and whose quota (4b-1 implies a Pass+ member's)? Does the private "not sure" chat count?
7. **Collision rule** in 3e-2 ("others shuffle out of the way"): push later, reflow into lanes, or swap? What about booked/fixed items and travel time?
8. **Map & Calendar tabs** on 3e-1: undesigned. Calendar = in-app view or export to device calendar?
9. **Rooms held**: real supplier holds (payment/card, who pays, fees) or soft reservations? What happens at hold expiry with MAYBE/UNOPENED people? 3f-1 "5 days" from Sep 24 ≠ 3f-4 "held until Sep 30" = reply-by — is hold tied to reply-by?
10. **Price truth**: "$1,310 each, flights included" — flights booked by app or estimates? If estimates, what does "YOUR SHARE" commit anyone to? Is money collected at boarding (no payment step drawn)?
11. **Boarding-pass SEAT "Window, by Maya"**: real flight seat, room/bed, or flavour text? Source of data?
12. **Decline path**: trailer/Your version have only I'M IN / MAYBE / chat — is there an explicit "Can't make it" button, or is decline inferred from free-text reply (Dev's quote)? Can a user who boarded later drop out (same 3f-7 flow)?
13. **Personal discounts vs re-split**: after Rin chose "share the big room −$140", does 3f-7 "EVERYONE'S SHARE $1,334" apply to her? Do room-sharing options need consent of Maya & Jordan (named in 3f-4)?
14. **Waitlist**: 4f-1 "Keep it at six" leaves Sam on the invite list, "a seat opens if someone drops out" — 3f-7 doesn't offer Sam the seat. Auto-offer?
15. **Post-board destination**: prototype sends Rin (recipient) to organiser's "Who's in" screen after boarding — what does a non-organiser see after 3f-5 (Your version with IN state? crew chat? Home)?
16. **Proposal generation timing**: versions generated before send ("READY TO SEND", PREVIEW AS works) or during send (avatar stamps as each finishes)? Partial send if one fails?
17. **Formats**: do poster/postcard formats have their own recipient screens (only trailer drawn)? Is trailer shareable as video outside app?
18. **Hype meter %** formula (82%)? Live reactions: persisted and replayed, or only live while co-viewing?
19. **Chat guide identity**: header shows Tokek (Bali) but 4c-1 shows "Pon is in this chat" — does the chat's guide switch with the active/upcoming trip? Both present when Bali is live and Kyoto is planning?
20. **Chat composer**: what's in "+" (photo, poll, expense, location, meet-up)? Mic = voice note to crew or talk-to-guide (3j-2)? Prototype opens guide sheet on input tap.
21. **Guide action "I'M IN · 1 SLOT LEFT"**: capacity 3 but prototype books "split four ways" — who pays upfront, how is split recorded, cancellation?
22. **Crews sheet LATER**: removes invite card (prototype slideOff) vs "Invites sit here until you answer them". Max crews for free users? Leave/mute/archive crew UX missing; START A CREW flow missing.
23. **Location sharing**: opt-in per trip or default-on for trip days? Reciprocity (can a paused member still see others)? Pause/resume control location on screen? "Put this on the lock screen" button (5a-6) not on 3g-4. Does SOS override pause?
24. **Pre-trip MAP button** in chat: hidden, disabled, or teaser before trip days?
25. **Meet-up**: who can create/move it (anyone)? Multiple meet-ups? Auto-created from plan items?
26. **ETA display**: arrival clock times (16:52) vs minutes — which, and computed on-device or server?
27. **3f-7 caption** mentions a crew row Dev slides out of, but no row is drawn — add crew rail?
28. **Poll bar math** (3g-1 YES 3 = 60%, MAYBE 1 = 20%) implies denominator 5 of a 6-person crew — eligible voters rule?
29. **Offline/error/empty/loading states** are undesigned for all 14 screens (except map teaser/locks from other slices) — need a state pass from design.
30. **Accessibility**: alternatives for slide-to-board, drag-snap timeline, story auto-advance, live cursors; Dynamic Type with condensed display fonts.
