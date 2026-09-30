import { describe, expect, it } from 'vitest';

import {
  AFFILIATE_DISCLOSURE_EN,
  renderSupplierCopyEn,
  SUPPLIER_COPY_EN,
  supplierCopy,
  type HoldAvailability,
  type SupplierCopyAction,
  type SupplierCopyFlags,
} from '../../src/suppliers';

const BOOLS = [false, true] as const;
const FLAG_STATES: SupplierCopyFlags[] = BOOLS.flatMap((viator_booking) =>
  BOOLS.flatMap((agoda_demand) =>
    BOOLS.map((klook_activity_api) => ({ viator_booking, agoda_demand, klook_activity_api })),
  ),
);
const HOLDS: HoldAvailability[] = ['HOLDING', 'PRICE_HELD', 'HOLD_NOT_PROVIDED', null];
const DATE = 'Sep 30';

/** Every §5 row with every state its copy depends on. */
const ACTIONS: SupplierCopyAction[] = [
  { action: 'stay_search', count: 2, kind: 'ryokans', area: 'Gion' },
  ...BOOLS.flatMap((viatorSlot) =>
    BOOLS.flatMap((draftSent) =>
      ['14:00', null].map((priceHeldUntil) => ({
        action: 'activity_redraft' as const,
        viatorSlot,
        draftSent,
        priceHeldUntil,
      })),
    ),
  ),
  { action: 'lottery_entry', closes: DATE },
  { action: 'lottery_results', date: 'Mar 1' },
  { action: 'stay_reply_by', date: DATE },
  ...(['none', 'link', 'api'] as const).map((booked) => ({
    action: 'stay_cancel_line' as const,
    booked,
    date: DATE,
    rooms: 3,
  })),
  ...BOOLS.flatMap((booked) => [
    { action: 'stay_chip' as const, booked, date: DATE },
    { action: 'stay_deadline' as const, booked, date: DATE },
  ]),
  { action: 'stay_shortlist', hotel: 'Hoshinoya', price: '$240', time: '09:10' },
  ...(['agoda', 'viator'] as const).flatMap((supplier) =>
    (['link', 'api'] as const).flatMap((via) =>
      BOOLS.flatMap((cancelled) =>
        BOOLS.map((full) => ({
          action: 'dropout' as const,
          supplier,
          via,
          cancelled,
          date: DATE,
          refund: { full, amount: 'US$40' },
        })),
      ),
    ),
  ),
  ...(['viator', 'klook', 'gyg'] as const).flatMap((supplier) =>
    HOLDS.map((availability) => ({
      action: 'activity_offer' as const,
      supplier,
      availability,
      seats: 4,
      until: '14:20',
      left: 5,
    })),
  ),
  ...(['confirmed', 'pending_operator', 'imported'] as const).map((state) => ({
    action: 'activity_booked' as const,
    state,
    ref: 'BR-1',
    member: 'Rin',
    supplier: 'Klook',
  })),
  ...HOLDS.map((availability) => ({
    action: 'ticker' as const,
    guide: 'Tokek',
    seats: 6,
    what: 'boat seats',
    availability,
  })),
  ...(['ask', 'draft_ready', 'sent', 'replied'] as const).map((state) => ({
    action: 'vendor' as const,
    state,
    vendor: 'Locavore',
    ask: 'hold a table for 6 until 21:00',
    time: '10:45',
    reply: 'yes',
  })),
  ...(['transfer', 'estimate', 'links', 'phrase_card'] as const).map((state) => ({
    action: 'ride' as const,
    state,
    supplier: 'Klook',
    low: 'Rp 90k',
    high: 'Rp 120k',
    minutes: 4,
    app: 'Grab',
  })),
  { action: 'clinic' },
  { action: 'flight_delay', flight: 'SQ 938', delay: '2h10', source: 'AeroDataBox', time: '08:12' },
  { action: 'fare_price', price: '$520', origin: 'SIN', time: '09:00' },
  { action: 'disclosure', guide: 'Pon' },
];

