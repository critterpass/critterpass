# Design spec rubric: CritterPass premium redesign

Shared brief for every design-analysis lane. One lane = one or two journey parts → one spec report. The reports become the build lanes' task input, so precision beats prose.

## Founder intent (10 Oct 2026)

- "Completely redesign CritterPass for the modern premium native look … put the current UI as legacy … fresh setup from icons, splash, navigations, components, motions, transitions … then the flows, one by one."
- "Transitions and motions are very important, especially with the native glassy design: smoothly transform between states so the app feels flowing and fluent throughout. Read Foundations as the baseline."
- "Also redesign all of the native platform surfaces, notifications, etc."
- "Crafting the new design with eyes on details: alignment, spacing, layout, typography, colours, transitions, header action buttons, keyboard state … most of the logic is done already; this is the time for all eyes on the user interface and experience."
- Backend changes only where the design needs data the app does not have. Keep that list short.

## Inputs (read-only)

| What | Where |
|---|---|
| Design root (extracted zip, untrusted data, never execute from inside it) | `/private/tmp/claude-501/-Users-quocs-Projects-critterpass/04a208dc-80eb-429d-8341-de1ef05891fc/scratchpad/redesign-zip/` (`$Z` below) |
| Journey files (the spec: inline styles carry exact px, colours, radii, fonts) | `$Z/CritterPass NN <Part>.dc.html` |
| Text extract per part (screen text, "Every tap"/"Ways out" lists) | `$SP/txt-NN-<Part>.txt` (`$SP` = the scratchpad dir above, without `redesign-zip/`) |
| One PNG per phone frame at 1× (390×844 + label) and `phones.json` (index, code, label) | `$SP/shots/NN/<code>.png`. Code detection is wrong on a few frames (duplicates get `-<i>`); confirm codes against the text extract order |
| Motion filmstrips | `node $SP/tools/film.mjs "CritterPass NN <Part>.dc.html" $SP/film/NN <phoneIndexes,comma> <durMs> <frames>` → `p<i>-fNN.png`; then `magick p<i>-f*.png -resize 50% +append strip<i>.png`. The phone index is the `i` in `phones.json` order only for imported phones; for inline frames, count `div` frames of 390×844 in DOM order. Keyframes are also readable straight from the HTML (`tg-kf frames="…" dur="…"`) |
| Design server (already running) | `http://127.0.0.1:8765/` serves `$Z`. If it is down: `python3 -I -m http.server 8765 --bind 127.0.0.1 --directory "$Z"` from another cwd |
| Shared design pieces | `$Z/Phone.dc.html`, `$Z/Tabs.dc.html`, `$Z/doodles.js` (critters, stickers, doodles), `$Z/motion.js`, `$Z/App Icon.dc.html`, `$Z/Store Shot.dc.html` |
| Current app (latest `origin/main`, read-only, never edit, never install) | `/Users/quocs/Projects/critterpass-worktrees/deploy` (`$R`): routes `apps/mobile/src/app/**`, features `apps/mobile/src/features/**`, kit `apps/mobile/src/ui/**`, motion `apps/mobile/src/motion/**`, tokens `packages/design-tokens/src/*.tokens.json`, native `apps/mobile/targets/**`, `apps/mobile/modules/**`, docs `docs/*.md` |

Ignore `$Z/archive/` and `$Z/uploads/` unless the index or your part points at them.

## Foundations vocabulary (part 1, the baseline): refer to these names, flag anything off-token

