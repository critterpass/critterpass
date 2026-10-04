# Guide hard-wiring today, read at origin/main a469b71e (4 Oct 2026)

Read-only run. Paths are repo-relative and line numbers are from `origin/main` at that commit.

Terms: "dex" is `packages/critter-art/src/data/critters.ts` (151 rows). A "set" is one `critter_sets` row, which is a country (61 of them).

## Headlines

1. **In-app art is procedural.** Any dex critter draws from its `cp-###` kind in JS; the app bundles no per-guide images. Native surfaces are the exception: colour art is baked only for the seven hand-drawn kinds.
2. **A guide is a slug from a closed list.** The list is repeated in about 15 places. An unknown slug silently becomes Tokek almost everywhere (art, colour, name, persona).
3. **Guides are assigned per country set, not per city.** Two different joins are used, and they disagree for a set's non-home cities.
4. **The dex gives name, species, city, country and art.** It gives no slug, accent colour, persona content, voice or music.
5. **Critter names are kept server-side until found.** Dex-named city guides run against that rule (see unresolved questions).

## 1. Closed lists of guide ids, and guide id as type or key

**Mobile JS**
- `apps/mobile/src/lib/navigation/active-guide.ts:2` is the `GuideId` union of seven; `:9` defaults to tokek.
- `apps/mobile/src/ui/avatar/guides.ts`:
  - `:10` `GuideStickerId` (keys of `tokens.guide.onPaper`); `:13` `GuideAvatarId` excludes chava; `:16` picker order is the six.
  - `:19-27` `GUIDE_DEX_IDS` maps slug to `cp-###`. This is the only slug-to-dex link on the client.
  - `:35-49` name and kind are already read from the dex entry.
- `apps/mobile/src/ui/people/GuideLine.tsx:11` is a third `GuideId` type; `:37-42` the voice colour comes from `tokens.guide[...]` or `.onPaper[...]`.
- `apps/mobile/src/ui/shell/GuideFab.tsx:29-36` throws for a guide not in `GUIDE_DEX_IDS`; `:148` face colour from the token.
- Per-guide records and switches:
  - `apps/mobile/src/features/trip/hub/guide.ts:11-25` and `apps/mobile/src/features/home/format.ts:41-57` (two copies of `GUIDE_TONES`).
  - `apps/mobile/src/features/home/first-run-grid.tsx:37-45, 73-81` (home cities; six cells from `tokens.guide.order`).
  - `apps/mobile/src/features/explore/guide-copy.ts:10-33` (hero lines).
  - `apps/mobile/src/features/recap/story/story-copy.ts:31-49` (theme names).
  - `apps/mobile/src/features/help/feedback/FeedbackView.tsx:37-41` (mood faces).
  - `apps/mobile/src/features/onboarding/splash/Floaters.tsx:27-31`.
  - `apps/mobile/src/ui/cards/tone.ts:5-31` (`CardTone`, seven accents).
- The unknown-slug-becomes-Tokek pattern appears at about 25 call sites, for example:
  - `apps/mobile/src/features/explore/format.ts:37, 49-59`
  - `apps/mobile/src/features/vote/format.ts:12-14`
  - `apps/mobile/src/features/setup/data/setup-trip.ts:136`
  - `apps/mobile/src/features/proposal/data/trip.ts:131`
  - `apps/mobile/src/features/plan/draft/data/draft-trip.ts:120`
  - `apps/mobile/src/features/guide/chat/components/guide-header.tsx:26-28`
  - `apps/mobile/src/features/bookings/supplier/data/use-trip-guide.ts:16-27`
  - `apps/mobile/src/features/home/data/use-trip-guide.ts:43-45`
- About 180 non-test mobile files import one of these id types, mostly for prop typing.

**Design tokens**
- `packages/design-tokens/src/guide.tokens.json:3-18` (order of six, seven colours).
- `packages/design-tokens/src/types.ts:81-100` and `packages/design-tokens/src/derive.ts:11-19, 39-56, 150-163`. `onPaper` and the contrast pairs are computed at build time for the closed list.
- `packages/design-tokens/src/sound.tokens.json:279-389` has `music.<id>` and `voice.<id>` for six guides, with no chava.

