/**
 * The booking sheet's flow: `hold_activity` → traveller details → Viator's payment form →
 * `book_activity`. The order's own row (synced `supplier_orders`) drives the result, so a booking
 * the operator confirms later moves from "Waiting for the operator" to "Booked" by itself.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, error codes and wire values. */
import {
  generateUuidV7,
  supplierCopy,
  type HoldActivityResult,
  type BookActivityResult,
} from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { currentAppEnvironment } from '@/data/app-session/endpoints';
import { useCommand } from '@/data/commands/use-command';

import { useLiveRows } from '../data/live-rows';
import { BookingSheet, type BookingStep, type TravellerDetails } from './BookingSheet';
import { useSupplierCopy } from './copy';
import { deviceSupplierApi, type SupplierApi } from './data/api';
import { bookActivityCommand, holdActivityCommand, releaseHoldCommand } from './data/commands';
import { usePartnerLink } from './data/use-partner-link';
import { paymentPageUrl, PaymentWebView, type PaymentResult } from './PaymentWebView';
import { clockOption } from '@/lib/i18n/formats';

const VIATOR_ON = { viator_booking: true, agoda_demand: false, klook_activity_api: false };
const ORDER_SQL = `SELECT status, supplier_booking_ref FROM supplier_orders WHERE id = ?`;
const ORDER_TABLES = ['supplier_orders'];

export interface BookParams {
  readonly tripId: string;
  readonly product: string;
  readonly title: string;
  readonly date: string;
  readonly currency: string;
  readonly stableId?: string | undefined;
}

const ORDER_STEPS: Readonly<Record<string, BookingStep>> = {
  confirmed: 'confirmed',
  rejected: 'rejected',
  pending_operator: 'pending_operator',
  hold_expired: 'hold_expired',
};

type Hold = HoldActivityResult & { readonly holdId: string };

