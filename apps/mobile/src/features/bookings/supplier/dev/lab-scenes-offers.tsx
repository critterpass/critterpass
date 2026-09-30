/** Supplier lab scenes: offer cards (6f-1), the Viator booking sheet and the cancel sheet. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { supplierCopy, type HoldAvailability } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { BookingSheet, type BookingSheetProps } from '../BookingSheet';
import { CancelSheetView, type CancelState } from '../CancelSheet';
import { useSupplierCopy } from '../copy';
import type { WireOffer } from '../data/api';
import type { PartnerLinkOutcome } from '../data/partner-link';
import { OffersView } from '../OffersView';
import { ACTIVITY_LINK_PARTNERS } from '../suppliers';
import { LabSheet, type LabSheetKind } from './lab-sheet';
import { useOfferCards } from '../use-offer-cards';

const noop = () => undefined;
const soon = () => new Date(Date.now() + 14 * 60_000 + 20_000).toISOString();

const NAME = 'Mount Batur sunrise trek';

const LIVE_OFFERS: readonly WireOffer[] = [
  {
    supplier: 'viator',
    productCode: '5510BATUR',
    title: 'Mount Batur Sunrise Trekking with Breakfast in the Crater',
    description: 'Pickup from Ubud hotels between 02:00 and 02:30. Small group, max 12.',
    priceFrom: { amount: 42.5, currency: 'USD' },
    holdSupported: true,
    productUrl: null,
    seenAt: '2026-10-16T01:10:00Z',
  },
  {
    supplier: 'viator',
    productCode: '7781JEEP',
    title: 'Private Batur Jeep Sunrise Tour with Black Lava Stop',
    description: 'Private jeep for up to 6 people.',
    priceFrom: { amount: 85, currency: 'USD' },
    holdSupported: false,
    productUrl: null,
    seenAt: '2026-10-16T01:10:00Z',
  },
];

function OffersScene({
  mode,
  outcome,
}: {
  readonly mode: 'links' | 'live' | 'loading' | 'offline';
  readonly outcome?: PartnerLinkOutcome;
}) {
  const cards = useOfferCards();
  const links = ACTIVITY_LINK_PARTNERS.map((partner, index) =>
    cards.linkCard({
      partner,
      name: NAME,
      pending: false,
      outcome: index === 0 ? outcome : undefined,
      onOpen: noop,
    }),
  );
  const live = LIVE_OFFERS.map((offer, index) =>
    cards.offerCard({
      offer,
      note:
        index === 0
          ? {
              guide: 'tokek',
              name: 'Tokek',
              line: 'Fits Day 4. Early, but the crater at dawn is worth it.',
            }
          : undefined,
      onBook: noop,
    }),
  );
  return (
    <OffersView
      title={NAME}
      guide="Tokek"
      loading={mode === 'loading'}
      cards={mode === 'live' ? live : mode === 'loading' ? [] : links}
      notice={cards.notice(mode === 'offline' ? 'offline' : null)}
    />
  );
}

/** The booking sheet with its lines from the copy rules, as the screen builds them. */
function BookScene(
  props: Partial<BookingSheetProps> & {
    readonly hold?: HoldAvailability;
    readonly result?: 'confirmed' | 'pending_operator';
  },
) {
  const render = useSupplierCopy();
  const { t } = useLingui();
  const on = { viator_booking: true, agoda_demand: false, klook_activity_api: false };
  const holdLine =
    props.hold === undefined
      ? null
      : render(
          supplierCopy(
            {
              action: 'activity_offer',
              supplier: 'viator',
              availability: props.hold,
              seats: 4,
              until: '14:20',
            },
            on,
          ),
        );
  const resultLine =
    props.result === 'confirmed'
      ? render(
          supplierCopy({ action: 'activity_booked', state: 'confirmed', ref: 'BR-1180223' }, on),
        )
      : props.result === 'pending_operator'
        ? render(supplierCopy({ action: 'activity_booked', state: 'pending_operator' }, on))
        : props.step === 'rejected'
          ? t({ id: 'suppliers.book.rejected', message: 'Viator couldn’t book it' })
          : null;
  return sheet(
    <BookingSheet
      {...BOOK}
      {...props}
      holdLine={holdLine}
      holdUntil={props.hold === 'HOLDING' || props.hold === 'PRICE_HELD' ? soon() : null}
      resultLine={resultLine}
    />,
    'book',
  );
}

function sheet(children: ReactNode, kind: LabSheetKind) {
  return <LabSheet kind={kind}>{children}</LabSheet>;
}

const BOOK: BookingSheetProps = {
  step: 'choose',
  title: 'Mount Batur Sunrise Trekking with Breakfast in the Crater',
  dateLabel: 'Thu, 16 Oct',
  travellers: 4,
  onTravellers: noop,
  holdLine: null,
  holdUntil: null,
  onHoldExpired: noop,
  details: { first: 'Rin', last: 'Tanaka', phone: '+65 8123 4567', email: '' },
  onDetails: noop,
  resultLine: null,
  busy: false,
  error: null,
  onHold: noop,
  onPay: noop,
  onRelease: noop,
  onOpenLink: noop,
  onDone: noop,
};

function BookFailedScene() {
  const { t } = useLingui();
  return (
    <BookScene
      step="details"
      hold="HOLD_NOT_PROVIDED"
      error={t({
        id: 'suppliers.book.payFailed',
        message: 'The payment didn’t go through. Nothing was charged.',
      })}
    />
  );
}

const QUOTE = {
  cancellable: true,
  refund: { amount_minor: 17000, currency: 'USD' },
  refund_percentage: 100,
  quoted_at: new Date().toISOString(),
};
const cancel = (state: CancelState) => () =>
  sheet(
    <CancelSheetView
      title="Mount Batur Sunrise Trekking with Breakfast in the Crater"
      state={state}
      busy={false}
      failed={false}
      onCancel={noop}
      onKeep={noop}
      onRetry={noop}
    />,
    'cancel',
  );

export const OFFER_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'offers-links': () => <OffersScene mode="links" />,
  'offers-live': () => <OffersScene mode="live" />,
  'offers-loading': () => <OffersScene mode="loading" />,
  'offers-offline': () => <OffersScene mode="offline" />,
  'offers-partner-off': () => <OffersScene mode="links" outcome="unavailable" />,
  'book-choose': () => <BookScene />,
  'book-seats-held': () => <BookScene step="details" hold="HOLDING" />,
  'book-price-held': () => <BookScene step="details" hold="PRICE_HELD" />,
  'book-not-held': () => <BookScene step="details" hold="HOLD_NOT_PROVIDED" />,
  'book-payment-failed': () => <BookFailedScene />,
  'book-pending': () => <BookScene step="pending_operator" result="pending_operator" />,
  'book-confirmed': () => <BookScene step="confirmed" result="confirmed" />,
  'book-rejected': () => <BookScene step="rejected" />,
  'book-expired': () => <BookScene step="hold_expired" />,
  'book-unavailable': () => <BookScene step="unavailable" />,
  'cancel-quote': cancel({ kind: 'quote', quote: QUOTE }),
  'cancel-not-cancellable': cancel({ kind: 'quote', quote: { ...QUOTE, cancellable: false } }),
  'cancel-done': cancel({ kind: 'cancelled', quote: QUOTE }),
  'cancel-offline': cancel({ kind: 'error', offline: true }),
};