**Music and SFX**
- `apps/mobile/src/motion/music/themes.ts:3-17` (static `.m4a` imports), `:20-21` `GUIDE_IDS`, `:36-54` asset maps.
- `apps/mobile/src/motion/impact.ts:38-49` lists the cue ids.
- `packages/sound-art/src/music/registry.ts:10-26` and `packages/sound-art/src/cues/notify.ts:20-77`.

**Personas: lists, loading and versioning**
- `packages/ai/src/persona/schema.ts:9-12` holds `GUIDE_SLUGS`, `PERSONA_IDS` and the enum; `:37-76` is the pack schema.
- `packages/ai/src/persona/loader.ts:6-35` imports eight JSON files statically into `REPO_PACKS`. A bad pack stops the process at boot.
- All eight files in `packages/ai/personas/` are `version 0.1.0`, `status draft`.
- Release path:
  - Table: `packages/db/migrations/20260927105422_agent_jobs_and_persona_packs.sql:51-74` (unique on guide and version).
  - View, approved only: `packages/db/migrations/20260927105622_llm_views_and_guide_reader.sql:59-71`.
  - Writer: `services/worker/src/content/writers-guides-places.ts:11-44`. It refuses a pack whose guide row is missing (`:21`), versions as `content-v<n>`, and skips the guest pack.
  - Reader: `loader.ts:50-51, 75-90` takes the latest approved row; an invalid release falls back to the repo pack.
- Only chat paths read releases: `services/api/src/commands/guide/turn.ts:58-73` and `packages/ai/src/routes/guide/crew-store.ts:98-112`.
- Nineteen other prompt builders read `REPO_PACKS[guide]` directly (e.g. `packages/ai/src/prompts/draft/context.ts:104`), so they see the repo pack only.
- About 25 server sites parse the slug with `personaIdSchema` and fall back to tokek, e.g. `services/worker/src/jobs/ai/draft/plan-input.ts:49-50`.
- Content factory:
  - `packages/content/src/schemas/personas.ts:10-20` (`PERSONA_KEYS`, eight).
  - `tools/content-factory/src/kinds/personas/index.ts:20-29` (canonical colours), `:129-158` (starts from `REPO_PACKS[id]`), `:197-207` (guest pack must not name a local), `:223-230` (batch must have exactly 7 packs).

**Database and domain**
- `guides` table: `packages/db/migrations/20260926225003_trips_and_participants.sql:29-44`. The colour CHECK is at `:40`.
- `packages/db/migrations/20260930161735_chava_guide.sql:5-10` re-creates the CHECK with `red` and inserts chava.
- Guide rows are created only by that migration, the dev seed (`packages/db/seed/index.ts:25-33`) and the demo world.
- The ops console can edit a guide but not create one (`packages/domain/src/admin/catalogue.ts:21-28, 69`).
- `critter_sets.guide_slug` is text with no FK: `packages/db/migrations/20260927230000_content_catalogue.sql:91`.
- `packages/domain/src/enums/catalogue.ts:11-14` holds the colour enums (the six are also the member palette).
- Other six-guide lists:
  - `packages/domain/src/pass/wire.ts:12-28` (`ONBOARDING_GUIDES`, form id `guide:[a-z]+`).
  - `packages/content/src/tips/schema.ts:11, 31`.
  - `packages/content/src/schemas/places.ts:55`.
  - `tools/content-factory/src/data/place-facts.ts:14`.

**Web and native**
- `apps/web/src/components/previews/invite-facts.ts:9-22` maps slug to kind, default gecko.
- `apps/mobile/targets/widgets/LiveActivities/LiveActivityStyle.swift:22-64` is a Swift switch over six slugs, default Tokek.

## 2. How a trip gets its guide, and the guest flags

- `trips.guide_id` is written in two places only:
  - Crew trip: born `voting` with no guide. On poll close, `packages/db/src/polls/close.ts:188-199` sets it.
  - Solo trip: `services/api/src/commands/trips/create-trip.ts:92-101`.
