# Destination base set

Date: 2026-10-14
Status: decided (founder, D39). Amends D29 (1) on which destinations exist.

## Context

About 150 destinations existed: seven seeded, one per critter city and AI-made trip areas. A crew
pitching a town outside them got no photo, no line and no guide. The founder chose a stored base
set of a few thousand destinations, each matched to one of the 151 critters, over an AI call per
town.

## Sources and licences

| Source | Use | Licence and credit |
|---|---|---|
| Wikidata | Candidates, names, kind, country, admin area, population, coordinates, photo file | CC0; no credit required |
| Wikivoyage (en, vi) | Filter only: a place with an article is a travel destination; no text is used | not reproduced |
| GeoNames `cities15000` (Vietnam also `cities5000`) | Gap fill, population, admin codes | CC BY 4.0: "GeoNames" credited in the app's data credits |
| Wikimedia Commons | One photo per destination (banner P948, else image P18) | per file: PD, CC0, CC BY or CC BY-SA only; licence, artist, credit and licence URL stored on the `media_assets` row and shown |

## Recipe

1. **Candidates:** Wikidata items with an en or vi Wikivoyage article, a direct kind of city, town,
   village, big city, island, national park or region, and at least 10 sitelinks; plus GeoNames
   rows that are capitals or first/second-level seats, or have 50,000 people or more.
2. **Join:** by Wikidata id (GeoNames `wkdt`), else normalised name, country and 25 km; duplicates
   by id or the same normalised name within 5 km.
3. **Rank and cap:** `ln(sitelinks + 1) + 0.5 · ln(population + 1)`, plus one for an island or a
   park; at most 150 per country, at least 10 in a country that has a critter, Vietnam up to 300;
   about 5,000 in total.
4. **Vietnam top-up:** a one-time model pass proposes towns the sources miss; the list is checked
   once before it is stored.
5. **Existing rows** (seeded, critter city, area) are matched and only enriched; their slug, name,
   coverage, set and critter never change.
6. **New rows:** `origin = 'base'`, `coverage = 'guest'`, slug `<iso2>-<folded name>` (never
   reused), a default `place_bounds` box around the centre (city 12 km, town 6 km, island, park or
   region 25 km).
7. **Text:** facts-only, written by a model from Wikidata and GeoNames facts alone (a line of at
   most 90 characters and an about paragraph of at most 400, in English and Vietnamese); every
   number must appear in the input; shown as AI-written with "Facts: Wikidata, GeoNames".
8. **Rebuild:** a monthly worker job (`destinations.base_build`) and an operator dry run.

## Critter matching

Each destination gets exactly one of the 151 critters as its guide (`critter_key`) and the method
(`critter_match{method, distance_km, confidence?}`):

1. an admin-region override;
2. else the nearest critter in the same country within 350 km, when it is at least 1.5 times
   nearer than the second;
3. else Jev (`destination.critter`) chooses from at most four candidate keys (the three nearest in
   the country, else the three nearest anywhere), never a free answer;
4. else the nearest critter anywhere, so no row is left without one.

Neighbouring destinations share a critter. Base rows carry no `critter_set_id`, so the public
locals pages stay with the 61 curated places.

## Sync

The catalog stream leaves base rows out. A base row reaches a phone only when one of its crews'
trips, poll options or pitches names it; vote search finds base rows through the api
(`GET /v1/places?q`), behind the `destinations.base_search` switch.
