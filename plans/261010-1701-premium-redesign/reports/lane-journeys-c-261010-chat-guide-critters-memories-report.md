# Lane report: Journeys C (parts 5 and 8: chat, guide, critters, memories)

Branch `feat/premium-journeys-chat-critters` (worktree `guide-language`), merged with `origin/feat/premium-redesign` (useKeyboardFrame, PremiumTabs fix) and `origin/feat/premium-kit` (CritterSticker mask). Every premium screen is behind the shell's route switch; the current screen renders when premium UI is off.

## Screens done (code → file)

| Code | Screen | Premium file(s) | Route |
|---|---|---|---|
| 5.01–5.06, 5.08, 5.09, 5.12 | Crew chat: header, composer, sticker tray, long-press menu, critter reactions, read receipts, brand new, offline/bounced, mic off, read-only after leaving, typing | `features/crew/premium/chat/**` | `app/crew/[crewId]/chat/index.tsx` |
| 5.07 | Guide group offer and claim sheet | `features/guide/premium/offer/offer-card.tsx` (registered as a premium chat card) | crew chat |
| 5.11 | Photo and voice note cards | `features/crew/premium/chat/cards/media-cards.tsx` | crew chat |
| 5.13, 5.14, 5.17–5.20 | Guide thread: starters, plan card, offline tools, failed turn + Ask it differently, working steps + Stop, limit card, waiting-for-midnight card (tap to reword, Cancel) | `features/guide/premium/guide-screen.tsx` and siblings | `app/(modal)/guide/[threadId].tsx` |
| 5.15 | Voice | `features/guide/premium/voice/**` | `app/(modal)/guide/voice.tsx` |
| 5.16 | Point and ask | `features/guide/premium/camera/**` | `app/(modal)/guide/camera.tsx` |
| 5.21, 5.22 | Dietary consent and form | `features/guide/premium/dietary/**` | `app/(modal)/guide/dietary.tsx` |
| 5.23 | Phrase show mode (full brightness) | `features/guide/premium/phrases/phrase-show-screen.tsx` | `app/(modal)/guide/phrase.tsx` |
| 8.01 | Critterdex (pushed from the passport's Critterdex row, glass back) | `features/critters/premium/dex/**` | `app/you/critterdex.tsx` |
| 8.02 | Critter detail | `features/critters/premium/detail/**` | `app/critters/[critterId].tsx` |
| 8.03, 8.04, 8.06 | Encounter, befriended, wandered off | `features/critters/premium/encounter/**` | `app/(trip)/encounter/[id].tsx` |
| 8.05 | Egg hatch | `features/critters/premium/hatch/hatch-scene.tsx` | `app/(modal)/hatch/[tripId].tsx` |
| 8.07 | Crew quests | `features/critters/premium/quests/**` | `app/(trip)/quests/[tripId].tsx` |
| 8.08 | Legendary calendar | `features/critters/premium/legendary/**` | `app/critters/legendaries.tsx` |
| 8.09 | Recap page | `features/recap/premium/recap-scene.tsx`, `recap-parts.tsx` | `app/(trip)/recap/[tripId]/index.tsx` |
| 8.10, 8.11, 8.13, story player | Recap story: player (bars, tap, hold, swipe down), presenter row, the eight cards (cover, new friends, route, awards, money receipt, got away, passport stamp, postcard), MVP vote, card actions, signature sheet | `features/recap/premium/story/**` (`PREMIUM_STORY_LOOK`) | `app/(trip)/recap/[tripId]/story.tsx` |
| 8.12 | Trip journal | `features/album/premium/journal-scene.tsx`, `day-pocket.tsx` | `app/(trip)/album/[tripId]/index.tsx` |
| 8.14 | Postcard composer (Send it home) | `features/album/premium/postcard-*.tsx` | `app/(trip)/recap/[tripId]/postcard.tsx` |
| 8.15 | A year later | `features/recap/premium/memory-screen.tsx` | `app/memory/[memoryId].tsx` |

Logic moved out of views so both looks share it: `useGuideSheet`, `useDietaryForm`, `useMemoryScreen`, `useLegendaryCalendar`, `useStickerTray`, `useGuideReplying`, `useChatMediaActions`, the guide offer hook; the dex, hatch, quests, recap, album, postcard, voice and camera containers take a `View` prop (default the current view).

## Second pass (coordinator follow-ups)

- **Story (8.10, 8.11, 8.13, 8.14 as the last card)**: built. The story screen takes a `StoryLook` (view, footer, MVP sheet, not-ready state, signature sheet, card components); the current look is the default.
- **"Ping me" (5.18)**: built end to end. `ping_guide_answer {thread_id}` (online, any thread reader) records a ping in `guide_answer_pings` (new table: forced RLS, app_system only, C1, merge and purge rules, permission matrix). While a ping waits, the turn keeps running after the phone lets go of the stream (`detachable` in `commands/guide/answer-pings.ts`); saving the answer emits `guide.answer_ready` for each fresh ping and clears them; the worker pushes `answer_ready` (class always) opening the thread. Copy in the notifications catalog (EN, VI). Tests: `services/api/test/commands/guide/detachable.test.ts` (passes locally), `answer-pings.db.test.ts` (remote), DB permissions and merge-rule coverage (remote, pass).
- **Current-style parts replaced with premium ones**: memory reaction and share sheets, recap share sheet (with the link rows), voice consent, menu order card, chat photo viewer, journal upload banner, live encounter banner on the Critterdex, postcard note and photo sheets, story MVP vote and signature sheet. The signature pad itself stays the app's one signature engine (`ui/documents/SignatureLayer`), like the critter renderer.
- **Decisions applied**: "Keep it to myself" stays; crew quests stay a push from the trip.
- **Copy**: the lane's new strings are extracted into the area catalogs with Vietnamese for every one (287 entries; 55 reuse existing translations).

## Not done (follow-ups)

- **5.24 Getting around** and the guide circle's `from=circle`: with the trip/wallet lane and the shell fixer (coordinator).
- **Chat cards other areas own** (poll, expense, changeset, proposal, boost, meet-up, ride) still draw their current card until each area calls `registerPremiumChatCard`.
- **Full catalog extraction is blocked by two other lanes' files**: `ui/premium/motion/SwipeDeck.tsx` (Lingui's parser fails at 83:40) and a duplicate `crew.start.shareMessage` message between `crew/start-crew/crew-created.tsx` and `crew/premium/crew-copy.ts`. This lane's strings were extracted file by file.
- **Jest on screens that import `@/features/trip`**: the trip area's index now loads the premium kit, whose springs use `ReduceMotion`, which the Reanimated jest mock lacks; `recap/memory/__tests__/memory-screen.test.tsx` fails to load for that reason (the story suites pass). Needs the mock (shell/kit) or the trip index to stop loading premium views.
- **Lint outside this lane**: `crew/premium/resend-summary.ts` and `use-resend-invites.ts` import the home area directly (boundary errors).
- **CI helper fixed in passing**: `tools/scripts/test-images.ts` ran out of output buffer listing tracked files (ENOBUFS), which stopped every remote database run; it now allows 64 MB.
- **Typecheck**: per the brief, no local `tsc`; CI's typecheck is the first full type pass.

