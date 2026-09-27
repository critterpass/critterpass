import { describe, expect, it } from 'vitest';

import { canOpenAdminArea, canRunAdminCommand, openableAdminAreas } from './policy';
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
    expect(openableAdminAreas(['support'])).toEqual(['home', 'moderation', 'support', 'feedback']);
  });
});
