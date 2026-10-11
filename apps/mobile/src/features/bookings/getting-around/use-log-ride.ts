/**
 * LOG IT for any sheet: keeps the ride on the leg and, with what it cost, splits it between the
 * people who rode as a crew expense (`log_ride`, works offline). Without an amount only the ride is
 * kept. One ride and one expense per sheet: a second tap or a retry sends the same ids again.
 */
import { generateUuidV7, type LogRidePayload, type RideProvider } from '@cp/domain';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { digitsToMinor } from '@/data/money/amount-digits';

import { logRideCommand } from '../supplier/data/commands';

export interface LogRideParams {
  readonly tripId: string;
  readonly legRef: string;
  readonly provider: RideProvider;
  readonly currency: string;
  readonly attendees: readonly string[];
  readonly quoteId?: string | undefined;
}

export function useLogRide(params: LogRideParams) {
  const log = useCommand(logRideCommand);
  const [digits, setDigits] = useState('');
  const [done, setDone] = useState<'split' | 'kept' | null>(null);
  const [failed, setFailed] = useState(false);
  const [ids] = useState(() => ({ ride: generateUuidV7(), expense: generateUuidV7() }));
  // Nothing typed, or zero: only the ride is kept.
  const typed = params.currency === '' ? 0 : Number(digitsToMinor(digits, params.currency));
  const minor = typed > 0 ? typed : null;

  const save = async () => {
    if (log.pending) return;
    setFailed(false);
    const payload: LogRidePayload = {
      ride_id: ids.ride,
      trip_id: params.tripId,
      leg_ref: params.legRef,
      provider: params.provider,
      ...(params.attendees.length > 0 ? { attendee_ids: [...params.attendees] } : {}),
      ...(params.quoteId ? { quote_id: params.quoteId } : {}),
      ...(minor === null
        ? {}
        : { amount_minor: minor, currency: params.currency, expense_id: ids.expense }),
    };
    const result = await log.send(payload);
    if (result.kind === 'queued' || result.kind === 'applied')
      setDone(minor === null ? 'kept' : 'split');
    else setFailed(true);
  };

  return {
    digits,
    setDigits,
    done,
    failed,
    saving: log.pending,
    people: params.attendees.length,
    save: () => void save(),
  };
}
