---
title: Dates picker that shows its selection and picks any days
status: in progress
owner: one lane
---
# Dates picker polish

Founder, 2026-10-04 10:22: "calendar days selection ui - colors is hard to see whats selected, two +- components - think can go free days selection instead of set a full week. either ways polish that component to be more intuitive, smart and easy to use".

## Where it is today

- **3c-3 heatmap** (`features/setup/when/heatmap.tsx`): orange cells tinted by how many are free. The chosen window is a thin yellow inset on cells that are already orange, so it barely shows.
- **"Pick a week anyway"** (`week-picker.tsx`, undesigned): tap a first day, then set the length with a − N days + stepper. Month paging adds a second pair of arrows.
- **Mark days by hand** (`features/setup/calendar/manual-days-sheet.tsx`, undesigned): each tap cycles a day through free → busy → maybe → unmarked.

## What to build

1. **The selection is unmistakable.** The chosen days draw as one continuous yellow band across each week row, with rounded ends on the first and last day and dark text on yellow. Availability stays readable inside the band as the small "n/N" under each date. Outside the band the orange heat is unchanged. Use the same treatment for the guide's best window on 3c-3 and for a picked range.
2. **Pick any days, no stepper.**
   - Tap the first day, then the last day, or drag across the days.
   - Tapping inside a range moves its nearer end, and a Clear link resets it.
   - The length reads live ("8 days · Apr 2–9").
   - Keep the domain's min/max trip length: a range past them says why and isn't lockable.
   - Remove the − / + stepper.
3. **Smart defaults.**
   - After the first tap, a ghost range suggests the end from the trip's planned length, nudged to the days the most people can make; one more tap confirms it.
   - Above the calendar, up to three chips name the best windows ("Apr 2–9 · all 6", "Apr 16–22 · 5 of 6"), and tapping one selects it.
   - Live, under the calendar: how many can make every day of the selection. Only counts, never names or anyone's days.
4. **Fewer controls.** Swipe between months, with the month name and a small "today" link, instead of a second pair of arrows.
5. **Mark days by hand uses the same grid.**
   - A three-way tool, Free / Maybe / Busy, then tap or drag to paint days; painting a day already in that state clears it.
   - The legend uses labels and a pattern for Maybe, so no state is colour alone.
   - Save is unchanged (`set_availability`, works offline).

The designed parts of 3c-3 and 3c-4 stay as they are: copy, layout, the guide line, the options and Lock. Every changed or undesigned state is logged in `docs/undesigned-states.md` for founder review.

## Owns

- `apps/mobile/src/features/setup/when/**`
- `apps/mobile/src/features/setup/calendar/{manual-days-sheet.tsx,manual-days.ts}` and their tests
- `apps/mobile/src/ui/data/CalendarHeatmap.tsx` if the grid moves there, with its tests
- `packages/i18n/locales/{en,vi}/setup*`
- `e2e/setup/**` flows for the dates step and the hand-marked days
- `docs/undesigned-states.md`

## Done when

- The lab scenes (best window, picked range, ghost suggestion, range too long, hand-marking with each tool) and the dates-step flow pass on Android with `mode=compare`, in EN and VI.
- The PR shows the selection clearly against the heat.
- Unit tests cover the range rules: first and last tap, a tap inside, drag, min/max, the ghost suggestion, and paint and clear.
- No server change.
