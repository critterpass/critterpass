/**
 * `ai.pitch` prewarm (docs/api-contracts-async.md §2.3): every morning, the places waiting in each
 * crew's deck (queued pitches, and places that went back in the deck in the last 30 days) get a
 * fresh pitch for next month whenever their fares moved, so opening one replays from the cache.
 * Bounded per run; without a model key it does nothing (the api pitches from the template).
 * The same candidates feed the Home tip scan (`registerTipCandidateSource`).
 */
import {
  recordUsage,
  streamPitch,
  PITCH_PROMPT_VERSION,
  type AiUsageRecord,
  type Gateway,
  type PitchModelSection,
} from '@cp/ai';
import { findCachedPitch, loadPitchFacts, storePitch, withSystem } from '@cp/db';
import { buildPitchSections } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import { registerTipCandidateSource } from '../tips';

export const PITCH_PREWARM_QUEUE = 'ai.pitch';
/** Pitches written per run at most (cost ceiling). */
export const PREWARM_BATCH = 20;

export interface DeckPlace {
  readonly crewId: string;
  readonly placeId: string;
}

/** Places waiting in crews' decks, most recently pitched first. */
export async function deckPlaces(tx: pg.PoolClient, now: Date): Promise<DeckPlace[]> {
  const { rows } = await tx.query<{ crew_id: string; destination_id: string }>(
    `SELECT crew_id, destination_id FROM (
       SELECT DISTINCT ON (crew_id, destination_id) crew_id, destination_id, updated_at
         FROM pitches
        WHERE status = 'queued' OR (status = 'back_in_deck' AND updated_at > $1)
        ORDER BY crew_id, destination_id, updated_at DESC) deck
      ORDER BY updated_at DESC LIMIT $2`,
    [new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), PREWARM_BATCH * 5],
  );
  return rows.map((row) => ({ crewId: row.crew_id, placeId: row.destination_id }));
}

export type GatewayFactory = (
  onUsage: (record: AiUsageRecord) => Promise<void>,
) => Pick<Gateway, 'streamModel' | 'callModel'>;

export async function prewarmPitches(
  pool: pg.Pool,
  makeGateway: GatewayFactory | undefined,
  now: Date = new Date(),
): Promise<{ written: number; fresh: number }> {
  if (makeGateway === undefined) return { written: 0, fresh: 0 };
  const gateway = makeGateway((record) => recordUsage((fn) => withSystem(pool, fn), record));
  const deck = await withSystem(pool, (tx) => deckPlaces(tx, now));
  let written = 0;
  let fresh = 0;
  for (const place of deck) {
    if (written >= PREWARM_BATCH) break;
    const loaded = await withSystem(pool, (tx) =>
      loadPitchFacts(tx, { crewId: place.crewId, placeId: place.placeId, month: null, now }),
    );
    if (loaded === undefined) continue;
    const cacheKey = `${place.placeId}:${loaded.facts.month}`;
    const cached = await withSystem(pool, (tx) =>
      findCachedPitch(tx, {
        crewId: place.crewId,
        cacheKey,
        fareSnapshotId: loaded.fareSnapshotId,
      }),
    );
    if (cached !== undefined) {
      fresh += 1;
      continue;
    }
    const lines: PitchModelSection[] = [];
    try {
      for await (const line of streamPitch(gateway, loaded.facts, { crewId: place.crewId }))
        lines.push(line);
    } catch {
      continue;
    }
    if (!lines.some((line) => line.s === 'headline')) continue;
    await withSystem(pool, (tx) =>
      storePitch(tx, {
        crewId: place.crewId,
        placeId: place.placeId,
        month: loaded.facts.month,
        pitchedBy: null,
        sections: buildPitchSections(loaded.facts, lines),
        model: 'pitch.place',
        promptVersion: PITCH_PROMPT_VERSION,
        fareSnapshotId: loaded.fareSnapshotId,
      }),
    );
    written += 1;
  }
  return { written, fresh };
}

export function pitchPrewarmJob(makeGateway: GatewayFactory | undefined): JobDefinition<unknown> {
  return defineJob({
    queue: PITCH_PREWARM_QUEUE,
    schema: z.unknown(),
    handler: async (_data, ctx) => prewarmPitches(ctx.pool, makeGateway),
  });
}

let registered = false;

/** The destination vote's places feed the Home tip scan: the open board and the deck. */
export function registerPitchTipCandidates(): void {
  if (registered) return;
  registered = true;
  registerTipCandidateSource(async (tx, crewId) => {
    const { rows } = await tx.query<{ id: string; name: string }>(
      `SELECT DISTINCT d.id, d.name FROM pitches p JOIN destinations d ON d.id = p.destination_id
        WHERE p.crew_id = $1 AND p.status IN ('on_board', 'final', 'queued')`,
      [crewId],
    );
    return rows.map((row) => ({ placeId: row.id, place: row.name }));
  });
}