- Both use the same rule: guide is `guides.slug = coalesce(critter_sets.guide_slug, 'tokek')` through `destinations.critter_set_id`, and `is_guest_guide` is `destinations.coverage = 'guest'`.
- `guide_slug`, `coverage`, `destination_id` and `hero_critter_key` are per set, written by the `sets` release (`services/worker/src/content/writers.ts:34-53`).
- City destinations are generated per (set, critter city) and copy the set's coverage, tz and currency: `packages/db/migrations/20260929040000_polls_ballots_pitches.sql:23-50`.
- So today a Đà Lạt trip gets Chà Vá and a Tokyo trip gets Pon.
- `is_guest_guide` changes two things:
  - A header line in the LLM trip context (`packages/ai/src/context/build.ts:77-90`).
  - The hub pill "{guideName} is a guest here" (`apps/mobile/src/features/trip/hub/phase-header.tsx:253-258`).
- It does not pick the persona. Chat takes the pack from the slug (`turn.ts:64-66, 212`), so a guest trip talks to the full Tokek pack.
- `coverage = 'guest'` changes:
  - Pitch persona becomes the `guest` pack (`packages/ai/src/prompts/pitch/prompt.ts:49-53`).
  - Search and vote board show Tokek (`services/api/src/routes/places-search.ts:111`, `apps/mobile/src/features/vote/data/use-board.ts:56-57`).
  - The guest page and brief (`apps/mobile/src/features/vote/places/guest-guide-page.tsx:41, 222-236`).
- `guest_mode` in `packages/ai/src/persona/layering.ts`: `:68-73` adds the hedge ("From what Tokek knows so far,"); `:139-141` refuses a curated destination pack. `loader.ts:81` keeps the guest pack repo-only.
- The guest pack is used by pitch, guest-brief and home tips (`services/worker/src/jobs/tips/generate.ts:126-135`).

## 3. Guide art

- **In-app art is procedural for every dex critter.** `packages/critter-art/src/kinds/locals/register.ts:62-75` registers a kind per `cp-###`; `apps/mobile/src/ui/sticker/Sticker.tsx:38-106` takes any kind string.
- GuideLine and TokekNote receive the sticker as a prop (`apps/mobile/src/ui/planning/tokek-note.tsx:14-24`).
- Poses used for guides in the app are idle, wave, cheer, think, point and sleep.
- Any pose string is accepted by any kind. What actually draws differs:

| Kind | Dex count | Limb poses drawn |
|---|---|---|
| gecko, langur | 2 | wave, cheer, think, point |
| tanuki | 1 | wave, cheer, think |
| puffin, axolotl | 2 | wave, cheer |
| sardine, alpaca | 2 | none |
| `sit` | 51 | wave, cheer, think |
| `bird`, `lizard` | 31 | wave, cheer |
| other 12 archetypes | 62 | none; whole-body `tilt`/`hop` only |

- Every kind gets the shared face flourishes: sleep (closed eyes and Z), think (dots), cheer (sparks), and blink (`packages/critter-art/src/kinds/parts/face.ts:7-88`).
- `point` exists only for gecko and langur. Sardi and Paco already run as guides with no limb poses.
- The matrix is stated at `tools/content-factory/src/kinds/forms/poses.ts:8-21`.
- `GuideStickerInfo` carries no seed. `Sticker` defaults to seed 7, while a local's dex seed is its `no` (`packages/critter-art/src/forms/resolve.ts:11-13`).
- **Native surfaces bundle baked PNGs.** The bake manifest is `packages/critter-bake/manifests/tier-a.json`:
  - Six hand-drawn kinds: idle/cheer/sleep, colour and mask, 48 and 96 pt, plus face crops.
  - Langur: idle and cheer colour at 48 pt only.
  - The 144 locals: a 60 pt silhouette and blur stages only, no colour.
- `apps/mobile/plugins/with-critter-art.ts:18-39` embeds named imagesets per iOS extension.
- Widgets hard-code gecko, tanuki and sardine art (e.g. `apps/mobile/targets/widgets/Widgets/CountdownWidget.swift:77`).
- The Android alarm screen is always Tokek (`apps/mobile/modules/cp-alarm/android/src/main/java/app/critterpass/alarm/AlarmScreen.kt:120-130`).
- The App Clip has one `Guide` imageset (`apps/mobile/targets/app-clip/TicketView.swift:150-152`).
- Notification faces load in order: an App Group PNG by key, then an https URL, then bundled gecko (`apps/mobile/targets/notification-service/AvatarLoader.swift:14, 49-64`).
- The app only ever writes `avatars/me@3x` (`apps/mobile/src/ui/avatar/app-group-mirror.ts:15`), so guide pushes show the default face on iOS.
- Web: baked WebP exists for the seven kinds only (`packages/critter-bake/manifests/web.json`). OG cards load `/critters/<kind>-common-idle-color-232pt@2x.webp` (`apps/web/src/lib/og/render.ts:47-50`). Other critters draw on a canvas.

