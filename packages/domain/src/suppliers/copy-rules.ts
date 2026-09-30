/**
 * Truthful supplier copy (docs/product-decisions.md §5): for each designed real-world action, the
 * copy key and params the current partner switches allow. We are never the merchant of record,
 * nothing is "held" unless the supplier reported a hold, and deadlines are the real ones. Surfaces
 * render the key through their catalogue; `SUPPLIER_COPY_EN` is the English source every catalogue
 * entry must match.
 */
import { copy, defined, type SupplierCopyKey } from './copy-en';
import { AFFILIATE_DISCLOSURE_KEY } from './disclosure';
import { RIDE_FARE_COPY_KEY } from './ride-fare';
import { RIDE_COPY_KEYS } from './rides';

/** Partner switches that change copy (`ops.partner_adapters`, read server-side). */
export interface SupplierCopyFlags {
  readonly viator_booking: boolean;
  readonly agoda_demand: boolean;
  readonly klook_activity_api: boolean;
}

export const ALL_PARTNERS_OFF: SupplierCopyFlags = {
  viator_booking: false,
  agoda_demand: false,
  klook_activity_api: false,
};

/** What Viator reported for a cart hold; `null` when there is no in-app hold at all. */
export type HoldAvailability = 'HOLDING' | 'PRICE_HELD' | 'HOLD_NOT_PROVIDED' | null;

export type SupplierCopyParams = Readonly<Record<string, string | number>>;

export interface SupplierCopy {
  readonly key: SupplierCopyKey;
  readonly params: SupplierCopyParams;
}

/** Every designed action (one row of the §5 table each) and the facts its copy depends on. */
export type SupplierCopyAction =
  | {
      readonly action: 'stay_search';
      readonly count: number;
      readonly kind: string;
      readonly area: string;
    }
  | {
      readonly action: 'activity_redraft';
      readonly viatorSlot: boolean;
      readonly draftSent: boolean;
      readonly priceHeldUntil: string | null;
    }
  | { readonly action: 'lottery_entry'; readonly closes: string }
  | { readonly action: 'lottery_results'; readonly date: string }
  | { readonly action: 'stay_reply_by'; readonly date: string }
  | {
      readonly action: 'stay_cancel_line';
      readonly booked: 'none' | 'link' | 'api';
      readonly date: string;
      readonly rooms?: number;
    }
  | { readonly action: 'stay_chip'; readonly booked: boolean; readonly date: string }
  | { readonly action: 'stay_deadline'; readonly booked: boolean; readonly date: string }
  | {
      readonly action: 'stay_shortlist';
      readonly hotel: string;
      readonly price: string;
      readonly time: string;
    }
  | {
      readonly action: 'dropout';
      readonly supplier: string;
      readonly via: 'link' | 'api';
      readonly cancelled: boolean;
      readonly date?: string;
      readonly refund?: { readonly full: boolean; readonly amount: string };
    }
  | {
      readonly action: 'activity_offer';
      readonly supplier: string;
      readonly availability: HoldAvailability;
      readonly seats?: number;
      readonly until?: string;
      readonly left?: number;
    }
  | {
      readonly action: 'activity_booked';
      readonly state: 'confirmed' | 'pending_operator' | 'imported';
      readonly ref?: string;
      readonly member?: string;
      readonly supplier?: string;
    }
  | {
      readonly action: 'ticker';
      readonly guide: string;
      readonly seats: number;
      readonly what: string;
      readonly availability: HoldAvailability;
    }
  | {
      readonly action: 'vendor';
      readonly state: 'ask' | 'draft_ready' | 'sent' | 'replied';
      readonly vendor: string;
      readonly ask?: string;
      readonly time?: string;
      readonly reply?: string;
    }
  | {
      readonly action: 'ride';
      readonly state: 'transfer' | 'estimate' | 'tariff' | 'links' | 'phrase_card';
      readonly supplier?: string;
      readonly low?: string;
      readonly high?: string;
      readonly minutes?: number;
      readonly app?: string;
    }
  | { readonly action: 'clinic' }
  | {
      readonly action: 'flight_delay';
      readonly flight: string;
      readonly delay: string;
      readonly source: string;
      readonly time: string;
    }
  | {
      readonly action: 'fare_price';
      readonly price: string;
      readonly origin: string;
      readonly time: string;
    }
  | { readonly action: 'disclosure'; readonly guide: string };

