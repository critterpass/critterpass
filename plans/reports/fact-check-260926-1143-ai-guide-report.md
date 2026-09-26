# Fact-check: AI guide report (researcher-260926-1143-ai-guide-report.md)

Date 2026-09-26. Method: 45 load-bearing claims (grouped) re-verified against primary pages (WebFetch/curl/gh), claude-api skill docs 2.1.281 for API behaviour. Web-search budget ran out mid-run, so a few items rest on secondary sources or empirical probes (marked).

Tally: 1 refuted (#15), 1 outdated (#41), 2 confirmed-with-correction (#24, #30), 4 partly uncertain (#17 Sonnet TTFT, #26 OCRTool/PCC 32K, #28 CASA cost, #35 Open-Meteo price), rest confirmed (several with added constraints). **Recommendation still holds.** The runner-up (Google live places, Google Routes for spoken ETAs) is weakened by Google Maps ToS clauses the report missed.

## Claims

| # | Claim | Verdict | Correction / note | Source |
|---|---|---|---|---|
| 1 | Claude list prices: Opus 5.5 $4/$20 (cache read $0.20 = 0.05×), Sonnet 5 $2/$10 (read $0.20), Haiku 4.5 $1/$5 (read $0.10); Batch −50% | confirmed | — | platform.claude.com/docs/en/about-claude/pricing |
| 2 | Sonnet 5 $2/$10 is permanent; the planned rise to $3/$15 on 2026-09-01 is cancelled | confirmed | Footnote 3 quoted verbatim | same |
| 3 | Haiku 4.5 retirement "not sooner than 2026-10-15" | confirmed | No deprecation notice yet on 2026-09-26, and there is a ≥60-day notice policy. Earliest real retirement is therefore about late Nov 2026, so there is less urgency than the report implies | .../about-claude/model-deprecations |
| 4 | Sonnet 5.5 and Haiku 5.5 "will follow in the coming weeks" (Opus 5.5 released 2026-09-22) | confirmed | Quoted on the primary page. No date or price yet | anthropic.com/claude-opus-5-5 |
| 5 | Opus 5.5: forced `tool_choice` any/tool → 400; thinking cannot be disabled; default effort `medium` | confirmed | Also: text between tool calls now arrives in `thinking` blocks, which are empty by default (`display`). This matters only if Opus output is streamed as progress | .../models/opus-5-5/overview; claude-api skill |
| 6 | Citations are incompatible with `output_config.format` | confirmed | Returns 400 when citations are on `document` or `search_result` blocks | .../build-with-claude/citations |
| 7 | Minimum cacheable prefix: Haiku 4.5 4096 tokens, Sonnet 5 1024. Caches are per workspace | confirmed | Opus 5.5 minimum is 512 | .../build-with-claude/prompt-caching |
| 8 | `temperature` returns 400 on 4.7+ models, so persona variety must come from prompts | confirmed (scope) | The 400 applies only to non-default values on 4.7+ and Sonnet 5. **Haiku 4.5, the chat default, still accepts temperature** | model-deprecations (param table); skill thinking table |
| 9 | The 4.7+ tokenizer produces ~30% more tokens; Sonnet 5 uses it | confirmed | — | pricing page; skill model-migration |
| 10 | Vision cost `⌈w/28⌉×⌈h/28⌉`. Hi-res tier (4.7+: Sonnet 5, Opus 5.5) is 2576 px / 4784 tokens; standard tier (Haiku 4.5) is 1568 / 1568. Coordinates are "approximate". Claude will not identify people | confirmed | Minor: "≤1568 px ≈ 2.6K tokens" is high. A 4:3 image at 1568 px is about 2.35K | .../build-with-claude/vision |
| 11 | `search_result` blocks give citations on all active models, with no beta header | confirmed | Haiku 3 is excluded, which is irrelevant here | .../search-results |
| 12 | Web search costs $10 per 1K searches; web fetch is free | confirmed | `web_search_20260209` works on Sonnet 5 but **not Haiku 4.5**, which only has basic `web_search_20250305`. The report routes web search to Sonnet 5, so no impact | pricing; skill server-tools |
| 13 | Managed Agents: $0.08 per session-hour plus tokens; no Batch discount; not on Bedrock or Vertex | confirmed | — | pricing § Managed Agents |
| 14 | Claude Agent SDK is the Claude Code harness with built-in file and bash tools. Tool Runner is a separate, lighter option in the API SDK | confirmed | — | claude-api skill ("Four approaches") |
| 15 | "Opus 5.5 is a Covered Model (30-day retention); ZDR only for eligible models" (§11 Q9) | **refuted** | The Covered Models are Fable 5.1, Mythos 5.1, Fable 5 and Mythos 5 only. Opus 5.5, Sonnet 5 and Haiku 4.5 are not listed, so the data-residency and retention question is simpler | .../manage-claude/api-and-data-retention |
| 16 | API data is not used for training by default | confirmed | The only exception is explicit feedback submission | privacy.claude.com/.../7996868 |
| 17 | Haiku 4.5 TTFT ~0.63 s at ~85 tok/s; Sonnet 5 TTFT ~1.5 s | Haiku: confirmed (≈). Sonnet: **uncertain** | AA non-reasoning Haiku 4.5: 0.65 s, 81 tok/s. The cited comparison page shows only reasoning variants (Sonnet 5 max effort: 124.7 s TTFT, 77 tok/s). **Sonnet 5 runs adaptive thinking by default**, so latency routes need `thinking: disabled` or low effort, and the latency must be measured | artificialanalysis.ai/models/claude-4-5-haiku; comparison page |
| 18 | GPT-Live-1: $0.05/min billed per second; GA 2026-09-10; function calling; no structured outputs; delegation to a client-controlled backend (e.g. Claude); concurrency limits by tier | confirmed | The GA date comes from secondary coverage; openai.com returned 403. Concurrency runs from 25 sessions (Tier 1) to 500 (Tier 5) | developers.openai.com/api/docs/models/gpt-live-1; search results |
| 19 | OpenAI custom voices are for "eligible customers" only, 20 per org, with a consent recording | confirmed + omission | **On gpt-live-1, custom voices support "English accents only"**. That rules it out for multilingual critters, which strengthens the case for option A | developers.openai.com/api/docs/guides/custom-voices |
| 20 | OpenAI prices: gpt-6-luna $0.10/$0.50, gpt-6-sol $2/$10, gpt-realtime-2.1 audio $32/$64, mini $10/$20 | confirmed | — | developers.openai.com/api/docs/pricing |
| 21 | Gemini 3.8 Flash is $0.75/$3.75 until 2026-12-31, then $1.50/$7.50. Live audio is $0.005/min in and $0.018/min out. Maps grounding: 5K free, then $14 per 1K | confirmed | — | ai.google.dev/gemini-api/docs/pricing |
| 22 | Gemini 3.8 Flash TTS is GA: 130+ languages incl. Icelandic, voice design and replication, streaming. About $0.0135/min until 2026-12-31, then doubling | confirmed | Output is $9 per 1M tokens, i.e. $0.00225 per 10 s, rising to $18 on 2027-01-01. There are 30 prebuilt voices | ai.google.dev/.../speech-generation; pricing |
| 23 | ElevenLabs Flash v2.5 costs $0.05 per 1K characters with ~75 ms latency, covers 32 languages and lacks Icelandic. v3 costs $0.10 per 1K characters and covers 74 languages incl. Icelandic | confirmed + omission | The models page says "70+" and the pricing table says 74. **Professional Voice Clone slots: Creator/Pro 1, Scale ($299) 3, Business ($990/mo) 10**. Six critter PVCs therefore need the Business tier or a slot add-on, or Instant clones instead. That cost is missing from the "$370/mo fixed" figure | elevenlabs.io/pricing/api; /pricing; /docs/overview/models |
| 24 | Deepgram Nova-3 Multilingual costs $0.0058/min; "Flux English" costs $0.0065 | confirmed with correction | $0.0058 is a **promotional "current price"; the regular price is $0.0092/min**. **Flux Multilingual now exists at $0.0078/min.** Negligible effect on cost | deepgram.com/pricing |
| 25 | iOS 26 SpeechAnalyzer and SpeechTranscriber run on device | confirmed | SpeechTranscriber is **hardware-gated** (`isAvailable`). Older iPhones need the DictationTranscriber fallback or cloud STT | developer.apple.com (doc JSON) speechtranscriber |
| 26 | RecognizeDocumentsRequest ships on iOS 26 (tables and lists). iOS 27 Foundation Models adds image understanding, Private Cloud Compute, and a LanguageModel protocol (any server model) | confirmed (partly) | "OCRTool", the "PCC 32K" context size and "26 languages" were not found in the docs, so they are uncertain. This is low impact: the report defers it to a later phase | developer.apple.com doc JSON (vision, foundationmodels) |
| 27 | Veryfi costs $0.08 per receipt with a $500/mo minimum | confirmed | $500 covers 6,250 receipts; the free plan has 100 documents | faq.veryfi.com/.../3743986 (via search) |
| 28 | Gmail restricted scopes require a CASA assessment by an empanelled assessor, repeated every 12 months, taking "several weeks" | confirmed | CASA cost of $500–4,500 is **uncertain**, as no primary source was found | developers.google.com/identity/.../restricted-scope-verification |
| 29 | Google Places (New): Place Details Enterprise $20/1K after 1K free, with hours, rating and price in Enterprise; Text Search Pro $32/1K; Routes Essentials $5/1K after 10K free; mobile Maps SDK free and unlimited | confirmed | — | developers.google.com/maps/billing-and-pricing/pricing; .../data-fields |
| 30 | Places content: nothing may be cached except `place_id`, and it may not be used on a non-Google map | confirmed with correction | Non-Google map ban: confirmed (Service Specific Terms §14.2). Caching: latitude and longitude may be cached for 30 days (§14.3). **Missed clauses:** GMP ToS §3.2.3(a)(iv) "not ... use Google Maps Content with text-to-speech services"; §3.2.3(c)(vi) "convert text-based driving times into synthesized speech"; §3.2.3(c) "not create content based on Google Maps Content", with Maps Grounding Lite (SST §10.2) the only exception for LLM output. See Omissions 1 | cloud.google.com/maps-platform/terms; /terms/maps-service-terms |
| 31 | Maps Grounding Lite requires an LLM that does not train on its inputs | confirmed | It also requires that "Google Maps Content is not cached by, stored by ... the LLM", and source links must immediately follow the generated text. Claude prompt caching of tool results may conflict, so legal review is needed | developers.google.com/maps/ai/grounding-lite |
| 32 | Foursquare Places: 500 free calls, then Pro $15/1K and Premium $18.75/1K | confirmed | The page still says both "0–500 calls $0" and "up to 10,000 free calls". Premium covers Tips and Photos plus "premium tier fields", and it was not verified whether hours are premium | foursquare.com/pricing |
| 33 | FSQ OS Places is Apache-2.0 with 100M+ POIs; Overture places are CDLA-Permissive-2.0 and released monthly | confirmed | Monthly cadence is confirmed for FSQ OS. Overture's cadence is not stated on its attribution page. FSQ requires NOTICE.txt attribution | docs.foursquare.com (via search); docs.overturemaps.org/attribution |
| 34 | BestTime Pro metered: $0.009/credit, $99/mo minimum, 1 credit per forecast by venue id | confirmed | The page shows "+$99.00/month", with the first month's minimum credited to usage. Tiered rates apply above 10K credits | besttime.app/subscription/pricing |
| 35 | Open-Meteo: free tier is non-commercial; the commercial plan includes marine data; CC BY 4.0 applies; Standard is ~$29/mo for 1M calls | confirmed / price **uncertain** | 1M calls/mo and marine are confirmed. The $ figure sits in a Stripe widget and could not be read. **The Standard plan excludes Historical, Climate, Ensemble and Seasonal APIs (Professional+).** Step 2 of the draft ("weather normals, seasonal signals") therefore needs Professional or another source | open-meteo.com/en/pricing |
| 36 | AeroDataBox Growth: $99 for 400K units; general commercial use OK | confirmed | **There are no paid overages** (only ADS-B-feeding credits), so hitting quota is a hard stop. B2B derived-work sublicensing requires Scale | aerodatabox.com/pricing |
| 37 | FlightAware AeroAPI Standard: $100/mo minimum, $0.005 per status call, $0.02 per push alert; B2C allowed | confirmed | — | flightaware.com/commercial/aeroapi |
| 38 | Amadeus Self-Service shut down on 2026-07-17 | confirmed (empirical) | The primary article returned 403. `test.api.amadeus.com` no longer resolves in DNS, and `api.amadeus.com` returns 410 | curl/host probe 2026-09-26 |
| 39 | Travelpayouts Data API offers `/v2/prices/month-matrix` and monthly grouped prices from a cache ("use for static pages") | confirmed + constraints | The data comes only from user searches in about the last 48 h, so less-searched home-airport→DPS/KIX/KEF pairs will have gaps. Partner terms apply: Buy clicks must carry affiliate links, a ≥9% search→click and ≥5% click→purchase conversion is expected, and results pages must be hidden via robots.txt | travelpayouts.github.io/slate |
| 40 | Valhalla 3.9.0 released 2026-09-19 | confirmed | OSRM v26.9.0 released 2026-09-01. Pipecat is BSD-2 and active; promptfoo is MIT and active | gh api releases |
| 41 | Frankfurter lacks PEN, MAD and VND | **outdated** | That is true of the v1 API only (30 currencies). **Frankfurter v2 pulls from 98 central banks, covers 166+ codes including PEN, MAD, VND, IDR and ISK, is free for commercial use and can be self-hosted.** OXR at $12/mo becomes optional | api.frankfurter.dev/v1 & /v2/currencies; frankfurter.dev |
| 42 | OXR Developer: $12/mo with 200+ currencies | confirmed | 10K requests/mo with hourly updates | openexchangerates.org/signup |
| 43 | voyage-4-lite: $0.02 per 1M tokens with 200M free tokens | confirmed | — | docs.voyageai.com/docs/pricing |
| 44 | Langfuse Core: $29/mo for 100K units, $8 per extra 100K; MIT core; acquired by ClickHouse 2026-01-16; v4.46.0 released 2026-09-25 | confirmed | Core keeps data for 90 days | langfuse.com/pricing; clickhouse.com blog; gh |
| 45 | App Store: Small Business Program pays 15%; subscriptions pay 15% after year 1 | confirmed | Google Play is missing: from 2026-06-30 in the EEA, UK and US, subscriptions are charged 10% plus a 5% billing fee | developer.apple.com/app-store/small-business-program; support.google.com/googleplay/android-developer/answer/112622 |

## Omissions (not in the report, or understated)

1. **Google Maps ToS versus the Critterpass design (high impact on the runner-up and on "Google Routes for traffic legs").**
   - Google Maps content may not be used with text-to-speech, and driving times may not be converted into synthesized speech. That conflicts with a guide that speaks leave-by or ETA lines, the 5b-3 alarm, and voice answers that quote Google place data.
   - Creating content from Maps content is banned except through Grounding Lite. Claude writing itinerary or pitch text from Places tool results is exactly that case.
   - The no-caching rule conflicts with the plan to cache guest-guide answers as "destination notes".
   - Fix:
     - Keep the live places source on Foursquare or the curated DB when output is voiced or LLM-authored.
     - Take traffic ETAs from Mapbox (check the Mapbox ToS for TTS) or from self-hosted Valhalla with speed data.
     - Get legal review before any Google path.
2. **Data retention and ZDR.** Opus 5.5, Sonnet 5 and Haiku 4.5 are not Covered Models, so ZDR is available where the org is eligible. `inference_geo:"us"` costs 1.1× and works on 4.6+ models only; on Haiku 4.5 it returns 400. There is no first-party EU-only inference option, so EU residency would need Bedrock or Vertex regional endpoints (+10%).
3. **Sonnet 5 runs adaptive thinking by default.** The chat-escalation and pitch latency targets (<3 s, ~1.5 s TTFT) assume little or no thinking. They need an explicit `thinking` setting and effort per route, and must be measured.
4. **Model-scoped caches.** A 70/30 Haiku/Sonnet chat split means two cache namespaces, which lowers hit rates compared with what the cost script assumes. Mid-conversation system messages (the chattiness knob) are not supported on Sonnet 5 or Haiku 4.5, so that instruction must go in user-turn text.
5. **ElevenLabs plan tier for 6 owned critter voices.** Six PVCs need the Business tier ($990/mo, 10 PVCs) or slot add-ons. The fixed-cost line (~$370/mo) excludes it.
6. **Open-Meteo Standard does not cover climate normals or seasonal data**, and the draft job assumes those. Budget the Professional plan or drop the feature.
7. **AeroDataBox has a hard quota with no paid overage.** Size the plan with headroom, and have an AeroAPI fallback for alerts.
8. **Travelpayouts coverage and compliance.** The 48 h search cache leaves gaps, and the partner conversion minimums could make "month prices for crew airports" (3d-1) unreliable. Keep a "no recent price" UI state.
9. **Apple on-device limits.** SpeechTranscriber and Foundation Models are hardware-gated. Plan cloud fallbacks for older iPhones, not only Android.
10. **Android store fees** (the Play June-2026 fee change) are absent from the revenue math. Possible US App Store link-out economics were also not checked (search budget exhausted).
11. **Cloudflare Email Workers on the free plan have tight CPU limits**, so MIME and PDF parsing may need Workers Paid or a hand-off to the queue.

## Impact on recommendation

**The recommendation holds.** The Claude-only three-tier brain, own backend with proposal-only writes, cascaded voice on ElevenLabs with owned voices, on-device OCR plus Claude, and a curated POI DB with BestTime, Open-Meteo, AeroDataBox, Travelpayouts, Valhalla and Langfuse are all supported by current primary sources.

Adjustments:
- (a) Demote the Google live-places and Google-Routes-for-spoken-ETAs parts (ToS: no TTS, no LLM content creation, no caching). This favours Mapbox or MapLibre with Foursquare, which the report already leans toward.
- (b) Swap OXR for Frankfurter v2, or keep OXR only as a fallback.
- (c) Add the ElevenLabs Business tier and the Open-Meteo Professional plan to fixed costs.
- (d) Correct the retention note: Opus 5.5 is not a Covered Model.
- (e) Explicitly configure Sonnet 5 thinking on latency routes.
- (f) Haiku 4.5 retirement is not imminent (no notice yet, and ≥60 days' notice).

## Unresolved questions

1. Does Google's "no TTS / no content creation" apply if only `place_id` and our own curated facts are voiced? This needs legal review.
2. Is Claude prompt caching of tool results "caching by the LLM" under the Grounding Lite terms?
3. Does the Mapbox ToS allow TTS of Directions ETAs? Not checked.
4. What is the Open-Meteo Standard or Professional price, and in which currency? It is rendered by Stripe and could not be read.
5. Are Foursquare opening hours Pro or Premium fields? This changes the live-check cost by 25%.
6. What does a CASA assessment actually cost? No primary source was found.
7. Is Sonnet 5 TTFT at effort low with thinking disabled under 1.5 s? This needs a measurement run.
8. Do Anthropic server-side `fallbacks` apply to Opus 5.5? The docs only show Opus 5 and Fable 5.1.
