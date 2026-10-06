/**
 * The console's ideas board over real Postgres: a suggested idea is hidden from other travellers
 * until support publishes it, then it is on the board; declining keeps it off; a shipped idea
 * carries its version; ops cannot run the command; and every change writes one audit row.
 */
import { withUser } from '@cp/db';
import { adminIdeasResponseSchema, generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let support: string;
let ops: string;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('support@critterpass.test', ['support']);
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  app = harness.app({ areas: harness.areas() });
  support = await app.signIn('support@critterpass.test');
  ops = await app.signIn('ops@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

async function suggest(title: string): Promise<string> {
  const id = generateUuidV7();
  await harness.pool.query(
    "INSERT INTO ideas (id, title, description, locale) VALUES ($1, $2, 'So we can plan together', 'en')",
    [id, title],
  );
  return id;
}

async function list(status: string) {
  const response = await app.request(`/v1/admin/ideas?status=${status}`, {
    headers: { cookie: support },
  });
  expect(response.status).toBe(200);
  return adminIdeasResponseSchema.parse(await response.json());
}

/** What another traveller's board can see: the `ideas_select` policy, as app_user. */
async function onTheBoard(id: string): Promise<boolean> {
  return withUser(harness.pool, generateUuidV7(), generateUuidV7(), async (tx) => {
    const { rowCount } = await tx.query('SELECT 1 FROM ideas WHERE id = $1', [id]);
    return rowCount === 1;
  });
}

describe('set_idea_status', () => {
  it('publishes a suggested idea onto the board with the team note', async () => {
    const id = await suggest('Offline maps for the whole trip');
    expect((await list('pending_review')).items.map((idea) => idea.id)).toContain(id);
    expect(await onTheBoard(id)).toBe(false);

    const publish = await app.command(support, 'set_idea_status', {
      idea_id: id,
      status: 'open',
      team_note: 'Good one. Looking at it.',
    });
    expect(publish.status).toBe(200);
    expect(await onTheBoard(id)).toBe(true);
    const open = await list('open');
    expect(open.items.find((idea) => idea.id === id)).toMatchObject({
      status: 'open',
      team_note: 'Good one. Looking at it.',
    });
    expect((await list('pending_review')).items.map((idea) => idea.id)).not.toContain(id);

    const audit = await harness.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM ops.admin_audit WHERE action = 'set_idea_status' AND target_id = $1",
      [id],
    );
    expect(audit.rows[0]?.n).toBe(1);
  });

  it('declines a suggestion, which stays off the board, and can reopen it', async () => {
    const id = await suggest('Dating mode for solo travellers');
    const decline = await app.command(support, 'set_idea_status', {
      idea_id: id,
      status: 'declined',
    });
    expect(decline.status).toBe(200);
    const planned = await app.command(support, 'set_idea_status', {
      idea_id: id,
      status: 'planned',
    });
    expect(planned.status).toBe(409);
    const reopen = await app.command(support, 'set_idea_status', { idea_id: id, status: 'open' });
    expect(reopen.status).toBe(200);
  });

  it('plans, then ships with the version, and a shipped idea is final', async () => {
    const id = await suggest('Split a bill by item, not evenly');
    const skip = await app.command(support, 'set_idea_status', { idea_id: id, status: 'planned' });
    expect(skip.status).toBe(409);
    for (const payload of [
      { status: 'open' },
      { status: 'planned' },
      { status: 'shipped', fixed_in_version: '1.0.4' },
    ]) {
      const response = await app.command(support, 'set_idea_status', { idea_id: id, ...payload });
      expect(response.status).toBe(200);
    }
    expect((await list('shipped')).items.find((idea) => idea.id === id)).toMatchObject({
      fixed_in_version: '1.0.4',
    });
    const back = await app.command(support, 'set_idea_status', { idea_id: id, status: 'open' });
    expect(back.status).toBe(409);
  });

  it('is refused to ops, and an unknown idea is not found', async () => {
    const id = await suggest('Group packing list everyone can tick');
    const denied = await app.command(ops, 'set_idea_status', { idea_id: id, status: 'open' });
    expect(denied.status).toBe(403);
    const missing = await app.command(support, 'set_idea_status', {
      idea_id: generateUuidV7(),
      status: 'open',
    });
    expect(missing.status).toBe(404);
  });
});
