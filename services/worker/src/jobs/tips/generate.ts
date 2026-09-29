/**
 * `tips.generate` (06:00 SGT daily, and per crew when a fare drops): finds facts for each crew's
 * places, picks the strongest place, phrases one line in that place's guide's voice from its
 * facts (the validator rejects any number the facts lack; the template stands in), and stores it
 * as the crew's one active tip. At most one new tip per crew per day; a fact already told is never
 * told again; nothing runs while `home.tips.enabled` is off. Sponsored content never enters here.
 */
import {
  GUIDE_SLUGS,
  phraseTip,
  recordUsage,
  templateTip,
  type AiUsageRecord,
  type Gateway,
  type PersonaId,
  type TipFact,
} from '@cp/ai';
import { appendDomainEvent, sendInTx, withSystem } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import { DEFAULT_MIN_FARE_DROP_PCT, detectTipFacts } from './detect';

export const TIPS_GENERATE_QUEUE = 'tips.generate';
export const TIP_KILL_SWITCH = 'home.tips.enabled';
export const TIP_MIN_DROP_KEY = 'home.tips.min_fare_drop_pct';
/** A crew gets at most one new tip in this window. */
export const TIP_INTERVAL_HOURS = 20;
export const TIP_VALID_DAYS = 7;

const PRIORITY: Readonly<Record<TipFact['kind'], number>> = {
  fare_drop: 0,
  book_by: 1,
  season_peak: 2,
  crowd_dip: 3,
};

export const tipsJobSchema = z.object({ crew_id: z.uuid().optional() }).nullish();
export type TipsJob = z.infer<typeof tipsJobSchema>;

/** `onEventAppended` hook: a fare drop for a crew reruns that crew's tips. */
export async function tipsEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly crewId: string | null },
): Promise<void> {
  if (event.type !== 'fare.dropped' || event.crewId === null) return;
  await sendInTx(
    tx,
    TIPS_GENERATE_QUEUE,
    { crew_id: event.crewId },
    {
      singletonKey: `crew:${event.crewId}`,
    },
  );
}

export function tipDedupeKey(facts: readonly TipFact[]): string {
  return facts
    .map((fact) =>
      [fact.kind, fact.place_id, fact.origin ?? '', fact.date ?? '', fact.value_minor ?? ''].join(
        ':',
      ),
    )
    .join('|')
    .slice(0, 200);
}

/** The strongest place's facts (at most two), strongest first. */
export function pickFacts(facts: readonly TipFact[]): TipFact[] {
  const sorted = [...facts].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  const lead = sorted[0];
  if (lead === undefined) return [];
  const second = sorted.find(
    (fact) => fact !== lead && fact.place_id === lead.place_id && fact.kind !== lead.kind,
  );
  return second === undefined ? [lead] : [lead, second];
}

export type TipPhraser = (
  onUsage: (record: AiUsageRecord) => Promise<void>,
) => Pick<Gateway, 'callModel'>;

export interface GenerateTipsOptions {
  readonly phraser?: TipPhraser;
  readonly now?: Date;
}

async function config(tx: pg.PoolClient, key: string): Promise<unknown> {
  const { rows } = await tx.query<{ value: unknown }>(
    'SELECT value FROM ops.ops_config WHERE key = $1',
    [key],
  );
  return rows[0]?.value;
}

interface Plan {
  readonly crewId: string;
  readonly facts: TipFact[];
  readonly guide: PersonaId;
  readonly guideId: string | null;
}

async function planCrew(
  tx: pg.PoolClient,
  crewId: string,
  now: Date,
  minDropPct: number,
): Promise<Plan | null> {
  const recent = await tx.query(
    `SELECT 1 FROM home_tips WHERE crew_id = $1 AND created_at > $2 LIMIT 1`,
    [crewId, new Date(now.getTime() - TIP_INTERVAL_HOURS * 3_600_000)],
  );
  if ((recent.rowCount ?? 0) > 0) return null;
  const all = await detectTipFacts(tx, crewId, now.toISOString().slice(0, 10), minDropPct);
  const told = await tx.query<{ dedupe_key: string }>(
    'SELECT dedupe_key FROM home_tips WHERE crew_id = $1',
    [crewId],
  );
  const toldKeys = new Set(told.rows.map((row) => row.dedupe_key));
  let remaining = all;
  while (remaining.length > 0) {
    const facts = pickFacts(remaining);
    if (!toldKeys.has(tipDedupeKey(facts))) {
      const place = facts[0]?.place_id ?? '';
      const { rows } = await tx.query<{ slug: string | null; id: string | null }>(
        `SELECT s.guide_slug AS slug, g.id FROM critter_sets s
           LEFT JOIN guides g ON g.slug = s.guide_slug
          WHERE s.destination_id = $1 LIMIT 1`,
        [place],
      );
      const slug = rows[0]?.slug ?? null;
      const guide = (GUIDE_SLUGS as readonly string[]).includes(slug ?? '')
        ? (slug as PersonaId)
        : 'guest';
      return { crewId, facts, guide, guideId: rows[0]?.id ?? null };
    }
    remaining = remaining.filter((fact) => !facts.includes(fact));
  }
  return null;
}

