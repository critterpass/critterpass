# Destination base set: gaps, city parts and the staging change list (dry run)

Branch `fix/destination-base-gaps`. Everything here was planned offline against a staging snapshot taken on 15 Oct (5,070 destination rows, 4,903 `base`). Nothing on staging was written.

## 1. Why well-known destinations were missing

Each cause was traced through the build stages: Wikidata candidates, GeoNames cities, join, rank and cap.

| Cause | Proof (old build) |
| --- | --- |
| **Wikidata class filter.** Only items whose direct P31 was city, big city, town, village, island or national park were fetched. Most places carry a local subclass instead. | Zurich (municipality of Switzerland, largest city), Valencia, Granada and Bilbao (municipality of Spain), Sintra (municipality of Portugal), Bologna (comune), Hallstatt (market municipality), Hakone (town of Japan), Chongqing (megacity), Phong Nha–Kẻ Bàng (national park *of Vietnam*), Côn Đảo (island group), Machu Picchu (archaeological site), Inle Lake (lake), Cinque Terre (tourist destination). None of them was a Wikidata candidate. |
| **GeoNames fame lookup hit stub twins.** A GeoNames-only city got its sitelinks, name and photo from the Wikidata item holding its GeoNames id (P1566). That item is often a one-sitelink import stub, and its label renamed the city, so the city no longer joined the real item by name. | Granada became "Granada city" (Q31916723, 1 sitelink), Bilbao "Bilbao City" (Q31913753, 1), Chongqing "Chongqing Shi" (Q15897817, 7), Bologna Q49295398 (1). Zurich and Incheon matched no item (0 sitelinks). Scores were 6.5 to 7.5, under the cut of about 9.2. |
| **Ranking and caps.** Score = ln(sitelinks) + 0.5·ln(population), with a total cap of 5,000 and 150 per country. Population pushed suburbs above famous small towns. | Kotor (80 sitelinks, Wikidata population 562) scored 7.56 and Krabi town 8.91, both under the global cut of 9.16. Savannah scored 10.45 under the US cut of 10.50. Meanwhile Spain kept L'Hospitalet (10.80), Terrassa, Badalona and Móstoles. |
| **No country code for the Netherlands.** The country came from `P17/P297`, but the Netherlands (Q55) has no P297. Only the Kingdom (Q29999) has `NL`. | Every Dutch Wikidata item was dropped. Amsterdam, Rotterdam and Maastricht existed only as GeoNames rows with 0 sitelinks. |
| **Region exclusion.** First-level units are left out on purpose. | Goa (state of India) and Bali (province of Indonesia) have no settlement or island class. They stay out (Bali already has a seed row). |
| **Dedupe radius.** A city-province's Wikidata item sits on the province centroid. | Cần Thơ Q216075 is centred 34 km from the GeoNames city (1586203). That is beyond the 25 km join and the 5 km dedupe, so two rows were kept (`vn-can-tho`, and `vn-can-tho-2` from the Vietnam picks). |

Why wards, districts and estates got in: the GeoNames gap-fill accepted every seat or city of 50,000 or more people, whatever its feature code.

- Hanoi's and Saigon's urban districts are `PPLA2` seats: Hoàn Kiếm, Cầu Giấy, Quận Năm, Quận Mười, Thủ Đức.
- Neighbourhoods are `PPLX` sections: Bồ Đề, Linh Đàm, and also Eixample, Kreuzberg and Copacabana elsewhere.
- Housing estates are `PPLL` localities: Vinhomes Smart City, Ocean Park and Times City.

## 2. The rule change

The rule now lives in `services/worker/src/destinations/base/classes.ts`, `wikidata.ts`, `geonames.ts` and `packages/domain/src/destinations/join.ts` / `rank.ts`; the module comments explain it.

- **Candidates.** Every Wikidata item with an English or Vietnamese Wikivoyage article, coordinates, and at least 10 sitelinks (5 in Vietnam). This gives 22,721 items, against 8,263 before.
- **Classes.** Each class is tested against root classes through `wdt:P279*`: settlement, municipality, island, archipelago, national park, protected area, archaeological site, lake, bay, beach, hot spring and tourist destination. One closure query runs per build over about 2,500 classes. A short list of direct classes adds Vietnamese huyện, communes and wards, Chinese counties, Thai amphoe, hill stations, waterfalls and caves.
- **What is not a destination.**
  - City parts never count: neighbourhood, suburb, quarter, city or urban district, and Wikivoyage district subpages such as `Hanoi/Old Quarter`.
  - A country counts only as a city (Monaco, Singapore).
  - A first-level unit counts only as a city or an island (Seoul, Incheon, Chongqing).
  - Airports never count, and neither do islands of 2 million people or more (Honshu, the British Isles).
