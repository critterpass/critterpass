# Critterpass: web, deep links, store and social assets. Design analysis

Date 2026-09-26. Scope: `Site - Home/Tips/Tip Article/Invite/Referral/Legal/Header/Footer`, `Store Shot`, `Critterpass Store Assets`, `Critterpass Social Kit`, `App Icon` (all `.dc.html` in `design/`). Also the in-app invite screens 3a-10..3a-13 (images viewed) and the share/link screens found in `screens.json` by text (3f, 3m, 3o, 4d and others; text only). Stack-agnostic. Companion report: `design-analysis-260926-1143-onboarding-home-report.md` (F8/F9 cover the in-app invite UI; this report is the canonical **link contract**, **web** and **asset** spec).

Render note: `doodle-art` draws lazily through an IntersectionObserver, so full-page captures show empty critter cards (Home locals, pass grid, Tips cards, social carousel). The exporter pipeline must force every sticker to draw (see §4.5).

---

## 0. Key findings (top 12)

1. **One link namespace already exists in the design: `critterpass.app/i/{CODE6}`.** Referral (`/i/WINST8`), crew/trip join (`SUNNY4`, `BALI6X`) and the personalised seat invite (3a-10 "RIN, YOU'RE COMING TO BALI") all need the same resolver. Recommend `/i/{code}[/{seatToken}]`: a public, rotating 6-char code plus an optional long opaque seat token that is the only key to invitee PII. Details in §2.
2. **Deferred deep linking is the hardest item.** Firebase Dynamic Links is gone (Aug 2025) and Google Play Instant has been retired (Dec 2025). Android is deterministic through the Play Install Referrer. iOS has no deterministic path except the clipboard (UIPasteControl), an App Clip, or a post-sign-in phone match. The 6-char code (3a-11) must stay first-class.
3. **The web invite page shows crew data to anyone who holds the link:** initials, dates, per-person cost, 3 draft days, crew name. It correctly leaves out the invitee's name, which only the app shows. The page needs forwarded-link, bot-preview, enumeration and expiry controls. Link-preview bots must not count as "opened" (3f-6/4f-1 "Opened it 3 times", "UNOPENED").
4. **The Referral page is a signed-in personal dashboard** (stamps, friends list with statuses), but the site has no auth and the app has no referral screen. Scope decision needed (§1.5).
5. **Naming collision on "Gold cover":** a referral reward (5 stamps) and the Pass+ upgrade visual (4a-3 "gold cover slides over"). This risks users believing referrals unlock Pass+.
6. **Legal drafts contradict the product and miss required documents.** Examples: privacy lists "name, email, photo" but not phone, contacts-prefill, calendar, inbox import, dietary data, camera, live crew location or the recap "map trail". Terms have no subscription (Pass+/Boost/gift) or referral section, but the Referral page links to `#terms`. Terms say settle-up money moves through "our payment processor", while the money slice assumes no in-app money movement. There is no account-deletion web URL, which Google Play requires.
7. **Store badges are custom pills** ("Download on the APP STORE", "Get it on GOOGLE PLAY"). Apple and Google badge rules require the official artwork for that wording. Swap the badges in the `#get` section and the hero. The header "GET THE APP" pill is fine.
8. **App Store preview frame 1 is staged outside the app** (a fake group chat). Apple wants preview footage captured from the app, and the design note admits frame 1 isn't. Rework it as in-app footage with overlaid text, or accept the rejection risk.
9. **The store screenshots are hand-built mock UI (`Store Shot` n=1..6), not captures,** and the same component feeds the Home "A look inside" strip. Keep one source. Before submission, make sure the mocks match the shipped UI (accuracy review).
10. **The critter renderer (~140 KB Canvas2D, seeded and deterministic) cannot run in Satori/edge OG renderers.** Plan: pre-render a **sticker atlas** at build time with headless Chromium, then compose OG and share images from PNG/WebP. The social kit and store frames can export straight from HTML with headless Chromium, because they are already at export size.
11. **Tokens are shared almost 1:1 with the app**, with small drifts: card surface `#221e3d` on the site vs `#1f1b38` in the app, paper-2 `#fffaf0` vs `#fffdf6`, and 12 different Archivo width values (60–84%, where 60 is below the axis minimum of 62). Consolidate into one DTCG token source (§5).
12. **2026 compliance items:** EU AI Act Art. 50 transparency is enforceable since 2026-08-02, which affects the AI guide personas and the "By Tokek" bylines on Tips. The Texas App Store Accountability Act is enforceable since July 2026 (age signals API). The App Store now has a new age-rating tier set. Google Play needs Data safety, a background-location declaration and a "Contains ads" label (free tier has sponsored picks).

---

## 1. Page inventory

Global: sticky `Header` (logo = `App Icon` component, `iconPick` face|passport|stamp|sticker; nav How it works `#how` · The locals `#locals` · Tips · Bring your crew; yellow "GET THE APP" → `#get`; active-dot per page). `Footer` (APP: How it works/The locals/The pass · CREW: Tips/Bring your crew/Join with a code · LEGAL: Privacy/Terms · FOLLOW: Instagram/TikTok/X (all `href="#"`), giant CRITTERPASS wordmark, sleeping Tokek, "© 2026 CRITTERPASS · MADE ON THE ROAD"). Layout: max-width 1240, gutter `clamp(20px,4vw,48px)`, auto-fit grids `minmax(min(100%,420–460px),1fr)`; no breakpoints.
- **MISSING globally:** mobile nav (header just wraps), 404/500, cookie/consent, help centre, account deletion page, email capture/newsletter, language switcher, `hreflang`, favicon/manifest spec, social handle URLs.

