# Design analysis — slice 3l (Critters & pass) + 3m (After: recap, album, memory)

Date 2026-09-26. Sources: 20 screenshots (3l-1..10, 3m-1..10), captions, raw `Critterpass.dc.html` offsets 628800–799838, prototype `<script type="text/x-dc">` handlers (`holdSetup`, `toPass`, `variant`, `passFilter`, `ratePrompt`, per-screen `b:` maps), `doodles.js` motion engine (`tg-motion` presets/EASE, `tg-confetti`, `tg-type`), `critters-data.js`, Critter Collection page (1a bestiary, 1b-1..3), cross-refs 3a-9, 3f-5, 3f-7, 3i-5, 3k-1, 3k-4, 3n-1/4/5/7/9, 3o-3/4, 3p-6, 4b-3, 4c-2, 4e-2, 5a-4, 5c-1/3.

Motion engine reference (for all specs below): keyframe DSL `offset:tokens` over `dur` ms; tokens tx/ty(px|%), s/sx/sy, r(deg), o; per-segment easing `e=` → `in` cubic-bezier(.55,0,1,.45), `out` (0,.55,.45,1), `io` (.65,0,.35,1) **default**, `lin`, `back` (.34,1.56,.64,1). Loops on global clock unless `iter=1`. Presets: bob `ty0→-6→0` 2400; float `ty0 r-2→ty-9 r2` 4200; pulse `s1→1.07` 1600; ping `s.6 o.8 →s1.5 o0 (out)` 1800; spin 360° lin 9000; hop (squash sy.9@10%, jump ty-14 sy1.05@22%, land sy.94@34%, rest@42%) 2600; grow `sx0→1@40% (out)` 4000. `prefers-reduced-motion` → no motion (must carry to native: Reduce Motion / Android animator scale). Prototype helpers: `pop` = scale 1.12@40% 360ms ease-out; `shake` = translateX −8/7/−5/3/0; `thud` = SFX+haptic; `burstIn` = confetti.

---

## 1. Slice overview

**User goals**
- Collect local critters by *being there* (never bought/traded): hatch on landing, dwell-based encounters, forms/tiers, sets, legendary windows.
- Play together: crew quests generated daily from the plan, crew XP/level, shared rewards.
- Close the trip: auto-generated recap (summary + 8-card narrated story), shared album, passport stamp signed by crew, postcard (digital; physical for Pass+), anniversary memory that funnels into the next trip.

**Entry points (in)**
| Into | From |
|---|---|
| 3l-1 Egg hatch | Flight-landed push (proto: after 3k-5 Flight delayed → TELL THE CREW, toast "SQ 938 has landed at DPS" → tap). Egg granted at 3f-5 "slide to board" ("PON'S EGG HATCHES WHEN YOU LAND"). |
| 3l-2 Your pass | Tab bar PASS; after befriend (`toPass` flight); after legendary befriend (1.6s → tab); 5c Critterdex widget (lock/home). |
| 3l-4 Encounter | 5a-4 Live Activity "Something's nearby" / guide push "Something rustled near the spring pools"; proto parent = 3k-1 Trip hub. |
| 3l-7 Crew quests | 3k-1 hub tile "QUESTS 3 LIVE · crew level 7"; 3l-2 "Maya has 14" chip (proto `cp:maya`). |
| 3l-9 Once a year | 3l-2 gold "Legendary on your dates" card; locked legendary toast in 3l-3; 3m-1 "Golden Tokek got away" line. |
| 3l-10 Sakura Pon | 3l-9 Sakura row (demo); real: on-location at Maruyama Park during window. |
| 3m-1 Recap | Trip end (push, implied); 4c-2 Free boost ending links back ("← RECAP"); 3o-3 Rate trip back. |
| 3m-2 Photos | 3m-1 "312 PHOTOS" tile; TRIPS tab (tab highlighted); 3k-1 ticker "JORDAN ADDED 12 PHOTOS"; 3k-4 offline outbox "12 sunrise photos → crew album". |
| 3m-3..9 Story | Auto-plays first time recap opens ("plays as a story first"); 3m-1 SHARE RECAP (proto → cover, `rise`). |
| 3m-10 A year later | Anniversary push (quiet). |

**Exits (out)**
- 3l-1 SAY HI → 3j Guide chat (sheet); "Show me around later" → 3k-1 Trip hub.
- 3l-3 MAKE IT MY GUIDE → guide skin change (affects 3j, 5a, 5b avatars); ↗ → share card saved/share sheet.
- 3l-5 Back to the day → previous / Trip hub; REMIND ME → local notif.
- 3l-6 Share with the crew → 3g crew chat post.
- 3m-1 WHERE NEXT? → 3b Home vote ("The vote for next time is open"); on enter +1.6s toast → 3o-3 Rate the trip; 3p-6 App Store rating sheet after story finishes; 4c-2 Free boost ending surfaces here.
- 3m-5 VOTE FOR THE MVP → one-tap crew poll (3g poll infra).
- 3m-9 "Mail a real one" → 4e Paywall (if not Pass+); SEND TO THE CREW → crew chat/each member.
- 3m-8 → 3n-1 Profile stamp fills.
- 3m-10 PLAN A REUNION → 3b Home vote with Bali pre-pitched; ✕ → Home.

---

## 2. Per-screen specs

Tier colour tokens (from HTML): common label `#a9a3c0` (card bg per critter main colour, Tokek common `#a9d08c`); rare `#4f86ff` label, Tokek rare card `#54d6a4`; epic `#ff5fa8` label + pink sticker edge; legendary `#ffd84a` label, gold die-cut edge. Locked silhouette: sticker `#2c2750` fill `#3a3466` + grey "?"; locked legendary: sticker `#3a2f14` fill `#6b5a24` + gold "?". App bg `#17142a`, surface `#1f1b38`, track `#2c2750`, text `#f4efe4`, muted `#a9a3c0`. Fonts: Archivo 900 condensed (font-stretch 70–78%) headings, Geist body, Geist Mono meta, Caveat handwriting.

