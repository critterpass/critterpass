import { describe, expect, it } from 'vitest';

import { AI_ROUTES, GENERATION_TIERS } from '../ai/routes';
import { CONFIG_KEY_GROUPS, CONFIG_KEYS, configKey } from './config-keys';

describe('config key metadata', () => {
  it('puts every key in a known group', () => {
    for (const [key, definition] of Object.entries(CONFIG_KEYS)) {
      expect(CONFIG_KEY_GROUPS, key).toContain(definition.group);
    }
  });

  it('has a kill switch for every AI route and generation tier, and caps per tier', () => {
    for (const route of AI_ROUTES) expect(configKey(`ai.${route}.enabled`)?.group).toBe('services');
    for (const tier of GENERATION_TIERS) {
      expect(configKey(`ai.tier.${tier}.enabled`)?.roles).toEqual(['owner']);
      expect(configKey(`ai.cap.${tier}.daily_usd`)?.roles).toEqual(['owner']);
    }
    expect(configKey('spend.month_budget_usd')?.roles).toEqual(['owner']);
  });

  it('validates the ops timings', () => {
    expect(configKey('moderation.sla_hours')?.schema.safeParse(24).success).toBe(true);
    expect(configKey('moderation.sla_hours')?.schema.safeParse(0).success).toBe(false);
    const hours = configKey('desk.hours')?.schema;
    expect(hours?.safeParse({ open: '08:00', close: '22:00' }).success).toBe(true);
    expect(hours?.safeParse({ open: '8am', close: '22:00' }).success).toBe(false);
  });

  it('keeps kill switches and caps out of the synced client config', () => {
    for (const definition of Object.values(CONFIG_KEYS)) {
      if (definition.group === 'services') expect(definition.isPublic).toBe(false);
    }
  });
});