## 4. Music and sound

- Each theme is a hand-written spec of about 150 lines in `packages/sound-art/src/music/themes/` (seven files), rendered by `packages/sound-art/scripts/render-outputs.ts:93-121`.
- Outputs are copied by hand into `apps/mobile/assets/music` and listed in `manifest.json` (`docs/decisions/20260927-in-house-procedural-audio.md:165-178`).
- Bundled size is about 2.0 MB per guide (loop plus preview); the seven total about 14 MB.
- A theme is chosen by slug in two places: the recap story and the hatch reveal.
- With no theme:
  - Unknown id: `themeFor` returns undefined (`themes.ts:64-75`) and the engine stops (`apps/mobile/src/motion/music/crossfade.ts:98-101`).
  - Hatch plays nothing (`apps/mobile/src/features/critters/hatch/hatch-screen.tsx:107-109, 181`).
  - The recap story first maps an unknown slug to tokek, so it plays Tokek's theme (`apps/mobile/src/features/recap/story/story-screen.tsx:46-48, 72-77, 108`).
- Notify motifs are rendered for all seven (`render-outputs.ts:73-91`), but no code plays them. Pushes send `sound: 'default'` (`services/worker/src/push/payload.ts:125`).
- `voice.<guide>` cue tokens have no asset.

## 5. Voice

- ElevenLabs is server-side only, for phrase cards and recap narration.
- Phrase cards take `pack.voice_id` from the release-or-repo pack, else the env default (`services/worker/src/jobs/guide/phrase-tts.ts:151-173`).
- Recap narration reads the repo pack only (`services/worker/src/jobs/recap/narrate.ts:102-106`).
- The repo packs hold seven distinct voice ids; guest uses Tokek's. The committed personas batch has `voice_id: null` throughout.
- `guides.voice_id` is editable in the ops console but nothing reads it for TTS.
- On device, `expo-speech` uses the phone's own voice, not a guide's.

## 6. Copy, tests and e2e

- Per-guide message ids: `explore.guide.tokekLine`, `ponLine`, `sardiLine`, `guestLine`, `homeLine`, and `recap.story.theme.<seven ids>`.
- 35 English messages hard-code "Tokek" (one also names Pon), e.g. `plan.ideas.guide`, `plan.check.running`, `home.inbox.caughtUp.line`, `you.pings.guideTipsLine`. They are under `packages/i18n/locales/en/`.
- Other fixed copy:
  - `packages/content/onboarding/tokek-lines.json` (schema pins `guide: 'tokek'`).
  - `packages/domain/src/suppliers/disclosure.ts:10-11` (names Pon).
  - Server default-guide constants, e.g. `services/worker/src/jobs/polls/facts.ts:12`.
- Tests that pin the set:
  - `packages/ai/test/persona.test.ts:29-32, 67-79`
  - `tools/content-factory/test/personas.test.ts:33-41`
  - `tools/content-factory/test/sets.test.ts:8-24`
  - `packages/design-tokens/test/schema.test.ts:142-148`
  - `packages/critter-art/src/kinds/locals/register.test.ts:16`
  - `apps/mobile/src/ui/avatar/__tests__/avatar.test.tsx:62-74`
  - `apps/mobile/src/features/home/__tests__/home-screen.test.tsx:112`
  - `apps/mobile/src/motion/music/__tests__/music.test.ts:41-65`
  - `apps/mobile/plugins/with-critter-art.test.ts:59-77`
  - `packages/db/test/permissions/guides.test.ts:56-64`
- 49 e2e files name a guide. Those keyed on a guide id include:
  - `e2e/explore/fresh-destination.yaml:21-25` (`home-guide-pon`)
  - `e2e/onboarding/splash-name-photo.yaml:10`
  - `e2e/crew/live-map/subflows/scene.yaml:15-19`
  - `e2e/guide/chava.yaml`
  - `e2e/plan/draft-chava.yaml`
  - `e2e/notifications/ios-sender.yaml:23`

