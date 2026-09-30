/** A place set's page (3l-8) over synced rows. */
import { router } from 'expo-router';

import { critterRoute } from '../routes';
import { SetView } from './set-view';
import { useDexRows } from './use-dex';

export function SetScreen({ setId }: { readonly setId: string }) {
  const { model } = useDexRows();
  const set =
    [
      ...(model.hereNow === null ? [] : [model.hereNow.set]),
      ...(model.home === null ? [] : [model.home]),
      ...model.places,
    ].find((candidate) => candidate.id === setId) ?? null;
  return <SetView set={set} onOpenCritter={(id) => router.push(critterRoute(id))} />;
}
