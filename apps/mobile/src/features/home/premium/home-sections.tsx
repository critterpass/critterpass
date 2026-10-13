/**
 * The premium Home's body for each mode of the mode machine: first run and "crew ready, nothing
 * planned" (3.01) as the step card; everyday, final vote and in trip as the trip's collage card
 * (3.02) with the vote under it; just back (3.04) as the photo hero. Below every mode: the guide's
 * tip (dismissable for the crew) and, for a crew of one, the way to bring friends in.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import type { HomeTripInput } from '@cp/domain';
import { settleLink } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router, type Href } from 'expo-router';
import { createElement, useContext } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { WaitlistCards } from '@/features/crew';
import { GuideNote, PressableScale, Text, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

import type { HomeView } from '../data/use-home-state';
import { guideArt } from '../guide-art';
import { dismissTipCommand } from '../home-commands';
import { useOfflineLine, useOfflineLineCopy } from '../offline-line';
import { crewInviteRoute, HOME_ROUTES, homeRoutes } from '../routes';
import { homeVoteSlot } from '../slots';
import type { OpenTripRow } from '../data/home-queries';
import { BackHero } from './components/back-hero';
import { StepCard } from './components/step-card';
import { SavedLinkNote } from './components/saved-link-note';
import { TripCollageCard } from './components/trip-collage-card';
import { JoinTripNote } from './join-trip-note';
import { WaitTile } from './components/wait-tile';
import { useGoing } from './use-premium-home';

const DAY_MS = 86_400_000;

const useStyles = makePremiumStyles((t) => ({
  stack: { gap: t.space.gap16 },
  label: { marginTop: t.space.gap8 },
  tiles: { flexDirection: 'row', gap: t.space.gap10 },
  pitch: {
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.color.outlineEmpty,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

function push(href: Href | undefined): (() => void) | undefined {
  return href === undefined ? undefined : () => router.push(href);
}

/** The trip a card shows for the mode, or none (a trip still choosing its place shows its vote). */
export function shownTrip(view: HomeView): HomeTripInput | null {
  const { home } = view;
  const votingIsNextUp =
    home.nextTrip?.destinationId === null && home.vote !== null && homeVoteSlot() !== null;
  if (home.mode === 'in_trip') return home.activeTrip;
  if ((home.mode === 'everyday' || home.mode === 'final_vote') && !votingIsNextUp) {
    return home.nextTrip;
  }
  return null;
}

export function FirstRunSection() {
  const { t } = useLingui();
  const styles = useStyles();
  return (
    <View style={styles.stack} testID="home-first-run">
      <StepCard
        eyebrow={t({ id: 'home.premium.firstRun.eyebrow', message: 'Step 1 of 3' })}
        title={t({ id: 'home.firstRun.title', message: 'Where to first?' })}
        body={t({
          id: 'home.premium.firstRun.body',
          message: 'Trips start with a crew. Start one, or join the one a friend made.',
        })}
        action={{
          label: t({ id: 'home.firstRun.startCrew', message: 'Start a crew' }),
          onPress: () => router.push('/crew/new'),
          testID: 'home-start-crew',
        }}
        secondary={{
          label: t({ id: 'home.firstRun.joinCode', message: 'Join with a code' }),
          onPress: () => router.push(HOME_ROUTES.joinCode),
          testID: 'home-join-code',
        }}
      />
    </View>
  );
}

function NoTripSection({ crewId }: { readonly crewId: string }) {
  const { t } = useLingui();
  const styles = useStyles();
  const pitch = push(homeRoutes.pitch(crewId));
  const search = push(homeRoutes.placeSearch());
  return (
    <View style={styles.stack} testID="home-mode-no_trip">
      <StepCard
        testID="home-no-trip"
        eyebrow={t({ id: 'home.premium.noTrip.eyebrow', message: 'Step 1 of 3' })}
        title={t({ id: 'home.premium.noTrip.title', message: 'Where should the crew go?' })}
        body={t({
          id: 'home.premium.noTrip.body',
          message:
            'Start a vote with a few places. Everyone swipes, and the crew decides in minutes.',
        })}
        action={{
          label: t({ id: 'home.premium.noTrip.cta', message: 'Start the vote' }),
          onPress: pitch ?? (() => undefined),
          testID: 'home-pitch',
        }}
      />
      <Text variant="label" tone="muted" style={styles.label}>
        {t({ id: 'home.premium.noTrip.wait', message: 'While you wait' })}
      </Text>
      <View style={styles.tiles}>
        <WaitTile
          critter="puffin"
          title={t({ id: 'home.noTrip.pitch', message: 'Pitch a place' })}
          sub={t({
            id: 'home.premium.noTrip.pitchSub',
            message: 'Somewhere you keep thinking about',
          })}
          onPress={search ?? pitch ?? (() => undefined)}
          testID="home-pitch-place"
        />
        <WaitTile
          critter="sardine"
          title={t({ id: 'home.premium.noTrip.invite', message: 'Bring the crew in' })}
          sub={t({ id: 'home.premium.noTrip.inviteSub', message: 'Votes count once they join' })}
          onPress={() => router.push(crewInviteRoute(crewId))}
          testID="home-invite-crew"
        />
      </View>
    </View>
  );
}

