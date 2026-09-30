/**
 * The catalogue entry for every truthful supplier copy key (`supplierCopy` in @cp/domain), and a
 * hook that renders a `{key, params}` in the reader's language. Catalogue ids are the keys in
 * camelCase; the English messages must equal `SUPPLIER_COPY_EN`, and a test holds them together.
 */
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useCallback } from 'react';

import type { SupplierCopy, SupplierCopyKey } from '@cp/domain';
import type { MessageDescriptor } from '@lingui/core';

export const SUPPLIER_COPY_MESSAGES: Readonly<Record<SupplierCopyKey, MessageDescriptor>> = {
  'suppliers.stay.found': msg({
    id: 'suppliers.stay.found',
    message: 'Found {count} free-cancel {kind} in {area}',
  }),
  'suppliers.stay.checked_live': msg({
    id: 'suppliers.stay.checkedLive',
    message: 'Checked live rooms at {count} {area} {kind}, free cancel',
  }),
  'suppliers.activity.found_slot': msg({
    id: 'suppliers.activity.foundSlot',
    message: "Found a free-cancel slot. Book it once the crew's in.",
  }),
  'suppliers.activity.price_held': msg({
    id: 'suppliers.activity.priceHeld',
    message: 'Price held until {time}',
  }),
  'suppliers.lottery.entries_close': msg({
    id: 'suppliers.lottery.entriesClose',
    message: "Entries close {date}. Each of you enters on the official site — I'll remind you.",
  }),
  'suppliers.lottery.results': msg({
    id: 'suppliers.lottery.results',
    message: 'results {date} · reminder set',
  }),
  'suppliers.stay.reply_by': msg({ id: 'suppliers.stay.replyBy', message: 'Reply by {date}' }),
  'suppliers.stay.booked_rooms': msg({
    id: 'suppliers.stay.bookedRooms',
    message: 'Booked {rooms} rooms, free cancellation until {date}',
  }),
  'suppliers.stay.free_cancel_until': msg({
    id: 'suppliers.stay.freeCancelUntil',
    message: 'Free cancellation until {date}',
  }),
  'suppliers.stay.book_by': msg({
    id: 'suppliers.stay.bookBy',
    message: 'Book by {date} for free cancellation',
  }),
  'suppliers.stay.book_by_keep': msg({
    id: 'suppliers.stay.bookByKeep',
    message: 'Book by {date} to keep free cancellation',
  }),
  'suppliers.stay.chip_free_cancel': msg({
    id: 'suppliers.stay.chipFreeCancel',
    message: 'FREE CANCEL TO {date}',
  }),
  'suppliers.stay.chip_book_by': msg({
    id: 'suppliers.stay.chipBookBy',
    message: 'BOOK BY {date}',
  }),
  'suppliers.stay.shortlist': msg({
    id: 'suppliers.stay.shortlist',
    message: 'Free-cancel rooms at {hotel} on Agoda, from ~{price} a night (seen {time})',
  }),
  'suppliers.stay.live_rate': msg({
    id: 'suppliers.stay.liveRate',
    message: 'Free-cancel rooms at {hotel} on Agoda, {price} a night (checked live {time})',
  }),
  'suppliers.dropout.cancel_by': msg({
    id: 'suppliers.dropout.cancelBy',
    message: 'Cancel on {supplier} by {date} to avoid the fee',
  }),
  'suppliers.dropout.cancelled_full_refund': msg({
    id: 'suppliers.dropout.cancelledFullRefund',
    message: 'Cancelled · full refund',
  }),
  'suppliers.dropout.cancelled_refund': msg({
    id: 'suppliers.dropout.cancelledRefund',
    message: 'Cancelled · {amount} refunded',
  }),
  'suppliers.dropout.cancelled_agoda': msg({
    id: 'suppliers.dropout.cancelledAgoda',
    message: 'Cancelled on Agoda · refund per policy',
  }),
  'suppliers.offer.seats_held': msg({
    id: 'suppliers.offer.seatsHeld',
    message: '{seats} seats held until {time}',
  }),
  'suppliers.offer.price_held': msg({
    id: 'suppliers.offer.priceHeld',
    message: 'Price held until {time}',
  }),
  'suppliers.offer.book_now_not_held': msg({
    id: 'suppliers.offer.bookNowNotHeld',
    message: 'Book now · seats not held',
  }),
  'suppliers.offer.book_klook_left': msg({
    id: 'suppliers.offer.bookKlookLeft',
    message: 'Book on Klook · {left} left',
  }),
  'suppliers.offer.open_link': msg({ id: 'suppliers.offer.openLink', message: 'Open {supplier}' }),
  'suppliers.booked.viator_ref': msg({
    id: 'suppliers.booked.viatorRef',
    message: 'Booked · Viator ref {ref}',
  }),
  'suppliers.booked.waiting_operator': msg({
    id: 'suppliers.booked.waitingOperator',
    message: 'Waiting for the operator',
  }),
  'suppliers.booked.member_on': msg({
    id: 'suppliers.booked.memberOn',
    message: '{member} booked it on {supplier}',
  }),
  'suppliers.ticker.held': msg({
    id: 'suppliers.ticker.held',
    message: '{guide} held {seats} {what}',
  }),
  'suppliers.ticker.found': msg({
    id: 'suppliers.ticker.found',
    message: '{guide} found {seats} {what}',
  }),
  'suppliers.vendor.ask': msg({
    id: 'suppliers.vendor.ask',
    message: "Ask {vendor} to {ask}? I'll draft the WhatsApp.",
  }),
  'suppliers.vendor.draft_ready': msg({
    id: 'suppliers.vendor.draftReady',
    message: 'Draft ready — send?',
  }),
  'suppliers.vendor.sent_waiting': msg({
    id: 'suppliers.vendor.sentWaiting',
    message: 'Sent {time}, waiting',
  }),
  'suppliers.vendor.replied': msg({
    id: 'suppliers.vendor.replied',
    message: '{vendor} replied: {reply}',
  }),
  'suppliers.rides.transfer_booked': msg({
    id: 'suppliers.rides.transferBooked',
    message:
      'Airport pickup booked on {supplier} (from your email) · driver details from your voucher',
  }),
  'suppliers.rides.grab_estimate': msg({
    id: 'suppliers.rides.grabEstimate',
    message: 'Grab estimates {low}–{high}, about {minutes} min away',
  }),
  'suppliers.rides.tariff_estimate': msg({
    id: 'suppliers.rides.tariffEstimate',
    message: 'About {low}–{high} · estimate',
  }),
  'suppliers.rides.open_app': msg({ id: 'suppliers.rides.openApp', message: 'Open {app}' }),
  'suppliers.rides.phrase_card': msg({
    id: 'suppliers.rides.phraseCard',
    message: 'Show this to the driver',
  }),
  'suppliers.concierge.clinic': msg({
    id: 'suppliers.concierge.clinic',
    message: 'Ops desk is calling the clinic with you — share insurance details?',
  }),
  'suppliers.flight.delayed': msg({
    id: 'suppliers.flight.delayed',
    message: "{flight} delayed {delay} ({source}, {time}). Here's what I'd change",
  }),
  'suppliers.fares.recent': msg({
    id: 'suppliers.fares.recent',
    message: '~{price} from {origin} (recent searches, {time})',
  }),
  'suppliers.disclosure.affiliate': msg({
    id: 'suppliers.disclosure.affiliate',
    message: 'We may earn a commission. It never changes what {guide} recommends.',
  }),
};

/** Renders a supplier copy in the active language. */
export function useSupplierCopy(): (copy: SupplierCopy) => string {
  const { i18n } = useLingui();
  return useCallback(
    (copy: SupplierCopy) => i18n._({ ...SUPPLIER_COPY_MESSAGES[copy.key], values: copy.params }),
    [i18n],
  );
}
