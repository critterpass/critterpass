import { describe, expect, it } from 'vitest';

import { supplierUndoFor } from '../../src/suppliers/compensation';

describe('supplier undo', () => {
  it('releases a hold at once, cancels a booking only after its quote, and corrects a message by approval', () => {
    expect(supplierUndoFor('hold_activity')).toEqual({
      command: 'release_activity_hold',
      needsApproval: false,
      showFirst: null,
    });
    expect(supplierUndoFor('book_activity')).toEqual({
      command: 'cancel_activity_booking',
      needsApproval: true,
      showFirst: 'cancel_quote',
    });
    expect(supplierUndoFor('request_vendor_message')?.needsApproval).toBe(true);
  });

  it('knows no undo for anything else', () => {
    expect(supplierUndoFor('make_booking')).toBeNull();
    expect(supplierUndoFor('send_vendor_message')).toBeNull();
  });
});
