/**
 * The acquisition funnel splits attributed installs by `install_attributed.via`. These checks keep
 * that split whole: every way the server attributes an install is a value the analytics event
 * accepts, every claim source lands on its own value, and the growth dashboard counts the steps in
 * the order the deep-link QA runbook reads them.
 */
import { readFileSync } from 'node:fs';

import {
  ATTRIBUTION_VIAS,
  getAnalyticsEventSchema,
  type AttributionVia,
  type ClaimAttributionPayload,
} from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { readClaimSource, type LinkResolverConfig } from '../../src/links/resolver';

const config: LinkResolverConfig = { env: 'production', seatKeys: {} };
const installAttributed = getAnalyticsEventSchema('install_attributed');

/** One claim per source the app sends; `phone` has no link and is matched server-side. */
const CLAIMS: ReadonlyArray<readonly [ClaimAttributionPayload, AttributionVia]> = [
  [
    { install_referrer: `utm_source=critterpass&cp_link=${encodeURIComponent('/i/K7M2QX')}` },
    'referrer',
  ],
  [{ pasted_url: 'https://go.critterpass.app/i/K7M2QX?c=imsg' }, 'paste'],
  [{ opened_url: 'https://critterpass.app/i/K7M2QX' }, 'link'],
  [{ clip_url: 'https://critterpass.app/i/K7M2QX?c=wa' }, 'clip'],
  [{ join_code: 'k7m-2qx' }, 'code'],
];

describe('install attribution funnel', () => {
  it('accepts every server attribution on the install_attributed event, and nothing else', () => {
    for (const via of ATTRIBUTION_VIAS) {
      expect(installAttributed.safeParse({ via }).success, via).toBe(true);
    }
    expect(installAttributed.safeParse({ via: 'fingerprint' }).success).toBe(false);
  });

  it('lands each claim source on its own via, so the split has one slice per channel', () => {
    const seen = CLAIMS.map(([payload, via]) => {
      expect(readClaimSource(payload, config)?.via).toBe(via);
      return via;
    });
    // A phone match carries no link: the source reads as none and the server matches the seat.
    expect(readClaimSource({ phone: true }, config)).toBeNull();
    expect(new Set([...seen, 'phone'])).toEqual(new Set(ATTRIBUTION_VIAS));
  });

  it('counts link opens, then attributed installs, then passes on the growth dashboard', () => {
    const insights = JSON.parse(
      readFileSync(
        new URL('../../../../infra/monitoring/posthog/insights.json', import.meta.url),
        'utf8',
      ),
    ) as Array<{ key: string; query: { source: { series: Array<{ event: string }> } } }>;
    const funnel = insights.find((insight) => insight.key === 'acquisition-funnel');
    const steps = funnel?.query.source.series.map((step) => step.event) ?? [];
    expect(steps.slice(0, 3)).toEqual(['link_clicked', 'install_attributed', 'pass_issued']);
  });
});
