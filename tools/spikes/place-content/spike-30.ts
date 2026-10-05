/**
 * The whole place pipeline on 30 places (15 Đà Lạt, 15 Đà Nẵng with Hội An), popular to local:
 * Jev labels from our row; SearXNG web search (vi + en) and our own fetch of the top 3 pages;
 * DeepSeek pro (no thinking) writes the profile with cite-or-drop; DeepSeek's server web search
 * as the second source for fees, hours and closures; SearXNG images, 3 kept, resized with `sips`.
 * Env: SEARXNG_URL, SPIKE30_OUT, plus the worker's keys (railway run). Writes results.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createDecisionClient } from '../../../packages/ai/src/decide/client';
import { choice, noul } from '../../../packages/ai/src/decide/questions';
import { POI_CATEGORIES } from '../../../packages/domain/src/places/categories';
import { amountsIn } from '../../../packages/ai/src/routes/facts-research/validate';
import { timesInText } from '../../../packages/ai/src/routes/hours-research/validate';
import { withReadOnly } from './db';
import { generate, renderPages, window, type Page } from './lib';
import { BEST_TIMES, factProblem, PROFILE_RULES, PROFILE_SCHEMA } from './profile';

const SEARX = process.env.SEARXNG_URL ?? '';
const OUT30 = process.env.SPIKE30_OUT ?? '/Volumes/CPLanes/tmp/spike-30';
const PHOTOS = join(OUT30, 'photos');
mkdirSync(PHOTOS, { recursive: true });
const UA = 'Mozilla/5.0 (compatible; CritterPassSpike/0.1; hello@critterpass.app)';

const CITIES = {
  dalat: { ids: ['01a0ed04-523e-7014-8a11-1c731cedb9b0'], name: 'Đà Lạt', en: 'Da Lat' },
  danang: {
    ids: ['01a0f2f9-ecda-7b0d-a855-ce874737613c', '01a0ed04-5238-78f7-89a3-0db4370ef891'],
    name: 'Đà Nẵng',
    en: 'Da Nang',
  },
} as const;
type City = keyof typeof CITIES;

interface Place {
  id: string;
  city: City;
  tier: 'essential' | 'must_see' | 'local';
  name: string;
  name_local: string | null;
  category: string;
  tags: string[];
  source_ids: Record<string, unknown>;
  website: string | null;
  address: string | null;
  hours: unknown;
  town: string;
}

async function pickPlaces(): Promise<Place[]> {
  return withReadOnly(async (client) => {
    const out: Place[] = [];
    for (const city of Object.keys(CITIES) as City[]) {
      const ids = CITIES[city].ids;
      const cols = `p.id, p.name, p.name_local, p.category, p.tags, p.source_ids, p.website,
        p.address, p.hours, d.name AS town`;
      const from = `FROM pois p JOIN destinations d ON d.id = p.destination_id
        WHERE p.destination_id = ANY($1::uuid[]) AND p.status = 'active' AND p.merged_into_id IS NULL`;
      const ess = await client.query(
        `SELECT ${cols} ${from} AND (p.editorial->>'essential')::bool ORDER BY p.name LIMIT 4`,
        [ids],
      );
      const must = await client.query(
        `SELECT ${cols} ${from} AND (p.editorial->>'must_see')::bool
           AND NOT coalesce((p.editorial->>'essential')::bool, false)
           AND p.category <> 'food' ORDER BY p.name LIMIT 4`,
        [ids],
      );
      // Local: no notes; eateries and cafés with a website or hours first, then small sights.
      const localFood = await client.query(
        `SELECT ${cols} ${from} AND NOT (p.editorial ? 'why_go') AND p.category = 'food'
           AND (p.website IS NOT NULL OR p.hours <> '{}'::jsonb)
           AND p.brand IS NULL ORDER BY coalesce(p.confidence, 0) DESC, p.id LIMIT 4`,
        [ids.slice(0, 1)],
      );
      const localSight = await client.query(
        `SELECT ${cols} ${from} AND NOT (p.editorial ? 'why_go')
           AND p.category IN ('temple_shrine','museum','nature','market')
           ORDER BY coalesce(p.confidence, 0) DESC, p.id LIMIT 3`,
        [ids.slice(-1)],
      );
      const tag = (rows: Omit<Place, 'city' | 'tier'>[], tier: Place['tier']) =>
        rows.map((r) => ({ ...r, city, tier }));
      out.push(
        ...tag(ess.rows, 'essential'),
        ...tag(must.rows, 'must_see'),
        ...tag(localFood.rows, 'local'),
        ...tag(localSight.rows, 'local'),
      );
    }
    return out;
  });
}

const timed = async <T>(run: () => Promise<T>): Promise<[T, number]> => {
  const started = performance.now();
  const value = await run();
  return [value, Math.round(performance.now() - started)];
};

// 1. Jev labels from our row.
const jev = createDecisionClient({ apiKey: process.env.TYPESAFE_API_KEY, timeoutMs: 20_000 });
async function jevLabels(p: Place) {
  const decision = await jev.decide('poi.duplicate_tiebreak', {
    state: {
      name: p.name,
      local_name: p.name_local,
      tags: p.tags,
      sources: Object.keys(p.source_ids),
      website: p.website,
    },
    questions: {
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
    },
  });
  const a = decision.answers as Record<string, { choice?: string; noul?: number }>;
  return {
    category: a.category?.choice ?? null,
    category_matches_row: a.category?.choice === p.category,
    meal_role: a.meal?.choice ?? null,
    best_times: BEST_TIMES.filter((t) => (a[t]?.noul ?? 0) >= 0.5),
    cost_usd: decision.costMicros / 1e6,
  };
}

// 2. SearXNG and our own page fetch.
interface SearxResult {
  url: string;
  title: string;
  content?: string;
  img_src?: string;
  thumbnail_src?: string;
  engine?: string;
}
async function searx(q: string, language: string, categories = 'general'): Promise<SearxResult[]> {
  const params = new URLSearchParams({ q, format: 'json', language, categories });
  const response = await fetch(`${SEARX}/search?${params}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return [];
  return ((await response.json()) as { results?: SearxResult[] }).results ?? [];
}

const SKIP =
  /facebook\.com|instagram\.com|tiktok\.com|youtube\.com|tripadvisor\.|trip\.com|booking\.com|agoda\.|klook\.|pinterest\./u;

async function fetchPage(url: string, near: string[]): Promise<Page | null> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(8_000),
      redirect: 'follow',
    });
    if (!response.ok) return null;
    const html = await response.text();
    const text = html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/giu, ' ')
      .replace(/<[^>]+>/gu, ' ')
      .replace(/&nbsp;/gu, ' ')
      .replace(/&amp;/gu, '&')
      .replace(/&#(\d+);/gu, (_, n: string) => String.fromCodePoint(Number(n)));
    const title = /<title[^>]*>([^<]*)/iu.exec(html)?.[1]?.trim() ?? '';
    const clipped = window(text, near);
    return clipped.length < 300 ? null : { url, title, text: clipped, publishedAt: null };
  } catch {
    return null;
  }
}

async function evidence(p: Place) {
  const city = CITIES[p.city];
  const local = p.name_local ?? p.name;
  const [vi, en] = await Promise.all([
    searx(`${local} ${p.town} giờ mở cửa giá vé`, 'vi'),
    searx(`${p.name} ${city.en} Vietnam opening hours`, 'en'),
  ]);
  const snippets: Page[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 6; i += 1) {
    for (const r of [vi[i], en[i]]) {
      if (r !== undefined && !seen.has(r.url)) {
        seen.add(r.url);
        snippets.push({ url: r.url, title: r.title, text: r.content ?? '', publishedAt: null });
      }
    }
  }
  const near = [p.name, p.name_local ?? ''].filter((n) => n.length > 2);
  const candidates = [
    ...(p.website === null ? [] : [p.website]),
    ...snippets.map((s) => s.url).filter((u) => !SKIP.test(u)),
  ];
  const pages: Page[] = [];
  for (const url of candidates) {
    if (pages.length >= 3) break;
    const page = await fetchPage(url, near);
    if (page !== null) pages.push(page);
  }
  return { snippets, pages };
}

// 4. DeepSeek's own search: the second source for fee, hours and closure.
async function deepseekCheck(p: Place) {
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic').replace(
    /\/$/u,
    '',
  );
  const response = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-v4-pro',
      max_tokens: 800,
      thinking: { type: 'disabled' },
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      messages: [
        {
          role: 'user',
          content: `${p.name_local ?? p.name} (${p.name}), ${p.town}, Vietnam. Search the web, then reply with JSON only: {"entry_fee": string|null (adult, as written), "hours": string|null, "closed_or_renovating": string|null, "urls": [string]}.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await response.json()) as {
    content?: { type: string; text?: string; content?: { url?: string }[] }[];
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
  };
  const text = (body.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  const results = (body.content ?? [])
    .filter((b) => b.type === 'web_search_tool_result' && Array.isArray(b.content))
    .flatMap((b) => (b.content ?? []).map((r) => r.url ?? ''));
  let answer: Record<string, unknown> | null = null;
  try {
    answer = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<
      string,
      unknown
    >;
  } catch {
    answer = null;
  }
  // deepseek-v4-pro off-peak: $0.66 / MTok input, $1.98 / MTok output (packages/ai pricing).
  const usd =
    ((body.usage?.input_tokens ?? 0) * 0.66 + (body.usage?.output_tokens ?? 0) * 1.98) / 1e6;
  return { answer, result_urls: [...new Set(results)].slice(0, 8), cost_usd: usd };
}

function agrees(kind: string, value: string, second: Record<string, unknown> | null): boolean {
  if (second === null) return false;
  if (kind === 'entry') {
    const other = String(second.entry_fee ?? '');
    const a = amountsIn(value);
    const b = amountsIn(other);
    if (a.size === 0) return /free|miễn phí/iu.test(value) && /free|miễn phí/iu.test(other);
    return [...a].some((x) => b.has(x));
  }
  if (kind === 'hours') {
    const a = timesInText(value);
    const b = timesInText(String(second.hours ?? ''));
    return a.size > 0 && [...a].filter((x) => b.has(x)).length >= Math.min(2, a.size);
  }
  return false;
}

// 5. Photos.
async function photos(p: Place, key: string) {
  const results = await searx(`${p.name_local ?? p.name} ${p.town}`, 'vi', 'images');
  const kept: { file: string; source_page: string; engine: string | null; bytes: number }[] = [];
  for (const r of results.slice(0, 10)) {
    if (kept.length >= 3) break;
    const src = r.img_src ?? r.thumbnail_src;
    if (src === undefined || /pinimg|pinterest/u.test(src)) continue;
    try {
      const response = await fetch(src.startsWith('//') ? `https:${src}` : src, {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;
      const raw = join(PHOTOS, `${key}-${kept.length + 1}.src`);
      const file = `${key}-${kept.length + 1}.jpg`;
      writeFileSync(raw, Buffer.from(await response.arrayBuffer()));
      execFileSync(
        'sips',
        [
          '-s',
          'format',
          'jpeg',
          '-s',
          'formatOptions',
          '60',
          '--resampleWidth',
          '480',
          raw,
          '--out',
          join(PHOTOS, file),
        ],
        { stdio: 'ignore' },
      );
      execFileSync('rm', [raw]);
      kept.push({
        file,
        source_page: r.url,
        engine: r.engine ?? null,
        bytes: statSync(join(PHOTOS, file)).size,
      });
    } catch {
      // A photo that will not download or convert is skipped.
    }
  }
  return kept;
}

async function runPlace(p: Place, index: number) {
  const key = `${p.city}-${String(index + 1).padStart(2, '0')}`;
  const [labels, jevMs] = await timed(() => jevLabels(p));
  const [ev, searchMs] = await timed(() => evidence(p));
  const all = [...ev.pages, ...ev.snippets];
  const user = [
    `Place: ${p.name}${p.name_local === null ? '' : ` (${p.name_local})`}`,
    `City: ${p.town}, Vietnam. Kind: ${p.category}. Address: ${p.address ?? 'unknown'}.`,
    '',
    renderPages(all),
    '',
    'Write the profile as JSON.',
  ].join('\n');
  const [gen, writeMs] = await timed(() =>
    generate({
      tier: 'pro',
      thinking: false,
      system: PROFILE_RULES,
      user,
      schema: PROFILE_SCHEMA,
      maxTokens: 2_500,
      label: 'spike30-profile',
    }),
  );
  const profile = gen.json as {
    decision: string;
    why_go: { en: string; vi: string };
    best_time: { en: string; vi: string };
    crowd: { en: string; vi: string };
    best_times: string[];
    visit_min: number;
    meal_role: string;
    dish: string | null;
    facts: { kind: string; en: string; vi: string; source_url: string; quote: string }[];
  } | null;
  const [second, secondMs] = await timed(() => deepseekCheck(p));
  const ownHost = p.website === null ? null : new URL(p.website).hostname.replace(/^www\./u, '');
  const facts = (profile?.decision === 'write' ? profile.facts : []).map((f) => {
    const cite = factProblem(f as never, all);
    const ownSite = ownHost !== null && f.source_url.includes(ownHost);
    const corroborated = agrees(f.kind, f.en, second.answer);
    const needsTwo = f.kind === 'entry' || f.kind === 'hours';
    const kept = cite === null && (!needsTwo || ownSite || corroborated);
    return {
      kind: f.kind,
      en: f.en,
      vi: f.vi,
      source_url: f.source_url,
      quote: f.quote,
      cite_check: cite ?? 'ok',
      second_source: needsTwo ? (ownSite ? 'own_site' : corroborated ? 'agrees' : 'no') : 'n/a',
      kept,
    };
  });
  const [pics, photoMs] = await timed(() => photos(p, key));
  const result = {
    key,
    city: p.city,
    tier: p.tier,
    row: {
      id: p.id,
      name: p.name,
      name_local: p.name_local,
      kind: p.category,
      town: p.town,
      website: p.website,
    },
    jev: labels,
    profile:
      profile?.decision === 'write'
        ? {
            why_go: profile.why_go,
            best_time: profile.best_time,
            crowd: profile.crowd,
            best_times: profile.best_times,
            visit_min: profile.visit_min,
            meal_role: profile.meal_role,
            dish: profile.dish,
          }
        : null,
    declined: profile?.decision !== 'write',
    facts,
    second_source: second,
    sources_read: ev.pages.map((pg) => pg.url),
    photos: pics,
    seconds: {
      jev: jevMs / 1000,
      search_and_fetch: searchMs / 1000,
      write: writeMs / 1000,
      second_source: secondMs / 1000,
      photos: photoMs / 1000,
    },
    cost_usd: {
      jev: labels.cost_usd,
      write: gen.costMicros / 1e6,
      second_source: second.cost_usd,
      search: 0,
    },
  };
  console.log(
    `${key} ${p.tier.padEnd(9)} ${p.name.slice(0, 28).padEnd(28)} facts ${facts.filter((f) => f.kept).length}/${facts.length} photos ${pics.length} ${((jevMs + searchMs + writeMs + secondMs + photoMs) / 1000).toFixed(1)} s`,
  );
  return result;
}

const places = await pickPlaces();
const results: Awaited<ReturnType<typeof runPlace>>[] = [];
const queue = places.map((p, i) => ({
  p,
  i: places.filter((q, j) => j < i && q.city === p.city).length,
}));
async function worker(): Promise<void> {
  for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
    try {
      results.push(await runPlace(job.p, job.i));
    } catch (error) {
      console.log(`${job.p.name} failed: ${(error as Error).message}`);
    }
    writeFileSync(
      join(OUT30, 'results.json'),
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          places: [...results].sort((a, b) => a.key.localeCompare(b.key)),
        },
        null,
        2,
      ),
    );
  }
}
await Promise.all(Array.from({ length: 5 }, worker));
console.log(`done ${results.length}/${places.length}`);