/** The copy for one action under the current partner switches (pure; the §5 table in code). */
export function supplierCopy(input: SupplierCopyAction, flags: SupplierCopyFlags): SupplierCopy {
  switch (input.action) {
    case 'stay_search':
      return copy(flags.agoda_demand ? 'suppliers.stay.checked_live' : 'suppliers.stay.found', {
        count: input.count,
        kind: input.kind,
        area: input.area,
      });
    case 'activity_redraft':
      return flags.viator_booking &&
        input.viatorSlot &&
        input.draftSent &&
        input.priceHeldUntil !== null
        ? copy('suppliers.activity.price_held', { time: input.priceHeldUntil })
        : copy('suppliers.activity.found_slot');
    case 'lottery_entry':
      return copy('suppliers.lottery.entries_close', { date: input.closes });
    case 'lottery_results':
      return copy('suppliers.lottery.results', { date: input.date });
    case 'stay_reply_by':
      return copy('suppliers.stay.reply_by', { date: input.date });
    case 'stay_cancel_line':
      if (input.booked === 'api' && flags.agoda_demand && input.rooms !== undefined) {
        return copy('suppliers.stay.booked_rooms', { rooms: input.rooms, date: input.date });
      }
      return input.booked === 'none'
        ? copy('suppliers.stay.book_by', { date: input.date })
        : copy('suppliers.stay.free_cancel_until', { date: input.date });
    case 'stay_chip':
      return copy(
        input.booked ? 'suppliers.stay.chip_free_cancel' : 'suppliers.stay.chip_book_by',
        {
          date: input.date,
        },
      );
    case 'stay_deadline':
      return copy(
        input.booked ? 'suppliers.stay.free_cancel_until' : 'suppliers.stay.book_by_keep',
        {
          date: input.date,
        },
      );
    case 'stay_shortlist':
      return copy(flags.agoda_demand ? 'suppliers.stay.live_rate' : 'suppliers.stay.shortlist', {
        hotel: input.hotel,
        price: input.price,
        time: input.time,
      });
    case 'dropout':
      return dropoutCopy(input, flags);
    case 'activity_offer':
      return offerCopy(input, flags);
    case 'activity_booked':
      if (input.state === 'confirmed')
        return copy('suppliers.booked.viator_ref', defined({ ref: input.ref }));
      if (input.state === 'pending_operator') return copy('suppliers.booked.waiting_operator');
      return copy(
        'suppliers.booked.member_on',
        defined({ member: input.member, supplier: input.supplier }),
      );
    case 'ticker':
      return copy(
        flags.viator_booking && input.availability === 'HOLDING'
          ? 'suppliers.ticker.held'
          : 'suppliers.ticker.found',
        { guide: input.guide, seats: input.seats, what: input.what },
      );
    case 'vendor':
      return vendorCopy(input);
    case 'ride':
      if (input.state === 'transfer')
        return copy('suppliers.rides.transfer_booked', defined({ supplier: input.supplier }));
      if (input.state === 'estimate') {
        return copy(
          RIDE_COPY_KEYS.estimate,
          defined({ low: input.low, high: input.high, minutes: input.minutes }),
        );
      }
      if (input.state === 'tariff') {
        return copy(RIDE_FARE_COPY_KEY, defined({ low: input.low, high: input.high }));
      }
      if (input.state === 'links') return copy(RIDE_COPY_KEYS.links, defined({ app: input.app }));
      return copy(RIDE_COPY_KEYS.phraseCard);
    case 'clinic':
      return copy('suppliers.concierge.clinic');
    case 'flight_delay':
      return copy('suppliers.flight.delayed', {
        flight: input.flight,
        delay: input.delay,
        source: input.source,
        time: input.time,
      });
    case 'fare_price':
      return copy('suppliers.fares.recent', {
        price: input.price,
        origin: input.origin,
        time: input.time,
      });
    case 'disclosure':
      return copy(AFFILIATE_DISCLOSURE_KEY, { guide: input.guide });
  }
}

function dropoutCopy(
  input: Extract<SupplierCopyAction, { action: 'dropout' }>,
  flags: SupplierCopyFlags,
): SupplierCopy {
  // "Cancelled" only after the supplier confirmed the cancel; before that, the real deadline.
  if (input.cancelled && input.supplier === 'agoda' && input.via === 'api' && flags.agoda_demand) {
    return copy('suppliers.dropout.cancelled_agoda');
  }
  if (input.cancelled && input.via === 'api' && input.refund !== undefined) {
    return input.refund.full
      ? copy('suppliers.dropout.cancelled_full_refund')
      : copy('suppliers.dropout.cancelled_refund', { amount: input.refund.amount });
  }
  return copy(
    'suppliers.dropout.cancel_by',
    defined({ supplier: input.supplier, date: input.date }),
  );
}

function offerCopy(
  input: Extract<SupplierCopyAction, { action: 'activity_offer' }>,
  flags: SupplierCopyFlags,
): SupplierCopy {
  if (input.supplier === 'viator' && flags.viator_booking && input.availability !== null) {
    if (
      input.availability === 'HOLDING' &&
      input.seats !== undefined &&
      input.until !== undefined
    ) {
      return copy('suppliers.offer.seats_held', { seats: input.seats, time: input.until });
    }
    if (input.availability === 'PRICE_HELD' && input.until !== undefined) {
      return copy('suppliers.offer.price_held', { time: input.until });
    }
    return copy('suppliers.offer.book_now_not_held');
  }
  if (input.supplier === 'klook' && flags.klook_activity_api && input.left !== undefined) {
    return copy('suppliers.offer.book_klook_left', { left: input.left });
  }
  return copy('suppliers.offer.open_link', { supplier: input.supplier });
}

function vendorCopy(input: Extract<SupplierCopyAction, { action: 'vendor' }>): SupplierCopy {
  // Never "table held": the vendor's own reply is the only confirmation.
  switch (input.state) {
    case 'ask':
      return copy('suppliers.vendor.ask', defined({ vendor: input.vendor, ask: input.ask }));
    case 'draft_ready':
      return copy('suppliers.vendor.draft_ready');
    case 'sent':
      return copy('suppliers.vendor.sent_waiting', defined({ time: input.time }));
    case 'replied':
      return copy(
        'suppliers.vendor.replied',
        defined({ vendor: input.vendor, reply: input.reply }),
      );
  }
}
