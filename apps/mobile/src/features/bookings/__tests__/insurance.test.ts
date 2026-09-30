import { describe, expect, it } from '@jest/globals';

import { LAB_POLICY } from '../dev/lab-fixtures';
import { assistancePhoneFrom, pickPolicy, policyNumberFrom } from '../insurance/insurance-data';

describe('insurance scan', () => {
  it('fills the policy number and the assistance line from what the scan read', () => {
    const lines = [
      'Chubb Travel Insurance',
      'Certificate of insurance',
      'Policy No.: chb-2231-889',
      'Insured: Winston Tan',
      '24h Emergency Assistance: +65 6812 3456',
    ];
    expect(policyNumberFrom(lines)).toBe('CHB-2231-889');
    expect(assistancePhoneFrom(lines)).toBe('+65 6812 3456');
    expect(policyNumberFrom(['Nothing here'])).toBeNull();
    expect(assistancePhoneFrom(['Call us +65 6812 3456'])).toBeNull();
  });
});

describe('policy pick', () => {
  it("takes the trip's policy, else one without a trip, else the newest", () => {
    const loose = { ...LAB_POLICY, policy_id: 'p-any', trip_id: null };
    const other = { ...LAB_POLICY, policy_id: 'p-other', trip_id: 't-other' };
    expect(pickPolicy([other, loose, LAB_POLICY], 't-bali')?.policy_id).toBe('p-chubb');
    expect(pickPolicy([other, loose], 't-bali')?.policy_id).toBe('p-any');
    expect(pickPolicy([other], 't-bali')?.policy_id).toBe('p-other');
    expect(pickPolicy([], 't-bali')).toBeNull();
  });
});
