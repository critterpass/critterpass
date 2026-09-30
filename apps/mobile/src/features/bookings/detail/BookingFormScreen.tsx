/**
 * Adding a booking by hand (`edit/new`, optionally prefilled from an import that could not be
 * read) or correcting one. Both may wait in the offline queue; the card appears when it syncs.
 */
import { generateUuidV7 } from '@cp/domain';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { addBookingCommand, editBookingCommand } from '../data/commands';
import { kindOf } from '../data/model';
import { useWallet } from '../data/use-wallet';
import { useWalletContext } from '../data/use-wallet-context';
import { zoneOf } from '../format';
import { BOOKINGS_ROUTES } from '../routes';
import { BookingFormView } from './BookingFormView';
import { BookingMissing } from './BookingMissing';
import {
  draftOf,
  emptyDraft,
  problemsOf,
  toAddPayload,
  toEditPayload,
  type BookingDraft,
} from './form-model';

export const NEW_BOOKING_ID = 'new';

function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function BookingFormScreen({
  bookingId,
  kind,
  title,
}: {
  readonly bookingId: string;
  readonly kind?: string | undefined;
  readonly title?: string | undefined;
}) {
  const context = useWalletContext();
  const wallet = useWallet(context.trip?.id ?? null, context.uid);
  const add = useCommand(addBookingCommand);
  const edit = useCommand(editBookingCommand);
  const adding = bookingId === NEW_BOOKING_ID;
  const booking = adding ? undefined : wallet.all.find((item) => item.id === bookingId);
  const tz = zoneOf(booking?.tz, context.trip?.tz) ?? deviceZone();
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [tried, setTried] = useState(false);
  if (!adding && booking === undefined) return <BookingMissing loaded={wallet.loaded} />;
  const current: BookingDraft =
    draft ??
    (booking === undefined
      ? emptyDraft(kind === undefined ? 'activity' : kindOf(kind), title ?? '')
      : draftOf(booking, tz));
  const problems = problemsOf(current, tz);
  const save = async () => {
    setTried(true);
    if (booking !== undefined) {
      const payload = toEditPayload(current, booking, tz);
      if (payload === null) {
        if (problems.length === 0) router.back();
        return;
      }
      await edit.send(payload, { baseVersion: booking.version });
      router.back();
      return;
    }
    const tripId = context.trip?.id;
    if (tripId === undefined) return;
    const bookingIdNew = generateUuidV7();
    const payload = toAddPayload(current, { bookingId: bookingIdNew, tripId }, tz);
    if (payload === null) return;
    await add.send(payload);
    router.replace(BOOKINGS_ROUTES.wallet);
  };
  return (
    <BookingFormView
      mode={adding ? 'add' : 'edit'}
      draft={current}
      problems={problems}
      showProblems={tried}
      saving={add.pending || edit.pending}
      onChange={(patch) => setDraft({ ...current, ...patch })}
      onSave={() => void save()}
    />
  );
}
