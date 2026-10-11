/**
 * The year-later memory (3m-10) over synced rows, where the anniversary push lands
 * (`/memory/<memoryId>?trip=<tripId>`): holds the trip's streams (the memory and its reactions ride
 * them), signs the photo through the api, sends a reaction (offline it waits in the queue), pitches
 * the place to the crew's destination vote with PLAN A REUNION and goes Home where that vote lives,
 * and shares the memory with the crew's signatures.
 */
import { useLingui } from '@lingui/react/macro';
import { useContext } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { goBackOr } from '@/lib/navigation/back';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';
import { SessionWaiting } from '@/ui/states/SessionWaiting';

import { useLiveRows } from '../data/live-rows';
import { MemoryShareSheet } from './memory-share-sheet';
import { MemoryView } from './memory-view';
import { ReactionSheet } from './reaction-sheet';
import { useMemoryScreen } from './use-memory-screen';

/** The memory is still being read (a wait that can be left), or is not on this phone. */
function MemoryAbsent({ loaded }: { readonly loaded: boolean }) {
  const { t } = useLingui();
  const backLabel = t({ id: 'recap.link.back', message: 'Home' });
  return loaded ? (
    <ScreenMissing
      backLabel={backLabel}
      title={t({ id: 'recap.memory.missing.title', message: 'This memory isn’t here' })}
      line={t({
        id: 'recap.memory.missing.line',
        message: 'It may have been removed, or this phone hasn’t got it yet.',
      })}
      testID="memory-missing"
    />
  ) : (
    <ScreenLoading
      backLabel={backLabel}
      label={t({ id: 'recap.memory.loading', message: 'Loading the memory' })}
      testID="memory-waiting"
    />
  );
}

function Memory({ memoryId, tripId }: { readonly memoryId: string; readonly tripId: string }) {
  const screen = useMemoryScreen(memoryId, tripId);
  if (screen.ready === null) return <MemoryAbsent loaded={screen.loaded} />;
  const m = screen.ready;
  return (
    <>
      <MemoryView
        title={m.title}
        body={m.body}
        eyebrow={m.eyebrow}
        photoUrl={m.photoUrl}
        guideKind={m.guideKind}
        guideName={m.guideName}
        reactions={m.chips}
        onClose={() => goBackOr()}
        onReact={() => m.setReacting(true)}
        onReunion={m.onReunion}
        reunionPending={m.reunionPending}
        onShare={() => m.setSharing(true)}
      />
      {m.reacting ? (
        <ReactionSheet initial={m.mine} onSend={m.onSend} onClose={() => m.setReacting(false)} />
      ) : null}
      {m.sharing ? (
        <MemoryShareSheet
          guideKind={m.guideKind}
          eyebrow={m.eyebrow}
          title={m.title}
          body={m.body}
          photoUrl={m.photoUrl}
          signers={m.signers}
          onClose={() => m.setSharing(false)}
        />
      ) : null}
    </>
  );
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- SQL, never copy.
const MEMORY_TRIP_SQL = 'SELECT trip_id FROM memories WHERE id = ?';

/** A link without its trip (an older push) finds the trip from a memory already on the phone. */
function MemoryOfTrip({ memoryId }: { readonly memoryId: string }) {
  const trips = useLiveRows<{ trip_id: string }>(MEMORY_TRIP_SQL, [memoryId], ['memories']);
  const trip = trips.rows[0];
  if (trip === undefined) return <MemoryAbsent loaded={trips.loaded} />;
  return <Memory memoryId={memoryId} tripId={trip.trip_id} />;
}

export function MemoryScreen({
  memoryId,
  tripId,
}: {
  readonly memoryId: string;
  readonly tripId: string | null;
}) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <SessionWaiting testID="memory-waiting" />;
  return tripId === null ? (
    <MemoryOfTrip memoryId={memoryId} />
  ) : (
    <Memory memoryId={memoryId} tripId={tripId} />
  );
}