/** The supplier reported a hold this copy may speak of (and Viator booking is on). */
function reportsHold(action: SupplierCopyAction, flags: SupplierCopyFlags): boolean {
  if (!flags.viator_booking) return false;
  if (action.action === 'activity_offer') {
    return (
      action.supplier === 'viator' && ['HOLDING', 'PRICE_HELD'].includes(action.availability ?? '')
    );
  }
  if (action.action === 'ticker') return action.availability === 'HOLDING';
  if (action.action === 'activity_redraft') return action.priceHeldUntil !== null;
  return false;
}

describe('supplier copy rules', () => {
  const cases = FLAG_STATES.flatMap((flags) => ACTIONS.map((action) => ({ flags, action })));

  it('never says "held" unless the supplier reported a hold', () => {
    for (const { flags, action } of cases) {
      const text = renderSupplierCopyEn(supplierCopy(action, flags));
      if (/(?<!not )\bheld\b/iu.test(text))
        expect({ action, flags, text, hold: reportsHold(action, flags) }).toMatchObject({
          hold: true,
        });
      if (/seats held/iu.test(text)) {
        expect(action).toMatchObject({ availability: 'HOLDING' });
      }
    }
  });

  it('never claims we booked, sent or rebooked on anyone’s behalf', () => {
    for (const { flags, action } of cases) {
      const text = renderSupplierCopyEn(supplierCopy(action, flags));
      expect(text).not.toMatch(
        /\b(I|we) (booked|entered|rebooked)\b|booked by|table held|rooms held/iu,
      );
    }
  });

  it('fills every placeholder for every row and flag state', () => {
    for (const { flags, action } of cases) {
      expect(renderSupplierCopyEn(supplierCopy(action, flags))).not.toMatch(/\{\w+\}/u);
    }
  });

  it('switches copy mode by flag alone', () => {
    const shortlist = { action: 'stay_shortlist', hotel: 'H', price: '$1', time: 't' } as const;
    expect(supplierCopy(shortlist, { ...FLAG_STATES[0]!, agoda_demand: false }).key).toBe(
      'suppliers.stay.shortlist',
    );
    expect(supplierCopy(shortlist, { ...FLAG_STATES[0]!, agoda_demand: true }).key).toBe(
      'suppliers.stay.live_rate',
    );
    const offer = {
      action: 'activity_offer',
      supplier: 'viator',
      availability: 'HOLDING',
      seats: 4,
      until: '14:20',
    } as const;
    const off = { viator_booking: false, agoda_demand: false, klook_activity_api: false };
    expect(renderSupplierCopyEn(supplierCopy(offer, off))).toBe('Open viator');
    expect(renderSupplierCopyEn(supplierCopy(offer, { ...off, viator_booking: true }))).toBe(
      '4 seats held until 14:20',
    );
    expect(
      renderSupplierCopyEn(
        supplierCopy(
          { ...offer, availability: 'HOLD_NOT_PROVIDED' },
          { ...off, viator_booking: true },
        ),
      ),
    ).toBe('Book now · seats not held');
  });

  it('says "cancelled" only after the supplier confirmed it', () => {
    const base = { action: 'dropout', supplier: 'viator', via: 'api', date: DATE } as const;
    const flags = { viator_booking: true, agoda_demand: false, klook_activity_api: false };
    expect(renderSupplierCopyEn(supplierCopy({ ...base, cancelled: false }, flags))).toBe(
      'Cancel on viator by Sep 30 to avoid the fee',
    );
    expect(
      renderSupplierCopyEn(
        supplierCopy({ ...base, cancelled: true, refund: { full: true, amount: 'x' } }, flags),
      ),
    ).toBe('Cancelled · full refund');
  });

  it('keeps the disclosure text the api names', () => {
    const text = renderSupplierCopyEn(
      supplierCopy({ action: 'disclosure', guide: 'Pon' }, FLAG_STATES[0]!),
    );
    expect(text).toBe(AFFILIATE_DISCLOSURE_EN);
  });

  it('has an English source for every key it can return', () => {
    const keys = new Set(cases.map(({ flags, action }) => supplierCopy(action, flags).key));
    for (const key of keys) expect(SUPPLIER_COPY_EN[key]).toBeTypeOf('string');
    expect(keys.size).toBe(Object.keys(SUPPLIER_COPY_EN).length);
  });
});
