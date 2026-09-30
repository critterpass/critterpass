import { describe, expect, it } from '@jest/globals';

import { inboundAddress, inboundDomain } from '../data/inbound-domain';

describe('inboundDomain', () => {
  it('uses the production mail domain only for production builds', () => {
    expect(inboundDomain('production')).toBe('in.critterpass.app');
  });

  it('routes staging and development builds to the staging mail domain', () => {
    expect(inboundDomain('staging')).toBe('in.staging.critterpass.app');
    expect(inboundDomain('development')).toBe('in.staging.critterpass.app');
  });

  it('builds the crew forward address on the environment domain', () => {
    expect(inboundAddress('danang-crew', 'staging')).toBe('danang-crew@in.staging.critterpass.app');
    expect(inboundAddress('danang-crew', 'production')).toBe('danang-crew@in.critterpass.app');
  });
});
