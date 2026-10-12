/**
 * The winner stamp (4.06): "Where next?" over the white stamp disc, the tally card rising once the
 * stamp lands, the losing guide taking it well, and one way on: the organiser sets the place up;
 * everyone else learns who has the setup and goes back home. Every viewer also has the ✕. Opening
 * it files `mark_reveal_seen`, so it plays once per person on any device; opened again it is drawn
 * finished. A place locked in before anyone voted shows as locked in, with no score.
 */
/* eslint-disable lingui/no-unlocalized-strings -- style values, never copy. */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { goBackOr } from '@/lib/navigation/back';
import {
  CritterSticker,
  REDUCED_FADE,
  SPRINGS,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { useIsOrganiser, usePlaces } from '../../data/use-board';
import {
  useCrewName,
  useMarkRevealSeen,
  useOrganiserName,
  useRevealSeenOnOpen,
} from '../../data/use-final';
import { useMyUid } from '../../data/use-my-uid';
import { usePeople } from '../../data/use-people';
import { usePoll } from '../../data/use-poll';
import type { PollOptionView, PollView } from '../../data/poll-view';
import { guideColour, guideOr, guideSticker, upper } from '../../format';
import { voteRoutes } from '../../routes';
import { crewOf, namesLine } from '../components/crew';
import { PremiumLoadingPage, PremiumMissingPage } from '../components/screen-states';
import { TallyCard } from '../components/tally-card';
import { WinnerStamp } from '../components/winner-stamp';
import { RevealFooter } from './reveal-footer';
import { revealOutcome, type RevealOutcome } from './reveal-outcome';
import { useRevealLines } from './reveal-lines';

/** Stickers around the disc (design: star 36 −14°, spark 32 12°, plane 52 −6°). */
const STICKERS = [
  { kind: 'star', size: 36, rotate: -14, top: 12, start: 32 },
  { kind: 'spark', size: 32, rotate: 12, top: -8, end: 70 },
  { kind: 'plane', size: 52, rotate: -6, top: 200, start: 20 },
] as const;

const useStyles = makePremiumStyles((t) => ({
  header: { alignItems: 'center', gap: t.space.gap4 / 2 },
  body: { paddingHorizontal: t.space.gutter, gap: t.space.gap16 },
  loser: { flexDirection: 'row', alignItems: 'center', gap: t.space.gap12 },
}));

function nameOf(option: PollOptionView, places: ReturnType<typeof usePlaces>): string {
  return (option.refId === null ? undefined : places.get(option.refId)?.name) ?? option.label;
}

export function PremiumWinnerRevealView(props: {
  readonly poll: PollView;
  readonly me: string;
  readonly settled: boolean;
}) {
  const outcome = revealOutcome(props.poll, props.me);
  if (outcome === null) return <RevealMissing />;
  return <RevealContent {...props} outcome={outcome} />;
}

function RevealContent({
  poll,
  me,
  settled,
  outcome,
}: {
  readonly poll: PollView;
  readonly me: string;
  readonly settled: boolean;
  readonly outcome: RevealOutcome;
}) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const reduced = usePremiumReducedMotion();
  const { t, i18n } = useLingui();
  const places = usePlaces(poll.id);
  const people = usePeople(poll.crewId);
  const organiser = useIsOrganiser(poll, me);
  const organiserName = useOrganiserName(poll);
  const crewName = useCrewName(poll.crewId);
  useMarkRevealSeen(poll.id, settled);
  const [landed, setLanded] = useState(settled);
  const rise = useSharedValue(settled ? 1 : 0);
  useEffect(() => {
    if (!landed) return;
    rise.set(reduced ? withTiming(1, REDUCED_FADE) : withSpring(1, SPRINGS.lively));
  }, [landed, reduced, rise]);
  const riseStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - rise.value) * theme.motion.stamp.resultRise }],
  }));

  const { winner, loser, lockedIn } = outcome;
  const winnerPlace = winner.refId === null ? undefined : places.get(winner.refId);
  const winnerName = nameOf(winner, places);
  const loserName = loser === null ? null : nameOf(loser, places);
  const loserPlace = loser?.refId == null ? undefined : places.get(loser.refId);
  const loserGuideId = loser === null ? null : guideOr(loserPlace?.guide);
  const loserGuide = loserGuideId === null ? null : guideSticker(loserGuideId);
  const winnerGuide = guideSticker(guideOr(winnerPlace?.guide));
  const { score, lockedBy, picked, notes } = useRevealLines({
    poll,
    outcome,
    winnerName,
    organiser,
    organiserName,
    crewName,
  });
  const and = t({ id: 'vote.final.and', message: 'and' });
  const leave = () => goBackOr();
  const setUp = () => {
    const href = poll.tripId === null ? undefined : voteRoutes.tripStart(poll.tripId, true);
    if (href === undefined) leave();
    else router.replace(href);
  };
  const colourOf = (option: PollOptionView) =>
    (option.refId === null ? undefined : places.get(option.refId)?.colour) ??
    (option.winner ? theme.accent.tangerine : theme.accent.mint);
  const tally = (lockedIn ? [] : poll.options).map((option) => {
    const voters = crewOf(people, option.voterIds);
    return {
      id: option.id,
      name: nameOf(option, places),
      votes: option.votes,
      share: outcome.share.get(option.id) ?? 0,
      colour: colourOf(option),
      winner: option.winner,
      voters,
      votersLabel: namesLine(voters, and),
    };
  });
  const summary = [
    `${winnerName}. ${score}`,
    ...tally.map((line) => {
      const votes = line.votes;
      const count = t({
        id: 'vote.showdown.count',
        message: plural(votes, { one: '# vote', other: '# votes' }),
      });
      return `${line.name}, ${count}`;
    }),
  ].join('; ');

  return (
    <FullScreen
      closeLabel={t({ id: 'vote.premium.close', message: 'Close' })}
      overPhoto={false}
      onClose={leave}
      testID="reveal"
    >
      {/* The loading page before it is a pushed page with a header; the stamp has only its ✕. */}
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: theme.color.ground }}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + theme.space.gap12,
            paddingBottom: theme.space.gap16,
            gap: theme.space.gap16,
          }}
        >
          <View style={styles.header}>
            <Text variant="button" accessibilityRole="header">
              {lockedIn
                ? t({ id: 'vote.premium.reveal.titleDecided', message: 'Where next? · Decided' })
                : t({ id: 'vote.premium.reveal.title', message: 'Where next?' })}
            </Text>
            <Text variant="caption" tone="muted">
              {lockedIn
                ? lockedBy
                : t({
                    id: 'vote.premium.reveal.voted',
                    message: `Final · ${poll.votedCount} of ${poll.eligibleIds.length} voted`,
                  })}
            </Text>
          </View>
          <View>
            <WinnerStamp
              top={upper(picked, i18n.locale)}
              word={upper(winnerName, i18n.locale)}
              bottom={upper(score, i18n.locale)}
              guide={{ kind: winnerGuide.kind, name: winnerGuide.name }}
              play={!settled}
              onLanded={() => setLanded(true)}
            />
            {STICKERS.map((sticker) => (
              <Animated.View
                key={sticker.kind}
                pointerEvents="none"
                importantForAccessibility="no-hide-descendants"
                style={[
                  {
                    position: 'absolute',
                    top: sticker.top,
                    ...('start' in sticker ? { start: sticker.start } : { end: sticker.end }),
                    transform: [{ rotate: `${sticker.rotate}deg` }],
                  },
                  riseStyle,
                ]}
              >
                <CritterSticker kind={sticker.kind} name={sticker.kind} size={sticker.size} />
              </Animated.View>
            ))}
          </View>
          <Animated.View style={[styles.body, riseStyle]}>
            {tally.length > 0 ? <TallyCard lines={tally} fill={landed} summary={summary} /> : null}
            {notes.map((note) => (
              <Text key={note.id} variant="caption" tone="muted" align="center" testID={note.id}>
                {note.text}
              </Text>
            ))}
            {loserGuide === null || loserGuideId === null ? null : (
              <View style={styles.loser} testID="reveal-consolation">
                <View style={{ transform: [{ rotate: '-10deg' }] }}>
                  <CritterSticker kind={loserGuide.kind} name={loserGuide.name} size={56} />
                </View>
                <Text variant="guide" color={guideColour(loserGuideId, true)} style={{ flex: 1 }}>
                  {t({
                    id: 'vote.reveal.consolation',
                    message: `${loserGuide.name} took it well. Already pitching the next trip.`,
                  })}
                </Text>
              </View>
            )}
          </Animated.View>
        </ScrollView>
        <RevealFooter
          style={riseStyle}
          organiser={organiser}
          organiserName={organiserName}
          winnerName={winnerName}
          loserName={loserName}
          onSetUp={setUp}
          onLeave={leave}
        />
      </View>
    </FullScreen>
  );
}

