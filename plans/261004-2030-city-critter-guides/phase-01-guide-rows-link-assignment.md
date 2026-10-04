---
phase: 1
title: Guide rows, the destination link and assignment (server)
status: pending
depends_on: []
tasks: 4
owns:
  - packages/db/migrations/<UTC timestamp>_city_critter_guides.sql
  - packages/db/src/schema/trips.ts (the `guides` and `destinations` columns added here only)
  - packages/db/src/guides/** and packages/db/test/guides/**
  - packages/db/src/polls/close.ts (the guide assignment only)
  - services/api/src/commands/trips/create-trip.ts (the guide assignment only)
  - services/worker/src/content/writers.ts (the guide sync call after a critters or sets release)
  - services/worker/src/guides/** and services/worker/test/guides/** (the re-point job and its CLI)
  - packages/critter-art/src/guides/** (slug fold, guide facts from the dex)
  - packages/design-tokens/src/derive.ts (export the contrast helpers; no token value changes)
  - packages/ai/src/persona/** and packages/ai/test/persona*.test.ts
  - "the `REPO_PACKS[...]` lookups and the `personaIdSchema` fallbacks listed in the scout report §1, each changed to the one resolver and nothing else in those files"
  - packages/domain/src/planning/config.ts or the ops config catalogue file that holds switches (one key)
  - apps/mobile/src/data/powersync/synced-tables.generated.ts (regenerated)
mount_points:
  - docs/product-decisions.md (one decision row)
  - docs/data-model.md (`guides`, `destinations` rows)
  - docs/api-contracts.md (only if a wire shape gains a field)
---
# Phase 1 — Guide rows, the destination link and assignment

## Context

- Plan: [plan.md](plan.md), decisions 1–7 and 9. Map of today's code: [the scout report](reports/scout-261004-1955-guide-hard-wiring-map-report.md) §1, §2, §7–9.
- `guides` (`packages/db/migrations/20260926225003_trips_and_participants.sql:29`) has `slug`, `name`, `colour` (a CHECK of seven named colours), `voice_id`; rows exist only for the seven, created by migration or seed. It syncs to phones whole (`infra/powersync/streams/core.yaml`, `SELECT * FROM guides`).
- A trip's guide is set in two places with one rule, `guides.slug = coalesce(critter_sets.guide_slug, 'tokek')`: `packages/db/src/polls/close.ts:188` and `services/api/src/commands/trips/create-trip.ts:92`.
- City destinations are generated one per (set, critter city) by `app.sync_place_destinations()` (`20260929040000_polls_ballots_pitches.sql:23`); nothing stores which critter a destination belongs to. A set's home destination (`critter_sets.destination_id`: bali, da-nang, kyoto, iceland, mexico-city, lisbon, cusco) is tied to the set's `hero_critter_key`.
- Prompt builders read `REPO_PACKS[guide]` from eight static JSON packs; about 25 server sites parse the slug with `personaIdSchema` and fall back to Tokek.

## Requirements

1. **Identity.** `guides.critter_key` (unique): one guide per released critter. The seven existing rows take their keys (tokek `cp-112`, pon `cp-061`, lundi `cp-148`, ajo `cp-041`, sardi `cp-076`, paco `cp-145`, chava `cp-151`). `slug` is the critter's name folded to lowercase letters, `name` the critter's name. One fold, used by SQL and TypeScript, proved equal over the whole dex.
2. **Accent.** `guides.accent` (hex) for every row: the token colour for the seven; for the rest the first of the critter's own colours that passes the guide contrast rule, else that colour moved in lightness until it does. One pure function, shared with the app in phase 2. `guides.colour` stays NOT NULL for older readers: a new row takes the nearest named colour.
3. **Rows come from the catalogue.** A released critter gets its guide row from one sync function called by the critters/sets release writer; the migration backfills from what is already released. No migration per guide ever again.
4. **Link.** `destinations.critter_key`: a generated city destination carries its city's critter, a set's home destination the set's hero critter. `app.sync_place_destinations()` keeps it.
5. **Assignment.** With the ops switch `guides.per_city` on, both writers set a trip's guide to the guide of its destination's critter; a destination with no critter keeps today's rule. With the switch off (the default) both answer exactly as today. `is_guest_guide` keeps its meaning (no curated set).
6. **Trips that have not started** are re-pointed to their city's critter by an operator job once the switch is on; started and finished trips are left alone. Idempotent, counts only in the log.
7. **Persona.** One resolver for every route: the repo pack when the guide has one, else a template pack built from the dex facts (name, species, city, country) in the hedged register of the guest pack, never naming Tokek. `personaIdSchema` accepts any guide slug; an unknown slug still falls back to Tokek. Chat keeps reading approved releases first.
8. **Additive contracts.** No wire field is removed or renamed; older app builds keep working with the switch on or off.

## Tasks

### T1 Guide identity in data
- Migration: the two `guides` columns, the `destinations` column, the sync function for guide rows, the backfill, grants and the permission test for the new columns. `pois`-style care is not needed (small tables), but every statement is idempotent.
- `@cp/critter-art` guides module: fold, guide facts by slug and by key. `@cp/design-tokens`: the contrast helpers exported.
- Tests: the fold agrees between SQL and TypeScript for all 151 names, slugs are unique and match `^[a-z]{2,16}$`; every accent passes the contrast rule on the dark base and its paper variant on paper; the seven keep slug, name and colour.
- Status: pending

### T2 Assignment and the switch
- `guides.per_city` in the ops config catalogue, default off.
- Both writers read the destination's critter when it is on. Database tests: a generated city destination (Đà Lạt → `ngua`), a set home destination (Đà Nẵng → `chava`), a destination with no critter, and the switch off.
- Status: pending

### T3 Trips that have not started
- Worker job plus operator CLI (the `places.pick` CLI is the pattern). Database test: a planning trip moves, an in-trip and a finished trip stay.
- Status: pending

### T4 Persona resolver
- Template pack builder and the resolver; every `REPO_PACKS[...]` lookup and `personaIdSchema` fallback goes through it.
- Tests: a template pack for Ngựa validates against the pack schema, carries the hedge and never says Tokek; the seven resolve to their repo packs unchanged; an unknown slug falls back to Tokek. Run the persona eval on the template for three guides and record the scores in the report.
- Docs: the decision row, the data-model rows.
- Status: pending

## Done when

On staging with the switch on, a new Đà Lạt trip's row points at `ngua`, its draft and chat prompts carry Ngựa's template persona, a Đà Nẵng trip still gets Chà Vá's own pack, and with the switch off both behave as today.

## Risks

- A phone on older JavaScript shows Tokek's art under the new name: the switch stays off on staging until phase 2's update is out.
- Two critters folding to one slug in a future dex release: the sync function fails loudly on the unique slug instead of overwriting.
- Template personas are generic by design; written packs follow in phase 4.
