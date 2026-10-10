# Foundations spec: the baseline every screen follows

Source: `CritterPass 01 Foundations.dc.html` (1.A–1.E, phones 1.01–1.13), `Tabs.dc.html`, `Phone.dc.html`. Values are the design's inline styles (pt = px at 390 wide). This file feeds the tokens, kit, motion and shell phases; journey specs reference its names.

## 1. Screen grammar (1.A)

| Type | Used for | Header | Rules |
|---|---|---|---|
| Root, large title | Home, Trips, Wallet, Pass | Title 32/700 −0.03em at x 24, y 64; ≤ 2 glass actions right, `+` is the ink one | Tab bar shows, no back. Title collapses into the bar on scroll |
| Push, inline title | Details, settings, lists | Glass circle back (44) left, centred title 19/700 + 12/400 muted subtitle, one right action (share, ⋯, Edit, or a labelled glass pill such as "Map") | Edge swipe back. Tab bar hides |
| Sheet, grabber | Forms, pickers, compose | Cancel left, bold verb right (Post, Save, Add) | Swipe down cancels; with edits it asks first. Half height for one choice, full for a form. Regular glass, radius 46 |
| Full screen, ✕ | Camera, boarding pass, show mode, celebration | ✕ top-left on glass | One job. Never a second cover on top. Brightens for passes and phrase cards |
| Alert, two choices | Destructive or blocking | Question = title, result = line | Destructive in pink, Cancel always. Irreversible → hold to confirm |

Experience rules: every error offers retry + another route + a way back; offline never blocks reading (saved trips, passes, phrases open; changes wait in a visible queue); nothing typed is lost (failed sends keep text, dirty sheets ask, drafts return); roles shape the screen (members read-only with Nudge, organiser gets controls, solo skips the vote). Every screen lists its ways out; nothing dead-ends.

## 2. Colour

### Light
| Token | Value | Use |
|---|---|---|
| `ink` | `#1c1d24` | Text, primary pill base, selected chips, progress fill |
| `ink.pressed` | `#2a2b33` | Primary pressed fill |
| `ink.secondary` | `#3d404c` | Inactive tab icons, unselected segment labels, glass subtitle |
| `muted` | `#6e7180` | Secondary text, section labels, timestamps |
| `placeholder` | `#9a9daa` | Field placeholder, disabled label |
| `ground` | `#f5f5f7` | Screen background |
| `card` | `#ffffff` | Cards, rows, fields, secondary buttons |
| `control` | `#f1f1f4` | Chips, stepper, light pills, skeleton blocks |
| `control.disabled` | `#e9eaee` | Disabled button fill |
| `hairline` | `rgba(28,29,36,.08)` (`.1` in menus) | Row separators (0.5) |
| `field.border` | `#e3e4e9` (inset 1.5) | Default field, inactive stepper line |
| `outline.empty` | `#c4c6ce` | Checkbox off, empty-slot dashed border |
| `segment.track` | `rgba(118,118,128,.12)` | Segmented control track |
| `toggle.on` / `toggle.off` | `#34c77b` / `rgba(120,120,128,.16)` | Switch (system green, not mint) |
| `caret` | `#4f86ff` | Text cursor |
| `on.accent` | `#17142a` | Text on accent fills (avatars, tags, day badges) |

Accents (crew colours and stickers; each person keeps one colour everywhere): sun `#ffd84a`, pink `#ff5fa8`, sky `#4f86ff`, mint `#54d6a4`, tangerine `#ff9a4d`, paper `#fffdf6`, neutral member `#f4efe4`.

Status tints (bg / text): booked `#e3f6ec / #1f7a55`, vote open `#ffe4f0 / #b0306b`, rain `#e6eeff / #2f5fc4`, maybe `#fff3c4 / #8a6a0c`, unopened `#f1f1f4 / #6e7180`. Banner text runs one step darker: guide note `#fff6c9 / #3d3210`, info `#e6eeff / #1d3c80`, success `#e3f6ec / #174a35`, error toast `#ffe4f0 / #7a1f48`. Destructive: button `#ffe4f0 / #b0306b`, list action `#d6337f`, field error ring `#ff5fa8` with helper `#b0306b`.

Stamps: ink pink `#e0468e` (text `#d6337f`), green `#2e9a74`, orange `#e07a2a` (text `#c45f16`). Critter tier labels: Common muted ●, Rare `#2f5fc4` ◆, Epic `#b0306b` ★, Locked `#8a6a0c` ✦ (fill `#efe2b4`, "?" `#a8800f`).

