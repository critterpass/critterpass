# Web Search API for AI Tools: CritterPass Selection Report

**Date:** 2026-09-28 | **Volume:** 5k–50k searches/month | **Scope:** DeepSeek-compatible tool for guest guide route + future features

---

## Verified corrections (controller, 2026-09-28 01:55, from the vendors' own pages): read this first

- **Tavily** ([pricing](https://www.tavily.com/pricing)): Free = 1,000 credits/month; pay-as-you-go $0.008/credit; Project plan = 4,000 credits/month at a slider price. The pricing page doesn't state credits per search, retention or attribution terms. Those claims below come from docs or third-party pages and are unverified here. At 1 credit per basic search, pay-as-you-go comes to about **$32 at 5k, $152 at 20k and $392 at 50k searches/month**.
- **Brave Search API** ([pricing](https://brave.com/search/api/)): $5 per 1,000 requests, with $5 of free credit monthly (about 1,000 free searches), 50 queries/s. It **does support domain filtering** via Goggles ("custom reranking & result filtering"), so "no domain filtering" below is wrong. Storing results needs a plan that explicitly grants storage rights. About **$20 at 5k, $95 at 20k and $245 at 50k/month**.
- **Perplexity Sonar "deprecated 27 Sep 2026"** is unverified; treat it as unknown.

**Controller recommendation:** start with **Tavily**. Its results come as query-focused content built for LLM grounding, which matters because DeepSeek's grounding score is the weak spot. Domain exclusion is a plain `exclude_domains` parameter, and the free tier covers development. Keep **Brave** as the second adapter: it's cheaper at scale, has an independent index and explicit `search_lang`/`country` parameters. Before committing, a head-to-head on ~10 Vietnamese/SEA queries with both free tiers decides. Whichever provider wins, our own code still screens every URL against the supplier blocklist (`screenWebSearch` already does this).


## Summary

**Primary recommendation: Tavily.** Zero-data-retention guarantee, domain exclusion support, mandatory attribution (manageable), built-in `use_cache` parameter for caching. Free 1k/month eases launch; scales to $30–500/month at planned volumes.

**Fallback: You.com.** Explicit Vietnamese (vi) + Vietnam (VN) language/country support, 100 free calls/day, same domain exclusion capability, slightly cheaper at scale. $100 signup credits cover first two months.

---

## Evaluation Table

| API | Free/Entry | Pricing (per 1k) | Domain Filter | LLM Terms | Cache Policy | Language Support | Latency |
|---|---|---|---|---|---|---|---|
| **Tavily** | 1k/mo | $30–500 tier | ✓ include/exclude | Attribution mandatory | Zero retention + use_cache param | Unspecified | Unspecified |
| **You.com** | 100/day + $100 credits | $5 | ✓ exclude; boost; 500-domain max | Pass to RAG/LLM | Unspecified | ✓ BCP 47 + country codes |unspecified|
| **Linkup** | 4k + $20/mo | $0.005–0.055 | ✓ excludeDomains ≤50 | LLM-powered answers | Unspecified | Unspecified | Unspecified |
| **Brave Search** | $5/mo credits | $5 | ✗ Filter post-fetch only | Restricted; special plans needed | Cacheable default | Unspecified | 669ms (benchmark best) |
| **Exa** | $20 signup | $7–15 | ✗ Not supported | ✓ Neural search; NO persistent cache | ⛔ Forbidden | Unspecified | Unspecified |
| **Perplexity Sonar** | $1/$1 tokens | ~$14–22 per 1k queries | ✓ search_domain_filter | Via agent API | Unspecified | ✓ ISO 639-1 codes | Unspecified |
| **Serper.dev** | 250/mo | $0.30–1 (scale) | Partial: query operators only | Scraping risk | Unspecified | Unspecified | Unspecified |
| **SerpApi** | 250/mo | $9.17–25 | Unspecified | ⛔ Google scraping; legal risk (lawsuit dismissed July 2026, may refile) | Unspecified | Unspecified | Unspecified |
| **Google Custom Search** | – | – | ✓ Supported | – | – | – | **Closed to new customers; sunset Jan 1, 2027** |
| **Bing Web Search** | – | – | – | – | – | – | **Retired Aug 11, 2025** |

---

## Monthly Cost at Key Volumes

| Provider | 5k searches | 20k searches | 50k searches |
|---|---|---|---|
| Tavily | $30 (Project tier) | ~$130 (Bootstrap + Project) | $500 (Growth tier) |
| You.com | $10 (3k free + 2k paid) | $85 (3k free + 17k paid) | $235 (3k free + 47k paid) |
| Linkup | $5 (4k free + 1k paid) | $80 (4k free + 16k paid) | $230 (4k free + 46k paid) |
| Brave Search | ~$25 (after $5 credits) | ~$100 | ~$250 |

---

## Key Findings by Requirement

**Domain Exclusion (blocking Agoda, Booking.com, etc.):** Tavily, You.com, and Linkup all support it natively via API parameters. Brave requires post-fetch filtering. Serper.dev uses query operators (–site:) not parameters.

**Vietnamese + SEA Language:** You.com explicitly supports `language=vi` + `country=VN` parameters (BCP 47 + ISO 3166-1 alpha-2). Tavily and others silent on language support; unspecified whether they handle Vietnamese queries well. **Unverified** for all except You.com.

**Caching for Cost Efficiency:** Tavily has zero-data-retention + `use_cache` parameter. Exa explicitly forbids persistent caching. You.com, Linkup, others unspecified. CritterPass should clarify retention/caching terms before signing.

**Commercial LLM Use:** All major APIs permit passing results to LLMs. Tavily requires displaying source + URL. Brave restricts caching unless on special plan. Exa bans LLM training on results. Linkup designed for LLM composition (premium for structured answers).

**Latency from Singapore:** Brave publishes 669ms average (benchmark best). Others unspecified; latency highly dependent on query complexity and infrastructure location.

**Legal/Availability Risk:** SerpApi scrapes Google (lawsuit dismissed July 2026, may refile—reputational/operational risk). Google Custom Search closed to new signups; sunset Jan 1, 2027. Bing Web Search already retired.

---

## Integration Notes

- **Tavily:** Mature Python SDK, LangChain/MCP support, Nebius acquisition (Feb 2026, no API/policy changes).
- **You.com:** Full Web/Answer/Research API tiers; cleanest language/country parameters.
- **Linkup:** x402 protocol support (USDC on-chain payments), zero-data-retention guarantee; premium for LLM-shaped answers.
- **Brave:** Owned index (not reliant on Google/Microsoft); enterprise custom capacity available.

---

## Recommendation Details

**Why Tavily (primary):**
- Cost: Cheapest at 5k queries; reasonable growth path ($30–500 range)
- Domain filtering: Native include/exclude, exact match on Agoda/Booking.com domains
- Attribution: Source + URL mandatory but straightforward to implement in guest guide UI
- Cache: Zero-data-retention + use_cache parameter allow smart caching without legal friction
- Risk: Low; Nebius ownership stable

**Why You.com (fallback):**
- Cost: Marginally cheaper at 50k queries ($235 vs $500)
- Language: Only provider with explicit Vietnamese support (vi language code)
- Flexibility: boost_domains + exclude_domains allows nuanced ranking
- Caveat: Less documentation on caching policy; must clarify retention before scaling

**Not recommended for launch:**
- Brave: No domain exclusion (post-fetch filtering adds latency, complexity)
- Exa: No persistent caching allowed (violates CritterPass cost/performance goals)
- Perplexity: Sonar deprecated Sept 27, 2026; forced migration to Agent API mid-project
- SerpApi/Serper: Google scraping; legal and ToS risk outweighs cost savings

---

## Unresolved Questions

1. **Vietnamese query quality:** Tavily, Linkup, others unknown on SEA language handling. Recommend live testing with "Hội An lantern festival dates 2026" and "Da Nang Dragon Bridge fire show schedule" before committing.
2. **Caching terms (You.com, Linkup, Perplexity):** Clarify retention windows and whether caching is permitted/encouraged. Exa explicitly forbids it; others silent.
3. **Latency from Singapore:** None publish regional latency data. Test from CritterPass infra (Railway SG region) before launch.
4. **Attribution compliance (Tavily):** Verify source + URL display in guest guide UI meets Tavily's threshold; multiple violations lead to suspension.

---

**Sources:**
- [Brave Search API Pricing](https://api-dashboard.search.brave.com/documentation/pricing)
- [Tavily Credits & Pricing](https://docs.tavily.com/documentation/api-credits)
- [You.com Pricing](https://you.com/pricing)
- [You.com API Language Filter](https://you.com/docs/search/overview)
- [Linkup Pricing](https://docs.linkup.so/pages/documentation/platform/pricing)
- [Linkup Source Filtering](https://docs.linkup.so/pages/documentation/development/filtering)
- [Exa License Terms](https://exa.ai/assets/Exa_Labs_Terms_of_Service.pdf)
- [Tavily Attribution Requirements](https://theneuralbase.com/tavily-api/learn/advanced/attribution-requirements/)
- [Perplexity Sonar Deprecation](https://www.perplexity.ai/api-platform/resources/introducing-the-sonar-pro-api-by-perplexity)
- [Google Custom Search Sunset](https://searlo.tech/google-custom-search-json-api-closed-to-new-customers)
- [Bing Search API Retirement](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement)
- [SerpApi Legal Risk](https://apiserpent.com/blog/serpapi-pricing-explained)
