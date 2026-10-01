/**
 * Trip setup for one trip (`/{tripId}/setup/{step}`): loads the trip's facts from synced rows,
 * works out which step is on screen and which chips open, and renders that step inside the shell.
 * Organisers run each step; members see the same steps read-only with their own part, and a line
 * saying who is running setup (live: "is setting up" while the organiser has it open). When the
 * server refuses a step move the app had already made, the organiser is put back on the step the
 * server holds, with a line saying why.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';

import { useSyncStatus } from '@/data/status/use-sync-status';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

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
import { doneSteps, landingStep, openableSteps, type WizardStep } from './steps';

const STEP_VIEWS: Readonly<Record<WizardStep, (props: StepProps) => ReactNode>> = {
  when: WhenStep,
  budget: BudgetStep,
  rooms: RoomsStep,
  must_dos: MustDosStep,
};

const useStyles = makeStyles((th) => ({
  loading: { flex: 1, padding: th.space['20'], gap: th.space['16'] },
}));

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
  const styles = useStyles();
  const services = useSetupServices();
  const me = useMe();
  const trip = useSetupTrip(tripId, me);
  const sync = useSyncStatus();
  const present = useSetupPresence(tripId);
  const refusal = useRefusedCommand('set_setup_step');
  const current = trip?.step ?? 'when';
  const viewing = step ?? landingStep(current);
  const held = landingStep(current);
  // A refused move left the app a step ahead of the server: back to the step the server holds.
  const ahead = trip != null && refusal.refused && !openableSteps(current).has(viewing);
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
        router.replace(setupRoutes.step(tripId, next));
      },
      onBack: () => {
        refusal.acknowledge();
        if (router.canGoBack()) router.back();
        else router.replace('/');
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

  if (trip === undefined) {
    return (
      <Scaffold variant="dark" edges={['top', 'bottom']} testID="setup-loading">
        <View style={styles.loading}>
          <Skeleton
            preset="card"
            repeat={3}
            label={t({ id: 'setup.loading', message: 'Loading trip setup' })}
          />
        </View>
      </Scaffold>
    );
  }
  if (trip === null || frame === null) {
    return (
      <Scaffold variant="dark" edges={['top', 'bottom']} testID="setup-missing">
        <EmptyState
          guide="tokek"
          guideName="Tokek"
          title={t({ id: 'setup.missing.title', message: 'This trip isn’t here yet' })}
          line={t({
            id: 'setup.missing.line',
            message: 'It shows up once your phone has synced. Try again in a moment.',
          })}
          action={{
            label: t({ id: 'setup.missing.home', message: 'Back home' }),
            onPress: () => router.replace('/'),
          }}
        />
      </Scaffold>
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