## 7. The dex

- Source: `packages/critter-art/src/data/critters.ts:7-157`, generated from `design/critters-data.js` by `packages/critter-art/scripts/import-design-data.ts:89-102`.
- Fields (`packages/critter-art/src/data/types.ts:96-109`): `id`, `no`, `num`, `name`, `species`, `city`, `place`, `code`, `setGroup`, `rank`, `spec`, `kind`.
- `spec` is either archetype params with a colour triplet `c` (144 locals) or `{k}` for the seven hand-drawn kinds, which carry no colours in the dex.
- All 151 have a display name. Names and cities are each unique, and the longest name is 10 characters.
- Database (`packages/db/migrations/20260927230000_content_catalogue.sql`):
  - `critters` at `:105-119`: key, set, no, city, species, art_params, canonical_seed, note.
  - `critter_forms` at `:121-143`.
  - `critter_names` at `:146-158`: locale, name, name_native.
- Names are published for locale `en` only (`writers.ts:69-83`) and are not granted to the app. A user's row gets the name once found (`:357-385`).
- The JS bundle already contains all 151 names through `@cp/critter-art`.
- The content release matches the dex exactly and adds `name_native` for 43 critters (`tools/content-factory/batches/critters/2026-09-30-critters-01.json`).

## 8. What today's code needs that the dex does not give

- **Slug.**
  - Every join, type and file name keys on `guides.slug`. The dex has `id` (`cp-006`) and `name` ("Ngựa").
  - `cp-006` fails the Live Activity guide regex `^[a-z]{2,16}$` (`packages/domain/src/surfaces/la-leave-by.ts:43`) and the `guide:[a-z]+` form id.
  - I checked all 151 dex names: stripping diacritics, spaces and hyphens gives unique slugs that pass that regex. The seven existing slugs equal their folded names.
  - 17 names have non-ASCII letters and 5 have a space or hyphen. The fold is not stored anywhere.
- **Possessive.** None is stored. Messages build it around a placeholder, e.g. `planDraft.review.title` "{guideName}’s draft" (vi: "Bản nháp của {guideName}"), `trip.briefing.title`, `notifications.roundup.title`. Six dex names end in "s" (Fogas, Älgis, Yunus, Petros, Arus, Lanchals).
- **Localised form.** `guides.name` and the pack `name` are single strings. The dex name is Latin script, and the native-script name exists only in the content release. Guide names appear untranslated in catalogs.
- **Voice id.** Not in the dex; see section 5.
- **Music id.** Not in the dex; themes, notify motifs, cue tokens and theme-name strings are all keyed by slug.
- **Accent colour.**
  - `tokens.guide.<id>`, `guides.colour` (seven named values), the pack `colour`, `CardTone` and the Swift palette are a separate accent, not the art fill.
  - Today the accent equals the art fill only for Pon.
  - Of the 144 locals' fills, 19 are near-white and 11 fall below 4.5:1 against `ink.850`, the ratio the token package enforces for guide colours. Ngựa's fill is `#fff1d6`.
- **Persona content.** Tagline, catchphrases, local words, taboos, register, sign-off, home destination slug and AI disclosure have no dex source. Name and species do.
- **Destination link.** No column ties a destination to its critter. The only link is name equality (`places-search.ts:104`) or the set hero.

## 9. What assumes one guide per country

- **Schema.** `critter_sets.guide_slug`, `hero_critter_key`, `destination_id` and `coverage` are per set (`20260927230000_content_catalogue.sql:80-103`).
- **Content.**
  - `places.ts:43-79` (live means has a guide).
  - `place-facts.ts:20-82`.
  - `tools/content-factory/src/kinds/places/sets.ts:78-105, 138-145`.
  - The pack's single `destination` (`schema.ts:44-45, 73-75`).
- **Server readers via `destinations.critter_set_id`** (every city in the set):
  - `close.ts:191-195`
  - `create-trip.ts:96-98`
  - `packages/db/src/pitches/facts.ts:59-60, 223`
  - `places-search.ts:73-83`
  - `apps/mobile/src/features/vote/data/poll-queries.ts:38-39`
