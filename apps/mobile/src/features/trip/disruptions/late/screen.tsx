/**
 * The running-late screen (3k-9): a lateness the server knows about (its data is `useKnownLate`),
 * or one the traveller is saying right now; the map shows the place and the phone's own dot.
 */
import { useLocalSearchParams } from 'expo-router';

import { lateStep } from '@/features/plan';

import { LateMap } from './late-map';
import { LateView } from './late-view';
import { SaidLateScreen } from './said-late-screen';
import { useKnownLate } from './use-known-late';

/**
 * The route's screen: a lateness the server knows about (by its id: the journey check or a
 * lock-screen report opened it), or one the traveller is saying right now for a stop of today.
 */
export function RunningLateScreen({ id }: { readonly id: string }) {
  const said = useLocalSearchParams<{ tripId?: string; stop?: string; minutes?: string }>();
  if (said.tripId && said.stop) {
    return (
      <SaidLateScreen
        tripId={said.tripId}
        stableId={said.stop}
        minutes={lateStep(said.minutes)}
        known={(open) => <KnownLateScreen id={open} />}
      />
    );
  }
  return <KnownLateScreen id={id} />;
}

export function KnownLateScreen({ id }: { readonly id: string }) {
  const late = useKnownLate(id);
  const map =
    late.place === undefined || late.offline ? null : (
      <LateMap place={late.place} you={late.fix} destinationSlug={late.destinationSlug} />
    );
  return <LateView {...late.props} map={map} />;
}
