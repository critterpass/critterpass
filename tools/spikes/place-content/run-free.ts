/**
 * Profiles with no paid search: (a) fast tier from model knowledge plus our own row; (b) pro tier
 * without thinking plus free pages (Wikivoyage and Wikipedia through the MediaWiki API, the
 * place's own website fetched directly). Facts still go through cite-or-drop against those pages
 * (our row counts as a page). Results are merged into `profiles.json` for `score-profiles.ts`.
 */
import { DESTINATIONS, type SamplePlace } from './db';
import { generate, ledger, readOut, renderPages, window, writeOut, type Page } from './lib';
import { factProblem, PROFILE_RULES, PROFILE_SCHEMA, type ProfileResult } from './profile';

const PLACES = [
  'Crazy House',
  'Datanla Falls',
  'Bảo Đại Summer Palace (Dinh III)',
  'Lam Dong Museum',
  'Tuyền Lâm Lake',
  'Mộng Mơ Hill',
  'Nem Nướng Bà Hùng',
  'Liên Hoa Bakery',
  'Le Rabelais',
  'Kinh Thành Huế (Hue Imperial City)',
  'Chùa Thiên Mụ (Thien Mu Pagoda)',
  'Lăng Khải Định (Khai Dinh Tomb)',
  'Madam Thu Restaurant',
  'Quán Hạnh',
];

const MEMORY_RULES = PROFILE_RULES.replace(
  'given as data; they are your only knowledge of this place. Never use what you remember about it.',
  'given as data, and what you know about this place. Prose may use what you know; facts must quote a page.',
).replace(
  '- If the pages are not about this exact place (same name and city), decision is decline.',
  '- Decline only when you do not know this place at all.',
);

function rowPage(place: SamplePlace): Page {
  return {
    url: `row:${place.id}`,
    title: `${place.name} (our place record)`,
    text: [
      `Name: ${place.name}`,
      place.nameLocal === null ? '' : `Local name: ${place.nameLocal}`,
      `Kind: ${place.category}`,
      place.address === null ? '' : `Address: ${place.address}`,
      JSON.stringify(place.hours) === '{}' ? '' : `Opening hours: ${JSON.stringify(place.hours)}`,
      place.website === null ? '' : `Website: ${place.website}`,
    ]
      .filter((l) => l !== '')
      .join('\n'),
    publishedAt: null,
  };
}

async function wiki(host: string, query: string, near: string[]): Promise<Page | null> {
  const api = `https://${host}/w/api.php`;
  const ua = { 'user-agent': 'CritterPassSpike/0.1 (hello@critterpass.app)' };
  const found = (await (
    await fetch(
      `${api}?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(query)}`,
      { headers: ua, signal: AbortSignal.timeout(10_000) },
    )
  ).json()) as { query?: { search?: { title: string }[] } };
  const title = found.query?.search?.[0]?.title;
  if (title === undefined) return null;
  const body = (await (
    await fetch(
      `${api}?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=${encodeURIComponent(title)}`,
      { headers: ua, signal: AbortSignal.timeout(10_000) },
    )
  ).json()) as { query?: { pages?: Record<string, { extract?: string }> } };
  const text = Object.values(body.query?.pages ?? {})[0]?.extract ?? '';
  if (text.length < 200) return null;
  return {
    url: `https://${host}/wiki/${encodeURIComponent(title.replace(/ /gu, '_'))}`,
    title,
    text: window(text, near),
    publishedAt: null,
  };
}

async function site(url: string, near: string[]): Promise<Page | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'follow' });
    if (!response.ok) return null;
    const html = await response.text();
    const text = html
      .replace(/<(script|style)[\s\S]*?<\/\1>/giu, ' ')
      .replace(/<[^>]+>/gu, ' ')
      .replace(/&nbsp;/gu, ' ')
      .replace(/&amp;/gu, '&');
    return { url, title: 'Official website', text: window(text, near), publishedAt: null };
  } catch {
    return null;
  }
}

async function freePages(place: SamplePlace): Promise<Page[]> {
  const city = DESTINATIONS[place.destination];
  const near = [place.name, place.nameLocal ?? ''].filter((n) => n.length > 2);
  const base = place.name.replace(/\s*\(.*\)\s*/u, ' ').trim();
  const pages = await Promise.all([
    wiki('en.wikivoyage.org', city.en, near),
    wiki('en.wikipedia.org', `${base} ${city.en}`, near),
    wiki('vi.wikipedia.org', `${place.nameLocal ?? base} ${city.name}`, near),
    place.website === null ? Promise.resolve(null) : site(place.website, near),
  ]);
  return pages.filter((p): p is Page => p !== null);
}

const sample = readOut<SamplePlace[]>('sample.json').filter((p) => PLACES.includes(p.name));
const specs = [
  { id: 'fast-memory-row', tier: 'fast' as const, free: false },
  { id: 'pro-nothink-free-pages', tier: 'pro' as const, free: true },
];

const results: ProfileResult[] = [];
await Promise.all(
  sample.flatMap((place) =>
    specs.map(async (spec) => {
      const started = performance.now();
      const pages = [rowPage(place), ...(spec.free ? await freePages(place) : [])];
      const evidenceMs = Math.round(performance.now() - started);
      const city = DESTINATIONS[place.destination];
      const result = await generate({
        tier: spec.tier,
        thinking: false,
        system: spec.free ? PROFILE_RULES : MEMORY_RULES,
        user: `Place: ${place.name}. City: ${city.name}, Vietnam.\n\n${renderPages(pages)}\n\nWrite the profile as JSON.`,
        schema: PROFILE_SCHEMA,
        maxTokens: 2_500,
        label: `profile-${spec.id}`,
      });
      const profile = result.json as ProfileResult['profile'];
      const kept = [];
      const dropped = [];
      if (profile != null && profile.decision === 'write') {
        for (const fact of profile.facts ?? []) {
          const reason = factProblem(fact, pages);
          if (reason === null) kept.push(fact);
          else dropped.push({ fact, reason });
        }
      }
      results.push({
        placeId: place.id,
        pipeline: spec.id,
        profile: profile ?? null,
        kept,
        dropped,
        proseDropped: [],
        ms: result.ms,
        evidenceMs,
        costMicros: result.costMicros,
        inputTokens: result.usage.inputTokens + result.usage.cacheReadTokens,
        outputTokens: result.usage.outputTokens,
        searches: 0,
        extracted: pages.length - 1,
        fsq: false,
      });
      console.log(
        `${spec.id.padEnd(24)} ${place.name.slice(0, 30).padEnd(30)} pages ${pages.length - 1} kept ${kept.length} dropped ${dropped.length} ${result.ms} ms`,
      );
    }),
  ),
);

const previous = readOut<ProfileResult[]>('profiles.json').filter(
  (r) => !specs.some((s) => s.id === r.pipeline),
);
writeOut('profiles.json', [...previous, ...results]);
console.log(`spend this run: $${(ledger.micros / 1e6).toFixed(4)}, ${ledger.calls} calls`);
