/**
 * Drafting latency bench: the real pipeline (load, prefetch, outline, days, validate and repair)
 * against live DeepSeek, several runs per skeleton route, reporting p50 and p95 of the first day
 * card (the outline's themes stream as the first cards) and of the whole draft. Nothing is saved.
 *
 *   pnpm --filter @cp/worker bench:draft -- --trip <trip id> --organiser <uid> [--runs 10]
 *     reads the trip from DATABASE_URL (staging: `railway run --environment staging -- …`)
 *   pnpm --filter @cp/worker bench:draft -- --golden kyoto-1,bali-3 [--runs 3]
 *     the draft eval's golden crews (packages/ai/evals/draft/golden), no database needed
 *
 * Needs ANTHROPIC_API_KEY (the DeepSeek key). Prints one JSON line per run and a summary table.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  createGateway,
  draftDays,
  runSkeleton,
  validateAndRepair,
  type DraftModel,
  type DraftPlanInput,
} from '@cp/ai';
import type { DraftPoi } from '@cp/planner';
import pg from 'pg';

import { loadDraftPlaces, loadDraftTrip, type DraftTripData } from '../src/jobs/ai/draft/load';
import { buildPlanInput } from '../src/jobs/ai/draft/plan-input';

type Route = DraftPlanInput['skeletonRoute'];
const ROUTES: readonly Route[] = ['draft.skeleton', 'draft.skeleton_fast'];

interface Run {
  readonly label: string;
  readonly route: Route;
  readonly firstCardMs: number;
  readonly totalMs: number;
  readonly firstPassClean: boolean;
  readonly repairLoops: number;
  readonly calls: number;
}

const GOLDEN = new URL('../../../packages/ai/evals/draft/golden/', import.meta.url);

interface GoldenCity {
  destination: string;
  tz: string;
  guide: string;
  bands: { food_pp_day_minor: number; fun_pp_day_minor: number };
  pois: {
    id: string;
    name: string;
    category: string;
    lat: number;
    lng: number;
    hours: DraftPoi['hours'];
    price_level: number | null;
    duration_min: number;
    tags: string[];
    must_see: boolean;
  }[];
}
interface GoldenCrew {
  id: string;
  city: string;
  start: string;
  days: number;
  members: { name: string; tastes: string[]; chronotype: string | null }[];
  diets: string[];
  must_dos: { poi_id: string; owner: number }[];
}

function goldenTrip(id: string): { trip: DraftTripData; places: DraftPoi[] } {
  const cities = JSON.parse(readFileSync(new URL('cities.json', GOLDEN), 'utf8')) as Record<
    string,
    GoldenCity
  >;
  const crews = JSON.parse(readFileSync(new URL('crews.json', GOLDEN), 'utf8')) as GoldenCrew[];
  const crew = crews.find((c) => c.id === id);
  const city = crew === undefined ? undefined : cities[crew.city];
  if (crew === undefined || city === undefined) throw new Error(`no golden crew ${id}`);
  const end = new Date(Date.parse(`${crew.start}T00:00:00Z`) + (crew.days - 1) * 86_400_000);
  const uid = (i: number) => `00000000-0000-7000-8000-${String(i + 1).padStart(12, '0')}`;
  const trip: DraftTripData = {
    tripId: `00000000-0000-7000-9000-${String(crews.indexOf(crew) + 1).padStart(12, '0')}`,
    crewId: uid(99),
    status: 'drafting',
    startDate: crew.start,
    endDate: end.toISOString().slice(0, 10),
    tz: city.tz,
    currency: 'USD',
    destinationId: uid(98),
    destination: city.destination,
    guideSlug: city.guide,
    members: crew.members.map((m, i) => ({
      uid: uid(i),
      name: m.name,
      tastes: [
        ...m.tastes,
        ...(m.chronotype === 'early_bird'
          ? ['early_starts']
          : m.chronotype === 'night_owl'
            ? ['late_starts']
            : []),
      ],
    })),
    mustDos: crew.must_dos.map((m, i) => ({
      id: uid(50 + i),
      ownerId: uid(m.owner),
      poiId: m.poi_id,
      title: city.pois.find((p) => p.id === m.poi_id)?.name ?? 'Must-do',
    })),
    diets: crew.diets,
    dietsBy: [],
    budget: null,
    rooms: null,
    bands: {
      foodPpDayMinor: city.bands.food_pp_day_minor,
      funPpDayMinor: city.bands.fun_pp_day_minor,
    },
    transport: [],
  };
  const places = city.pois.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    lat: p.lat,
    lng: p.lng,
    tz: city.tz,
    hours: p.hours,
    priceLevel: p.price_level,
    tags: p.tags,
    durationMin: p.duration_min,
    editorial: true,
    mustSee: p.must_see,
  }));
  return { trip, places };
}

async function dbTrip(
  tripId: string,
  organiser: string,
): Promise<{ trip: DraftTripData; places: DraftPoi[] }> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const trip = await loadDraftTrip(pool, tripId, organiser);
    if (trip === null) throw new Error('trip has no dates or destination');
    const places = await loadDraftPlaces(
      pool,
      trip.destinationId,
      trip.mustDos.flatMap((m) => (m.poiId === null ? [] : [m.poiId])),
    );
    return { trip, places };
  } finally {
    await pool.end();
  }
}

async function once(
  label: string,
  loaded: { trip: DraftTripData; places: DraftPoi[] },
  route: Route,
): Promise<Run> {
  const gateway = createGateway({
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    timeoutMs: 120_000,
  });
  let calls = 0;
  const model: DraftModel = {
    call: (r, input) => {
      calls += 1;
      return gateway.callModel(r, input);
    },
  };
  const started = Date.now();
  const input = buildPlanInput(loaded.trip, loaded.places, {
    jobId: `bench-${started}`,
    skeletonRoute: route,
    closures: [],
  });
  const skeleton = await runSkeleton(model, input);
  const firstCardMs = Date.now() - started;
  const drafted = await draftDays(model, input, skeleton);
  const checked = await validateAndRepair(model, input, skeleton, drafted.itinerary);
  return {
    label,
    route,
    firstCardMs,
    totalMs: Date.now() - started,
    firstPassClean: checked.first.ok,
    repairLoops: checked.loops,
    calls,
  };
}

const pct = (values: readonly number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      trip: { type: 'string' },
      organiser: { type: 'string' },
      golden: { type: 'string' },
      runs: { type: 'string', default: '10' },
    },
  });
  if (process.env.ANTHROPIC_API_KEY === undefined)
    throw new Error('ANTHROPIC_API_KEY (the DeepSeek key) is required');
  const runs = Number(values.runs);
  const sources: { label: string; loaded: { trip: DraftTripData; places: DraftPoi[] } }[] =
    values.golden !== undefined
      ? values.golden.split(',').map((id) => ({ label: id, loaded: goldenTrip(id) }))
      : [
          {
            label: values.trip ?? '',
            loaded: await dbTrip(values.trip ?? '', values.organiser ?? ''),
          },
        ];
  const results: Run[] = [];
  for (const route of ROUTES) {
    for (let i = 0; i < runs; i += 1) {
      const source = sources[i % sources.length];
      if (source === undefined) continue;
      const run = await once(source.label, source.loaded, route);
      results.push(run);
      console.log(JSON.stringify(run));
    }
  }
  console.log(
    '\nroute                 runs  first card p50/p95 (s)  draft p50/p95 (s)  first-pass clean',
  );
  for (const route of ROUTES) {
    const mine = results.filter((r) => r.route === route);
    const s = (ms: number) => (ms / 1000).toFixed(1);
    console.log(
      `${route.padEnd(22)}${String(mine.length).padEnd(6)}${`${s(
        pct(
          mine.map((r) => r.firstCardMs),
          50,
        ),
      )} / ${s(
        pct(
          mine.map((r) => r.firstCardMs),
          95,
        ),
      )}`.padEnd(24)}${`${s(
        pct(
          mine.map((r) => r.totalMs),
          50,
        ),
      )} / ${s(
        pct(
          mine.map((r) => r.totalMs),
          95,
        ),
      )}`.padEnd(19)}${mine.filter((r) => r.firstPassClean).length}/${mine.length}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
