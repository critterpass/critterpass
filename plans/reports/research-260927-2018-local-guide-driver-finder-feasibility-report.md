# Local guide / driver finder: feasibility

Date: 2026-09-27 · Type: research only, no code changed

## Question

Travellers need a local driver or guide (driver-guide) for legs that Grab/taxi can't cover, plus local tips. Today they ask in Facebook travel groups for contacts and feedback. Is there an API for that? Could an agent crawl those groups and return a ranked list with contacts and feedback? Plus: export the trip plan so the guide can review it.

## Verdict

| Part | Viable? | Why |
|---|---|---|
| API for independent local guides/drivers | **No** (as expected) | No directory API exists. Only marketplaces expose inventory |
| Agent crawling FB groups for contacts + reviews | **No, not as a product** | No API since Apr 2024; content is behind login (ToS breach); scraped phone numbers and reviews are personal data; conflicts with D10 |
| Same outcome, done legally | **Yes** | User-driven capture + crew-sourced directory + marketplace fallback (below) |
| Export trip plan for guide review | **Yes, strong fit** | Fully in our control; fits `providers`, ChangeSet (C3) and the WhatsApp-after-approval rule (Q-57) |

## 1. What APIs exist

None of these list freelance guides found through word of mouth. They list operators that sell private products.

| Source | What it gives | Access | Fit |
|---|---|---|---|
| Viator Partner API | Private tours / private driver day trips, filterable by tag; ratings and review counts | Affiliate/merchant partner (adapter already planned, `supplier.viator_booking`) | Good fallback, global |
| Klook | "Private car charter with driver" 6/10/12 h in Bali and other destinations, English/CN/KR/JP drivers; operators reply on WhatsApp | Partner API (already planned, `supplier.klook_activity_api`) | Closest match to "driver for the day" in Asia |
| GetYourGuide Partner API | Search, availability, reviews, booking | Commercial agreement only | Optional |
| Daytrip (daytrip.com) | Private driver transfers **with sightseeing stops**, hourly drivers, 130+ countries, 7k+ drivers | Affiliate link (Trackdesk); no public API seen | Very close match for intercity legs |
| ToursByLocals | 5k+ private guides, 175 countries | Travel-advisor commission 5% (10% above $7.5k/yr); no public API | Link-out only |
| Withlocals | Private local hosts, 250 destinations | Partner program; API not confirmed | Link-out only |
| Google Places API | Tour operators/travel agencies with rating + **max 5 reviews**; no caching except place_id | Paid per call | Weak: mostly agencies, not freelancers |
| Tripadvisor Content API | ≤10 results per search, **≤5 reviews**, 10k calls/day, attribution required | Free tier | Weak: same issue |
| Reddit Data API | r/travel, r/VietNam threads with driver recommendations | Commercial use needs approval; ~$0.24 / 1k calls; self-serve closed late 2025 | Not worth it |

## 2. Why crawling FB groups doesn't work

1. **No API.** Meta removed the Groups API (Graph v19). Nothing can be read from groups after 2024-04-23. Zapier, Buffer and Hootsuite all lost group access.
2. **Login wall = ToS breach.** *Meta v. Bright Data* (Jan 2024) only protected **logged-out** scraping of public data. Group posts need a logged-in account, which Meta's terms forbid for automated collection. Expect account bans, cease-and-desist letters, and a real risk to the App Store listing.
3. **Personal data.** The output would be names, phone numbers and reviews of private people. Vietnam's PDPL has been in force since 2026-01-01 and makes consent the main legal basis; it also bans trading personal data. GDPR and Indonesia's PDP law point the same way. A directory built from scraped contacts has no lawful basis.
4. **Product conflicts.** D10 says supplier content is never cached and never fed to the LLM, and ranking stays commission-neutral. Scraped reviews summarised by the guide would break the first rule.
5. **Safety/licensing liability.** Vietnam only allows Vietnamese citizens to hold guide cards, and unlicensed guiding is fined 5–10M VND. Bali's 2025 rules require licensed local guides. If *we* recommend an unvetted person and something goes wrong, the recommendation is ours.
6. **Quality.** Group posts are full of self-promotion and relatives vouching for each other. You also can't verify that a phone number belongs to the person praised in the post.

## 3. What to build instead (same user value)

**A. "Find me a driver" assist (user-driven, legal, cheap):**
- The guide persona drafts the ask for the user to post themselves, e.g. "3 adults, Ha Giang loop 4 days, English-speaking driver-guide, budget ~X". It also suggests which groups or subreddits to post in. The user posts it; we never touch the group.
- The user pastes a post or link, shares a screenshot, or forwards a WhatsApp contact. The guide extracts name, phone, languages, vehicle, price and claims into a `providers` row (`kind` = driver/tour_guide; `contact_enc` already exists). This counts as personal/household processing the user started, not scraping.
- Side-by-side compare of the 2–4 candidates the user collected. Flag missing info: licence, price includes fuel/tolls/entry, overtime rate, and whether the car has seatbelts.