async function storeTip(
  tx: pg.PoolClient,
  plan: Plan,
  line: string,
  now: Date,
): Promise<string | null> {
  const lead = plan.facts[0];
  if (lead === undefined) return null;
  const { rows } = await tx.query<{ id: string }>(
    // Dated by the job's clock, the same one the once-a-day check in planCrew reads.
    `INSERT INTO home_tips (crew_id, guide_id, kind, text, facts, place_id, dedupe_key, valid_until,
       created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (crew_id, dedupe_key) DO NOTHING RETURNING id`,
    [
      plan.crewId,
      plan.guideId,
      lead.kind,
      line,
      JSON.stringify({ facts: plan.facts }),
      lead.place_id,
      tipDedupeKey(plan.facts),
      new Date(now.getTime() + TIP_VALID_DAYS * 86_400_000),
      now,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) return null;
  await tx.query(
    `UPDATE home_tips SET status = 'expired' WHERE crew_id = $1 AND status = 'active' AND id <> $2`,
    [plan.crewId, id],
  );
  await appendDomainEvent(tx, {
    type: 'tip.created',
    aggregateKind: 'home_tip',
    aggregateId: id,
    actorKind: 'system',
    actorId: null,
    payload: { tip_id: id, crew_id: plan.crewId, kind: lead.kind },
    crewId: plan.crewId,
  });
  return id;
}

/** Runs one pass for `crewId`, or every crew with a trip in planning; returns the tips stored. */
export async function generateTips(
  pool: pg.Pool,
  crewId: string | undefined,
  options: GenerateTipsOptions = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const setup = await withSystem(pool, async (tx) => {
    if ((await config(tx, TIP_KILL_SWITCH)) === false) return null;
    const minDrop = await config(tx, TIP_MIN_DROP_KEY);
    const minDropPct = typeof minDrop === 'number' ? minDrop : DEFAULT_MIN_FARE_DROP_PCT;
    const crews =
      crewId !== undefined
        ? [crewId]
        : (
            await tx.query<{ crew_id: string }>(
              `SELECT DISTINCT crew_id FROM trips
                WHERE status IN ('voting', 'won', 'setup', 'drafting', 'draft_review',
                                 'redrafting', 'proposed', 'confirmed')`,
            )
          ).rows.map((row) => row.crew_id);
    const plans: Plan[] = [];
    for (const crew of crews) {
      const plan = await planCrew(tx, crew, now, minDropPct);
      if (plan !== null) plans.push(plan);
    }
    return plans;
  });
  if (setup === null) return 0;

  let stored = 0;
  for (const plan of setup) {
    const input = { guide: plan.guide, facts: plan.facts };
    // The model call runs outside any transaction; storing is its own short one.
    const gateway = options.phraser?.((record) =>
      recordUsage((fn) => withSystem(pool, fn), record),
    );
    const phrased =
      gateway === undefined
        ? templateTip(input)
        : await phraseTip(gateway, input, { crewId: plan.crewId });
    const id = await withSystem(pool, (tx) => storeTip(tx, plan, phrased.line, now));
    if (id !== null) stored += 1;
  }
  return stored;
}

export function tipsGenerateJob(phraser?: TipPhraser): JobDefinition<TipsJob> {
  return defineJob({
    queue: TIPS_GENERATE_QUEUE,
    schema: tipsJobSchema,
    singletonKey: (data: TipsJob) => (data?.crew_id === undefined ? 'all' : `crew:${data.crew_id}`),
    handler: async (data, ctx) => ({
      stored: await generateTips(ctx.pool, data?.crew_id, phraser === undefined ? {} : { phraser }),
    }),
  });
}