### 1.1 Home (`Site - Home`)
| # | Section (anchor) | Content / copy theme | CTA | Dynamic / motion |
|---|---|---|---|---|
| 1 | Hero `#top` | chips "GROUP TRIP PLANNER", "NEW · iOS + ANDROID"; H1 CRITTER/PASS (Archivo 900 @64%); "Group trips, planned with the locals. The locals happen to be animals."; Caveat typewriter "Tokek's already found you a villa." | App Store / Google Play pills → `#get` | passport card with Tokek + 4 stickers pop-in (9 s once) then float; "LOCALS ONLY EST. 2026" stamp; `tg-type` |
| 2 | City ticker | 12 cities + critter names (6 guides + Cụ Rùa, Chép, Roucou, Pizza, Drac, Twiga) | – | `tg-motion fx=marquee` 30 s, tilted yellow band |
| 3 | Group chat | "THE BALI SIX · 247 UNREAD" chat pile; "EVERY TRIP STARTS IN THE GROUP CHAT." | – | bubbles stagger 700 ms loop 9 s; Caveat "← we've all been in this chat" |
| 4 | How it works `#how` | "FROM 'IDK' TO WHEELS DOWN", 4 stops: SWIPE TO PICK / ASK THE LOCAL / PLAN TOGETHER / SPLIT IT | – | tilted cards, dotted route, drag demo loop |
| 5 | The locals `#locals` | "EVERY PLACE HAS A LOCAL", 6 guide cards (HELLO, I'M · n/06 · city·species · name · one-liner), colours per guide | "hover to say hi" | bob per card (dur 2400–3000). **Hover-only interaction: needs a tap/focus equivalent** |
| 6 | The pass `#pass` | "YOU CAN'T BUY THEM. YOU HAVE TO GO." 150 LOCALS · 61 PLACES; egg-hatch loop → Chép #005; 20-tile dex grid (#001…#121, every 4th of 5 locked) | – | wobble→burst→confetti 5.2 s loop. **Counts must come from `critters-data.js`, not hardcoded** |
| 7 | Screens | "A LOOK INSIDE · scroll along the route →" 6× `Store Shot` (prop `platform` ios/android) | – | horizontal scroll strip; could switch frames by UA |
| 8 | Get the app `#get` | boarding-pass card "PLAN THE TRIP. MEET THE LOCALS." "Free on iPhone and Android. Start a crew, or join one with the code a friend sent you." "ADMIT: THE WHOLE CREW", "GATE ✦ ANYWHERE" | store pills + "I have a code →" (→ Invite/join) | Tokek cheer |

Copy themes: group-chat pain → local guide persona → collect-by-going → one trip strip. Terminology clash: "locals" = the 6 guides (section 5) **and** the 150 collectibles (section 6). Pick one term per concept.

### 1.2 Tips index (`Site - Tips`)
- Hero "THE CRITTERPASS JOURNAL · TIPS FROM THE LOCALS"; dek "Written with our guides, checked by people who've been."; Caveat "new every Thursday"; tanuki + puffin stickers.
- Filter chips ALL · PLANNING · MONEY · ON THE TRIP · CITY GUIDES (client-side state). Featured card is shown only for ALL/PLANNING (big critter, speech bubble "Vote by Friday?", meta "PLANNING · 6 MIN READ", byline "Tokek, Bali · Sept 24").
- Grid of 7 posts (cat pill, title, dek, "AJO, MEXICO CITY · 4 MIN", critter kind/pose/seed, bg colour, hover tilt). Empty state: "Nothing here yet. Pon is still writing."
- CTA band "Or just ask the guide directly." → GET THE APP.
- Gaps: no pagination, search, category URLs, RSS or author pages.

### 1.3 Tip article (`Site - Tip Article`)
- Cover (category colour bg, "← ALL TIPS", pill "PLANNING · 6 MIN READ", H1, byline sticker "By Tokek, Bali · SEPT 24, 2026", 2 chat bubbles + big bobbing critter).
- Body (max 700): lede (23px), numbered sections 01–05 (Geist Mono number + Archivo H2 + paragraphs), pull quote card ("…every rule looks rigged." + Caveat "— me, every single time" + cheer sticker).
- **In-app CTA block** "3 OPTIONS · DO THIS IN CRITTERPASS · Start a vote…" → GET THE APP. Should deep-link to the feature (`/app/vote/new`), falling back to the store.
- Share row: Copy link, "Send to the group chat" (both `#`).
- KEEP READING: 3 related (cat, title, critter tile).
- Voice: first-person guide ("Here's how I run it with every crew that lands in Bali"). This is AI-persona authorship, so it needs disclosure (§3.4).

### 1.4 Invite landing (`Site - Invite`), personalised by link
| Field shown | Example | Source | Public-safe? |
|---|---|---|---|
| inviter first name + destination | "WINSTON WANTS YOU IN BALI" | invite → inviter, trip.destination | yes (no invitee name on web, keep it that way) |
| member avatars (initial + colour) + open seat "?" | M A J R ? | crew members | initials only; **mock mismatch**: app 3a-10 shows W M A J with the invitee as seat 5; the site shows M A J R. Unify |
| seat line | "4 ALREADY IN · 1 SPOT WITH YOUR NAME" | seats taken/cap, seat reserved | yes |
| chips | OCT 12–19 · ~$1,240 EACH · THE BALI SIX | trip dates, per-person estimate + currency, crew name | cost is sensitive-ish, so show a "~" estimate only |
| guide draft excerpt | "TOKEK'S DRAFT · 3 OF 8 DAYS" + 3 rows (day, dow, colour, title, note) | trip draft highlights (organiser-picked or top-3) | yes, if the organiser opted in |
| guide sticker | gecko wave (Tokek) | trip.guide | yes |
| invite code tiles | S U N N Y 4 (tilted) | CODE6 | yes |
| expiry countdown | "EXPIRES IN 3D 23:12:04" (`tg-count` dhms) | code.expires_at | yes |
| QR (placeholder) | "ON YOUR COMPUTER? Scan…app opens straight into the Bali Six, or the store" | QR of `https://critterpass.app/i/{code}[/{seat}]?src=qr` | yes |
| primary CTA | "JOIN THE BALI SIX" (`#`) | → app via UL-trigger domain or store (§2.4) | – |
| store buttons | APP STORE / GOOGLE PLAY | smart store links with referrer | – |
| alt code form | "GOT A DIFFERENT CODE? [ABC123] FIND MY CREW" | code lookup API | returns "Found it: 'Lisbon long weekend', 3 people in. Open the app to join." (crew name + count), so it needs rate limits and bot protection |

Validation copy: uppercase A–Z0–9 only, max 6; "That code needs six characters." **MISSING states:** expired, revoked, crew full (seat 7 → Boost, 4f-1), trip past/cancelled, seat already claimed (forwarded link), unknown code, lookup rate-limited, loading/skeleton, no-JS.

### 1.5 Referral (`Site - Referral`), mechanics and rewards
- Hero "BRING YOUR CREW · TRIPS ARE BETTER WITH TAGALONGS". "Send your link. When a friend joins and plans their first trip, you both get a stamp on your pass, and enough stamps unlock new pass covers."
- **YOUR LINK** `critterpass.app/i/{code}` (default `WINST8`, prop) + COPY (writes `https://critterpass.app/i/WINST8`, "COPIED ✓" 1.8 s) + channels Messages · WhatsApp · Instagram story · Email.
- Visual: PASS COVER (navy) + GOLD COVER "CREW CAPTAIN · 5 STAMPS" + "TAG ALONG · STAMP NO. 1" roundel.
- **YOUR STAMPS** "{joined} OF 5 · NEXT AT {3|5}", 5 slots: TAG ALONG · CREW OF TWO · NAVY COVER · ROAD CREW · GOLD COVER (filled pink/navy/gold vs dashed).
- Unlock chips: 1 stamp → Tagalong badge · 3 → Navy cover · 5 → Gold cover.
- **FRIENDS YOU'VE INVITED**: name, activity note, status STAMPED / ALMOST (joined, no trip) / PENDING (invite sent 2 days ago).
- HOW IT WORKS: 1 send link *or add them straight to a crew; either counts* · 2 stamp lands once they've **joined and voted on, or planned, their first trip** · 3 both get one; "They start with a stamp too. Covers unlock at 3 and 5."
- Fine print: cosmetic, no cash value; critters only from visiting; one stamp per friend; friend must be new to Critterpass; "See the terms" → `Legal#terms`, **which has no referral section.**

Derived rules and model:
- Every invite (crew seat, crew code, trip code, plain referral) carries `inviter_id`, so crew invites count as referrals. Attribution = first valid invite link/code used before account creation (last-touch within N days?).
- `Referral{referrer, referee?, via: link|crew_invite|code, channel, status: pending|joined|qualified|void, qualified_by: vote|trip_created|trip_joined_and_voted}`.
- Qualification: referee is a **new** account (unique verified phone / Apple / Google subject, device attestation), plus the first qualifying event. On qualification both users get a stamp. The referee's "starting stamp" is TAG ALONG for them too.
- Caps: 5 slots shown. After 5? Unclear (§7).
- Privacy: the friends list shows the referee's activity ("Planning Kyoto", "Joined the Bali Six") to the referrer. Needs a disclosure in the referral terms, or limit it to status only.
- Fraud: self-referral through second phones or SMS pumping, emulator farms. Use App Attest / Play Integrity, phone uniqueness, and velocity limits per referrer.
- Surface: the page needs identity. There is **no web sign-in and no in-app referral screen**. Options in §7 Q1.
- Channel buttons: WhatsApp `https://wa.me/?text=`, Messages `sms:&body=` (mobile only), Email `mailto:`, Web Share API on mobile. **Instagram story sharing works only from the native app** (Stories share intent with a Meta app ID), so hide it on desktop web.

### 1.6 Legal (`Site - Legal`)
Single page, hash tabs `#privacy` / `#terms` (hashchange listener; section ids `privacy-1..8`, `terms-1..10`), sticky TOC, "TL;DR FROM TOKEK" (3 bullets per doc), sections, contact card `hello@critterpass.app`, banner "Draft copy for design. Needs legal review before it goes live.", "UPDATED SEPT 2026".
- Privacy sections: What we collect · Location and the pass · Talking to your guide · Who sees what · Partners · Keeping and deleting · Your rights · Changes.
- Terms sections: Using Critterpass (16+) · Your account · Crews and trips · Bookings · Splitting money · The guides (AI disclaimer) · Critters and the pass (no cash value, location spoofing) · Ending things · Liability · Changes.
- Required changes are in §3.2.

### 1.7 Header/Footer
Covered above. The logo uses the live `App Icon` renderer at 40px, so the favicon and apple-touch-icon should come from the same exported icon.

---

## 2. Deep-link contract (app + site)

### 2.1 Principles
- One apex, `https://critterpass.app`, for all shareable links. The site doubles as the fallback for every link.
- **Never put PII in URLs.** Links carry an opaque code or token. The server resolves it into a public subset (web, OG) or a private subset (app, after device attestation, or after auth for claims).
- The same URL works in 4 contexts: app installed (UL/App Link), not installed on mobile (web → store with deferral), desktop (web + QR), link-preview bot (OG only; never counts as an open, never claims).
- Custom scheme `critterpass://` only for app-internal surfaces (widgets, Live Activities, notification actions), never shared externally.
- Every link resolves to `{type, status, public payload}`. Statuses: `active | expired | revoked | claimed | full | past`.

### 2.2 URL table
| Pattern | Purpose (screens) | Server-resolved data | Installed | Not installed (mobile) | Desktop | Index |
|---|---|---|---|---|---|---|
| `/i/{CODE6}` | crew or trip join code; personal referral code (Site-Invite, 3a-11, 3b-1/3g-3 "JOIN WITH A CODE", Site-Referral) | type crew/trip/referral; inviter first name + avatar; crew name, member initials/colours, seats taken/cap; trip destination, dates, guide, ~per-person + currency, draft highlights; expires_at | UL → 3a-11 prefilled + found crew card, or Home if already a member | web landing → store; Android `referrer=cp_link%3D{CODE6}`; iOS clipboard handoff + code shown for 3a-11 | landing + QR | noindex |
| `/i/{CODE6}/{seat}` | **per-invitee seat** (3a-10 "Winston saved you a seat", 3a-12 prefill) | public: as above. Private (app only): invitee given_name, home (IATA/city), taste hints, inviter note, provenance ("FROM WINSTON'S CONTACTS"), seat no, channel, opened_at | UL → 3a-10 ticket → TAKE THE SEAT → 3a-12 → sign-in sheet → 3a-13 | same as above, plus deferred seat token (§2.3) | landing + QR | noindex |
| `/join` | manual code entry (footer "Join with a code", Home "I have a code →") | – | – | page with FIND MY CREW | same | index (thin) |
| `/p/{token}` | proposal per recipient (3f-1 trailer/poster/postcard, 3f-2/3/4, 4f-1 "Watched the trailer twice") | recipient-scoped proposal, reply-by, rooms-held timer, hype | UL → 3f-2 trailer (or 3a-10 if not a member) | **web preview MISSING in design**: poster + "I'M IN" needs the app, so route to the store with the token deferred | poster + QR | noindex |
| `/r/{token}` | recap share (3m-1 SHARE RECAP, 3m-9 POSTCARD / STORY 9:16 / POSTER, 3m-10 "Share the memory") | crew-approved recap cover, stats, stickers; image variants `/r/{token}/{story|poster|postcard}.png` | UL → 3m-3 story | read-only web recap (**MISSING design**) + get the app | same | noindex |
| `/plan/{token}` | read-only shared plan (3o-4 "Copy a read-only link instead") | plan per the 3o-4 toggles: names off → "a crew of six", cost rounded to $10, 12 photos with faces blurred, chat never | UL → 3o-2 view + COPY INTO OUR TRIP | web read-only (**MISSING design**) | same | noindex |
| `/plans/{place}/{slug}` | published community plan (3o-1/3o-2, 1,240 shared for Kyoto) | public plan card, rating, copies | UL → 3o-2 | web page (SEO opportunity, **MISSING**) | same | index (optional) |
| `/locals/{place}` and `/locals/{place}/{critter}?form=` | critter share target (3l-6 "Share", 3l-3 ↗, social story "NEW LOCAL ON YOUR PASS") | critter art, name, species, place, form rarity (never the sharer's location) | UL → Critterdex entry | web local page (**MISSING**) | same | index (61 places / 150 locals = programmatic SEO) |
| `/g/{GIFT}` | gift/promo code (4d-4 "PASS-7K2Q-MAYA", partner airline codes) | code type, sender first name, value | UL → 4d-4 prefilled | store; or Apple offer-code redeem URL / Play redeem URL if store-native | page | noindex |
| `/tips`, `/tips/{category}`, `/tips/{slug}` | journal | – | **exclude from UL** (open in browser) | web | web | index |
| `/legal/{privacy,terms,subscriptions,referrals,location,community,cookies}`, `/account/delete`, `/help` | legal/support (store-required URLs) | – | exclude from UL | web | web | index (deletion/help noindex optional) |
| `/download?c={campaign}` | smart store redirect (header "GET THE APP", QR, social bios) | campaign → Apple CPP `ppid` / Play listing + `referrer` | open app | App Store or Play by UA | home `#get` + QR | noindex |
| `/app/...` | crew-internal shares: vote, day, booking, SOS map ("See him on the map" 3k-10), feedback note (3p-3) | auth required | UL → screen | web "Open in the app" + store | same | noindex, robots-disallow |
| `critterpass://...` | widgets/Live Activities/notification actions (5a/5b/5c) | – | in-app only | n/a | n/a | – |

Adjacent domain contracts:
- SMS OTP format `Your code… @critterpass.app #123456` (domain-bound autofill, 3a-8). Requires the `webcredentials:critterpass.app` association.
- Inbound booking email `{crew-handle}@in.critterpass.app` (3h-2).
- Support mail `hello@critterpass.app`. The mock `winston@critterpass.app` in checkout 4b-4 is a placeholder bug.
- Store deep links: rate page `https://apps.apple.com/app/id{ID}?action=write-review` (3n-6/3p-6); Play `market://details?id={pkg}`; subscriptions `https://apps.apple.com/account/subscriptions` and `https://play.google.com/store/account/subscriptions` (3n-9 "Manage subscription ›").

Association files:
- `/.well-known/apple-app-site-association`: `applinks` components include `/i/*`, `/p/*`, `/r/*`, `/plan/*`, `/plans/*`, `/locals/*`, `/g/*`, `/app/*`, `/join`; exclude `/tips*`, `/legal*`, `/help*`, `/account*`, `/`. Also `webcredentials` (OTP/passkeys) and `appclips` if an App Clip ships.
- `/.well-known/assetlinks.json`: `handle_all_urls` + `get_login_creds`, with intent filters mirroring the path list (autoVerify).

### 2.3 Deferred deep link requirements (invite → prefilled 3-tap pass)
Target from the 3a-13 caption: "About fifteen seconds from opening the link to here."
- **R1 Payload:** the deferred data is only `{CODE6, seatToken?, channel, click_id}`. Everything else is fetched: `GET /links/{code}` (public) and `GET /invites/{seat}/prefill` (private, attested device, TTL = code expiry). Prefill fields and provenance tags are listed in the §2.2 table. 3a-12 shows "FROM WINSTON'S CONTACTS".
- **R2 Android:** Play URL `…details?id={pkg}&referrer=cp_code%3D{CODE6}%26cp_seat%3D{seat}%26cp_click%3D{id}`. Read it with the Install Referrer API on first launch before rendering the splash. Deterministic.
- **R3 iOS, ranked:**
  - (a) **Clipboard handoff.** The web CTA tap copies the full link (user gesture). On first launch, `UIPasteboard.detectPatterns(.probableWebURL)` runs without a prompt; if a match is likely, show a UIPasteControl "Paste your invite" (no alert). This UI already exists: 3a-11 "Paste a link", "Pasted from Winston's message".
  - (b) **Phone match after sign-in.** The inviter picked Rin from contacts, so the server holds a salted hash of her E.164 number. After OTP (3a-8), attach pending seats. This path skips the 3a-12 prefill-before-auth, so it needs a variant.
  - (c) **6-char code** (3a-11) always works.
  - (d) Optional **App Clip** for `/i/*`: renders the ticket, supports Sign in with Apple, then installs the full app through SKOverlay and hands the token over via an App Group. Deterministic, but it is a separate target. Size limit is 100 MB for digital-only invocation on iOS 17+.
  - (e) Vendor SDK (Branch / AppsFlyer / Adjust): same clipboard and probabilistic tricks, plus cost and privacy-manifest disclosure. Only worth it if paid UA attribution is needed anyway.
  - Apple custom-product-page deep links (iOS 18+) are per campaign, not per invite. Use them for guide/destination campaigns.
- **R4 First launch:** resolve deferred data before showing 3a-1. Show a "Finding your seat…" skeleton for ≤1.5 s; on timeout, fall back to 3a-1 with the "I have an invite code" button highlighted. Offline first launch goes straight to the code path.
- **R5 Claim is one-time:** `POST /invites/{seat}/claim` (auth) is transactional against the seat cap (6 free; seat 7 → 4f-1 Boost). After a claim, a forwarded seat link shows "This seat's taken. Ask Winston for the crew code" and the web page drops the personalised line.
- **R6 Opens / channel:** "Opened from WhatsApp · 2 min ago" and "Opened it 3 times" come from click events. Channel comes from a share-time param (`?c=wa|imsg|ig|mail|qr|copy`, or the iOS share-sheet `activityType` after sharing) with UA/Referer as a fallback. Exclude preview bots (WhatsApp, facebookexternalhit, Twitterbot, Slackbot, Telegram, iMessage fetcher; HEAD requests). Dedupe by device.
- **R7 Security:**
  - CODE6 uses a CSPRNG over an ambiguity-safe alphabet. The designs show vanity codes like BALI6X, SUNNY4, WINST8 that contain I/L/1/0 and are guessable. Pick one: random codes, or vanity prefix + random suffix.
  - Codes rotate and expire (seen: ~4 days).
  - Lookups are rate-limited per IP/device, with bot protection on the web form.
  - Seat tokens are ≥128-bit, single-claim, and expire with the code.
  - Inviter-supplied PII about non-users (name, home, taste) gets TTL deletion if never claimed, which the privacy policy must state.
- **R8 Referral attribution** rides on the same deferral payload (inviter_id is implied by the code). It is stored on the anonymous user at first launch and bound at account creation.
- **R9 Consistency:** the same resolver response drives the web page, OG image, App Clip and app. One JSON schema, versioned.
- **R10 Analytics funnel:** link_click → store_click → install (referrer / paste / code) → prefill_viewed → pass_issued → claimed. Needed for the 15-second target and invite conversion.

### 2.4 Installed vs not installed: gotchas to design for
- iOS Universal Links don't fire on same-domain taps and often don't fire inside in-app browsers (WhatsApp, Instagram, TikTok). Point "JOIN THE BALI SIX" at an **alternate associated host** (e.g. `go.critterpass.app/i/…`) so a tap on the landing page triggers the app when it is installed. Otherwise the tap goes to the store with the clipboard copy.
- Android Chrome: use `intent://…#Intent;scheme=https;package={pkg};S.browser_fallback_url=…;end` for the JOIN button.
- iOS Safari Smart App Banner: `<meta name="apple-itunes-app" content="app-id=…, app-argument=https://critterpass.app/i/{code}">` on the invite, proposal and recap pages.
- Desktop: QR = same URL + `?src=qr`. The iOS camera opens the app through UL, or the App Clip card if one exists.
- A user who once chose "Open in Safari" disables UL for the domain. The landing page must always offer an explicit "Open in app" button.

---

## 3. Content model, legal, SEO/OG, localisation

### 3.1 Tips content model
| Field | Type | Notes / source in design |
|---|---|---|
| slug | string | stable URL `/tips/{slug}` |
| title | string | uppercase via CSS; keep sentence case in data |
| dek | string (≤160) | card + meta description default |
| category | enum PLANNING, MONEY, ON_THE_TRIP, CITY_GUIDES | chips; category colour default |
| author_guide | ref Guide (tokek, pon, lundi, ajo, sardi, paco) | byline "Tokek, Bali", avatar sticker |
| reviewed_by | ref Person (human) | "checked by people who've been". Needed for AI disclosure and E-E-A-T |
| places | ref Place[] | CITY_GUIDES → links to `/locals/{place}`; guide RAG |
| published_at / updated_at | datetime | "SEPT 24, 2026"; Thursday schedule |
| reading_minutes | computed | "6 MIN READ" |
| featured | bool | featured slot (ALL/PLANNING) |
| cover | {bg token, critter kind, pose, seed, tilt, bubble?, chat_bubbles[2]?} | card + article cover + OG |
| lede | text | 23px intro |
| body | blocks[] | `section{n, heading, paras[]}`, `pullquote{text, attribution(Caveat), sticker pose}`, `app_cta{badge_value, badge_label, title, body, deep_link}`, optional `image`, `list`, `tip_callout` |
| related | ref Tip[3] or auto by category | KEEP READING |
| seo | {meta_title?, meta_description?, og_image auto} | – |
| locale / translations | – | en only at launch |
| status | draft → in_review → scheduled → published → archived | – |
| ai_assisted | bool + disclosure text | EU AI Act Art. 50, trust |

- **Authoring workflow (recommended v1):**
  - Git-based MDX/Markdown with a schema-validated frontmatter and a block component set. PR review gives an audit trail for the "checked by" claim. Scheduled publish via CI, Thursday cron.
  - An LLM drafts in the guide persona using the **same persona prompts as the in-app guide**, so the voice matches. A human editor fact-checks prices, opening hours and safety, then signs `reviewed_by`.
  - Move to a headless CMS only when non-developer editors or ≥2 posts a week justify it (YAGNI).
- Optional: expose published tips to the guide's retrieval, so "Or just ask the guide directly" gives consistent answers.

### 3.2 Legal pages required (vs designed)
| Doc | Status in design | Must cover / fix |
|---|---|---|
| Privacy policy | drafted (8 sections) | **Add:** phone number (OTP); anonymous-first identity; inviter-supplied data about non-users (name, home, taste, "from contacts") + TTL; contacts access; calendar availability (3c-3); email inbox import incl. Google restricted-scope handling (3h-2); camera/photos (receipts, point-and-ask, album); mic (voice, deleted after STT: already stated); **dietary/allergy profiles (possible special-category health data → explicit consent)**; private budget maxes (anonymous aggregation); live crew location + SOS sharing (auto-off 1 h); background location for encounters; **"not a trail of coordinates" conflicts with recap route map / "map trail stays forever" (4b-3) and "214 KM driven"**, so fix product or copy; community publishing (blurred faces, rounded costs); AI subprocessors (LLM, STT/TTS, OCR); attribution/analytics/crash SDKs; push tokens; postal addresses for Pass+ printed postcards (3m-9); booking partners; payments processor (conditional); retention per category; international transfers; CCPA/CPRA "sale/share"; DSR channel ("Settings → Privacy", `hello@`); children |
| Terms of service | drafted (10 sections) | **Add:** subscriptions (Pass+ $3.99/mo, $29.99/yr auto-renew; Trip Boost ~$12 one-time; "Every trip, all year" $59; first-trip-free trial; split-boost IOUs are social records, not debts collected by us; refunds via Apple/Google; restore); gift/promo codes; referral programme (or separate doc); UGC licence (plans, tips, photos, idea board); community rules link; governing law/disputes; EU withdrawal right for digital content; DSA notice-and-action contact (community content hosting); Apple standard-EULA reference or custom EULA with Apple minimum terms. **Fix:** "Anyone with a crew invite can join" (per-seat invites, cap 6); "Splitting money … payment processor" vs no-money-movement design (decide) |
| Subscription terms / auto-renew disclosure | missing | Apple 3.1.2: paywall must link Terms (EULA) + Privacy; price, period, renewal, cancel info; mirrored on web `/legal/subscriptions` |
| Referral terms | missing (linked!) | eligibility (new users), qualifying events, one stamp per friend, cosmetic/no cash value, fraud voiding, changes/termination, what the referrer sees about the friend |
| Location data notice | partial (Privacy §02) | standalone `/legal/location`: when (in use, active trip "travel mode", background encounters), precision, live-share durations, storage (pass entries vs trail), off-switch effects. Supports Play background-location declaration and App Review |
| Account & data deletion | missing on web | **Google Play requires a web URL to request deletion without the app.** Mirror 3n-9: what goes (pass, critters, stamps, profile, uploads, chat) vs crew keeps ("former member" plans, expenses); 30-day window + undo; subscription not cancelled by deletion; money owed |
| Children / age | Terms "16 or older" only | not directed to children; age-gate or store age signals; **App Store new age ratings (13+/16+/18+)**; Texas SB 2420 enforceable (Jul 2026): consume Apple Declared Age Range / Google Play age signals for TX users; UT/LA laws similar |
| Cookie / tracking notice | missing | or use cookieless analytics to avoid an EU banner |
| Community guidelines | missing | crew chat, shared plans, photos, idea board, reporting |
| AI transparency | partial (Terms "Guides are AI") | Art. 50 (enforceable 2026-08-02): inform users in-product that guides are AI; label AI-assisted tips; persona bylines need "written with our AI guide, checked by {human}" |
| Imprint / company details | missing | legal entity, address (required for DE/AT audiences; Apple trader status for EU DSA) |
| Accessibility statement | missing | European Accessibility Act applies to consumer e-commerce services (subscriptions sold in app/web) unless microenterprise |
| OSS / asset licences | missing | fonts OFL (Archivo, Geist, Geist Mono, Caveat, Instrument Serif); **verify licence of `alesha-pro/tools` hand-drawn-canvas skill** that `doodles.js` adapted (`design/github.md`) |

- Routing: replace hash tabs with real routes (`/legal/privacy`, `/legal/terms`). Keep the tab UI as links. Store listings need stable per-document URLs.
- Versioning: each doc gets `version`, `effective_at` and a changelog. "We will tell you in the app before material changes" needs a doc-version table plus an in-app notice hook (Inbox item).

### 3.3 SEO / OG requirements
| Page type | Title/meta | OG image | Index | Structured data |
|---|---|---|---|---|
| Home | "Critterpass: group trips, planned with the locals" | static 1200×630 (Store Assets "SOCIAL / OG") | yes | Organization, MobileApplication (os iOS/Android, offers price 0, category Travel) |
| Tips index/category | per category | category template | yes | CollectionPage, BreadcrumbList |
| Tip article | title + dek | **generated**: category bg + critter sticker + title | yes | BlogPosting (author = Organization; persona in visible byline; `reviewedBy`/editor Person), BreadcrumbList |
| Invite `/i/*` | "Winston wants you in Bali" | **generated per code**: ticket art, destination, dates, guide; no invitee name | noindex, nofollow | – |
| Proposal / recap / plan links | per object | generated (poster / recap cover / plan card) | noindex | – |
| Locals pages (if built) | "{Critter}, the {species} of {Place}" | critter card | yes | – |
| Legal / help | plain | static | yes (deletion/help optional) | – |

- Tech: canonical URLs; `sitemap.xml` (tips, locals, legal); `robots.txt` (disallow `/app/`, `/i/`, `/p/`, `/r/`, `/plan/`, `/g/`); RSS/Atom for Tips ("new every Thursday"); Twitter `summary_large_image`; keep OG images ≤300 KB JPEG/PNG so WhatsApp shows a preview; `apple-touch-icon` + manifest from the chosen app icon; Smart App Banner on link pages.
- Core Web Vitals risks:
  - 5 font families from Google Fonts with `display=swap`. Archivo at 64% width vs the fallback causes large CLS. Self-host woff2 subsets and add a size-adjusted fallback `@font-face`.
  - Many canvas stickers plus infinite loops (marquee, float, typewriter, confetti). Use static pre-rendered WebP/SVG for `anim="none"` stickers, animate only in-viewport, honour `prefers-reduced-motion`, and pause offscreen.
  - Canvas content is invisible to crawlers and screen readers, so add `role="img"` + `aria-label` (critter name).
- A11y: hover-only "say hi"; the tilted rotated text is fine; check contrast of yellow on paper (fails) and `#6b6356` on `#f4efe4` (~5:1, ok).

### 3.4 Localisation
- Site copy is English only, with British spelling (neighbourhood, colour, organiser, Sept). Decide en-GB vs en-US for the site, store and app (App Store/Play locales are separate).
- Diacritics are everywhere: Hà Nội, Hội An, Cụ Rùa, Chép, Reykjavík, Bánh mì Phượng, cao lầu. **Verify Vietnamese glyph coverage** for Geist, Geist Mono and Caveat, not only Archivo. Future ja/ko/zh needs a CJK fallback strategy for condensed display type (Archivo has no CJK).
- Currency: the invite page shows "~$1,240 each", but the invitee's currency is unknown on the web (Rin is SIN). Show the trip-estimate currency explicitly (US$/S$), or use geo-IP with a "~" label. Settings (3n-6) has home/local/both.
- Dates are locale-formatted ("OCT 12–19"). Times need timezones for countdowns ("EXPIRES IN" computed from a server `expires_at`).
- Store listings and screenshots are HTML templates, so localisation means copy files per locale plus a re-export. In-screenshot mock UI strings must match the localised app.
- Legal translations need legal review. The English version prevails unless local law requires otherwise.
- Web i18n: `/{locale}/…` prefixes and `hreflang` once a second locale exists (YAGNI until then).

---

## 4. Store assets and social kit

### 4.1 App icon (4 directions, `App Icon` component: variant × mode × shape)
| Dir | Concept | Bg | Notes |
|---|---|---|---|
| 1a face | Tokek close crop | yellow `#ffd84a` + dots | best legibility at 29 pt (design claim) |
| 1b passport | Tokek gripping orange passport | navy `#17142a` | "travel + collection"; 3n-5 shows PASSPORT "In use" while the site header default is `face`. **Default icon undecided** |
| 1c stamp | Hà Nội stamp holding Cụ Rùa (cp-001) | cream | swappable per city (seasonal); ring text illegible <40 pt |
| 1d sticker | welcome-screen sticker | navy | matches first screen |
- Modes: light / dark / tinted (iOS) / mono (Android themed). Shapes previewed: iOS squircle, circle/squircle/teardrop (Android adaptive masks), themed. Sizes tested: 120/87/60/40/29 pt, plus a home-screen test at 60 pt on light and dark wallpapers.
- Deliverables:
  - iOS: 1024² marketing (no alpha, no rounding). **iOS 26 Liquid Glass layered icon** (Icon Composer `.icon`: background layer, dots, critter foreground) with Default/Dark/Clear/Tinted appearances. The tinted design currently multiplies yellow; the system wants grayscale luminance art.
  - Android: adaptive foreground/background (108 dp, 72 dp safe zone; art scaled ×0.8 as in the component), monochrome layer, Play hi-res 512² 32-bit PNG.
  - Web: favicon 32/SVG, apple-touch-icon 180, manifest 192/512 maskable.
- The halftone dot pattern moirés at small sizes. Drop or enlarge it for ≤60 px renders.
- Alternate icons (3n-5: 4 styles + earned critter icons "TEMPLE, SARDI, HOME SET, PON, GOLDEN, BALI SIX"): on iOS every alternate must ship **inside the binary**, so new earned icons need an app update. On Android, alternates are activity-aliases (launcher restarts, limited). Product Page Optimization icon A/B tests can reuse the bundled alternates.

### 4.2 Splash
- iOS static launch screen = first frame of the hatch (egg on navy dots). The in-app hatch is 2.4 s: egg wobbles ×4 (0–1.3 s), burst, Tokek pops out with 3 sparks (1.6–2.1 s), wordmark rises, stickers slap on. Later launches skip to Tokek.
- Android 12+ SplashScreen API: egg in the 192 dp circle mask on `#17142a`, animated vector <1000 ms, then continue from the burst in-app.

### 4.3 Screenshot sets
| Store | Size | Count | Frames (bg · headline · sub) |
|---|---|---|---|
| App Store 6.9" | 1290×2796 (design, 360×780 logical). Also accepted: 1320×2868, 1260×2736. 1320×2868 needs 360×782 | 6 (max 10) | 1 yellow "STOP PLANNING TRIPS IN THE GROUP CHAT." · 2 navy "ASK THE GECKO. IT'S BEEN EVERYWHERE." · 3 pink "LAND SOMEWHERE NEW. MEET A LOCAL." · 4 orange "EVERY DAY PLANNED. DRAG TO CHANGE IT." · 5 mint "NOBODY HAS TO BE THE ONE WHO ASKS FOR MONEY." · 6 cream "EVERY BOOKING. EVEN WITH NO SIGNAL." |
| Google Play phone | 1080×1920 9:16 (360×640 logical, punch-hole) | 6 (min 2; ≥4 at ≥1080 px for promo eligibility) | same |
| iPad 13" 2064×2752 / Play tablet | – | – | **Not designed.** Needed only if iPad/tablet is supported (decide) |
- Design intent: the first 3 frames carry the hook (chat pain, guide, critters). A dotted route runs across frame seams (`Store Shot` Y-array path), so the frames must be exported as a set.
- Other assets:
  - Play feature graphic 1024×500: navy, wordmark left, Tokek right of centre so a video play button lands on navy.
  - OG/social 1200×630: yellow, icon, "PLAN THE TRIP. MEET THE LOCALS."
  - App Store preview 886×1920, 30 s, 7 shots: 0–3 s group-chat cold open (**staged, rejection risk**), 3–8 swipe → "HỘI AN WINS", 8–13 voice question → swap, 13–18 friend drags a slot, 18–23 egg hatch → Chép (9→10), 23–26 receipt split "$24 EACH", 26–30 end card.
  - Up to 3 previews per locale. Play promo video (YouTube) can reuse the cut.
  - **Not designed:** App Store In-App Event cards (1920×1080 / 1080×1920). Strong fit: "legendaries only one day a year" (Sakura Pon). Also Custom Product Pages per guide (Bali/Tokek, Kyoto/Pon; up to 70, keyword-assignable, deep-linkable iOS 18+), IAP promo images (1024²) for Pass+/Boost, and Play custom store listings.

### 4.4 Listing copy (none designed beyond the frames; drafts with checked lengths)
- App name (≤30): "Critterpass: Group Trips" (24). "Critterpass - Group Trip Planner" is 32 and too long.
- Subtitle (≤30): "Group trips, planned by locals" (30) or "Plan group trips with locals" (28).
- Play short description (≤80): "Group trips, planned with the locals. The locals happen to be animals." (70).
- Promotional text (≤170), description (≤4000): write from the Home sections (chat pain → 4 stops → guides → pass → money/bookings), plus required subscription disclosure. Keywords (≤100 bytes, no repeats of name/subtitle words): e.g. `itinerary,friends,vote,split,expenses,travel,guide,ai,bali,kyoto,lisbon` (trim to fit).
- Also required: category (Travel; secondary Social Networking or Lifestyle), support URL (`/help`, **missing**), marketing URL, privacy URL, App Privacy labels, Play Data safety, Play "Contains ads" (sponsored picks in the free tier), age-rating questionnaires (UGC chat, location sharing), IAP metadata and review screenshots, background-location declaration video (Play).

### 4.5 Social kit → which can be programmatic
| Asset | Size | Programmatic? | How |
|---|---|---|---|
| 1a Launch post (navy, 5 stickers, wordmark, "OUT NOW · iOS + ANDROID") | 1080×1350 | one-off export | headless render of template |
| 1a Group-chat post (yellow) | 1080×1350 | one-off | same |
| 1a "The pass" post (pink, 10 dex tiles, "150 locals in 61 places") | 1080×1350 | **yes**: tile set from `critters-data.js` ids | data-driven series ("this week's locals") |
| 1b "Meet the locals" carousel: cover + 6 guide slides (colour bg, 620 px sticker, name, line, n/6, route across seams) | 7×1080×1350 | **yes**: `guides[]` data → template; render as a 7560-wide strip then slice so the route aligns | extend to all 61 places / 150 locals ("Local of the week") |
| 1c Story "WHERE NEXT? PICK YOUR CREW'S LOCAL" (4 city tiles + poll-sticker placeholder) | 1080×1920, safe top 250 / bottom 340 | yes: city set as data. The poll sticker is added natively in Instagram | template |
| 1c Story "WHEELS DOWN IN BALI · NEW LOCAL ON YOUR PASS → TOKEK · Pass #10 · Bali" | 1080×1920 | **yes, and it is the same template as the user share card** (3l-6 Befriended, hatch) | server/on-device render per critter + user pass number |
| 1d Avatar (circle-safe) | 400×400 | one-off (per icon direction via `iconPick`) | – |
| X header / LinkedIn banner (profile-photo keep-clear zone) | 1500×500 / 1584×396 | one-off | – |
| Store frames ×6 ×2 platforms × locales | as §4.3 | **yes** | `Store Shot` props `n`, `platform`, `route` + locale copy |
| OG images (tips, invites, plans, recap, locals) | 1200×630 | **yes** (request-time) | §4.6 |
| User share images: recap story 9:16 / poster / postcard (3m-9), anniversary (3m-10), plan card (3o-4) | 1080×1920, etc. | **yes** | same template engine |
- Kit props already parameterise brand: `iconPick`, `handle` (@CRITTERPASS), `showHandle`, `safeZones` (dashed guides off for export). Seed drift: Pon uses seed 51 on the guide cards and 42 elsewhere, so pin seeds per critter in the data.

### 4.6 Asset generation pipeline (recommended)
1. **Sticker atlas (build time):** headless Chromium loads `doodles.js` + `critters-*.js` and renders each `{kind|cp-id} × form(4) × pose × size bucket × sticker outline on/off` to transparent PNG/WebP.
   - Drawing is seeded; `Math.random` is used only for blink timing and confetti, so output is deterministic and cacheable.
   - Disable the IntersectionObserver gating or scroll each element into view.
   - The atlas feeds OG, email, native widgets/notifications (if the native renderer isn't ported) and static site stickers.
2. **Batch marketing exports:** Playwright screenshots of the existing HTML templates at exact pixel size (social kit is 1:1; store frames scale ×3.583 iOS / ×3 Android) × locales × platforms. Upload with the App Store Connect API / Google Play Developer API (e.g. fastlane deliver/supply).
3. **Request-time OG:** JSX/HTML → SVG → PNG (Satori + resvg class of tools) composing atlas PNGs and text. **Needs static font instances.** Archivo's `wdth` axis is not supported by these renderers, so instantiate Archivo 900 @64/66/72/78% and 700 @100%, plus Geist TTFs. Cache on the CDN keyed by object version; invalidate when the crew/trip changes. Fallback option: a headless-browser render service for full fidelity, at higher latency and cost.
4. **Video:** app preview = in-app screen recordings (UI-test scripted) + overlay titles. The Remotion or HTML-video route suits the social cut, not the Apple preview.

---

## 5. Token reuse between app and site

Evidence: hex frequency across site/store/social files vs `Critterpass.dc.html` shows the same core set in both.

| Token (semantic) | Value | Site | App | Note |
|---|---|---|---|---|
| color.night (bg) | `#17142a` | 156 | 1673 | body bg, text on light |
| color.paper | `#f4efe4` | 154 | 1336 | light bg, sticker outline |
| color.sun (primary) | `#ffd84a` | 95 | 803 | CTA, wordmark |
| color.pink | `#ff5fa8` | 32 | 328 | Ajo |
| color.mint | `#54d6a4` | 26 | 329 | Tokek, success |
| color.orange | `#ff9a4d` | 16 | 195 | Pon, warning ("EXPIRES IN") |
| color.sky | `#7fb8ff` | 12 | – (app?) | Lundi on site/social. **Check the app guide theme** |
| color.blue | `#4f86ff` | 6 | 185 | Sardi |
| surface.night-1 | `#1f1b38` app / `#221e3d` site | 10/9 | 479 | **unify** |
| surface.night-2 | `#2c2750` | 30 | 323 | chips, secondary buttons |
| line.night | `#3a3466` | 2 | 321 | dashed borders |
| surface.deepest | `#0b0a12` / tab bar `#120f22` | 8 | 213/18 | – |
| text.night-muted | `#a9a3c0` | 55 | 787 | eyebrows, meta |
| text.night-body | `#c9c4dc` (site), dim `#6f698c`/`#8d87a8` (app) | – | – | define 3 steps |
| paper-2 | `#fffaf0` site / `#fffdf6` app | 5 | 15 | **unify** |
| text.paper-body/meta | `#3d372f`, `#5d564b`, `#6b6356`, `#9c9384` | – | – | 4-step warm grey |
| line.paper | `#ddd5c4`, chip `#e9e2d2` | – | – | – |
| accent.rust | `#c4623e` | 9 | 15 | link hover, Caveat notes |
| ink.doodle | `#211d18` / `#221e19` | 19 | 217/73 | renderer ink |
- Guide theme map (site + social; confirm the app matches): tokek `#54d6a4`, pon `#ff9a4d`, lundi `#7fb8ff`, ajo `#ff5fa8`, sardi `#4f86ff`, paco `#ffd84a`. Per-critter palettes live in `critters-data.js`.
- Pattern token: halftone `radial-gradient(rgba(c,.12–.16) 1.3px, transparent 1.7–1.8px) 0 0/9–10px`.
- Type:
  - Archivo 900 display. Width steps used on the site: 64 (H1), 66, 72 (H2/cards), 78–80 (buttons). The app uses 60–84 (12 values; 60 is below the axis min of 62). Rationalise to ~5 steps.
  - Archivo 700, 11–12 px, `.16–.18em` uppercase eyebrows. Geist 400–600 body. Geist Mono meta/codes. Caveat 600 guide voice. Instrument Serif is app-only (6 uses): keep or drop.
- Radius: site 24–40 cards, pills = h/2, chips 8–12. The app has ~15 distinct values, so set a scale.
- Tilt: −3…+3° as a brand motif (token `tilt.*`).
- Motion presets: float/bob/blink/ping/marquee/hop/wiggle, spring `e=back`, stagger, typewriter 55 ms/char, odometer; plus reduced-motion variants.
- Mechanism:
  - One **DTCG-format tokens file** (the spec had a stable release in 2025). Transform with Style Dictionary-class tooling into CSS vars/Tailwind theme (site), TS constants (shared web/RN), and Swift/Kotlin if native.
  - Shared package: `critters-data` as JSON (single source for "150 locals / 61 places", guide list, colours, seeds); the renderer (web); the sticker atlas (everything else).
  - Fonts: self-hosted woff2 subsets for web; TTF/static instances for native, Satori and email.
  - Email templates (invites via email, deletion confirmation, data-export-ready) are **not designed**. Build them from the same tokens + atlas PNGs.

---

## 6. Implementation needs (stack-agnostic), risks

### 6.1 Work items
| ID | Item | Cx | Depends |
|---|---|---|---|
| W1 | Site shell: tokens, self-hosted fonts, header (+ mobile nav, **missing**), footer, sticker component (static atlas + animated canvas), motion runtime with reduced-motion | M | W11 |
| W2 | Home page (8 sections, anchors, UA-aware store frames, official store badges, smart store links) | M | W1, W9 |
| W3 | Tips: content schema, MDX pipeline, index + category routes, article blocks, related, share (Web Share/copy/WhatsApp), RSS, OG, scheduled publish | M | W1, W8 |
| W4 | Link service: `/i`, `/p`, `/r`, `/plan`, `/g`, `/locals`, `/app` resolver; status machine; AASA/assetlinks; alt UL host; `/download` smart redirect; click log + bot filter + channel tagging | L | backend crew/trip models |
| W5 | Invite landing `/i/{code}[/{seat}]` + `/join`: SSR public subset, QR, countdown, code lookup API (rate limit + bot protection), store handoff (clipboard copy, Play referrer), Smart App Banner, all error states | M | W4, W8 |
| W6 | Deferred deep linking in-app: Install Referrer, pasteboard detect + UIPasteControl, phone-hash reconciliation, first-launch resolver + skeleton; optional App Clip | XL | W4, auth |
| W7 | Referral: attribution on invite/code, qualification events, stamps/covers ledger, fraud controls, in-app dashboard (**not designed**), web explainer `/crew` (+ optional signed handoff view) | L | W4, W6 |
| W8 | OG/share image service (atlas + static fonts; CDN cache + invalidation), shared with in-app share cards | M | W9 |
| W9 | Asset pipeline: sticker atlas; store frames × locale × platform; social kit export; icon exports (iOS layered `.icon`, Android adaptive + mono, web icons); splash assets; upload automation | L | – |
| W10 | Legal set (§3.2), real routes, versioning + in-app change notice; account-deletion web flow; help centre/support URL | M (content L) | counsel |
| W11 | Design tokens package (DTCG → web/native), guide theme map, critters JSON | S | – |
| W12 | Read-only share pages: plan, recap, proposal web preview, locals pages (**designs missing**) | L | W4, W8, design |
| W13 | Store ops: listing copy per locale, privacy labels / Data safety, age ratings, IAP metadata, preview video (in-app capture), CPPs per guide, In-App Events, PPO icon test | M | W9, W10 |
| W14 | Analytics + consent: web (cookieless preferred) + funnel link→install→claim; CWV monitoring | M | W4 |

### 6.2 Risks / hard parts
1. **iOS deferred linking reliability**: clipboard + UIPasteControl + code + phone match. Measure the funnel; add an App Clip if invite conversion from not-installed iOS lags.
2. **UL failure modes**: same-domain taps, in-app browsers, a user who disabled UL. Needs an alt associated host and explicit "Open in app" buttons, and adds QA cost across WhatsApp/IG/TikTok/Messages/Telegram webviews.
3. **Invite privacy/abuse**: public crew data on forwarded links, code enumeration (6 chars), inviter-supplied PII about non-users (GDPR basis + TTL), preview bots counted as opens.
4. **Store compliance**: custom store badges; staged preview frame; mock-UI screenshots vs shipped UI; subscription disclosures (3.1.2); gift codes must be bought via IAP (3.1.1 gifting rules); "Contains ads" (Play).
5. **Legal/product contradictions** (money movement, location trail, contacts, dietary data, referral terms missing). Store privacy labels and Data safety depend on the final data inventory, which is currently unowned.
6. **Age regimes**: Terms 16+ vs the new App Store age tiers and the Texas law in force (age-signal APIs, parental consent flows for minors if the age floor is lowered).
7. **EU AI Act Art. 50** (in force): AI-guide disclosure in-app, and AI-assisted tips labelled on the web.
8. **Renderer portability**: canvas-only art blocks Satori/edge rendering, widgets and email, so the atlas is critical-path infra (shared with the app slices).
9. **Web performance**: Archivo condensed CLS, many live canvases, 5 font families; LCP/INP budgets.
10. **Vietnamese glyph coverage** in Geist/Caveat (unverified); CJK strategy if Japanese is ever localised.
11. **Referral design gaps**: no auth surface, "Gold cover" collision, post-5 behaviour, friend-activity exposure, fraud.
12. **Printed postcards** (Pass+) need postal addresses per crew member: not designed, not in privacy, needs a print/mail vendor.
13. **Alternate/earned icons ship in the binary**, so the earned-icon roadmap is coupled to releases.
14. **Third-party code provenance**: `doodles.js` adapted from an external skill repo, licence unverified.

---

## 7. Unresolved questions
1. Referral dashboard surface: (a) in-app only + static web explainer [recommended v1], (b) web page with signed handoff from the app, (c) full web sign-in (Apple/Google/phone)?
2. Is `/i/` the single namespace for crew codes, trip codes and referral codes? Should vanity codes (BALI6X/SUNNY4/WINST8) be kept, and what is the alphabet (I/L/0/1 ambiguity)?
3. Per-seat invite: is a seat token minted per invitee (3a-10 "RIN, YOU'RE COMING") for every invite, or only when the inviter picks a contact? What does a forwarded seat link show after the claim?
4. Web invite exposure: which fields may appear publicly (initials, cost, draft days)? Organiser opt-in?
5. iOS deferral: is an App Clip in scope for v1? Is a vendor SDK (Branch/AppsFlyer/Adjust) acceptable, or self-hosted only?
6. Do proposal (`/p`), recap (`/r`), read-only plan (`/plan`) and locals pages get web versions? No designs exist. What does a non-installed invitee see on "Just look around first"?
7. Settle-up: does money move through a processor (Terms) or via PayNow/bank deep links only (money slice)? This affects legal, licensing and the privacy "Partners" section.
8. Default app icon direction (face on the site header vs passport "In use" in 3n-5)? Which directions ship as free vs Pass+ alternates?
9. Referral rewards: what happens after 5 stamps? Rename "Gold cover" to avoid the Pass+ collision? Is the referee's stamp given at join or at qualification?
10. Minimum age: 16+ (Terms) vs target App Store rating? Will age-signal APIs be implemented for TX/UT/LA?
11. Store scope: iPhone-only or iPad too? Android tablets? Launch locales and en-GB vs en-US voice?
12. Preview video: keep the staged cold open (risk) or rebuild from in-app footage?
13. Tips authoring: git/MDX vs CMS; who is the human reviewer named on the byline; is AI-assist labelled per article?
14. Currency shown on the web invite (inviter's, trip's or viewer's geo)?
15. Is the domain `critterpass.app` secured, and are the social handles @critterpass (Instagram/TikTok/X) available? Are `go.`/`in.` subdomains OK?
16. Help centre and community guidelines: who writes them, and are they hosted on-site or with a vendor?
17. Printed postcard vendor and address collection flow (Pass+ perk).
18. Licence status of the adapted `alesha-pro/tools` hand-drawn canvas code.
19. Pre-launch: does the site need a waitlist/email capture before the stores go live ("NEW · iOS + ANDROID" implies launched)?

---

Sources (2026 platform facts verified):
- [Google Play Instant discontinued Dec 2025 (OMA help)](https://orangeoma.zendesk.com/hc/en-us/articles/21036620512156-Google-Play-Instant-will-no-longer-be-available-starting-December-2025), [Android Authority](https://www.androidauthority.com/google-killing-android-instant-apps-3567211/)
- [App Store Connect screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [EU AI Act Art. 50 in force 2026-08-02 (Goodwin)](https://www.goodwinlaw.com/en/insights/publications/2026/08/alerts-technology-dpc-eu-ai-act-transparency-obligations-now-in-force), [EC FAQ](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act)
- [Texas App Store Accountability Act enforceable (InfoLawGroup, Jul 2026)](https://www.infolawgroup.com/insights/2026/7/7/supreme-court-clears-the-way-texass-app-store-accountability-act-is-now-enforceable)
- [Apple custom product pages (deep links iOS 18+)](https://developer.apple.com/app-store/custom-product-pages)
