---
phase: 3
title: Native surfaces draw city guides
status: pending
depends_on: [2]
tasks: 2
owns:
  - apps/mobile/targets/widgets/**
  - apps/mobile/targets/notification-service/**
  - apps/mobile/targets/app-clip/**
  - apps/mobile/modules/cp-alarm/**
  - apps/mobile/plugins/with-critter-art.ts and its test
  - packages/critter-bake/manifests/**
---
# Phase 3 — Native surfaces draw city guides

Rides the next native build; nothing here ships as an app update.

## Context

- Plan: [plan.md](plan.md), decision 8. Map: [the scout report](reports/scout-261004-1955-guide-hard-wiring-map-report.md) §3 (native surfaces).
- Colour art is baked for the seven hand-drawn kinds only; the 144 locals have a 60 pt silhouette. `LiveActivityStyle.swift` switches over six slugs and defaults to Tokek; widgets hard-code three kinds; the Android alarm screen is always Tokek; the App Clip has one imageset.
- The notification service already loads a face from an App Group PNG by key, then an https address, then the bundled gecko; the app only ever writes its own avatar there.

## Requirements

1. Live Activities, widgets and the Android alarm screen take the guide's accent from the payload and draw the guide's own art when it is bundled; otherwise a neutral guide mark in that accent, never another guide's face.
2. Decide the bake by size, with numbers in the report: colour art for all locals at the sizes native surfaces use, or only for destinations with a curated set.
3. Guide pushes show the guide's face: the app mirrors the trip guides' rendered faces into the App Group, and the payload carries the key.
4. The release gate runs on the new builds before TestFlight.

## Tasks

### T1 Bake and payload
- Status: pending

### T2 Surfaces
- Status: pending

## Done when

On the new build a Đà Lạt trip's leave-by Live Activity, countdown widget and a guide push show Ngựa's accent and face, and the seven are unchanged.
