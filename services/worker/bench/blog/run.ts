/**
 * Blog benchmark: drafts a first visit of the blogs' length for five crews (neutral, culture,
 * foodie, nightlife, nature) with the real pipeline on the places the database holds, then scores
 * every draft against what travel blogs recommend (./score.ts) and asks a travel-writer judge
 * (./judge.ts). Prints a table per destination and the overall score; nothing is saved.
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker bench:blog -- --reference <curated folder> \
 *     [--destinations vn-da-lat,lisbon] [--crews neutral,foodie] [--budget-usd 3] \
 *     [--start 2026-11-06] [--out results.json]
 *
 * `--reference` is the researchers' folder (`itineraries/<slug>.json`, `places/<slug>.jsonl`);
 * without `--destinations` every destination with an itinerary file runs. Needs DATABASE_URL and
 * ANTHROPIC_API_KEY (the DeepSeek key). Model calls stop once the run has spent `--budget-usd`.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { createGateway, runDraftPlan, type DraftModel } from '@cp/ai';
import { createPool, withSystem } from '@cp/db';
import type pg from 'pg';

import { loadDraftPlaces } from '../../src/jobs/ai/draft/load';
import { buildPlanInput } from '../../src/jobs/ai/draft/plan-input';
import { loadRoutedPairs } from '../../src/jobs/ai/draft/road-minutes';
import { skeletonRoute } from '../../src/jobs/ai/draft/skeleton';
import { CREWS, crewTrip, defaultStart, scoredDays, type Destination } from './crews';
import { judgeBrief, judgeDraft, type Verdict } from './judge';
import { readReference, type Reference } from './reference';
import { draftMetrics, overall, type DraftMetrics, type ScoredDay } from './score';
import { destinationTable, type DraftResult } from './table';

class OverBudget extends Error {}

const failure = (error: unknown) =>
  error instanceof Error
    ? (error.stack ?? error.message).split('\n').slice(0, 4).join(' | ')
    : String(error);

/** A model that counts what the run spends and refuses calls once the cap is reached. */
function meteredModel(apiKey: string, baseURL: string | undefined, capMicros: number) {
  const gateway = createGateway({
    apiKey,
    ...(baseURL === undefined ? {} : { baseURL }),
    timeoutMs: 180_000,
  });
  const meter = { spentMicros: 0, calls: 0 };
  const model: DraftModel = {
    call: async (route, input) => {
      if (meter.spentMicros >= capMicros) throw new OverBudget('budget reached');
      const result = await gateway.callModel(route, input);
      meter.spentMicros += result.costMicros;
      meter.calls += 1;
      return result;
    },
  };
  return { model, meter };
}

async function destinationOf(pool: pg.Pool, slug: string): Promise<Destination | null> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{
      id: string;
      name: string;
      country: string | null;
      tz: string;
      guide: string | null;
      languages: string[] | null;
    }>(
      `SELECT d.id, d.name, d.country, d.tz,
              (SELECT g.slug FROM guides g WHERE g.id = app.destination_guide_id(d.id)) AS guide,
              (SELECT s.languages FROM critter_sets s
                WHERE s.destination_id = d.id OR s.country = upper(split_part(d.slug, '-', 1))
                ORDER BY (s.destination_id = d.id) DESC NULLS LAST, s.code LIMIT 1) AS languages
         FROM destinations d WHERE d.slug = $1`,
      [slug],
    ),
  );
  const row = rows[0];
  return row === undefined
    ? null
    : {
        id: row.id,
        slug,
        name: row.name,
        country: row.country,
        tz: row.tz,
        guideSlug: row.guide,
        languages: row.languages ?? [],
      };
}

/** Each curated row's rank: the line of the places file it was loaded from. */
async function curatedRanks(pool: pg.Pool, ids: readonly string[]): Promise<Map<string, number>> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ id: string; rank: number }>(
      `SELECT id, (editorial->'curated'->>'rank')::int AS rank FROM pois
        WHERE id = ANY($1::uuid[]) AND editorial->'curated' ? 'rank'`,
      [ids],
    ),
  );
  return new Map(rows.map((row) => [row.id, row.rank]));
}

