import { describe, expect, it } from 'vitest';

import { configKey } from './config-keys';
import {
  ADMIN_AREA_ROLES,
  ADMIN_AREAS,
  canOpenAdminArea,
  canRunAdminCommand,
  canSetConfigKey,
  openableAdminAreas,
} from './policy';
import { parseAdminRoles, serializeAdminRoles } from './roles';

describe('admin roles', () => {
  it('parses the stored role string, ignoring unknown and duplicate entries', () => {
    expect(parseAdminRoles('support, ops,admin,ops')).toEqual(['ops', 'support']);
    expect(parseAdminRoles(null)).toEqual([]);
    expect(serializeAdminRoles(['support', 'owner'])).toBe('owner,support');
  });
});

describe('admin policy', () => {
  it('keeps support away from flags and content away from bans', () => {
    expect(canRunAdminCommand(['support'], 'set_feature_flag')).toEqual({
      ok: false,
      deny: 'FORBIDDEN',
    });
    expect(canRunAdminCommand(['content'], 'ban_user').ok).toBe(false);
    expect(canRunAdminCommand(['ops'], 'set_feature_flag').ok).toBe(true);
    expect(canRunAdminCommand(['content'], 'upsert_catalogue_item').ok).toBe(true);
  });

  it('lets owner do everything, including commands no table lists', () => {
    expect(canRunAdminCommand(['owner'], 'ban_user').ok).toBe(true);
    expect(canRunAdminCommand(['owner'], 'future_command').ok).toBe(true);
    expect(canRunAdminCommand(['ops'], 'future_command').ok).toBe(false);
    expect(canOpenAdminArea(['owner'], 'catalogue').ok).toBe(true);
  });

  it('denies a role-less admin everything', () => {
    expect(openableAdminAreas([])).toEqual([]);
    expect(canRunAdminCommand([], 'set_feature_flag').ok).toBe(false);
  });

  it('lists only the areas a role may open', () => {
    expect(openableAdminAreas(['support'])).toEqual([
      'home',
      'work',
      'moderation',
      'support',
      'feedback',
      'billing',
    ]);
  });

  it('gives every area a non-empty role list and keeps operators to the owner', () => {
    for (const area of ADMIN_AREAS) expect(ADMIN_AREA_ROLES[area].length).toBeGreaterThan(0);
    expect(ADMIN_AREA_ROLES.operators).toEqual(['owner']);
    expect(canOpenAdminArea(['ops'], 'operators').ok).toBe(false);
    expect(canOpenAdminArea(['content'], 'community').ok).toBe(true);
  });

  it('assigns the console commands their roles', () => {
    expect(canRunAdminCommand(['ops'], 'redrive_jobs').ok).toBe(true);
    expect(canRunAdminCommand(['support'], 'redrive_jobs').ok).toBe(false);
    expect(canRunAdminCommand(['ops'], 'revoke_admin_sessions').ok).toBe(false);
    expect(canRunAdminCommand(['content'], 'approve_content_batch').ok).toBe(false);
    expect(canRunAdminCommand(['support'], 'claim_work_item').ok).toBe(true);
  });
});

describe('per-key roles', () => {
  it('keeps tier switches and spend caps to the owner', () => {
    const tier = configKey('ai.tier.pro.enabled');
    expect(canSetConfigKey(['ops'], tier?.roles)).toEqual({ ok: false, deny: 'FORBIDDEN' });
    expect(canSetConfigKey(['owner'], tier?.roles).ok).toBe(true);
    expect(canSetConfigKey(['ops'], configKey('ai.cap.daily_usd')?.roles).ok).toBe(false);
    expect(canSetConfigKey(['ops'], configKey('ai.guide.chat.enabled')?.roles).ok).toBe(true);
    expect(canSetConfigKey(['support'], undefined).ok).toBe(false);
  });
});
