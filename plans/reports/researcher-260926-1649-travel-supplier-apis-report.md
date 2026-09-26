# Critterpass: Can the guide act through Agoda, Trip.com and Klook? (Travel supplier APIs)

Date 2026-09-26 · Researcher report · Audience: founder (product owner) · Status: research, nothing built
Inputs: master synthesis §0.2 (C41, C43, C44), §6.2, §7, §12; tech-stack brief D12 and D-12; slices NT, PC, BM and DT. Every load-bearing claim was read on a primary page on 2026-09-26 (see Key claims). **H** = read on the provider's own page today. **M** = primary but partial or ambiguous, or read on Travelpayouts (an official affiliate network, i.e. secondary). **L** = inference or unverified.

**Session limits (read first):**
- The web-search budget was used up before this task started, so all research was direct page reads (curl, a browser and PDF text).
- Anything behind a partner login could not be read. That includes the Klook commission table, the Trip.com and Klook API docs, and the Trip.com Affiliate Agreement V3.
- GetYourGuide search pages showed a bot-verification wall. It was not bypassed, so GetYourGuide coverage is unverified.

**Backend note (your Hono decision):** nothing here depends on Supabase. All supplier adapters, click-out redirects, report ingestion, booking and cancel commands, and hold and status pollers live in the Hono `api` + `worker`. Three hard requirements for the host follow from the research:
- A **static egress IP**, because Agoda requires the partner's IP on a whitelist.
- **Outbound timeouts of up to 120 s** (Agoda's booking call).
- **No raw card data on our servers**. Agoda's Book API takes card number and CVC in the request (§4.1), so a direct Agoda booking integration would put the server in PCI scope.

---

## 0. Answer in five lines

1. **At launch you can connect to all three, but only as an affiliate.** You get links, widgets and search boxes. The user books and pays on Agoda, Trip.com or Klook, and that company is the merchant of record (MoR).
2. **Real APIs exist behind contracts:**
   - Agoda: the Demand API (search, book, cancel, amend).
   - Trip.com: the Open Platform distributor APIs (attractions, tours and car rentals), plus login-only hotel and flight APIs.
   - Klook: an Activity Search API and feeds "to selected partners", plus an agent API.

   None of these is self-serve. Each needs a commercial agreement, a feasibility or selection step and certification.
3. **None of the three offers a room "hold".** The closest real things are Agoda's free-cancellation or Book-Now-Pay-Later *bookings*. These need a payer and a card, under the Demand contract. **So "Held 2 ryokan rooms" cannot be true on day one with any provider researched.**
4. **The only researched path to real in-app booking with a timed hold, where Critterpass is not the merchant, is Viator's Full + Booking affiliate access.** Viator is the MoR, supports price and availability holds and a cancel API, and pays 8% commission. Access needs approval and certification.
5. **Recommended launch mix:**
   - Stays: affiliate deep links (Agoda for Asia, plus a second OTA), through Travelpayouts or direct.
   - Activities: Viator Full + Booking in-app, with Klook links for Bali, Kyoto and Vietnam.
   - Transfers: Klook, Trip.com or Kiwitaxi links, plus Grab's fare estimate with a deep link.
   - Flights: prices from Travelpayouts (already chosen). No flight booking.

   Apply now for Agoda Demand (Fulfill-Assisted model), Klook's API and Viator Full + Booking. Ship copy that claims only what the data proves (§9).

---

## 1. Context: which designed actions need a supplier

| Screen / feature | Designed promise | Supplier capability it assumes |
|---|---|---|
| 3c-8, F-103 | "Held 2 ryokan rooms in Gion, free cancel" | room hold, or a refundable booking; rate-level cancel deadline |
| 3c-12 | "I booked it" (canal boat), released on revert | activity booking and cancel API |
| 3f-1 / 3f-3 / 3f-4 / 4f-1, C43 | "Hold the rooms for 5 days", ROOMS HELD timer | hold with an expiry ≥ reply-by, or a free-cancel deadline |
| 3f-7 | release a room when a member drops out | room-level cancel or amend |
| 3j-1, C41 | "COOKING CLASS · 4 seats held for 20 min" | activity availability hold with an expiry |
| 3c-7, N-45 | Nintendo Museum lottery "entered all six of you" | a lottery API (none exists) |
| 3h-1 / 3h-2 | bookings wallet: vouchers, status, cancel | confirmations, status and voucher delivery |
| 3h-3, F-104 | "Made is 4 min away · booked by Tokek", BOOK next leg | ride or transfer booking plus live driver location |
| 3d-1, 3b-3, F-033 | month prices re-priced for crew airports | fare and hotel price data |
| 3k-5, F-115 | "Made rebooked", dinner moved, flight fixes | ground-vendor messaging; flight changes only if we issued the ticket |
| guide content (F-030) | photos, reviews, descriptions in guide cards | content licence covering display, caching and LLM use |

Founder rules applied: partner APIs where they exist, human-approved vendor messages, copy claims only what happened. §12 already stubs holds and rides for the MVP. This report tests whether those stubs can be made real, and when.

---

## 2. Criteria (tied to features)

| # | Criterion | Why it matters | Weight |
|---|---|---|---|
| K1 | Obtainable by a new startup at launch (no volume history) | full scope at launch; solo founder | High |
| K2 | Booking inside the app with the supplier as MoR | avoids travel-agent licensing, chargebacks and EU package liability | High |
| K3 | Real holds or free-cancel with an API cancel | 3c-8, 3f-*, 3j-1, 3f-7, revert | High |
| K4 | Content may be shown and cached, and used near the LLM | guide cards; Claude selects and words | High |
| K5 | Coverage of the 6 guide cities and Vietnam | guide quality | High |
| K6 | Commission and payout (rate, threshold, delay) | unit economics (AI ≈ $7 per crew-trip, tech brief §0) | Medium |
| K7 | Mobile attribution (app links, cookies) | revenue actually credited | Medium |
| K8 | Engineering load (certification, PCI, sandbox) | solo founder + agents | Medium |

---

## 3. Options matrix: programme types per provider

| Provider | Affiliate links / widgets | Content / search API | Booking API | B2B / agent | Obtainable at launch? |
|---|---|---|---|---|---|
| **Agoda** | Yes. Links, Hotel Power Ads, search box, data feeds. Application is reviewed; a website is required (FAQ) (H) | Demand API "Online Affiliates/MSE" model: Search API + Content API (H) | Demand API "Agoda Fulfill Assisted" (Agoda charges the customer) or "Partner Fulfillment" (partner charges) (H) | Demand API is B2B/B2C | **Affiliate: yes.** API: after feasibility, contract and certification; no demo keys (H) |
| **Trip.com Group** | Yes. Links, banners, search box, promo center, "Make My Booking". Onboarding asks for proof of business or identity; review takes 1–14 business days (H) | Affiliate "API" tool exists in the portal, docs login-only (M); Skyscanner Travel API only for "an established business with a large audience" (H) | Open Platform distributor APIs: Attractions & Tours (search, book, cancel, push) and Car Rentals (H); hotel and flight partner APIs are login-only (M) | Open Platform console / BD | **Affiliate: yes.** APIs: partner-by-partner (L) |
| **Klook** | Yes. Links, widgets, search boxes, banners, promo code. A website or blog is required (H) | "Activity Search API and product feed solutions to selected partners" (H) | Agent Marketplace / distributor API ("get connected with our API"), docs not public (M) | Agent Marketplace (klook.klktech.com) | **Affiliate: yes.** APIs: selected partners only (H) |
| Booking.com | New sign-ups go through CJ (H) | Demand API: needs **Managed Affiliate Partner** status and an Account Manager (H); MCP server for LLM apps for Strategic Partners (H) | Demand API "search, look and book" (H) | – | Links via CJ: yes. API: no (L) |
| Viator | Yes, 8%, 30-day cookie (H) | Basic access: instant and self-serve; Full access: approval (H) | **Full + Booking: in-app checkout, Viator is MoR** (H) | Merchant partner (you are MoR) | **Basic: yes, today. Full + Booking: approval + certification** (H) |
| GetYourGuide | Yes, at least 8% (H) | Partner API (OpenAPI spec is public, token issued by GYG) (H) | carts / bookings endpoints in the spec (H) | "Travel agents" track | Links: yes. API: token on request (L) |
| Travelpayouts | One account covering Agoda, Trip.com, Klook, GYG, Kiwitaxi, GetTransfer (M) | fare data (already chosen, D12) | – | – | Yes (already in the stack) |
| Duffel | – | flight search | Flights self-serve (test mode). Stays "request access". Card payments need approval (H) | you are the seller | Test yes; live after approval (M) |
| Hotelbeds | – | self-registered evaluation key (H) | Hotels / Activities / Transfers after certification (H) | B2B net rates (L) | Evaluation only (H) |
| Expedia Rapid | – | – | "You'll need to become a partner" (H) | – | No (L) |
| Grab | – | **Farefeed API**: ETA, fare range and a deep link that pre-fills the booking (H) | no consumer ride-booking API in the docs (H) | partner OAuth | Partner approval needed (L) |
| Mozio | widget, agent tool | Enterprise API: 180+ countries, 3,500+ airports (H) | via API (L) | agent tool | Enterprise sales (L) |

---

## 4. Deep-dives

### 4.1 Agoda (Booking Holdings)

**Programmes (H):**
- **Affiliate programme.** Uses Agreement "Online Affiliate v.2023".
- **Demand API** (developer.agoda.com/demand). It has three models:
  1. Online Affiliates/MSE: Search API only. Meant for price comparison sites.
  2. **Agoda Fulfill Assisted**: Search + Book API. "Agoda will directly charge your customers, provide post-booking customer services, and send hotel vouchers."
  3. Partner Fulfillment: the partner charges the card and runs customer service, with Cancel and Special Request APIs.

**Access (H):**
- Affiliate: "All applications are subject to a review process". "You must have a website before you sign up" (FAQ). The Agreement defines "Affiliate Website(s)" to include "mobile applications".
- Demand API process: feasibility study (technical, operational, commercial) → contract and vendor form → sandbox → certification → UAT in production (one test booking plus a cancellation) → customer-service configuration (usually 7–10 working days) → live.
- "Agoda does not provide demo accounts" before the commercial steps. Your IP must be whitelisted.

**Capabilities (Demand API, H):**

| Capability | Detail |
|---|---|
| Content API | feeds for hotels, room types, pictures, facilities, addresses and full info. Ratings are only `ratingAverage` and `numberOfReviews`; no review text was seen. Refresh at least weekly (daily recommended) |
| Search | up to 100 properties per request; `paymentModel` agency (pay at hotel) / merchant; `remainingRooms`; promotions |
| Book | `rooms[].count`: several rooms in one property per booking; adults 1–36 in total with at least 1 per room. One property per booking; "we cannot group multiple booking IDs to one reference ID" |
| Payment | **CC partners send card number, expiry, CVC and holder name**. Invoice partners leave it blank. Book-Now-Pay-Later inventory has a `bookNowPayLaterDate` |
| Holds | **none**. The closest is a refundable or BNPL booking |
| Cancel / amend | two-step Cancel then Confirm Cancel. Amendment API (dates, guest names, special requests; since Aug 2025). Fee-waiver request (hotel decides) |
| Status | poll BookingList / BookingDetail. Treat `processing=true` for more than 30 min as failed. Hotel confirmation number (HCN) has been in BookingDetail since Jul 2025. No webhooks seen |
| Limits / SLAs | rate limits "provided during onboarding" (HTTP 429). Timeouts: 30 s general, 60 s precheck, 120 s book. No published SLA |

**Content licence (affiliate agreement v.2023, H). These clauses decide how Critterpass may use Agoda data:**
- 3.1.1: display only the Agoda Data "as provided or made available by Agoda".
- 4.1.6: "shall not make any static copy of the Content".
- 4.3.2: must not "combine" Agoda Data "with its own content", nor "create derivative and/or new works" from it.
- 4.5.2: no price comparison without written agreement.
- FAQ: other content only "under the express permission of Agoda".

**Implication:** the guide's LLM must not summarise, rewrite or cache Agoda descriptions, reviews or photos. Agoda cards show only what Agoda's tools render. The Demand API contract terms were not visible; ask Agoda.

**Booking on a user's behalf (H):** clause 4.1.7 forbids "Reselling". Agoda may treat as reselling any booking where "payment ... is not directly from the person in whose name(s) such booking ... is made". Critterpass itself (or Pon) paying for rooms under the affiliate agreement is therefore out. A crew member paying on agoda.com is fine.

**Commission and payout:**
- Tiers: 4% for 1–50 departures a month, 4.5% for 51–300, 5% for 301+. Paid on (booking value − taxes) (agreement, H).
- The FAQ says "up to 7%", which conflicts with the agreement (M).
- Paid by the end of the month after departure, US$200 minimum, US$10 fee for international transfers. Agency (pay-at-hotel) bookings are paid 60 days after the month of departure (H).
- Through Travelpayouts: **6%** on accommodation (M).

**Mobile attribution (H):**
- Tracking uses the **HTTP referrer from a registered domain plus the CID**. A native app sends no referrer, so route clicks through a real page on `critterpass.app/go/…`.
- Whether Agoda accepts that bridge page, and whether the CID survives when the Agoda app opens instead, is unverified (L).

**Recent changes (H):**
- Jul 2025: HCN added.
- Aug 2025: Amendment API and fee waiver.
- Feb 2026: IDs moved from INT to LONG.
- Apr 2026: new user guide.
- Docs updated Jul 2026.

**Coverage:** listed properties "925,000+" (affiliate FAQ, dated) vs about 2.9M (Travelpayouts) (M). Asia strength and Kyoto ryokan depth were not measured (L).

### 4.2 Trip.com Group (Trip.com, Ctrip, Skyscanner, Qunar)

**Group (H):** the group's brands page lists Trip.com, Ctrip, Qunar and **Skyscanner**. Skyscanner's Travel API (flights, hotels, car hire) is for "an established business with a large audience", with a review "within two weeks". That is not realistic at launch.

**Affiliate programme (H):**
- Site operator: Trip.com Travel Singapore Pte. Ltd.
- Headline: "7% max basic commission"; 1.7M+ hotels, 600+ airlines, trains, 30,000+ tour and ticket partners, 39 countries/regions, 35 currencies.
- Cookies: **30 days on the web, 7 days in the app**.

Commission table (User Guide "2501"):

| Product | Rate |
|---|---|
| Hotels | 5% (0–199 completed bookings), 6% (200–999), 7% (1000+) |
| International flights | 0.5% (0–299), 0.8% (300+) |
| China domestic flights | US$0.6 per ticket |
| Trains | 2% |
| Other activities | 4% |
| Attractions & shows | 1.5% |
| Flight + hotel | 2 / 2.25 / 2.5% |
| Car rental, airport transfers, cruise, presale | 5% each |

Through Travelpayouts (M): hotels 5.5%, international flights 1%, tickets and attractions 1.36%, activities 3.6%, car 4.5%, airport transfer 4.5%.

**Payout (H):**
- Minimum US$200 / HK$1,500, paid in USD or HKD.
- Settlement starts on the 5th and takes 40–60 working days, so money arrives about M+2 to M+3.
- Commission is paid only after fulfilment (check-out, ticket issue, transfer done).
- The effective amount excludes promo codes, Trip Coins, child air tickets and insurance.

**Tools and limits (H):**
- FAQ: an affiliate link with specific hotel dates is "currently working on this feature". Affiliate links "must not" be modified.
- **"Make My Booking"**: "Make direct bookings for yourself or your customers" on Trip.com and earn commission. This is a human-concierge path, but using it for users probably makes Critterpass their agent (licensing: see §7).

**Agreement (H, locale strings):**
- Trip.com Affiliate Online Cooperation Agreement **V3** launches **2026-08-11**. Affiliates who do not click "Agree and Continue" by **2026-11-05** may be suspended.
- New clauses 3.2.7 and 3.2.8 cover traffic and booking fraud.
- The V3 text itself was not readable without a login.

**APIs (H/M):**
- **Vacation Open Platform** (open.trip.com):
  - Attractions & Tours Distributor API: auth, product info, reservation (search, book, cancel), categories, push.
  - Car Rentals Distributor API: basic data, price, order, notifications; prepaid.
  - Ride Hailing: supplier side only (distributor docs say "No Data").
  - Sandbox "Set up your integration" and "Code labs" exist.
- developer.trip.com lists Hotels, Flights, Trains, Tours, Car Rentals and Business Travel, all login-gated.
- Access criteria, holds, MoR and content licence for these APIs are **unverified (L)**.

**Coverage:** strongest in Asia (hotels, trains, Japan rail) (L). Transfers and car rental are sold globally (H).

### 4.3 Klook

**Programmes (H):**
- Affiliate: links, widgets, search boxes, banners, a personal promo code and bonuses.
- "Activity Search API and product feed solutions **to selected partners**".
- Agent Marketplace (B2B) and a distributor option: "free-to-use SaaS … or get connected with our API".
- Licences shown in the footer: HK Travel Agent Licence 354005, SG Travel Agent Licence 02851, and Taiwan. **Klook is the licensed seller.**

**Access (H):** "you must own a website and/or blog when signing up". The FAQ names "app developers" as welcome.

**Content (H):** use only "content generated using our promotional tools". Not "any other content on Klook's website (including … activity images and text copies)" without the Affiliate Manager. **So the LLM must not reuse Klook text or photos.**

**Commission and payout:**
- Rates are visible only after login (not verified). Through Travelpayouts: **5%** on all categories except "Special Activities" (2%) (M).
- 30-day window (H).
- **For bookings from 2026-07-01, commission is paid one month after the activity is completed or redeemed.** Older non-hotel bookings were paid three months after the booking date (H).
- Minimum US$150 (US$25 fee to withdraw early), 14 payout currencies (none is VND) (H).

**Holds / booking API / webhooks / sandbox / group limits:** not public (L).

**Coverage** (Klook search result counts, 2026-09-26, H):

| City | Results | Notes |
|---|---|---|
| Bali | 999+ | airport transfer: 81,226 reviews, "400K+ booked" |
| Kyoto | 999+ | – |
| Lisbon | 244 | – |
| Reykjavik | 211 | – |
| Cusco | 156 | low review counts |
| Mexico City | 135 | – |
| Nintendo Museum | no matching product | lottery only, as expected |

### 4.4 Alternatives for the gaps

| Provider | What was verified (H unless marked) | Fit for Critterpass |
|---|---|---|
| **Viator** (Tripadvisor) | Basic access: instant, no approval. Full: approval + certification. **Full + Booking: "Viator is the merchant of record and is responsible for handling customer service"**, in-app payment via a Viator iframe (`VIATOR_FORM`, 3DS) or your own form. `/bookings/hold` and `/bookings/cart/hold` (≤16 items) return `pricing.status=HOLDING` + `validUntil`, and availability `HOLDING` or `HOLD_NOT_PROVIDED`. Cancel quote and cancel; amendments. Standard policy: full refund up to 24 h before. Pages list "Mobile apps" and "Itinerary builder" as partner types. 8% commission, 30-day cookie; "no costs to get additional API access". Rate limits per endpoint over a rolling 10 s window; `/bookings/status` at most once every 3 min. Reviews and unique content must not be indexable | **Best in-app activity path** (3c-12, 3j-1, 3h-1). Coverage outside Asia is likely strong (L) |
| GetYourGuide | at least 8% commission, paid monthly; Partner API spec (tours, availability, carts, bookings; OpenAPI, TypeScript client can be generated); token issued by GYG | links now; API if a token is granted (L) |
| Booking.com | affiliate sign-up via CJ; Demand API needs Managed Affiliate status; v3.2 adds "cancel for less", cars (beta book) and attractions (beta, content and redirect only). **MCP server for LLM travel assistants** (Strategic Partners; "do not, by themselves, complete bookings"). Claude connector: search only. Must hide non-verified hosts for EEA users (DSA, 2025-02-25) and show total prices to US users (FTC, from 2025-05-12) | the licensed route for LLM search if SP onboarding is granted |
| Expedia Rapid | partnership required; launch requirements | later |
| Hotelbeds | self-registered evaluation key; go-live after certification; hotels, activities, transfers | B2B net rates make you the seller (L) |
| Duffel | $3 per order, 1% managed content, $2 per ancillary, 1500:1 search:book, $0.005 per excess search, 2% FX. Holds when `requires_instant_payment=false` (example given: all American Airlines offers) with `payment_required_by` and optional `price_guarantee_expires_at`. Stays on request, commission shared. Card payments need approval | flights only if Critterpass becomes the seller; not v1 |
| Kiwitaxi / GetTransfer (via Travelpayouts, M) | Kiwitaxi 9–11%; GetTransfer 25% new / 12.5% returning / 4.15% B2B, 150+ countries | transfer links |
| Mozio | 180+ countries, 3,500+ airports, 3,000+ providers; flight monitoring; enterprise API and agent tool | only with an enterprise deal |
| Welcome Pickups | site returned 403 (L) | unverified |
| **Grab** | **Farefeed API**: POST estimate returns services, ETA, min/max fare, `surgeNotice` and a **deepLink** that opens Grab with pickup and drop-off pre-filled. Partner OAuth (scope `ride.estimate`). No ride-booking or driver-tracking API listed | 3h-3 "CALL A CAR" in Bali and Vietnam |
| Gojek | not researched (budget) | L |
| Klook vs GYG in Japan and Bali | Klook depth verified (999+ each). GYG not verifiable (bot wall) | Klook links for Asia |

---

## 5. Feasibility matrix: designed action × provider

✅ = real and verifiable at launch · 🟡 = real after a partner contract or approval · 🔗 = link-out only (user books off-app) · ❌ = not offered

| Designed action | Agoda | Trip.com | Klook | Viator | Booking.com | Other |
|---|---|---|---|---|---|---|
| **Hold rooms** (3c-8, 3f-*) | ❌ no hold. 🟡 free-cancel or BNPL *booking* (Demand API) | ❌ (L) | n/a | n/a | 🟡 bookings via Demand; no hold (L) | ❌ none found |
| **Book rooms for 6** | 🔗 affiliate. 🟡 Book API (`count` rooms, one property) | 🔗 | 🔗 hotels exist (L) | n/a | 🔗 via CJ. 🟡 Demand | Hotelbeds / Rapid 🟡 |
| **Book activity** (3c-12) | ❌ | 🔗. 🟡 Open Platform A&T | 🔗. 🟡 agent API | ✅ Basic (links). 🟡 **Full + Booking in-app** | 🔗 attractions beta: redirect only | GYG 🔗 / 🟡 |
| **Seats held N min** (3j-1) | ❌ | L | L | 🟡 price and/or availability hold with `validUntil` | ❌ | – |
| **Tickets / lotteries** (3c-7) | ❌ | 🔗 tickets | 🔗 tickets; Nintendo Museum not sold | 🔗 / 🟡 | – | lottery: **never** (official site, per person) |
| **Transfer** (arrival) | ❌ | 🔗 5% | 🔗 (Bali deep) | 🔗 some | 🔗 cars | Kiwitaxi / GetTransfer 🔗, Mozio 🟡 |
| **Live car** (3h-3) | ❌ | ❌ (distributor docs empty) | ❌ (L) | ❌ | ❌ | Grab: ETA estimate + deep link only; the tracking is inside Grab |
| **Flights / rebooking** (3k-5) | ❌ | 🔗 0.5% | ❌ | ❌ | – | Duffel 🟡 only for tickets we sold; Travelpayouts 🔗 |
| **Price calendars** (3d-1) | 🟡 hotel rates via Search API | ❌ public | ❌ | – | 🟡 | **Travelpayouts** (flights, cached) ✅ |
| **Content for the guide** | 🔗 display via tools only; no derivatives or combining | L | promo-tool content only | display; reviews kept out of search indexes; LLM use not addressed (L) | **MCP for LLM apps** 🟡 | own curated DB ✅ |
| **Wallet / voucher / status** (3h-*) | 🟡 BookingDetail, HCN | 🔗 → email import | 🔗 → email import | 🟡 status + modified-since | 🟡 | F-101 forward/paste ✅ |
| **Cancel on revert / dropout** | 🟡 two-step cancel | ❌ (user does it) | ❌ | 🟡 cancel quote + cancel | 🟡 | – |

---

## 6. Realistic integration path

| Phase | Obtainable | Why |
|---|---|---|
| **R0 (now, 0–4 wks)** | Travelpayouts brand offers (Agoda 6%, Trip.com, Klook 5%, GYG 8%, Kiwitaxi, GetTransfer); Viator Basic API; Duffel test; Grab partner application; Hotelbeds evaluation key | self-serve or light review |
| **R1–R2 (weeks 4–12)** | Direct affiliate accounts (Agoda review; Trip.com proof of business, 1–14 days; Klook needs the website). **Apply** for Viator Full + Booking, Agoda Demand (Fulfill Assisted), Klook Activity Search API, Trip.com Open Platform A&T | a company entity is needed (tech brief D-11: Singapore) |
| **R3 launch** | Links + Viator in-app booking **if** certification has passed; otherwise Viator links | certification time is unknown (L) |
| **After volume** | Agoda Demand in-app hotel booking (free-cancel or BNPL, cancel, amend); Booking.com Managed Affiliate + MCP; Klook API; Mozio | each gate is commercial (feasibility, "selected partners", "large audience") |
| **Never / not v1** | room holds; lottery entry; booking rides inside Grab or Gojek; rebooking third-party flights; Critterpass as MoR | no API, or it creates licensing and liability |

Unknown for all partner APIs: the volume thresholds. None publishes numbers. Agoda: "feasibility study". Klook: "selected partners". Viator: "basic qualifications". Skyscanner: "large audience".

---

## 7. Commercial and legal notes

**Merchant of record by model:**

| Model | Who charges the card | Who runs customer service | Critterpass liability |
|---|---|---|---|
| Affiliate link (Agoda, Trip.com, Klook, GYG, Viator Basic/Full, Booking via CJ) | supplier | supplier | publisher: accurate and non-misleading display; disclose affiliate links |
| Viator Full + Booking | **Viator** ("merchant of record") | Viator | the app UI, the price shown, the iframe host page |
| Agoda Fulfill Assisted | **Agoda** ("directly charge your customers") | Agoda | the card data goes through our Book request → PCI scope (L on the size of that obligation) |
| Agoda Partner Fulfillment, Viator Merchant, Klook agent, Hotelbeds, Duffel | **Critterpass** | Critterpass | refunds, chargebacks, supplier failure, travel-agent licensing (SG: unverified), and possible **EU package organiser** status when bundling |

Other rules:
- **Reselling.** Agoda 4.1.7 bans affiliates buying bookings to pass on to others. Critterpass or Pon must never pay for a stay under the affiliate agreement.
- **EU Package Travel Directive** (H):
  - Linked travel arrangements include a second service booked "within 24 hours" through a targeted invitation.
  - Organisers are liable for performance and must hold insolvency protection.
  - Revision: provisional agreement **2025-12-02**, then 28 months to transpose.
  - Whether an affiliate that takes no money can be an LTA facilitator is a question for counsel. The risk rises sharply once Critterpass is MoR for two services on one trip.
- **Price display.**
  - US: FTC fee rule from 2025-05-12; total price first for lodging (H, via Booking.com's docs).
  - EU: DSA trader verification for EEA users (H).
  - Agoda: "Do not compare the price/inventory you receive in the API with our website".
  - So show "price seen at {time} on {supplier}".
- **Commissions and cancellations.** Every programme pays only on completed stays or activities. Free-cancel steering lowers realised commission. Cash arrives 1–3 months after the trip.
- **App stores** (H):
  - Apple 3.1.3(e): physical goods or services consumed outside the app must use "purchase methods other than in-app purchase". Guidelines last updated 2026-06-08.
  - Google Play exempts physical services, including "airfare" and "tickets for live events".
  - Commission revenue carries no store fee.
  - Guard against Apple 4.2.2, which rejects apps that are mainly "a collection of links".
- **Ranking by commission.** If the guide favours higher-commission suppliers, disclose it ("sponsored" / "we may earn a commission"), consistent with the 4e-2 "sponsored picks" row (L on the exact wording required).

---

## 8. RECOMMENDATION

**Primary: "Affiliate-first, never merchant of record, one real in-app rail (Viator)"**

| Designed action | Launch implementation |
|---|---|
| Stays (3c-8, 3f-*) | Guide shortlists a property and deep-links to Agoda (Bali, Kyoto, Vietnam, Asia) or a second OTA (Trip.com, or Booking.com via CJ). Any organiser can open it. The booking enters the wallet by forward/paste (F-101), and the wallet shows the **real** cancel deadline parsed from the confirmation. Hold rows stay hidden (as §12 already proposes). "Reply-by" drives N-09 |
| Activities (3c-12, 3j-1) | **Viator Full + Booking** in-app via the iframe on `critterpass.app/checkout` in a WebView: hold, then payment by the member, then book. Klook links for Asia. GYG links as a fallback |
| Tickets / lotteries | links + deadline tasks (N-45). Never enter anyone |
| Transfers | pre-trip airport transfer links (Klook in Bali, Trip.com, Kiwitaxi, GetTransfer). In-trip "CALL A CAR" = Grab Farefeed estimate + deep link (Bali, Vietnam); other cities get a phrase card + taxi or Uber deep link |
| Flights | Travelpayouts cached prices (D12) and links. No booking or rebooking |
| Content | the guide speaks from the curated POI DB. Supplier cards render supplier data verbatim, attributed and uncached, per terms |

- **Money model:** supplier or Viator is MoR, no card data on the Hono server, IOU splits stay ledger-only (C24).
- **Distribution:** start through **Travelpayouts** (a single account and payout; better Agoda rate at low volume: 6% vs 4%). Move to direct programmes once monthly volume passes Agoda's 301-departure tier or Trip.com's 1,000-booking tier.

**Runner-up: "Agoda Demand in-app hotels + Viator"**
- Add Agoda Fulfill Assisted, where Agoda is MoR, for real free-cancel or BNPL bookings with API cancel and amend.
- This turns 3c-8 into the truthful "Booked 2 rooms, free cancellation until {date}" and makes 3f-7 room release real.
- Costs: Agoda approval, certification and UAT, a PCI-scoped card path, and one payer per booking.

**Flip conditions:**

| If | Then |
|---|---|
| Agoda approves the Demand API **and** a PCI-safe card path exists (tokenising proxy or Agoda-hosted form; unverified) | move to the runner-up for stays in Asia |
| Viator denies Full + Booking, or certification slips past R3 | Viator Basic links; 3j-1 copy becomes "Book now · seats not held" |
| Klook grants the Activity Search API | Klook becomes primary for Bali, Kyoto and Vietnam activities |
| Booking.com grants Strategic Partner + MCP | use it for the LLM stay search tool (licensed for LLM use) |
| A corporate entity + travel licence + counsel sign-off exist, and demand justifies it | consider MoR models (Duffel flights, Hotelbeds). Not before R5 |

---

## 9. Truthful copy per action

| Action | May say (condition) | Must not say |
|---|---|---|
| Room shortlist | "Free-cancel rooms at {hotel} on Agoda, from ~$X a night (seen {time})". Needs a Search API or a user-provided price; with links alone show only "free-cancellation filter on" | "Held", "I booked", a cancel date before a booking exists |
| Room booked | "Booked by {member} on Agoda · free cancellation until {date}" (parsed from the confirmation) | "Pon booked it" |
| Activity hold (Viator) | "Price held until 14:32" (when `pricing.status=HOLDING`); "Seats held until …" only when availability `HOLDING` | "4 seats held for 20 min" when `HOLD_NOT_PROVIDED` |
| Activity booked (Viator) | "Booked · Viator ref BR-…" after book returns confirmed; "Waiting for the operator" while pending | "Confirmed" while pending |
| Activity via link | "Tap to book on Klook". After an import: "Rin booked it" | "I booked it" |
| Revert / dropout | Viator: "Cancelled · full refund" (after the cancel succeeds); links: "Cancel on Agoda by {date} to avoid the fee" | "Released" when nothing was held |
| Lottery | "Entries close {date}. Each of you enters on the official site" | "I entered all six of you" |
| Ride | "Grab estimates Rp X–Y, about 4 min away · Open Grab" | "Made is 4 min away · booked by Tokek" (unless provider tracking data exists) |
| Transfer booked | "Airport pickup booked on Klook (from your email)" | live car on our map |
| Flight delay | "SQ 938 delayed 2h10 (source, time). Here's what I'd change" | "Rebooked your flight" |
| Vendor message | "Draft ready — send?" → "Sent 10:45, waiting" → "Villa replied: yes" | "Villa knows" before a reply |
| Prices | "~$520 from SIN (recent searches)" | exact prices without a timestamp |

---

## 10. Costs

**Access fees:**

| Item | Cost | Source |
|---|---|---|
| Affiliate programmes (Agoda, Trip.com, Klook, GYG, Viator, Travelpayouts) | free to join | H |
| Viator higher API access | "no costs to get additional API access" | H |
| Agoda Demand / Booking Demand | no fee published; contract | L |
| Duffel (if ever used) | $3/order + 1% managed content + $2/ancillary + 2% FX + excess search $0.005 | H |
| PCI tokenising proxy (runner-up only) | not researched | L |

**Build effort (agent-assisted estimates, L):**
- Link builder + click-out bridge + sub-ID per trip: 1–2 wks.
- Report ingestion: 1 wk per network.
- Viator Full + Booking with holds, iframe, status polling, cancel and certification: 4–6 wks.
- Agoda Demand (runner-up): 5–8 wks + UAT.
- Grab Farefeed: 1 wk.

**Revenue illustration** (Kyoto crew of 6, design figures, L): stays $470/pp and fun $140/pp, 100% booked through Critterpass.

| Stream | Maths | Commission |
|---|---|---|
| Stays | $2,820 × 4–6% | $113–169 |
| Activities | $840 × 5–8% | $42–67 |
| Flights | $3,120 × 0.5–1% | $16–31 |
| **Total at 100% attach** | | **≈ $170–270** |
| At a realistic 15–30% attach | | **≈ $25–80 per crew-trip** |

- That covers the ≈ $7 AI cost per crew-trip (tech brief).
- Cash lands 1–3 months after the trip, subject to the US$150–200 payout thresholds.

---

## 11. Risks

| # | Risk | L×I | Mitigation |
|---|---|---|---|
| 1 | Design promises holds that no supplier offers (3c-8, 3f-*) | H×H | copy table §9; hide hold rows; Viator holds for activities only |
| 2 | API approvals slip or are denied (no published criteria) | H×M | launch on links; apply now; Travelpayouts fallback |
| 3 | Content terms breached by LLM summaries or caching (Agoda 4.1.6 / 4.3.2; Klook FAQ) | M×H | curated DB for the guide; supplier cards rendered verbatim, not cached |
| 4 | Attribution lost in the app (Agoda referrer; Trip.com app cookie 7 days) | M×M | bridge page on the registered domain; sub-IDs; confirm with account managers |
| 5 | Pon or Critterpass pays under the affiliate agreement (Agoda reselling) | L×H | never; organiser pays on the supplier's site |
| 6 | Becoming MoR by accident (Agoda Partner Fulfillment, Klook agent, "Make My Booking" for users) | M×H | do not sign those models before counsel and licensing |
| 7 | PCI scope (Agoda card fields) on our Hono server | M×H | runner-up only with a tokenising proxy or supplier-hosted form |
| 8 | Unaccepted affiliate agreement changes (Trip.com V3 by 2026-11-05) | M×M | calendar each programme's T&C; accept updates |
| 9 | Commission lost to cancellations; payouts 1–3 months late | H×L | model cash flow; don't count bookings as revenue |
| 10 | LatAm and Iceland thin on Klook (Cusco 156, Mexico City 135) | M×M | Viator / GYG for Lisbon, Iceland, Mexico City and Cusco |
| 11 | Agoda IP whitelist needs a static egress IP | M×M | pick a Hono host with static outbound IPs (the host decision is open) |
| 12 | App Review 4.2.2 "collection of links" | L×M | links are secondary to core features |

---

## 12. Founder decisions

1. **Accept "no room holds" at launch.** Rewrite 3c-8, 3f-1, 3f-3, 3f-4 and 4f-1 copy to "free-cancel", or keep holds as Viator-only for activities (Q-48, C43).
2. **Merchant-of-record stance:** never MoR in v1 (recommended), or plan for licensing, insurance and the EU package regime later.
3. **Distribution:** Travelpayouts first (recommended) or direct programmes from day one.
4. **Legal entity to sign partner contracts.** This follows D-11 (Singapore recommended). Contracts need it before R1.
5. **Viator as the in-app activity rail.** Apply for Full + Booking now.
6. **Apply to Agoda Demand (Fulfill Assisted) now,** accepting the PCI work if approved.
7. **Commission-aware ranking:** allowed with disclosure, or strictly neutral.
8. **Rides:** accept "Open Grab" + estimate in place of the 3h-3 live car (update the 3h-3 design).
9. **Lottery:** accept reminder-only (already proposed in §12).

---

## 13. Key claims

| Claim | Source URL | Date | Conf. |
|---|---|---|---|
| Agoda Demand API has three models (MSE Search-only; Fulfill Assisted, where Agoda charges and serves; Partner Fulfillment) and a feasibility → certification → UAT → CS config (7–10 days) process | https://developer.agoda.com/demand/docs/getting-started ; https://developer.agoda.com/demand/docs/faq | 2026-09-26 | H |
| Agoda: no demo accounts before commercial steps; rate limits given at onboarding; ≤100 properties per search; no grouping of bookings; amendment API | https://developer.agoda.com/demand/docs/faq | 2026-09-26 | H |
| Agoda Book API: `rooms[].count`; CC partners send card number, expiry, CVC, holder; BNPL date; timeouts 30/60/120 s | https://developer.agoda.com/demand/docs/json-book-api ; …/best-practices-certification-process | 2026-09-26 | H |
| Agoda changelog: HCN Jul 2025, Amendment + fee waiver Aug 2025, INT→LONG Feb 2026, user guide Apr 2026 | https://developer.agoda.com/demand/changelog | 2026-09-26 | H |
| Agoda affiliate agreement v.2023: apps included; no static copy; no combining or derivatives; reselling ban; 4 / 4.5 / 5% tiers; US$200 minimum | https://partners.agoda.com/Content/pdf/Agoda_OnlineAffiliateAgreement.pdf | 2026-09-26 | H |
| Agoda FAQ: review process; website required; HTTP-referrer + CID tracking; "up to 7%" | https://partners.agoda.com/en-us/faq.html | 2026-09-26 | H (conflicts with the agreement) |
| Trip.com affiliate: 7% max basic; cookies 30 days web / 7 days app; 1.7M hotels | https://www.trip.com/partners/index | 2026-09-26 | H |
| Trip.com commission table by product and tier | https://pages.trip.com/affiliates/online/Trip.com%20Affiliate%20Platform%20User%20Guide%20(2501).pdf | 2026-09-26 | H |
| Trip.com payout US$200, settlement 40–60 working days, paid after fulfilment; dated links "working on this feature" | https://www.trip.com/partners/help/faq/commission ; …/faq/tools | 2026-09-26 | H |
| Trip.com Agreement V3 launches 2026-08-11, accept by 2026-11-05; onboarding requires proof of business, 1–14 days | partner portal locale bundle (ak-s-cw.tripcdn.com, from https://www.trip.com/partners/) | 2026-09-26 | M |
| Trip.com Open Platform distributor APIs: Attractions & Tours (search, book, cancel, push); Car Rentals; Ride Hailing supplier-only | https://open.trip.com/ ; https://open.trip.com/docs?bu=0&role=1 | 2026-09-26 | H |
| Skyscanner Travel API: "established business with a large audience"; Skyscanner is a Trip.com Group brand | https://www.partners.skyscanner.net/product/travel-api ; https://group.trip.com/brands | 2026-09-26 | H |
| Klook: website required; API and feeds only for selected partners; no reuse of content; payout change for bookings from 2026-07-01; US$150 minimum | https://affiliate.klook.com/v3/affsrv/feedback/faqcontent/no-login (FAQ at https://affiliate.klook.com/help/) | 2026-09-26 | H |
| Klook distributor API/SaaS; HK / SG / TW travel agent licences | https://www.klook.com/en-US/partner/ ; https://affiliate.klook.com/ | 2026-09-26 | H |
| Klook result counts: Bali 999+, Kyoto 999+, Lisbon 244, Reykjavik 211, Cusco 156, Mexico City 135 | https://www.klook.com/en-US/search/result/?query=… | 2026-09-26 | H (point in time) |
| Travelpayouts rates: Agoda 6%, Klook 5% / 2%, Trip.com 5.5% hotels, GYG 8%, Kiwitaxi 9–11%, GetTransfer 4–25% | https://www.travelpayouts.com/en/offers/{brand}-affiliate-program/ | 2026-09-26 | M |
| Viator access levels; Full + Booking: Viator is MoR; iframe or own form; holds; 8% commission; 30-day cookie | https://partnerresources.viator.com/travel-commerce/levels-of-access/ ; …/affiliate/ ; https://docs.viator.com/partner-api/technical/ | 2026-09-26 | H |
| Booking.com affiliate via CJ; Demand API needs Managed Affiliate; v3.2 changes; MCP server for Strategic Partners | https://www.booking.com/affiliate-program/v2/index.html ; https://developers.booking.com/demand/docs/getting-started/prerequisites.md ; …/demand/news.md ; …/mcp-server/docs/about.md | 2026-09-26 | H |
| Booking.com: FTC fee rule from 2025-05-12; DSA trader filter from 2025-02-25 | https://developers.booking.com/demand/docs/compliance/ftc-compliance.md ; …/demand/news.md | 2026-09-26 | H |
| Duffel fees; hold orders; Stays on request; card payments need approval | https://duffel.com/pricing ; https://duffel.com/docs/guides/holding-orders-and-paying-later ; …/getting-started-with-stays ; …/collecting-customer-card-payments | 2026-09-26 | H |
| Hotelbeds self-registered evaluation key; go-live after certification | https://developer.hotelbeds.com/ | 2026-09-26 | H |
| Expedia Rapid requires partnership | https://partner.expediagroup.com/en-us/solutions/build-your-travel-experience/rapid-api | 2026-09-26 | H |
| GYG: at least 8% commission; Partner API spec with carts and bookings; token issued by GYG | https://partner.getyourguide.com/en-us/ ; https://code.getyourguide.com/partner-api-spec/ | 2026-09-26 | H |
| Grab Farefeed: estimate + deep link; partner OAuth | https://developer.grab.com/docs/partner-farefeed/ | 2026-09-26 | H |
| Mozio: 180+ countries, 3,500+ airports, enterprise API | https://www.mozio.com/ | 2026-09-26 | H |
| Apple 3.1.3(e) physical services must not use IAP; guidelines updated 2026-06-08 | https://developer.apple.com/app-store/review/guidelines/ | 2026-09-26 | H |
| Google Play: billing not used for physical services incl. airfare | https://support.google.com/googleplay/android-developer/answer/9858738 | 2026-09-26 | M (summarised fetch) |
| EU PTD: 24 h LTA rule; revision agreed 2025-12-02; 28-month transposition | https://commission.europa.eu/law/law-topic/consumer-protection-law/travel-and-timeshare-law/package-travel-directive_en | 2026-09-26 | M (summarised fetch) |

---

## 14. Unresolved questions

1. What are Klook's direct affiliate commission rates by category, and what are its Activity Search API selection criteria (login-gated)?
2. What does the Trip.com Affiliate Agreement V3 say about apps, content, LLM use and "Make My Booking" for third parties? Who can use the Open Platform distributor APIs, and do they support holds?
3. What volume or qualification does each of these require: Viator Full + Booking ("basic qualifications"), Agoda Demand (feasibility study), Booking.com Managed Affiliate or Strategic Partner?
4. Does the Agoda CID survive a link opened from an app (a bridge page, or the Agoda app via Universal Link)? Is a `critterpass.app/go` bridge acceptable under the anti-cloaking clauses?
5. Is there a PCI-safe way to use the Agoda Book API (a hosted form or a token proxy)? Does Agoda Fulfill Assisted still need raw card fields from us?
6. Do Viator's terms allow showing API content next to LLM-written guide text, or passing titles and descriptions to Claude as input?
7. How long does a Viator availability or pricing hold last in practice (`validUntil`)? How often is it `HOLD_NOT_PROVIDED` in Bali and Kyoto?
8. Kyoto ryokan depth on Agoda, Trip.com and Booking vs Rakuten Travel / Jalan (not measured). GYG and Viator depth in Cusco, Mexico City and Iceland (bot wall; unverified).
9. Singapore Travel Agents Act: does an affiliate app, or a Viator Full + Booking reseller where Viator is MoR, need a licence? Vietnam tourism-law exposure for a VN-resident founder?
10. EU PTD after the revision: can a no-payment affiliate that links several suppliers for one trip be a "facilitator"?
11. Does Travelpayouts allow in-app (native) traffic for each brand? What are its payout thresholds and methods from Vietnam or Singapore?
12. Gojek and Uber deep-link parameters for Bali, Mexico City and Lisbon; Welcome Pickups partner terms (site returned 403).
