/**
 * The recap's words: once a version's aggregates are written, the trip's guide narrates the story
 * cards and words each award from the facts code computed (AI-34, `writeRecapCopy`); with no model
 * configured, or when the guide's reply fails the number guard or the tone rules, the template copy
 * stands in. The words land with the version they describe; the first time, the recap turns `ready`
 * and `recap.ready` goes out (N-32 once per recap; a re-run never sends it again). Every version
 * also (re)arms the travellers' year-later memories on the trip's best day.
 */
import {
  personaIdSchema,
  recapCopyAwards,
  recapCopyFacts,
  recordUsage,
  templateRecapCopy,
  writeRecapCopy,
  type AiUsageRecord,
  type Gateway,
  type PersonaId,
  type RecapCopyInput,
  type RecapCopyResult,
} from '@cp/ai';
import { appendDomainEvent, sendInTx, withSystem } from '@cp/db';
import {
  RECAP_CARDS,
  RECAP_MVP_VOTE_HOURS,
  RECAP_QUEUES,
  recapGotAwaySchema,
  recapReceiptSchema,
  recapRouteSchema,
  recapStatsSchema,
  type RecapAwardDraft,
  type RecapAwardEvidence,
  type RecapCard,
} from '@cp/domain';
import type pg from 'pg';

import { scheduleAnniversaries } from '../anniversary/schedule';
import { enqueueGuideTextTranslation } from '../i18n/enqueue';

/** A gateway per run, reporting usage; absent when no model key is configured. */
export type RecapCopyWriter = (
  onUsage: (record: AiUsageRecord) => Promise<void>,
) => Pick<Gateway, 'callModel'>;

interface CopySource {
  readonly recapId: string;
  readonly tripId: string;
  readonly version: number;
  readonly firstReady: boolean;
  readonly persona: PersonaId;
  readonly input: RecapCopyInput;
}

interface AwardRow {
  readonly user_id: string;
  readonly kind: RecapAwardDraft['kind'];
  readonly metric: RecapAwardDraft['metric'];
  readonly value: number;
  readonly evidence: RecapAwardEvidence;
  readonly display_name: string | null;
}

async function loadSource(tx: pg.PoolClient, tripId: string): Promise<CopySource | null> {
  const { rows } = await tx.query<{
    id: string;
    version: number;
    copy_version: number;
    ready_at: Date | null;
    stats: unknown;
    route: unknown;
    receipt: unknown;
    got_away: unknown;
    place: string | null;
    crew: string | null;
    guide: string | null;
  }>(
    `SELECT r.id, r.version, r.copy_version, r.ready_at, r.stats, r.route, r.receipt, r.got_away,
            d.name AS place, c.name AS crew, g.slug AS guide
       FROM recaps r
       JOIN trips t ON t.id = r.trip_id
       JOIN crews c ON c.id = t.crew_id
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN guides g ON g.id = t.guide_id
      WHERE r.trip_id = $1`,
    [tripId],
  );
  const row = rows[0];
  if (row === undefined || row.version === 0 || row.copy_version >= row.version) return null;
  const { rows: awards } = await tx.query<AwardRow>(
    `SELECT a.user_id, a.kind, a.metric, a.value, a.evidence, u.display_name
       FROM recap_awards a JOIN users u ON u.id = a.user_id
      WHERE a.recap_id = $1 ORDER BY a.user_id`,
    [row.id],
  );
  const names = new Map(awards.map((award) => [award.user_id, award.display_name ?? '']));
  const content = {
    stats: recapStatsSchema.parse(row.stats),
    route: recapRouteSchema.parse(row.route),
    receipt: recapReceiptSchema.parse(row.receipt),
    got_away: row.got_away === null ? null : recapGotAwaySchema.parse(row.got_away),
  };
  const persona = personaIdSchema.safeParse(row.guide);
  const cards: RecapCard[] = RECAP_CARDS.filter(
    (card) => card !== 'got_away' || content.got_away !== null,
  );
  return {
    recapId: row.id,
    tripId,
    version: row.version,
    firstReady: row.ready_at === null,
    persona: persona.success ? persona.data : 'guest',
    input: {
      guide: persona.success ? persona.data : 'guest',
      cards,
      facts: recapCopyFacts(content, {
        place: row.place ?? 'your trip',
        crew: row.crew,
        names,
      }),
      awards: recapCopyAwards(
        awards.map((award) => ({
          user_id: award.user_id,
          kind: award.kind,
          metric: award.metric,
          value: award.value,
          evidence: award.evidence,
        })),
        names,
      ),
    },
  };
}