- **Readers via `critter_sets.destination_id`** (only the set's one home destination):
  - `apps/mobile/src/features/explore/queries.ts:22-25, 172-173`
  - `apps/mobile/src/features/explore/place-queries.ts:32-33`
  - `apps/mobile/src/features/home/data/home-queries.ts:72-74`
  - `tips/generate.ts:126-130`
- These two joins disagree: Explore shows "Guest guide: Tokek" for Đà Lạt, while a Đà Lạt trip gets Chà Vá.
- **Set hero as "the guide's critter":**
  - `packages/db/migrations/20261001131500_egg_starter_is_the_set_hero.sql:26-34` (egg starter).
  - `hatch-screen.tsx:136`.
  - `apps/mobile/src/features/critters/detail/detail-model.ts:104-107`.
- `iceland` has no critter city of that name; Lundi's city is Reykjavík.

## The list

**(a) Could stay as is**
- The in-app sticker renderer and dex registration.
- `trips.guide_id`, the `guides` table and every reader that passes slug and name through as data.
- Messages that take `{guideName}`.
- The `persona_packs` table, view and release loader.
- The music engine and the synthesis core.
- Tokek as the no-trip default: onboarding lines, the six-guide avatar picker, Settled Tokek, the feedback faces.

**(b) Must become data-driven for a per-city guide with no app change per guide**
- The destination-to-critter link and guide assignment, now per set.
- Guide row creation, which is migration or seed only.
- The slug lists: mobile `GuideId` types, `GUIDE_DEX_IDS` and the Tokek fallbacks; `personaIdSchema`, the static `REPO_PACKS` and the 19 direct readers; `PERSONA_KEYS`, the 7-pack rule and canonical colours; the web slug map.
- Colour: the token keys with their build-time `onPaper`, the DB CHECK and enum, and the card tones.
- Per-guide copy switches (hero lines, theme names) and the hard-coded "Tokek" where the trip's guide is meant.
- Music selection by static import.
- The voice id source.
- The meaning of `coverage` and `is_guest_guide` once every city has its own guide.
- The name-hidden-until-found rule.

**(c) Needs a native build**
- Live Activity guide art and tint: the Swift switch plus the embedded imagesets.
- Any colour art of a local on widgets, the notification default face, the Android alarm screen or the App Clip. None is baked today.
- Alternate app icons.
- Not native: in-app stickers, tokens, copy, personas. Music and SFX are Metro asset imports; I did not verify whether an EAS Update alone can carry new ones.

## Existing gaps seen on the way

- `notify-chava` is baked but not copied into `apps/mobile/assets/sfx`.
- The personas batch rule needs exactly 7 packs while `PERSONA_KEYS` has 8, so a regenerated batch fails. Chà Vá has no published pack.
- `apps/mobile/src/features/crew/chat/components/chat-screen.tsx:93` passes `guides.colour` (a name such as `cream`) as a colour value.
- `apps/mobile/src/features/plan/trip-map/use-trip-map-data.ts:47` draws Tokek for Chà Vá trips.
- `useGuideSkin` has no callers.
- The `/g/{slug}` link is routed to `/explore/<slug>` as a destination ref (`apps/mobile/src/lib/links/route-map.ts:66-67`).

## Unresolved questions

1. Every critter has its own city, so dex-named city guides make all 151 names public. Does the hidden-until-found rule (and the guest pack's "never name a local" taboo) remain for anything but form names?
2. Is the guide's accent colour the dex fill, given the 19 near-white and 11 low-contrast fills, and that the seven hand-drawn kinds have no dex colours?
3. Do existing trips keep their current guide row, or move to the city's critter?
4. Do the 62 critters with no wave/cheer limb pose (Ngựa included) ship as guides with face flourishes only, as Sardi and Paco do now?
5. What does a guide without a voice id or theme get: the env default voice and silence, or Tokek's?
6. How were the six original guide rows created in production? I found only the dev seed and the demo world.

**Status:** DONE_WITH_CONCERNS
**Summary:** All seven areas plus the two coordinator additions are mapped with paths and lines at origin/main a469b71e. Dex names, cities and art cover all 151; the slug, accent colour, persona content, voice and music have no dex source.
**Concerns:** The name-reveal rule conflict and the dex colour gaps need a founder call. The OTA claim for audio assets and the production origin of the six guide rows are unverified.
