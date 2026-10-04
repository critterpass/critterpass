---
phase: 2
title: The app draws and names any guide from its row
status: in_progress
depends_on: [1]
tasks: 4
owns:
  - apps/mobile/src/lib/navigation/active-guide.ts
  - apps/mobile/src/ui/avatar/guides.ts, apps/mobile/src/ui/people/GuideLine.tsx, apps/mobile/src/ui/shell/GuideFab.tsx, apps/mobile/src/ui/cards/tone.ts and their tests
  - apps/mobile/src/data/guides/** (new: the one place that turns a guide row into what screens draw)
  - "the per-guide records and the unknown-slug fallbacks listed in the scout report §1 (mobile) and §6, each replaced by the guide data and nothing else in those files"
  - apps/mobile/src/motion/music/themes.ts (theme choice only)
  - packages/i18n/locales/** (the messages that hard-code a guide's name where the trip's guide is meant)
  - apps/web/src/components/previews/invite-facts.ts
  - e2e/guide/**, e2e/plan/draft-*.yaml (flows that key on a guide id), plus one new fresh-user flow
  - docs/undesigned-states.md (the new states)
mount_points:
  - apps/mobile/src/app/(dev)/** (lab scenes with a city guide)
---
# Phase 2 — The app draws and names any guide from its row

## Context

- Plan: [plan.md](plan.md), decisions 1–4, 6 and 9. Map: [the scout report](reports/scout-261004-1955-guide-hard-wiring-map-report.md) §1 (mobile), §3, §4, §6.
- In-app art is already procedural for every dex critter: `Sticker` takes any `cp-###` kind. What is closed is the id: `GuideId` unions (three copies), `GUIDE_DEX_IDS`, `tokens.guide.<slug>` colours with build-time paper variants, per-guide records (`GUIDE_TONES` twice, hero lines, theme names, card tones), and about 25 sites that turn an unknown slug into Tokek.
- Phase 1 adds `critter_key` and `accent` to the synced `guides` rows.

## Requirements

1. **One source.** A guide on screen comes from its synced row: name, sticker kind (`critter_key`), the dex seed, accent, and the paper variant computed with phase 1's shared function. The guide id type is a plain slug string; no closed union remains.
2. **No silent Tokek.** Where a trip's or destination's guide row is known, nothing falls back to Tokek. Tokek stays the default only where there is no trip: onboarding lines, the six-guide avatar picker, the feedback faces.
3. **Per-guide copy.** A guide with its own lines keeps them. One without gets a plain line with `{guideName}`; nothing is invented for it (no catchphrase, no local word).
4. **Names in messages.** Messages that say "Tokek" where the trip's guide is meant take `{guideName}`, in every locale.
5. **Not a guest.** For a destination without a curated set the hub pill and Explore's guide page say the city's guide is still learning the place and that its picks are unchecked; never "is a guest here". Logged in `docs/undesigned-states.md`.
6. **Music.** A guide's own theme, else the theme of its country's themed guide, else none. The recap story no longer plays Tokek's theme for a guide it does not know.
7. **Poses.** A critter without limb poses shows the shared face flourishes only, as Sardi and Paco do today.
8. **Web invite preview** draws the guide from the invite's data, not from a slug map.

## Tasks

### T1 Guide data module and the id type
- `data/guides`: row → what screens draw; the three `GuideId` types become the slug string; `GUIDE_DEX_IDS` and the token lookups go behind the module.
- Tests: a city guide (Ngựa) and each of the seven resolve to the right kind, seed and colours; an unknown slug with no row is Tokek.
- Status: done — 3d758d022

### T2 Screens, copy and music
- The fallbacks and per-guide records of the scout report; messages with a hard-coded name; the guest wording; the theme rule.
- Tests only where a branch decides something (theme choice, guest wording by coverage, the fallback rule).
- Status: done — 751f9b436

### T3 Web invite preview
- Status: blocked — `invite-facts.ts` gives any guide's sticker (6dfa564f7); `InviteCard.astro`, outside this phase's owns list, still has to call it

### T4 Device proof
- Lab scenes with a city guide for the screens that draw one, and a fresh-user flow on staging: a new Đà Lạt trip, then home, trip hub, guide chat, draft review, Explore and a place page.
- Android, EN + VI, `mode=compare`, one dispatch, sheets on the PR.
- Status: blocked — lab scenes and capture flows are in (7c3196bd5); the device run needs the PR's sheets, and the staging fresh-user flow needs `guides.per_city` on in staging

## Done when

With staging's `guides.per_city` on, the founder's phone shows Ngựa on a Đà Lạt trip on every screen of the flow above, and a Bali and a Đà Nẵng trip are unchanged against main's sheets.

## Risks

- About 180 files import a guide id type, mostly for props: keep the change mechanical and in one PR, with one device run.
- Accent legibility on both surfaces for 144 new colours: the shared function is tested over the whole dex in phase 1; the sheets show a pale one (Ngựa's fill is `#fff1d6`) and a dark one.