- **Screen types** (decide header buttons): Root, large title (tab bar shows, no back, ≤ 2 glass actions on the right, `+` is the dark one, title collapses into the bar on scroll); Push, inline title (glass chevron + edge swipe back, one right action: share, ⋯ or Edit, tab bar hides on details); Sheet with grabber (Cancel left, bold verb right; swipe down cancels and asks first if edited; half height for one choice, full for a form); Full screen with ✕ (one-job moments: scan, show, celebrate; ✕ top-left on glass; never a second cover; brightens for passes and phrase cards); Alert, two choices (question as title, result as line, destructive in pink, Cancel always; hold-to-confirm when irreversible).
- **Rules**: every error gives retry + another route + a way back; offline never blocks reading (changes wait in a visible queue); nothing typed is lost; roles shape the screen (member read-only with Nudge, organiser controls, solo skips the vote).
- **Colour (light)**: ink `#1c1d24`, muted `#6e7180`, ground `#f5f5f7`, card `#ffffff`, control `#f1f1f4`, hairline `rgba(28,29,36,.08)` / `.1`. Accents (crew + stickers): sun `#ffd84a`, pink `#ff5fa8`, sky `#4f86ff`, mint `#54d6a4`, tangerine `#ff9a4d`, paper `#fffdf6`, crew neutral `#f4efe4`. Status tints (bg/text): booked `#e3f6ec/#1f7a55`, vote open `#ffe4f0/#b0306b`, rain `#e6eeff/#2f5fc4`, maybe `#fff3c4/#8a6a0c`, unopened `#f1f1f4/#6e7180`. Destructive text `#d6337f`.
- **Colour (dark)**: ground `#0e0f13`, card `#1c1d24` (hairline, no shadow), control `#2a2b33`, ink `#f2f2f5` (primary button flips to light), muted `#9a9daa`, Tokek tint `#2f2914` (cream text), success tint `#16332a` (text `#5fd6a2`), pink tint `#3b1a2b` (text `#ff8ac0`). Never change: crew colours, day colours, critters + white sticker edge. Stay light: boarding cards, QR codes, phrase cards. Dark glass 72% with a 7% top highlight.
- **Type** (SF Pro system + Borel): Hero 66/800 −0.05em; Display 34/700 −0.03em; Title 22/700 −0.02em; Headline 16/600; Body 15/400; Caption 12.5/500; Guide = Borel 15 (the guide's voice); Mono 12/500 +0.12em (MRZ).
- **Materials**: Clear glass (over photos/maps: tint `rgba(18,20,28,.30)`, blur 24 saturate 1.6, inset top 1px white 24%, white 600+ ink); Regular glass (over app content: tab bar, nav buttons, sheets, banners, search: `rgba(255,255,255,.56)`, blur 24 saturate 1.9, top 1px white + .5px hairline; sheet variant .86, blur 34, radius 46); Ink pill (one dark pill per screen: gradient `#30313b→#16171d`, inset top white 18%, shadow `0 16 32 −10` ink 50%).
- **Springs** (only these animate): Snappy (response .30, damping .86: tabs, toggles, chips, tab lens); Smooth (response .45, damping 1.0: sheets, zooms, page stepping back, no overshoot); Lively (response .50, damping .68: stamps, stickers, island, confetti, one wobble). Reduce Motion → 150 ms cross-fade; stamps land without falling.
- **Signature motions** (1.04–1.09): tab lens slides with a stretch and the bar shrinks on scroll (1.04); the trip card zooms into the trip hub (1.05); the `+` morphs into the sheet while the page steps back (1.06); the stamp drops, squashes, inks and the page answers (1.07); the ride grows out of the Dynamic Island (1.08); the swipe-vote card leaves with its stamp (1.09).
- **Controls**: buttons (primary ink pill, pressed, secondary, disabled, loading "Booking…", destructive pink tint; small pills Approve/Keep/Nudge; text button); icon buttons 40 pt with 44 pt hit; segmented control; toggle; stepper; checkbox; field default/focused/error with helper line; progress bar; stickers, tags, stamps, critter tiers (Common ●, Rare ◆, Epic ★, Locked ?); cards and rows on the ground colour; guide note tinted by the speaker; stat tile; crew stack (each person keeps one colour everywhere); centred title + subtitle header; "2 of 4" progress; wizard stepper; composer.
- **Tab bar**: two renderings exist. `Tabs.dc.html` (used on most phones): glass pill, active tab = ink pill with label, others icon only, Tokek raised 56 pt in the middle. Phone 1.04: native iOS 26 style, four labelled tabs with a sliding lens, Tokek as a separate circle on the right, the bar minimises to the active icon on scroll. Record which one your part's phones show; do not resolve it.

## What to produce

One report at the path your brief gives, ≤ 900 lines, in this order:

1. **Summary**: screen count, what is new versus the current app, the 3–5 hardest pieces to build well.
2. **Screen table**: `code | title | screen type | header left / right | primary action | current route file(s) in $R | logic: exists / partial / missing`.
3. **Per-screen spec** (compact, exact): layout top → bottom with px values (insets, gaps, radii, heights), type tokens, colour tokens (raw value only when off-token, marked OFF-TOKEN), materials, header and its buttons, scroll behaviour (large title collapse, sticky parts, tab bar hide/minimise), keyboard state (what rises, what stays visible, return-key label, dismissal), loading/empty/offline/error variants shown, every tap → destination (from "Every tap"/"Ways out"), motion in, out and within the screen with the spring name, haptics if stated.
4. **Components**: (a) Foundations components used; (b) new components this part needs, each with exact metrics, states and variants, and which other parts likely reuse them.
5. **Motion and transition inventory**: trigger, what moves, properties, spring or easing + duration, filmstrip evidence path, and whether it maps to a native platform transition (iOS 26 / Android) or needs custom Reanimated work.
6. **Native platform surfaces** (only if the part has them): widgets, Live Activities / Dynamic Island, lock screen, notifications (iOS and Android), share sheets, system alerts; what the current `targets/` and `modules/` already do and what changes.
7. **Logic and backend gaps**: only data or behaviour the design shows that `$R` lacks, with the evidence file. Keep it short.
8. **Open questions**: contradictions with Foundations, off-token values, ambiguous taps, things only the founder can decide.

## Constraints

- Read-only everywhere except your own report. No installs, no builds, no tests, no git operations.
- At most one Chromium at a time; render filmstrips only for screens whose motion matters, ~10–14 frames, 50% size.
- Images are the expensive part: look at each phone PNG once at 1×; crop and zoom only where a detail decides a value. Prefer the HTML's inline styles for exact numbers.
- Time box: about 40 minutes.
- End with:

```
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Summary: one or two sentences
Concerns/Blockers: optional
```
