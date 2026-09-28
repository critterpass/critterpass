/**
 * Role matrix: every console command × every role, through the real api. A role outside the
 * command's policy gets 403 and nothing else does (allowed calls reach the handler and fail or
 * succeed on their own merits: unknown ids, stale versions). Nav links follow the same policy.
 */
import {
  ADMIN_COMMAND_ROLES,
  ADMIN_CONSOLE_DEVICE,
  ADMIN_ROLES,
  canRunAdminCommand,
  generateUuidV7,
} from '@cp/domain';
import { expect, test, type Page } from '@playwright/test';

import { nav, signInAs } from './session';

const nobody = () => generateUuidV7();
const soon = () => new Date(Date.now() + 86_400_000).toISOString();

/** Valid payloads aimed at nothing, so an allowed call cannot change seeded data. */
const PAYLOADS: Readonly<Record<string, () => unknown>> = {
  set_feature_flag: () => ({
    key: 'seat.cap_free',
    value: 6,
    audience: { kind: 'all' },
    version: 0,
  }),
  set_partner_adapter: () => ({
    partner: 'gyg_api',
    enabled: false,
    copy_mode: 'link',
    notes: null,
    version: 999,
  }),
  upsert_catalogue_item: () => ({ kind: 'guides', id: nobody(), version: 'stale', data: {} }),
  upsert_poi: () => ({ id: nobody(), name: 'Nowhere' }),
  upsert_season_editorial: () => ({ destination_id: nobody(), months: [], events: [] }),
  review_season_event: () => ({ event_id: nobody(), decision: 'approve' }),
  review_cost_index: () => ({ index_id: nobody() }),
  review_content_item: () => ({ batch_id: nobody(), item_ref: 'matrix', verdict: 'keep' }),
  reject_content_batch: () => ({ batch_id: nobody(), notes: 'Role matrix probe' }),
  verify_poi_hours: () => ({ proposal_id: nobody(), verdict: 'reject' }),
  approve_content_batch: () => ({ batch_id: nobody() }),
  // No release has version 999, so an allowed rollback finds nothing to restore.
  rollback_content_release: () => ({ kind: 'sets', to_version: 999 }),
  moderate_item: () => ({ kind: 'user', id: nobody(), verdict: 'approve', note: null }),
  grant_entitlement: () => ({ uid: nobody(), perk: 'pass_plus', until: soon(), reason: 'matrix' }),
  revoke_entitlement: () => ({ uid: nobody(), perk: 'pass_plus', reason: 'matrix' }),
  revoke_session: () => ({ uid: nobody(), session_id: nobody(), reason: 'matrix' }),
  ban_user: () => ({ uid: nobody(), reason: 'matrix', until: null }),
  unban_user: () => ({ uid: nobody(), reason: 'matrix' }),
  revoke_device_key: () => ({ uid: nobody(), device_id: nobody(), reason: 'matrix' }),
  create_concierge_task: () => ({ kind: 'review', note: 'Role matrix probe' }),
  update_concierge_task: () => ({ id: nobody(), version: 1, note: 'matrix' }),
  set_admin_role: () => ({ uid: nobody(), roles: ['support'], reason: 'matrix' }),
  revoke_admin_sessions: () => ({ uid: nobody(), reason: 'matrix' }),
  // Unknown queues and providers: an allowed call is refused by the handler, never by the policy.
  claim_work_item: () => ({ queue: 'matrix_probe', item_id: nobody() }),
  release_work_item: () => ({ queue: 'matrix_probe', item_id: nobody() }),
  redrive_jobs: () => ({ queue: 'matrix.probe' }),
  replay_webhook: () => ({ provider: 'matrix_probe', event_id: 'evt_matrix' }),
};

async function send(page: Page, cmd: string): Promise<number> {
  const payload = PAYLOADS[cmd];
  if (payload === undefined) throw new Error(`no matrix payload for ${cmd}`);
  const response = await page.request.post(`/v1/admin/cmd/${cmd}`, {
    data: {
      op_id: generateUuidV7(),
      cmd,
      v: 1,
      actor: { uid: generateUuidV7(), via: 'admin' },
      device: ADMIN_CONSOLE_DEVICE,
      client_ts: new Date().toISOString(),
      payload: payload(),
    },
  });
  return response.status();
}

test('every command has a matrix payload', () => {
  expect(Object.keys(PAYLOADS).sort()).toEqual(Object.keys(ADMIN_COMMAND_ROLES).sort());
});

for (const role of ADMIN_ROLES) {
  test(`${role}: allowed commands pass the policy, the rest are 403`, async ({ page }) => {
    await signInAs(page, role);
    const outcomes: Record<string, string> = {};
    for (const cmd of Object.keys(ADMIN_COMMAND_ROLES)) {
      const status = await send(page, cmd);
      const allowed = canRunAdminCommand([role], cmd).ok;
      outcomes[cmd] = `${allowed ? 'allowed' : 'forbidden'}:${status === 403 ? 403 : 'passed'}`;
      expect(status, `${role} ${cmd}`).not.toBe(500);
    }
    for (const [cmd, outcome] of Object.entries(outcomes)) {
      expect(outcome, `${role} ${cmd}`).toMatch(/^(allowed:passed|forbidden:403)$/);
    }
  });
}

test('support cannot change flags and content cannot ban, in the UI too', async ({ page }) => {
  await signInAs(page, 'support');
  await expect(nav(page).getByRole('link', { name: 'Flags & config' })).toHaveCount(0);
  await page.goto('/flags');
  await expect(page.getByText('Not for your role')).toBeVisible();
  await nav(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await signInAs(page, 'content');
  await expect(nav(page).getByRole('link', { name: 'Support' })).toHaveCount(0);
  await expect(nav(page).getByRole('link', { name: 'Moderation' })).toHaveCount(0);
  expect(await send(page, 'ban_user')).toBe(403);
  expect(await send(page, 'moderate_item')).toBe(403);
});
