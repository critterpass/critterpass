/**
 * `app.join_crew`: the only way the request role joins a crew it did not create. The database
 * itself wants a live code, a held seat token or an in-app invite for that very crew, so a join
 * holds even if a command forgets to check, and a former member comes back the same way.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { insertCrew, insertCrewMember, insertUser, setCrewMemberStatus } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let organiser: string;
let crewId: string;
let otherCrewId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  await withSystem(db.pool, async (tx) => {
    organiser = await insertUser(tx);
    crewId = await insertCrew(tx, { createdBy: organiser });
    await insertCrewMember(tx, { crewId, userId: organiser, role: 'organiser' });
    otherCrewId = await insertCrew(tx, { createdBy: organiser });
    await insertCrewMember(tx, { crewId: otherCrewId, userId: organiser, role: 'organiser' });
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const newUser = () => withSystem(db.pool, (tx) => insertUser(tx));
const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

interface Proof {
  readonly code?: string;
  readonly seatHash?: string;
  readonly inviteId?: string;
}

function join(uid: string, crew: string, proof: Proof): Promise<boolean> {
  return withUser(db.pool, uid, randomUUID(), async (tx) => {
    const { rows } = await tx.query<{ joined: boolean }>(
      'SELECT app.join_crew($1, $2, $3, $4) AS joined',
      [crew, proof.code ?? null, proof.seatHash ?? null, proof.inviteId ?? null],
    );
    return rows[0]?.joined === true;
  });
}

async function membership(uid: string, crew = crewId): Promise<string | undefined> {
  const { rows } = await db.pool.query<{ status: string }>(
    'SELECT status FROM crew_members WHERE crew_id = $1 AND user_id = $2',
    [crew, uid],
  );
  return rows[0]?.status;
}

async function insertCode(crew: string, options: { status?: string; expired?: boolean } = {}) {
  const code = Array.from(
    randomBytes(6),
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join('');
  await withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by, status, expires_at)
       VALUES ($1, 'crew', $2, $2, $3, $4, now() + $5::interval)`,
      [code, crew, organiser, options.status ?? 'active', options.expired ? '-1 hour' : '7 days'],
    ),
  );
  return code;
}

interface InviteOptions {
  readonly seatHash?: string;
  readonly invitee?: string;
  readonly status?: string;
  readonly claimedBy?: string;
  readonly expired?: boolean;
}

async function insertInvite(crew: string, options: InviteOptions): Promise<string> {
  const { rows } = await withSystem(db.pool, (tx) =>
    tx.query<{ id: string }>(
      `INSERT INTO invites (crew_id, inviter_id, kind, seat_token_hash, invitee_user_id, channel,
                            status, claimed_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'app', $6, $7, now() + $8::interval)
       RETURNING id`,
      [
        crew,
        organiser,
        options.seatHash === undefined ? 'generic' : 'personal',
        options.seatHash ?? null,
        options.invitee ?? null,
        options.status ?? 'pending',
        options.claimedBy ?? null,
        options.expired ? '-1 hour' : '7 days',
      ],
    ),
  );
  return rows[0]!.id;
}

const DENIED = /no live code or invite for this crew/;

describe('app.join_crew', () => {
  it('refuses a caller with no proof, and the direct insert too', async () => {
    const uid = await newUser();
    await expect(join(uid, crewId, {})).rejects.toThrow(DENIED);
    await expect(
      withUser(db.pool, uid, randomUUID(), (tx) =>
        tx.query("INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')", [
          crewId,
          uid,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
    expect(await membership(uid)).toBeUndefined();
  });

  it('joins through a live code of that crew, as a plain member', async () => {
    const uid = await newUser();
    expect(await join(uid, crewId, { code: await insertCode(crewId) })).toBe(true);
    const { rows } = await db.pool.query<{ role: string; status: string }>(
      'SELECT role, status FROM crew_members WHERE crew_id = $1 AND user_id = $2',
      [crewId, uid],
    );
    expect(rows).toEqual([{ role: 'member', status: 'active' }]);
  });

  it("refuses another crew's code, a revoked code and an expired one", async () => {
    const uid = await newUser();
    const foreign = await insertCode(otherCrewId);
    const revoked = await insertCode(crewId, { status: 'revoked' });
    const expired = await insertCode(crewId, { expired: true });
    for (const code of [foreign, revoked, expired, 'ZZZZZZ']) {
      await expect(join(uid, crewId, { code })).rejects.toThrow(DENIED);
    }
    expect(await membership(uid)).toBeUndefined();
  });

  it('joins through an in-app invite addressed to the caller only', async () => {
    const invitee = await newUser();
    const bystander = await newUser();
    const inviteId = await insertInvite(crewId, { invitee });
    await expect(join(bystander, crewId, { inviteId })).rejects.toThrow(DENIED);
    await expect(join(invitee, otherCrewId, { inviteId })).rejects.toThrow(DENIED);
    expect(await join(invitee, crewId, { inviteId })).toBe(true);
  });

  it('refuses an in-app invite that was declined, revoked or has expired', async () => {
    const invitee = await newUser();
    const closed = [
      await insertInvite(crewId, { invitee, status: 'declined' }),
      await insertInvite(crewId, { invitee, status: 'revoked' }),
      await insertInvite(crewId, { invitee, expired: true }),
    ];
    for (const inviteId of closed) {
      await expect(join(invitee, crewId, { inviteId })).rejects.toThrow(DENIED);
    }
  });

  it('joins whoever holds an open seat token, and nobody once another person claimed it', async () => {
    const holder = await newUser();
    const late = await newUser();
    const open = hashOf(randomUUID());
    await insertInvite(crewId, { seatHash: open });
    await expect(join(holder, crewId, { seatHash: hashOf('guess') })).rejects.toThrow(DENIED);
    expect(await join(holder, crewId, { seatHash: open })).toBe(true);

    const taken = hashOf(randomUUID());
    await insertInvite(crewId, { seatHash: taken, status: 'claimed', claimedBy: holder });
    await expect(join(late, crewId, { seatHash: taken })).rejects.toThrow(DENIED);
  });

  it('brings a removed member back only with a fresh proof', async () => {
    const uid = await newUser();
    await withSystem(db.pool, async (tx) => {
      await insertCrewMember(tx, { crewId, userId: uid, role: 'organiser' });
      await setCrewMemberStatus(tx, { crewId, userId: uid, status: 'removed' });
    });
    await expect(join(uid, crewId, {})).rejects.toThrow(DENIED);
    expect(await membership(uid)).toBe('removed');

    expect(await join(uid, crewId, { code: await insertCode(crewId) })).toBe(true);
    const { rows } = await db.pool.query<{ role: string; status: string }>(
      'SELECT role, status FROM crew_members WHERE crew_id = $1 AND user_id = $2',
      [crewId, uid],
    );
    expect(rows).toEqual([{ role: 'member', status: 'active' }]);
  });

  it('reports no join for someone already in the crew', async () => {
    expect(await join(organiser, crewId, { code: await insertCode(crewId) })).toBe(false);
    expect(await membership(organiser)).toBe('active');
  });

  it('is not callable without a request identity or by the public', async () => {
    const { rows } = await db.pool.query<{ public: boolean; system: boolean }>(
      `SELECT has_function_privilege('public', 'app.join_crew(uuid, text, text, uuid)', 'EXECUTE') AS public,
              has_function_privilege('app_system', 'app.join_crew(uuid, text, text, uuid)', 'EXECUTE') AS system`,
    );
    expect(rows[0]).toEqual({ public: false, system: false });
  });
});
