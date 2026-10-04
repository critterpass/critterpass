---
title: Every destination's guide is its own city's critter
status: in_progress
created: 2026-10-04
---
# City critter guides

Founder, 2026-10-04, after a fresh Đà Lạt trip: "also its picked Cha Va instead of the Horse critter"; 19:25 "yes each city own critter"; 19:35 "follow the original critter collection design name".

Today a guide is one of seven slugs repeated in about fifteen closed lists, and a trip takes its country's guide (`critter_sets.guide_slug`), so every Vietnamese city gets Chà Vá and an unknown slug silently becomes Tokek. The map of every place that assumes this is in [reports/scout-261004-1955-guide-hard-wiring-map-report.md](reports/scout-261004-1955-guide-hard-wiring-map-report.md).

## Decisions

1. **One guide per critter.** Every dex critter is the guide of its own city. A guide's name is the critter's designed name (`packages/critter-art/src/data/critters.ts`, generated from `design/critters-data.js`); no name is invented. Đà Lạt's Flower pony (`cp-006`) is **Ngựa**.
2. **Slug.** The name folded to plain lowercase letters (`Ngựa` → `ngua`, `Chà Vá` → `chava`). All 151 fold to unique slugs that pass `^[a-z]{2,16}$`, and the seven existing slugs already equal their folded names.
3. **A city guide's name is public where its trip or destination shows**, as the seven are today. The dex keeps hiding critters of cities a person has no trip to until they are found.
4. **Accent colour** comes from the critter's own colours, adjusted until it passes the guide contrast rule. The seven keep their token colours.
5. **Persona.** A guide without a written pack speaks from a template built from its dex facts (name, species, city, country), in the hedged register used for places nobody has checked. A written pack replaces the template once approved (phase 4).
6. **Voice and music.** Its own when it has one; otherwise the default voice, and the theme of its country's themed guide when there is one (all of Vietnam plays Chà Vá's), else no theme.
7. **Existing trips.** Trips that have not started move to their city's critter when the switch turns on; started and finished trips keep their guide.
8. **Native surfaces** (Live Activities, widgets, the Android alarm screen, the App Clip) keep the default art for city guides until the next native build (phase 3).
9. **"Guest" keeps meaning "no curated set".** The city's critter is still the guide there; the wording says it is still learning the place, never that it is a guest.

## Phases

| # | Phase | Depends on | Status |
|---|---|---|---|
| 1 | [Guide rows, the destination link and assignment (server)](phase-01-guide-rows-link-assignment.md) | – | done |
| 2 | [The app draws and names any guide from its row](phase-02-app-guide-from-data.md) | 1 | in progress |
| 3 | [Native surfaces draw city guides](phase-03-native-surfaces.md) | 2, next native build | pending |
| 4 | [Written personas, voices and themes](phase-04-written-personas-voices-themes.md) | 1 | pending |

Phase 1 ships with its switch off (`guides.per_city`); it turns on for staging only after the app update of phase 2 is out, so no phone shows a Tokek sticker under another guide's name.

## Acceptance

- On staging a new trip to Đà Lạt has Ngựa as its guide everywhere in the app: name, sticker (the `cp-006` art), accent, chat and draft voice. Nothing on that trip shows Chà Vá or Tokek.
- The seven existing guides look, sound and speak exactly as before.
- Releasing a new critter gives its city a guide with no code change and no migration.
- A fresh-user device run on a Đà Lạt trip (home, trip hub, guide chat, draft review, Explore, a place page) is on the PR as design | device sheets.
