import { describe, expect, it } from 'vitest';

import { loadPosthogConfig } from './posthog-apply';

describe('posthog config', () => {
  it('uses only catalog events and properties', () => {
    const config = loadPosthogConfig();
    expect(config.insights.map((insight) => insight.key)).toEqual(
      expect.arrayContaining([
        'acquisition-funnel',
        'invite-time-to-issue',
        'ai-cost-per-trip',
        'monetise-funnel',
      ]),
    );
  });
});
