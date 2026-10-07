/**
 * Earned app icons (3n-5): a verified find of a named form, or of any form of a named critter,
 * opens its icon for the finder. Runs as a `reward.fanout` handler, in the grant's transaction.
 * Each run reads every verified find of the grant's travellers, so an icon whose find came before
 * its rule existed opens with their next find. A new row has no `seen_at`: that is the picker's
 * NEW badge, cleared when the traveller chooses the icon. Nothing is ever taken back here.
 */
import { APP_ICON_FORM_UNLOCKS, type AppIconFormUnlock } from '@cp/domain';
import type pg from 'pg';

import { registerRewardHandler, type RewardGrant } from '../rewards/registry';

export interface IconUnlocksGranted {
  readonly userId: string;
  readonly icon: string;
}

/** Opens every icon the travellers' verified finds have earned; answers the ones newly opened. */
export async function unlockEarnedIcons(
  tx: pg.PoolClient,
  userIds: readonly string[],
  at: Date,
  rules: readonly AppIconFormUnlock[] = APP_ICON_FORM_UNLOCKS,
): Promise<IconUnlocksGranted[]> {
  if (userIds.length === 0 || rules.length === 0) return [];
  const { rows } = await tx.query<{ user_id: string; icon_key: string }>(
    `INSERT INTO app_icon_unlocks (user_id, icon_key, source, unlocked_at)
     SELECT DISTINCT c.user_id, r.icon, 'form_found', $5::timestamptz
       FROM collection_entries c
       JOIN critter_forms f ON f.id = c.form_id
       JOIN critters k ON k.id = c.critter_id
       JOIN unnest($2::text[], $3::text[], $4::text[]) AS r (icon, form_key, critter_key)
         ON r.form_key = f.key OR r.critter_key = k.key
      WHERE c.user_id = ANY ($1::uuid[]) AND c.verification = 'verified'
     ON CONFLICT (user_id, icon_key) DO NOTHING
     RETURNING user_id, icon_key`,
    [
      [...new Set(userIds)],
      rules.map((rule) => rule.icon),
      rules.map((rule) => rule.formKey ?? null),
      rules.map((rule) => rule.critterKey ?? null),
      at,
    ],
  );
  return rows.map((row) => ({ userId: row.user_id, icon: row.icon_key }));
}

async function onFind(tx: pg.PoolClient, grant: RewardGrant): Promise<void> {
  await unlockEarnedIcons(
    tx,
    grant.entries.map((entry) => entry.user_id),
    grant.grantedAt,
  );
}

let registered = false;

/** Registers the icon unlocks on `reward.fanout`, once per process. */
export function registerAppIconUnlocks(): void {
  if (registered) return;
  registered = true;
  registerRewardHandler('app_icons', onFind);
}