- **Kind.**
  - Parks and ancient cities are `park`: Yosemite, Machu Picchu, Bagan.
  - Islands under 100k people are `island`.
  - Settlements are `city` at 100k people or more, otherwise `town` or `village`.
- **Country code.** The item's own code (Hong Kong, Macau), else its country's, else that country's country (Netherlands → `NL`).
- **GeoNames.**
  - `PPLX`, `PPLL` and historical, abandoned or destroyed places are skipped.
  - A GeoNames-only row within 15 km of a city with at least twice its population is a city part and is dropped.
  - Fame items under 10 sitelinks are ignored.
- **Join.** The name-join radius is now 40 km. When an item's point is more than 5 km from its GeoNames city, the city's point is used (this fixes Cần Thơ's centroid).
- **Score.** ln(sitelinks+1) + 2·ln(Wikivoyage editions+1) + 0.15·ln(population+1), plus 1 for an island or park. Caps: 200 per country, Vietnam 300, total **6,000**.
- **WDQS reliability.** Candidates are paged in 18 sitelink bands, plus one query per band that counts Wikivoyage editions. Requests are retried on a dropped connection. A full load takes about 10 minutes.

## 3. Staging change list (dry run)

| | Count |
| --- | --- |
| Wikidata candidates / GeoNames cities / joined | 22,721 / 16,084 / 29,526 |
| Kept by the new rule | 6,000 (Vietnam 256) |
| Existing rows enriched | 3,459 |
| **Rows to add** | **2,539** (city 1,045, town 1,039, island 239, park 200, village 16) |
| **Rows to remove** (list attached) | **370** (Vietnam 85) |
| Base rows the new rule no longer produces but that are real towns | 1,202 (left in place) |

**Added, by country (top):** ES 168, IT 122, DE 106, FR 101, GR 84, PT 84, GB 83, US 82, JP 80, NL 80, RU 80, RO 67, CN 65, IN 60, SE 56. Vietnam adds 39.

**Examples of added rows:**

- Zurich, Valencia, Granada, Bilbao, Córdoba, Toledo, San Sebastián, Santiago de Compostela
- Bologna, Bari, Ischia, Funchal, Sintra, Coimbra, Antwerp, Utrecht, Hallstatt, Kotor, Monaco
- Chongqing, Nagasaki, Hakone, Incheon, Bandung, Krabi, Bagan, Inle Lake, Machu Picchu
- Galápagos Islands, Grand Canyon National Park, Yosemite National Park, Savannah, Salvador, Bora Bora, Zanzibar Archipelago
- Vietnam: Côn Đảo, Phong Nha–Kẻ Bàng, Ba Bể, Cát Tiên, Cúc Phương, Bạch Mã, Mỹ Sơn, Hạ Long Bay, Cù Lao Chàm, Tam Cốc–Bích Động, Đồng Văn Karst Plateau, Bắc Hà, Mộc Châu, Tam Đảo

**Hand list:** 89 of 108 names are now in the built set, against 16 of 108 rows on staging today. The rest:

- **Below the 6,000 cut** (few Wikivoyage editions): Coron, El Nido, Munnar, Ella, Sigiriya, Niseko, Sedona, Byron Bay.
- **No destination class:** Goa (state), Bali (province, already a seed row), Cameron Highlands (district of Malaysia).
- **No Wikivoyage article, or under 5 sitelinks:** Mù Cang Chải, Nam Du, Bình Ba, Ko Lanta (9 sitelinks).
- **Name mismatch only:** Sukhothai and Nikkō are in as "Sukhothai Thani" and "Nikkō-shi".
- **Not found:** Boracay and Kawaguchiko.
- **Mai Châu:** found no Wikivoyage-linked item.

The Vietnam top-up (`vn-topup-cli.ts`) or a curated row can cover the Vietnamese ones.

**Rows to remove.** The 370 slugs are in `plans/reports/destination-base-gaps-261015-removal-slugs.txt`, all `origin = 'base'`.

- **City sections, localities and estates (`PPLX`/`PPLL`), 78 rows:** Bồ Đề, Linh Đàm, Chợ Lớn, Tân Bình, Bình Thạnh, Vinhomes Ocean Park, Vinhomes Smart City, Vinhomes Times City, Eixample, Berlin-Mitte, Kreuzberg, Copacabana, Deira, Dubai Marina.
- **City parts without an article within 15 km of a city twice their size, 291 rows:** Hoàn Kiếm, Ba Đình, Cầu Giấy, Đống Đa, Hai Bà Trưng, Long Biên, Gò Vấp, Quận Ba to Quận Mười Một, Thủ Đức, Cẩm Lệ, Sơn Trà, Thanh Khê, Ixelles, Molenbeek-Saint-Jean, Lanús. Vietnam picks (`names.source = 'vn_pick'`) are never in this group.
- **Duplicate, 1 row:** `vn-can-tho-2`. Its GeoNames id moves to `vn-can-tho` on the rebuild, and `vn-can-tho` takes the city's point.
- **Worth a glance before deleting:** `ae-ajman` (a separate emirate, 10 km from Sharjah), `au-blue-mountains` (a GeoNames section; the Blue Mountains park comes in from Wikivoyage) and `ch-frauenfeld`.

**References checked on staging.** None of the 370 rows is referenced by trips, trip stops or places, plan days, stamps, shared plans, swipe sessions, local guides, place cards or tips, POIs, critter sets, spawn rules, weather or price tables (all counts 0). The foreign keys are `NO ACTION` except the brief, link, home-link, itinerary and local-guide tables, which cascade. A referenced row would make the whole `DELETE` fail rather than lose data.

## 4. How new rows get critters, texts and photos

The existing paths cover them:

- **Photos.** `runBaseBuild` queues a `media.ingest` job for every planned row with a Commons file (Wikivoyage banner, else P18). The running staging worker stores them. Pass `--skip-photos` to defer.
- **Critters.** `--match` runs `matchBaseCritters`. It covers every `base` row without a critter, using the admin-region override, then the clearly nearest critter in the same country, then Jev's pick among the nearest few, then the globally nearest critter.
- **Texts.** `--describe` writes en and vi texts for every `base` row missing them, highest `base_rank` first, eight at a time, under `--describe-cap-usd` (default 2). About 2,500 new rows need more than one day's cap, or a larger cap.
- **Monthly job.** `destinations.base_build` applies the same rule on its next run. Rebuilds never delete rows, so the removal list is the only manual step.

## 5. Commands for the controller (after the PR is merged and the worker is deployed)

Run from an up-to-date `main` checkout, for example `/Users/quocs/Projects/critterpass-worktrees/deploy` after `git pull`.

1. Remove the city parts and the duplicate first, so freed GeoNames ids go to the right rows. The statement fails as a whole if any row is referenced:

   ```sh
   railway run --service worker --environment staging -- pnpm --filter @cp/worker exec tsx /Users/quocs/Projects/critterpass-worktrees/.controller/q.mts \
     "DELETE FROM destinations WHERE origin = 'base' AND slug = ANY(\$1::text[]) RETURNING slug" \
     "{$(paste -sd, plans/reports/destination-base-gaps-261015-removal-slugs.txt)}" | grep -c slug   # expect 370
   ```

2. Dry run, which prints the counts. Expect about 2,540 inserted and 3,460 enriched:

   ```sh
   railway run --service worker --environment staging -- pnpm --filter @cp/worker exec tsx src/destinations/base/cli.ts --dry-run
   ```

3. Rebuild, then match critters and write texts:

   ```sh
   railway run --service worker --environment staging -- pnpm --filter @cp/worker exec tsx src/destinations/base/cli.ts --match --describe --describe-cap-usd=5
   ```

## Open questions

- Is a total of 6,000 (up from 5,000) acceptable? At 7,000 only one more name from the hand list gets in. The per-country cap of 200 binds for ES, IT, FR, DE, GB, US, JP, CN, RU, IN and BR.
- Some island groups and territories now enter as `island` rows: Balearic Islands, Ionian Islands, Maluku Islands, Channel Islands, Pitcairn, Tokelau, Svalbard. Most are real trip targets. Maluku is a region, and could be curated out.