**B. Crew-sourced "drivers our crews used" (the long-term moat):**
- After the trip, the recap asks "How was Made?" and collects a rating plus short tags.
- A provider only becomes visible to other crews after **the provider opts in**. We send them a claim link over WhatsApp, only after the user approves the exact text (Q-57). The provider confirms their listing, languages and area, and gives consent. That creates the lawful basis.
- Cold start: seed per destination with the 6 live-guide regions first. Ops can add vetted operators by hand.

**C. Marketplace fallback:** show Viator, Klook, Daytrip and GYG private-driver/guide products in supplier cards (verbatim, attributed, affiliate disclosure) when A and B return nothing.

## 4. Export trip plan for guide review

Recommended form, simplest first:
1. **Read-only share link** on `apps/web`: a tokenised, expiring, revocable URL that needs no login and works on any phone. It shows day-by-day stops, times, pickup points with map links, party size, languages, pace, must-dos and dietary flags (with consent). It leaves out budgets, private chats and member names beyond first names (C36 matrix).
2. **"Send to guide" via share sheet / WhatsApp** with prefilled text + the link. The user sends it, never us (Q-57).
3. **Guide replies on the page:** a form for a quote, suggested reorders and tips, with no account needed. Each reply becomes a **ChangeSet proposal** (C3) that the crew approves through the normal poll (C41). This is the differentiator: the guide's local knowledge flows back into the plan.
4. PDF / printable version as a secondary option; many drivers prefer a picture or PDF in WhatsApp.

Data fit: the plan already lives in `itinerary_versions`/`plan_days`/`plan_items`; the link snapshots a version id. The new pieces are a share-token table (forced RLS, privacy class) and one public read endpoint.

## 5. Suggested scope if pursued

| Slice | Effort | Depends on |
|---|---|---|
| Shareable plan link + WhatsApp send | S–M | web app, itinerary model |
| Guide-reply form → ChangeSet | M | C3/C41 flow |
| Paste/screenshot → `providers` extraction + compare | M | AI gateway, OCR path (D5) |
| Post-trip provider rating + opt-in claim link + cross-crew directory | L | recap, WhatsApp Business, moderation, consent records |
| Daytrip affiliate link-out | S | suppliers package |

This is new scope (not in product-decisions §1). It needs a founder decision and design screens before any build.

## Unresolved questions

- Is a cross-crew provider directory OK given D10 and commission-neutral ranking? Providers might later pay for placement; we would need a rule against it.
- Moderation/liability owner for user reviews of named individuals (defamation takedowns).
- Do we show guide licence status per country (VN guide card, Bali licence)? Who verifies it?
- Can guide replies on the share page propose edits, or only comment?

## Sources

- Meta Groups API removal: https://techcrunch.com/2024/02/05/meta-cuts-off-third-party-access-to-facebook-groups-leaving-developers-and-customers-in-disarray/ · https://smashballoon.com/doc/facebook-api-changes-affecting-groups-april-2024/
- Meta v. Bright Data: https://www.fbm.com/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/
- Viator product search: https://partnerresources.viator.com/travel-commerce/affiliate/search-api/
- GetYourGuide Partner API: https://code.getyourguide.com/partner-api-spec/
- Klook Bali private charter: https://www.klook.com/en-US/activity/94070-bali-private-car-rental-with-driver/
- Daytrip affiliate: https://affiliate.daytrip.com/ · https://daytrip.com/
- ToursByLocals advisor commission: https://karryon.com.au/community/toursbylocals-support-local-guides-earn-agent-commission/
- Withlocals partners: https://www.withlocals.com/info/partners/
- Google Places policies: https://developers.google.com/maps/documentation/places/web-service/policies
- Tripadvisor Content API FAQ: https://tripadvisor-content-api.readme.io/reference/faq
- Reddit API pricing: https://octolens.com/blog/reddit-api-pricing
- Vietnam guide licensing: https://learnvietnamese.com.vn/en/news/can-foreigners-become-tour-guides-in-vietnam.html
- Bali 2025 tourist rules: https://baliexpat.com/2025/04/07/balis-updated-tourist-regulations-heres-whats-allowed-and-whats-not/
- Vietnam PDPL: https://iapp.org/news/a/vietnams-pdpl-in-focus-what-to-know-and-watch-for