function OfflineLine({ trip, now }: { readonly trip: HomeTripInput | null; readonly now: Date }) {
  const { t } = useLingui();
  const copy = useOfflineLineCopy();
  const { held, line } = useOfflineLine(trip, now);
  if (held) {
    return (
      <Text variant="caption" tone="muted" testID="home-sync-held">
        {t({
          id: 'home.offline.held',
          message: "Some changes can't be sent yet. We'll keep trying when the app is opened.",
        })}
      </Text>
    );
  }
  if (line === null) return null;
  return (
    <Text
      variant="caption"
      tone="muted"
      testID={line.kind === 'ready' ? 'home-offline-ready' : 'home-offline-pending'}
    >
      {copy(line)}
    </Text>
  );
}

export interface CrewSectionProps {
  readonly view: HomeView;
  readonly openTrip: OpenTripRow | null;
  readonly now: Date;
}

export function CrewSection({ view, openTrip, now }: CrewSectionProps) {
  const localFirst = useContext(LocalFirstContext);
  const { t } = useLingui();
  const styles = useStyles();
  const theme = usePremiumTheme();
  const dismiss = useCommand(dismissTipCommand);
  const { home, crew, tip } = view;
  const trip = shownTrip(view);
  const going = useGoing(theme, crew, trip?.id ?? null);
  if (crew === null) return null;
  const vote = homeVoteSlot();
  const recent = home.mode === 'post_trip' ? home.recentTrip : null;
  const daysHome =
    recent?.endDate == null
      ? 0
      : Math.max(
          1,
          Math.floor((now.getTime() - Date.parse(`${recent.endDate}T00:00:00`)) / DAY_MS),
        );
  const tipGuide = tip === null ? null : guideArt(tip.guide_slug);
  const showTip =
    tip !== null &&
    (home.mode === 'everyday' || home.mode === 'no_trip' || home.mode === 'post_trip');
  const tipPlace = tip?.place_id ?? null;
  const recapGo = recent === null ? undefined : push(homeRoutes.recap(recent.id));
  const pitchGo = push(homeRoutes.pitch(crew.id));
  const everyday = home.mode === 'everyday' || home.mode === 'final_vote';
  const voteDrawn = everyday && vote !== null && home.vote !== null;
  // The pitch board carries its own "+ Pitch a place"; the final and a crew with no vote use Home's.
  const pitchHere =
    everyday && pitchGo !== undefined && !(voteDrawn && home.vote?.stage === 'board');
  return (
    <View style={styles.stack} testID={`home-mode-${home.mode}`}>
      {openTrip === null ? null : <JoinTripNote trip={openTrip} crewName={crew.name} />}
      {/* Their place in line on the crew's full trips, or a seat that opened for them. */}
      <WaitlistCards
        db={localFirst?.db ?? null}
        uid={view.uid}
        commands={localFirst?.commands ?? null}
        now={now}
        crewId={crew.id}
      />
      {trip === null ? null : <TripCollageCard trip={trip} going={going} now={now} />}
      {trip === null ? null : <SavedLinkNote tripId={trip.id} />}
      <OfflineLine trip={trip} now={now} />
      {home.mode === 'no_trip' ? <NoTripSection crewId={crew.id} /> : null}
      {recent === null ? null : (
        <BackHero
          trip={recent}
          daysHome={daysHome}
          onSettle={() => router.push(settleLink())}
          {...(recapGo === undefined ? {} : { onRecap: recapGo })}
          {...(pitchGo === undefined ? {} : { onNext: pitchGo })}
        />
      )}
      {voteDrawn && vote !== null && home.vote !== null
        ? createElement(vote.Component, { crewId: crew.id, vote: home.vote })
        : null}
      {pitchHere ? (
        <PressableScale
          onPress={pitchGo}
          style={styles.pitch}
          accessibilityLabel={t({ id: 'home.noTrip.pitch', message: 'Pitch a place' })}
          testID="home-pitch"
        >
          <Text variant="textButton" tone="muted">
            {t({ id: 'home.premium.pitchPlus', message: '+ Pitch a place' })}
          </Text>
        </PressableScale>
      ) : null}
      {crew.members.length === 1 ? (
        <GuideNote
          name="Tokek"
          text={t({
            id: 'home.premium.solo',
            message: 'A crew of one is a quiet trip. Bring your people in and the vote opens up.',
          })}
          action={{
            label: t({ id: 'home.premium.solo.cta', message: 'Invite' }),
            onPress: () => router.push(crewInviteRoute(crew.id)),
          }}
          testID="home-invite-friends"
        />
      ) : null}
      {showTip && tip !== null && tipGuide !== null ? (
        <GuideNote
          name={tipGuide.name}
          critter={tipGuide.kind}
          tint={tipGuide.kind === 'tanuki' ? 'pon' : 'tokek'}
          text={tip.text}
          action={{
            label:
              tipPlace === null
                ? t({ id: 'home.premium.tip.hide', message: 'Got it' })
                : t({ id: 'home.premium.tip.open', message: 'Show me' }),
            onPress: () => {
              const href = tipPlace === null ? undefined : homeRoutes.destination(tipPlace);
              if (href === undefined) void dismiss.send({ tip_id: tip.id });
              else router.push(href);
            },
          }}
          testID="home-tip"
        />
      ) : null}
    </View>
  );
}
