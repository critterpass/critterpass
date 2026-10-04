---
phase: 9
title: Search, plain words, add from a link, and offline search
status: in review
depends_on: [1, 3, 4, 5, 6]
wave: 3
screens: [7d-1, 7d-2, 7d-3, 7d-4, 7i-2]
tasks: 10
gate: T4's platform list follows the founder decision "Link import and screenshots"
owns:
  - apps/mobile/src/data/places/**
  - apps/mobile/src/features/explore/search/**
  - apps/mobile/src/app/(trip)/[tripId]/search/**
  - services/api/src/places/{search,routes}.ts
  - services/api/src/planning/{search,imports}/**
  - services/api/test/planning/{search,imports}/**
  - services/api/test/places/search.db.test.ts
  - packages/suppliers/src/social/**
  - packages/i18n/locales/{en,vi}/explore/search.*
  - e2e/explore/{search,plain-words,link-import,no-results,offline-search}.yaml
mount_points:
  - apps/mobile/src/features/setup/must-dos/{search,more-places,more-places-section}.ts(x) (import the shared search and "More places" from data/places)
  - apps/mobile/src/features/guide/chat/{register.ts,components/guide-sheet.tsx,data/use-guide-turn.ts} (question prefill; durable offline queue)
  - services/api/src/planning/register.ts, apps/mobile/src/features/planning-register.ts (one line each)
  - docs/api-contracts-planning.md, docs/undesigned-states.md, docs/system-architecture.md §4.9 (social link readers row)
---
# Phase 9 — Search, plain words, add from a link, and offline search

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D6 (no Google), D24/D25 (Foursquare live search is display-only "More places"; a pick saves only our own open-data POI), D23 (no web search here), D8/C47 (guide meter, queued question), D12 (offline), Q-30 |
| Founder decision | "Link import and screenshots" (plan.md): platforms, fields, copy, Gemini fallback |
| Code | `services/api/src/places/search.ts:24,27,33,38,132` (filters today: q, near, category, destinationId, openAt, limit), `routes.ts:66`, `live-search.ts:114`, `live-resolve.ts:74,155`; `apps/mobile/src/data/places/{usePlaceSearch,offlineSearch,useRegionPack}.ts` (online or offline, never merged; FTS on `name` only, likely no Vietnamese folding; region pack indexes 50 places); `features/plan/day/{place-search.ts:35,46, server-place-search.ts:81,123, use-add-search.ts}` (accent fold + merge); `features/setup/must-dos/{search.ts:102, more-places.ts:67,100}`; `features/launch/PasteLinkOffer.tsx:42,52` and `bookings/paste/PasteSheet.tsx:50,68` (`ClipboardPasteButton`); `apps/mobile/modules/cp-ocr`; `features/guide/chat/data/use-guide-turn.ts:35,113,126` (offline questions held in memory only) |
| Renders + captions | 7d-1 "The same field opens from the map, the plan's add bar or a place, already scoped to where you came from. A link on the clipboard shows up on top before you type. The examples are typed out by Tokek one after another, then sit still." · 7d-2 "Removing a chip reruns the search and the list reshuffles in place. The plan is part of the question" · 7d-3 "places tick in one by one as he matches them. One he can't pin stays orange and asks. SAVE drops the two into Ideas with a small hop on the Ideas count." · 7d-4 "Each way out says what you'd get before you tap it … ASK hands the question to Tokek as a chat that reads crew plans." · 7i-2 "Search falls back to name and category over everything saved … The queued question sends itself at the first bar and the answer arrives as a ping; the banner flips green with BACK ONLINE." |

## Overview

Goal: one search that starts from wherever you are (map, day, place, Explore), takes a name, plain words or a link, explains what it understood, always offers a way out, and keeps working from what's saved when there's no signal.

Done when: name search merges phone and server results with accent folding (Vietnamese included); a plain-words question shows editable chips and fit lines; a TikTok, YouTube or Maps link and a screenshot turn into places saved to Ideas; empty results offer counted ways out; airplane mode returns saved and curated places and a queued question is answered as a ping at the first bar; device sheets match 7d-1…7d-4 and 7i-2.

## Requirements

### 7d-1 Search

| Area | Behaviour |
|---|---|
| Route | `(trip)/[tripId]/search?scope=map\|day\|place\|explore&day_id&poi_id`, registered `7d-1`; keyboard up; placeholder "Search {destination}, or ask {guide}" |
| Scope | map → the area in view; day → that day (fit lines for it; adding goes to it); place → near that place; explore → the destination |
| Clipboard | Android: a link read on focus shows the card (platform icon, URL, post title from the preview route). iOS: `hasUrlAsync` (no paste banner) shows the card with a system paste button; after paste, the URL and title appear (undesigned variant). ADD FROM IT → 7d-3. A link already imported is not offered again (MMKV hash) |
| Examples | Three destination-specific plain-words examples typed out by the guide one after another (blink caret), then still; tapping one runs it |
| Browse | Category tiles → places list (`7c-3`) with that category |
| Typing | Live name results (phone first, then server, then "More places" from Foursquare when fewer than five, display-only) |

### 7d-2 Ask in plain words

| Area | Behaviour |
|---|---|
| Parse | Submit → `POST /v1/trips/{id}/search/parse` → chips "TOKEK READ IT AS" (each removable ×) + note from `exclude_reason` ("Wednesday's already Locavore, so I looked at your other nights.") |
| Results | "{n} PLACES" + LIST/MAP (MAP opens `7c-1` in results mode with these filters); `PlaceRow`s with fit lines ("Fits Mon, your first night"); + opens 7f-1; "3 more, louder or further ›" lists results that break a soft chip |
| Chip removed | Reruns the search without that filter (no model call); rows reshuffle in place |
| Failure | Parse declined/invalid/busy → name search with the whole text, no chips |

### 7d-3 Add from a link

| Area | Behaviour |
|---|---|
| Sheet | Rises with the post cover (thumbnail when the platform gives one), "FROM A TIKTOK/YOUTUBE/…", title, author; the guide's line in truthful words per the founder decision ("I read it." when only text was read) |
| Matches | Places tick in one by one from SSE events: sure (✓ SAVE ✓ toggled on), ambiguous (orange ? "PICK ONE" → chooser of up to 3), unknown ("Couldn't find it" with a search link) |
| Tip | One guide line from the matched places' fit/best time ("Light beams only show 9 to 10 on a clear morning. Your free Saturday works.") — template from reason codes and editorial best time |
| Actions | "SAVE {n} TO IDEAS" → `save_idea` per place (source `link`, `source_url`) + hop on the Ideas count; "Or put them on {day}" → adds them on the best shared day (organiser applies, member proposes) |
| Screenshots | "WORKS WITH INSTAGRAM, MAPS, YOUTUBE AND SCREENSHOTS"; a screenshot button opens the photo picker → on-device OCR (`cp-ocr`) → same pipeline as text; no image leaves the phone unless the Gemini fallback is approved and the image has no text |

### 7d-4 No results

Guide floats in thinking; "NOTHING LIKE THAT NEAR {AREA}"; one explanatory line from the relax data; ways out with what each returns before tapping: widen the time ("WIDEN TO 1H30 · 3 places, all in Seminyak or Canggu"), a related category ("TRY JAPANESE INSTEAD · 4 places in Ubud, 2 open late"), "DROP A PIN · Add a place Tokek doesn't know yet" (pin-drop sheet → `save_idea{pin}`); "Or ask me…" ASK → guide chat with the question prefilled (a guide question, metered as today).

### 7i-2 Offline

Banner "NO SIGNAL · WORKING FROM WHAT'S SAVED"; search over crew ideas and the curated places on the phone by name and category (folded); "OFFLINE RESULTS · {n}" with the nearest area name; "From your {n} saved places and the {m} Tokek saved for {destination} on {date}" (date = the trip pack's last sync); rows with walking minutes from you (straight-line estimate, needs location; else from the day's current stop), "open, as of {date}" from synced hours, a tag line; plain words → queued card "QUEUED · 1"; WORKS OFFLINE chips (the plan, downloaded maps by name, bookings, places count, "TOKEK'S CHANGES WAIT"); first bar → the question sends, banner flips "BACK ONLINE · TOKEK ANSWERED" when the answer lands, push ping.

Reuse / extend / new: reuse accent folding (`foldPlaceText`), the phone/server merge, `More places` + live resolve (D25), region packs, `ClipboardPasteButton`, `cp-ocr`, guide chat and its queued-answer worker; extend server search (filters, fit, relax), the guide route (question prefill) and the offline question queue (durable); new search sheet, plain-words results, link import pipeline and sheet, no-results ways out, offline results card and chips.

## Architecture & contracts

| Kind | Delta (`api-contracts-planning.md`) |
|---|---|
| Route delta | `GET /v1/places/search` adds `trip_id`, `categories[]`, `attrs[]`, `open_past`, `max_minutes{from: stay\|poi:{id}\|day:{id}, minutes}`, `exclude_day_ids[]`, `price_max`, `fit=1` (fit summary per result), `relax=1` (`ways_out[{kind: widen\|related\|pin, label_params, count, areas[]}]`), `soft_misses[]` ("louder or further") |
| Route | `POST /v1/trips/{id}/search/parse` `{q}` → `{filters, chips[{code, params}], exclude_reason?{code, params}}` · fair use `search_parse` · kill switch → `{filters:{text:q}}` |
| Route | `GET /v1/imports/preview?url` → `{platform, title?, author?, thumb_url?}` (oEmbed only, no model) · no-store |
| Route | `POST /v1/trips/{id}/imports` (SSE) `{url}` or `{text, kind: screenshot}` → events `source{platform, title?, author?, thumb_url?}`, `match{label, poi_id, name, meta, fit_best?}`, `ambiguous{label, candidates[≤3]}`, `unknown{label}`, `done{matched, ambiguous, unknown}`, `error{code}` · fair use `link_import` · nothing stored (post text, titles, OCR lines live only in the request) |
| Readers | `packages/suppliers/src/social/{tiktok,youtube,instagram,maps}.ts` per the founder decision: TikTok oEmbed (caption, author, thumbnail); YouTube oEmbed + Data API `videos.list` (title, description, duration, views; `YOUTUBE_API_KEY`); Instagram oEmbed (fields it returns; none → `needs_screenshot`); Google Maps full URLs parsed for name + point without a request; short links per decision; Apple Maps `q`/`ll` parsed |
| Matcher | `services/api/src/planning/imports/match.ts`: fold-name + category + area scoring inside the destination; sure ≥ 0.85 and unique; ambiguous when 2–3 candidates within 0.1; unknown → D25 live search, a pick saves our open-data POI or says it can't be saved |
| App store | MMKV: imported-link hashes; durable offline guide questions per thread |

## Tasks

### T1 — One place search on the phone
- Goal: every search box uses the same folded, merged, offline-aware search.
- Files: `apps/mobile/src/data/places/**`, mounts in setup
- Steps: 1. Bring `foldPlaceText`/`matchPlaces`/merge into `data/places` (the old add sheet's copies go with the sheet in phase 14) and move "More places" out of setup. 2. Offline: fold-match over synced curated POIs + idea display copies (≤ ~1,000 rows, no FTS needed); keep `offlineSearch.ts` for region packs only if still used, else delete. 3. Scope and counts for 7i-2.
- Tests: `pnpm --filter @cp/mobile test -- data/places` ("cafe" finds "Café", "da nang" finds "Đà Nẵng", ideas outrank curated, offline counts)
- Done when: must-dos search runs on the shared search with unchanged device flows (the old add sheet keeps its copy until phase 14 deletes it with the sheet).
- Status: done — ff2057000

### T2 — Server search: filters, fit, ways out
- Goal: plain-words filters and "what you'd get" counts.
- Files: `services/api/src/places/{search,routes}.ts`, `services/api/src/planning/search/{digest,filters,relax}.ts`, `services/api/test/places/search.db.test.ts`
- Steps: 1. Filters (attrs from editorial tags and categories; `open_past` via `openSpans`; `max_minutes` via planning travel on the top 50). 2. `fit=1` via the fit service. 3. Relax: next time tier with count and area names; related-category map with counts; pin always. 4. Soft misses.
- Tests: `pnpm test:remote @cp/api -- places/search.db`
- Done when: the 7d-2 and 7d-4 fixtures return the render's counts on the Bali seed.
- Status: done — f6f930542

### T3 — Parse route
- Goal: plain words → chips with plan context.
- Files: `services/api/src/planning/search/{parse-route,digest}.ts`, `services/api/test/planning/search/**`
- Steps: 1. Digest (days, booked meals, stay). 2. Call `search.parse` (phase 6); validate; fair use; kill switch. 3. Exclude-reason codes.
- Tests: `pnpm test:remote @cp/api -- planning/search/parse` (recorded model fixture; busy → name search)
- Done when: "quiet dinner near the villa, open late" yields the five chips of 7d-2 on the Bali seed.
- Status: done — 4be07d005

### T4 — Link import pipeline
- Goal: a link or screenshot text → matched places, streamed.
- Files: `packages/suppliers/src/social/**`, `services/api/src/planning/imports/**`, `services/api/test/planning/imports/**`
- Steps: 1. URL classifier + readers per the decision (recorded fixtures, timeouts, per-user rate limit). 2. `links.extract_places` (phase 6) on post text or OCR lines; Maps links skip the model. 3. Matcher + D25 fallback. 4. SSE events; nothing written.
- Tests: `pnpm --filter @cp/suppliers test -- social`; `pnpm test:remote @cp/api -- planning/imports` (event order, ambiguous swing case, a post about another city, no table writes during an import)
- Done when: the balibites fixture yields Tukad Cepung and Tibumana sure and the swing ambiguous with 3 candidates.
- Status: done — 607b785ec

### T5 — Search sheet (7d-1)
- Goal: the scoped field with clipboard, examples and browse.
- Files: `apps/mobile/src/features/explore/search/{search-screen,clipboard-card,typed-examples,browse-grid}.tsx`, `apps/mobile/src/app/(trip)/[tripId]/search/index.tsx`, `packages/i18n/locales/{en,vi}/explore/search.*`
- Steps: 1. Scope params. 2. Clipboard per platform. 3. Typed examples (reduce motion: shown still). 4. Live name results. 5. Register `7d-1`.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/search/clipboard` (URL classification; already-imported link hidden)
- Done when: opening from the map, the add bar and a place shows the right scope label and results.
- Status: done — 65d2c75c5

### T6 — Plain-words results (7d-2)
- Files: `apps/mobile/src/features/explore/search/{plain-results,chip-row,use-plain-search}.ts(x)`
- Steps: 1. Parse, chips, note. 2. Chip removal reruns without the model. 3. LIST/MAP via `useScreenHref('7c-1', …)`. 4. + → 7f-1.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/search/use-plain-search` (chip removal state machine, stale responses dropped)
- Done when: removing NOT WED brings Wednesday places back in place.
- Status: done — 09bc044ac

### T7 — Add from a link (7d-3) and screenshots
- Files: `apps/mobile/src/features/explore/search/{link-sheet,match-row,pick-one-sheet,use-link-import,screenshot-import}.ts(x)`, `apps/mobile/src/app/(trip)/[tripId]/search/link.tsx`
- Steps: 1. SSE consumer with a reducer. 2. Tick-in animation; PICK ONE chooser. 3. Save to Ideas / put them on a day. 4. Screenshot → `cp-ocr` → text import.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/search/use-link-import` (event reducer: out-of-order, error mid-stream, retry)
- Done when: on device a TikTok link saves two places to Ideas and the Ideas count hops.
- Status: done — 3928c472b

### T8 — No results (7d-4) and drop a pin
- Files: `apps/mobile/src/features/explore/search/{no-results,drop-pin-sheet}.tsx`, guide mounts (prefill)
- Steps: 1. Ways out from `relax`. 2. Pin-drop sheet → `save_idea{pin}`. 3. ASK → guide chat with the question in the composer (guide route gains `q`).
- Tests: none beyond typecheck (layout); the flow covers it
- Done when: each way out returns what its row promised.
- Status: done — 0bf09a50d

### T9 — Offline search and the queued question (7i-2)
- Files: `apps/mobile/src/features/explore/search/{offline-banner,offline-results,works-offline-chips,use-queued-plain-question}.ts(x)`, `features/guide/chat/data/use-guide-turn.ts` (mount)
- Steps: 1. Offline results with counts, date, walking minutes, "open, as of". 2. Durable guide question queue (MMKV) used by search and chat. 3. First bar → send; answer → banner flip + ping.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/search/use-queued-plain-question` (survives an app kill; sends once)
- Done when: in airplane mode the render's search returns saved coffee places; reconnecting answers within 2 min.
- Status: done — 84975696d

### T10 — Device flows and undesigned states
- Files: `e2e/explore/{search,plain-words,link-import,no-results,offline-search}.yaml`, `docs/undesigned-states.md`
- Tests: `gh workflow run device.yml --ref <branch> -f platform=android -f build_url=<e2e-test APK> -f flows="e2e/explore/search.yaml,e2e/explore/plain-words.yaml,e2e/explore/link-import.yaml,e2e/explore/no-results.yaml" -f mode=compare -f pr=<n> -f shards=1`; second dispatch for `offline-search.yaml`; iOS once for `search.yaml` and `link-import.yaml` (keyboard, paste control)
- Done when: sheets reviewed; `ui-reviewed` applied.
- Status: done — 15a2950a1 (sheets on #618; waits for ui-reviewed)

## Device flows

| Flow | Platform | Covers |
|---|---|---|
| `e2e/explore/search.yaml` | Android + iOS | 7d-1 scopes, typing, browse; iOS keyboard band |
| `e2e/explore/plain-words.yaml` | Android | 7d-2 chips, removal, LIST/MAP |
| `e2e/explore/link-import.yaml` | Android + iOS | 7d-3 clipboard (iOS paste control), sure/pick one, save to Ideas, screenshot |
| `e2e/explore/no-results.yaml` | Android | 7d-4 ways out, drop a pin, ASK |
| `e2e/explore/offline-search.yaml` | Android | 7i-2 airplane mode, queued question, back online |

## Phase acceptance criteria

- [ ] T1–T10 done-when checks pass.
- [ ] No post text, title, OCR line or Foursquare attribute persisted (server test + app storage test).
- [ ] Every new screen and must-dos use the shared place search (the old add sheet's copy goes in phase 14).

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| Platform terms change (Instagram oEmbed fields, TikTok rate limits) | M × M | readers behind `imports.platforms` config; a disabled platform asks for a screenshot instead |
| OCR misses stylised TikTok text | M × M | screenshot path asks the user to pick from candidates; Gemini fallback if approved |
| iOS clipboard prompt annoys | M × L | `hasUrlAsync` + paste control: no read without a tap |
| Plain words feel slow | M × M | name results first; chips arrive after; kill switch |
| Offline walking minutes wrong in hills | M × L | labelled straight-line estimate; only shown offline |

## Migration (existing users' data and screens)

Must-dos search moves onto the shared search with no behaviour change; the old add sheet keeps its own search until phase 14 removes both. In-memory queued guide questions become durable (nothing to migrate: in-memory queues do not survive today).

## Undesigned states to log

iOS clipboard card with a paste button; clipboard title line (post title instead of a model summary before the user taps); typing results; parse busy/declined (no chips); unsupported link; private or deleted post; nothing found in a post; screenshot with no readable text; pick-one chooser; drop-a-pin sheet; "crews rate" copy before community ratings exist (uses "that Tokek rates"); offline with no location (minutes from the day's current stop); offline with nothing saved; back online without an answer yet.

## Open questions

1. Plain words while online but the trip has no plan yet: default parse without day context (no exclude chips).
2. Should a queued plain-words question count against the 30/day meter? Default yes, it is a guide question (founder decision "Metering").
