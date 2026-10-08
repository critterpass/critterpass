/**
 * Trip setup for one trip (`/{tripId}/setup/{step}`): loads the trip's facts from synced rows,
 * works out which step is on screen and which chips open, and renders that step inside the shell.
 * Organisers run each step; members see the same steps read-only with their own part, and a line
 * saying who is running setup (live: "is setting up" while the organiser has it open). When the
 * server refuses a step move the app had already made, the organiser is put back on the step the
 * server holds, with a line saying why. A link to a step setup has not reached opens the step it
 * is on.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, type ReactNode } from 'react';

import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { goBackOr } from '@/lib/navigation/back';
import { EmptyState } from '@/ui/states/EmptyState';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { BudgetStep } from '../budget';
import { useMe } from '../data/use-me';
import { useSetupServices } from '../data/services';
import { useSetupTrip, type SetupTrip } from '../data/setup-trip';
import { useSetupPresence } from '../data/use-setup-channel';
import { useRefusedCommand } from '../data/use-refused-command';
import { MustDosStep } from '../must-dos';
import { RoomsStep } from '../rooms';
import { setupRoutes } from '../routes';
import { WhenStep } from '../when';
import type { ShellFrame, StepProps } from './frame';
import { guideName } from './guide-note';
import { doneSteps, landingStep, openableSteps, shownStep, type WizardStep } from './steps';

const STEP_VIEWS: Readonly<Record<WizardStep, (props: StepProps) => ReactNode>> = {
  when: WhenStep,
  budget: BudgetStep,
  rooms: RoomsStep,
  must_dos: MustDosStep,
};

/**
 * Steps this phone moved to itself in this session, per trip (`{tripId}:{step}`): they are drawn
 * as asked while the trip's synced row catches up, where a step reached by link is not.
 */
const movedTo = new Set<string>();

/** The member's line under the step's copy: who runs setup, and whether they have it open now. */
export function MemberStatus({ trip, here }: { readonly trip: SetupTrip; readonly here: boolean }) {
  const theme = useTheme();
  if (trip.isOrganiser) return null;
  const organiser = trip.members.find((member) => member.organiser)?.name ?? '';
  const line = here
    ? t({ id: 'setup.status.here', message: `${organiser} is setting up right now.` })
    : t({ id: 'setup.status.away', message: `${organiser} runs setup. Your part is below.` });
  return (
    <Text variant="bodySm" color={theme.semantic.text.secondary} testID="setup-member-status">
      {line}
    </Text>
  );
}

/** The organiser's line after a refused step move: why setup is still on this step. */
export function StepRefused() {
  const theme = useTheme();
  return (
    <Text variant="bodySm" color={theme.semantic.state.urgent} testID="setup-step-refused">
      {t({
        id: 'setup.status.stepRefused',
        message: 'This step isn’t finished for the whole crew yet, so setup is still here.',
      })}
    </Text>
  );
}

export function SetupScreen({
  tripId,
  step,
}: {
  readonly tripId: string;
  readonly step: WizardStep | null;
}) {
  const services = useSetupServices();
  const me = useMe();
  // The trip's own streams: its destination's places (the must-do examples and the offline
  // place search read them) arrive only once set-up has asked for them.
  useTripStreams(tripId);
  const trip = useSetupTrip(tripId, me);
  const sync = useSyncStatus();
  const present = useSetupPresence(tripId);
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a command name, never copy
  const refusal = useRefusedCommand('set_setup_step');
  const current = trip?.step ?? 'when';
  const held = landingStep(current);
  // A refused move left the app a step ahead of the server, or a link asked for a step setup has
  // not reached: back to the step the server holds.
  const viewing = shownStep(
    step,
    current,
    (asked) => !refusal.refused && movedTo.has(`${tripId}:${asked}`),
  );
  const ahead = trip != null && step !== null && viewing !== step;
  useEffect(() => {
    if (ahead) router.replace(setupRoutes.step(tripId, held));
  }, [ahead, tripId, held]);

  const frame = useMemo((): ShellFrame | null => {
    if (trip === null || trip === undefined) return null;
    const organiser = trip.members.find((member) => member.organiser);
    const here = organiser !== undefined && present.some((person) => person.uid === organiser.uid);
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
      status:
        trip.isOrganiser && refusal.refused ? (
          <StepRefused />
        ) : (
          <MemberStatus trip={trip} here={here} />
        ),
    };
  }, [trip, viewing, tripId, sync.phase, sync.lastSyncedAt, present, services, refusal]);

  const backLabel = t({ id: 'setup.back.home', message: 'Home' });
  if (trip === undefined) {
    return (
      <ScreenLoading
        backLabel={backLabel}
        label={t({ id: 'setup.loading', message: 'Loading trip setup' })}
        testID="setup-loading"
      />
    );
  }
  if (trip === null || frame === null) {
    return (
      <ScreenMissing
        backLabel={backLabel}
        title={t({ id: 'setup.missing.title', message: 'This trip isn’t here yet' })}
        line={t({
          id: 'setup.missing.line',
          message: 'It shows up once your phone has synced. Try again in a moment.',
        })}
        testID="setup-missing"
      />
    );
  }
  // Setup starts once the vote has a winner: before that the api refuses every setup change, so
  // the steps would take days and budgets that never land.
  if (trip.status === 'voting') {
    return (
      <Scaffold variant="dark" edges={['top', 'bottom']} testID="setup-vote-open">
        <EmptyState
          guide={trip.guide}
          guideName={guideName(trip.guide)}
          title={t({ id: 'setup.voteOpen.title', message: 'The vote isn’t over yet' })}
          line={t({
            id: 'setup.voteOpen.line',
            message: 'Setup opens once the crew has picked a place. Finish the vote from Home.',
          })}
          action={{
            label: t({ id: 'setup.missing.home', message: 'Back home' }),
            onPress: () => router.replace('/'),
          }}
        />
      </Scaffold>
    );
  }
  const StepView = STEP_VIEWS[viewing];
  return <StepView trip={trip} shell={frame} />;
}