### 3l-1 Egg hatch
- **Purpose**: arrival moment; grants guide critter common form (#1 of set) and introduces guide for trip.
- **UI**: full-screen dark, radial yellow glow; eyebrow "DPS · 13:50 · YOU LANDED" (airport IATA · local landing time); headline "WELCOME TO BALI"; egg sticker (cracked pose, spots `#ffd84a`) → Tokek sticker (cheer pose); title "TOKEK HATCHED"; body "Your guide for the next eight days, and critter #1 in the Bali set."; primary SAY HI (yellow pill 58px); text link "Show me around later".
- **Data**: Trip{destination, dates → day count}, arrival{airport code, local time}, Guide{name, critter form common}, set position.
- **Actions**: SAY HI → guide chat sheet; later → Trip hub tab. Collection entry created (source=hatch).
- **Motion** (master 5000ms, plays once in app; proto pauses at 4300ms): egg wobble r 0→−8→8→−10→10 at 400ms steps (0–1520ms), s1.08 @1900, pop s1.35 o0 @2100; confetti burst @2100 (70 pcs, origin x.5 y.45, palette `#ffd84a,#ff5fa8,#4f86ff,#54d6a4,#f4efe4,#ff9a4d`, gravity) + thud (SFX + heavy haptic); Tokek s0→1 back-ease 2100–2600, squash sx1.04 sy.94 @2900, settle @3200, transform-origin 50% 90%.
- **States**: designed = success only. MISSING: hatch while offline (arrival detected but no network), late crew members (each hatches own egg at own landing), hatch not triggered (no flight imported/location denied) → manual "I've landed" fallback, re-open after dismiss (where does egg live?), multi-city trip (second egg?).
- **AI**: none required (copy templated); optional LLM greeting line.
- **Realtime**: crew hub/ticker "Rin landed" likely; not designed.
- **OS**: push "landed" (flight status or arrival detection), haptic, SFX, music theme switches on landing (3n-7 "It changes when you land").
- **Gates**: free.

### 3l-2 Your pass (Critterdex, PASS tab)
- **Purpose**: collection home; context-first ordering.
- **UI**: header "YOUR CRITTERDEX 9/150" (big number), pink chip "6 OF 61 PLACES", "Maya has 14" (crew comparator, tappable → quests); segmented ALL/FOUND/NEAR ME; **Here-now card** (yellow border) "HERE NOW · BALI" + "TOKEK · 2 OF 4 FORMS" + 4 form tiles (sticker 56px + tier label) + hint "Epic is tomorrow: summit Batur by sunrise."; **Legendary-on-your-dates** row (gold border, locked gold silhouette) "SAKURA PON · KYOTO, APR 2–9 ›"; **Home set** Vietnam row "3/10 · HOME SET" + 10 mini stickers (found coloured, locked silhouettes); section "RANK 1–10 · FIVE CITIES EACH"; per-country rows "#01 FRANCE 2/5 FOUND" + 5 slots (then ranks 11–30 ×3, 31–60 ×1). Tab bar HOME / TRIPS / center guide FAB (current guide sticker on yellow disc) / WALLET / PASS. Collection page 1b-1 variant adds "Search a city or a critter" field.
- **Data**: user collection count (locals found), places touched count (countries), crew best/peer count, current city + guide critter forms owned, next legendary window overlapping user's upcoming trip dates, sets by rank with found counts per slot, NEAR ME set (proto `data-near`: "#28 Indonesia 1/3").
- **Actions**: here card → 3l-3 (zoom/flip transition); legendary card → 3l-9; Vietnam → 3l-8; row tap → toast "France: 2 found so far" / "nothing yet. Found by being there." (no country-detail screen designed); tabs filter (FOUND hides rows with 0; NEAR ME shows near rows only and hides home set + rank label; newly shown rows fade/slide 10px 320ms).
- **Motion**: new forms fly in from encounter and land in slot with thump (`toPass`: clone sticker, 780ms cubic-bezier(.4,0,.2,1), arc mid-point −140px y, r−14°, scale to slot; then slot `pop` + thud + toast). Locked slots "breathe faintly" (opacity pulse, not in HTML; suggest o .55↔.75 3–4s io). Card-to-detail flip.
- **States**: MISSING: first-run empty (0/150, no trip), not on a trip (no here-now card), location off (NEAR ME empty/permission CTA), loading/skeleton for 150 stickers, offline (cached), search results/no results, country-detail page for non-home sets, what "Maya has 14" shows when solo.
- **AI**: hint line generated from plan + form rules ("Epic is tomorrow…") — rules engine joins form requirement with plan items; LLM optional for phrasing.
- **Realtime**: crew counts update on befriend events.
- **OS**: widgets 5c (Critterdex progress small/lock ring, tinted mono rendering), location for NEAR ME.
- **Gates**: free ("every critter stay free for everyone").

### 3l-3 Critter detail
- **Purpose**: one critter card; forms, provenance, requirements.
- **UI**: big card in form's colour (rare `#54d6a4`, dot-pattern), tag pill "RARE · WATER TEMPLES", number "#112", sticker 204px, name "TEMPLE TOKEK", holder avatars (W, M); field note in Caveat, form-coloured: "Lives in the spring pools at Tirta Empul. Only comes out when it's quiet." + "From Tokek's field notes"; 3 info chips FOUND "Oct 14, 10:42" / WHERE "Tirta Empul" / ALSO HAS IT "Maya"; "FORMS · 2 OF 4 — ONE TOKEK, FOUR WAYS" strip: COMMON "Be in Bali", RARE "Three water temples" (selected: inset 2px ring in tier colour), EPIC locked "Batur by sunrise", LEGENDARY locked "All six at the top"; CTA MAKE IT MY GUIDE (card colour) + ↗ round button. Collection-page variant 1b-3 (non-guide critter Chép): tag "HỘI AN · VIETNAM", strip = rest of its set "VIETNAM SET · 3 OF 10", CTA SHOW THE CREW.
- **Data**: CritterForm{number, name per form, tier, tag/habitat, field note, colour, art params}, CollectionEntry{found_at local tz, POI name}, crew holders, requirement text per form.
- **Actions**: tap found form → swap big sticker attrs (fill/spot/accent/belly/pose) + card bg transition 400ms + retext tag/name/note; tap locked → shake + toast of requirement (legendary toast taps → 3l-9); MAKE IT MY GUIDE → one-shot "YOUR GUIDE ✓ Temple Tokek is your guide in Bali now."; ↗ → share card image ("saved to Photos").
- **Motion**: card flips over from pass; sticker `pulse` 3200ms loop; form switch spin = rotateY 0→180 (s.9)→360 over 560ms, perspective 600; tile `pop`.
- **States**: MISSING: undiscovered critter detail (can you open a fully locked critter?), share failure/permission denied for Photos add, guide-skin for non-guide critters (button hidden?), deleted crew holder.
- **AI**: field notes are authored content (600 forms) — LLM-drafted offline + human-reviewed; not runtime.
- **Realtime**: holders list.
- **OS**: Photos add-only permission / share sheet; image render.
- **Gates**: free. Avatar use of forms is 3n-4 (rare+ keeps coloured ring; legendary gold).

### 3l-4 Encounter
- **Purpose**: befriend a form while physically at its spot.
- **UI**: full-bleed live camera (placeholder: teal stripes `#1d3a38`) with mono caption "live camera · Tirta Empul spring pools"; top pills ENCOUNTER (`#54d6a4`) and "You're at Tirta Empul"; viewfinder corner brackets 240px; two ping rings 220px; critter sticker 180px (wave pose); bottom sheet `#17142a` r30: eyebrow "RARE · WATER TEMPLES ONLY" (tier colour), title "A TEMPLE TOKEK IS HERE", tier star icon, body "It's shy around crowds. Stay a few minutes and it'll come closer. Maya befriended one here this morning.", HOLD ring 86px (conic `#54d6a4` on `#2c2750`, inner 70px) + "HOLD TO BEFRIEND / Tokek's rare form, 2 of 4".
- **Data**: Spawn{form, POI, radius 50m (5a-4), dwell target}, user dwell progress, crew social proof (who befriended here, when), crowd context.
- **Actions**: press-and-hold ring: fills (proto 1500ms linear), release drains (450ms full→0), ring scales .94 on press (150ms), critter scales 1→1.3 with progress; complete → thud + confetti(40) + 300ms → 3l-6 (burst transition). Tapping the critter → dodge (translate 46,−34 r14° 640ms ease-out) + toast "Too quick. It's shy. Hold the button and stay put." Leaving radius → 3l-5.
- **Motion**: pings 2200ms, second delayed 1100ms; critter `hop` 2600ms; "hops between spots in camera view and edges closer the longer you stay" (dwell-driven position/scale — spec needed: e.g. 3–4 anchor spots, scale .7→1.0 with dwell%).
- **States**: MISSING: camera permission denied (fallback illustrated scene), camera unavailable, GPS accuracy too low (>radius), dwell not yet complete (is HOLD disabled?), crowded now (shy — longer dwell?), offline (must still work at summits), already owned form, quiet hours/temple mute, battery saver, multiple spawns at once, encounter from background (resume state after Live Activity).
- **AI**: copy lines templated from events; no LLM needed at runtime.
- **Realtime**: crew "befriended one here this morning" from crew collection feed.
- **OS**: camera (NOT in 3a-9 permission trio — needs its own contextual prompt), precise location + background updates, Live Activity/Dynamic Island (5a-4: ring counts while locked, "STAY 4 MORE MIN", silhouette sharpens), haptics during hold (ramping) + thud, SFX ("critter voices" chirp, 3n-7) muted inside temples/quiet hours, optional device-motion parallax / AR.
- **Gates**: free (5a-4 LA shows FREE chip).

### 3l-5 It wandered off
- **Purpose**: graceful fail when user leaves mid-encounter; convert to plan-able retry.
- **UI**: camera bg "Tirta Empul, the path out"; pills ENCOUNTER OVER (purple) / "YOU STAYED 4 MIN"; dashed empty ring; footprint dots trailing to right edge; locked dark silhouette peeking at edge; sheet: "RARE · WATER TEMPLES ONLY", "IT WANDERED OFF", body "You left the pools after four minutes, and it's shy. It comes back when the place goes quiet."; BEST CHANCE card "TOMORROW, 07:30" + 13-bar crowd chart 6am–6pm, lowest/best bar green `#54d6a4`; REMIND ME AT 07:00 (yellow); "Back to the day".
- **Data**: encounter{dwell seconds}, POI crowd forecast by hour (next day), next quiet window, reminder lead time (30 min).
- **Actions**: REMIND ME → schedules notif ("REMINDER SET ✓ Tokek will wake you at 07:00"); Back → pop stack / Trip hub.
- **Motion**: critter hops to frame edge, looks back once, leaves footprints (sequential dot reveal), then `bob` 2600 at edge.
- **States**: MISSING: no forecast data for POI (fallback copy), best window conflicts with plan (offer add to plan?), window after trip ends, reminder permission denied, partial-progress retention (5a-4 says ring "drains slowly rather than resetting" → define grace period before "over").
- **AI**: none (forecast data).
- **OS**: local notification scheduled at window−30min (respect 5b ping budget + quiet hours; it's an alarm-ish wake at 07:00).
- **Gates**: free.

### 3l-6 Befriended
- **Purpose**: reward beat; commit form to pass.
- **UI**: dark bg with 700px conic rays; sticker 220px cheer; eyebrow "RARE FORM · 2 OF 4" (teal); "BEFRIENDED!"; chips "+150 XP" (yellow), "TEMPLE TOKEK" (teal), "2 IN THE CREW" (purple); "You stayed 11 minutes. It noticed."; ADD TO YOUR PASS (teal pill); "Share with the crew".
- **Data**: form, XP award per tier (rare=150; others unknown), dwell minutes, crew holder count.
- **Actions**: ADD TO YOUR PASS → `toPass` flight into pass slot (see 3l-2) + toast "Temple Tokek is on your pass. That's 2 of Tokek's 4 forms."; Share → post to crew chat ("Shared to the Bali Six chat.").
- **Motion** (4500ms master, proto pauses @3825): rays `spin` 24000 linear loop; sticker s.2 r−24 o0 → s1.12 r5 o1 @540 (back) → s1 r0 @900; confetti @360 origin (.5,.32); XP odometer 0→150 over 900ms.
- **States**: MISSING: befriend recorded offline ("pending sync" badge), server rejects (integrity fail) → rollback UX, duplicate (already had), level-up interstitial if XP crosses crew level.
- **Realtime**: broadcast befriend to crew (count chip, 3l-3 holders, 3l-4 social lines).
- **OS**: haptic success, SFX slap.
- **Gates**: free.

### 3l-7 Crew quests
- **Purpose**: daily cooperative goals derived from plan; crew progression.
- **UI**: eyebrow "BALI SIX · CREW LVL 7", title CREW QUESTS, guide sticker (point pose); XP bar "640 / 1000 XP" + "Level 8 unlocks a crew sticker"; quest cards (title in quest colour, description, progress, reward line, icon):
  - SUNRISE SQUAD (yellow): "All six on the Batur summit by 06:10 on Thursday." progress = avatar pips W M A J + 2 dashed empty (signed-up members); reward LEGENDARY CRITTER (gold locked silhouette).
  - WARUNG CRAWL (pink): "Eat at five different warungs." 3/5 pips; +120 XP; bowl icon.
  - ZERO DEBT (green): "Settle every bill before the flight home. $186 to go." 4/6 pips; reward SETTLED TOKEK; wallet icon.
  - SAY IT IN BAHASA (blue): "Learn five phrases with Tokek. Terima kasih counts." 2/5; +80 XP; chat icon.
- **Data**: Crew{level, xp, next unlock}, Quest{type, title, desc, target, progress, deadline, reward, participants}, evidence counters (warung visits, balances outstanding, phrases learned), trip plan.
- **Actions**: tap card → (proto) toast "Four of six are signed up. Dev and Rin are next." No detail/sign-up screen designed.
- **Motion**: XP bar `grow` (sx0→1 over 40% of 5000 = 2000ms ease-out, origin left); pips fill with spring; completion spins reward sticker onto everyone's phone simultaneously (overlay on all crew devices).
- **States**: MISSING: quest detail / join / opt-out, completed & expired quests, generation pending (before morning), no plan → no quests, offline progress, quest invalidated (plan changed, place closed), solo crew, crew >6 (boost, 16) wording "All six".
- **AI**: LLM job each morning ("Tokek writes quests from the actual plan"): input = day plan, bookings, balances state, crew size/profiles, local phrases, catalog of verifiable quest templates; output = structured JSON {template_id, params, title, description, reward}; background job, not streamed. Must map to machine-checkable metrics.
- **Realtime**: progress + completion events to crew channel; reward grant broadcast.
- **OS**: push on completion; location for presence quests; 3i-5 Settled Tokek grant "at the same moment".
- **Gates**: free (not listed in comparison table).

### 3l-8 Vietnam set (home set)
- **Purpose**: per-set grid; show what's left without spoiling.
- **UI**: back "← CRITTERDEX", eyebrow HOME SET, title VIETNAM, "3/10", 10-segment progress bar (yellow per found); 3-col grid of cells: found = sticker + NAME + CITY + 4 form dots top-right (lit in tier colour when found); locked = silhouette + "?" + "???" + city.
- **Data**: set members (#001–#010), per-member found forms (4 dots), city names in native script with diacritics.
- **Actions**: found cell → `pop` + toast field note (e.g. "Found on the Thu Bồn at lantern time. Its rare form came with the lanterns."); locked → shake + "Found by being in Hạ Long."
- **Motion**: none in HTML beyond tap feedback; bar fills one segment per critter.
- **States**: MISSING: complete set celebration (reward? "HOME SET" earned app icon exists in 3n-5), loading.
- **Note**: caption says locked shows "never the critter" but HTML renders each critter's real silhouette (`kind="cp-002"` locked) — decide.
- **Gates**: free.

### 3l-9 Once a year (legendary calendar)
- **Purpose**: legendary windows discovery + reminders.
- **UI**: back, REMIND ME (yellow pill), "ONCE A YEAR", body "Legendaries only show up on one day a year, or for the hardest thing a place has. They can't be bought or traded."; 12-month strip (J…D): months with legendary have gold dot; month overlapping user's next trip filled yellow (A); current month outlined (S); list "ON ONE DAY": NOV 1–2 Marigold Ajo · Mexico City · Día de Muertos; APR EARLY Sakura Pon · Kyoto · the week the blossoms peak [YOUR DATES]; JUN 12 Festa Sardi · Lisbon · Santo António night; JUN 24 Inti Paco · Cusco · Inti Raymi; AUG LATE Puffling Lundi · Heimaey · puffling nights. "FOR THE HARDEST THING": ANY DAY Golden Tokek · Bali · all six on Batur by sunrise [4 OF 6 IN] (pink). All silhouettes gold.
- **Data**: LegendaryWindow{form, place, window (fixed date / variable forecast / any-day challenge), label}, user's upcoming trips (overlap), quest signups.
- **Actions**: row → pop + toast note (e.g. "Inti Raymi, June 24. Paco watches from the walls of Sacsayhuamán."); Sakura row → 3l-10 (demo); REMIND ME → "REMINDERS ON — A nudge a month before each window" (one toggle for all windows).
- **Motion**: gold glint on legendary months; overlapping month filled.
- **States**: MISSING: reminders off/on toggle state, window already passed this year, variable date not yet announced (sakura forecast pending), already-owned legendary, past-window greyed.
- **OS**: scheduled notifications a month before each window (server-scheduled; windows can move).
- **Gates**: free.

### 3l-10 Sakura Pon (legendary encounter)
- **Purpose**: legendary variant of encounter; night, time-limited.
- **UI**: status bar 21:10; night pink scene, cherry branch + blossoms top, two lanterns; LEGENDARY pill (yellow); "You're under the big cherry"; gold viewfinder brackets; gold ping rings; Pon sticker 190px (pink palette fill `#ffc2d9`, spot `#c94f86`, belly `#fff1f6`, cheer) with **gold die-cut edge** (only legendaries); 3 gold sparkles; sheet with gold border: "LEGENDARY · BLOSSOM WEEK ONLY", "SAKURA PON IS HERE", body "It only comes out the week the blossoms peak, and only after dark. Stay still under the lanterns and it'll settle.", gold HOLD ring, "Your first legendary. Rin spotted it first."
- **Data**: window (bloom-peak week) + after-dark constraint (local sunset), POI geofence (single tree/park area), crew firsts ("Rin spotted it first"), user's legendary count.
- **Actions**: hold (proto 2400ms vs 1500 normal) → confetti(140) + toast "Sakura Pon is on your pass. Your first legendary." + 1.6s → Pass tab. Tap critter → dodge (−40,−30 r−12°).
- **Motion**: 12 petals fall linear: ty 0→560, tx ±30/36, r 200→420° (+20° each), o 0→1 @8%, →0 after 85%; durations 6500–9600ms, delays 0…5830 step 530; lanterns `bob` 3200/3800; gold pings 2400 (+1200 offset); Pon `float` 4200; sparkles `pulse` 1600/1900/1700 delays 0/500/900.
- **States**: MISSING: arrive in daylight ("comes out after dark" countdown), window ended mid-trip, legendary already owned, crowding at popular spot, "stay still" detection (accelerometer?).
- **Realtime**: first-spotter attribution across crew.
- **OS**: location (tight geofence), sunset calc, camera, haptics, SFX.
- **Gates**: free; not tradable.

### 3m-1 Recap (summary page)
- **Purpose**: persistent post-trip page; story "settles into" it.
- **UI**: eyebrow "OCT 12–19 · THE BALI SIX"; "BALI, THE RECAP"; dark guide silhouette top-right (hop); 4 tilted stat tiles: yellow "214 KM driven, mostly by Made", pink "1 VOLCANO climbed before sunrise", blue "312 PHOTOS Jordan took 140 of them", green "$0 OWED settled two days early"; card "TOKEK'S FORMS 3 OF 4 FOUND" with 4 stickers (common, epic orange `#ff9a4d` with pink glow, rare, gold locked) + "The Golden Tokek got away. Dev slept through the summit."; two award chips (Caveat labels) "Earliest riser — Jordan, knee and all", "Best find — Alex: Warung Pondok"; SHARE RECAP (cream) + WHERE NEXT? → (yellow).
- **Data**: Recap{stats: distance + top driver, superlative POIs (volcano), photo count + top uploader, balances outstanding + settled lead time, forms found this trip, got-away form + reason, highlight awards}.
- **Actions**: SHARE RECAP → story (proto) / share; WHERE NEXT → Home vote; photos tile → 3m-2; got-away line → 3l-9; on enter +1600ms toast "Rate the trip? Thirty seconds…" → 3o-3 (once); App Store rating sheet (3p-6 rules: only after good trip, never during trip/after error/after paywall, ≤3/yr).
- **Motion**: stats stamp in one by one (stamp slam, suggest s1.4 o0 → s1 with 120–150ms stagger + thud), new critters tumble into a pile (physics-ish drop + rotate), silhouette `hop`.
- **States**: MISSING: generating ("Tokek is writing your recap"), partial (no photos / no expenses / no km), failed, dropout viewer (Dev per 3f-7 still gets recap), solo trip, trip cut short, recap regeneration when late photos/expenses arrive, offline cached.
- **AI**: LLM captions/witty lines from structured stats (see 3m-5); background job at trip end; cached.
- **Realtime**: minor.
- **OS**: share sheet, push "recap ready", rating prompt API (SKStoreReview / Play In-App Review).
- **Gates**: free; kept forever (4b-3/4c-2 "KEPT FOR GOOD").

### 3m-2 Photos (shared album)
- **Purpose**: crew album with guide curation.
- **UI**: "PHOTOS" + "+ UPLOAD" pill; segmented BEST · 24 / ALL · 312 / BY PERSON; guide note in Caveat "I picked 24 keepers. Nothing blurry, and everyone's in at least three."; sections "DAY 4 · BATUR SUNRISE", "DAY 5 · NUSA PENIDA"; masonry (1 large 2×2 + small tiles), uploader avatar chip bottom-right; tab bar (TRIPS active).
- **Data**: Photo{uploader, taken_at, day index, place/plan item, quality scores, faces→members, pick flag}, counts, best-set rules.
- **Actions**: upload (picker, multi) → "Uploading 12 photos from today."; tabs; long-press → who's in (face tags); tap → viewer (not designed).
- **Motion**: photos stream in as crew uploads, each drops in (small y-drop + fade); picks glint (sheen sweep) when chosen.
- **States**: MISSING: empty album, upload progress/failure/retry, offline queue (3k-4), Photos permission limited/denied, video support, duplicates, viewer/fullscreen, delete/hide/report, download all ("I'll send the album" 4c-2), storage quota, BY PERSON view design, face-tag consent, curation in progress.
- **AI**: vision curation job: blur/exposure scoring, near-duplicate clustering, face detection + clustering to members, coverage constraint (everyone ≥3), aesthetic ranking; LLM writes note. Background job, re-run as uploads arrive.
- **Realtime**: album channel (new photo events; ticker on 3k-1).
- **OS**: photo library (PHPicker/Android Photo Picker — no full-library permission needed), background upload (URLSession background / WorkManager), save to Photos, on-device face detection (Vision / ML Kit), EXIF GPS/time.
- **Gates**: free; kept forever. (Cost exposure.)

### 3m-3 Recap, the cover (story card 1/8)
- **Purpose**: story opener.
- **Story chrome (all 8 cards)**: 8 progress segments (3px, gap 4, top 54px), completed = solid, current fills linear over 6000ms, pending = 20–25% alpha; header: guide mini sticker + "TOKEK PRESENTS" / "Bali, the recap · ♪ gamelan lo-fi" + ✕. Card bgs alternate (yellow dotted / dark / orange / cream lined).
- **UI**: yellow `#ffd84a` dot pattern; eyebrow "THE BALI SIX · OCT 12–19"; giant "BALI"; chips "8 DAYS" "6 OF YOU" "1 VOLCANO"; stickers of guides around (gecko wave 150, sardine 112, tanuki 96, puffin 92, alpaca 104); footer "Tap to start · hold to pause".
- **Actions**: tap → next (proto: tap bottom line → route), hold → pause, ✕ → close (back to 3m-1). Story nav convention: tap right/left halves (not designed; recommend).
- **Motion**: stickers slap in with back ease over 540ms, delays 200/300/600/900/1200/1500ms, from s0 r(−20/−24/30/18/−18/24) to resting r(−8/−8/10/6/−6/8); sardine additionally `float` 4600. BALI slam s1.6 o0 → s.96 @360ms (ease-in) → s1 @630 (HTML delay 100ms — caption says stickers first then slam; reorder: slam after last sticker ~1600ms); page shake on slam (unspecified; suggest ±6px 250ms) + thud. Music theme starts.
- **AI**: narration ("Tokek narrates") — text captions and/or TTS voice (unclear).
- **OS**: audio session (music ducks/mixes; respects silent switch?), haptics.

### 3m-4 Recap, the route (card 3/8)
- **UI**: dark dotted bg; "THE ROUTE", "214 KM", "Made drove 180 of them."; stylised (non-geographic) zig-zag trail with coloured stop dots + labels: SEMINYAK D1, UBUD D2–4, BATUR D4 · 02:51 (orange), AMED D5, NUSA PENIDA D6, SEMINYAK D8; guide sticker riding; footer quote card with car icon "Longest leg: Ubud to Amed, three hours and one very patient driver."
- **Data**: ordered stops (bases per day) with day ranges, notable times, legs with distance/duration, driver attribution (ride tracking 3h "getting around").
- **Motion**: dashed trail draws stop by stop (stroke reveal); guide travels waypoints over 9000ms (5 legs × 1800ms: (0,0)→(146,88)→(228,188)→(56,270)→(166,360)→(16,432)); km counter rolls in sync; each stop pops on arrival; Batur dot glows orange. Conflict: card timer 6000ms < ride 9000ms.
- **States**: MISSING: single-base trip (no legs), >6 stops layout, missing distance data.
- **AI**: LLM line "Longest leg…" from leg data.

### 3m-5 Recap, crew awards (card 4/8)
- **UI**: "THE CREW AWARDS", "SIX OF YOU, SIX AWARDS"; 2×3 coloured cards each: avatar initial, star (vote) icon, award title, evidence line: J EARLIEST RISER "Up at 02:51 on Batur day. Nobody asked."; M HUMAN CAMERA "140 of the 312 photos, 9 of them good."; R THE TREASURER "Logged 23 expenses. Found the $4 error."; A BEST FIND "Warung Pondok. Back twice in one day."; D WORTH THE WAIT "Late to 3 pickups, first to the summit."; W THE PLANNER "14 plan edits and one tidy spreadsheet."; VOTE FOR THE MVP (pink).
- **Data**: per-member metrics: wake/"I'M UP" timestamps (5a leave-by), photo counts + quality, expenses logged + corrections, place revisits (visits/check-ins), lateness at pickups (meet-up/ETA data 3g/3k), plan edit counts (3e). Colour per member.
- **Actions**: VOTE FOR THE MVP → one-tap crew poll ("Vote sent. Jordan is ahead, obviously.") → next card; winner's card gets gold edge on everyone's recap.
- **Motion**: cards deal from top: ty−30 o0 → 0 over 450ms back-ease, 160ms stagger; settle at slightly wrong angles (±1–3° random, seeded per member for consistency across devices).
- **States**: MISSING: crew > 6 (layout for up to 16 with boost), member with no data, vote closed/result state, tie, dropout member in crew.
- **AI**: award assignment = deterministic metric ranking (one unique award per member) + LLM for title/line wording with tone guardrails (roast-lite; avoid sensitive/health: "knee and all").
- **Realtime**: poll votes, result edge.

### 3m-6 Recap, the receipt (card 5/8)
- **UI**: orange dotted bg; "MONEY, WRAPPED", "$460 UNDER"; thermal receipt: guide sticker, "THE BALI SIX", "OCT 12–19 · 6 GUESTS", lines STAYS $2,820 / FOOD · 61 MEALS $1,284 / TRANSIT · MADE $1,016 / THE BOAT $540 / BATUR GUIDE $420 / FUN, OTHER $900; TOTAL $6,980 / PLANNED $7,440 / EACH $1,163; PRICIEST The boat / CHEAPEST DAY D6 · $38 each / SETTLED In 2 days; Caveat "Everyone's square. Nobody owes anybody."; barcode; "THANK YOU · TERIMA KASIH"; zig-zag tear; green round stamp "BALANCES PAID IN FULL".
- **Data**: expenses aggregated by category (+ meal count, top payee "Made"), planned budget (3c budget sweet spot / 3i budget), per-person average, priciest item, cheapest day per person, settlement completion time, currency.
- **Actions**: swipe up → your own split (NOT designed); save as image.
- **Motion**: receipt prints down ty−560→0 over 1080ms ease-out, "one line at a time" with thermal-printer buzz SFX (line reveal ~60–80ms/line); PAID IN FULL slam delay 1400: s2.2 o0 → s.94 @450 (ease-in) → s1.04 @720 → s1 @990 + thud.
- **States**: MISSING: unsettled balances (stamp variant "STILL OWED", CTA to Settle up), over budget ("$X OVER"), no budget set, multi-currency (display currency per viewer?), no expenses logged, boost split IOUs line (4b-3).
- **AI**: optional LLM line ("Everyone's square…"); numbers deterministic.

### 3m-7 Recap, the one that got away (card 6/8)
- **UI**: dark with warm radial glow; big gold locked silhouette (220px) with "?"; eyebrow "THE ONE THAT GOT AWAY"; "GOLDEN TOKEK"; body "Seen twice on Batur, befriended by nobody. Dev slept through the second one. It comes back in the dry season, May to September."; row of 4 form stickers (3 found + gold locked) "3 of 4 forms"; REMIND ME IN MAY.
- **Data**: missed form selection (highest tier not obtained with sightings), sightings count/location, who missed (crew attendance), next window.
- **Actions**: REMIND ME IN MAY → conditional notification ("I'll tell you in May, only if the crew is planning.") → next card.
- **Motion**: lights dim to single warm glow; silhouette `float` 5200; the Dev line types in last (typewriter ~40ms/char, +260ms at , . ?; caret blink 480ms).
- **States**: MISSING: nothing got away (all forms found → alternate card), multiple candidates, reminder already set.
- **AI**: LLM narrative from sightings + attendance (sensitive: naming who "slept through").
- **OS**: server-evaluated push in May (conditional on crew planning state).

### 3m-8 Recap, the stamp (card 7/8)
- **UI**: cream lined passport page; "ENTRIES · ENTRÉES" / "PAGE 13"; faded older stamp (blue "LISBON JUN 24"); big orange round stamp "DPS · ARRIVED · BALI · 12–19 OCT 2026" with outline guide; crew signatures in Caveat in member colours scattered: "Maya ✶", "Jordan", "Rin", "alex!", "Dev (late)"; footer "STAMP 13 IS BALI — The crew signed it. It's on your profile now."
- **Data**: user's stamp sequence number, previous stamp, arrival airport, trip dates, stamp colour (guide colour?), signatures {member, text, colour, signed_at}.
- **Actions**: tap → next card (proto). Signing interaction not designed.
- **Motion**: page turns to fresh spread (page-curl, unspecified); stamp slam delay 400: s2.4 r−30 o0 → s.95 r−6 @450 (ease-in) → s1.03 @720 → s1 @990 + thud; signatures write themselves (stroke-reveal) in own colours **as each member opens the recap** (live). Profile (3n-1) dashed Bali stamp fills in same colour.
- **States**: MISSING: members who haven't opened (placeholder dashed signature slots?), dropout signatures, signature for deleted account.
- **Realtime**: recap presence channel → signature events.

### 3m-9 Recap, the postcard (card 8/8)
- **UI**: "LAST CARD", "SEND IT HOME"; postcard front (photo "Batur at sunrise", "Greetings from BALI", guide sticker) and tilted back (handwritten note "Summit at 06:02, knees at 06:03. Same time next year? — W", address lines, guide stamp with pink perforated edge); format chips POSTCARD / STORY 9:16 / POSTER; SEND TO THE CREW (yellow); "Mail a real one to each of you" + PASS+ badge.
- **Data**: chosen photo (guide pick), LLM note from highlights (editable), author initial, guide stamp, formats (6×4 postcard, 9:16 story, A3 poster with route on back).
- **Actions**: format chips ("Postcard, 6 × 4." / "Story size, for sharing." / "Poster, A3, with the route on the back."); SEND TO THE CREW → back + "Postcard sent to the Bali Six."; Mail a real one → Paywall (rise) if not Pass+; note rewrite (tap note → edit, not designed).
- **Motion**: loop 6000ms: r−4 static, bounce r−2 s1.03 @2700–3000 → back @3300 ("front flips over to back every few seconds with a small bounce" — the flip itself unspecified: suggest rotateY 180 600ms io every ~6s).
- **States**: MISSING: note editor, photo picker for front, Pass+ mail flow (addresses, confirmation, tracking, per-trip quota used), mailing unsupported country, send failure, poster print (is it a paid product?).
- **AI**: LLM note ≤ ~120 chars in user's voice from recap highlights.
- **OS**: share sheet / Instagram Stories share (9:16), save image, address autofill (contacts/text content type).
- **Gates**: digital free; physical mail = Pass+ (one per trip mailed to everyone in crew).

### 3m-10 A year later (anniversary memory)
- **Purpose**: re-engagement; reunion loop.
- **UI**: full-bleed photo "the six of you on Batur, 06:02"; chip "ONE YEAR AGO TODAY"; ✕; guide sticker (wave) corner; "BATUR, A YEAR ON"; body "Oct 15, 2026. Six of you on top of a volcano at 06:02. Jordan still has the headlamp."; reaction chips: M "❤ 2", J "“again??”", R "+1"; PLAN A REUNION (yellow); "Share the memory".
- **Data**: highlight moment (date = best day, Oct 15 = Day 4, not trip start), photo, LLM text, reactions {member, type/emoji/text/+1}.
- **Actions**: PLAN A REUNION → Home, new vote with Bali pitched ("Bali is pitched for next year. The vote is open."); Share → image "with the crew's signatures" saved to Photos; ✕ → Home. Reaction input UI not designed.
- **Motion**: arrives as quiet notification; photo drifts in slowly (Ken Burns, scale 1.08→1 over ~8s, o0→1); guide `bob` 2600; reactions pop in live as crew opens theirs.
- **States**: MISSING: no photo (fallback illustration), crew disbanded/members deleted, member left crew, notification opt-out, reaction composer, multiple anniversaries same day.
- **AI**: LLM line from trip memory data ("Jordan still has the headlamp" — callback to a trip detail).
- **Realtime**: reactions channel.
- **OS**: scheduled push (passive/quiet interruption level), share/save.
- **Gates**: free.

---

## 3. Feature list

| # | Feature | Description | Screens | Cx | Justification | Depends on |
|---|---|---|---|---|---|---|
| F1 | Critter catalogue & content pipeline | 150 locals × 4 forms: names per form, field notes, art params, requirement text, rules, geofences, windows, i18n (native scripts) | all 3l | L | 600 authored forms + rule/POI data + yearly window ops | CMS/admin, POI DB |
| F2 | Sticker renderer (native port) | Port doodles/critters-draw procedural brush art; tier treatments (recolour, pose, pink edge, gold die-cut), locked silhouettes grey/gold, blink/idle, pre-rasterised atlases for lists/widgets/LA/share | all | XL (shared) | Canvas2D→native Skia/CoreGraphics, perf for 150+ stickers, static exports | cross-app |
| F3 | Arrival detection + egg hatch | Egg granted at board; hatch on landing (flight status + device arrival), hatch choreography, grant common form | 3l-1 | M | multi-signal trigger + once-only choreography | 3h flight status, 3f-5 |
| F4 | Critterdex / pass tab | Counts, filters ALL/FOUND/NEAR ME, here-now card, legendary-on-dates, home set, ranked rows, search | 3l-2, 3l-8 | M | list perf + contextual cards | F1, F2 |
| F5 | Critter detail | Form switcher, provenance, crew holders, requirement shakes, make-it-my-guide skin, share card | 3l-3 | M | form re-theming + share render | F2, F16 |
| F6 | Location-dwell encounter engine | Spawn rotation, geofence enter, 50m dwell accrual in background, slow drain, grace, offline eval, integrity/anti-spoof, server verification | 3l-4/5/10, 5a-4 | XL | OS background limits, battery, accuracy, offline, cheating | location perms, LA |
| F7 | Encounter UI + befriend | Camera scene, hop/closer behaviour, hold ring (1.5s / 2.4s legendary), dodge, wandered-off, befriended, fly-to-pass | 3l-4/5/6/10 | L | camera + choreo + state machine | F6, F2 |
| F8 | Quiet-window forecast + reminder | Next low-crowd window for POI, remind 30 min before | 3l-5 | M | crowd data per POI | 3d crowd forecast |
| F9 | Legendary windows | Annual/variable windows, after-dark/sunrise constraints, calendar strip, overlap with trips, reminders month before | 3l-2/9/10 | L | variable dates (sakura), tz, ops | F1, F6 |
| F10 | Crew co-presence legendary | "All N at summit by 06:10" verification across devices, offline | 3l-3/7/9, 3m-7 | L | multi-device location proof, offline | F6, F11 |
| F11 | Crew quests | Daily LLM generation from plan into verifiable templates, sign-ups, event-driven progress, rewards broadcast | 3l-7, 3k-1 | XL | LLM + rules engine + many data sources + realtime | 3e plan, 3i, 3j, F6 |
| F12 | XP & crew level | XP ledger (befriend, quests), crew level, unlock crew sticker | 3l-6/7 | S | ledger + thresholds | F11 |
| F13 | Special stickers | Non-form collectibles (Settled Tokek, crew sticker) | 3l-7, 3i-5, 3n-5 | S | new collectible type | F2 |
| F14 | Recap generation pipeline | Trip-end job: aggregate stats, route legs, receipt, awards, got-away, stamp, postcard default, LLM copy; regenerate on late data | 3m-1..9 | XL | touches every data domain; LLM + determinism | 3e,3g,3h,3i,3k,5a |
| F15 | Recap story player | 8 cards, timed segments, tap/hold/close, music, per-card choreography, auto-first-play then summary | 3m-3..9 | L | bespoke motion ×8 + audio | F2, motion kit |
| F16 | Share image/video renderer | Critter card, recap cards, story 9:16, receipt, postcard, poster A3, memory w/ signatures | 3l-3, 3m-* | M | consistent renders on-device or server | F2 |
| F17 | Crew MVP vote | One-tap poll, gold edge for winner on all recaps | 3m-5 | S | reuse 3g polls | 3g |
| F18 | Passport stamp + signatures | Stamp sequence, slam, signature on recap open (live), profile sync | 3m-8, 3n-1 | M | presence events + handwriting reveal | 3n-1 |
| F19 | Postcard composer (digital) | Photo + LLM note (editable) + 3 formats + send to crew | 3m-9 | M | editor + renders | F16 |
| F20 | Physical postcard mailing (Pass+) | Address collection per recipient, print vendor order, tracking, quota 1/trip | 3m-9 | L | PII, international fulfilment, entitlement | 4 paywall, vendor |
| F21 | Shared album | Upload (bg, offline queue), realtime stream, day/place grouping, tabs, viewer, download | 3m-2, 3k-4 | L | media pipeline + storage | storage/CDN |
| F22 | Album curation AI | Blur/dup/aesthetic scoring, faces→members, coverage-constrained picks, LLM note, "who's in" | 3m-2, 3o-4 | L | vision + biometric privacy | F21 |
| F23 | Conditional reminders | "Remind me in May only if crew is planning", window reminders, quiet-window reminders | 3l-5/9, 3m-7 | S | scheduler + condition eval | 5b budget |
| F24 | Anniversary memory | Pick highlight day, schedule quiet push, LLM text, reactions, reunion vote | 3m-10 | M | scheduler + realtime + vote seed | 3b vote |
| F25 | Make-it-my-guide skin | Per-user guide form override used in chat, LA, notifications, FAB | 3l-3 | S | propagate to surfaces | F2, 5a/5b |

---

## 4. Data model contributions

- **Place** (country-level set): id, name, rank (0 = Vietnam home set, 1–60), tier_group (0..3), set_size (10/5/3/1), is_home_set.
- **City** (locale): id, place_id, name (native script + ascii), timezone, bounds/polygon, has_live_guide, guide_id.
- **Critter** (#001–#150): id, number, city_id, name, species, palette[fill, spot, belly], art_params JSON (body, variant, ears, acc…, from critters-data.js), is_guide.
- **CritterForm**: id, critter_id, tier (common|rare|epic|legendary), display_name ("Temple Tokek"), habitat_tag ("WATER TEMPLES"), card_colour, art_overrides (fill/spot/accent/belly/pose/edge), field_note (i18n), requirement_text (i18n), xp_reward, tradable=false, rule_id.
- **SpawnRule**: id, form_id, kind (city_presence | poi_dwell | poi_any_of | poi_set_count | time_window_relative (sunrise/sunset ±) | calendar_window | crew_copresence | quest_reward), geofences[] {lat,lng,radius_m (default 50)}, dwell_s, hold_ms (1500 / 2400), time constraints, min_members, crowd_sensitivity.
- **LegendaryWindow**: form_id, year, start_local, end_local, tz, source (fixed | forecast | manual), status (announced/provisional), note.
- **Egg**: id, user_id, trip_id, critter_id, granted_at (boarding), hatched_at, trigger (flight_landed | geofence_arrival | manual).
- **EncounterSession**: id, user_id, trip_id, spawn_rule_id, form_id, poi_id, started_at, ended_at, dwell_accum_s, drain events, best_accuracy_m, outcome (befriended | wandered_off | expired | rejected), offline bool, integrity {attestation token, mock_location flags, sample hash}, samples (short retention).
- **Sighting**: user_id/crew_id, form_id, seen_at, poi_id (supports "seen twice, befriended by nobody").
- **CollectionEntry**: user_id, form_id, found_at, poi_id, trip_id, encounter_id, source (hatch|encounter|quest), verification (pending|verified|revoked). Unique (user_id, form_id).
- **GuideSkin**: user_id, guide_id/city_id, form_id.
- **Sticker / UserSticker**: id, kind (settled_tokek, crew_level_n…), art; user_id|crew_id, granted_at, source.
- **Quest**: id, crew_id, trip_id, local_date, template_id, params JSON, title, description, metric, target, deadline_local, reward {xp | form_id | sticker_id}, status (active|completed|expired|invalidated), llm_run_id; **QuestSignup** (quest_id, user_id); **QuestProgress** (quest_id, value, contributors, evidence refs).
- **XpLedger**: crew_id, user_id?, amount, source_type/source_id, created_at; **CrewLevel** derived (1000 XP step?) + unlocks.
- **Reminder**: user_id, kind (quiet_window | legendary_window | got_away | custom), fire_at (UTC + local), condition JSON (e.g. crew_planning_active), target ref, state.
- **Recap**: trip_id, status (pending|generating|ready|failed|stale), version, generated_at, stats JSON, route {stops[], legs[{from,to,km,duration,driver}]}, receipt JSON {categories, totals, planned, each, priciest, cheapest_day, settled_days, currency}, got_away {form_id, sightings, narrative}, awards[{user_id, key, title, line, metric_evidence}], cards[8] copy, music_theme, llm_run_ids.
- **RecapView**: recap_id, user_id, first_opened_at, story_completed_at → drives signatures, rating-prompt eligibility.
- **Stamp**: user_id, seq_no, city_id, trip_id, date_range, colour, status (dashed_upcoming | stamped), signatures[{user_id, text, colour, signed_at}].
- **MvpPoll**: reuse Poll(crew_id, context=recap, options=member ids, result).
- **Postcard**: id, trip_id, author_id, photo_id, note, format (postcard_6x4 | story_9x16 | poster_a3), rendered asset keys, sent_to_crew_at. **PostcardMailing**: postcard_id, recipient_user_id, address_ref, vendor, vendor_order_id, status (awaiting_address|queued|printed|mailed|returned|failed), cost, entitlement_ref. **MailingAddress**: owner user_id, encrypted fields, consent_at.
- **Photo**: id, trip_id, uploader_id, storage keys (orig, display, thumb), taken_at, exif_gps (private), day_index, plan_item_id/poi_id, hashes (sha, perceptual), quality {blur, exposure, aesthetic}, is_pick, pick_rank, faces[{box, person_ref}], visibility, deleted_at.
- **PersonTag / FaceCluster**: trip_id, cluster_id, user_id (after confirm), consent flag; prefer on-device only.
- **Memory**: id, crew_id, trip_id, anchor_date, photo_id, text, scheduled_for, sent_at; **MemoryReaction**: memory_id, user_id, kind (heart|text|plus_one), text.
- **LocationTrail** (optional for route/km): trip_id, user_id, simplified polyline per day, retention policy.

Relationships: Place 1–n City 1–1 Critter 1–4 CritterForm 1–n SpawnRule; User n–n CritterForm via CollectionEntry; Crew 1–n Trip 1–n Quest/Recap/Photo/Memory; Recap 1–n Award/RecapView; User 1–n Stamp.

Privacy notes: precise location only during trips (3a-9 "Off when you're home"), minimise EncounterSession samples (keep aggregates, drop raw after verify); crew visibility of collection ("ALSO HAS IT", "Maya has 14") = crew-scoped only; face data = biometric (GDPR Art. 9, BIPA/CUBI/Texas) → on-device, explicit opt-in, per-person exclusion; postal addresses encrypted, never visible to sender/crew; awards reveal behavioural data (lateness, sleep) → per-user opt-out of being roasted; EXIF GPS stripped on any public share (3o-4); account deletion (3n-9): critters/stamps/uploads go → signatures and awards become "former member", album photos removed from crew album (confirm with product).

---

## 5. Backend / API needs

**Endpoints (REST-ish, names indicative)**
- `GET /catalog?v=` — critters, forms, rules, windows, geofences; versioned, CDN, bundled per-trip for offline.
- `GET /trips/:id/spawns` — spawns for trip cities (download on trip start for offline + geofence rotation).
- `GET /me/critterdex?filter=all|found|near&lat&lng` · `GET /crews/:id/collection-summary` (peer counts, holders per form).
- `GET /forms/:id` (detail + crew holders) · `PUT /me/guide-skins/:guideId`.
- `POST /encounters` (start, idempotency key) · `POST /encounters/:id/samples` (batched, signed) · `POST /encounters/:id/befriend` (evidence bundle + attestation) → returns CollectionEntry (pending→verified) · offline replay supported.
- `GET /pois/:id/crowd-forecast?date=` (reuse 3d) → best window.
- `POST /reminders` · `DELETE /reminders/:id` · `PUT /me/reminders/legendary-windows` (toggle).
- `GET /trips/:id/quests` · `POST /quests/:id/signup` · `GET /crews/:id/xp`.
- `GET /trips/:id/recap` · `POST /recaps/:id/views` (open/complete → signature) · `POST /recaps/:id/mvp-votes` · `GET /recaps/:id/assets?card=&format=` (share renders).
- `POST /trips/:id/postcards` · `PATCH /postcards/:id` (note/photo/format) · `POST /postcards/:id/send` · `POST /postcards/:id/mail` (entitlement check Pass+, quota) · `PUT /me/mailing-address` · `GET /postcards/:id/mailings` · vendor webhook `POST /webhooks/print-vendor`.
- `POST /trips/:id/photos:presign` · `POST /trips/:id/photos` (finalize) · `GET /trips/:id/photos?view=best|all|person&cursor` · `DELETE /photos/:id` · `GET /trips/:id/album.zip` (async export).
- `GET /memories/:id` · `POST /memories/:id/reactions` · `POST /memories/:id/reunion` (creates vote with destination pre-pitched).

**Background jobs**
- Arrival/hatch: flight-status webhook (landed) + device arrival event → hatch + push per member.
- Spawn scheduler: per-city spawn activation incl. time windows (sunrise/after-dark computed per POI/date), crowd-aware.
- Legendary window ingestion: yearly ops + bloom-forecast update; reschedule dependent reminders.
- Daily quest generation per active trip at local ~04:00–05:00 (before 3k morning briefing), LLM → validator → publish; nightly expiry.
- Quest evaluator: event-driven consumer (expense created/settled, visit detected, phrase learned, co-presence) → progress, completion, reward grant fan-out.
- Encounter verifier: plausibility (speed, travel continuity vs flights, attestation, mock flags, clock skew) → verify/revoke.
- Recap generator: trigger at trip end (last day local midnight or return-flight landing, per open question) → aggregate → LLM copy (structured) → pre-render share assets → push "recap ready"; re-run on late data (debounced) with versioning.
- Photo pipeline: thumbnails, hashing/dedupe, quality scoring, (server faces only if opted-in), picks + note regeneration, album zip export.
- Reminder scheduler: fires with conditions (crew_planning_active), respects ping budget/quiet hours → may divert to 20:00 roundup (5b).
- Anniversary scheduler: daily scan for memories anchor_date = today (per member tz), quiet push.
- Postcard fulfilment: address collection nudges, vendor order, status sync, failure handling, quota ledger.
- Retention/purge: raw location samples, face data, deleted accounts.

**Realtime channels**
- `crew:{id}:collection` (befriend, sightings, first-spotter), `trip:{id}:quests` (progress/complete/reward), `trip:{id}:album` (photo added/picked), `recap:{id}` (views→signatures, MVP votes/result), `memory:{id}` (reactions), `trip:{id}:copresence` (summit check-ins for crew legendary; can piggyback on 3g crew map presence).

**3rd-party data**
- Flight status (landing events) — shared with 3h/5a.
- POI database + geofence authoring (places, temples, parks) — shared with 3d/3e.
- Crowd / popular-times forecast per POI per hour — shared with 3d.
- Sunrise/sunset: compute locally (NOAA algorithm), no API.
- Cherry-blossom / seasonal forecasts (e.g. Japan bloom forecasts) or manual ops; festival dates (fixed).
- LLM provider (structured output) for quests, recap copy, postcard note, memory text, album note.
- Vision: on-device face/blur (Vision/ML Kit) ± cloud aesthetic model.
- Print-and-mail vendor with international postcard + A3 poster support and tracking webhooks.
- Push: APNs (incl. ActivityKit push tokens, interruption levels), FCM.
- Store entitlement verification for Pass+ (shared with 4).

---

## 6. Cross-slice dependencies & shared components

**Depends on**
- 3a-9 permissions (location on trips; add camera + photo-library contextual prompts); 3a onboarding stamps (stamp No.1 home) → stamp sequence.
- 3f-5 slide-to-board grants egg; 3f-7 dropouts still get photos + recap.
- 3h bookings/flight status (landing trigger, "flips to pickup on landing"), 3h getting-around rides (km, driver "Made").
- 3e plan (quest generation, epic hint "tomorrow", route stops, plan-edit counts).
- 3d crowd forecast (best chance window), POI data.
- 3i balances/settle (Zero Debt quest, Settled Tokek at same moment, receipt, "$0 OWED"), 3c budget (planned).
- 3j guide chat (SAY HI, phrase-learning quest source, guide voice/TTS for narration?).
- 3g crew chat/polls/presence/crew map (share befriend, MVP poll, postcard send, co-presence).
- 3k trip hub (QUESTS tile, ticker), 3k-4 offline outbox (photos, befriends), 5a-1 leave-by "I'M UP" (earliest riser metric).
- 3b home vote (WHERE NEXT, PLAN A REUNION pre-pitched destination).
- 3n profile stamps (dashed→filled), avatar forms (rare ring, gold legendary), earned critter app icons (TEMPLE, SARDI, HOME SET, PON, GOLDEN, BALI SIX), sound settings (music per guide, SFX, critter voices, quiet 22:00–07:00 + inside temples, haptics), delete account semantics.
- 3o-3 rate the trip (from recap), 3o-4 share plan ("3 OF 4 FORMS", Tokek-picked photos with faces blurred).
- 3p-6 App Store rating prompt placement on recap.
- 4 paywall (postcard mail), 4c-2 free-boost-ending surfaces on recap ("KEPT FOR GOOD: plan, photos, recap, critters").
- 5a-4 critter-nearby Live Activity, 5b notification system (guide-as-sender avatar, roundup batching, ping budget), 5c Critterdex widgets (tinted mono art).

**Shared components produced/consumed**
- StickerRenderer (doodle-art: kinds, poses, locked, sticker outline, tier edges, blink) + raster cache/atlas + mono/tinted variant.
- MotionKit: keyframe DSL + presets (bob/float/pulse/ping/spin/hop/grow/rise/wiggle/blink/tug), easing tokens, reduced-motion policy; Confetti emitter; Odometer counter; Typewriter; StampSlam; Shake/Pop; shared-element "fly to slot".
- HoldRing (also 3n-10 hold to delete).
- StoryPlayer (also candidate for 3f-2 proposal trailer "story-style").
- Share image renderer (also 3f proposal poster/postcard, 3o-4).
- Tab bar with guide FAB; guide skin resolver.
- Poll/vote (3g, 3b), Realtime presence/typing infra.
- Local/remote Reminder service honoring 5b budgets.
- Feedback kit: SFX bank (slap, thud, peel, printer buzz, chirp), haptic patterns, music themes per guide.

---

## 7. Implementation risks / hard parts

1. **50 m dwell with phone locked**: iOS region monitoring is coarse (reliable ≥~100 m, 20-region cap, enter/exit only, no dwell); needs active GPS inside region → requires Always authorization or a foreground-started background session (iOS 17+ background activity session + live location updates) + background mode "location"; App Review scrutiny. Android: background location is a separate "Allow all the time" grant; needs foreground service (type location) + persistent notification; OEM battery killers. 3a-9 only asks "location, on trips" — must design two-step (while-in-use → always) ask.
2. **Accuracy vs 50 m radius**: temples/urban canyons/indoors → 30–100 m error; jitter causes false wander-off. Need hysteresis (enter r, exit r+buffer), accuracy gating, slow drain (5a-4), grace period.
3. **Battery**: minutes of GPS + optional camera; encounter camera must only open for final HOLD step, not during dwell.
4. **Offline encounters at summits** (Batur has no signal, 3k-4): catalog/spawns/geofences prefetched; on-device rule evaluation; signed evidence queued; server may later revoke → awkward UX; device clock tampering (use monotonic + GPS time).
5. **Anti-spoof for non-purchasable legendaries**: mock-location flags (Android `isMock`, iOS `isSimulatedBySoftware`), App Attest / Play Integrity, travel plausibility (flight data, tz, speed), jailbreak/root heuristics; balance false positives.
6. **Crew co-presence legendary**: all N members' positions at summit within window, some offline/denied permission; define quorum and evidence merge; scales to boosted crews of 16.
7. **Live Activity constraints**: payload ≤4 KB, no network images (art must be bundled/App Group pre-rendered), update budgets for push-driven updates; Dynamic Island compact art; Android equivalent (progress-style live notification).
8. **Renderer port**: procedural Canvas2D brush strokes (seeded wobble, watercolour) → native at 60 fps across 150+ stickers on the pass; must pre-rasterise 600 forms × sizes × states (normal/locked/gold/tinted) for widgets, LA, notifications, share images, app icons.
9. **Content ops**: 600 form names/notes/requirements/rules, POI geofences per form, native-script names, yearly variable windows (sakura peak shifts ±2 weeks; puffling nights "late Aug"); "after dark"/"by sunrise" per-POI solar calc; festival dates in local tz.
10. **LLM quest generation must be verifiable**: constrain to template catalog with deterministic metrics (visit counting via POI category "warung" needs visit detection or expense categorisation; phrase learning needs 3j instrumentation); avoid unsafe/unachievable quests (closed venues, hazardous hikes); cost per crew per day; timezone-correct morning generation.
11. **Simultaneous reward "on everyone's phone at once"**: realtime fan-out + push for backgrounded, offline members get delayed; idempotent grants.
12. **Recap data completeness & timing**: late uploads/expenses, members ending trip on different days, currency normalisation (multi-currency expenses, viewer's home currency), km from ride tracking vs location trail vs plan legs; deterministic numbers must match Balances exactly.
13. **Awards tone/safety**: LLM roasts using behavioural data (lateness, sleeping, "9 of them good", injuries "knee and all") can hurt; needs guardrails, per-member opt-out, no health/sensitive inferences, review of generated copy.
14. **Face recognition legality**: biometric consent regimes (GDPR Art. 9, BIPA Illinois, Texas CUBI, Washington), EU minors; keep on-device, opt-in per member, easy removal; "everyone's in at least three" requires identity mapping.
15. **Photo storage cost**: ~300 photos × 3–5 MB per trip "kept forever" incl. free tier; need tiered storage, resized display copies, originals policy.
16. **Physical postcard economics & logistics**: Pass+ $29.99/yr vs 6+ international postcards per trip; address collection from non-Pass+ crew members (consent), returned mail, vendor country coverage, delivery SLA, fraud (fake trips to farm postcards) → quota ledger.
17. **Story player**: 8 bespoke choreographies + music + haptics; card timer (6 s) vs animation (route 9 s); pause/resume consistency of all timelines; exporting story 9:16 (static vs video) for social.
18. **Signatures live**: handwriting "write-on" with fonts needs path extraction (glyph outlines) or mask reveal; ordering/placement collision for up to 16 names.
19. **Notification pressure**: encounters, quest updates, reminders, anniversaries must respect 5b ping budget, quiet hours, "quiet on the road" temple mute (POI category geofence).
20. **Accessibility**: hold-to-befriend gesture alternatives (switch control / reduced dexterity), VoiceOver in camera scene, reduced motion for story player (still must convey content), colour-only tier encoding (add labels/shapes).
21. **Account deletion ripple**: removing a member's collection/uploads must not break crew recaps, awards, signatures, album (tombstones "former member").

---

## 8. Ambiguities & open product questions

1. Dwell vs hold: required dwell per form/tier (3l-6 "stayed 11 minutes"; 5a-4 "stay 4 more min")? Is HOLD disabled until dwell completes, or does hold substitute? Is the camera view mandatory or optional?
2. Wander-off: 5a-4 "ring drains slowly rather than resetting" vs 3l-5 "ENCOUNTER OVER". Grace duration, drain rate, when is it "over"?
3. Rare rule text "Three water temples" vs befriended at a single temple (Tirta Empul) — any-of-three or visit-all-three?
4. Golden Tokek: 3l-9 "ANY DAY · hardest thing" vs 3m-7 "comes back in the dry season, May to September". Seasonal or any day?
5. Crew legendary grant: does each co-present member get the legendary, or the crew? Quest reward "LEGENDARY CRITTER" = direct grant or unlocks an encounter? "Seen twice, befriended by nobody" implies a sighting state — define.
6. Do all 150 critters have rare/epic/legendary rules with their own POIs/windows, or only the 6 live guides at launch? 3l-9 lists only 6 legendaries.
7. "Critter #1 in the Bali set" — is a "set" per city (the 4 forms), per country (Indonesia 3), or home set only?
8. Egg scope: one egg per trip (guide city) or per city visited ("Every city has a critter to hatch")? Multi-city trips? Hatch for overland arrivals / no imported flight / location denied?
9. Common form for non-guide cities: auto-granted on arrival (hatch) or needs an encounter?
10. Locals who live in a city (location "off when home"): can a Hà Nội resident ever collect Cụ Rùa? Does collecting require an active trip?
11. XP: personal or crew? What does personal XP do (3l-6 "+150 XP")? Crew level persists across trips? Values per tier/quest?
12. Settled Tokek / crew stickers: counted in 9/150? Usable as avatar/app icon? Where displayed in pass?
13. Counts: 9/150 on pass vs "8 critters" on profile/delete — count locals or forms? "6 of 61 places" = countries touched?
14. Locked slots: caption says never reveal the critter, HTML shows each critter's true silhouette. Which?
15. Home set Vietnam: fixed global home set for everyone, or user's home country (Winston is Singapore)?
16. Crew visibility & comparison: "Maya has 14" — only crew, or friends/global leaderboard? Any opt-out?
17. "Make it my guide": changes guide appearance for this user only? All surfaces (chat, LA, notifications, FAB, recap)? Any non-guide critter allowed?
18. Crew quests: sign-up/opt-in UX (pips = signed-up members)? Quest detail screen? Can members decline? How many per day? What if crew >6 ("All six")?
19. Recap trigger: last trip day, return-flight landing, or when everyone's home? One shared recap per crew with personal overrides, or personal recaps?
20. Story card #2 of 8 is undesigned (cover=1, route=3, awards=4, receipt=5, got-away=6, stamp=7, postcard=8). What is it (photos? critters found?).
21. Narration: text only or TTS voice of the guide? Music licensing/source for themes (gamelan lo-fi, koto…).
22. Story auto-advance (6 s bars) vs tap-to-advance (prototype); route animation 9 s exceeds card timer.
23. Signatures: auto-generated from display name in handwriting font, user-typed, or drawn? Who writes "Dev (late)" / "Maya ✶"? Do non-openers get a slot?
24. Stamp colour: yellow on arrival (3n-1) vs orange in recap (3m-8). Stamp created on arrival (dashed→filled) or at recap?
25. Receipt: display currency (viewer home currency vs trip currency)? "Swipe up for your own split" design? Unsettled/over-budget variants?
26. MVP vote: star icons vote per card? Voting window, ties, dropouts voting, anonymity?
27. Postcard: one per crew or each member writes their own? Who picks the photo? "One printed postcard per trip mailed to everyone" — per Pass+ holder or per trip? Address collection flow for non-Pass+ recipients; supported countries; is POSTER a paid print product?
28. "Remind me in May only if the crew is planning" — define "planning" (open vote, draft trip, any crew activity)? Which crew if user has several?
29. Anniversary: anchor = trip start, highlight day (Oct 15 = Day 4), or each notable day? Per trip once? Dropouts/former members included? Reaction composer design?
30. PLAN A REUNION: new vote in same crew only? Destination pre-pitched = same place; guide pitch generated?
31. Album: BY PERSON = uploader or faces? Video support? Who can delete others' photos? Download/export ("I'll send the album")? Storage caps on free tier?
32. Crowd forecast source & granularity for small POIs (temple pools)? Fallback when missing?
33. Encounter notifications: frequency caps, spawn density per city, do spawns exist outside plan items?
34. Tradability: "can't be bought or traded" — is any form tradable/giftable (e.g., commons)?
35. Critter share card ↗: save to Photos vs system share sheet? Branding/watermark?
36. Kids/teens: age gating for location + face features (not addressed).
