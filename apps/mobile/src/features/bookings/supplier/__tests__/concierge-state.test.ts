/**
 * The ops desk card never offers insurance outside a clinic call or without a policy on file, and
 * outside staffed hours it only says when the desk answers.
 */
import { describe, expect, it } from '@jest/globals';

import { conciergeState } from '../concierge-state';

const policy = (consented: boolean) => ({ on_file: true, consented });

describe('conciergeState', () => {
  it('says when the desk answers while it is closed, whatever the request', () => {
    expect(conciergeState({ kind: 'clinic', desk_open: false, insurance: policy(false) })).toBe(
      'closed',
    );
    expect(conciergeState({ kind: 'vendor', desk_open: false, insurance: null })).toBe('closed');
  });

  it('offers to share insurance only on a clinic call with an unshared policy on file', () => {
    expect(conciergeState({ kind: 'clinic', desk_open: true, insurance: policy(false) })).toBe(
      'clinic_share',
    );
    expect(conciergeState({ kind: 'clinic', desk_open: true, insurance: policy(true) })).toBe(
      'clinic_shared',
    );
    expect(
      conciergeState({
        kind: 'clinic',
        desk_open: true,
        insurance: { on_file: false, consented: true },
      }),
    ).toBe('clinic');
    expect(conciergeState({ kind: 'clinic', desk_open: true, insurance: null })).toBe('clinic');
  });

  it('says a person picks up anything other than a clinic call', () => {
    expect(conciergeState({ kind: 'other', desk_open: true, insurance: policy(false) })).toBe(
      'picked_up',
    );
  });
});
