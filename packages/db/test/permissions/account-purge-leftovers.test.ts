/**
 * What an erased account leaves for the external purge. `media_objects` rows go only through
 * `app.purge_account_media_objects`, which only the system role may run and which only touches an
 * account already purged. `feedback_tracker_redactions` is server-only: a deleted ticket that was
 * filed in the tracker leaves one row, tied to the deletion. The purge reminder reads a closed
 * account's e-mail address through `app.account_purge_reminder_contact`, the system role only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const device = anonymousActor().device;
const newUser = () => withSystem(db.pool, (tx) => insertUser(tx));

async function system<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(db.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function addMedia(owner: string, key: string): Promise<void> {
  await system(
    `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256)
     VALUES ($1, $2, 'image/jpeg', 10, repeat('a', 64))`,
    [owner, key],
  );
}

async function close(owner: string, purged: boolean): Promise<string> {
  const [row] = await system<{ id: string }>(
    `INSERT INTO account_deletions (user_id, purge_at, source, purged_at)
     VALUES ($1, now(), 'app', CASE WHEN $2 THEN now() END) RETURNING id`,
    [owner, purged],
  );
  return row?.id as string;
}

async function addTicket(owner: string, issue: string | null): Promise<number> {
  const [row] = await system<{ ticket_no: string }>(
    `INSERT INTO feedback_tickets (user_id, body, include_device_info, reply_channel,
       reply_due_at, app_version, sent_at, tracker_issue_id)
     VALUES ($1, 'It broke.', false, 'inbox', now() + interval '2 days', '1.0.0', now(), $2)
     RETURNING ticket_no`,
    [owner, issue],
  );
  return Number(row?.ticket_no);
}

const mediaCount = async (owner: string): Promise<number> =>
  (
    await system<{ n: number }>(
      'SELECT count(*)::int AS n FROM media_objects WHERE owner_id = $1',
      [owner],
    )
  )[0]?.n ?? -1;

describe('media_objects rows of an erased account', () => {
  it('cannot be deleted by the system role directly', async () => {
    const owner = await newUser();
    await addMedia(owner, `u/${owner}/avatar/direct`);
    await expect(system('DELETE FROM media_objects WHERE owner_id = $1', [owner])).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('go through the purge function for a purged account only, and only its own', async () => {
    const purged = await newUser();
    const closed = await newUser();
    const active = await newUser();
    for (const uid of [purged, closed, active]) {
      await addMedia(uid, `u/${uid}/avatar/1`);
      await addMedia(uid, `u/${uid}/receipt/2`);
    }
    await close(purged, true);
    await close(closed, false);

    const run = async (uid: string): Promise<number> =>
      (await system<{ n: number }>('SELECT app.purge_account_media_objects($1) AS n', [uid]))[0]
        ?.n ?? -1;
    expect(await run(closed)).toBe(0);
    expect(await run(active)).toBe(0);
    expect(await run(purged)).toBe(2);
    expect(await run(purged)).toBe(0);

    expect(await mediaCount(purged)).toBe(0);
    expect(await mediaCount(closed)).toBe(2);
    expect(await mediaCount(active)).toBe(2);
  });

  it('refuses the purge function to a signed-in traveller', async () => {
    const owner = await newUser();
    await expect(
      withUser(db.pool, owner, device, (tx) =>
        tx.query('SELECT app.purge_account_media_objects($1)', [owner]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('feedback_tracker_redactions', () => {
  it('keeps one row per filed ticket deleted with a closed account, and none otherwise', async () => {
    const owner = await newUser();
    const filed = await addTicket(owner, '41');
    await addTicket(owner, null);
    const deletionId = await close(owner, false);
    await system('DELETE FROM feedback_tickets WHERE user_id = $1', [owner]);

    expect(
      await system(
        'SELECT deletion_id, ticket_no::int AS ticket_no, tracker_issue_id FROM feedback_tracker_redactions WHERE deletion_id = $1',
        [deletionId],
      ),
    ).toEqual([{ deletion_id: deletionId, ticket_no: filed, tracker_issue_id: '41' }]);

    // A ticket deleted for an account that is not closed leaves nothing to redact.
    const active = await newUser();
    await addTicket(active, '42');
    await system('DELETE FROM feedback_tickets WHERE user_id = $1', [active]);
    expect(
      await system("SELECT 1 FROM feedback_tracker_redactions WHERE tracker_issue_id = '42'"),
    ).toEqual([]);

    // The system role removes a row once its issue is redacted.
    await system('DELETE FROM feedback_tracker_redactions WHERE deletion_id = $1', [deletionId]);
  });

  it('is closed to travellers', async () => {
    const owner = await newUser();
    for (const sql of [
      'SELECT 1 FROM feedback_tracker_redactions',
      'DELETE FROM feedback_tracker_redactions',
    ]) {
      await expect(withUser(db.pool, owner, device, (tx) => tx.query(sql))).rejects.toThrow(
        /permission denied/i,
      );
    }
  });
});

describe('the purge reminder contact', () => {
  async function signIn(uid: string, email: string): Promise<void> {
    await db.pool.query('INSERT INTO auth."user" (id, name, email) VALUES ($1, $2, $3)', [
      uid,
      'Mai',
      email,
    ]);
  }
  const contact = (deletionId: string) =>
    system<{ email: string | null; locale: string | null }>(
      'SELECT email, locale FROM app.account_purge_reminder_contact($1)',
      [deletionId],
    );

  it('answers the address and language of a closed account waiting for its purge only', async () => {
    const withEmail = await newUser();
    const phoneOnly = await newUser();
    const gone = await newUser();
    await signIn(withEmail, `mai-${withEmail}@example.com`);
    await signIn(phoneOnly, `temp-${phoneOnly}@anonymous.placeholder.invalid`);
    await signIn(gone, `gone-${gone}@example.com`);
    await system("UPDATE users SET locale = 'vi' WHERE id = $1", [withEmail]);

    expect(await contact(await close(withEmail, false))).toEqual([
      { email: `mai-${withEmail}@example.com`, locale: 'vi' },
    ]);
    expect(await contact(await close(phoneOnly, false))).toEqual([{ email: null, locale: null }]);
    expect(await contact(await close(gone, true))).toEqual([]);
  });

  it('is refused to a signed-in traveller, with the reminder record', async () => {
    const owner = await newUser();
    const deletionId = await close(owner, false);
    for (const [sql, params] of [
      ['SELECT * FROM app.account_purge_reminder_contact($1)', [deletionId]],
      ['SELECT 1 FROM account_purge_reminders', []],
    ] as const) {
      await expect(
        withUser(db.pool, owner, device, (tx) => tx.query(sql, [...params])),
      ).rejects.toThrow(/permission denied/i);
    }
  });
});
