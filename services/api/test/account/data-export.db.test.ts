/**
 * `request_data_export` against a real api and Postgres: one export in flight at a time, one a day
 * (a failed one does not count), a replay of the same id is the same answer, and an id that is
 * someone else's export is refused.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAccountHarness, type AccountHarness } from './account-harness';

let h: AccountHarness;

beforeAll(async () => {
  h = await startAccountHarness();
}, 240_000);

afterAll(async () => {
  await h.stop();
});

async function statusOf(id: string): Promise<string | undefined> {
  const rows = await h.rows<{ status: string }>('SELECT status FROM data_exports WHERE id = $1', [
    id,
  ]);
  return rows[0]?.status;
}

describe('request_data_export', () => {
  it('queues one export at a time and one a day, and a failed one does not count', async () => {
    const me = await h.anonymous();
    const first = generateUuidV7();
    const [ok, body] = await h.cmd(me, 'request_data_export', { export_id: first });
    expect(ok).toBe(200);
    expect(body.result).toEqual({ export_id: first });
    expect(await statusOf(first)).toBe('queued');

    // The same request again (a retry) is the same answer, not a second export.
    const [again, replay] = await h.cmd(me, 'request_data_export', { export_id: first });
    expect(again).toBe(200);
    expect(replay.result).toEqual({ export_id: first });

    const [, busy] = await h.cmd(me, 'request_data_export', { export_id: generateUuidV7() });
    expect(busy.error?.code).toBe('STATE_INVALID');
    expect(busy.error?.detail).toMatchObject({ reason: 'export_in_progress' });

    await h.rows(
      "UPDATE data_exports SET status = 'failed', error_code = 'build_failed' WHERE id = $1",
      [first],
    );
    const second = generateUuidV7();
    const [retry] = await h.cmd(me, 'request_data_export', { export_id: second });
    expect(retry).toBe(200);

    await h.rows(
      `UPDATE data_exports SET status = 'ready', r2_key = $2, ready_at = now(),
              expires_at = now() + interval '7 days' WHERE id = $1`,
      [second, `exports/${me.uid}/${second}.zip`],
    );
    const [, tooSoon] = await h.cmd(me, 'request_data_export', { export_id: generateUuidV7() });
    expect(tooSoon.error?.code).toBe('STATE_INVALID');
    expect(tooSoon.error?.detail).toMatchObject({ reason: 'export_cooldown' });
  });

  it("refuses an id that is someone else's export", async () => {
    const owner = await h.anonymous();
    const other = await h.anonymous();
    const id = generateUuidV7();
    await h.cmd(owner, 'request_data_export', { export_id: id });
    const [, refused] = await h.cmd(other, 'request_data_export', { export_id: id });
    expect(refused.error?.code).toBe('FORBIDDEN');
    expect(await statusOf(id)).toBe('queued');
  });
});
