/**
 * Cancelling a booked activity, for any sheet: the partner's quote (refund and fee) is read first,
 * then `cancel_booking` runs only on a quote that was shown. Retry reads the quote again.
 */
import type { ActivityCancelQuote } from '@cp/domain';
import { useEffect, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { deviceSupplierApi, type SupplierApi } from './data/api';
import { cancelBookingCommand } from './data/commands';

export type CancelState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'quote'; readonly quote: ActivityCancelQuote }
  | { readonly kind: 'cancelled'; readonly quote: ActivityCancelQuote }
  | { readonly kind: 'error'; readonly offline: boolean };

export function useCancelBooking(bookingId: string, api: SupplierApi = deviceSupplierApi) {
  const cancel = useCommand(cancelBookingCommand);
  const [state, setState] = useState<CancelState>({ kind: 'loading' });
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void api.cancelQuote(bookingId).then((outcome) => {
      if (!live) return;
      setState(
        outcome.kind === 'ok'
          ? { kind: 'quote', quote: outcome.value }
          : { kind: 'error', offline: outcome.kind === 'offline' },
      );
    });
    return () => {
      live = false;
    };
  }, [api, bookingId, attempt]);
  return {
    state,
    busy: cancel.pending,
    failed,
    confirm: () => {
      if (state.kind !== 'quote') return;
      setFailed(false);
      void cancel.send({ booking_id: bookingId, reason_code: 'traveller' }).then((result) => {
        if (result.kind === 'applied') setState({ kind: 'cancelled', quote: state.quote });
        else setFailed(true);
      });
    },
    retry: () => {
      setState({ kind: 'loading' });
      setAttempt((n) => n + 1);
    },
  };
}
