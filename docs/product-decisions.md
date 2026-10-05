# Critterpass: product decisions

Status: working contract for all 54 phases. Date 2026-09-26. Owner: founder.
Sources: master synthesis §0/§8/§11 (`plans/reports/design-analysis-260926-1143-master-synthesis-report.md`), subscriptions, off-app surfaces, design-system and render-engine reports, native/monetisation fact-check, supplier report (`researcher-260926-1649-travel-supplier-apis-report.md`), custom backend report (`researcher-260926-1649-custom-hono-backend-report.md`).
Companion: [design-system.md](design-system.md).

Precedence when sources disagree: **§1 decision log > §2 contradiction resolutions > master report > slice reports > design files**. The master's §12 release slicing (R0–R6), "MVP variants", stubs and fakes are **void**. Supabase mechanisms in older reports map to the custom stack (§1 D4).

---

## 1. Decision log (final; do not reverse)

| # | Date | Decision | Rationale |
|---|---|---|---|
| D1 | 2026-09-26 | Solo founder + Claude Opus 5.5 coding agents; all 192 features, one public launch; no time or session estimates: phases are sized by task count; tasks are verifiable checkpoints and one agent pass may cover several tasks or phases | One coherent launch; agent tasks need clear file ownership and done-when checks |
| D2 | 2026-09-26 | iOS + Android at launch with full parity where policy allows; iOS 26 min; Android target API 36, Live Updates gated 36+, MetricStyle 37+ | iOS 26 brings AlarmKit, scheduled LA start and widget push; crews are mixed-platform |
| D3 | 2026-09-26 | Expo SDK 58 / RN 0.88 (New Arch, Hermes), TS strict, expo-router, Reanimated 4.7, Worklets 0.13, RNGH 3, Skia 2.13, VisionCamera; SwiftUI extension targets; Kotlin Android surfaces; Xcode 27 + UIScene | One TS codebase with the critter core; native surfaces written natively |
| D4 | 2026-09-26 | Own backend: Hono 4.13 / Node 26 on Railway SG (api + worker); Postgres 18 on PlanetScale HA (ap-southeast-1); Drizzle; app-layer authz + RLS backstop; Better Auth 1.7; Centrifugo v6 + Redis 8; self-hosted PowerSync; pg-boss; R2 + media Worker; APNs + FCM; pgvector/FTS/pg_trgm. Never Supabase | Lowest lock-in, full control over authz, sync and jobs; spikes S-AUTH / S-SYNC / S-DB de-risk it |
| D5 | 2026-09-26, amended 2026-09-27 | Claude for all generation: Haiku 4.5 (chat, voice, quests, parsing), Sonnet 5 (workhorse), Opus 5.5 (itinerary skeleton). **Amendment:** typed decisions (closed label set, yes/no probability, rubric score) may run on TypeSafe Jev `jev-1.13.0` with a Haiku fallback of the same shape, starting with the shared input compliance check ([decision](decisions/20260927-jev-decision-model.md)). Guide only proposes ChangeSets; all numbers come from code. promptfoo evals (Jev routes included), Langfuse traces; STT → Haiku → ElevenLabs Flash; OCR boxes + Sonnet | Persona quality, a single eval surface, deterministic money and times; Jev is ~25× cheaper and ~250 ms on classifiers with calibrated confidence |
| D6 | 2026-09-26 | MapLibre + hand-drawn style + OSM PMTiles; curated POI DB (FSQ OS + Overture + editorial) + Foursquare live checks; Valhalla + Mapbox Directions; Open-Meteo; AeroDataBox + FlightAware; Travelpayouts; Frankfurter; BestTime. No Google | Licences allow LLM use of our own POI data; brand map style |
| D7 | 2026-09-26 | Pass+ $3.99/mo, $29.99/yr; Trip Boost ~$12 consumable (split as ledger IOUs only); FTF; Crew yearly; Offer/gift codes; restore. RevenueCat + own entitlement service. Server-driven perk lists; silent fair-use caps; no web checkout | Matches designed economy; store-compliant; server stays source of truth |
| D8 | 2026-09-26 | Free guide limit 30 questions/day, server-configurable, reset 00:00 device tz | As designed (4b-1) |
| D9 | 2026-09-26 | Content: 6 live guides + guest guide, 150 locals × 4 forms across 61 places, legendary windows; LLM content factory with schemas, validators, render review, founder approval | Full collection at launch needs a pipeline, not hand art |
| D10 | 2026-09-26 | Never merchant of record. Stays via affiliate links (Agoda, Trip.com, Booking.com via CJ through Travelpayouts); no room holds anywhere; Viator Full + Booking in-app for activities (real holds); Klook/GYG links; Grab Farefeed + deep link for rides; no flight booking; supplier content verbatim, uncached, never fed to the LLM; commission-neutral ranking; vendor WhatsApp only after user approval; lotteries = reminders; clinics = human handoff. Partner API adapters built behind flags | Truthful copy; no PCI or travel-licence exposure |
| D11 | 2026-09-26 | Undesigned flows (~22) and missing states are designed in code by agents using the design system; founder reviews in the running app | No designer on the build loop |
| D12 | 2026-09-26 | PowerSync local-first for all crew and trip data (self-hosted) | 3k-4 "sends when you're back" promise |
| D13 | 2026-09-26 | Location: trip-day When-In-Use session default, optional Always upgrade; POI-level visits with TTL; never raw GPS trails | Privacy promise + platform rules |
| D14 | 2026-09-26, amended 2026-09-28 | Phone OTP via Better Auth phoneNumber, allow-listed countries; start Vietnam brandname registration now. **Amendment:** channel order is the WhatsApp authentication template, then Telegram Gateway ($0.01 per delivered code, refunded when not delivered; one `sendVerificationMessage` per sign-in, never a charged `checkSendAbility` first), then SMS through Prelude for every allow-listed country. Each channel is skipped when its credentials are absent or its `otp.<channel>.enabled` switch is off, and a failed send falls through to the next. Twilio Verify is dropped for cost | Cost and deliverability in SEA |
| D15 | 2026-09-26 | First-party deep links: Universal Links + App Links on `critterpass.app` and `go.`, Play Install Referrer, iOS paste control, 6-char join code; App Clip allowed if iOS deferral is poor | No Branch/Firebase DL dependency |
| D16 | 2026-09-26 | Web: Astro 7 on Cloudflare Workers + R2; Tips as MDX; OG images from prerendered critter atlas + Takumi | Edge-cheap, static-first |
| D17 | 2026-09-26 | pnpm + Turborepo; EAS Build/Submit/Update/Workflows; GitHub Actions; Maestro; Vitest, Jest + RNTL, Playwright, Testcontainers; PostHog EU; Sentry; OTel → Grafana Cloud; Langfuse; Lingui + Tolgee; Resend; print-on-demand postcards | Standard, agent-friendly tooling |
| D18 | 2026-09-26 | Singapore controller entity (assumed), data in Singapore; counsel review is a non-code workstream | Avoids VN transfer filing; SEA latency |
| D19 | 2026-09-26 | Master C1–C48 are the working contract, except where D10 supersedes (holds, bookings); canonical guide colours per C5 | Settled once; agents do not relitigate |
| D20 | 2026-09-26 | Domain `critterpass.app` is an assumption (confirm) | Needed for links, AASA, email |
| D21 | 2026-09-27, amended 2026-10-04 | Amends D6 on cost: weather and marine forecasts come from WeatherAPI.com (free plan in development and staging, Pro+ before launch), not Open-Meteo; hourly venue crowds wait for a source cheaper than BestTime, so crowd surfaces show the editorial month curve only; routing is Mapbox Directions/Matrix at launch behind the routing provider, with self-hosted Valhalla as the later swap ([decisions index](decisions/README.md)). **Amendment (2026-10-04, plan `261003-2300-planning-places-v2`: "Decided 2026-10-04 00:32 (founder: "all recommended")"):** planning routing moves to self-hosted Valhalla now: every planning surface (stored legs, the plan check, reordering, fit) uses Valhalla built from destination boxes, whose ODbL results may be stored and synced, with a per-destination `drive_factor` instead of live traffic; Mapbox stays for live day-of ETAs only, and no Mapbox result is ever stored. Hourly crowds come from editorial typical-week curves for curated places (content factory, approved in the ops console before any client sees them) × the month's crowd index, plus our own opt-in visit counts once five or more crews visited (C5 aggregate); copy names the source ("usually busy from 10" for editorial, "what crews saw" only for visit counts) | Open-Meteo's commercial plan and BestTime's packages cost more than this stage justifies; WeatherAPI.com covers hourly/daily forecast, UV, chance of rain, waves, swell, sea temperature and tides in one API |
| D22 | 2026-09-28 | Amends D5: DeepSeek is the generation provider in every environment, called through its Anthropic-compatible API with explicit DeepSeek model ids: a fast tier and a pro tier replace Haiku, Sonnet and Opus. Gemini is the fallback candidate if DeepSeek falls short, added behind the same gateway only when needed. Typed decisions stay on Jev, with the DeepSeek fast tier as their fallback. Nothing may depend on Claude-only features: batch AI jobs run as direct calls, and web search is our own tool backed by a search API (Tavily first, Brave as the second adapter). Wherever older docs or phase files name Claude, Haiku, Sonnet or Opus, read the DeepSeek tier with the same role. The eval thresholds remain the quality bar | Founder decision on cost and provider choice |
| D23 | 2026-09-28, amended 2026-10-04 | Web search scope for our own `web_search` tool (D22). **Uses:** the guest brief (26), the forecast watch (37), legendary windows (18), guide chat (32; in crew chat only when the guide is @mentioned), season events research (15), opening-hours research (18) and the pre-draft closure check (28). **Never:** SOS or emergency info at runtime, supplier offers, prices or reviews, finding or vetting people, medical, allergy or menu answers, or personal visa answers. Queries carry places, dates and topics only. Web facts keep their source link and stay cite-only: never in plan changes, costs or structured outputs. Tavily's developer tier is used during development; a DPA or zero-retention agreement is obtained before launch. **Amendment (2026-10-04, plan `261003-2300-planning-places-v2`: "Decided 2026-10-04 00:32 (founder: "all recommended")"):** place facts research joins the uses: entry fees, what to wear and know-before-you-go facts for curated places follow the opening-hours research pattern (cited, approved in the ops console before storage), and once approved they are our own place facts, shown on the place page with their source; a fact nobody approved is not shown | Fresh facts the curated data can't hold, with the privacy and supplier rules intact |
| D24 | 2026-10-03, amended 2026-10-04 | Amends D6 on Foursquare: place details (open now, permanently closed, weekly hours, price level, rating, up to 5 photos, up to 3 tips, website, phone) come from the Foursquare Places API, fetched live per place-detail open through `GET /v1/places/{id}/live` and **never stored** on our servers, in `pois`, in `guide_reader` views, in LLM context or in the app's persisted caches; `GET /v1/places/{id}` stays our own data. Curated POIs that open data did not link get a Foursquare id from a name search around their point (`places.fsq_match`, monthly; only the id is kept). Every call counts against one monthly cap shared by the api and the worker (`FOURSQUARE_MONTHLY_CALL_CAP`, default 4,000 ≈ $75 at the Premium rate); at the cap details read as unavailable. Foursquare's popularity score is not shown. Our own hours stay the researched, console-verified `pois.hours`. Google stays out (D6). Terms: the [Usage Guidelines](https://docs.foursquare.com/fsq-developers-places/reference/usage-guidelines) allow "fsq_place_id: unlimited caching (solely to improve the performance of your application)", "Photo IDs: unlimited caching", and for all other attributes "Pay as You Go & Sandbox Customers: no caching permitted" (Enterprise: "24-hour local-device caching only (no server-based caching is permitted)"); the [Places API EULA](https://foursquare.com/legal/terms/apilicenseagreement/) §2.1 binds those rules, §2.2 requires "branded attribution (i.e., 'Powered by Foursquare') on any page or screen within Your Service where Places Data may appear", §2.3 keeps "Calculated Scores" and reliability metrics internal, and §2.5 forbids making Places Data available to third parties except as integrated into our service. **Amendment (2026-10-04, founder):** a place's Foursquare photo ids **and their image addresses** may be stored and reused. The guideline reads "Photo IDs: unlimited caching (solely to improve the performance of your application)"; a photo's image address is `prefix` + size + `suffix` and cannot be derived from its id, and Foursquare confirmed to the founder on 4 Oct 2026 that the address may be kept with the id and reused (the founder holds the written confirmation). So each successful live read (a real open of the place; there is no warm-up that reads photos ahead of use) keeps up to five photos per place in `poi_foursquare_photos` (photo id, prefix, suffix, pixel size, Foursquare's creation time, rank, when fetched), replaced as a set, and the subject media read (`GET /v1/media?include=foursquare`) shows them again on lists, cards and the place page without another call, each with "Powered by Foursquare". One rule decides a place's picture: its own Wikimedia Commons photo, then a Foursquare photo, then a partner's photo, then a labelled generic stock photo, then the category tile. Image files are never copied to our servers. Everything else from the call (open now, hours, price level, rating, tips, website, phone) stays live-only and unstored, exactly as above | Founder found places thin next to Google Maps; Foursquare is the licensed source for hours, ratings and photos, and its Pay as You Go terms allow only live pass-through |
| D25 | 2026-10-03 | More and more varied places. **OpenStreetMap** joins Overture and FSQ OS Places as an open-data source (ODbL, "© OpenStreetMap contributors" in the attribution NOTICE and the map credit): ingest reads the Geofabrik extract covering a destination's place box and takes the sights Overture lacks (`tourism`, `historic`, peaks, waterfalls, beaches, caves, springs, volcanoes, parks, gardens, nature reserves, places of worship, marketplaces, viewpoints) as new POIs, and uses OSM's copy of a business only to fill a matched POI's empty hours, website or phone. OSM `opening_hours` is our first storable hours source: parsed into `pois.hours` where our own hours are empty, with `pois.hours_source = 'osm'`; anything that is not a plain weekly schedule (seasons, sunrise, open ends) stays unknown. **On-demand ingest**: a pitch or a trip in a destination with fewer than 50 active places queues that destination's `places.ingest` once (deduped, retried at most weekly). **Live Foursquare search** is a display-only fallback: when our search finds fewer than five places, the app may ask `GET /v1/places/search/live` (one Place Search call, Pro fields, under the D24 monthly cap) and shows the results in a separate "More places" section with "Powered by Foursquare", served `no-store` and held in memory only. A pick saves only our own open-data POI: the one open data links to that `fsq_place_id`, else the same-named open-data POI at that spot (the match keeps only the id); else the place can be viewed but not saved, and the app says so. Google stays out (D6) | Founder found places thin on the Đà Nẵng trip; OSM is the only open source with travel sights and opening hours at scale, and Foursquare's Pay as You Go terms allow no stored attribute but the id |
| D26 | 2026-10-04 | Truthful copy by source (plan `261003-2300-planning-places-v2`: "Decided 2026-10-04 00:32 (founder: "all recommended")"): every line says what we actually used. A link import reads "I read the post" unless a video was actually analysed; no view counts or durations where the platform gives none (TikTok oEmbed); crowd lines name their source (D21 amendment); lines about what other crews rate or ate wait for community plans data and read as the guide's own pick ("that Tokek rates") until then; place facts show only once approved (D23 amendment) | The section 7 design would otherwise claim sources we don't have |
| D27 | 2026-10-04 | Amends D6 on addresses: place search finds a **street address** through Mapbox Geocoding v6 in permanent mode (`GET /v1/geocode`), as a fallback beside our own places, never a source of them. Mapbox is asked only when the text reads like an address (a number, or a street word), or when six words or fewer found no place of ours and were not read as a plain-words question; after a pause in typing, never offline, limited per user and capped per month (`MAPBOX_GEOCODE_MONTHLY_CAP`, default 2,000; at the cap the answer is our own data only). Only `address` and `street` features are requested. An address row is shown only to the person who searched, with "© Mapbox" and "© OpenStreetMap" under the section, and coordinates are never shown as text. Picking a row opens the DROP A PIN sheet centred on that point with what the traveller typed as the name (the Mapbox line shows only on the row and as the sheet's hint); the traveller confirms or moves the pin, and only that pin and their own name for it are stored and shared with the crew. The Mapbox answer itself is never written to a shared row. Terms ([Mapbox Product Terms](https://www.mapbox.com/legal/product-terms), 21 July 2026): §2.7.3 "Customer may permanently store Permanent Geocodes", but they may be used in the app only if "(i) access to Permanent Geocodes cannot be a primary or significant feature of a Licensed Application but only used to support an ancillary or incidental feature, (ii) a separate API request for a Permanent Geocode shall be made for each End User account that accesses, uses, or relies on such Permanent Geocode in any way, (iii) the Licensed Application shall not allow an End User to sublicense, sell, rent, lease, transfer, assign, disclose, or distribute a Permanent Geocode to any other End User or third party, and (iv) if Permanent Geocodes are displayed in a Licensed Application, latitudes and longitudes may not be made available to End Users"; a plan item or idea syncs to the whole crew, so a stored Mapbox point there would break (ii) and (iii). No Mapbox map is needed: only §2.7.5 ties results to one ("Customer shall not use any POI Results (i) except in conjunction with a Mapbox Map"), and §3.55 defines a POI Result as "any Geocode that is not an Address-Level Geocode or an Area-Level Geocode". §1.4.1 requires the attribution. In Đà Nẵng Mapbox has streets but no house numbers, so "12 Trần Phú" finds the street and the traveller moves the pin to the door. Google stays out (D6) | Founder approved address search: places are venues, so a friend's house or a rental found nothing; the terms allow showing an address to the searcher but not sharing the stored geocode |
| D28 | 2026-10-04 | Amends D25: **any destination plans.** Only a few destinations have a curated (editorial) set; everywhere else the catalogue is open data, and drafting, suggestions and the offline pack read curated places only, so a trip there drafted to nothing but its must-dos. A destination with fewer than 50 active editorial places now gets **machine picks** (`places.pick`, `pois.pick_rank`): the well-known places a model names for it, kept only when our own rows carry them (the model sees the destination's name, never invents a row, and its call is system usage), then the best open-data rows by quality across kinds of place, about 250 in all. "Recommended" is one definition, editorial or picked, shared by every reader. **Curated sets stay the editorial, approved content**: a curated destination gets no picks and behaves as before, picks made before a destination's curated set was published are cleared when it is, picks carry no editorial facts (the guide is told they are unchecked and their hours a guess), and a draft that still has fewer than two candidate places a day says so in its summary line instead of passing a near-empty plan off as a draft. A day the draft left empty can be redrafted |
| D29 | 2026-10-04 | Amends D9 on guides: **every destination's guide is its own city's critter** (founder: "yes each city own critter"; "follow the original critter collection design name"). (1) One guide per dex critter; its name is the critter's designed name, none invented: Đà Lạt's Flower pony (`cp-006`) is Ngựa. (2) The slug is the name folded to plain lowercase letters (`Ngựa` → `ngua`); all 151 are unique and the seven existing slugs already equal their folded names. (3) A city guide's name is public wherever its trip or destination shows, as the seven are; the dex still hides critters of cities a person has no trip to until they are found. (4) The accent colour comes from the critter's own colours, adjusted until it passes the guide contrast rule; the seven keep their token colours. (5) A guide without a written persona pack speaks from a template built from its dex facts (name, species, city, country) in the hedged register used for places nobody has checked; a written pack replaces it once approved. (6) Voice and music: its own when it has one, else the default voice and the theme of its country's themed guide (all of Vietnam plays Chà Vá's), else no theme. (7) Trips that have not started move to their city's critter when the switch turns on; started and finished trips keep their guide. (8) Live Activities, widgets, the Android alarm screen and the App Clip keep the default art for city guides until the next native build. (9) "Guest" keeps meaning "no curated set": the city's critter is still the guide there, and the wording says it is still learning the place, never that it is a guest. Guide rows come from the released critters (`app.sync_critter_guides`), never from a migration per guide; assignment by city is behind the ops switch `guides.per_city` (default off), turned on per environment once the app draws any guide from its row | A fresh Đà Lạt trip got Chà Vá, Đà Nẵng's guide, because a trip took its country's guide; a guide was one of seven slugs in closed lists |
| D30 | 2026-10-05 | Amends D23 on prices. The founder, asked where Đà Lạt's stay prices should come from: "web-search. i think we should try harder on web-search features. at this point i think people know this is AI assisted that not need 100% accurate but an estimation is good enough." **Change:** our `web_search` tool may supply **estimated prices**, starting with a destination's stay prices (`destination_cost_indices`); each estimate keeps its source link, is shown as an estimate, and is approved in the ops console like any other cost index before it is served. Where curated data has nothing, a cited web estimate is preferred to a blank. **Unchanged:** no supplier offers or reviews, no SOS, emergency, medical, allergy, menu or personal visa answers, and queries carry places, dates and topics only | An AI-assisted planner gives a sourced estimate rather than nothing; travellers know it is an estimate |
| D31 | 2026-10-05 | Amends the approval clauses of D23, D26 and D30 (plan `261005-2100-simplify-sync-and-ai-content`). The founder: "get the best quality we can, we wont go to approval route since we dont have enough resource"; "keep open-data place index"; "for offline, we can sync only the most neccessaries data"; PowerSync: "we just use it in the case that need it, just dont want it to be overused". **Change:** place and destination content written by AI with web search is shown without prior approval, labelled as AI-written with its sources; a fact (fee, hours, price, dress) is kept only with a quote on a cited page; reviewed content always wins. The open-data place index stays. Offline, a phone holds only the trip's own places. PowerSync carries the crew's own data and offline writes; shared content is read from the api with a cache | Quality from cited AI at scale without a review queue the team cannot staff; sync only where it is needed |

### 1.1 Supabase → custom stack translation (applies to every older report)

| Older mechanism | Now |
|---|---|
| Supabase Auth (anon, OTP, OAuth) | Better Auth 1.7 in `services/api` (anonymous, phoneNumber, jwt EdDSA/JWKS, admin, expo plugins) |
| RLS as primary authz | Policy functions in command handlers (`packages/domain` + `services/api`); RLS backstop via `SET LOCAL ROLE app_user` + `set_config('app.uid')` |
| Supabase Realtime | Centrifugo v6 + Redis 8; `rt_outbox` relayed by worker; subscribe proxy to api |
| pgmq / pg_cron | pg-boss queues + cron/RRULE schedules in `services/worker` |
| Storage | R2 presigned PUT/multipart + `services/media-worker` HMAC reads |
| Edge Functions | Hono routes (`services/api`) or pg-boss jobs (`services/worker`) |
| PowerSync Cloud | Self-hosted PowerSync Service on Railway SG (fallback: PowerSync Cloud) |
| RPC write | Idempotent command keyed by client UUIDv7 `op_id`; `/sync/upload` runs the same handlers |

---

## 2. Contradiction resolutions C1–C48 (condensed, current)

`[upd]` = changed from master because deferral is void or D10 supersedes.

| # | Topic | Resolution (implement this) |
|---|---|---|
| C1 | Trip status | One `Trip.status` machine + derived `phase` (planning/pre/in/post) + `setup_step` sub-field |
| C2 | Polls | One Poll+Ballot engine, `kind ∈ {destination, generic, day_option, changeset_approval, decision, mvp}`; destination stage board→final; DecisionRequest = Poll(kind=decision) over ChangeSets |
| C3 | ChangeSet vs GuideAction | ChangeSet = proposed plan mutation vs base version; GuideAction = executed side effect with inverse, compensation, audit; GuideOffer = chat offer card |
| C4 | Place vs tier | Entities Destination, CritterSet (`setGroup` 0–3), POI; rarity = common/rare/epic/legendary |
| C5 | Guide colours | Tokek yellow, Pon orange, Lundi blue, Ajo pink, Sardi green, Paco cream (3b-1). `place.color = guide.color`; site aligns |
| C6 | Rare ring | Ring = rarity colour (rare blue `#4f86ff`); card background = form palette |
| C7 | Stamp ink | Trip stamp = destination colour; home stamp = brand orange |
| C8 | Boost scope | 4e-2 is the contract: crew perks + unlimited guide for all members in that trip's context during the window; no mailbox import, no icon styles. Chip copy "UNLIMITED PON" |
| C9 | FTF | Boost + Pass+ for every member until trip end + 7 d |
| C10 | Crew pips | Leave-by pips free ("keeps someone on time"); crew meet-up LA stays Boost |
| C11 | SOS | SOS and Help location sharing always free; remove SOS from Boost copy |
| C12 | Guide voice | Visual guide persona free; voice mode + "Talk out loud" in the 30/day meter (Pass+ unmetered); settings samples free. `[upd]` Pass+ perk = spoken guide read-out of notifications and the evening roundup — **built at launch** |
| C13 | Redrafts | Per trip, shared by drafters; reserve on submit, release on failure; reverted redraft counts; in-trip swaps, weather replans, dropout re-splits free; Pass+ adds none |
| C14 | Countdown | Viewer's first outbound departure, else trip start 00:00 destination tz; one source for Home, hub, widget, LA |
| C15 | Leave-by | `LeaveBy{leaveAt, pickupAt}`; alarm at leaveAt − lead (default 10 min) for members not yet up; alarm UI shows leaveAt |
| C16 | Flight LA | Push-to-start at boarding − 3 h; restart after landing for pickup face |
| C17 | Leave-by LA | 5a-1 canonical |
| C18 | Notification sender | Crewmate = their avatar; guide = guide avatar; feature = category tile |
| C19 | Encounter | Dwell = eligibility (ring fills with dwell, counts in background when permitted); in-camera hold = optional ceremony with accessible alternative; grace + slow drain |
| C20 | Golden Tokek | Any day; season is a hint only |
| C21 | Silhouettes | True silhouettes; names server-side until found |
| C22 | Counts | Dex = distinct locals found; forms counted separately; avatar grid = owned forms |
| C23 | Icons/avatars | Earned critter icons/avatars never gated; default + free styles free; STAMP and future styles Pass+; on lapse only Pass+ styles revert |
| C24 | Money movement | None in-app: PayNow/bank deep links, QR, mark-paid; Terms fixed |
| C25 | Location trail | Per-day route from plan stops + ride legs; check-ins = POI visits (opt-in, TTL); 4f-2 teaser = synthetic replay; policy copy "places you checked in at, never a trail of coordinates" |
| C26 | Seat cap | Trip seats = participants with RSVP ≠ out: 6, or 16 while boosted; crew membership ceiling 16, never seat-capped; RSVP out frees a seat → waitlist offer; CTA shows charged price |
| C27 | Context guide | In-trip trip > next confirmed > proposal/draft trip; one guide per trip thread |
| C28 | Private objections | Never name the person; suppress in crews < 4; passive signals never shown to peers/organiser; own counters self-only. **Amended 2026-10-04 (plan `261003-2300-planning-places-v2`: "Decided 2026-10-04 00:32 (founder: "all recommended")"):** WANT IT / RATHER NOT on a place, with the person's own words, is an explicit public stance, like a named ballot: the crew sees who said it. It is never a private objection and is never derived from a swipe "no", a hidden place or any other passive signal; hidden places stay private to their owner |
| C29 | Wallet tab | Segmented BOOKINGS \| MONEY |
| C30 | Explore | Under HOME and TRIPS; no 6th tab |
| C31 | Itemised receipts | `[upd]` Itemised split (3i-3) ships at launch as designed. Idea-board rows ("packing lists per crew", "leave-by on the Watch") are board content, not scope |
| C32 | Paywalls | Build only 4e-1/4e-2/4e-3 (+4b-1, 4b-3, 4b-5, 4c-*, 4d-*, 4f-*). 4a-* and 4b-2 reference only; fix routing |
| C33 | Token drift | One DTCG source; Archivo widths 62/66/70/78/100 |
| C34 | Invite fixtures | Fixture cleanup; per-person estimate uses invitee origin once known |
| C35 | Demo data | Fixtures only; not product decisions |
| C36 | Crew visibility | §10.4 matrix is the contract; 3n-3 copy: "Your crews see your profile, your pass and what you do on trips together. Your budget, private chats and calendar stay private." |
| C37 | Flight tracking | Flight status, boarding ping and flight LA free for any wallet flight; Pass+ perk = auto-import from email; NEXT FLIGHT widget Pass+; delay auto-fix free (§3) |
| C38 | Special stickers | Separate sticker shelf; not in dex, not forms, not avatars/icons, never sold. `[upd]` Settled Tokek (F-108) and crew-level stickers (F-129/130) both at launch |
| C39 | Home set | Country of home airport; collecting at home needs explicit foreground-only "explore at home" opt-in |
| C40 | Spawn rules | `SpawnRule.kind ∈ {presence, any_of, set_count, window, co_presence}`; "Three water temples" = any_of, copy "At a water temple"; epic always adds pose + pink edge at every size |
| C41 | Approval authority | Poll(kind=changeset_approval\|decision) with `decider_policy ∈ {organiser, any_affected, majority_of_affected, threshold_n}`; `closes_at` ≤ earliest hold expiry. Defaults: money or others affected → majority of affected (organiser breaks ties); time-critical in-trip → any affected + UNDO + notice; personal → self; expiry keeps current plan |
| C42 | Album | Never gated on payment. "Settle up before Sunday. The album's yours either way." |
| C43 | Hold length | `[upd]` No stay holds exist (D10). Builder shows **reply-by** and, per booked stay, "free cancellation until {date}" parsed from the confirmation; reply-by defaults to ≤ earliest free-cancel deadline − 1 d. Only Viator activity holds are real; group votes on held items close before `hold.expires_at` |
| C44 | Draft privacy | Pre-draft fit = feasibility vs dates/hours/skeleton; post-draft members see fits/tight/clash only. `[upd]` No spend or holds on an unsent draft: "I booked it" → "Free-cancel slot found — book it once the crew's in" (link-out) |
| C45 | Help/SOS map | Session-scoped free map (sender pin, responders, walking directions) on any trip; teaser and governor suppressed |
| C46 | Boost window | Purchase → trip end + 7 d; copy "ON NOW · UNTIL {date}" + trip dates separately; FTF starts when first trip enters Setup |
| C47 | Queued question | Reset 00:00 device tz; queued question answered at reset (counts toward new day), passive notification, resurfaced in morning briefing if unread. `[upd]` Anti-abuse: the server accepts at most one meter reset per subject/metric per 20 h regardless of the device-reported tz, so repeatedly changing device tz forward cannot manufacture extra free windows within the same real day |
| C48 | Perks sold vs shipped | `[upd]` Every perk ships at launch. Perk lists stay server-driven (`perk.enabled`) so partner-dependent or broken perks can be withdrawn from copy without an app release (App Store 3.1.2) |

---

## 3. Final entitlement matrix

Prices (store tiers; displayed as the store localises): Pass+ $3.99/mo, $29.99/yr (−37%). Trip Boost $11.99 consumable ("$12" in design copy → show store price). Crew yearly $59.99/yr auto-renewing (design shows $59; confirm tier). FTF free.

**Always free:** voting, planning, splitting money (incl. itemised), offline maps and plan, notifications, community, every critter and sticker, SOS + Help/SOS session map, flight tracking + boarding ping + flight LA for any wallet flight, forward/paste/scan imports, disruption fixes, forecast watch, rerouting, leave-by LA + alarm + crew pips, settings voice samples.

| Capability | Free | Pass+ | Boost (trip) | FTF (crew's first trip) | Crew yearly |
|---|---|---|---|---|---|
| Guide 1:1 text + voice + camera (one meter) | 30/day, reset 00:00 device tz | ∞ (fair use) | ∞ in that trip's context | ∞ all members | buyer ∞ everywhere; crew ∞ on crew trips |
| Guide in crew chat | asker's meter; unmetered if any member has Pass+ | ∞ | ∞ | ∞ | ∞ |
| System guide work (pitch, draft, fit, proposal, briefing, disruptions, quests, recap, Help/SOS) | unmetered (fair use) | – | – | – | – |
| Redrafts per trip (crew-wide) | 3 | 3 | ∞ (fair use) | ∞ | ∞ |
| Seats per trip | 6 | 6 | 16 | 16 | 16 |
| Live crew map, ETAs, meet-up, PING ALL, crew LA, crew widget | – | – | ✓ | ✓ | ✓ |
| Own leave-by LA + alarm, crew readiness pips | ✓ | ✓ | ✓ | ✓ | ✓ |
| Critter-nearby, vote-closing, storm, SOS LAs | ✓ | ✓ | ✓ | ✓ | ✓ |
| Widgets: countdown, vote, Critterdex, Today, Balances, lock-screen | ✓ | ✓ | ✓ | ✓ | ✓ |
| NEXT FLIGHT widget | – | ✓ | – | ✓ | buyer ✓ |
| Mailbox auto-scan import (Gmail/Outlook) | – | ✓ | – | ✓ | buyer ✓ |
| Forward / paste / scan / manual bookings | ✓ | ✓ | ✓ | ✓ | ✓ |
| Flight status, boarding ping, flight LA, delay auto-fix | ✓ | ✓ | ✓ | ✓ | ✓ |
| App icon styles | default + free alternates | all | – | all | buyer all |
| Earned critter icons / avatars | earned | earned | earned | earned | earned |
| Sponsored picks (labelled) | shown | none | none in trip context | none | none |
| Printed postcard (1 per trip, mailed to each opted-in member) | – | ✓ (sender) | – | ✓ | buyer ✓ |
| Voice mode + "Talk out loud" | in 30/day meter | ∞ | ∞ in trip context | ∞ | as guide row |
| Spoken read-out of notifications + roundup | – | ✓ | – | ✓ | buyer ✓ |
| Solo ("Just me") trip | ✓ | ✓ | purchasable | not eligible | covered |
| Kept after end: plan, album, recap, route, critters, stamps | kept | kept | kept | kept | kept |

**Resolution rules** (`packages/entitlements`, pure TS, shared client/server; server authoritative):
- `passPlus(u)` = active store sub ∨ billing grace ∨ cancelled-in-period ∨ gift/promo time ∨ crew-yearly buyer ∨ FTF active on any of u's trips.
- `boostActive(t)` = paid boost window ∨ FTF ∨ crew-yearly covering t's crew.
- `guideUnlimited(u, t)` = passPlus(u) ∨ boostActive(t). `redraftLimit(t)` = boostActive(t) ? ∞ : 3.
- `seatCap(t)` = boostActive(t) ? 16 : 6 over RSVP ≠ out. Crew ceiling 16.
- `helpMap(u, t)` = u in active Help/SOS session on t. `sponsored(u, t)` = ¬passPlus(u) ∧ ¬boostActive(t).

**Silent fair-use caps** (server config `entitlement_limits`; defaults; never shown as a limit; on breach degrade to Haiku, then a neutral "busy — try again in a few minutes" guide line; never a paywall):

| Scope | Default cap |
|---|---|
| Unlimited guide turns / user / day | 300 (voice ≤ 90 min, camera ≤ 60 scans inside it) |
| Guide in crew chat / crew / day | 400 |
| Unlimited redrafts / trip / day | 20 |
| System jobs (drafts, proposals) / trip / day | 40 |
| Album uploads / trip | 5,000 photos, 20 GB |

**Lifecycle overlays:** paused (emulated) = loses unlimited guide + mailbox import + NEXT FLIGHT, keeps icon styles; cancelled = full Pass+ to period end; expired = Pass+ styles revert on next foreground; billing grace 7 d server-side on both stores; boost ended = redrafts, live map and new seats > 6 pause, nobody removed; refund/revoke = entitlement removed, unsettled Boost IOUs voided, settled IOUs untouched (no in-app money movement).

**Products and codes:**
- Crew yearly: auto-renewing; bound to one crew at purchase; buyer leaving keeps crew coverage to period end; buyer may rebind once per period.
- Boost on cancelled trip: credit moves to the crew's next trip; credits never expire (3.1.1); refunds only via store.
- FTF: once per crew; requires ≥ 2 seated participants; one FTF-organised trip per user (anti-abuse via account + verified phone + store account).
- No intro offer or free trial beyond FTF; Family Sharing off.
- Offer codes: partner/promo = App Store Offer Codes + Play promo codes. Gifts = IAP-funded gift purchase (sender flow) → server gift code redeemed in 4d-4. Renewal extension ≤ 90 d.
- Restore: store transactions bound to another Critterpass account → prompt to sign in to that account; anonymous purchases bind on sign-in (uid preserved).

**Paywall governor** (F-159): max 1 unsolicited paywall/day/user; never on day-of screens, Help, SOS (incl. its map), delays, right after an error; quiet no hides that offer for the trip; rating prompt never follows a paywall; explicit navigation exempt; crew cards (4c-1) and pushes (4c-2) count toward the daily cap.

| Entry | Trigger | Offer | Governed |
|---|---|---|---|
| 4b-1 Guide limit | 30th answer of the day | inline card → 4e-1 | yes |
| 4f-3 Last free redraft | submitting a redraft with 1 left | use last / Boost 4b-3 | yes |
| 4f-1 Seven's a crowd | 7th seat via any join path | Boost; else waitlist | yes |
| 4f-2 Live map teaser | open map on unboosted trip | Boost (synthetic replay) | per-trip dismissal |
| 5a-6 Lock screen | "Put this on the lock screen" control on crew map | Boost | yes |
| 4c-2 Free boost ending | push at end − 3 d + recap | Boost next / Pass+ / stay free | yes |
| 3m-9 Postcard | "Mail a real one" | Pass+ | yes |
| 5c-2 / 5c-5 Locked widget | tap locked widget / gallery row | Pass+ / Boost | tap yes; gallery explicit |
| 3n-5, 3n-1, 3n-2 chips | explicit navigation | 4e-1 / 4d-1 | exempt |

---

## 4. Platform-physics adaptations

| Designed | Constraint | What we build |
|---|---|---|
| Tokek walks the LA trail; avatars slide; island pulses yellow (5a-1, 5a-5) | LA/widgets: no continuous animation or JS renderer; iOS 17+ allows built-in SwiftUI transitions on data updates, ≤ 2 s each; ≤ 4 KB payload; 8 h active + 4 h lock screen | SwiftUI LA with baked critter assets; per-update spring/hop transitions ≤ 2 s; progress via `ProgressView(timerInterval:)`, times via `Text(timerInterval:)`; trail position = server push updates |
| Widget flip digits, StandBy breathing gecko, vote poster animation | Same rules; widget push budgeted (~40–70/day) | Static + update-transition variants; timeline entries; animated vote poster only in the Notification Content extension (arbitrary views allowed) |
| Full-screen custom leave-by alarm (5b-3) | iOS: AlarmKit alert UI is system-rendered (title, system stop, one secondary intent available only after first unlock) | iOS: AlarmKit with guide-tinted title + "I'M UP" secondary; Tokek art in the alarm LA/Dynamic Island countdown. Android: full-screen-intent Activity with the designed UI when `SCHEDULE_EXACT_ALARM`/FSI granted; else high-priority notification + Live Update; no background alarm audio without the grant (Android 17) |
| LAs that "start on their own" (flight day, crew live, critter nearby, vote closing) | `Activity.request` cannot start from background | Server push-to-start (iOS 17.2+) and scheduled start (iOS 26); crew-wide state via broadcast channels (iOS 18+); LA orchestrator in `services/worker` |
| Android lock-screen parity | Live Updates allowed only for user-initiated ongoing activities; disallowed: ads, promotions, chat, alerts, upcoming calendar events, quick access | Live Update (API 36+, ProgressStyle): leave-by journey, flight day, crew meet-up ETA, critter encounter in progress, SOS session. MetricStyle (API 37+): flight/leave-by metrics. Vote closing and storm = high-priority notifications, not Live Updates |
| Critter nearby at 50 m dwell with phone locked | iOS geofence (`CLMonitor`, ≤ 20 conditions, ~100 m+ practical); Android geofence 100–150 m min, 2–6 min latency; WIU only in background while session active | Coarse geofence (≥ 150 m) or active WIU trip-day session → fine dwell by foreground/background location session; Android FGS started from geofence/notification tap; ring = dwell counted server-confirmed per POI visit |
| "Tapping + opens the system widget sheet" (5c-5) | No iOS API; Android has `requestPinAppWidget` | iOS: animated how-to sheet with steps; Android: pin request |
| Pause subscription (4d-2) | App Store has no pause; Play pauses 1–3 months | Monthly only. iOS emulation: open `showManageSubscriptions` to turn off auto-renew + scheduled "resume" reminder + server-side "paused" overlay. Android: real Play pause via subscription centre deep link |
| 4d-1/4d-3 card last-4, change plan, payment method | IAP exposes none | Store manage/payment sheets; 4d-3 becomes billing-issue state from server notifications |
| 4b-4 checkout with split row and per-trip product name | System purchase sheet fixed | Split + trip name shown on 4b-3 before the sheet and in 4b-5 after |
| Alarm/SOS "breaks through Do Not Disturb" | Critical Alerts reserved for gov/health/home | Alarm = AlarmKit (iOS) / alarm channel (Android); SOS = Time Sensitive + communication notification; no critical-alert entitlement |
| Help tiles, SOS, 1-h location share | Guideline 5.1.5: location APIs not for emergency services | Framed as crew coordination; CALL 112 = plain dialer link; nothing implies dispatch |
| Crew live map background positions | LPSE entitlement needs an Apple request; Play background location declaration + video | Foreground/WIU session sharing by default; LPSE + Always as upgrade after approval; request both early |
| Encounter "hold ring continues while locked" | No background UI | Dwell counts via location session; ring state shown in critter-nearby LA updates |
| Interactive widget/LA buttons on locked phone | Require authentication | Accept; buttons use `LiveActivityIntent`/App Intents calling device-action-key endpoints |

---

## 5. Supplier & real-world agency copy (per designed action)

Flags in `feature_flags` (server): `supplier.viator_booking`, `supplier.agoda_demand`, `supplier.klook_activity_api`, `supplier.tripcom_distributor`. All adapters are built in `packages/suppliers`; a flag switches on only after partner approval + certification. Supplier content renders verbatim inside supplier cards only, attributed, uncached, never sent to the LLM. Every card with an affiliate link carries the disclosure "We may earn a commission. It never changes what Pon recommends."

| Screen / action | Designed copy | Launch copy (flag off) | After approval (flag on) | Provider |
|---|---|---|---|---|
| 3c-8 drafting task | "Held 2 ryokan rooms in Gion, free cancel" | "Found 2 free-cancel ryokans in Gion" | Agoda Demand on: "Checked live rooms at 2 Gion ryokans, free cancel" (still no hold) | Agoda / Trip.com / Booking.com links via Travelpayouts |
| 3c-12 redraft | "I booked it." | "Found a free-cancel slot. Book it once the crew's in." + BOOK link | Viator on: "Price held until {time}" only if the slot is a Viator product and the draft has been sent | Viator / Klook link |
| 3c-7 must-dos (lottery) | "I entered all six of you." | "Entries close {date}. Each of you enters on the official site — I'll remind you." | same (no API enters lotteries) | reminder task |
| 3c-9 / 4f-3 draft row | "lottery result Mar 1" | "results {date} · reminder set" | same | — |
| 3f-1 builder | "Hold the rooms for 5 days · Free cancellation until then" | "Reply by {date}" + per stay "Free cancellation until {date}" (from booked stays, else "Book by {date} for free cancellation") | Agoda Demand on: "Booked {n} rooms, free cancellation until {date}" when booked via API | — |
| 3f-3 / 3f-6 / 4f-1 chip | "ROOMS HELD" | "FREE CANCEL TO {date}" when booked, else "BOOK BY {date}" | same | — |
| 3f-4 | "Rooms held until Sep 30" | "Free cancellation until Sep 30" (booked) / "Book by Sep 30 to keep free cancellation" | same | — |
| 3f-7 dropout | room released | Links: "Cancel on Agoda by {date} to avoid the fee"; Viator: "Cancelled · full refund" after cancel succeeds | Agoda Demand: API cancel → "Cancelled on Agoda · refund per policy" | Agoda / Viator |
| 3j-1 / 3j-2 offer | "4 seats held for 20 min" | Viator product with availability `HOLDING`: "{n} seats held until {time}"; price-only hold: "Price held until {time}"; `HOLD_NOT_PROVIDED`: "Book now · seats not held" | Klook API: "Book on Klook · {n} left" (no hold) | Viator Full + Booking (MoR = Viator) |
| Activity booked | "BOOKED" | "Booked · Viator ref {ref}"; pending: "Waiting for the operator"; link bookings: "{member} booked it on Klook" after import | same | Viator / Klook / GYG |
| 3k-1 ticker | "TOKEK HELD 6 BOAT SEATS" | Viator: "TOKEK HELD 6 BOAT SEATS" only while `HOLDING`; else "TOKEK FOUND 6 BOAT SEATS" | same | Viator |
| 3e-2 / 3k-5 restaurant | "table held" / "can hold the table for 6 until 21:00" | "Ask Locavore to hold a table for 6 until 21:00? I'll draft the WhatsApp." → "Sent 10:45, waiting" → "Locavore replied: yes" | same | WhatsApp Business (ops desk, user-approved) |
| 3k-5 flight delay | "Made rebooked for a 13:50 pickup", "Villa knows" | "Pickup: message drafted to Made — send?" → "Made replied: 13:50 works"; "Villa: message sent, waiting" | Klook/Trip.com transfer API: "Pickup moved to 13:50 on Klook" when supported | WhatsApp Business / transfer supplier |
| 3h-3 getting around | "MADE IS 4 MIN AWAY · booked by Tokek" + live car | Pre-booked transfer: "Airport pickup booked on Klook (from your email) · driver details from your voucher"; in-trip: "Grab estimates Rp X–Y, about 4 min away · Open Grab" (Gojek fallback); no live car on our map | same | Grab Farefeed, Klook/Trip.com/Kiwitaxi/GetTransfer links |
| 3k-9 running late | "messages whoever's waiting" | Crewmates: in-app message sent on choice. Vendors: "Draft ready — send?" | same | Centrifugo / WhatsApp Business |
| 3k-10 SOS clinic | "Sending his insurance details to the clinic" | "Ops desk is calling the clinic with you — share insurance details?" (human handoff; user approves data) | same | ops desk (human) |
| Flights | "Rebooked your flight" (implied) | "SQ 938 delayed 2h10 ({source}, {time}). Here's what I'd change" + airline link | same | AeroDataBox / FlightAware |
| Prices | exact prices | "~$520 from SIN (recent searches, {time})" | same | Travelpayouts |
| Room shortlist | — | "Free-cancel rooms at {hotel} on Agoda, from ~$X a night (seen {time})" | Agoda Demand live price | Agoda |

---

## 6. Content scope (launch)

| Item | Count / scope | Producer |
|---|---|---|
| Live guides | 6: Tokek (Bali, gecko), Pon (Kyoto, tanuki), Lundi (Iceland, puffin), Ajo (Mexico City, axolotl), Sardi (Lisbon, sardine), Paco (Cusco, alpaca) | content factory persona packs + founder approval |
| Guest guide | Tokek acts as guest guide everywhere else, lighter data pack | content factory |
| Locals | 150 critters × 4 forms (common/rare/epic/legendary) = 600 forms, 61 places, setGroup 0–3 | content factory (render specs → critter-bake → render review) |
| Legendary rules | Guide windows (Marigold Ajo Nov 1–2, Sakura Pon early Apr, Festa Sardi Jun 12, Inti Paco Jun 24, Puffling Lundi late Aug, Golden Tokek any day crew challenge) + a window or "hardest thing" rule per local legendary | content factory + editorial |
| Guide poses/voices/music | 6 guides × ≤ 6 poses × 4 forms; 6 owned ElevenLabs voices; 6 music themes (3 named: gamelan lo-fi, koto and rain, slow sea shanty; 3 commissioned) | content factory / licensed |
| POI DB | 6 live cities curated deep; guest coverage from FSQ OS + Overture | content factory + editorial |
| Datasets | taste quiz (6 questions), help articles, emergency numbers + tourist police per country, insurance guidance, phrase packs (per destination language), season + crowd editorial, starter crew plans | content factory |
| SFX | ~40 SFX in 6 families, ~10 haptic patterns | design-system cue map |
| Web | Tips (MDX), legal, invite landing, OG atlas | content factory + founder |

---

## 7. Open questions: default assumptions (master §11.3)

"Confirm?" = founder confirmation advised before the owning phase ships (Y) or not needed (N). Agents implement the default regardless.

### Platform and scope
| Q | Default agents implement | Confirm? |
|---|---|---|
| Q-01 | D2: iOS 26 + Android API 36, full parity | N |
| Q-02 | iPhone layout only; iPad runs the iPhone app; Android tablets letterbox at max 480 dp; iPhone Duo uses adaptive phone layout | Y |
| Q-03 | en-US base (UK-neutral wording); ship the 10 named languages: en, zh-Hans, id, ja, es, pt, fr, ko, th, vi; language list shows only shipped languages; no RTL UI (RTL phrase text renders correctly) | Y |
| Q-04 | Island toast is production: top overlay pill; on non-Dynamic-Island devices and Android it drops from the top safe area | N |
| Q-05 | Per-tab stacks; re-tap active tab pops to root | N |
| Q-06 | Baked art everywhere; runtime Skia for in-app stickers and ~90 hero draw-ons | N |
| Q-07 | TRIPS root = trip list/switcher when > 1 active trip; Home crew-scoped; Inbox global | N |

### Identity, crews, roles
| Q | Default | Confirm? |
|---|---|---|
| Q-10 | Anonymous-first; sign-in required before purchase, before sending invites, and on second device; merge (onLinkAccount) only when identity exists: crews/critters/stamps union, existing profile wins | Y |
| Q-11 | Organiser can add co-organisers (same powers, cannot remove organiser); on leave/deletion organisership passes to earliest co-organiser, else longest-standing member | N |
| Q-13 | Invited path uses the same just-in-time primers at first need | N |
| Q-14 | Seat token per invitee when a contact is picked; generic link = crew join; forwarded personal link shows "a seat in {crew}" without invitee name and consumes a generic seat | N |
| Q-15 | Random 6-char code, Crockford base32 minus ambiguous glyphs; one `/i/` namespace resolved server-side by type | N |
| Q-16 | 10 active crews per user (server config); no paywall | N |
| Q-17 | Taste tags crew-visible with disclosure at onboarding and in 3n-3 | Y |
| Q-18 | Adopt §10.4 crew-visibility matrix + C36 copy | Y (counsel) |
| Q-19 | Nudges to non-installed invitees only via inviter's share sheet; we send no SMS/WhatsApp to non-users | N |

### Home, vote, explore, guide identity
| Q | Default | Confirm? |
|---|---|---|
| Q-12 | At board close the top 2 by votes go to final; ties → organiser picks; organiser may reopen the board | N |
| Q-20 | C27 | N |
| Q-21 | C30 | N |
| Q-22 | Guest guide Tokek; Help, forecast and phrases available wherever datasets cover the country, else a "limited coverage" state | N |
| Q-23 | Sponsored picks = affiliate-partner featured placement, labelled "SPONSORED", ≤ 1 per Explore list, free tier only, contextual (no personal targeting), commission-neutral ranking elsewhere; Play "Contains ads" declared | Y |
| Q-24 | Any member starts a swipe session; match = min(2, participants) yes; matches become ChangeSet suggestions needing organiser approval. **Amended 2026-10-04 (plan `261003-2300-planning-places-v2`: "Decided 2026-10-04 00:32 (founder: "all recommended")"):** a match drops into the trip's Ideas with everyone who said yes as its backers; placing ideas on days still ends in a reviewed change set (C41), so nothing lands in the plan unannounced | N |
| Q-25 | PLAN % = weighted setup steps + booked items; lock-screen ring % = elapsed time from trip confirmed to countdown target; hype % per Q-46; "★ 4.8 · 212 CREWS" = mean copier-crew rating + copier count; "~$X EACH" per viewer origin in viewer's home currency | N |
| Q-26 | C26 (unboosted 7–16 crew seats 6, waitlists the rest or boosts) | N |

### Setup and plan
| Q | Default | Confirm? |
|---|---|---|
| Q-30 | Any participant proposes edits; organiser/co-organisers apply directly; others go through changeset approval | N |
| Q-31 | Private max per trip, prefilled from profile default, entered in own currency and converted; if lowest max < cheapest feasible plan, organiser sees anonymous "one budget is below the cheapest plan" | N |
| Q-32 | Tentative blocks opt-in per member; shown as "maybe busy", no titles | N |
| Q-33 | Room traits via setup chips (early bird, snorer, couple); couples share a bed; unequal room prices split per room | N |
| Q-34 | Drafting may start with missing must-dos; late must-dos before proposal send trigger a free fit-in redraft | N |
| Q-35 | "Apply to my plan only" = personal overlay visible only to me, items tagged "just you" | N |
| Q-36 | Collision: push later items; overflow → ask with options (swap / drop optional) | N |
| Q-37 | Unasked with undo: shift within a day ≤ 60 min, retime pickups after flight changes, pin info. Everything spending money or affecting others → ChangeSet | N |
| Q-38 | C41 | N |
| Q-39 | C44 (updated) | N |

### Proposal and community
| Q | Default | Confirm? |
|---|---|---|
| Q-40 | Confirmed when organiser locks, or automatically at reply-by if ≥ 2 IN (incl. organiser) | N |
| Q-41 | Copy into trip = first draft if none; replacing an existing draft consumes a redraft | N |
| Q-42 | D10: no stay holds; Viator activity holds real; nobody pays us | N |
| Q-43 | Explicit "I'm out" (tertiary on 3f-4 and 3f-3) | N |
| Q-44 | Personal version shows own share; skipping optional items lowers only own share | N |
| Q-45 | Waitlist auto-offer (not auto-join), 24 h to accept, then next in line | N |
| Q-46 | Reactions persisted; hype % = 100 × (IN + 0.5·reacted + 0.25·MAYBE) / recipients, capped 100 | N |
| Q-47 | Web previews for non-installed invitees (F-092), no private data | N |
| Q-48 | C43 (updated) | N |
| Q-49 | Manual back-fill of pre-app trips (F-191): stamps marked self-reported, no critters | N |

### Money, bookings, trip, safety
| Q | Default | Confirm? |
|---|---|---|
| Q-50 | Organiser picks settlement currency at setup (default: most common member home currency); changeable, balances re-rated at change with notice | N |
| Q-51 | Keep the rate captured at entry (offline snapshot, labelled with its date) | N |
| Q-52 | Any participant adds; creator or payer edits/deletes; organiser edits all; full history | N |
| Q-53 | Payer marks paid (pending); payee confirms (settled); unconfirmed after 7 d → auto-settled unless disputed | N |
| Q-54 | SOS without data: native SMS composer prefilled to crew numbers (user sends); slide-to-send with 5 s cancel; no auto-escalation to 112 | Y (counsel, 5.1.5) |
| Q-55 | Help does not auto-share location; one tap "share for 1 h" with consent line | N |
| Q-56 | Morning briefing per user per trip; evening roundup per user across crews; Inbox holds actionables; an item is pushed once | N |
| Q-57 | D10: guide never phones; vendor messages only after the user approves exact text | N |
| Q-58 | Forward-to-crew-address import is free | N |
| Q-59 | Stays/activities/transfers with ≥ 2 participants crew-shared; flights personal but flight no. + times visible to crew (opt-out) | N |
| Q-5A | C37; NEXT FLIGHT widget Pass+ | N |
| Q-5B | Visits opt-in, consent copy at trip-day session start, retained 30 d after trip end then aggregated; background only with Always | Y (counsel) |
| Q-5C | Crewmate phones visible during trip days + SOS if verified and allowed (default on during trip); vendor numbers cached offline | N |

### Critters and after
| Q | Default | Confirm? |
|---|---|---|
| Q-60 | Dwell: common 3 min, rare 6, epic 10, legendary 15; drain at 1/3 fill rate; 2 min grace; camera optional (server config) | N |
| Q-61 | C20 | N |
| Q-62 | Recap when all participants' return flights landed or trip end + 1 d 18:00 local, whichever first; shared crew recap + personal cards | N |
| Q-63 | One egg per guide destination on a trip; overland arrival triggers on first visit inside the destination boundary | N |
| Q-64 | C39 | N |
| Q-65 | Every local has a legendary form with a window or challenge rule from the content factory | N |
| Q-66 | Personal XP + crew level; common 50, rare 150, epic 400, legendary 1000 | N |
| Q-67 | Signatures auto-generated in the guide voice font (Borel since 30 Sep 2026, replacing Caveat, which lacks Vietnamese; see [decisions/20260930-guide-voice-borel.md](decisions/20260930-guide-voice-borel.md)) with seeded jitter; optional drawn signature in You | N |
| Q-68 | Per-user "no teasing awards" opt-out; validator bans health, diet, body references | N |
| Q-69 | Face tagging off by default, opt-in; published plans exclude photos with faces unless every tagged person consents | Y (counsel) |
| Q-6A | C38 | N |
| Q-6B | C40 (any_of + "At a water temple") | N |
| Q-6C | Album: manual picks + suggested by trip dates (user confirms); system photo picker (limited access); photos kept forever within fair-use cap | N |
| Q-6D | Phrase practice with on-device speech check and tracking; crew level-8 unlock = special sticker | N |

### Monetisation
| Q | Default | Confirm? |
|---|---|---|
| Q-70 | C8 | N |
| Q-71 | C10 | N |
| Q-72 | Build spoken read-out perk (Pass+) | Y |
| Q-73 | C13 | N |
| Q-74 | C23 | N |
| Q-75 | Show "{name} has Pass+" only in guide-limit context and only if that user's "show Pass+ badge" is on (default on) | Y |
| Q-76 | C47 | N |
| Q-77 | §3 products and codes | N |
| Q-78 | Disruption auto-fixes, forecast watch, rerouting free | N |
| Q-79 | Postcard: Pass+ sender, 1 per trip, recipients opt in and enter address in-app; addresses encrypted, deleted 30 d after mailing | N |
| Q-7A | Pause monthly only; iOS emulated, Play real | N |
| Q-7B | Crew yearly auto-renewing; rebind rules §3 | Y |
| Q-7C | FTF once per crew, ≥ 2 seated, one FTF-organised trip per user | N |
| Q-7D | Void: all perks ship (C48) | N |
| Q-7E | Boost allowed on solo; FTF not; no trial; no Family Sharing | N |
| Q-7F | C42 | N |
| Q-7G | C46 | N |

### Off-app, notifications, community
| Q | Default | Confirm? |
|---|---|---|
| Q-80 | Any participant may request publishing; every participant consents in-app; personal data stripped | N |
| Q-81 | Entry always visible; cold start seeded with guide "starter plans" labelled as the guide's pick | N |
| Q-82 | 10 idea votes/user/month; anonymous users may vote (device-bound) | N |
| Q-83 | Ship Watch/CarPlay `.small` LA family | N |
| Q-84 | Roundup in trip tz while on a trip, else device tz; one roundup across crews | N |
| Q-85 | Always gets through (bypasses budget and quiet hours): SOS, leave-by alarm, boarding/gate/delay for own flights, meet-up running-late affecting you, booking or free-cancel deadlines < 24 h, billing failure | N |
| Q-85a | Doc delta, 1 Oct 2026: settings for the first real trip, delegated by the founder (asked about the notification cap, quiet hours and the chat default, the answer was "you decide"), to be revisited with the delivery data after it. Daily budget starts at 10 (was 5; range 1–10 unchanged). Crew chat: a member who never chose a level hears every message in a crew of six or fewer active members and mentions only in a larger one; their own choice always wins. Crew chat pushes do not count toward the daily budget (they collapse to one banner per crew); quiet hours and the chat switch still hold them. Quiet hours: what they hold is sent as itself when they end (not in the next evening's roundup), oldest first, within that day's budget; anything expired by then is dropped, and anything more than 12 hours late or over the budget joins the evening roundup. Travel morning: when a person has a leave-by inside their quiet hours, quiet ends 90 minutes before it for that night | N |
| Q-86 | Lock-screen redacts money amounts and exact places by default; toggle in settings | N |
| Q-87 | Crew LA per meet-up: starts T − 45 min, ends at meet-up + 15 min | N |
| Q-88 | Any participant creates meet-ups; guide auto-creates from plan transfers | N |
| Q-89 | Nudge target = largest debt; 24 h cooldown per pair; nudged person sees "from {sender}" | N |

### Design, brand, legal
| Q | Default | Confirm? |
|---|---|---|
| Q-90 | C5 canonical | Y (designer sign-off) |
| Q-91 | C7 | N |
| Q-92 | Member colours per crew in join order over the 6 accents; members 7–16 add a ring pattern (dashed, double) to stay distinguishable | N |
| Q-93 | Default icon PASSPORT | N |
| Q-94 | Synthetic owned ElevenLabs voices per guide; 3 missing themes commissioned as buy-out originals | Y |
| Q-95 | Minimum age 16; Declared Age Range API + age-rating questionnaire (social features → ≥ 13+ category) | Y (counsel) |
| Q-96 | Licence of adapted `alesha-pro/tools` canvas code must be confirmed or the code rewritten before the renderer ships. Resolved 2026-09-27: MIT (Copyright (c) 2026 Alexey Fateev); ported code carries the notice in `packages/critter-art/THIRD_PARTY_NOTICES.txt` | N (resolved) |
| Q-97 | Referral dashboard under You > Invite friends; rename the "Gold cover" reward to "Collector cover" | Y |
| Q-98 | Store preview uses real app capture, no staged group-chat opening | N |
| Q-99 | D20 assumption; `go.` and `in.` subdomains reserved | Y |

---

## Unresolved questions

1. Store price tiers: Boost $11.99 vs design "$12"; Crew yearly $59.99 vs design "$59".
2. Viator Full + Booking approval timing: if denied, 3j-1 copy switches to "Book now · seats not held" permanently.
3. EU alternative payments (from 2026-10-01) — stay IAP-only in the EU? (D7 says no web checkout.)
4. Social-media age-rating category for community + idea board: accept 13+/Time Allowances or age-gate?
5. LPSE entitlement and Play background-location approval lead times (affect crew map background mode).
6. The 6 unnamed "12 more" languages on 3n-8.
