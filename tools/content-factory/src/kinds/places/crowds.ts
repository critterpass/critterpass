/**
 * Editorial crowd curves (`pnpm content places crowds`): a typical week for each curated place,
 * written from our own open data and editorial fields only (its kind, stored opening hours, the
 * editors' crowd hint and best time), one structured model call per place. Each curve is checked
 * before it is kept: seven days of 24 levels 0-100, nothing while the place is shut, and a real
 * shape while it is open. Kept curves are proposals (`crowd_forecasts`, source `editorial`,
 * `approved_at` null) that no phone sees until the founder approves the batch; copy always says
 * "usually busy", never "what crews saw".
 */
import path from 'node:path';

import { parseStructuredText, textOf, type Gateway } from '@cp/ai';
import { canonicalJson, sha256Hex } from '@cp/content';
import { knownHours, openSpans, WEEKDAYS, type Hours } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { FACTORY_ROUTE } from '../../stages/generate';
import { FACTORY_DIR, readJsonIfExists, writeJson } from '../../work';

/** Nothing is written for Đà Nẵng places before the founder is back from the trip. */
export const PROTECTED_UNTIL: Readonly<Record<string, string>> = {
  'da-nang': '2026-10-05T00:00:00+07:00',
};

export interface CrowdPlace {
  readonly id: string;
  readonly name: string;
  readonly destination: string;
  readonly category: string;
  readonly hours: Hours;
  readonly crowdHint: string | null;
  readonly bestTime: string | null;
}

/** A typical week, `crowd_forecasts.dow` order: index 0 = Sunday. */
export type CrowdWeek = readonly (readonly number[])[];

export type CrowdCheck =
  { readonly ok: true; readonly week: CrowdWeek } | { readonly ok: false; readonly reason: string };

const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'] as const;
/** A Sunday-to-Saturday reference week for reading weekly spans by weekday. */
const REFERENCE_DATES = DAYS.map((_, index) => `2026-01-${String(4 + index).padStart(2, '0')}`);
/** Open hours flatter than this read as a guess, not a shape. */
const MIN_RANGE = 10;

const outputSchema = z.object({
  week: z.object(
    Object.fromEntries(DAYS.map((day) => [day, z.array(z.number())])) as Record<
      (typeof DAYS)[number],
      z.ZodArray<z.ZodNumber>
    >,
  ),
});
type CrowdOutput = z.infer<typeof outputSchema>;

const HOURS_ARRAY = { type: 'array', items: { type: 'number' }, minItems: 24, maxItems: 24 };
const JSON_SCHEMA = {
  type: 'object',
  properties: {
    week: {
      type: 'object',
      properties: Object.fromEntries(DAYS.map((day) => [day, HOURS_ARRAY])),
      required: [...DAYS],
      additionalProperties: false,
    },
  },
  required: ['week'],
  additionalProperties: false,
};

const SYSTEM = `You estimate how busy a place usually is through a typical week, for a trip planner that says "usually busy from 10". Use only the facts given: the kind of place, its opening hours, the editors' crowd hint and best time. For each weekday (su..sa) give 24 levels, one per local hour from 00 to 23: 0 = empty, 100 = as packed as it gets. Give 0 for every hour the place is shut. Weekends and local rush hours differ from quiet weekday mornings where the facts suggest it. Reply with JSON only.`;

function hourOpen(hours: Hours, dow: number, hour: number): boolean {
  const date = REFERENCE_DATES[dow] ?? '2026-01-04';
  const weekly: Hours = { weekly: hours.weekly };
  return openSpans(weekly, date).some(
    (span) => span.start < hour * 60 + 60 && span.end > hour * 60,
  );
}

/** Checks and tidies a model week: shut hours are zeroed, open hours must have a shape. */
export function checkCrowdWeek(hours: Hours, output: CrowdOutput): CrowdCheck {
  const week: number[][] = [];
  let openValues: number[] = [];
  for (const [dow, day] of DAYS.entries()) {
    const levels = output.week[day];
    if (levels.length !== 24) return { ok: false, reason: `${day} has ${levels.length} hours` };
    if (levels.some((level) => !Number.isFinite(level) || level < 0 || level > 100)) {
      return { ok: false, reason: `${day} has a level outside 0-100` };
    }
    const tidy = levels.map((level, hour) => (hourOpen(hours, dow, hour) ? Math.round(level) : 0));
    openValues = [...openValues, ...tidy.filter((_, hour) => hourOpen(hours, dow, hour))];
    week.push(tidy);
  }
  if (openValues.length === 0) return { ok: false, reason: 'the place is never open' };
  if (Math.max(...openValues) - Math.min(...openValues) < MIN_RANGE) {
    return { ok: false, reason: 'open hours are flat' };
  }
  return { ok: true, week };
}

export function writable(destination: string, now: Date): boolean {
  const until = PROTECTED_UNTIL[destination];
  return until === undefined || now.getTime() >= Date.parse(until);
}

/** Curated, active places with known hours and no editorial curve yet. */
export async function placesWithoutCurves(
  pool: pg.Pool,
  destinations: readonly string[],
): Promise<CrowdPlace[]> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    destination: string;
    category: string;
    hours: unknown;
    crowd_hint: string | null;
    best_time: string | null;
  }>(
    `SELECT p.id, p.name, d.slug AS destination, p.category, p.hours,
            p.editorial->>'crowd_hint' AS crowd_hint, p.editorial->>'best_time' AS best_time
       FROM pois p JOIN destinations d ON d.id = p.destination_id
      WHERE d.slug = ANY($1) AND p.status = 'active' AND p.merged_into_id IS NULL
        AND p.curation = 'editorial'
        AND NOT EXISTS (SELECT 1 FROM crowd_forecasts f
                         WHERE f.poi_id = p.id AND f.source = 'editorial')
      ORDER BY d.slug, p.name`,
    [destinations],
  );
  return rows.flatMap((row) => {
    const hours = knownHours(row.hours);
    return hours === null
      ? []
      : [
          {
            id: row.id,
            name: row.name,
            destination: row.destination,
            category: row.category,
            hours,
            crowdHint: row.crowd_hint,
            bestTime: row.best_time,
          },
        ];
  });
}