## Design conflicts resolved

- ✕ stays top-left (Foundations) on 5.23, 8.06 and 8.15, where the renders put it on the right.
- Crew quests is a push from the trip with a glass back (the render draws it root-styled with no back).
- Off-token values (dietary fields 46/r16, title 30/700, segment tracks, "Welcome to Bali" 44/800) use the nearest Foundations token.
- The dex's count block stands in for the large title; the place search stays (a field under the filters) since the current dex has it.
- Dietary consent adds "Keep it to myself" so a private profile stays possible.
- Offer slot cells fill in sun without initials (claimers' names are not on the offer row).
- Colours, shadows and gradients the tokens lack sit in one paint module per area (`crew/premium/premium-paint.ts`, `guide/premium/guide-paint.ts`, `critters/premium/components/scrims.ts`, `recap/premium/recap-paint.ts`), ready to promote into the tokens.

## Backend added (earlier in this lane)

Critter stickers as a message type, critter reactions and read receipts (migration, forced RLS, permission tests); pin a message to the trip; ask to rejoin and remove a kept chat; the all-square line; guide working steps; rewording a queued question; pink epic Tokek, white sticker edge and light locked silhouettes in `@cp/critter-art`.

## Candidates for the kit (built in the area, needed by others)

`Doodle` (`crew/premium/chat/doodle.tsx`), `CritterSilhouette` (`critters/premium/components/critter-silhouette.tsx`), the loops `Bob`/`Float`/`Hop`/`Ping`/`Spin`/`Land` and `Rays`/`Confetti` (`critters/premium/components`), `ChoiceChip` (`guide/premium/dietary/choice-chip.tsx`), the `layered`/`doubleRing` shadow helpers.

## Checks

- ESLint on every touched file of this lane: clean (other lanes' crew files excepted, above).
- Jest: sticker tray, dietary, hatch (model, runtime, screen), pass screen, quests, voice consent, postcard draft, album states, story clock and voice, `callsGuide`; memory screen blocked by the jest mock (above).
- Remote (GitHub): `@cp/db` permissions and merge-rule coverage pass; `@cp/api` answer pings and `@cp/db` events and migrate dispatched after the event-type fix.
- Undesigned states logged in `docs/undesigned-states.md`.

## Open questions for the founder

None open: "Keep it to myself" and quests as a push were decided.
