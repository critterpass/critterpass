/** A lateness the traveller said herself: push first when it can be made, skipping always. */
import { describe, expect, it } from '@jest/globals';

import { saidLateModel } from '../said-late-model';

describe('the running-late screen for a lateness she said herself', () => {
  it('offers push first when it can be made, and skipping always', () => {
    const facts = { title: 'Chợ Hàn', minutes: 30, start: '14:00', to: '14:30', me: 'u1' };
    const both = saidLateModel({ ...facts, canPush: true });
    expect(both.options.map((option) => option.id)).toEqual(['push', 'skip']);
    expect(both).toMatchObject({ recommended: 'push', role: 'late', lateMin: 30, eta: '14:30' });
    const skipOnly = saidLateModel({ ...facts, canPush: false });
    expect(skipOnly.options.map((option) => option.id)).toEqual(['skip']);
  });
});
