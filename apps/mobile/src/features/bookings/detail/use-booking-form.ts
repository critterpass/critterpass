/**
 * The booking form's state for either UI. Adding a booking by hand (`edit/new`, optionally prefilled from an import that could not be
 * read) or correcting one. Both may wait in the offline queue; the card appears when it syncs.
 */
import { generateUuidV7 } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { toast } from '@/motion';
import { useCommandFeedback } from '@/motion/island-toast';

import { addBookingCommand, editBookingCommand, resolveCandidateCommand } from '../data/commands';
import { kindOf } from '../data/model';
import { useWallet } from '../data/use-wallet';
import { useWalletContext } from '../data/use-wallet-context';
import { zoneOf } from '../format';
import { BOOKINGS_ROUTES } from '../routes';
import {
  draftOf,
  emptyDraft,
  flightZones,
  problemsOf,
  toAddPayload,
  toEditPayload,
  zoneName,
  type BookingDraft,
} from './form-model';

export const NEW_BOOKING_ID = 'new';

function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function useBookingForm({
  bookingId,
  kind,
  title,
  candidateId,
}: {
  readonly bookingId: string;
  readonly kind?: string | undefined;
  readonly title?: string | undefined;
  readonly candidateId?: string | undefined;
}) {
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const context = useWalletContext();
  const wallet = useWallet(context.trip?.id ?? null, context.uid);
  const add = useCommand(addBookingCommand);
  const edit = useCommand(editBookingCommand);
  const resolve = useCommand(resolveCandidateCommand);
  const adding = bookingId === NEW_BOOKING_ID;
  const booking = adding ? undefined : wallet.all.find((item) => item.id === bookingId);
  const tz = zoneOf(booking?.tz, context.trip?.tz) ?? deviceZone();
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [tried, setTried] = useState(false);
  // The zone's offset as of opening the form (its name is for the traveller, not for the maths).
  const [openedAt] = useState(() => Date.now());
  // One id for the booking this form adds, so a second tap never adds a second one.
  const [newId] = useState(() => generateUuidV7());
  if (!adding && booking === undefined) return { kind: 'missing', loaded: wallet.loaded } as const;
  const current: BookingDraft =
    draft ??
    (booking === undefined
      ? emptyDraft(kind === undefined ? 'activity' : kindOf(kind), title ?? '')
      : draftOf(booking, tz));
  const problems = problemsOf(current, tz);
  const zones = flightZones(current, tz);
  const start = context.trip?.start_date ?? null;
  const trip = start === null ? null : { start, end: context.trip?.end_date ?? start };
  const save = async () => {
    setTried(true);
    if (booking !== undefined) {
      const payload = toEditPayload(current, booking, tz);
      if (payload === null) {
        if (problems.length === 0) router.back();
        return;
      }
      if (edit.pending) return;
      const outcome = report(await edit.send(payload, { baseVersion: booking.version }), {
        offlineCapable: true,
        id: 'bookings-edit',
      });
      if (outcome === 'done' || outcome === 'queued') router.back();
      return;
    }
    const tripId = context.trip?.id;
    if (tripId === undefined) {
      toast.show({
        id: 'bookings-form-no-trip',
        title: t({
          id: 'bookings.add.noTrip',
          message: 'Bookings land in a trip. Start one with the crew and they show up here.',
        }),
      });
      return;
    }
    const payload = toAddPayload(current, { bookingId: newId, tripId }, tz);
    if (payload === null || add.pending) return;
    const outcome = report(await add.send(payload), {
      offlineCapable: true,
      id: 'bookings-added-by-hand',
      done: t({ id: 'bookings.add.addedToast', message: 'In the wallet.' }),
    });
    if (outcome !== 'done' && outcome !== 'queued') return;
    if (candidateId !== undefined && candidateId !== '') {
      void resolve.send({ candidate_id: candidateId, action: 'ignore' });
    }
    router.dismissTo(BOOKINGS_ROUTES.wallet);
  };
  return {
    kind: 'ready',
    adding,
    draft: current,
    problems,
    tried,
    saving: add.pending || edit.pending,
    zones: {
      dep: zoneName(zones.dep, openedAt),
      arr: zoneName(zones.arr, openedAt),
    },
    trip,
    onChange: (patch: Partial<BookingDraft>) => setDraft({ ...current, ...patch }),
    save: () => void save(),
  } as const;
}