### Dark (1.E: follows the phone, or set in Edit profile 9.02)
| Light → dark | |
|---|---|
| ground `#f5f5f7` → `#0e0f13` | |
| card `#ffffff` → `#1c1d24` | lifted with a hairline, no shadow |
| control `#f1f1f4` → `#2a2b33` | chips, secondary buttons, tiles (`#24252d` for sheet tiles) |
| ink `#1c1d24` → `#f2f2f5` | the primary pill flips to light with ink text |
| muted `#6e7180` → `#9a9daa` | kept ≥ 4.5:1 |
| Tokek tint `#fff3c4/#fff6c9` → `#2f2914` | text goes cream, never yellow on yellow |
| success tint `#e3f6ec` → `#16332a` | text `#5fd6a2` |
| pink tint `#ffe4f0` → `#3b1a2b` | text `#ff8ac0` |
| Never change | crew colours, day colours, critters and their white sticker edge |
| Stay light | boarding cards, QR codes, phrase cards (scanners and strangers read them) |
| Glass | dark glass at 72% with a 7% top highlight, same blur |
| Map | night palette: dark land, blue-black sea, slate roads; lifted stop shadow deepens instead of growing |
| Photos | full brightness, darker fade under the header |

## 3. Type (SF Pro system; Borel for the guide's voice)

| Token | Spec | Seen as |
|---|---|---|
| `hero` | 66/800 −0.05em | Destination name on heroes |
| `display` | 34/700 −0.03em | Big moments ("Your pass is ready") |
| `largeTitle` | 32/700 −0.03em | Root screen titles (Inbox, Wallet) |
| `title` | 22/700 −0.02em | Section and card titles |
| `emptyTitle` | 26/700 −0.025em | Empty state headline |
| `navTitle` | 19/700 (+ 12/400 muted subtitle) | Push header title |
| `button` | 17/600 −0.01em | 56-high buttons |
| `headline` | 16/600 | Row emphasis, field text 16/500 |
| `body` | 15/400 (row title 15/600) | Body, row titles |
| `rowText` | 14–13.5/400–600 | Compact rows, toasts 14.5/600 |
| `label` | 13/600 muted | Section labels ("Earlier"), segments 13/600 |
| `caption` | 12.5/500 (12/400 muted) | Row subtitles, timestamps, helper text |
| `badge` | 11.5/600 | Status tag text (24 high) |
| `guide` | Borel 15/400 | Tokek's voice, never for UI chrome |
| `mono` | 12/500 +0.12em | MRZ and codes |
| `stat` | 26/800 −0.035em | Stat tiles, amounts |

## 4. Shape, space, elevation

Radii: phone 56 · sheet 46 · hero/trip card 34 · empty disc 90 · large card 26 · card 22–24 · banner 20 · field 18 · stat tile 18–20 · day badge 12 · tag 10–12 · button 28 (h 56) · pill 20 (h 40) · small pill 17 (h 34) · toast 29 (h 58) · icon button 20 (40) / glass nav 22 (44) · segmented 20 outer / 16 inner.

Space: screen gutter 20 (titles 24); row padding 10–11 vertical, 14 horizontal, 10 leading when a badge leads; gaps 8 / 10 / 12 / 14 / 16; status bar 54; header controls at y 60; large title y 64; first control under a large title y 118; tab bar bottom 26, item height 46, bar padding 6; content clears the tab bar by 110; toasts stack above the tab bar with 14 gaps; offline pill pinned at y 56, inset 12, h 40.

Elevation (light; dark uses hairlines instead):
| Token | Shadow |
|---|---|
| `card` | `0 0 0 .5px rgba(20,22,40,.05), 0 1px 2px rgba(20,22,40,.04), 0 14px 34px -12px rgba(20,22,40,.16)` |
| `raised` (secondary button, white icon button) | `0 1px 2px rgba(20,22,40,.06), 0 4px 14px rgba(20,22,40,.1)` |
| `float` (floating small pill) | `0 0 0 .5px rgba(20,22,40,.06), 0 1px 2px rgba(20,22,40,.04), 0 8px 20px -6px rgba(20,22,40,.14)` |
| `toast` | `0 2px 4px rgba(20,22,40,.06), 0 14px 30px rgba(20,22,40,.14)`; ink toast `0 14px 30px rgba(28,29,36,.3)` |
| `sticker` | 2.5 white border + `0 4px 10px rgba(20,22,40,.18)` |
| `ink` (primary pill) | `inset 0 1px 0 rgba(255,255,255,.18), inset 0 0 0 .5px rgba(255,255,255,.07), 0 1px 2px rgba(20,22,40,.25), 0 16px 32px -10px rgba(20,22,40,.5)` |
| `segment.thumb` | `0 0 0 .5px rgba(20,22,40,.04), 0 3px 8px rgba(20,22,40,.12)` |

