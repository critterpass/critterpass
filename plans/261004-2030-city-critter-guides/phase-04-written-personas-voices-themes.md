---
phase: 4
title: Written personas, voices and themes
status: pending
depends_on: [1]
tasks: 3
owns:
  - packages/content/src/schemas/personas.ts and its test
  - tools/content-factory/src/kinds/personas/** and tools/content-factory/test/personas.test.ts
  - services/worker/src/content/writers-guides-places.ts (the personas writer only)
  - packages/ai/src/persona/loader.ts (release reading for every route)
  - tools/content-factory/batches/personas/**
---
# Phase 4 — Written personas, voices and themes

## Context

- Plan: [plan.md](plan.md), decisions 5 and 6. Map: [the scout report](reports/scout-261004-1955-guide-hard-wiring-map-report.md) §1 (personas), §4, §5.
- The personas pipeline assumes the closed list: `PERSONA_KEYS` (eight), a batch must hold exactly seven packs, canonical colours per slug, and the writer refuses a pack whose guide row is missing. Only chat reads approved releases; nineteen prompt builders read the repo pack.
- Content approval is delegated to the controller (founder, 2026-10-04 19:35); a rights-flagged or blocked batch still goes to the founder.

## Requirements

1. The personas kind writes a pack for any guide: keys come from the guide rows, a batch holds any number of packs, and a pack starts from the template of phase 1 plus what the model writes for that city (tagline, register, a few local words marked unvetted, taboos, sign-off). The guest pack's rule that it never names a local stays for the guest pack only.
2. Every route reads the approved release first, then the repo pack, then the template.
3. Voice: a pack may name a voice; without one the default voice speaks. No voice is cloned or bought here.
4. Themes: the rule of plan decision 6 is data (a guide row names the theme it plays); composing a new theme is a separate, founder-approved-by-ear piece of work.
5. First batch: Vietnam's eleven guides. The batch report ends with the validator results, the packs the lane is least sure of, and what it changes in live.

## Tasks

### T1 Personas for any guide (factory, schema, writer)
- Status: pending

### T2 Release-first reading for every route
- Status: pending

### T3 Vietnam's eleven packs
- Status: pending

## Done when

Ngựa's written pack is approved and live on staging, the draft summary and chat of a Đà Lạt trip speak from it, and the seven packs replay unchanged.
