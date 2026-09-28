/**
 * Growth rows for the shared permission fixture: an organiser's personal trip invite with its
 * prefill and opens, a referral from the organiser to the member, the member's open seat offer and
 * the organiser's consented contact card. Also the insert helpers the growth permission suites use.
 */
import { createHash, randomBytes } from 'node:crypto';

import type pg from 'pg';

import { firstRow } from './actors';

export function randomSeatHash(): string {
  return createHash('sha256').update(randomBytes(16)).digest('hex');
}

export interface InsertInviteOptions {
  readonly crewId: string;
  readonly inviterId: string;
  readonly tripId?: string | null;
  readonly personal?: boolean;
  readonly inviteeUserId?: string | null;
  readonly status?: string;
}

export async function insertInvite(
  client: pg.PoolClient | pg.Pool,
  options: InsertInviteOptions,
): Promise<string> {
  const personal = options.personal ?? true;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO invites (crew_id, trip_id, inviter_id, kind, seat_token_hash, invitee_user_id,
       status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '14 days') RETURNING id`,
    [
      options.crewId,
      options.tripId ?? null,
      options.inviterId,
      personal ? 'personal' : 'generic',
      personal ? randomSeatHash() : null,
      options.inviteeUserId ?? null,
      options.status ?? 'pending',
    ],
  );
  return firstRow(rows).id;
}

export interface GrowthFixtureInput {
  readonly crewId: string;
  readonly tripId: string;
  readonly organiser: string;
  readonly member: string;
}

export async function seedGrowthRows(tx: pg.PoolClient, input: GrowthFixtureInput): Promise<void> {
  const inviteId = await insertInvite(tx, {
    crewId: input.crewId,
    tripId: input.tripId,
    inviterId: input.organiser,
  });
  await tx.query(
    `INSERT INTO invite_prefill (invite_id, inviter_id, name_enc, home_hint, tags)
     VALUES ($1, $2, 'v1:k:iv:tag:ct', 'SIN', '{beach}')`,
    [inviteId, input.organiser],
  );
  await tx.query(
    `INSERT INTO invite_opens (id, inviter_id, open_count, first_opened_at, last_opened_at)
     VALUES ($1, $2, 1, now(), now())`,
    [inviteId, input.organiser],
  );
  await tx.query(
    `INSERT INTO referrals (referrer_id, referee_id, via, invite_id) VALUES ($1, $2, 'invite', $3)`,
    [input.organiser, input.member, inviteId],
  );
  await tx.query(
    `INSERT INTO seat_waitlist_offers (trip_id, user_id, expires_at)
     VALUES ($1, $2, now() + interval '24 hours')`,
    [input.tripId, input.member],
  );
  await tx.query(
    `INSERT INTO crew_contact_cards (crew_id, user_id, phone_display) VALUES ($1, $2, '+65 •••• 1234')`,
    [input.crewId, input.organiser],
  );
}
