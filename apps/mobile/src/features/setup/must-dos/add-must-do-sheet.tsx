/**
 * The add-a-must-do sheet wired to the phone (`/{tripId}/setup/must-dos/add`, also where the
 * guide's "what's the one thing" push lands): searches as you type, tells the crew you are typing
 * (`trip_presence`, throttled), and adds the pick to your whole list with `set_must_dos`, which
 * waits in the queue when there is no signal. Closes once the pick is queued or sent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command values, route ids and date options, never copy. */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTyping } from '@/data/realtime/use-typing';

import { setMustDosCommand } from '../data/commands';
import { useSetupServices } from '../data/services';
import { useSetupTrip } from '../data/setup-trip';
import { useMe } from '../data/use-me';
import { AddSheetView } from './add-sheet-view';
import { useMustDosData } from './data';
import { buildMustDos } from './model';
import { listWith, type NewPick } from './save';
import { tripDates, useMustDoSearch } from './search';

function close() {
  if (router.canGoBack()) router.back();
}

export function AddMustDoSheet({ tripId }: { readonly tripId: string }) {
  const services = useSetupServices();
  const me = useMe();
  const trip = useSetupTrip(tripId, me);
  const data = useMustDosData(tripId);
  const { notifyTyping } = useTyping('trip_presence', tripId);
  const setMustDos = useCommand(setMustDosCommand);
  const [query, setQuery] = useState('');
  const dates = useMemo(
    () => tripDates(trip?.startDate ?? null, trip?.endDate ?? null),
    [trip?.startDate, trip?.endDate],
  );
  const search = useMustDoSearch({ services, destinationId: data.destinationId, query, dates });
  const self = trip?.members.find((member) => member.uid === trip.me);
  if (trip === null || trip === undefined || self === undefined) return null;

  const add = (pick: NewPick) => {
    const mine = buildMustDos(data.rows, data.queued, trip.members, trip.me, []).mine;
    const payload = listWith(tripId, mine, pick);
    if (payload === null || setMustDos.pending) return;
    void setMustDos.send(payload).then(close);
  };

  return (
    <AddSheetView
      trip={trip}
      me={self}
      query={query}
      search={search}
      onQuery={(text) => {
        setQuery(text);
        if (text.trim() !== '') notifyTyping();
      }}
      onPickPlace={(place) => add({ text: place.name, poiId: place.id })}
      onKeepText={() => {
        if (query.trim() !== '') add({ text: query, poiId: null });
      }}
    />
  );
}