async function benchDestination(
  pool: pg.Pool,
  model: DraftModel,
  reference: Reference,
  crews: typeof CREWS,
  start: string,
): Promise<DraftResult[]> {
  const destination = await destinationOf(pool, reference.slug);
  if (destination === null) throw new Error(`no destination ${reference.slug}`);
  const places = await loadDraftPlaces(pool, destination.id, []);
  const routed = await loadRoutedPairs(
    pool,
    places.map((poi) => poi.id),
  );
  const route = await skeletonRoute(pool);
  const ranks = await curatedRanks(
    pool,
    places.map((poi) => poi.id),
  );
  const results: DraftResult[] = [];
  let neutral: readonly ScoredDay[] | null = null;
  for (const crew of crews) {
    const trip = crewTrip(destination, crew, start, reference.days.length);
    const input = buildPlanInput(trip, places, {
      jobId: `blog-bench-${reference.slug}-${crew.id}`,
      skeletonRoute: route,
      closures: [],
      routed,
    });
    let days: ScoredDay[];
    let metrics: DraftMetrics;
    let verdict: Verdict | null;
    try {
      const drafted = await runDraftPlan(model, input);
      days = scoredDays(drafted.itinerary, drafted.input, reference, ranks);
      if (crew.id === 'neutral') neutral = days;
      metrics = draftMetrics(
        days,
        reference,
        neutral === null ? null : { neutral, tastes: crew.tastes },
      );
      verdict = await judgeDraft(
        model,
        judgeBrief(trip.destination, crew.brief, reference.days, days),
        `judge-${crew.id}`,
      ).catch((error: unknown) => {
        if (error instanceof OverBudget) throw error;
        console.error(`${reference.slug}/${crew.id}: judge failed: ${String(error)}`);
        return null;
      });
    } catch (error) {
      if (error instanceof OverBudget) throw error;
      console.error(`${reference.slug}/${crew.id}: draft failed: ${failure(error)}`);
      continue;
    }
    const judge = verdict === null ? null : verdict.overall / 10;
    results.push({
      destination: reference.slug,
      crew: crew.id,
      places: places.length,
      matched: days.flatMap((d) => d.stops).filter((s) => s.ref !== null).length,
      stops: days.flatMap((d) => d.stops).length,
      metrics,
      judge,
      verdict,
      score: overall(metrics, judge),
      days: days.map((d) => ({
        day: d.dayNo,
        theme: d.theme,
        stops: d.stops.map((s) => `${s.kind === 'meal' ? '*' : ''}${s.name}`),
      })),
    });
  }
  return results;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      reference: { type: 'string' },
      destinations: { type: 'string' },
      crews: { type: 'string' },
      'budget-usd': { type: 'string', default: '3' },
      start: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const root = values.reference;
  if (root === undefined) throw new Error('--reference <curated folder> is required');
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (connectionString === undefined) throw new Error('DATABASE_URL is required');
  if (apiKey === undefined || apiKey === '') throw new Error('ANTHROPIC_API_KEY is required');
  const slugs =
    values.destinations?.split(',').filter(Boolean) ??
    readdirSync(join(root, 'itineraries'))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -'.json'.length))
      .sort();
  const crews =
    values.crews === undefined
      ? CREWS
      : CREWS.filter((c) => values.crews?.split(',').includes(c.id));
  if (crews[0]?.id !== 'neutral')
    throw new Error('the neutral crew runs first: personal fit is measured against it');
  const start = values.start ?? defaultStart(new Date());
  const capMicros = Math.round(Number(values['budget-usd']) * 1_000_000);
  const { model, meter } = meteredModel(apiKey, process.env['ANTHROPIC_BASE_URL'], capMicros);
  const pool = createPool({ connectionString, max: 4 });
  const all: DraftResult[] = [];
  try {
    for (const slug of slugs) {
      const reference = readReference(root, slug);
      if (reference === null || reference.days.length === 0) {
        console.log(`${slug}: no itinerary file yet, skipped`);
        continue;
      }
      try {
        const results = await benchDestination(pool, model, reference, crews, start);
        all.push(...results);
        console.log(destinationTable(slug, results));
      } catch (error) {
        if (error instanceof OverBudget) {
          console.log(`budget of $${values['budget-usd']} reached during ${slug}; stopping`);
          break;
        }
        console.error(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await pool.end();
  }
  const scores = [...new Set(all.map((r) => r.destination))].map((slug) => {
    const mine = all.filter((r) => r.destination === slug);
    return mine.reduce((sum, r) => sum + r.score, 0) / mine.length;
  });
  const total = scores.length === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / scores.length;
  console.log(
    `\noverall ${total.toFixed(1)} over ${scores.length} destination(s), start ${start}; spent $${(meter.spentMicros / 1_000_000).toFixed(2)} in ${meter.calls} calls`,
  );
  if (values.out !== undefined) {
    writeFileSync(
      values.out,
      JSON.stringify(
        { start, overall: total, spentMicros: meter.spentMicros, results: all },
        null,
        1,
      ),
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