## 5. Materials

| Material | Where | Look (fallback values; native glass supplies blur and refraction where the OS has it) |
|---|---|---|
| Clear glass | Over photos and maps: hero buttons, the panel on a trip card | tint `rgba(18,20,28,.30)`, blur 24 sat 1.6, inset top 1px white 24%, .5 white 14% ring, `0 20 40 −16 rgba(0,0,0,.45)`; white 600+ ink |
| Regular glass | Over app content: tab bar, nav buttons, sheets, banners, search | `rgba(255,255,255,.56)` (nav buttons `.62`, blur 18 sat 1.8), blur 24 sat 1.9, top 1px white `.95`, bottom 1px white `.35–.4`, .5 white ring `.6`, .5 ink ring `.07–.08`, `0 22 44 −14 rgba(20,22,40,.32)` (buttons `0 8 20 −6 .16`) |
| Sheet glass | Sheets | `rgba(248,248,250,.86)`, blur 34 sat 1.8, radius 46, inset 8 from the screen edge when it morphs from a button |
| Ink | The one dark pill per screen | gradient `#30313b → #16171d`, `ink` shadow |
| Dark glass | Dark mode | 72% dark tint, 7% top highlight |

## 6. Components (1.B)

Buttons: primary ink pill h 56 r 28, 17/600, white; pressed fill `#2a2b33` + scale .97; secondary white + `raised`; disabled `#e9eaee` with `#9a9daa`; loading keeps the ink pill with a 16 spinner (2.5 ring, white top) and the progressive verb ("Booking…"); destructive pink tint. Small: ink pill h 40 px 16 14/600 ("Approve"); control pill h 40 ("Keep 19:30"); floating white pill h 34 px 13 13/600 + `float` ("Nudge"); text button 15/600 muted. Icon buttons 40 (white `raised`, ink, disabled `rgba(28,29,36,.35)`), 44 hit; header glass circles 44.

Controls: segmented h 40, track padding 3, thumb white r 16 + `segment.thumb`, labels 13/600 (`ink.secondary` off); toggle 52×32 r 16, knob 28 with `0 2 6 rgba(0,0,0,.18)`; stepper h 40 control fill, − / + 44 wide 20/500, value 16/700; checkbox 22 (on ink + white check, off 2 `#c4c6ce`); field h 52 r 18 px 16, 16/500 text, default inset 1.5 `#e3e4e9` + placeholder `#9a9daa`, focused 2 ink ring + blue caret, error 2 pink ring + 12/600 `#b0306b` helper 4 below, indented 6; progress label row 12/600, bar h 8 r 4 track control, fill ink.

Stickers, tags, stamps: place tag 14/800 `#17142a` on an accent, padding 7×12, r 10, 2.5 white border, `sticker` shadow, rotated −5…+4°; empty slot 2 dashed `#c4c6ce`; round stamps (double ring via inset shadows 3 / gap / 1, text 8/800 +0.14em and 18–20/800, rotated −12…+8°); rectangular stamp ("BOOSTED") 22/800 with ring on white; critter tiers as doodle-art 78 with tier label 11/700.

Cards and rows: list card r 22 white `card`, rows separated by 0.5 hairline; leading day badge 42×44 r 12 accent (17/800 day, 9.5/700 weekday); row title 15/600 + 12.5 muted subtitle; trailing status tag h 24 px 9 r 12 11.5/600; person row with 32 avatar (13/700 `#17142a` initial on the crew colour) + 14 text + 12 muted time; guide note r 20 Tokek tint, 38 critter, 13/1.35 text, ink action pill h 32 12.5/600; photo card (white 5 frame r 18, image r 13, rotated −3°, `0 2 4 .08, 0 12 24 .14`); stat tile r 20 `card`, 12/600 label, 26/800 value, corner sticker rotated 8°; crew stack 32 avatars with 2.5 ground-colour border overlapping −10.

Navigation: tab bar (see §8); centred glass title pill (44 high, 15/600 + 11 subtitle) between a glass back circle and a glass two-icon group, used over photos; "2 of 4" progress (4 segments h 5 r 3, ink done, `#dcdde3` todo, 13/600 muted count) in a white r 20 h 56 bar; wizard stepper (22 dots: mint done, ink current, control todo; 2 lines ink / `#e3e4e9`); composer white r 28 h 56: 40 control `+`, 15 placeholder, 44 ink send.