function placeFacts(place: CrowdPlace): string {
  const weekly = WEEKDAYS.map((day) => {
    const spans = place.hours.weekly[day] ?? [];
    return `${day}: ${spans.length === 0 ? 'shut' : spans.map((s) => `${s.start}-${s.end}`).join(', ')}`;
  }).join('; ');
  return [
    `Place: ${place.name} (${place.destination.replace('-', ' ')}), kind ${place.category}.`,
    `Opening hours: ${weekly}.`,
    place.crowdHint === null ? null : `Editors' crowd hint: ${place.crowdHint}`,
    place.bestTime === null ? null : `Editors' best time: ${place.bestTime}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

export interface CrowdProposal {
  readonly poiId: string;
  readonly week: CrowdWeek;
}

export async function proposeCrowdCurves(
  places: readonly CrowdPlace[],
  deps: { readonly gateway: Gateway | null; readonly now: Date; readonly cacheDir?: string },
): Promise<{ proposals: CrowdProposal[]; rejected: { poiId: string; reason: string }[] }> {
  const cacheDir = deps.cacheDir ?? path.join(FACTORY_DIR, 'work', 'places', 'crowds-cache');
  const proposals: CrowdProposal[] = [];
  const rejected: { poiId: string; reason: string }[] = [];
  for (const place of places) {
    if (!writable(place.destination, deps.now)) continue;
    const user = `${placeFacts(place)}\n\nReturn {"week": {"su": [24 levels], …, "sa": [24 levels]}}.`;
    const file = path.join(
      cacheDir,
      `${sha256Hex(canonicalJson({ SYSTEM, user })).slice(0, 32)}.json`,
    );
    let output = readJsonIfExists<CrowdOutput>(file);
    if (output === undefined) {
      if (deps.gateway === null)
        throw new Error('crowd curves need the model: set ANTHROPIC_API_KEY');
      const result = await deps.gateway.callModel(FACTORY_ROUTE, {
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
        outputFormat: { type: 'json_schema', schema: JSON_SCHEMA },
      });
      const parsed = outputSchema.safeParse(parseStructuredText(textOf(result.message)));
      if (!parsed.success) {
        rejected.push({ poiId: place.id, reason: 'reply did not match the schema' });
        continue;
      }
      output = parsed.data;
      writeJson(file, output);
    }
    const check = checkCrowdWeek(place.hours, output);
    if (check.ok) proposals.push({ poiId: place.id, week: check.week });
    else rejected.push({ poiId: place.id, reason: check.reason });
  }
  return { proposals, rejected };
}

/** Stores proposals unapproved; an approved curve is never overwritten by a new proposal. */
export async function storeCrowdProposals(
  pool: pg.Pool,
  proposals: readonly CrowdProposal[],
  now: Date,
): Promise<void> {
  for (const proposal of proposals) {
    for (const [dow, hourly] of proposal.week.entries()) {
      await pool.query(
        `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at, approved_at)
         VALUES ($1, $2, $3::smallint[], 'editorial', $4, NULL)
         ON CONFLICT (poi_id, source, dow) DO UPDATE
           SET hourly = EXCLUDED.hourly, fetched_at = EXCLUDED.fetched_at, updated_at = now()
         WHERE crowd_forecasts.approved_at IS NULL`,
        [proposal.poiId, dow, hourly, now],
      );
    }
  }
}

/**
 * The founder's approval, run after reading the review page: every unapproved editorial curve of
 * these destinations goes live, and one `ops.admin_audit` row says who approved what and when.
 * The approver is the operator `ADMIN_CLI_EMAIL` names, as the admin command runner attributes.
 */
export async function approveCrowdCurves(
  pool: pg.Pool,
  input: {
    readonly destinations: readonly string[];
    readonly approverEmail: string;
    readonly batchKey: string;
    readonly now: Date;
  },
): Promise<number> {
  const allowed = input.destinations.filter((slug) => writable(slug, input.now));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const operator = await client.query<{ id: string }>(
      'SELECT id FROM auth."user" WHERE lower(email) = lower($1) AND role IS NOT NULL',
      [input.approverEmail],
    );
    const adminId = operator.rows[0]?.id;
    if (adminId === undefined) throw new Error('ADMIN_CLI_EMAIL is not an ops operator');
    const approved = await client.query<{ poi_id: string }>(
      `UPDATE crowd_forecasts f SET approved_at = $2, updated_at = now()
         FROM pois p JOIN destinations d ON d.id = p.destination_id
        WHERE f.poi_id = p.id AND d.slug = ANY($1) AND f.source = 'editorial'
          AND f.approved_at IS NULL
        RETURNING f.poi_id`,
      [allowed, input.now],
    );
    const places = [...new Set(approved.rows.map((row) => row.poi_id))].sort();
    await client.query(
      `INSERT INTO ops.admin_audit (admin_id, action, target_kind, reason, detail, at)
       VALUES ($1, 'crowd_curves.approve', 'crowd_forecasts', $2, $3, $4)`,
      [
        adminId,
        `editorial crowd curves ${input.batchKey}`,
        JSON.stringify({ destinations: allowed, curves: approved.rowCount ?? 0, poi_ids: places }),
        input.now,
      ],
    );
    await client.query('COMMIT');
    return places.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
