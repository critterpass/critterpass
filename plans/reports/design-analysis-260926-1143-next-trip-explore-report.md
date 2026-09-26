# Design analysis: 3c Next trip (vote + setup + draft) and 3d Explore

Date 2026-09-26. Sources: 16 screenshots (every screen viewed), `screens.json` captions, raw HTML slices of `Critterpass.dc.html` (offsets 176261–323455), prototype script in `Critterpass Prototype.dc.html` (flow table lines 648–797, helpers lines 490–620, transitions ~lines 210–250), `doodles.js` (tg-motion presets). Related screens read for context: 3a-4, 3a-5, 3a-9, 3b-1..8, 3e-1..3, 3f-1..7, 3g-1..4, 3j-1, 3k-7, 3l-5, 3n-2, 3o-1..2, 4a-*, 4b-*, 4c-*, 4e-*, 4f-*, 5b-*, 5c-*.
Stack-agnostic. "Guide" = destination AI critter (Pon/Kyoto, Sardi/Lisbon, Tokek/Bali).

---

## 1. Slice overview

**User goals**
- Crew: settle "where next" fairly between two finalists and see the result together (3c-1, 3c-2).
- Organiser: turn a winning place into a plan quickly. Setup is a 4-step wizard (WHEN → BUDGET → ROOMS → MUST-DOS). Calendars, private budgets, sleep traits and must-dos come from every member, but the organiser drives it.
- Every member: give private inputs (calendar, private max, one must-do) without social pressure.
- Organiser: get a full itinerary from the guide in about 20 s, review it privately, fix days through redrafts (diffs), then hand it to the proposal (3f).
- Anyone: browse a destination (prices/crowds by month for the crew's airports), swipe candidate places together, check the best hour to visit, and see picks on a map.

**Entry points in**
| From | To | Evidence |
|---|---|---|
| 3b-6 Home final-vote split card (`cp: showdown`, `tally`) | 3c-1 (zoom) | prototype line 781 |
| 3b-2 Home "WHERE NEXT?" board | 3c-1 | line 650 |
| 5b-2 vote notification "Open the showdown" / actions Vote Kyoto/Lisbon | 3c-1 or vote-in-place | line 756 |
| 5c-1/5c-3 interactive vote widget, lock-screen vote score | vote-in-place / 3c-1 | 5c captions |
| 3d-1 PITCH TO THE CREW | vote board / 3c-1 (push + toast "Kyoto's on the board") | line 668 |
| 3b-1 first-run guide grid (guide hops out + grows into page) | 3d-1 | line 648 |
| 3b-7/3b-8 "Somewhere else" guest-guide destination page | same template as 3d-1 | 3b-8 |
| 3e-1 Trip plan day card (UBUD CENTRE) | 3d-2 Swipe together | line 672 |
| 5b-1 notification "Pon · Kyoto" | 3c-9 Pon's draft | line 772 |
| 3o-2 COPY INTO OUR TRIP / DAY 3 ONLY | 3c-9 (merges days into the draft) | line 797 |
| 3f-4 "Not sure yet", reason "THE PLAN" | redraft path ("Tell me which day bugs you and I'll redraft it") | line 567 |
| 4f-3 Last redraft interstitial → USE MY LAST ONE | 3c-11 | line 743 |

**Exits out**
- 3c-2 SET UP KYOTO → 3c-3. "Lisbon goes back in the deck" → 3b board state.
- 3c-9 BUILD THE PROPOSAL → 3f-1. Tap a day → 3e-2 planning mode. Ask Pon to change a day → 3c-11 (sheet), or 4f-3 first when on the last free redraft. 4f-3 BOOST → 4b-3.
- 3d-1 → 3o-1 Crew plans (1,240 CREW PLANS). → 3d-3 (zoom). SOLO TRIP → solo planning (no vote; not designed).
- 3d-3 chat button → 3j guide chat (place-scoped). "18 min from the ryokan" → 3d-4. ↗ → share sheet / universal link.
- 3d-4 bottom card → 3d-3 (zoom). Tab bar → HOME / TRIPS / centre guide / WALLET / PASS.
- 3d-2 match → card "flies into the plan" (3e-1 day, toast "Tirta Empul's in the plan for Day 3").

**Setup back-navigation**: stepper chips jump between steps via `stepTo` (pop to the step if it's in the stack, else push). Header right shows the last completed step value ("KYOTO WON 4–2", "APR 2–9 ✓", "BUDGET ✓", "ROOMS ✓").

---

## 2. Per-screen specs

Global motion primitives (prototype; reuse app-wide):
- Push 480 ms: in translateX 100%→0, out → −30% plus scrim. Pop 420 ms. Default easing `E = cubic-bezier(.32,.72,0,1)`.
- Sheet 540 ms: slide from 844−top, out view scales to .93. Rise 620 ms (+120 delay).
- Zoom (shared-element card→page) 560 ms: clip-path inset from source rect, round 22/s → 54 px. Back 460 ms.
- Burst: out opacity→0 scale .9 360 ms ease-in; in scale 1.2→1 opacity 0→1 640 ms `cubic-bezier(.2,1.3,.35,1)` delay 120, plus white flash.
- Fold: out 380 ms `cubic-bezier(.5,0,.75,0)` to opacity 0 scale .9; in translateY 70→0 560 ms E delay 160.
- Press feedback: down scales to .975 (wide) / .96 / .92 (small) over 130 ms `cubic-bezier(.3,.7,.4,1)`. Release overshoots to 1.035 over 420 ms ease-out.
- `pop`: scale 1.12 at 40%, 360 ms. `flap`: split-flap text swap, rotateX 0→90→0. `thud`: whole screen translateY 0→5→−2→0 over 280 ms (pair with heavy haptic).
- Toasts carry the guide's critter icon.
- tg-motion loop presets: bob ty −6 (2400); wiggle r ±4° (1600); pulse s 1.07 (1600); ping s .6/o .8 → s 1.5/o 0 (1800); spin 360° linear (9000); marquee tx −50% linear (16000); rise; blink o .25 (1200); hop squash-stretch (2600); grow. Default ease `cubic-bezier(.65,0,.35,1)`. Loops share a global clock, so loops stay in phase across elements.
- **All loops are skipped under prefers-reduced-motion.** Production must honour the OS Reduce Motion setting.

Palette (from HTML): ink #17142a, card #1f1b38 / #2c2750, cream #f4efe4, muted #a9a3c0 / #6f698c, yellow #ffd84a (primary CTA), green #54d6a4 (ok/best), pink #ff5fa8, blue #4f86ff, orange #ff9a4d. Destination colour = its guide's colour (Kyoto orange, Lisbon blue). Each member has a fixed avatar colour (M pink, J yellow, W cream, R green, A blue, D orange). Fonts: Archivo 900 condensed (stretch 62–78%) for display, Geist body, Geist Mono meta, Caveat for guide speech.

### 3c-1 Vote showdown
- **Purpose**: final head-to-head between the two remaining destinations. Tap a half to vote.
- **UI**: split screen, top half Kyoto (orange dotted halftone), bottom half Lisbon (blue). Each half has:
  - giant condensed city name
  - guide speech bubble in Caveat ("Come in April. The blossoms are ridiculous.")
  - guide sticker (doodle-art tanuki pose=cheer / sardine)
  - fact chips: flight hours, price each, best time
  - voter avatar stack + "3 VOTES"
  - Centre: VS badge (76 px circle, yellow text). Header: "← NEXT TRIP · FINAL", "CLOSES FRI". Bottom dark card: other side's tally avatar (A), "1 VOTE · DEV AND RIN TO GO", and the tie-break sentence.
- **Data**: `Poll(final)`: options[2] → Destination {name, guide, colour}; pitch line; `TripEstimate` {flight_hours from the viewer's home airport, price_each, best_window}; `Ballot[]` (voter avatars per option); pending voters; `closes_at`; `tie_break` {winner, reason "$440 cheaper for the four flying from Singapore"}.
- **Actions**:
  - Tap a half: cast or change vote. Tapping Lisbon when Kyoto leads gives a guide toast ("Sardi thanks you. Kyoto still leads 4–2.").
  - When the last votes land: auto-transition (burst) to 3c-2.
  - Back → Home.
- **Motion**:
  - Idle: Pon wiggle 2200 ms, Sardi wiggle 2600 ms delay 500, VS pulse 1400 ms.
  - Tap squash: scale(.985,.95)@35% → (1.005,1.02)@70% → 1, 460 ms ease-out. Origin is the edge touching VS (Kyoto 50% 100%, Lisbon 50% 0%).
  - VS punch: translateY ±34 px toward the other half at 35%, back by 520 ms `cubic-bezier(.3,1.4,.5,1)`.
  - Remote vote change: avatar slides from one half to the other (no timing given; suggest ~450 ms spring).
  - Prototype: toast "Rin and Dev just voted" at +450 ms, go to 3c-2 at +1500 ms.
- **States designed**: open (4 of 6 in). **Missing**: you haven't voted (CTA hint), you voted (highlight own side), closed-by-deadline, exact tie resolved by rule, voter left crew mid-vote, crew >6 (boosted, up to 16 avatars), offline (queue the vote), loading, error.
- **AI**: guide pitch lines (per-destination persona copy, pre-generated at pitch time in 3b-3, cached). Tie-break explanation: computed by rule (cost for majority origin), with the sentence templated or LLM-phrased.
- **Realtime**: every crew member sees ballots live (avatar slide, count roll). Pending-voter list is live. Vote change allowed until close.
- **Native**: haptic on tap (medium impact) and on VS punch. Notification actions (5b-2) and interactive widget (5c-1) must write the same ballot. Result pushed to widget and lock-screen score.
- **Entitlement**: voting free for all ("Voting … stay free for everyone", 4e-2). Crew size >6 needs a Trip Boost.

### 3c-2 Kyoto wins
- **Purpose**: shared winner reveal, shown to each member once on their next app open.
- **UI**: full orange screen, rotating conic rays (340 px, masked radial), big Pon sticker (206 px, cheer), "KYOTO" stamp (124 px), "WINS 4–2". Tally card: two rows, avatars, counts. Loser guide asleep (sardine pose=sleep) with Caveat line "Sardi took it well. He's already pitching June." Header "WHERE NEXT? · FINAL" + "6 OF 6 VOTED" pill. CTA SET UP KYOTO. Link "Lisbon goes back in the deck for next time".
- **Data**: Poll result {winner, score, ballots by option, voters_count/total}. Per-user `reveal_seen_at`.
- **Actions**: SET UP KYOTO → 3c-3 (who may press it is unclear, see Q). Lisbon link → toast; the loser returns to the destination deck.
- **Motion**:
  - Caption: last votes land, Lisbon half slides off the bottom, orange takes the screen.
  - Rays spin 30 s linear loop. Pon hop 2600 ms.
  - Stamp: scale(2.6) rot(−8°) opacity 0 → scale(.95) rot(−1°) @70% → rest; 480 ms, delay 560, `cubic-bezier(.5,0,.8,.4)`. Score reveals at 950 ms, tally at 1100 ms.
  - Thud at +280 ms plus confetti burst: 80 particles, origin (50%, 30%), 6 palette colours, gravity .32/frame, fires once.
  - Enter via burst transition.
- **States missing**: non-organiser variant (CTA text?), "you missed the vote", reveal after a deadline close with abstainers, loser = your pick (empathy copy), reduced-motion version.
- **AI**: loser-guide consolation line (template or short LLM).
- **Realtime**: result event fan-out. Reveal-once is enforced server-side per user (a seen flag) so it's consistent across devices and the widget.
- **Native**: heavy haptic on stamp, success haptic with confetti, SFX stamp + fanfare (sound settings 3n). Push "Kyoto won 4–2" to members not in the app (not designed). Widget flips to the result (5c-1 caption).
- **Entitlement**: none.

### 3c-3 When (setup step 1)
- **Purpose**: find a week everyone can go, from synced calendars.
- **UI**:
  - Stepper chips (1 WHEN active yellow, 2 BUDGET, 3 ROOMS, 4 MUST-DOS). Header right: "KYOTO WON 4–2" tilted orange tag.
  - Title "WHEN CAN EVERYONE GO?". Sub: "From five synced calendars. Dev hasn't connected his yet."
  - Month heatmap (APRIL 2027, Mon-first, 40 px cells, radius 10). Each cell shows day number + "n/6". Fill opacity by free count: 1/6 .10, 2/6 .20, 3/6 .34, 4/6 .50, 5/6 .70, 6/6 1.0 of #ff9a4d. Best-window cells get an inset 2 px #ffd84a outline.
  - Yellow pill "APR 2–9 · ALL 6 FREE". Pon (think pose) line "Blossoms peak around April 3, so this week gets you both." CTA LOCK APR 2–9.
- **Data**: per member per date availability (free/busy/tentative), connected sources count, member not connected; aggregated free_count per date; best window {start, end, length = trip length 8 days, all_free}; seasonal event (blossom peak date); search horizon.
- **Actions**:
  - LOCK APR 2–9 → sets trip dates → 3c-5.
  - Stepper jumps.
  - Implied but not designed: month paging, tap a date to see who is busy (privacy?), adjust trip length, nudge the unconnected member.
- **Motion**: heatmap fills as each calendar syncs, one day at a time (per-cell opacity steps animate). A hand-drawn pen stroke traces around the best window (stroke draw-on, doodles.js style). Pon slides in with the reason.
- **States**:
  - Designed: all-free window found; No week fits (3c-4).
  - **Missing**: calendar permission denied or no calendar (manual availability entry), 0 of N synced, syncing/loading, stale data (last synced), member hasn't opened the app, multi-month span, error.
- **AI**: best-window search is deterministic (sliding window over free counts + season/price score). Pon's reason line is LLM or template grounded in the season dataset.
- **Realtime**: sync progress per member ("five synced") updates live on the organiser's screen. Other members' views not designed.
- **Native**:
  - iOS EventKit full read access (iOS 17+ distinguishes write-only vs full; need full). Android READ_CALENDAR via CalendarContract.
  - Background refresh (BGAppRefreshTask / WorkManager) to re-upload free/busy.
  - Permission requested in context (3a-9 "So the guide can find a week everyone can make"; re-asked when needed).
  - Optional server-side calendar OAuth (Google/Microsoft free/busy) so availability doesn't depend on the member opening the app.
  - Optional: write the locked trip dates to calendars (not designed).
- **Privacy**: upload date-level busy/free/tentative only, never titles or attendees. Organiser sees counts, not who (except 3c-4 explicitly names Dev).
- **Entitlement**: free. Heatmap denominators up to 16 when boosted.

### 3c-4 No week fits
- **Purpose**: fallback when no window reaches N/N; the guide deals three ways out.
- **UI**: title "NO WEEK FITS ALL SIX". Sub "Six calendars, checked through June…". Three option cards (`cp: opt`, radio):
  1. "APR 2–9 · FIVE OF SIX": who misses what ("Dev flies in on the 5th and misses Inari and Arashiyama") + avatars of the five.
  2. "APR 16–23 · ALL SIX": trade-off ("blossoms are gone") + green price delta "−$90".
  3. "ASK DEV FIRST": "His Apr 2–4 block is marked 'tentative'. I'll ask him privately." + "PON'S PICK" badge.
  - Pon quip bubble. CTA ASK DEV (label follows selection). Link "Pick a week anyway".
- **Data**: candidate windows [{range, free_members, missing_members, missed_plan_items, price_delta vs best, seasonal_note}], tentative blocks per member, guide pick index.
- **Actions**:
  - Select option → CTA flaps to "LOCK APR 2–9" / "LOCK APR 16–23" / "ASK DEV".
  - ASK DEV → flap "ASKING DEV…", toast "Pon messaged Dev privately". Dev's reply arrives (prototype +1.9 s toast "It was the dentist. Moving it.") and When is re-computed to all-six (fade replace).
  - Pick a week anyway → 3c-5 (manual week pick UI not designed).
- **Motion**: heatmap fills like 3c-3, but no cell reaches 6/6 so the pen stroke scribbles instead of circling. The calendar folds away and Pon deals the three options (card-deal stagger). Pick outlined yellow (inset 2 px #ffd84a).
- **States missing**: Dev declines/ignores (timeout → fallback), 2+ blocking members, no partial window either, manual week picker, what the organiser sees while waiting.
- **AI**:
  - Option generation: deterministic candidates plus LLM copy.
  - "misses Inari and Arashiyama" implies reasoning over a tentative plan skeleton or the must-dos.
  - Private guide→member message: LLM-written DM to Dev in the guide's voice; reply parsed (LLM intent: freed / not freed) or via quick-reply buttons.
- **Realtime**: private channel guide↔Dev. Organiser gets the resolution event. Heatmap recomputes on Dev's calendar change.
- **Native**: push to Dev from the guide (per-guide sender avatar, 5b-1). Reply via notification quick actions (suggested).
- **Privacy**: surfacing "tentative" status of a specific person's event to the organiser leaks calendar metadata. Needs consent copy and a policy.
- **Entitlement**: free.

### 3c-5 Budget (step 2)
- **Purpose**: pick a per-person budget under everyone's private max, without anyone seeing whose max is whose.
- **UI**:
  - Title "WHAT FEELS COMFY?" Sub "Everyone set a private max. Nobody sees anyone else's number, including Pon."
  - Yellow card: "SWEET SPOT, EACH", "✓ UNDER ALL 6 MAXES", big "$1,350".
  - Track $800–$2,500. Dark sweet-spot band (left 30%, width 18%); six hollow dots at each max (52/58/63/71/79/90%); 30 px knob. Caption "each dot is someone's max".
  - Breakdown card of four bars: FLIGHTS $520 (blue), STAYS $470 (pink, "2 ryokan nights in Gion, 5 in an apartment"), FOOD $220 (green), FUN $140 (orange). They sum to $1,350.
  - CTA LOOKS GOOD.
- **Data**:
  - `BudgetMax` per member: private, write-only.
  - Aggregates: sorted anonymous maxes (dot positions), band [low, min(maxes)], target per person, currency.
  - Estimated breakdown by category for the locked dates (flight quotes per member origin, stay options, destination food/fun cost indices).
  - Chosen stay mix.
- **Actions**:
  - Drag knob → live re-flow of breakdown bars (and stay mix?).
  - LOOKS GOOD → lock the budget → 3c-6.
  - The screen where each member enters their private max is **not designed** (3n-2 Settings has "Budget max · Never shown to anyone, guides included · Private").
- **Motion**: private maxes land on the track as anonymous dots (drop-in stagger). The sweet-spot band squeezes in below them (width animates from full to band). Knob drag re-flows bars live (width transitions + number odometer).
- **States missing**:
  - waiting for maxes (k of N set)
  - knob dragged above the lowest max (warning, check flips)
  - someone's max below the minimum feasible cost (no sweet spot)
  - multi-currency members
  - member never sets a max (default?)
  - loading estimates, estimate failure
- **AI**:
  - Breakdown estimation is deterministic (pricing service).
  - Stay mix ("2 ryokan nights + 5 apartment") chosen by guide logic, possibly LLM given candidates.
  - **Individual maxes must never enter an LLM prompt, logs or analytics**: pass only target/ceiling.
- **Realtime**: dots appear as members submit (count only). Knob position shared? (Probably organiser-only.)
- **Native**: haptic ticks while dragging (selection feedback at $10/$50 steps); a warning haptic crossing a dot.
- **Privacy**:
  - Precise dots reveal the distribution. In small crews (2–3) or by elimination, values become attributable. Recommend bucketing/jitter or hiding dots below a minimum crew size.
  - Encrypt at rest; exclude from organiser/admin exports.
- **Entitlement**: free.

### 3c-6 Rooms (step 3)
- **Purpose**: assign people to rooms. The guide pre-groups by sleep traits; drag to swap.
- **UI**:
  - Title "WHO SLEEPS WHERE?" Sub "Pon grouped the light sleepers and the early risers. Drag anyone to swap."
  - Pink stay card "RYOKAN · GION, APR 2–4 · 2 NIGHTS": 3 room rows, each with a label, two avatars and a trait tag (LIGHT SLEEPERS, EARLY RISERS, NIGHT OWLS).
  - Blue stay card "APARTMENT · SHIJO, APR 4–9 · 5 NIGHTS": "3 bedrooms, 2 bathrooms, a kitchen for Jordan. Same pairs as the ryokan."
  - Pon line "Everyone else said 'don't care'. I took that literally. $470 each." CTA LOOKS GOOD.
- **Data**: `Stay[]` {name, area, dates, nights, rooms[{label, capacity, price}], amenities}, `RoomAssignment`, member traits (chronotype from the 3a taste quiz; light sleeper; "don't care" preference), per-person stay cost.
- **Actions**: drag an avatar between rooms (swap); per-person price recalculates; LOOKS GOOD → 3c-7. Editing apartment pairs separately: not designed ("same pairs").
- **Motion**: avatars drag with lift. Others shuffle to make space. Price per person updates (odometer) as they settle.
- **States missing**: odd crew size or room capacity mismatch, room over capacity (reject shake), rooms with different prices (per-person split rules), couples/beds/gender constraints, stay unavailable, preference collection UI ("don't care"), non-organiser view.
- **AI**: grouping by traits (deterministic clustering is enough), trait labels and quip (LLM/template). Stay selection comes from budget step.
- **Realtime**: assignment visible to the crew? (unclear). If editable by several members, needs a server-authoritative op log.
- **Native**: long-press drag haptics (pickup, drop). Accessibility alternative to drag (tap to select then tap a room).
- **Entitlement**: free.

### 3c-7 Must-dos (step 4)
- **Purpose**: each member adds the one thing the trip isn't complete without. The guide fit-checks each as it lands.
- **UI**:
  - Title "ONE MUST-DO EACH".
  - Rows: avatar, title, subtitle (place + area), status: green check = fits, orange "ENTERED" pill on "NINTENDO MUSEUM · Uji · ticket lottery".
  - Dashed row "Dev is typing" with animated dots.
  - Pon line "All five fit. Nintendo tickets are a lottery, so I entered all six of you." CTA DRAFT MY TRIP.
- **Data**: `MustDo` {owner, title, place_ref?, freeform, status (fits | clash | book_ahead | lottery_entered | pending), external action (lottery, result date Mar 1), target day}. Typing presence per member.
- **Actions**:
  - Tap your own/empty row → 3c-10 sheet (in the prototype, tapping Dev's row shows "the prompt everyone gets").
  - ENTERED pill → toast "Entered all six of you. Results on March 1."
  - DRAFT MY TRIP → 3c-8 (fold). Drafting is allowed before all must-dos are in (the draft says "ALL 5 MUST-DOS MADE IT").
- **Motion**:
  - Rows pop in as owners add them.
  - A clash triggers a small shake.
  - Typing dots: ty 0→−4→0 at 25%, 1200 ms loop, stagger 160 ms per dot.
  - When Dev's row completes: dashed border → solid, text replaced, check swaps in, row scale .96→1.03→1 over 420 ms ease-out. Pon line updates to "All six fit. The ramen goes on Day 1, right after you land."
- **States missing**: clash state visual (only "shake" described), must-do that can't fit (alternatives), member who never answers (deadline/nudge), duplicate must-dos, edit/remove, >1 per person, lottery lost (after Mar 1).
- **AI**: fit check per must-do (place hours, travel time, day capacity, booking needs), lottery detection, Pon summary line. Needs structured output {status, day, note}.
- **Realtime**: typing presence ("Dev is typing") and row insertion broadcast to all viewers of the must-do list.
- **Native**: push prompt to each member (the "prompt everyone gets"; notification design missing), warning haptic on clash shake, reminder for the lottery result date (local notification Mar 1).
- **Entitlement**: free. Unclear whether fit checks count toward 30 guide questions/day (4b-1 says the plan and vote don't count).

### 3c-8 Pon is drafting
- **Purpose**: visible long-running draft job (~20 s) with task progress. Reinforces privacy ("You review it before anyone else sees it").
- **UI**:
  - Dark screen with radial glow, Pon (190 px, think pose, thought bubbles) inside two ping rings (240 px).
  - Title "PON IS DRAFTING YOUR 8 DAYS". ETA "About 20 seconds."
  - Task list: 3 done (green check), 2 pending (dashed orange circle):
    1. Read six taste profiles
    2. Checked the blossom forecast
    3. Held 2 ryokan rooms in Gion, free cancel
    4. Balancing 3 early birds and 3 night owls
    5. Finding vegetarian ramen for Jordan
  - Bottom marquee of coloured day cards "DAY 1 · NISHIKI AT DUSK", "DAY 2 · INARI AT 6AM", …
- **Data**: `AgentJob` {status, eta, steps[{label, state: pending|running|done|failed}], partial day titles}.
- **Actions**: none. Prototype: tap to skip. On completion auto-navigates (fold, replace) to 3c-9.
- **Motion**:
  - Ping rings: scale .6→1.5, opacity .8→0, 2400 ms, second offset 1200 ms. Pon bob 2000 ms.
  - Tasks `rise`: ty 14/o 0 → ty 0/o 1 at 8%, hold, out at 90%; 7000 ms, stagger 600 ms. "Finished tasks tick green and the next one rises in beneath."
  - Day cards marquee translateX 0→−50%, 18 s linear (list duplicated for seamless loop).
  - Done: "everything folds into the trip plan" (fold transition).
- **States missing**: backgrounded app / job finishes while away (push "Pon's draft is ready"), job failure or partial failure (hold failed, no vegetarian ramen found), slow (>60 s) state, offline start, cancel, organiser switches device.
- **AI**: this is the core agentic job (see §5):
  - Inputs: destination, dates, crew profiles (taste, chronotype, dietary), budget target (aggregate only), stays + room plan, must-dos, seasonal data, opening hours, transit times, flight times (lands 11:20, departs KIX 18:40).
  - Tools: place search, hours, transit matrix, crowd forecast, stay availability/hold, pricing.
  - Output: structured itinerary + cost per person + must-do coverage + step log.
  - Streams progress events and partial day titles. Side effects: room holds (free cancel).
- **Realtime**: organiser-only job channel. The crew sees nothing (maybe "Winston is planning" status; not designed).
- **Native**: background completion needs server-side execution plus push. Optional Live Activity for drafting (not designed). Success haptic on completion.
- **Entitlement**: draft is included free and doesn't count toward guide question quota (4b-1).

### 3c-9 Pon's draft (organiser review)
- **Purpose**: private review of the draft before the crew sees it.
- **UI**:
  - Header "← KYOTO SETUP" + pill "🔒 ONLY YOU SEE THIS".
  - Title "PON'S DRAFT" with Pon sticker (bob 2800). Sub "Apr 2–9, $1,310 each. Fix anything before the crew sees it."
  - Green strip "✓ ALL 5 MUST-DOS MADE IT" + owner avatars.
  - 8 day rows: orange number tile, title, sub (weekday · key detail), owner avatar(s) of the must-dos on that day, "OPTIONAL" tag (Day 4).
  - CTA BUILD THE PROPOSAL. Link "Ask Pon to change a day".
- **Data**: `ItineraryVersion` {version, visibility=organiser_only, cost_per_person, days[{index, weekday, title, summary, optional, must_do_owner_ids}]}, must-do coverage.
- **Actions**:
  - Tap a day → planning mode (3e-2).
  - Ask Pon to change a day → 3c-11 sheet, or 4f-3 interstitial if it's the last free redraft.
  - BUILD THE PROPOSAL → 3f-1. After a kept redraft the row updates: title flaps to "PHILOSOPHER'S PATH", sub "MON · Canal boat at 12:30 · move to Shijo".
- **Motion**: day cards from 3c-8 drop into rows in order. Prototype: opacity 0, translateY −12 → 0; 400 ms; delay 520 + n·80 ms; easing E. Each must-do owner's avatar stamps onto their day (stamp scale-down + thud-lite).
- **States missing**: must-do didn't make it (list which + why), over-budget draft, holds expiring countdown, draft stale after inputs change (dates/budget edited), empty/partial draft on job failure, redraft counter display (only in 4f-3), viewing on a second device.
- **AI**: summary header. Everything else is rendered from structured output.
- **Realtime**: none to the crew (private). Must sync across the organiser's devices.
- **Native**: push deep link lands here (5b-1 "Pon · Kyoto").
- **Entitlement**: redraft quota: Free 3/trip, Pass+ 3/trip, Boost unlimited (4e-2). 4f-3 shows "REDRAFT 3 OF 3 · LAST FREE REDRAFT" before the last one.

### 3c-10 Add a must-do (member sheet, "AS DEV")
- **Purpose**: the prompt every member gets to add their must-do, with live suggestions and fit checks.
- **UI**:
  - Sheet over the dimmed must-dos list. Header "KYOTO · MUST-DOS" + "D AS DEV" identity pill.
  - Pon question (personalised): "Dev, what's the one thing Kyoto isn't complete without?"
  - Search field (food icon, yellow outline, clear ✕). Section "PON FOUND".
  - Result rows: title + blurb + status pill:
    - RAMEN KŌJI "Ten shops on one floor of Kyoto Station", FITS DAY 1 (green)
    - MENBAKA FIRE RAMEN "They set the bowl on fire. Seats go fast.", BOOK AHEAD (orange)
    - Freeform row "“RAMEN CRAWL” Keep it just as you typed it ›"
  - Custom-styled keyboard with a yellow "add" key (drawn; production uses the system keyboard with return key "Add").
- **Data**: query; `PlaceSuggestion[]` {place_ref, title, blurb, fit {status: fits_day_n | book_ahead | clash, day}}; freeform option.
- **Actions**: type (results per keystroke); pick a suggestion or freeform → sheet closes, row inserted as Dev's (prototype subtitles "Kyoto Station · Day 1, after landing", "Nakagyō · Pon is booking it", "As Dev typed it · Pon picks the stops"). Toast "Dev added … All six must-dos are in."
- **Motion**: sheet rises with keyboard already up. Matches update with every letter. The pick flies into the must-do list as Dev's row. Typing dots on everyone else's screen turn into the real row. Caret blink 900 ms.
- **States missing**: no results, slow/loading results, offline, place is closed on trip dates / clash, already added by someone else, edit later.
- **AI**:
  - Retrieval (places search biased to destination + guide knowledge base), then fit check (deterministic slot test against dates/draft/hours), then short blurbs (LLM, cached per place in guide voice).
  - Freeform must-do stays text; the guide later resolves it into stops ("Pon picks the stops").
  - "Pon is booking it" implies an agentic booking side effect.
- **Realtime**: typing presence broadcast on focus/keystroke (throttled), insertion broadcast.
- **Native**: keyboard, haptic on add. Push opens this sheet directly (deep link).
- **Entitlement**: free.

### 3c-11 Change a day (redraft request sheet)
- **Purpose**: ask the guide to redraft one day with reasons.
- **UI**:
  - Sheet. Header "KYOTO · PON'S DRAFT" + "ONLY YOU SEE THIS". Pon (think) + title "CHANGE A DAY".
  - WHICH DAY? 8 chips (number + weekday), selected yellow.
  - Day summary card "DAY 4 · NARA DEER" + OPTIONAL tag + details line.
  - WHAT SHOULD CHANGE? multi-select chips: SLOWER, CHEAPER, LESS TRAIN (pink), MORE FOOD, SWAP IT OUT (blue), SURPRISE ME.
  - ANYTHING ELSE? free-text ("Nara on a Monday sounds packed. Something near the ryokan?"). CTA REDRAFT DAY 4 (label follows the day).
- **Data**: draft days (title, detail line), reasons enum[], note, base version id, remaining redraft quota.
- **Actions**:
  - Pick a day: summary swaps. Pon comments for some days (Day 1 "bends around the flights", Day 5 "empty on purpose. I'd fight you on this one").
  - Toggle reasons. Type note.
  - REDRAFT: flap "REDRAFTING…", then a thinking beat, then 3c-12 (fold, replace). In the prototype, non-Day-4 redrafts return to the draft with toast "Small changes, all in your draft" (auto-applied without a diff?).
- **Motion**: day chips snap. Summary flips in (opacity .3, translateY 6 → 0, 260 ms ease-out). Reason chips toggle like the 3a taste chips (fill colour per chip index: yellow, green, pink, orange, blue, cream; pop). REDRAFT folds the sheet into a short thinking beat (prototype 900 ms), then the diff.
- **States missing**: quota counter visible (only 4f-3), zero redrafts left (paywall/boost), redraft failed / "couldn't improve", locked days (booked items), multi-day changes, no reason selected.
- **AI**: redraft job input (structured reasons + free text + constraints: keep must-dos, bookings, budget). Should be a short background job (a few seconds).
- **Realtime**: organiser-only.
- **Native**: haptics on chip toggles. Keyboard.
- **Entitlement**: counts toward redraft quota (3/trip free and Pass+; Boost ∞). 4f-3 precedes the 3rd.

### 3c-12 Pon's redraft (diff)
- **Purpose**: show the redraft as an accept/reject diff.
- **UI**:
  - Header "← PON'S DRAFT" + "ONLY YOU SEE THIS". Pon (cheer) + title "DAY 4, REDRAFTED".
  - Summary "Nara is out. The new day starts at the ryokan door and never gets on a train."
  - 3 change cards: green check + struck-through old line (grey) + new time/title + description:
    - 09:12 Train to Nara → 09:00 PHILOSOPHER'S PATH
    - 12:30 Lunch in Nara → 12:30 OKAZAKI CANAL BOAT "I booked it."
    - 17:40 Train back → 17:00 NOTHING BOOKED "Rin asked for one."
  - Metric chips: "90 MIN LESS ON TRAINS" (blue), "SAME PACE" (cream), "ALL 5 MUST-DOS KEPT" (green). Pon quip.
  - CTA KEEP IT. Link "Put Nara back".
- **Data**: `RedraftResult` {day, headline, changes[{old_item?, new_item?, note, side_effect?}], metrics {train_minutes_delta, pace_delta, must_dos_kept}, quip}, base version, candidate version.
- **Actions**:
  - KEEP IT → candidate becomes the current draft (still private). Toast "Day 4 is the canal now. Nobody else has seen it yet." 3c-9 row updates.
  - Put Nara back → discard. Toast "Nara is back on Day 4. The deer are relieved." Must also release side effects (the canal boat "I booked it").
- **Motion**: Pon unfolds from the thinking beat. Changes tick in one at a time, old line struck through first (strike draws left→right, then new line fades up, check pops).
- **States missing**: partial accept (per-change toggles exist in 3e-3 but not here), booking side effect failed, redraft identical/no better, error, quota-exhausted result (4f-3 notes the boost button stays one tap away on the result; not drawn).
- **AI**:
  - Redraft output must be structured ops against stable item IDs.
  - Metrics must be computed deterministically (transit minutes from the routing matrix), not claimed by the LLM.
  - "Rin asked for one" implies memory of member requests (chat/profile).
- **Realtime**: none to the crew until the proposal.
- **Native**: success haptic on KEEP IT.
- **Entitlement**: quota consumed (decide on request vs on keep; see Q).

### 3d-1 Destination guide
- **Purpose**: destination page with the guide, when-to-go data re-priced for the crew, first-timer picks, and a pitch CTA.
- **UI**:
  - Orange hero: "← EXPLORE", "♡ SAVE", giant "KYOTO", "YOUR GUIDE: PON", Caveat tagline "Shoes off, phone down, eyes up."
  - Chips: "7H FROM SIN", "¥1,000 ≈ $6.70", "BEST: APR · NOV". Ghosted Pon sticker (wave).
  - Card "WHEN TO GO / CROWDS BY MONTH": 12 bars J–D, height = crowd level. Colours: green = cheapest (J, F), orange = peak highlight (A, N), purple = normal. Legend chips "APR BLOSSOMS", "NOV LEAVES", "JAN CHEAPEST".
  - "PON'S FIRST-TIMER PICKS" + "1,240 CREW PLANS ›". Horizontal cards (photo, name): FUSHIMI INARI, NISHIKI MARKET, ARASHIYAMA.
  - Bottom CTAs: PITCH TO THE CREW (yellow), SOLO TRIP (outline).
- **Data**:
  - `Destination` {name, guide, tagline, currency, best_months}
  - `DestinationMonthStat[12]` {crowd_index, highlight_tag, price_index}
  - `FlightQuote` per crew origin airport × month (cheapest round-trip, flight duration)
  - `FxRate` (local→viewer home currency)
  - curated `Place[]` picks, crew plan count (3o), saved state
- **Actions**:
  - Save (flap "♥ SAVED" + toast).
  - Tap a month → "re-prices the whole page for your crew's airports". Month-selected UI is not drawn.
  - Tap pick → 3d-3 (zoom). Crew plans → 3o-1.
  - PITCH TO THE CREW → adds to the vote board (toast "Kyoto's on the board").
  - SOLO TRIP → toast "Solo trips skip the vote. Pon plans for one." (flow not designed).
- **Motion**:
  - Pon walks in from the edge and sits on the hero (walk cycle → sit; then bob 3000 ms).
  - Month bars grow from zero when scrolled into view: scaleY 0→1, origin bottom, ease-out over ~1.8 s (30% of the 6000 ms loop in the design), stagger 60 ms. Production should play once on intersection.
  - Enter from 3b-1: guide hops out of its cell and the cell grows into this page (shared element).
- **States missing**:
  - month-selected / re-priced state
  - price loading / unavailable
  - viewer without home airport
  - guest-guide variant (3b-8 covers it)
  - sponsored picks for free users (4a-3 "No sponsored picks in Explore" means they exist; placement and label not drawn)
  - offline cached page, saved state list
- **AI**: tagline, picks and "why" copy are pre-generated per destination in the guide persona (editorially reviewed, cached). No per-view LLM needed. Picks may be personalised by crew taste (ranking).
- **Realtime**: none.
- **Native**: share (not shown here), save. Home airport from 3a-5 (location-based nearest airports).
- **Entitlement**: free. Sponsored picks shown on free, hidden for Pass+/Boost.

### 3d-2 Swipe together
- **Purpose**: live group swiping on candidate places for a trip. Two yeses make a match that goes into the plan.
- **UI**:
  - Header "BALI · OCT 12–19", title "SWIPE TOGETHER". Presence "● 4 LIVE" with 4 avatars.
  - Progress bar + "12/30 · 3 matches".
  - Card stack (top card idles with sway): photo, "YES" rubber-stamp indicator, social pill "ALEX + RIN SAID YES", yellow footer with name "TIRTA EMPUL" and meta "Water temple · 45 min from the villa · Rp 75k". Guide (Tokek) note "Sarongs needed. I'll bring a spare for Jordan." with gecko sticker.
  - Buttons: ✕, WHY THIS?, green heart. Tab bar (HOME, TRIPS active, centre guide, WALLET, PASS).
- **Data**: `SwipeSession` {trip, deck[30 place_ids], started_by, live participants}; `SwipeVote` {user, place, yes/no}; `SwipeMatch` {place, yes_users, inserted_day}; `Place` meta (category, travel time from the lodging, price in local currency); guide note per card; others' yes-votes shown pre-vote.
- **Actions**:
  - Drag card (follows finger: translate(dx, 0.3·dy) rotate(dx/14°)). Release beyond 110 px flings, otherwise springs back.
  - ✕ / heart buttons.
  - WHY THIS? → guide explanation ("Alex and Rin said yes, and it's 45 minutes from the villa.").
  - Match → stamp + card flies into the plan + toast "Tirta Empul's in the plan for Day 3."
- **Motion**:
  - Idle sway kf `r−1.5 tx0 → r−.5 tx6 → r−1.5`, 3000 ms loop.
  - Snap back: .45 s `cubic-bezier(.3,1.5,.5,1)`.
  - Fling no: translate(−560, 40) rotate(−28°). Fling yes/match: translate(60, −640) rotate(10°) scale(.7) (flies up "into the plan"). Both 400 ms `cubic-bezier(.5,0,.8,.5)` + fade.
  - Next card rises from translateY(26) scale(.93): 500 ms `cubic-bezier(.3,1.4,.5,1)`. Counter increments.
  - MATCH stamp (green outline, 54 px condensed): scale 2.4 rot −14° o 0 → scale .95 rot −10° @60% → 1; 360 ms `cubic-bezier(.5,0,.8,.4)`. Thud at 330 ms. Stamp fades 200 ms at 760 ms, then card flies out.
  - LIVE dot blink 1400 ms.
- **States missing**: deck finished (30/30 summary), nobody else live (solo async swiping), match threshold for small crews, undo last swipe, no photo, offline, a place already in the plan, organiser approval of auto-inserted items, who can start a session.
- **AI**: deck generation (rank candidates by crew taste + plan gaps + distance). Per-card guide note personalised to the crew (LLM, batch-generated with the deck). WHY THIS? (template from signals, or LLM). Auto-slotting the match into a day (scheduler).
- **Realtime**: presence (who's live), others' votes (pill "ALEX + RIN SAID YES"), match events to all, progress. Server decides matches (idempotent: two near-simultaneous yeses produce one match).
- **Native**: haptics (swipe threshold tick, heavy thud on match), push "Maya started swiping Bali" (not designed).
- **Entitlement**: not specified (assume free).

### 3d-3 Place detail
- **Purpose**: place page with an hourly crowd forecast on the trip date, guide tip, crew context, add-to-day.
- **UI**:
  - Full-bleed photo. Round buttons: ← back, ↗ share, ♥ save.
  - Tags "PON'S PICK", "MUST-DO · RIN".
  - Sheet: title "FUSHIMI INARI", meta "Shrine · free · open 24h · 18 min from the ryokan".
  - Card "CROWDS ON APR 3" + green pill "GO BEFORE 7:30": 15 hourly bars 6am–8pm, green for the low window, first bar outlined yellow (now/selected marker), axis 6am/10/2pm/6/8pm.
  - Pon tip "Keep going past the Yotsutsuji viewpoint…". Crew row (M J R avatars) "Jordan asked about stairs. The first 30 minutes are gentle; it gets steep after."
  - CTA "ADD TO DAY 2 · 06:00" + chat bubble button.
- **Data**: `Place` {name, category, admission, hours, geo, photos}; travel time from the trip lodging; `CrowdForecast` {date, hourly index[], best_window_end}; guide tip; must-do link (owner); crew interest (who saved or asked); Q&A snippet from the crew chat; suggested slot {day, time}.
- **Actions**:
  - Share (link copied / share sheet; "It opens in the app for the crew").
  - Save.
  - ADD TO DAY 2 · 06:00 → adds (button turns green, pop, toast "Added to Day 2 at 06:00").
  - Chat → guide chat scoped to the place. "18 min from the ryokan" → 3d-4.
- **Motion**: photo slow push-in (Ken Burns scale ~1.0→1.08) as the sheet rises over it. Crowd bars draw left→right (stagger). Now-marker pulses. ADD TO DAY drops a copy of the card into that day with a small bounce (prototype: bg → #54d6a4 over .3 s + pop).
- **States missing**: no crowd data, place closed on that date, already in plan ("IN DAY 2" state), no trip context (browsing without a trip: no "from the ryokan", no day slot), photo loading, offline.
- **AI**: tip (curated/LLM per place in guide voice), answering crew questions (summarised from chat), best-time recommendation (deterministic from forecast).
- **Realtime**: add-to-day propagates to the plan for the crew (if the plan is shared) or to the organiser's draft.
- **Native**: share sheet, universal links, haptic on add.
- **Entitlement**: chat button counts toward guide questions (30/day free).

### 3d-4 Map
- **Purpose**: map of saved and crew-picked places with the guide walking beside you. Card carousel synced to the map.
- **UI**:
  - Dark custom-styled map (navy #172536, faint grid, blue river band).
  - Top: search pill "Search Kyoto" + list/menu button (≡).
  - Filter chips (scrollable): SAVED 14 (active yellow), CREW PICKS, FOOD, OPEN NOW.
  - Pins: capsule with a category icon (temple/food), name, and avatars of the crew who picked it (ARASHIYAMA green, GION orange, NISHIKI pink). Cluster bubble "+9". Selected pin (FUSHIMI INARI) enlarged yellow with a yellow outline.
  - You-dot (blue, ping) with a dotted line to the selected pin. Pon sprite beside the you-dot.
  - Bottom card carousel: photo, name, "18 min by train · open now", avatars, chip "DAY 2 · 06:00". Tab bar.
- **Data**: `Place[]` with geo/category/hours (open-now computation in destination timezone); saved lists (user/crew); crew picks; plan slot per place; device location; transit ETA from the current location; clustering.
- **Actions**:
  - Toggle filters (pins re-drop).
  - Tap pin → select + card.
  - Swipe cards → map flies to each place.
  - Tap card → 3d-3 (zoom).
  - Search (offline once the destination is saved; prototype toast "Search works offline once Kyoto is saved.").
  - ≡ → list view (not designed).
- **Motion**:
  - Pins drop in with a bounce when filters change: translateY −26→0 + fade, 420 ms, stagger 70 ms, `cubic-bezier(.3,1.6,.5,1)`.
  - Guide walks beside the you-dot (hop 2200 ms + follows heading). You-dot ping 2000 ms.
  - Card swipe → camera fly-to animation (map SDK camera ease).
- **States missing**: location permission denied / not in the destination (the you-dot is in Kyoto while the user lives in Singapore), offline map not downloaded, no results for a filter, list view, cluster expanded, pin with >3 avatars, search results.
- **AI**: none essential. Search could be semantic ("ramen near Gion").
- **Realtime**: crew picks/saves update pins live (soft).
- **Native**:
  - When-in-use location. Compass heading for the guide sprite direction.
  - Map SDK with custom style, custom annotation views, clustering, offline region packs.
  - Transit routing with Japan coverage.
- **Entitlement**: offline maps free for everyone (4e-2). Live crew map (3g-4) is the boosted feature, not this one.

---

## 3. Feature list

| # | Feature | Description | Screens | Size | Justification | Depends on |
|---|---|---|---|---|---|---|
| F1 | Final head-to-head vote | 2-option poll, deadline, vote change, tie-break rule, live avatars, notification/widget voting | 3c-1, (3b-6, 5b-2, 5c-1) | M | Standard poll plus realtime, deadline job, multi-surface writes | Crew, realtime, push, widgets |
| F2 | Winner reveal once | Per-user seen flag, choreographed reveal, loser back to deck | 3c-2 | S | Mostly UI choreography + a flag | F1 |
| F3 | Calendar availability sync | Device calendar read → date-level free/busy/tentative upload; optional OAuth providers; background refresh; manual fallback | 3c-3, 3c-4, 3a-9 | L | Two platforms, permissions, background staleness, privacy filtering | Permissions, backend |
| F4 | Heatmap + best window | Aggregate N members, sliding-window search with season/price scoring, heatmap UI with sync animation | 3c-3 | M | Deterministic algorithm + custom grid | F3, F14 (season), F13 (prices) |
| F5 | No-fit fallbacks + private ask | Candidate windows, trade-offs, guide DM to a blocking member, auto-recompute on reply | 3c-4 | M | Needs guide DM channel + reply intent handling | F3, F4, guide chat (3j/3g) |
| F6 | Private budgets + sweet spot | Write-only per-member max, anonymous dots, band, knob, live breakdown | 3c-5 | M | Privacy engineering + pricing hookup | F13 (pricing), Settings budget max |
| F7 | Trip cost estimator | Per-person cost by category per origin airport (flights, stays, food, fun); consistent across vote/budget/draft/proposal | 3c-1, 3c-5, 3c-9, 3d-1 | L | Multi-source price aggregation, caching, versioned quotes | F13, stay inventory |
| F8 | Rooms auto-group + drag | Trait-based grouping, drag-swap, per-person price recompute | 3c-6 | M | Custom drag-drop + split rules | Taste profile (3a), stays |
| F9 | Must-dos with presence + live fit check | Per-member prompt, typing presence, per-keystroke suggestions, fit status, lottery handling | 3c-7, 3c-10 | L | Low-latency search + fit engine + realtime presence | Places data, F10 constraint engine |
| F10 | Itinerary drafting agent job | Durable background job, tool-using LLM, progress stream, partial results, validation, holds | 3c-8, 3c-9 | XL | Core AI, long-running, side effects, quality bar | Places, hours, transit, crowd, season, pricing, stays |
| F11 | Private draft versioning + review | Organiser-only visibility, versions, must-do coverage, tap into planning | 3c-9 | M | Versioned document + ACL | F10, 3e planning |
| F12 | Day redraft with diff + quota | Reason chips → redraft job → structured diff → keep/revert; quota 3/trip; boost unlimited; last-redraft interstitial | 3c-11, 3c-12, 4f-3 | L | Stable item IDs, diff ops, side-effect rollback, entitlement | F10, F11, entitlements (4) |
| F13 | Flight price calendar | Cheapest fares by month/date per origin airport for destinations; nightly precompute | 3c-1, 3c-4 (−$90), 3d-1 | L | 3rd-party API cost/availability, multi-origin fan-out | Home airports (3a-5) |
| F14 | Seasonal & crowd data | Month crowd index + events (blossoms, leaves); hourly crowd forecast per place/date | 3c-3, 3d-1, 3d-3, (3l-5, 3k-7) | L | Licensing and sparse coverage; forecast modelling | Data vendors/editorial |
| F15 | Destination guide page | Hero, chips, month chart re-priced for crew, picks, crew-plans link, pitch/solo CTAs, save | 3d-1 | M | Composition of F13/F14 + content | F13, F14, content pipeline |
| F16 | Swipe together | Live session, deck generation, presence, votes, match rule, auto-insert into plan | 3d-2 | L | Realtime + ranking + scheduler insertion | Plan (3e), realtime |
| F17 | Place detail | Place page, crowd chart, tips, crew Q&A, add-to-day slot suggestion, share | 3d-3 | M | Data composition + slot suggestion | F14, plan, 3j chat |
| F18 | Explore map | Custom-styled map, pins with avatars, clustering, filters, carousel sync, guide sprite, offline packs, transit ETA | 3d-4 | L | Map SDK customisation + offline licensing + sprite animation | Places, location, routing |
| F19 | Agentic bookings/holds | Hold rooms with free cancel, book activities, lottery "entry"; release on revert | 3c-7, 3c-8, 3c-10, 3c-12 | XL | Payments, supplier APIs, liability, idempotency; may need de-scoping | Bookings (3h), payments |
| F20 | Setup wizard shell | Stepper, step state machine, per-step completion tags, deep links, non-organiser views | 3c-3..3c-7 | S | UI shell + trip status machine | Trip model |

---

## 4. Data model contributions

- **Trip** (extends): `status` enum (voting → setup_when → setup_budget → setup_rooms → setup_mustdos → drafting → draft_review → proposed → confirmed …), `destination_id`, `guide_id`, `organiser_id`, `start_date`, `end_date`, `length_days`, `budget_target_minor`, `currency`, `redrafts_used`, `boost_id?`, `solo bool`.
- **Poll / DestinationVote**: `id`, `crew_id`, `kind` (board | final), `options[]` → DestinationCandidate, `closes_at`, `tie_break_rule` {type: cheaper_for_majority, computed_winner, explanation}, `status` (open | closed), `winner_option_id`, `closed_reason` (all_voted | deadline).
- **Ballot**: `poll_id`, `user_id`, `option_id`, `cast_at`, `source` (app | notification | widget). Unique (poll, user). History table for "changed mind" animation.
- **RevealSeen**: `poll_id`, `user_id`, `seen_at`.
- **DestinationCandidate** (deck): `crew_id`, `destination_id`, `pitched_by` (user | guide), `pitch_payload` (LLM), `state` (on_board | final | won | back_in_deck).
- **CalendarSource**: `user_id`, `provider` (device_ios | device_android | google | microsoft | manual), `connected_at`, `last_sync_at`, `scope_horizon_end`. Tokens encrypted for OAuth providers.
- **AvailabilityDay**: `user_id`, `date`, `state` (free | busy | tentative | unknown), `updated_at`. Stored per user, not per trip (reusable), range-limited. **No event titles/attendees.** Consider a compact bitmap per month.
- **DateWindowOption**: `trip_id`, `start`, `end`, `free_count`, `missing_user_ids[]`, `price_delta_minor`, `season_note`, `kind` (all | partial | later | ask_member), `guide_pick bool`, `computed_at`.
- **AvailabilityAsk**: `trip_id`, `target_user_id`, `date_range`, `message_id`, `status` (sent | freed | declined | expired), `resolved_at`.
- **BudgetMax** (private): `trip_id`, `user_id`, `amount_minor`, `currency`, `set_at`. Encrypted column; readable only by the aggregation service. Profile default in `UserSettings.budget_max_default`.
- **BudgetPlan**: `trip_id`, `target_minor`, `band_low`, `band_high`, `under_all bool`, `breakdown {flights, stays, food, fun}` (per origin?), `quote_version`, `locked_at`.
- **Stay**: `trip_id`, `provider`, `provider_ref`, `name`, `area`, `check_in`, `check_out`, `nights`, `hold_status` (none | held | booked | released), `free_cancel_until`, `total_minor`, `rooms[]` → StayRoom {`label`, `capacity`, `price_minor`, `beds`}.
- **RoomAssignment**: `stay_room_id`, `user_id`, `assigned_by` (guide | user), `group_label` (LIGHT SLEEPERS …).
- **TasteProfile** (from 3a, consumed): `chronotype` (early | late), `sleep_sensitivity`, `pace`, `food_prefs`, `dietary` (vegetarian …), `room_pref` (don't care | …), `accessibility` (stairs/knee noted in 3d-3/3g-2).
- **MustDo**: `trip_id`, `user_id`, `title`, `place_id?`, `freeform bool`, `fit_status` (pending | fits | clash | book_ahead | lottery_entered | lottery_won | lottery_lost), `fit_note`, `target_day?`, `external_action {type, result_date}`, `created_at`. Unique active per (trip, user) unless changed.
- **AgentJob**: `id`, `trip_id`, `kind` (draft | redraft | merge_shared_plan | fit_check), `requested_by`, `status` (queued | running | succeeded | failed | cancelled), `steps[] {key, label, state, ts}`, `partial {day_titles[]}`, `input_hash`, `base_version_id`, `result_version_id?`, `error`, `eta_s`, `started_at`, `finished_at`, `model`, `cost_tokens`.
- **ItineraryVersion**: `trip_id`, `version`, `parent_version`, `visibility` (organiser | crew), `status` (draft | candidate | current | superseded | discarded), `cost_per_person_minor` (per origin), `created_by` (guide | user), `mustdo_coverage[]`.
- **ItineraryDay**: `version_id`, `index`, `date`, `title`, `summary`, `optional bool`.
- **ItineraryItem**: `stable_id` (persists across versions, for diffs), `day_id`, `start_time`, `end_time`, `place_id?`, `title`, `description`, `kind` (activity | meal | transit | lodging | free), `booking_id?`, `must_do_id?`, `transit_from_prev {mode, minutes}`.
- **RedraftRequest**: `trip_id`, `day_index`, `reasons[]` (slower | cheaper | less_train | more_food | swap_out | surprise), `note`, `base_version`, `job_id`, `result {changes[], metrics, headline, quip}`, `decision` (kept | reverted | pending), `quota_counted bool`.
- **Change op** (diff): `op` (replace | add | remove | move), `old_item_stable_id?`, `new_item`, `note`, `side_effect_booking_id?`.
- **Booking/Hold** (shared with 3h): `provider`, `type` (room | activity | ticket_lottery), `status`, `free_cancel_until`, `payer_user_id`, `amount`, `confirmation`, `created_by` (guide | user), `idempotency_key`.
- **Place**: `id`, `provider_ids{}`, `name`, `category`, `geo`, `hours` (tz-aware, date exceptions), `admission`, `photos[]` (licensed), `guide_tips[]`, `accessibility_notes`, `requires_booking bool`, `lottery bool`.
- **CrowdForecast**: `place_id`, `dow_or_date`, `hourly[24]` (0–100), `source`, `valid_from`.
- **DestinationMonthStat**: `destination_id`, `month`, `crowd_index`, `tags[]` (blossoms, leaves, cheapest), `season_events[] {name, peak_date_forecast}`.
- **FlightQuote**: `origin_iata`, `dest_iata[]`, `month` or `date_range`, `min_price_minor`, `currency`, `duration_min`, `stops`, `source`, `fetched_at`, `ttl`.
- **FxRate**: `base`, `quote`, `rate`, `as_of`.
- **SavedPlace**: `owner` (user | crew), `place_id`, `list` (destination), `saved_at`.
- **SwipeSession**: `trip_id`, `deck[] place_ids`, `created_by`, `status`, `match_threshold` (default 2). **SwipeVote**: `session_id`, `user_id`, `place_id`, `vote`, `at`. **SwipeMatch**: `session_id`, `place_id`, `yes_user_ids`, `inserted_item_id?`.
- Ephemeral: **Presence** (screen/context, typing), not persisted.

**Privacy notes**
- BudgetMax and AvailabilityDay are sensitive. Individual maxes are never returned by any API to anyone, including the owner's organiser. Aggregates are only computed server-side. Exclude from LLM context, logs, analytics and support tooling.
- Calendar: upload only derived states. "tentative" is the most revealing field; consider collapsing it to busy unless the member opts into "let the guide ask me".
- Private guide↔member DMs (3c-4, 3f-4 "Just you and Pon") need per-thread ACL excluding the organiser.
- Draft visibility organiser-only until the proposal. Fit-check results shown to members (3c-10 "FITS DAY 1") partially leak the draft; decide.
- Dietary/accessibility data (Jordan vegetarian, stairs) is health-adjacent. Gate usage and consent.

---

## 5. Backend / API needs

**Endpoints** (REST or RPC; idempotency keys on writes)
- Votes:
  - `POST /crews/{id}/polls` (create final from board)
  - `GET /polls/{id}`
  - `PUT /polls/{id}/ballot` {option}: also called from notification action + widget intent with a short-lived signed token
  - `POST /polls/{id}/reveal-seen`
- Setup:
  - `GET /trips/{id}/setup` (step states)
  - `POST /trips/{id}/dates/lock`
  - `GET /trips/{id}/availability/heatmap?month=`
  - `GET /trips/{id}/date-options`
  - `POST /trips/{id}/availability-asks` {user, range}
- Availability:
  - `PUT /me/availability` (batch of date states + source)
  - `POST /me/calendar-sources` (OAuth connect)
  - `DELETE …`
- Budget:
  - `PUT /trips/{id}/budget-max` (write-only; response never echoes others)
  - `GET /trips/{id}/budget` (anonymous dots/band/breakdown)
  - `POST /trips/{id}/budget/lock` {target}
  - `GET /trips/{id}/budget/preview?target=` (live re-flow; or compute client-side from returned curves)
- Rooms:
  - `GET /trips/{id}/stays`
  - `PUT /trips/{id}/room-assignments` (whole assignment, versioned)
  - `POST …/lock`
- Must-dos:
  - `GET /trips/{id}/must-dos`
  - `PUT /trips/{id}/must-dos/me`
  - `GET /trips/{id}/must-dos/suggest?q=` (≤150 ms target; returns places + fit status)
- Draft:
  - `POST /trips/{id}/draft-jobs` → job id
  - `GET /jobs/{id}` (poll fallback)
  - `GET /trips/{id}/itinerary?version=`
  - `POST /trips/{id}/redrafts` {day, reasons, note, base_version} → job
  - `POST /redrafts/{id}/keep`
  - `POST /redrafts/{id}/revert`
  - `GET /trips/{id}/redraft-quota`
- Explore:
  - `GET /destinations/{id}?origins=SIN,…&month=`
  - `GET /destinations/{id}/month-stats`
  - `GET /places/{id}?trip=`
  - `GET /places/{id}/crowds?date=`
  - `GET /places/search?q=&near=&filters=`
  - `PUT /saved-places/{place}`
  - `POST /trips/{id}/plan/items` (add to day)
  - `GET /map/offline-pack/{destination}`
- Swipe:
  - `POST /trips/{id}/swipe-sessions`
  - `GET /swipe-sessions/{id}`
  - `PUT /swipe-sessions/{id}/votes/{place}`
  - `GET /swipe-sessions/{id}/why/{place}`
- Entitlements: `GET /trips/{id}/entitlements` (redrafts left, boost, sponsored flag).

**Background jobs**
- Poll close at deadline (scheduled), tie-break compute, result fan-out + push + widget timeline reload (silent push / widget push updates).
- Availability recompute on member upload; nightly stale-sync nudges.
- AvailabilityAsk timeout/expiry.
- **Draft job (durable workflow)**, as steps with retries:
  1. load context
  2. candidate retrieval (places per interest, precomputed per destination)
  3. constraint scheduling (solver/heuristic: hours, transit matrix, chronotypes, must-dos, budget)
  4. LLM narrative + titles (structured output)
  5. validation (deterministic checker, repair loop ≤2)
  6. side effects (holds) with idempotency
  7. persist version
  8. emit events
  9. push if the client is disconnected
  - Target p50 ≤20 s. Stream step events as they happen (map to UI copy).
- Redraft job: same pipeline scoped to one day + diff generation against stable IDs. Side effects deferred until KEEP (recommended) or compensated on revert.
- Fit-check job (fast path, may be synchronous).
- Nightly: flight price calendar refresh per (origin in active users' home airports × destination × month), FX refresh (hourly/daily), crowd forecasts refresh, season forecasts (blossom) refresh in season.
- Swipe deck generation (on session create, precompute notes). Match → plan insertion job (scheduler picks day/time slot).
- Offline pack builder per destination (tiles + POIs + search index).
- Lottery/result-date reminders (local notification + server fallback).

**Realtime channels** (websocket/pub-sub; auth per member)
- `crew:{id}:poll:{poll}`: ballot upserts, pending voters, close/result.
- `trip:{id}:setup`: step status, calendar sync counts, budget submissions count (no values), stay/rooms changes, must-do rows, typing presence.
- `trip:{id}:draft` (organiser-only ACL): job step events, partial day titles, completion, redraft results.
- `trip:{id}:plan` (shared with 3e): item inserts from matches / add-to-day.
- `swipe:{session}`: presence, votes, matches, progress.
- `guide-dm:{trip}:{user}`: private guide messages (3c-4 ask, 3f-4).

**3rd-party data sources** (candidates; verify 2026 availability/terms)
- Flight fares by month / cheapest-date calendars for multi-origin: aggregator/metasearch APIs (e.g. Travelpayouts/Aviasales Data API, Duffel offers, Amadeus). Amadeus Self-Service availability in 2026 must be verified. Google Flights has no official API (scraping = ToS risk).
- Hotels/ryokan with refundable holds: Expedia Rapid, Booking.com Demand API, Japan-specific Rakuten Travel / Jalan. Holds are really refundable bookings needing guest details + payment.
- Activities/tickets: GetYourGuide / Viator partner APIs; Klook/KKday (Asia). Nintendo Museum lottery has no API (per-person accounts).
- Places/POI + hours + photos: Google Places API (New), Foursquare, Apple Maps Server API. Check photo licensing and caching limits (Google restricts caching; this affects offline).
- Transit routing/ETA with Japan coverage: Google Routes (transit), Apple MapKit directions, Navitime (Japan).
- Crowd forecasts by hour: BestTime.app-type foot-traffic forecasts. Google "popular times" is not in the official API. Otherwise an editorial/first-party model from app check-ins.
- Seasonal events: cherry blossom/foliage forecasts (Japan Meteorological Corp / Weathernews; licensing) or editorial per guide.
- FX: a rates API (ECB reference / Open Exchange Rates-type).
- Calendars: Apple EventKit (device), Android CalendarContract, Google Calendar API freeBusy, Microsoft Graph getSchedule.
- Maps SDK with custom styling + offline packs (Mapbox / MapLibre-based allow offline; Google Maps SDK doesn't allow general offline caching).
- LLM provider(s) with structured output + tool use + streaming. Moderation for freeform must-dos/notes.

---

## 6. Cross-slice dependencies and shared components

**Depends on**
- 3a: taste profile (chronotype, pace, food, dietary), home airport (3a-5), calendar permission (3a-9 contextual re-ask), avatar colour.
- 3b: pitch board → final (3b-6). Losing destination "back in the deck". Guide pitch content (3b-3). Inbox items for setup asks (3b-4).
- 3e: planning mode (tap day in 3c-9 → 3e-2). Shared diff/review pattern (3e-3 per-change accept). Plan list receives swipe matches/add-to-day (3e-1).
- 3f: proposal consumes the current ItineraryVersion + holds ("Hold the rooms for 5 days"). 3f-4 private "not sure yet" triggers redraft/cheaper options (reuses redraft + cost engine). 3f-7 dropout re-split reuses room assignment + cost engine.
- 3g/3j: guide DM & chat (private ask to Dev; chat button from place detail). "Ask Pon" counts toward the 30/day quota. 4c-1 chat confirms crew-wide redraft usage.
- 3h: bookings/holds model and wallet.
- 3i: Trip Boost split IOUs in Balances (via 4b-3).
- 3k/3l: crowd forecast component + data reused (3l-5 "BEST CHANCE" chart, 3k-7 watch list).
- 3o: crew plans list/copy into draft (merge job + fit check against must-dos).
- 4: entitlements: redraft quota (4e-2, 4f-3 last redraft), boost (4b-3), crew size >6 (4f-1), sponsored picks in Explore (4a-3, 4e-2).
- 5b: vote notification with actions, guide-as-sender notifications, ping budget (setup nudges must respect it). 5c: interactive vote widget + lock-screen vote score (same ballot API).

**Shared components** (build once)
- Avatar + stack (initial, member colour, ring colour = container bg, −7 px overlap).
- Guide line (critter sticker + Caveat text, colour = guide). Guide toast.
- doodle-art critter renderer (poses: cheer, think, sleep, wave, point; sticker outline; blink). Needs a native equivalent of `doodles.js`/`critters-draw-*`.
- Stepper chips (active yellow, done ✓ green).
- CTA pill (58 px, yellow or ink) with press/flap behaviour. Tag/chip (outline, filled, rotated tag).
- Split-poster vote card (also on Home 3b-6, notification 5b-2, widget 5c-1).
- Heatmap calendar grid. Month bar chart (grow). Hourly crowd bars (reused 3l-5).
- Anonymous-dot range slider with band + knob.
- Draggable avatar slots. Swipe card deck with stamps.
- Day row list (number tile, title, sub, avatars, tag). Diff card (strike-old / new / note / check).
- Task progress list (pending dashed / done check / rise). Marquee.
- Map pin capsule, cluster, you-dot, bottom card carousel.
- Tab bar with centre guide button.
- Motion primitives: push/pop/sheet/zoom/burst/fold transitions, pop, flap, thud, confetti, stamp.
- Realtime presence ("n LIVE", "is typing").

---

## 7. Implementation risks / hard parts

1. **Draft quality in ~20 s.**
   - A single LLM call can't reliably respect opening hours, transit times, chronotypes, must-dos, budget and seasonal timing.
   - Needs a hybrid: precomputed destination candidate pools + deterministic scheduler/validator + LLM for selection/narrative, grounded only on known place IDs (no hallucinated venues).
   - Parallel tool calls. The progress UI must reflect real steps, not fake theatre.
   - p95 latency, cost per draft and model fallback all need budgeting.
2. **Agentic side effects** ("Held 2 ryokan rooms", "I booked it", "entered all six of you" into the lottery):
   - requires supplier APIs, guest PII, payment instrument ownership (organiser's card?) and cancellation SLAs
   - idempotency across job retries, and compensation on "Put Nara back" / proposal decline / dropout
   - Lottery entry for others likely infeasible and possibly against terms. Holds may need to become "saved refundable rate + one-tap book". Needs a product decision before build.
3. **Private budget guarantees.**
   - "Including Pon" means the LLM context must never include maxes. Enforce in the prompt-assembly layer with tests.
   - Anonymous dots still leak in small crews or through elimination.
   - Knob "under all maxes" check reveals the minimum. Crew-member currency differences complicate comparisons.
4. **Calendar freshness on iOS.**
   - EventKit data leaves the device only when the app runs. Background refresh is opportunistic, so heatmaps go stale and "five synced" depends on others opening the app.
   - OAuth providers help but add token management.
   - Also: all-day vs partial-day busy rules, multiple calendars, time zones (trip dates in destination tz vs member tz), and a manual-entry fallback for permission deniers.
5. **Pricing consistency.**
   - The vote shows $1,480 each, the budget $1,350, the draft/proposal $1,310, and 3f-7 $1,334 after dropout.
   - Per-origin differences ("four flying from Singapore") mean "each" is not one number.
   - Needs a single cost service with versioned quotes, currency normalisation and caching. Otherwise screens disagree.
6. **Diff stability for redrafts.**
   - Diffs need stable item identity across versions and LLM output as ops rather than whole-day rewrites.
   - Metrics chips ("90 MIN LESS ON TRAINS", "SAME PACE") must be computed, not generated.
   - Quota accounting must be race-safe across crew members and devices, and must handle boost purchase mid-flow.
7. **Realtime correctness.**
   - Votes from app + notification actions + widget (offline/background writes, retries).
   - Deadline close racing with late votes. Reveal-once across devices.
   - Swipe matches needing server arbitration (two simultaneous yeses produce one match and one insertion).
   - Presence/typing throttling.
8. **Per-keystroke must-do suggestions with fit checks.**
   - Latency and cost: debounce, cached place index per destination, deterministic fit test; LLM blurbs precomputed per place.
   - A freeform entry ("RAMEN CRAWL") needs later resolution into stops.
9. **Crowd and season data.** Hourly forecasts for a future date are a licensing/modelling problem (no official Google popular-times API). Blossom forecasts are licensed and seasonal. Month-level "crowds by month" needs a defensible source. Missing-data states are required everywhere.
10. **Flight price calendars** for every crew origin × destination × month: API cost, rate limits, and availability of self-service APIs in 2026. Must be precomputed nightly and cached, never fetched per tap ("tap a month re-prices the whole page").
11. **Map.**
    - Custom dark brand style, custom pin views with doodle icons and avatar stacks, clustering, a fly-to carousel and an animated guide sprite following location/heading.
    - Offline packs + offline search (tile and POI licensing; Google POI caching restrictions).
    - Transit ETA quality in Japan.
12. **Procedural critter art natively.** doodle-art (Canvas2D, seeded wobble, poses, blink) has to render in the app at 60 fps. It's also needed for widget/notification snapshots. Decide between a native port, a shared renderer (e.g. Skia-based) or pre-rendered sprites per pose.
13. **Motion fidelity + accessibility.** Many bespoke choreographies (burst, stamps, confetti, rises, marquees, drag physics) need a motion system with springs and Reduce Motion alternatives. Drag interactions (rooms, swipe) need accessible non-drag paths.
14. **Organiser-only vs crew visibility** everywhere in setup. The design mostly shows the organiser. Member-side states (what Dev/Rin see during When/Budget/Rooms) are undefined, which risks rework in the permission model.
15. **Scaling crew size to 16 (boost).** Avatar stacks, heatmap denominators, room grids and vote halves all need layouts for 7–16.

---

## 8. Ambiguities and open product questions

1. Who can run setup? Is SET UP KYOTO only for the organiser? What do other members see during When/Budget/Rooms/Draft (read-only stepper? inbox tasks?)
2. Vote rules: close at deadline vs all voted; tie-break generalisation ("cheaper for the majority's origin"?); can the organiser override; vote change after close; abstainers.
3. 3c-3 says "five synced calendars, Dev hasn't connected" yet shows 6/6 days. Are unconnected members assumed free? Is there manual availability entry for people who decline calendar access?
4. Is showing the organiser a named member's "tentative" block acceptable privacy-wise? Does the member opt in to "the guide may ask me"?
5. "Pick a week anyway" — what does the manual week picker look like? Can the trip length change?
6. Private max input: per trip or a profile default (3n-2 "Budget max")? Is the prompt designed elsewhere? Currency for members with different home currencies? What if the lowest max is below the cheapest feasible trip?
7. Is "each" price per person including their own flights (origins differ)? Which figure is authoritative across vote/budget/draft/proposal?
8. Rooms: how are "light sleeper" and "don't care" collected? Couples/gender/bed-type constraints? Unequal room prices: split per room or evenly? Can the apartment pairs differ from the ryokan?
9. Holds and bookings: are "Held 2 ryokan rooms", "I booked it" (canal boat) and "Pon is booking it" (Menbaka) real transactions in v1? Whose payment method? What happens on revert or proposal decline? Lottery entry for all six: automated or a reminder task?
10. Can drafting start before every must-do is in, and do late must-dos auto-insert into the draft (free) or cost a redraft?
11. Redraft quota: per trip crew-wide (4c-1 "pon only gave us 3 redrafts") or per user? Does a reverted redraft count? Do the "small changes" auto-applied redrafts (prototype, non-Day-4) count or skip the diff? Pass+ gives no extra redrafts (4e-2 "3 A TRIP"). Intended?
12. Do fit checks, "WHY THIS?" and place-detail chat count toward the 30/day guide-question quota (4b-1 exempts "Kyoto plan and the vote")?
13. Draft privacy: must-do fit checks shown to members ("FITS DAY 1") reveal draft structure before the proposal. OK?
14. Draft job failure, timeout and backgrounding: is there a notification when the draft is ready? A retry UI?
15. Explore entry: the tab bar has no Explore tab (HOME/TRIPS/guide/WALLET/PASS). Where does "← EXPLORE" come from? Is the centre guide button contextual (shows Tokek on Kyoto screens)?
16. Sponsored picks (free tier): placement, labeling, and whether guides "recommend" sponsored places (trust/disclosure).
17. "Tapping a month re-prices the whole page for your crew's airports": which origins, and is the display aggregated or per person? The hero shows only the viewer's "7H FROM SIN".
18. Swipe together: who starts a session and how are crewmates invited ("4 LIVE")? Is the deck fixed at 30? Is the match threshold always 2 regardless of crew size? Does a match auto-insert into the shared plan without organiser approval, and how is the day chosen? Showing "ALEX + RIN SAID YES" before you vote biases the vote. Intentional?
19. Place detail "MUST-DO · RIN" on Fushimi Inari conflicts with 3c-7 (Rin's must-do is Arashiyama at dawn). Data typo or multiple must-dos?
20. Crowd chart "now-marker" on a future date (Apr 3). Is it the planned slot (06:00) rather than now? What shows when there's no forecast?
21. Map you-dot and walking guide when the user isn't in the destination (planning from Singapore): hide, show lodging, or show real location?
22. SOLO TRIP flow (skips vote) isn't designed. Which setup steps apply?
23. Is LOCK dates also written to members' device calendars?
24. Offline behaviour for voting, must-do entry and swiping: queue and replay?
25. Draft editing on a second device, or ownership transfer if the organiser drops out (3f-7 covers member dropout only).
