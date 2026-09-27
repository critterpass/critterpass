# Web search: where to use it (proposal, 2026-09-28)

The source is a sweep of all 57 phase files, product decisions D1–D22 and C1–C48, and api-contracts §6. The tool is our own `web_search` executor on Tavily, built in LLM gateway T13. It excludes supplier domains (blocklist sent to Tavily and re-screened in code), sources travel with every fact, and queries are screened for personal data.

## Verified Tavily terms (tavily.com/terms, 2026-09-28)

- **§6.5:** Tavily and its AI providers "may use, process, analyze, and retain Customer Input … for training". Queries must therefore **never contain personal data**: places, dates and topics only. This is enforced in code.
- **Caching of results, attribution, DPA:** not stated in the terms. The research report's "zero data retention" and "mandatory attribution" claims came from third-party pages and are not verified. We show sources anyway; before launch, ask Tavily for a DPA or ZDR (enterprise) and list it in the privacy policy (D18).

## Already planned (switch from Claude's built-in tool to ours; no new scope)

| Phase | Where | Guardrail |
|---|---|---|
| 26 | Guest brief "What Tokek knows so far" (T6, weekly refresh): the only fact source for the 55 guest places without a curated pack | sources shown; official and tourism domains preferred |
| 37 | Forecast watch: closures, ceremonies, strikes (T5); closure callout | web-only items can reach WATCHING or needs-a-yes, never an automatic guide action (C41) |
| 18 | Legendary windows "proposes with cited source" (T8) | offline batch; founder confirms each date (G4) |

## Proposed enhancement tasks (need your yes)

| # | Phase | Enhancement | Why | Guardrail |
|---|---|---|---|---|
| 1 | 32 Guide chat | Guide answers fresh questions with cited web results: what's on this week, holiday hours, ferry or metro strikes | curated data can't answer "now" questions | cited text only, never in plan changes or cost (D5); counts toward the 30/day meter (D8); crew chat only on @mention |
| 2 | 15 Season data (T3) | Research assist proposes dated events (Nyepi, sakura, festivals) with sources into the editor review queue | dates move every year | nothing served until a human sets `reviewed_at` |
| 3 | 14/18 Places | Opening-hours research from official venue or tourism sites fills the empty `hours` field | blocks OPEN NOW, fit checks and "closed on date" | official sites only, never Google Maps (D6) or TripAdvisor; human `verified_at`; Foursquare live checks stay the runtime source |
| 4 | 28 Drafting | Pre-draft code step writes cited closure and holiday records for the trip dates | catches trip-breaking closures before the skeleton | the planner reads records, never raw snippets |
| 5 | 27 Trip setup | Must-do lottery and book-ahead dates ("Entries close {date}") | ticket windows change every year | reviewed POI record with source; official sites only (D10) |
| 6 | 36 Trip day | Seed a curated, dated "visa cash" fee table from government sites | the design copy has no dataset | research only; human-checked; the app serves the table, never generated text |
| 7 | 18 (T12) Safety content | Research and monthly re-check of emergency numbers and facilities | official sources for 61 places | never at runtime; per-record human sign-off (G7) |
| 8 | 16 Cost engine | Cited stay, food and fun price bands per destination | budget indices need sources | non-supplier sources only (D10); human `reviewed_at`; numbers live in the table |
| 9 | 52 Community | Closure check when copying an old shared plan | temporary closures | reuse records from 4 and the watch job; no per-copy search |
| 10 | 51 Web | Research for public tips articles | sourced articles | facts and links only, no copied prose; founder approval |
| 11 | 55 Driver finder | Refresh "no ride-hailing pickup here" zones | stale zones | areas only, never people or groups |

Recommended now: **1, 2, 3, 4**: highest value, and they share the source-carrying fact format. Leave 5–11 for review as each phase starts.

## Never use web search for

1. SOS, help hub or emergency numbers at runtime (phase 38: "no LLM on this path"; D10, Q-22, Q-54).
2. Supplier offers, availability, prices or reviews (D10, D5): even unblocked comparison blogs leak supplier prices.
3. Finding or vetting drivers, guides or vendors (phases 35/55/56: personal data under PDPL, login-walled sources; Q-57).
4. Medical, allergy or dietary answers, including menu scans (phase 13 help routing; phase 42).
5. Personal visa and entry answers: they need nationality in the query, which is personal data (D5). Official advisories may be cited in the guest brief only.

## Cross-cutting rules (built into the tool in T13)

- **Supplier blocklist:** matches registrable domains across country TLDs and includes Traveloka, tiket.com, 12go, Klook, KKday, Trip.com, Google Maps and TripAdvisor.
- **Search numbers are cite-only:** the grounding check never lets a web number into structured outputs, plan changes or the cost engine.
- **Query privacy:** queries pass the compliance pre-pass (phone, email, URL, card and ID patterns), with names and booking references removed.
- **Plan text:** where it still names Claude's `web_search_20260209` or "Sonnet-only" (phases 13, 15, 26, 37; api-contracts §6), it gets updated as each phase starts. D22 already overrides it.

## Unresolved questions

1. Approve enhancements 1–4 now (added to phases 32, 15, 14/18 and 28 as tasks)?
2. Scope: web search in guide chat and watch jobs only (as planned), or also drafting jobs and crew-chat @mentions (items 1 and 4)?
3. Tavily data terms: accept the development-tier terms now and ask for a DPA or ZDR before launch?
