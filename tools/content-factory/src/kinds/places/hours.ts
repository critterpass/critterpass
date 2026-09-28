/**
 * Opening-hours research (`pnpm content places hours`): for curated POIs with no hours yet, search
 * official venue and tourism pages (supplier sites, Google Maps and TripAdvisor excluded), let the
 * model read weekday hours and dated exceptions from one result, and store them as proposals with
 * their source link and fetch time. A proposal changes nothing a traveller sees: only a person
 * verifying it in the ops console copies the hours onto the POI (with `hours_verified_at`).
 */
import path from 'node:path';

import { parseStructuredText, textOf, type Gateway } from '@cp/ai';
import { canonicalJson, sha256Hex } from '@cp/content';
import { hoursSchema, type Hours } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { research, type ResearchHit } from '../../search';
import { FACTORY_DIR, readJsonIfExists, writeJson } from '../../work';
import { FACTORY_ROUTE } from '../../stages/generate';
import { sourcesBlock } from '../emergency/sources';

export interface HoursCandidate {
  readonly poiId: string;
  readonly name: string;
  readonly destination: string;
  readonly hits: readonly ResearchHit[];
}

export interface HoursProposal {
  readonly poiId: string;
  readonly hours: Hours;
  readonly sourceUrl: string;
  readonly fetchedAt: string;
}

const span = z.object({ start: z.string(), end: z.string() });
const outputSchema = z.object({
  found: z.boolean(),
  source_url: z.string().nullable(),
  weekly: z.object(
    Object.fromEntries(
      ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, z.array(span)]),
    ) as Record<string, z.ZodArray<typeof span>>,
  ),
  exceptions: z.array(
    z.object({ date: z.string(), spans: z.array(span), note: z.string().nullable() }),
  ),
});
type HoursOutput = z.infer<typeof outputSchema>;

const SYSTEM = `You read a venue's opening hours from search results. Use only a result that states the hours (prefer the venue's own site or an official tourism site) and copy its URL exactly as source_url. Give weekly spans per weekday (mo..su) in 24-hour HH:MM (end may be 24:00; an empty list means closed that day) and dated exceptions (YYYY-MM-DD) only if stated. If no result states the hours, return found false with empty spans. Reply with JSON only.`;

const DAY = {
  type: 'array',
  items: {
    type: 'object',
    properties: { start: { type: 'string' }, end: { type: 'string' } },
    required: ['start', 'end'],
    additionalProperties: false,
  },
};
const JSON_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    source_url: { type: ['string', 'null'] },
    weekly: {
      type: 'object',
      properties: Object.fromEntries(
        ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, DAY]),
      ),
      required: ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'],
      additionalProperties: false,
    },
    exceptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { date: { type: 'string' }, spans: DAY, note: { type: ['string', 'null'] } },
        required: ['date', 'spans', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['found', 'source_url', 'weekly', 'exceptions'],
  additionalProperties: false,
};

export async function poisWithoutHours(
  pool: pg.Pool,
  destinations: readonly string[],
): Promise<{ id: string; name: string; destination: string }[]> {
  const { rows } = await pool.query<{ id: string; name: string; destination: string }>(
    `SELECT p.id, p.name, d.slug AS destination FROM pois p JOIN destinations d ON d.id = p.destination_id
     WHERE d.slug = ANY($1) AND p.status = 'active' AND p.merged_into_id IS NULL AND p.hours_verified_at IS NULL
       AND (p.hours = '{}'::jsonb OR p.hours -> 'weekly' = '{}'::jsonb)
       AND NOT EXISTS (SELECT 1 FROM poi_hours_proposals h WHERE h.poi_id = p.id AND h.status = 'proposed')
     ORDER BY d.slug, p.name`,
    [destinations],
  );
  return rows;
}

/** Hours read from the cited result, or null when the model found none or cited something else. */
export function toProposal(
  candidate: HoursCandidate,
  output: HoursOutput,
  fetchedAt: string,
): HoursProposal | null {
  if (!output.found || output.source_url === null) return null;
  const hit = candidate.hits.find((h) => h.url === output.source_url);
  if (hit === undefined || !hit.url.startsWith('https://')) return null;
  const weekly = Object.fromEntries(
    Object.entries(output.weekly).filter(([, spans]) => spans.length > 0),
  );
  const exceptions = output.exceptions.map((e) =>
    e.note === null ? { date: e.date, spans: e.spans } : e,
  );
  const hours = hoursSchema.safeParse({ weekly, ...(exceptions.length > 0 ? { exceptions } : {}) });
  if (!hours.success || Object.keys(weekly).length === 0) return null;
  return { poiId: candidate.poiId, hours: hours.data, sourceUrl: hit.url, fetchedAt };
}

export async function researchHours(
  candidates: readonly { id: string; name: string; destination: string }[],
  deps: {
    search: Parameters<typeof research>[0];
    gateway: Gateway | null;
    now: Date;
    cacheDir?: string;
  },
): Promise<HoursProposal[]> {
  const proposals: HoursProposal[] = [];
  const cacheDir = deps.cacheDir ?? path.join(FACTORY_DIR, 'work', 'places', 'hours-cache');
  const searchCache =
    deps.cacheDir === undefined ? {} : { cacheDir: path.join(deps.cacheDir, 'search') };
  for (const poi of candidates) {
    const hits = await research(
      deps.search,
      `"${poi.name}" ${poi.destination.replace('-', ' ')} opening hours official`,
      { maxResults: 4, ...searchCache },
    );
    if (hits.length === 0) continue;
    const candidate: HoursCandidate = {
      poiId: poi.id,
      name: poi.name,
      destination: poi.destination,
      hits,
    };
    const user = `Venue: ${poi.name} (${poi.destination}).\nSearch results:\n${sourcesBlock(hits)}\n\nReturn {"found", "source_url", "weekly", "exceptions"}.`;
    const file = path.join(
      cacheDir,
      `${sha256Hex(canonicalJson({ SYSTEM, user })).slice(0, 32)}.json`,
    );
    let output = readJsonIfExists<HoursOutput>(file);
    if (output === undefined) {
      if (deps.gateway === null)
        throw new Error('hours research needs the model: set ANTHROPIC_API_KEY');
      const result = await deps.gateway.callModel(FACTORY_ROUTE, {
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
        outputFormat: { type: 'json_schema', schema: JSON_SCHEMA },
      });
      const parsed = outputSchema.safeParse(parseStructuredText(textOf(result.message)));
      if (!parsed.success) continue;
      output = parsed.data;
      writeJson(file, output);
    }
    const proposal = toProposal(candidate, output, deps.now.toISOString());
    if (proposal !== null) proposals.push(proposal);
  }
  return proposals;
}

export async function storeProposals(
  pool: pg.Pool,
  batchKey: string,
  proposals: readonly HoursProposal[],
): Promise<void> {
  for (const p of proposals) {
    await pool.query(
      `INSERT INTO poi_hours_proposals (poi_id, hours, source_url, fetched_at, batch_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (poi_id, batch_key) DO UPDATE SET hours = EXCLUDED.hours, source_url = EXCLUDED.source_url,
         fetched_at = EXCLUDED.fetched_at
       WHERE poi_hours_proposals.status = 'proposed'`,
      [p.poiId, JSON.stringify(p.hours), p.sourceUrl, p.fetchedAt, batchKey],
    );
  }
}
