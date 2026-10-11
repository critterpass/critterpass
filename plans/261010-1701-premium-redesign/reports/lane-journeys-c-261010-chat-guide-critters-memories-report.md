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
| 8.01 | Critterdex | `features/critters/premium/dex/**` | `app/(tabs)/pass.tsx` |
| 8.02 | Critter detail | `features/critters/premium/detail/**` | `app/critters/[critterId].tsx` |
| 8.03, 8.04, 8.06 | Encounter, befriended, wandered off | `features/critters/premium/encounter/**` | `app/(trip)/encounter/[id].tsx` |
| 8.05 | Egg hatch | `features/critters/premium/hatch/hatch-scene.tsx` | `app/(modal)/hatch/[tripId].tsx` |
| 8.07 | Crew quests | `features/critters/premium/quests/**` | `app/(trip)/quests/[tripId].tsx` |
| 8.08 | Legendary calendar | `features/critters/premium/legendary/**` | `app/critters/legendaries.tsx` |
| 8.09 | Recap page | `features/recap/premium/recap-scene.tsx`, `recap-parts.tsx` | `app/(trip)/recap/[tripId]/index.tsx` |
| 8.12 | Trip journal | `features/album/premium/journal-scene.tsx`, `day-pocket.tsx` | `app/(trip)/album/[tripId]/index.tsx` |
| 8.14 | Postcard composer (Send it home) | `features/album/premium/postcard-*.tsx` | `app/(trip)/recap/[tripId]/postcard.tsx` |
| 8.15 | A year later | `features/recap/premium/memory-screen.tsx` | `app/memory/[memoryId].tsx` |

Logic moved out of views so both looks share it: `useGuideSheet`, `useDietaryForm`, `useMemoryScreen`, `useLegendaryCalendar`, `useStickerTray`, `useGuideReplying`, `useChatMediaActions`, the guide offer hook; the dex, hatch, quests, recap, album, postcard, voice and camera containers take a `View` prop (default the current view).

## Not done (follow-ups)

- **8.10, 8.11, 8.13 story cards and the story player**: the story's cards are built by `buildStoryCards` with the current card components, played by the current `StoryPlayer`. A premium story needs premium versions of the eight cards and the player chrome (8 segments, presenter row, ✕ 36). Next pass.
- **5.24 Getting around**: lives in `features/bookings/getting-around` (the trip/wallet lane's area). Left to that lane.
- **Chat cards other areas own** (poll, expense, changeset, proposal, boost, meet-up, ride): the premium chat draws their current card until each area calls `registerPremiumChatCard` (exported from `@/features/crew`).
- **"Ping me" on a slow answer (5.18)**: needs a push when the answer lands; the server does not send one. Only Stop is built.
- **Current pieces still inside premium screens**: memory reaction and share sheets, the voice consent gate, the menu order card, the photo viewer, the journal's upload banner, the dex's live encounter banner and near map, the postcard's photo and note sheets.
- **Guide circle as a sheet**: the premium guide draws a grabber and ✕ when opened with `from=circle`; the shell's guide circle (`useGuideActions`) should add that param.
- **Typecheck**: per the brief, no local `tsc`; CI's typecheck is the first full type pass on these files. Lint is clean on every touched file.

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

- ESLint on every touched file: clean.
- Jest: sticker tray, dietary, memory screen, hatch (model, runtime, screen), pass screen, quests, voice consent, postcard draft, album states, `callsGuide`.
- Undesigned states logged in `docs/undesigned-states.md`.

## Open questions for the founder

1. Should a dietary profile be keepable without sharing (the render offers only Share or Not now)? Built as yes.
2. Should crew quests keep the tab bar (root) or be a push from the trip? Built as a push.