States (1.C): empty = large title + segmented filter, 180 white disc (`0 2 4 .05, 0 20 44 .1`) with a 140 sleeping critter and a tilted check sticker, 26/700 headline, 14/1.45 muted line, then "Earlier" history at .85 opacity; loading = the real layout as skeletons (hero r 26 with a 100° shimmer `#e9eaee → #f5f5f7`, row skeleton bars `#ececf0` / `#f3f3f6`), a bobbing thinking critter + "Tokek is fetching the plan…" 13/600 muted near the bottom; toasts above the tab bar (ink toast with mint check + glass Undo; white toast with critter + control Undo; error toast pink tint with "!" disc; person toast with 40 avatar and two lines); inline banners r 20 padding 12×14 with a 30 doodle and a bold 13/700 action word; offline = ink pill at the top with a tangerine dot ("Offline · changes send when you're back").

## 7. Motion (1.D): three springs, nothing else animates

| Spring | Response / damping | Use |
|---|---|---|
| Snappy | .30 / .86 | Tabs, toggles, chips, the tab lens; done before the finger lifts |
| Smooth | .45 / 1.0 | Sheets, zooms, the page stepping back; no overshoot |
| Lively | .50 / .68 | Stamps, stickers, the island, confetti moments; one wobble, then still |

Reduce Motion: every move becomes a 150 ms cross-fade; stamps still land without falling.

Signature motions (keyframes from the design; prototype loops are slowed for viewing, real timing comes from the springs):
- **1.04 Tab lens**: the selection lens (67×56) slides tab to tab and stretches mid-flight (`scale(1.3, .9)`, `1.5, .9` on long jumps), Snappy. Scrolling down: content moves up, the four-tab bar fades and scales to .6 from its left edge while a 56 circle holding the active tab's icon scales in from .6; Tokek's circle stays at the right. Scrolling back reverses it.
- **1.05 Zoom**: the trip card (inset 164/16/368/16, r 34) expands to the full screen (r 56): the card's photo moves up 120 and scales 1.04, the card's text panel fades in the first third, hub content rises 24 → 0 and fades in after the frame settles; Smooth. Back reverses into the card.
- **1.06 Morph**: the ink `+` (60, r 30, at right 24, bottom 40) rotates 45° and scales 1.2 as it fades; a sheet-glass shape grows from the button's rect to inset 330/8/8/8 r 46; the page behind scales .92, moves down 14, dims to brightness .8 and rounds to r 40; sheet content rises 16 → 0 after the shape lands; Smooth. Dismiss collapses back into the `+`.
- **1.07 Stamp**: stamp falls from `translateY(−120) scale(2.2) rotate(−30°)`, hits at `scale(.9, .84) rotate(−12°)`, settles to 1 (Lively); at impact the page jolts (3 down, 2 up, ±.4° rotation), an ink ripple ring 220 grows .6 → 1.7 and fades, 44 confetti pieces burst from the centre, then a result card rises 40 → 0 from the bottom (Lively).
- **1.08 Island**: the Dynamic Island pill (200×37 r 19, glyph + "4 min") grows to the expanded card (370×184 r 48), compact content fades out first, expanded content fades and scales in .9 → 1 (Lively); collapses back. Native Live Activity on device.
- **1.09 Swipe vote**: the top card nudges right 40 and tilts 4° (pivot 50% 120%), the "I'M IN" stamp lands on it (scale 1.4 → 1, −16°, Lively), the card flies off (translateX 460, Y 40, rotate 20°), the next card grows from `scale(.93) translateY(18)` to rest (Lively).

## 8. Tab bar (two renderings in the design; founder decision pending)

- `Tabs.dc.html`, on most phones: regular-glass pill centred at bottom 26, padding 6, gap 2; items h 46 (min 46); the active item is an ink pill (padding 0 16 0 13, label 14/600, `inset 0 1px 0 rgba(255,255,255,.18), 0 6px 14px -4px rgba(20,22,40,.4)`), inactive items icon-only `#3d404c`; Tokek raised in the middle: 56 circle, margin-top −14, radial gradient `#fff3b8 → #ffd84a → #f2b92e`, 3 white border, inner shadow, warm drop shadow, 46 critter.
- Phone 1.04: the native iOS 26 tab bar: a 276×64 glass bar with four labelled tabs and a sliding lens, Tokek as a separate 56 circle on the right, minimising to the active icon on scroll.

Icons: custom 24-grid line icons, stroke 1.9, round joins (Home, Trips ticket, Wallet card, Pass booklet).
