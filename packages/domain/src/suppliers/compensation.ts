/**
 * How each real-world supplier action is undone (docs/product-decisions.md, UNDO). These actions
 * are forbidden guide action kinds (`make_booking`, `contact_vendor`): the guide only drafts them
 * and a person confirms, so they never become `guide_actions` rows with a ChangeSet inverse.
 * Their undo is the person's own compensating command, which the supplier cards offer:
 *
 * - a hold is released at once (`release_activity_hold`);
 * - a booking is cancelled only after its refund quote was shown (`cancel_activity_booking`);
 * - a sent vendor message cannot be unsent: the undo is a correction the traveller approves like any
 *   other draft (`request_vendor_message`), and an unsent draft is simply superseded by it.
 */
export const SUPPLIER_ACTIONS = [
  'hold_activity',
  'book_activity',
  'request_vendor_message',
] as const;
export type SupplierAction = (typeof SUPPLIER_ACTIONS)[number];

export interface SupplierUndo {
  /** The command that compensates the action. */
  readonly command: 'release_activity_hold' | 'cancel_activity_booking' | 'request_vendor_message';
  /** Whether the person must approve what the undo does (a fee, or the correction's exact text). */
  readonly needsApproval: boolean;
  /** A read the app shows first (the cancellation quote), if any. */
  readonly showFirst: 'cancel_quote' | null;
}

export const SUPPLIER_UNDO: Readonly<Record<SupplierAction, SupplierUndo>> = {
  hold_activity: { command: 'release_activity_hold', needsApproval: false, showFirst: null },
  book_activity: {
    command: 'cancel_activity_booking',
    needsApproval: true,
    showFirst: 'cancel_quote',
  },
  request_vendor_message: {
    command: 'request_vendor_message',
    needsApproval: true,
    showFirst: null,
  },
};

/** The undo of a supplier action; `null` for anything else (no unregistered undo exists). */
export function supplierUndoFor(action: string): SupplierUndo | null {
  return (SUPPLIER_ACTIONS as readonly string[]).includes(action)
    ? SUPPLIER_UNDO[action as SupplierAction]
    : null;
}
