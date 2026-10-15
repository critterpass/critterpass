/**
 * Two quick checks on 10 sample places. Jev labels each open-data row (name, OSM tags, source
 * ids, no category) with our category, a meal role and best times; compared with the row's
 * category, the reviewed note's best times (Jev-typed earlier) and a hand meal label. Photos:
 * how many images Wikimedia Commons (with licence) and Tavily (include_images) return per place;
 * thumbnails are saved under `photos/` for a person to look at. Writes `labels-photos.json`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createDecisionClient } from '../../../packages/ai/src/decide/client';
import { choice, noul } from '../../../packages/ai/src/decide/questions';
import { POI_CATEGORIES } from '../../../packages/domain/src/places/categories';
import { withReadOnly } from './db';
import { OUT, readOut, writeOut } from './lib';
import { BEST_TIMES } from './profile';

const PLACES: Record<string, 'meal' | 'snack' | 'none'> = {
  'Crazy House': 'none',
  'Datanla Falls': 'none',
  'Bảo Đại Summer Palace (Dinh III)': 'none',
  'Nem Nướng Bà Hùng': 'meal',
  'Liên Hoa Bakery': 'snack',
  'Le Rabelais': 'meal',
  'Kinh Thành Huế (Hue Imperial City)': 'none',
  'Chùa Thiên Mụ (Thien Mu Pagoda)': 'none',
  'Madam Thu Restaurant': 'meal',
  'Quán Hạnh': 'meal',
};

interface Row {
  id: string;
  name: string;
  name_local: string | null;
  category: string;
  tags: string[];
  source_ids: Record<string, unknown>;
  website: string | null;
}

const rows = await withReadOnly(async (client) => {
  const { rows: found } = await client.query<Row>(
    `SELECT id, name, name_local, category, tags, source_ids, website FROM pois
      WHERE id = ANY($1::uuid[])`,
    [
      readOut<{ id: string; name: string }[]>('sample.json')
        .filter((p) => p.name in PLACES)
        .map((p) => p.id),
    ],
  );
  return found;
});
const typed = readOut<{ typed: Record<string, { times: string[] }> }>('scores.json').typed;

// 1. Jev labels, one call per place (latency per place is what the page would pay).
const jev = createDecisionClient({ apiKey: process.env.TYPESAFE_API_KEY, timeoutMs: 20_000 });
const labels = [];
for (const row of rows) {
  const state = {
    name: row.name,
    local_name: row.name_local,
    tags: row.tags,
    sources: Object.keys(row.source_ids),
    website: row.website,
  };
  const questions = {
    category: choice(
      'Which category is this place?',
      Object.fromEntries(POI_CATEGORIES.map((c) => [c, null])) as Record<string, null>,
    ),
    meal: choice('What part does food play in a visit?', {
      meal: 'people come to eat a full meal',
      snack: 'coffee, drinks, bread or a snack',
      none: 'not a place to eat or drink',
    }),
    ...Object.fromEntries(
      BEST_TIMES.map((t) => [t, noul(`Is the ${t.replace('_', ' ')} a good time to visit?`)]),
    ),
  };
  const decision = await jev.decide('poi.duplicate_tiebreak', { state, questions });
  const a = decision.answers as Record<string, { choice?: string; noul?: number }>;
  const times = BEST_TIMES.filter((t) => (a[t]?.noul ?? 0) >= 0.5);
  const gold = typed[`gold|${row.id}`]?.times ?? null;
  labels.push({
    name: row.name,
    category: a.category?.choice,
    categoryOk: a.category?.choice === row.category,
    rowCategory: row.category,
    meal: a.meal?.choice,
    mealOk: a.meal?.choice === PLACES[row.name],
    times,
    goldTimes: gold,
    timesOverlap: gold === null ? null : times.some((t) => gold.includes(t)),
    ms: Math.round(decision.latencyMs),
    by: decision.answered_by,
    micros: decision.costMicros,
  });
}

// 2. Photos.
const dir = join(OUT, 'photos');
mkdirSync(dir, { recursive: true });
const UA = { 'user-agent': 'CritterPassSpike/0.1 (hello@critterpass.app)' };

async function commons(query: string) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=${encodeURIComponent(query)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=320`;
  const body = (await (await fetch(url, { headers: UA })).json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title: string;
          imageinfo?: {
            thumburl?: string;
            extmetadata?: Record<string, { value?: string }>;
          }[];
        }
      >;
    };
  };
  return Object.values(body.query?.pages ?? {}).map((p) => ({
    title: p.title,
    thumb: p.imageinfo?.[0]?.thumburl ?? null,
    licence: p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value ?? null,
    artist: (p.imageinfo?.[0]?.extmetadata?.Artist?.value ?? '')
      .replace(/<[^>]+>/gu, '')
      .slice(0, 60),
  }));
}

async function tavilyImages(query: string) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.TAVILY_API_KEY ?? ''}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, search_depth: 'basic', max_results: 3, include_images: true }),
  });
  const body = (await response.json()) as { images?: (string | { url: string })[] };
  return (body.images ?? []).map((i) => (typeof i === 'string' ? i : i.url));
}

async function save(url: string | null, file: string): Promise<void> {
  if (url === null) return;
  try {
    const response = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) });
    if (response.ok) writeFileSync(join(dir, file), Buffer.from(await response.arrayBuffer()));
  } catch {
    // An image that will not load counts as no image.
  }
}

const photos = [];
for (const [i, row] of rows.entries()) {
  const query =
    `${row.name_local ?? row.name.replace(/\s*\(.*\)\s*/u, ' ')} ${i < 6 ? '' : ''}`.trim();
  const city = /Hu[eế]|Thiên Mụ|Madam Thu|Hạnh/u.test(row.name) ? 'Huế' : 'Đà Lạt';
  const [c, t] = await Promise.all([
    commons(`${query} ${city}`),
    tavilyImages(`${row.name} ${city}`),
  ]);
  await Promise.all([
    ...c.slice(0, 2).map((img, k) => save(img.thumb, `${i}-commons-${k}.jpg`)),
    ...t.slice(0, 2).map((img, k) => save(img, `${i}-tavily-${k}.jpg`)),
  ]);
  photos.push({
    i,
    name: row.name,
    commons: c.length,
    commonsLicensed: c.filter((x) => x.licence !== null).length,
    commonsTop: c.slice(0, 2).map((x) => `${x.title} [${x.licence}]`),
    tavily: t.length,
    tavilyTop: t.slice(0, 2),
  });
}

writeOut('labels-photos.json', { labels, photos });
console.table(labels.map(({ goldTimes: _g, times: _t, ...l }) => l));
console.table(photos.map(({ commonsTop: _c, tavilyTop: _t, ...p }) => p));
