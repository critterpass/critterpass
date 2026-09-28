/**
 * `crew_contact_cards`: RLS class M, system-written. Active crew members read the consented cards
 * of their crew; ex-members, strangers and even the card's owner cannot write one, and the crews
 * stream syncs cards only inside the crew.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

function as(uid: string, sql: string, params: unknown[] = []) {
  return withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));
}

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('crew_contact_cards', () => {
  it('shows the crew its cards and hides them from ex-members and strangers', async () => {
    const { actors, crewId } = harness.fixture;
    const sql = 'SELECT phone_display FROM crew_contact_cards WHERE crew_id = $1';
    for (const uid of [actors.member, actors.organiser, actors.coOrganiser]) {
      expect((await as(uid, sql, [crewId])).rows).toHaveLength(1);
    }
    for (const uid of [actors.exMember, actors.outsider, actors.anonymous]) {
      expect((await as(uid, sql, [crewId])).rows).toEqual([]);
    }
  });

  it('takes no app_user writes, not even from the card owner', async () => {
    const { actors, crewId } = harness.fixture;
    await expect(
      as(
        actors.organiser,
        "UPDATE crew_contact_cards SET phone_display = '+65 0000' WHERE crew_id = $1",
        [crewId],
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(
        actors.member,
        "INSERT INTO crew_contact_cards (crew_id, user_id, phone_display) VALUES ($1, $2, '+65 1111')",
        [crewId, actors.member],
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('syncs cards through the crews stream to active members only', async () => {
    expect((await harness.rows('crews', 'member')).get('crew_contact_cards')).toHaveLength(1);
    expect((await harness.rows('crews', 'exMember')).get('crew_contact_cards') ?? []).toEqual([]);
    expect((await harness.rows('crews', 'outsider')).get('crew_contact_cards') ?? []).toEqual([]);
  });
});
