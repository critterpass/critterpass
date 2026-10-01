/**
 * `user_settings` expansion (docs/data-model.md §3.1): `audio` is a JSON object and
 * `home_currency_override` an ISO 4217 code, both written by their owner only; `users` gains
 * spoken languages and a username format that matches `update_profile`.
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

async function userWithSettings(): Promise<string> {
  const uid = await withSystem(db.pool, (tx) => insertUser(tx));
  await withUser(db.pool, uid, device, (tx) =>
    tx.query('INSERT INTO user_settings (user_id) VALUES ($1)', [uid]),
  );
  return uid;
}

describe('user_settings audio and currency override', () => {
  it('lets the owner merge audio keys and set an override', async () => {
    const uid = await userWithSettings();
    await withUser(db.pool, uid, device, (tx) =>
      tx.query(
        `UPDATE user_settings SET audio = audio || '{"music_enabled": false}'::jsonb,
           home_currency_override = 'SGD' WHERE user_id = $1`,
        [uid],
      ),
    );
    const { rows } = await withUser(db.pool, uid, device, (tx) =>
      tx.query('SELECT audio, home_currency_override FROM user_settings WHERE user_id = $1', [uid]),
    );
    expect(rows).toEqual([{ audio: { music_enabled: false }, home_currency_override: 'SGD' }]);
  });

  it("never lets another user write someone's audio settings", async () => {
    const uid = await userWithSettings();
    const other = await withSystem(db.pool, (tx) => insertUser(tx));
    const result = await withUser(db.pool, other, device, (tx) =>
      tx.query(`UPDATE user_settings SET audio = '{"haptics": false}' WHERE user_id = $1`, [uid]),
    );
    expect(result.rowCount).toBe(0);
  });

  it('refuses a non-object audio value and a malformed currency', async () => {
    const uid = await userWithSettings();
    await expect(
      withUser(db.pool, uid, device, (tx) =>
        tx.query(`UPDATE user_settings SET audio = '[1]' WHERE user_id = $1`, [uid]),
      ),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      withUser(db.pool, uid, device, (tx) =>
        tx.query(`UPDATE user_settings SET home_currency_override = 'sgd' WHERE user_id = $1`, [
          uid,
        ]),
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it('refuses a username outside the 3–20 [a-z0-9_.] rule', async () => {
    const uid = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withUser(db.pool, uid, device, (tx) =>
        tx.query("UPDATE users SET username = 'No Spaces' WHERE id = $1", [uid]),
      ),
    ).rejects.toThrow(/check constraint/i);
    await withUser(db.pool, uid, device, (tx) =>
      tx.query("UPDATE users SET username = 'mai.tran', languages = '{vi,en}' WHERE id = $1", [
        uid,
      ]),
    );
  });
});