async function store(
  tx: pg.PoolClient,
  source: CopySource,
  copy: RecapCopyResult,
  now: Date,
): Promise<boolean> {
  const { rows } = await tx.query<{ mvp_closes_at: Date }>(
    `UPDATE recaps
        SET cards = $3, copy_version = $2, copy_fallback = $4, status = 'ready',
            ready_at = coalesce(ready_at, $5),
            mvp_closes_at = coalesce(mvp_closes_at, $5 + make_interval(hours => $6))
      WHERE id = $1 AND version = $2
      RETURNING mvp_closes_at`,
    [
      source.recapId,
      source.version,
      JSON.stringify(copy.cards),
      copy.fallbackUsed,
      now,
      RECAP_MVP_VOTE_HOURS,
    ],
  );
  const closesAt = rows[0]?.mvp_closes_at;
  if (closesAt === undefined) return false;
  await sendInTx(
    tx,
    RECAP_QUEUES.narrate,
    { recap_id: source.recapId },
    {
      singletonKey: source.recapId,
    },
  );
  for (const award of copy.awards) {
    await tx.query(
      'UPDATE recap_awards SET title = $3, line = $4 WHERE recap_id = $1 AND user_id = $2',
      [source.recapId, award.user_id, award.title, award.line],
    );
  }
  await scheduleAnniversaries(tx, source.recapId);
  // Each reader's language, then the guide's voice in it (the translation queues narration again).
  await enqueueGuideTextTranslation(tx, { tripId: source.tripId });
  if (source.firstReady) {
    await sendInTx(
      tx,
      RECAP_QUEUES.mvpClose,
      { recap_id: source.recapId },
      {
        singletonKey: source.recapId,
        startAfter: closesAt,
      },
    );
    await appendDomainEvent(tx, {
      type: 'recap.ready',
      aggregateKind: 'recap',
      aggregateId: source.recapId,
      actorKind: 'guide',
      actorId: null,
      tripId: source.tripId,
      payload: { trip_id: source.tripId, recap_id: source.recapId, version: source.version },
    });
  }
  return true;
}

export type RecapCopyOutcome =
  | { readonly outcome: 'current' }
  | { readonly outcome: 'stale' }
  | { readonly outcome: 'written'; readonly fallback: boolean; readonly rejected?: string };

/**
 * Writes the words for the recap's current version, if they are not written yet. The model call
 * runs outside any transaction; a version bumped meanwhile leaves the words to its own run.
 */
export async function writeCopyForRecap(
  pool: pg.Pool,
  tripId: string,
  writer: RecapCopyWriter | undefined,
  now: Date = new Date(),
): Promise<RecapCopyOutcome> {
  const source = await withSystem(pool, (tx) => loadSource(tx, tripId));
  if (source === null) return { outcome: 'current' };
  const gateway = writer?.((record) => recordUsage((fn) => withSystem(pool, fn), record));
  const copy: RecapCopyResult =
    gateway === undefined
      ? { ...templateRecapCopy(source.input), fallbackUsed: true, rejected: 'no_model' }
      : await writeRecapCopy(gateway, source.input, { tripId });
  const stored = await withSystem(pool, (tx) => store(tx, source, copy, now));
  if (!stored) return { outcome: 'stale' };
  return {
    outcome: 'written',
    fallback: copy.fallbackUsed,
    ...(copy.rejected === undefined ? {} : { rejected: copy.rejected }),
  };
}
