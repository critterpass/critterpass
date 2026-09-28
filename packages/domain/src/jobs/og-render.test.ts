import { describe, expect, it } from 'vitest';

import { generateUuidV7 } from '../ids';
import { jobPayloadRedactor, queueSpec } from './catalogue';
import { ogCardPath, ogRenderJobSchema, ogRenderSingletonKey, OG_RENDER_QUEUE } from './og-render';

describe('og.render jobs', () => {
  it('names a card by its kind and a canonical code only', () => {
    const job = ogRenderJobSchema.parse({ kind: 'invite', token: 'K7M2QX' });
    expect(ogCardPath(job)).toBe('/og/invite/K7M2QX.png');
    expect(ogRenderSingletonKey(job)).toBe('invite:K7M2QX');
    expect(ogRenderJobSchema.safeParse({ kind: 'invite', token: 'k7m2qx' }).success).toBe(false);
    // An internal id never names a card.
    expect(ogRenderJobSchema.safeParse({ kind: 'invite', token: generateUuidV7() }).success).toBe(
      false,
    );
    expect(ogRenderJobSchema.safeParse({ kind: 'plan', token: 'K7M2QX' }).success).toBe(false);
  });

  it('is catalogued and never shows a whole code in the jobs panel', () => {
    expect(queueSpec(OG_RENDER_QUEUE).policy).toBe('stately');
    expect(jobPayloadRedactor(OG_RENDER_QUEUE)({ kind: 'referral', token: 'WYNST8' })).toEqual({
      kind: 'referral',
      token: '…NST8',
    });
  });
});
