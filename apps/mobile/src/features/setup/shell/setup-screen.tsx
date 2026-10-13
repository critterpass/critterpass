/**
 * Trip setup for one trip (`/{tripId}/setup/{step}`): loads the trip's facts from synced rows,
 * works out which step is on screen and which steps open, and renders that step. Organisers run
 * each step; members see the same steps with their own part. Once the dates are locked any step
 * opens as asked. When the server refuses a step move the app had already made, the organiser is
 * put back on the step the server holds. A link to a step setup has not reached opens the step it
 * is on.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { goBackOr } from '@/lib/navigation/back';
import { Button, EmptyState, LoadingCritter, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useMe } from '../data/use-me';
import { useSetupServices } from '../data/services';
import { useSetupTrip } from '../data/setup-trip';
import { useRefusedCommand } from '../data/use-refused-command';
import { copy } from '../premium/checklist/copy';
import { setupRoutes } from '../routes';
import type { ShellFrame, StepProps } from './frame';
import { doneSteps, landingStep, openableSteps, shownStep, type WizardStep } from './steps';

/** How each step is drawn. */
export type SetupStepViews = Readonly<Record<WizardStep, (props: StepProps) => ReactNode>>;

/**
 * Steps this phone moved to itself in this session, per trip (`{tripId}:{step}`): they are drawn
 * as asked while the trip's synced row catches up, where a step reached by link is not.
 */
const movedTo = new Set<string>();

export function SetupScreen({
  tripId,
  step,
  views,
}: {
  readonly tripId: string;
  readonly step: WizardStep | null;
  readonly views: SetupStepViews;
}) {
  const theme = usePremiumTheme();
  const services = useSetupServices();
  const me = useMe();
  // The trip's own streams: its destination's places (the must-do examples and the offline
  // place search read them) arrive only once set-up has asked for them.
  useTripStreams(tripId);
  const trip = useSetupTrip(tripId, me);
  const sync = useSyncStatus();
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a command name, never copy
  const refusal = useRefusedCommand('set_setup_step');
  const current = trip?.step ?? 'when';
  const held = landingStep(current);
  // A link that asks for a step setup has not reached draws the step it is on, and the asked one
  // as soon as the trip's row says setup is there (a push can beat the sync that follows it).
  const datesLocked = trip?.startDate != null && trip.endDate !== null;
  const viewing = shownStep(
    step,
    current,
    (asked) => datesLocked || (!refusal.refused && movedTo.has(`${tripId}:${asked}`)),
  );
  // A refused move left the app a step ahead of the server: back to the step the server holds.
  const ahead = trip != null && refusal.refused && step !== null && viewing !== step;
  useEffect(() => {
    if (ahead) router.replace(setupRoutes.step(tripId, held));
  }, [ahead, tripId, held]);

  const frame = useMemo((): ShellFrame | null => {
    if (trip === null || trip === undefined) return null;
    return {
      destination: trip.destinationName,
      viewing,
      doneSteps: doneSteps(trip.step),
      openable: openableSteps(trip.step),
      onSelectStep: (next) => {
        refusal.acknowledge();
        movedTo.add(`${tripId}:${next}`);
        router.replace(setupRoutes.step(tripId, next));
      },
      onBack: () => {
        refusal.acknowledge();
        goBackOr();
      },
      sync: {
        offline: sync.phase === 'offline',
        lastSyncedAt: sync.lastSyncedAt,
        now: new Date(services.now()),
      },
    };
  }, [trip, viewing, tripId, sync.phase, sync.lastSyncedAt, services, refusal]);

  const backLabel = copy.back();
  if (trip === undefined) {
    return (
      <PushScreen title="" backLabel={backLabel} testID="setup-loading">
        <View style={{ paddingTop: theme.space.gap16 * 8 }}>
          <LoadingCritter label={copy.loading()} />
        </View>
      </PushScreen>
    );
  }
  if (trip === null || frame === null) {
    return (
      <PushScreen title="" backLabel={backLabel} testID="setup-missing">
        <EmptyState title={copy.missingTitle()} line={copy.missingLine()} />
      </PushScreen>
    );
  }
  // Setup starts once the vote has a winner: before that the api refuses every setup change, so
  // the steps would take days and budgets that never land.
  if (trip.status === 'voting') {
    return (
      <PushScreen title="" backLabel={backLabel} testID="setup-vote-open">
        <EmptyState
          title={copy.voteOpenTitle()}
          line={copy.voteOpenLine()}
          check={false}
          action={<Button label={copy.home()} onPress={() => router.replace('/')} />}
        />
      </PushScreen>
    );
  }
  const StepView = views[viewing];
  return <StepView trip={trip} shell={frame} />;
}
