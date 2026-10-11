/**
 * The add-a-must-do sheet wired to the phone (`/{tripId}/setup/must-dos/add`, also where the
 * guide's "what's the one thing" push lands): searches as you type, tells the crew you are typing
 * (`trip_presence`, throttled), and adds the pick to your whole list with `set_must_dos`, which
 * waits in the queue when there is no signal. Closes once the pick is queued or sent (onto the
 * must-dos step when the sheet was opened cold from the push). Past the
 * guide's own results, "More places" shows live Foursquare results (`./more-places.ts`).
 */
/* eslint-disable lingui/no-unlocalized-strings -- command values, route ids and date options, never copy. */
import { t } from '@lingui/core/macro';
import { useMemo, useState, type ComponentType } from 'react';

import { useReadsLocalNames } from '@/data/places/use-shown-names';
import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
import { useTyping } from '@/data/realtime/use-typing';

import { setMustDosCommand } from '../data/commands';
import { useSetupServices } from '../data/services';
import { useSetupTrip } from '../data/setup-trip';
import { useMe } from '../data/use-me';
import { setupRoutes } from '../routes';
import { SetupSheetWaiting } from '../shell/sheet-waiting';
import { AddSheetView, type AddSheetViewProps } from './add-sheet-view';
import { useMustDosData } from './data';
import { MorePlacesSection, type LivePickNote, type MorePlacesProps } from './more-places-section';
import { resolveLivePick, useMorePlaces, type LivePlace } from './more-places';
import { buildMustDos } from './model';
import { listWith, type NewPick } from './save';
import { tripDates, useMustDoSearch } from './search';

/** How the sheet is drawn; the logic is the same in every look. */
export interface AddMustDoLook {
  readonly Sheet: ComponentType<AddSheetViewProps>;
  readonly More: ComponentType<MorePlacesProps>;
}

const CURRENT_LOOK: AddMustDoLook = { Sheet: AddSheetView, More: MorePlacesSection };

export function AddMustDoSheet({
  tripId,
  look = CURRENT_LOOK,
}: {
  readonly tripId: string;
  /** @default the current look */
  readonly look?: AddMustDoLook;
}) {
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
  const readsLocal = useReadsLocalNames(data.destinationId);
  const search = useMustDoSearch({
    services,
    destinationId: data.destinationId,
    query,
    dates,
    readsLocal,
  });
  const more = useMorePlaces({ services, destinationId: data.destinationId, query, search });
  const [note, setNote] = useState<LivePickNote | null>(null);
  const self = trip?.members.find((member) => member.uid === trip.me);
  const close = () => goBackOr(setupRoutes.step(tripId, 'must_dos'));
  if (trip === null || trip === undefined || self === undefined) {
    return (
      <SetupSheetWaiting
        state={trip === undefined ? 'loading' : 'missing'}
        title={t({ id: 'setup.mustDos.title', message: 'Must-dos' })}
        onDismiss={close}
        testID="add-must-do-waiting"
      />
    );
  }

  const add = (pick: NewPick) => {
    const mine = buildMustDos(data.rows, data.queued, trip.members, trip.me, []).mine;
    const payload = listWith(tripId, mine, pick);
    if (payload === null || setMustDos.pending) return;
    void setMustDos.send(payload).then(close);
  };

  // A live result is added as our own open-data place, never with Foursquare's name or details.
  const pickLive = (place: LivePlace) => {
    const destinationId = data.destinationId;
    if (destinationId === null || note?.kind === 'resolving') return;
    setNote({ fsqPlaceId: place.fsqPlaceId, kind: 'resolving' });
    void resolveLivePick(services, destinationId, place).then((pick) => {
      if (pick.kind === 'ready') {
        setNote(null);
        add({ text: pick.name, poiId: pick.poiId });
      } else {
        setNote({ fsqPlaceId: place.fsqPlaceId, kind: pick.kind });
      }
    });
  };

  const { Sheet, More } = look;
  return (
    <Sheet
      trip={trip}
      me={self}
      query={query}
      search={search}
      onQuery={(text) => {
        setQuery(text);
        if (text.trim() !== '') notifyTyping();
      }}
      onDismiss={close}
      onPickPlace={(place) => add({ text: place.name, poiId: place.id })}
      onKeepText={() => {
        if (query.trim() !== '') add({ text: query, poiId: null });
      }}
      more={
        <More state={more} note={note} destinationName={trip.destinationName} onPick={pickLive} />
      }
    />
  );
}
