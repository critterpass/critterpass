/**
 * `invite_prefill`: RLS class X (C3). The inviter writes it once for their own invite; no app_user
 * role reads it back, the inviter included. The only read path is `app.invite_for_seat`, which
 * answers whoever holds the seat token and returns the envelopes still encrypted.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { insertCrew, insertCrewMember, insertUser } from '../helpers/actors';
import { insertInvite, randomSeatHash } from '../helpers/growth-fixture';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let inviter: string;
let member: string;
let stranger: string;
let crewId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  await withSystem(db.pool, async (tx) => {
    inviter = await insertUser(tx);
    member = await insertUser(tx);
    stranger = await insertUser(tx);
    crewId = await insertCrew(tx, { createdBy: inviter });
    await insertCrewMember(tx, { crewId, userId: inviter, role: 'organiser' });
    await insertCrewMember(tx, { crewId, userId: member });
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

function as<T>(uid: string, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  return withUser(db.pool, uid, randomUUID(), fn);
}

async function inviteWithSeat(): Promise<{ inviteId: string; seatHash: string }> {
  const seatHash = randomSeatHash();
  const inviteId = await withSystem(db.pool, async (tx) => {
    const id = await insertInvite(tx, { crewId, inviterId: inviter });
    await tx.query('UPDATE invites SET seat_token_hash = $2 WHERE id = $1', [id, seatHash]);
    return id;
  });
  return { inviteId, seatHash };
}

const PREFILL = `INSERT INTO invite_prefill (invite_id, inviter_id, name_enc, home_hint, tags, phone_hash)
  VALUES ($1, $2, 'v1:k:iv:tag:ct', 'DPS', '{food,beach}', repeat('b', 64))`;

describe('invite_prefill: write once, read never', () => {
  it('lets the inviter write the prefill of their own invite and nobody else', async () => {
    const { inviteId } = await inviteWithSeat();
    await expect(as(member, (tx) => tx.query(PREFILL, [inviteId, member]))).rejects.toThrow(
      /row-level security/i,
    );
    await expect(
      as(inviter, (tx) => tx.query(PREFILL, [inviteId, inviter])),
    ).resolves.toBeDefined();
  });

  it('hides the prefill from every app_user reader, the inviter included', async () => {
    for (const uid of [inviter, member, stranger]) {
      await expect(
        as(uid, (tx) => tx.query('SELECT name_enc FROM invite_prefill')),
      ).rejects.toThrow(/permission denied/i);
    }
    await expect(
      as(inviter, (tx) => tx.query("UPDATE invite_prefill SET home_hint = 'SIN'")),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses more than three tags and a malformed home hint', async () => {
    const { inviteId } = await inviteWithSeat();
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO invite_prefill (invite_id, inviter_id, tags) VALUES ($1, $2, '{a,b,c,d}')",
          [inviteId, inviter],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO invite_prefill (invite_id, inviter_id, home_hint) VALUES ($1, $2, 'bali')",
          [inviteId, inviter],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});

describe('app.invite_for_seat', () => {
  it('answers the seat token holder, outsider or not, with the envelopes still encrypted', async () => {
    const { inviteId, seatHash } = await inviteWithSeat();
    await as(inviter, (tx) => tx.query(PREFILL, [inviteId, inviter]));
    const { rows } = await as(stranger, (tx) =>
      tx.query('SELECT * FROM app.invite_for_seat($1)', [seatHash]),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        invite_id: inviteId,
        crew_id: crewId,
        status: 'pending',
        name_enc: 'v1:k:iv:tag:ct',
        home_hint: 'DPS',
        tags: ['food', 'beach'],
      }),
    ]);
  });

  it('returns nothing for a token nobody minted', async () => {
    const { rows } = await as(stranger, (tx) =>
      tx.query('SELECT * FROM app.invite_for_seat($1)', [randomSeatHash()]),
    );
    expect(rows).toEqual([]);
  });

  it('is not callable outside the app roles', async () => {
    const { rows } = await db.pool.query<{ allowed: boolean }>(
      "SELECT has_function_privilege('public', 'app.invite_for_seat(text)', 'EXECUTE') AS allowed",
    );
    expect(rows[0]?.allowed).toBe(false);
  });
});