function RevealMissing() {
  const { t } = useLingui();
  return (
    <PremiumMissingPage
      title={t({ id: 'vote.premium.reveal.title', message: 'Where next?' })}
      headline={t({ id: 'vote.reveal.missingTitle', message: 'This result isn’t here' })}
      line={t({
        id: 'vote.reveal.missingLine',
        message: 'The vote may have been removed, or this phone hasn’t got it yet.',
      })}
      testID="reveal-missing"
    />
  );
}

/**
 * Plays once: a reveal this user has already seen opens finished. While the poll is read, or its
 * close has not reached this phone yet, it waits; a poll that is not here says so.
 */
export function PremiumWinnerRevealScreen({ pollId }: { readonly pollId: string }) {
  const { t } = useLingui();
  const me = useMyUid();
  const { poll, loaded } = usePoll(pollId, me);
  const seenBefore = useRevealSeenOnOpen(pollId, me);
  if (poll !== null && me !== null && poll.status === 'closed' && seenBefore !== null) {
    return <PremiumWinnerRevealView poll={poll} me={me} settled={seenBefore} />;
  }
  if (loaded && me !== null && poll === null) return <RevealMissing />;
  return (
    <PremiumLoadingPage
      title={t({ id: 'vote.premium.reveal.title', message: 'Where next?' })}
      label={t({ id: 'vote.reveal.loading', message: 'Loading the result' })}
      testID="reveal-loading"
    />
  );
}