export function BookingScreen({
  params,
  api = deviceSupplierApi,
}: {
  readonly params: BookParams;
  readonly api?: SupplierApi;
}) {
  const { t, i18n } = useLingui();
  const render = useSupplierCopy();
  const hold = useCommand(holdActivityCommand);
  const book = useCommand(bookActivityCommand);
  const release = useCommand(releaseHoldCommand);
  const openLink = usePartnerLink();
  const [step, setStep] = useState<BookingStep>('choose');
  const [travellers, setTravellers] = useState(2);
  const [details, setDetails] = useState<TravellerDetails>({
    first: '',
    last: '',
    phone: '',
    email: '',
  });
  const [current, setCurrent] = useState<Hold | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const order = useLiveRows<{ status: string; supplier_booking_ref: string | null }>(
    ORDER_SQL,
    current === null ? null : [current.holdId],
    ORDER_TABLES,
  ).rows[0];

  const time = (iso: string) =>
    i18n.date(new Date(iso), { hour: '2-digit', minute: '2-digit', ...clockOption() });
  const retryLater = t({
    id: 'suppliers.book.retry',
    message: 'That didn’t go through. Try again in a moment.',
  });

  const onHold = async () => {
    setBusy(true);
    setError(null);
    const holdId = generateUuidV7();
    const result = await hold.send({
      hold_id: holdId,
      trip_id: params.tripId,
      offer_ref: params.product,
      date: params.date,
      pax: [{ age_band: 'ADULT', count: travellers }],
      currency: params.currency,
      ...(params.stableId ? { stable_id: params.stableId } : {}),
    });
    setBusy(false);
    if (result.kind === 'applied') {
      setCurrent({ ...(result.result as HoldActivityResult), holdId });
      setStep('details');
    } else if ('code' in result && result.code === 'SUPPLIER_UNAVAILABLE') setStep('unavailable');
    else setError(retryLater);
  };

  const onPay = async () => {
    if (current === null) return;
    setBusy(true);
    setError(null);
    const session = await api.paymentSession(current.holdId);
    setBusy(false);
    if (session.kind === 'ok') {
      setPayUrl(
        paymentPageUrl(
          currentAppEnvironment(),
          current.holdId,
          session.value.payment_session_token,
        ),
      );
      setStep('paying');
    } else if (session.kind === 'error' && session.code === 'HOLD_EXPIRED') setStep('hold_expired');
    else if (session.kind === 'error' && session.code === 'SUPPLIER_UNAVAILABLE')
      setStep('unavailable');
    else setError(retryLater);
  };

  const onPaid = async (payment: PaymentResult) => {
    if (current === null) return;
    if (payment.status !== 'paid') {
      setStep('details');
      setError(
        payment.status === 'cancelled'
          ? t({
              id: 'suppliers.book.payCancelled',
              message: 'Payment cancelled. Nothing was charged.',
            })
          : t({
              id: 'suppliers.book.payFailed',
              message: 'The payment didn’t go through. Nothing was charged.',
            }),
      );
      return;
    }
    setBusy(true);
    const result = await book.send({
      hold_id: current.holdId,
      title: params.title,
      traveller_details: {
        first_name: details.first.trim(),
        last_name: details.last.trim(),
        phone: details.phone.trim(),
        ...(details.email.trim() ? { email: details.email.trim() } : {}),
      },
      payment_session_ref: payment.paymentSessionRef,
    });
    setBusy(false);
    if (result.kind === 'applied') {
      const status = (result.result as BookActivityResult).status;
      setStep(
        status === 'confirmed'
          ? 'confirmed'
          : status === 'rejected'
            ? 'rejected'
            : 'pending_operator',
      );
    } else if ('code' in result && result.code === 'HOLD_EXPIRED') setStep('hold_expired');
    else if ('code' in result && result.code === 'SUPPLIER_REJECTED') setStep('rejected');
    else {
      setStep('details');
      setError(retryLater);
    }
  };

  const onRelease = async () => {
    if (current !== null) await release.send({ hold_id: current.holdId });
    router.back();
  };

  // The order row wins once it syncs: the operator may confirm or reject after we left.
  const live: BookingStep = ORDER_STEPS[order?.status ?? ''] ?? step;
  const holding = current !== null && (live === 'details' || live === 'paying');
  const availability = current?.hold_provided
    ? 'HOLDING'
    : current?.price_held_until
      ? 'PRICE_HELD'
      : 'HOLD_NOT_PROVIDED';
  const until = current?.seats_held_until ?? current?.price_held_until ?? null;
  const holdLine = holding
    ? render(
        supplierCopy(
          {
            action: 'activity_offer',
            supplier: 'viator',
            availability,
            seats: travellers,
            ...(until ? { until: time(until) } : {}),
          },
          VIATOR_ON,
        ),
      )
    : null;
  const resultLine =
    live === 'confirmed'
      ? render(
          supplierCopy(
            {
              action: 'activity_booked',
              state: 'confirmed',
              ref: order?.supplier_booking_ref ?? '…',
            },
            VIATOR_ON,
          ),
        )
      : live === 'pending_operator'
        ? render(supplierCopy({ action: 'activity_booked', state: 'pending_operator' }, VIATOR_ON))
        : live === 'rejected'
          ? t({ id: 'suppliers.book.rejected', message: 'Viator couldn’t book it' })
          : null;

  return (
    <BookingSheet
      step={live}
      title={params.title}
      dateLabel={i18n.date(new Date(`${params.date}T12:00:00`), {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })}
      travellers={travellers}
      onTravellers={setTravellers}
      holdLine={holdLine}
      holdUntil={holding && availability !== 'HOLD_NOT_PROVIDED' ? until : null}
      onHoldExpired={() => setStep('hold_expired')}
      details={details}
      onDetails={setDetails}
      resultLine={resultLine}
      busy={busy}
      error={error}
      payment={payUrl ? <PaymentWebView url={payUrl} onResult={(r) => void onPaid(r)} /> : null}
      onHold={() => void onHold()}
      onPay={() => void onPay()}
      onRelease={() => void onRelease()}
      onOpenLink={() =>
        void openLink({
          partner: 'viator',
          tripId: params.tripId,
          target: { kind: 'activity', ref: params.product, query: params.title, date: params.date },
        })
      }
      onDone={() => router.back()}
    />
  );
}
