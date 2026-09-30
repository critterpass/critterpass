/**
 * XP grants: every source (a finished quest, a first-time form, a first visit to a place on a trip,
 * the crew settling up) goes through `app.grant_xp`, which writes the crew row and each member's
 * row once per source and moves the crew's total and level in the same transaction. The form
 * source is a `reward.fanout` handler: each verified find's form XP, to the finder and their trip's
 * crew.
 */
import { appendDomainEvent } from '@cp/db';
import { XP_SOURCES, type XpSourceKind } from '@cp/domain';
import type pg from 'pg';

import { registerRewardHandler, type RewardGrant } from '../registry';
import { announceLevelUps } from './crew-level';

export interface XpGrant {
  readonly crewId: string | null;
  readonly tripId: string | null;
  readonly userIds: readonly string[];
  readonly amount: number;
  readonly sourceKind: XpSourceKind;
  readonly sourceId: string;
  readonly at: Date;
}

export interface XpGranted {
  readonly granted: boolean;
  readonly levelBefore: number | null;
  readonly levelAfter: number | null;
  readonly stickerIds: readonly string[];
}

export async function grantXp(tx: pg.PoolClient, grant: XpGrant): Promise<XpGranted> {
  const { rows } = await tx.query<{
    granted: boolean;
    level_before: number | null;
    level_after: number | null;
    sticker_ids: string[];
  }>('SELECT * FROM app.grant_xp($1, $2, $3::uuid[], $4, $5, $6, $7)', [
    grant.crewId,
    grant.tripId,
    grant.userIds,
    grant.amount,
    grant.sourceKind,
    grant.sourceId,
    grant.at,
  ]);
  const row = rows[0];
  const result: XpGranted = {
    granted: row?.granted ?? false,
    levelBefore: row?.level_before ?? null,
    levelAfter: row?.level_after ?? null,
    stickerIds: row?.sticker_ids ?? [],
  };
  if (result.granted) await announceXp(tx, grant, result);
  return result;
}

/** The `xp.granted` event and any level-up stickers of a grant that wrote something. */
export async function announceXp(
  tx: pg.PoolClient,
  grant: XpGrant,
  result: XpGranted,
): Promise<void> {
  await appendDomainEvent(tx, {
    type: 'xp.granted',
    aggregateKind: grant.crewId === null ? 'user' : 'crew',
    aggregateId: grant.crewId ?? grant.userIds[0] ?? grant.sourceId,
    actorKind: 'system',
    actorId: null,
    crewId: grant.crewId,
    tripId: grant.tripId,
    payload: {
      crew_id: grant.crewId,
      trip_id: grant.tripId,
      source_kind: grant.sourceKind,
      source_id: grant.sourceId,
      amount: grant.amount,
      user_ids: [...grant.userIds],
      level_before: result.levelBefore,
      level_after: result.levelAfter,
    },
  });
  if (grant.crewId !== null) {
    await announceLevelUps(tx, {
      crewId: grant.crewId,
      tripId: grant.tripId,
      stickerIds: result.stickerIds,
      at: grant.at,
    });
  }
}

async function tripCrew(tx: pg.PoolClient, tripId: string | null): Promise<string | null> {
  if (tripId === null) return null;
  const { rows } = await tx.query<{ crew_id: string }>('SELECT crew_id FROM trips WHERE id = $1', [
    tripId,
  ]);
  return rows[0]?.crew_id ?? null;
}

/** Form XP for each verified find of a grant (a form is found once per traveller, ever). */
export async function formXp(tx: pg.PoolClient, reward: RewardGrant): Promise<void> {
  for (const entry of reward.entries) {
    if (entry.xp <= 0) continue;
    await grantXp(tx, {
      crewId: await tripCrew(tx, entry.trip_id),
      tripId: entry.trip_id,
      userIds: [entry.user_id],
      amount: entry.xp,
      sourceKind: 'form',
      sourceId: entry.id,
      at: reward.grantedAt,
    });
  }
}

/** A traveller's first visit to a place on a trip earns the crew and them the visit XP. */
export async function visitXp(
  tx: pg.PoolClient,
  event: { readonly payload: Readonly<Record<string, unknown>>; readonly occurred_at: Date },
): Promise<boolean> {
  const visitId = event.payload['visit_id'];
  if (typeof visitId !== 'string') return false;
  const { rows } = await tx.query<{ user_id: string; trip_id: string; first: boolean }>(
    `SELECT v.user_id, v.trip_id,
            NOT EXISTS (SELECT 1 FROM visits o
                         WHERE o.user_id = v.user_id AND o.trip_id = v.trip_id
                           AND o.poi_id = v.poi_id AND o.id <> v.id
                           AND (o.arrived_at, o.id) < (v.arrived_at, v.id)) AS first
       FROM visits v WHERE v.id = $1`,
    [visitId],
  );
  const visit = rows[0];
  if (visit === undefined || !visit.first) return false;
  const result = await grantXp(tx, {
    crewId: await tripCrew(tx, visit.trip_id),
    tripId: visit.trip_id,
    userIds: [visit.user_id],
    amount: XP_SOURCES.visit,
    sourceKind: 'visit',
    sourceId: visitId,
    at: event.occurred_at,
  });
  return result.granted;
}

let registered = false;

/** Registers the form XP handler on `reward.fanout`, once per process. */
export function registerXpRewardHandler(): void {
  if (registered) return;
  registered = true;
  registerRewardHandler('xp', formXp);
}
