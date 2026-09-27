/**
 * `join_codes`: RLS class M (docs/data-model.md §3.2). Crew members read their crew's codes, a
 * referral code's creator reads their own, writes belong to app_system, and everyone else reaches
 * a code only through `app.lookup_join_code`, which returns the public subset of a live code.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
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
let member: string;
let exMember: string;
let outsider: string;
let crewId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  await withSystem(db.pool, async (tx) => {
    organiser = await insertUser(tx);
    member = await insertUser(tx);
    exMember = await insertUser(tx);
    outsider = await insertUser(tx);
    crewId = await insertCrew(tx, { createdBy: organiser });
    await insertCrewMember(tx, { crewId, userId: organiser, role: 'organiser' });
    await insertCrewMember(tx, { crewId, userId: member, role: 'member' });
    await insertCrewMember(tx, { crewId, userId: exMember, role: 'member' });
    await setCrewMemberStatus(tx, { crewId, userId: exMember, status: 'removed' });
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

interface CodeOptions {
  readonly code: string;
  readonly kind?: 'crew' | 'trip' | 'referral';
  readonly status?: string;
  readonly expiresAt?: string | null;
  readonly maxUses?: number | null;
  readonly uses?: number;
  readonly createdBy?: string;
}

function insertCode(options: CodeOptions): Promise<pg.QueryResult> {
  const kind = options.kind ?? 'crew';
  return withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by, status, expires_at, max_uses, uses)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        options.code,
        kind,
        kind === 'referral' ? (options.createdBy ?? organiser) : crewId,
        kind === 'referral' ? null : crewId,
        options.createdBy ?? organiser,
        options.status ?? 'active',
        options.expiresAt ?? null,
        options.maxUses ?? null,
        options.uses ?? 0,
      ],
    ),
  );
}

function selectAs(uid: string, code: string) {
  return withUser(db.pool, uid, randomUUID(), (tx) =>
    tx.query('SELECT code FROM join_codes WHERE code = $1', [code]),
  );
}

function lookupAs(uid: string, code: string) {
  return withUser(db.pool, uid, randomUUID(), (tx) =>
    tx.query('SELECT * FROM app.lookup_join_code($1)', [code]),
  );
}

describe('join_codes: crew-member reads, system writes', () => {
  it('lets active crew members read the crew code and hides it from everyone else', async () => {
    await insertCode({ code: 'CREW2A' });
    expect((await selectAs(organiser, 'CREW2A')).rows).toHaveLength(1);
    expect((await selectAs(member, 'CREW2A')).rows).toHaveLength(1);
    expect((await selectAs(exMember, 'CREW2A')).rows).toEqual([]);
    expect((await selectAs(outsider, 'CREW2A')).rows).toEqual([]);
    expect((await selectAs(randomUUID(), 'CREW2A')).rows).toEqual([]);
  });

  it('lets only the creator read a referral code', async () => {
    await insertCode({ code: 'REFR2B', kind: 'referral', createdBy: member });
    expect((await selectAs(member, 'REFR2B')).rows).toHaveLength(1);
    expect((await selectAs(organiser, 'REFR2B')).rows).toEqual([]);
  });

  it('refuses every app_user write, members included', async () => {
    await expect(
      withUser(db.pool, organiser, randomUUID(), (tx) =>
        tx.query(
          `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by)
           VALUES ('WRTE2C', 'crew', $1, $1, $2)`,
          [crewId, organiser],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, organiser, randomUUID(), (tx) =>
        tx.query("UPDATE join_codes SET uses = uses + 1 WHERE code = 'CREW2A'"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps live codes unique but lets a retired value be minted again', async () => {
    await insertCode({ code: 'SAME2D' });
    await expect(insertCode({ code: 'SAME2D' })).rejects.toThrow(/duplicate key|unique/i);
    await withSystem(db.pool, (tx) =>
      tx.query("UPDATE join_codes SET status = 'revoked' WHERE code = 'SAME2D'"),
    );
    await expect(insertCode({ code: 'SAME2D' })).resolves.toBeDefined();
  });

  it('rejects look-alike glyphs and a referral code tied to a crew', async () => {
    await expect(insertCode({ code: 'BAD0OX' })).rejects.toThrow(/check constraint/i);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by)
           VALUES ('MXXD2E', 'referral', $1, $2, $1)`,
          [organiser, crewId],
        ),
      ),
    ).rejects.toThrow(/join_codes_crew_matches_kind/);
  });
});

describe('app.lookup_join_code', () => {
  it('returns only the public subset of a live code to an outsider, and counts nothing', async () => {
    await insertCode({ code: 'PEEK2F', maxUses: 6, uses: 2, expiresAt: '2999-01-01T00:00:00Z' });
    const { rows } = await lookupAs(outsider, 'PEEK2F');
    expect(rows).toEqual([
      {
        code: 'PEEK2F',
        target_kind: 'crew',
        target_id: crewId,
        crew_id: crewId,
        expires_at: new Date('2999-01-01T00:00:00Z'),
      },
    ]);
    const { rows: after } = await withSystem(db.pool, (tx) =>
      tx.query<{ uses: number }>("SELECT uses FROM join_codes WHERE code = 'PEEK2F'"),
    );
    expect(after[0]?.uses).toBe(2);
  });

  it('returns nothing for revoked, expired, used-up or unknown codes', async () => {
    await insertCode({ code: 'DEAD2G', status: 'revoked' });
    await insertCode({ code: 'DEAD2H', expiresAt: '2000-01-01T00:00:00Z' });
    await insertCode({ code: 'DEAD2J', maxUses: 3, uses: 3 });
    for (const code of ['DEAD2G', 'DEAD2H', 'DEAD2J', 'ZZZZ2K']) {
      expect((await lookupAs(outsider, code)).rows).toEqual([]);
    }
  });

  it('is not callable by roles outside the app', async () => {
    const { rows } = await db.pool.query<{ allowed: boolean }>(
      "SELECT has_function_privilege('public', 'app.lookup_join_code(text)', 'EXECUTE') AS allowed",
    );
    expect(rows[0]?.allowed).toBe(false);
  });
});
