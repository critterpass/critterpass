/**
 * The English source of every supplier copy key (docs/product-decisions.md §5). Catalogue entries
 * for these ids must match it; `supplierCopy` picks the key.
 */
import { AFFILIATE_DISCLOSURE_KEY } from './disclosure';
import { RIDE_COPY_KEYS } from './rides';

import type { SupplierCopy } from './copy-rules';

export const SUPPLIER_COPY_EN = {
  'suppliers.stay.found': 'Found {count} free-cancel {kind} in {area}',
  'suppliers.stay.checked_live': 'Checked live rooms at {count} {area} {kind}, free cancel',
  'suppliers.activity.found_slot': "Found a free-cancel slot. Book it once the crew's in.",
  'suppliers.activity.price_held': 'Price held until {time}',
  'suppliers.lottery.entries_close':
    "Entries close {date}. Each of you enters on the official site — I'll remind you.",
  'suppliers.lottery.results': 'results {date} · reminder set',
  'suppliers.stay.reply_by': 'Reply by {date}',
  'suppliers.stay.booked_rooms': 'Booked {rooms} rooms, free cancellation until {date}',
  'suppliers.stay.free_cancel_until': 'Free cancellation until {date}',
  'suppliers.stay.book_by': 'Book by {date} for free cancellation',
  'suppliers.stay.book_by_keep': 'Book by {date} to keep free cancellation',
  'suppliers.stay.chip_free_cancel': 'FREE CANCEL TO {date}',
  'suppliers.stay.chip_book_by': 'BOOK BY {date}',
  'suppliers.stay.shortlist':
    'Free-cancel rooms at {hotel} on Agoda, from ~{price} a night (seen {time})',
  'suppliers.stay.live_rate':
    'Free-cancel rooms at {hotel} on Agoda, {price} a night (checked live {time})',
  'suppliers.dropout.cancel_by': 'Cancel on {supplier} by {date} to avoid the fee',
  'suppliers.dropout.cancelled_full_refund': 'Cancelled · full refund',
  'suppliers.dropout.cancelled_refund': 'Cancelled · {amount} refunded',
  'suppliers.dropout.cancelled_agoda': 'Cancelled on Agoda · refund per policy',
  'suppliers.offer.seats_held': '{seats} seats held until {time}',
  'suppliers.offer.price_held': 'Price held until {time}',
  'suppliers.offer.book_now_not_held': 'Book now · seats not held',
  'suppliers.offer.book_klook_left': 'Book on Klook · {left} left',
  'suppliers.offer.open_link': 'Open {supplier}',
  'suppliers.booked.viator_ref': 'Booked · Viator ref {ref}',
  'suppliers.booked.waiting_operator': 'Waiting for the operator',
  'suppliers.booked.member_on': '{member} booked it on {supplier}',
  'suppliers.ticker.held': '{guide} held {seats} {what}',
  'suppliers.ticker.found': '{guide} found {seats} {what}',
  'suppliers.vendor.ask': "Ask {vendor} to {ask}? I'll draft the WhatsApp.",
  'suppliers.vendor.draft_ready': 'Draft ready — send?',
  'suppliers.vendor.sent_waiting': 'Sent {time}, waiting',
  'suppliers.vendor.replied': '{vendor} replied: {reply}',
  'suppliers.rides.transfer_booked':
    'Airport pickup booked on {supplier} (from your email) · driver details from your voucher',
  [RIDE_COPY_KEYS.estimate]: 'Grab estimates {low}–{high}, about {minutes} min away',
  [RIDE_COPY_KEYS.links]: 'Open {app}',
  [RIDE_COPY_KEYS.phraseCard]: 'Show this to the driver',
  'suppliers.concierge.clinic':
    'Ops desk is calling the clinic with you — share insurance details?',
  'suppliers.flight.delayed': "{flight} delayed {delay} ({source}, {time}). Here's what I'd change",
  'suppliers.fares.recent': '~{price} from {origin} (recent searches, {time})',
  [AFFILIATE_DISCLOSURE_KEY]: 'We may earn a commission. It never changes what {guide} recommends.',
} as const;

export type SupplierCopyKey = keyof typeof SUPPLIER_COPY_EN;

/** The English text for a copy (`{name}` placeholders filled), for tests and server logs. */
export function renderSupplierCopyEn(value: SupplierCopy): string {
  return SUPPLIER_COPY_EN[value.key].replace(/\{(\w+)\}/gu, (match, name: string) => {
    const param = value.params[name];
    return param === undefined ? match : String(param);
  });
}
