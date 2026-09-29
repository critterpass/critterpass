/**
 * The winner reveal (3c-2): the winner's colour takes the screen, its name stamps down while the
 * guide hops in front of the turning rays and confetti fires once; the tally card follows, the
 * losing guide takes it well, and the organiser gets "SET UP KYOTO" while everyone else learns who
 * has the setup. Opening it files `mark_reveal_seen`, so each person sees it once on any device.
 * Viewers who missed the vote or whose pick lost get their own line; reduced motion drops the rays
 * and confetti and fades the stamp in.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCommand } from '@/data/commands/use-command';
import { patterns, useLoop } from '@/motion';
import { deviceTier } from '@/motion/device-tier';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { LiveSticker } from '@/ui/people/LiveSticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import { ResultTally } from '@/ui/vote/ResultTally';

import { useIsOrganiser, usePlaces } from '../data/use-board';
import { originCity, useOrganiserName, useRevealSeenOnOpen } from '../data/use-final';
import { useMyUid } from '../data/use-my-uid';
import { stackOf, usePeople } from '../data/use-people';
import { usePoll } from '../data/use-poll';
import type { PollOptionView, PollView } from '../data/poll-view';
import { markRevealSeenCommand } from '../data/vote-commands';
import { guideOr, money, upper } from '../format';
import { pollScore } from '../poll/poll-result';
import { voteRoutes } from '../routes';

const RAY_COUNT = 12;
/** Where the confetti bursts from: under the stamped name. */
const CONFETTI_ORIGIN = { x: 200, y: 300 } as const;

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, overflow: 'hidden' },
  rays: {
    position: 'absolute',
    top: -200,
    left: -200,
    right: -200,
    height: 800,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ray: { position: 'absolute', width: 60, height: 800, opacity: 0.14 },
  body: { flex: 1, paddingHorizontal: th.space['20'], gap: th.space['16'] },
  card: {
    backgroundColor: th.semantic.bg.base,
    borderRadius: th.radius.lg,
    padding: th.space['16'],
    gap: th.space['12'],
  },
}));

function Rays({ ink }: { readonly ink: string }) {
  const styles = useStyles();
  const rays = patterns.useRays(true);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.rays, rays.style, rays.visible ? null : { opacity: 0 }]}
      testID="reveal-rays"
    >
      {Array.from({ length: RAY_COUNT }, (_, index) => (
        <View
          key={index}
          style={[
            styles.ray,
            { backgroundColor: ink, transform: [{ rotate: `${(index * 180) / RAY_COUNT}deg` }] },
          ]}
        />
      ))}
    </Animated.View>
  );
}

function nameOf(option: PollOptionView, places: ReturnType<typeof usePlaces>): string {
  return (option.refId === null ? undefined : places.get(option.refId)?.name) ?? option.label;
}

export function WinnerRevealView({ poll, me }: { readonly poll: PollView; readonly me: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const places = usePlaces(poll.id);
  const people = usePeople(poll.crewId);
  const organiser = useIsOrganiser(poll, me);
  const organiserName = useOrganiserName(poll);
  const reduced = useReducedImpactMotion();
  const seen = useCommand(markRevealSeenCommand);
  const stamp = patterns.useStamp({ active: true });
  const hop = useLoop('hop');
  const fired = useRef(false);
  const send = seen.send;
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void send({ poll_id: poll.id });
    if (!reduced) triggerConfettiOnce();
  }, [poll.id, reduced, send]);

  const winner = poll.options.find((option) => option.winner);
  const loser = poll.options.find((option) => !option.winner);
  if (winner === undefined) return null;
  const winnerPlace = winner.refId === null ? undefined : places.get(winner.refId);
  const winnerName = nameOf(winner, places);
  const loserName = loser === undefined ? null : nameOf(loser, places);
  const loserGuide =
    loser === undefined
      ? null
      : GUIDE_STICKERS[guideOr(loser.refId === null ? null : places.get(loser.refId)?.guide)];
  const guide = GUIDE_STICKERS[guideOr(winnerPlace?.guide)];
  const colour = winnerPlace?.colour ?? theme.color.orange;
  const ink = theme.semantic.text.onAccent;
  const missed = poll.eligibleIds.includes(me) && poll.myOptionId === null;
  const lost = poll.myOptionId !== null && poll.myOptionId !== winner.id;
  const tie = poll.tieBreak;
  const setUp = () => {
    if (poll.tripId === null) return;
    const href = voteRoutes.tripSetup(poll.tripId);
    if (href === undefined) router.back();
    else router.replace(href);
  };
  const rows = poll.options.map((option) => ({
    id: option.id,
    name: upper(nameOf(option, places), i18n.locale),
    votes: option.votes,
    winner: option.winner,
    voters:
      option.voterIds.length > 0 ? (
        <AvatarStack members={stackOf(people, option.voterIds)} size="sm" max={8} />
      ) : undefined,
    color: option.winner
      ? colour
      : ((option.refId === null ? undefined : places.get(option.refId)?.colour) ??
        theme.color.ink['600']),
  }));
  return (
    <View style={[styles.screen, { backgroundColor: colour }]} testID="winner-reveal">
      <Rays ink={ink} />
      <Stack
        style={[styles.body, { paddingTop: insets.top + theme.space['16'] }]}
        align="center"
        gap="12"
      >
        <Text variant="label" color={ink}>
          {upper(t({ id: 'vote.reveal.header', message: 'Where next? · Final' }), i18n.locale)}
        </Text>
        <Text variant="label" color={ink}>
          {upper(
            t({
              id: 'vote.reveal.voted',
              message: `${poll.votedCount} of ${poll.eligibleIds.length} voted`,
            }),
            i18n.locale,
          )}
        </Text>
        <Animated.View style={stamp} testID="reveal-stamp">
          <Text variant="displayMega" color={ink} autoFit accessibilityRole="header">
            {upper(winnerName, i18n.locale)}
          </Text>
          <Text variant="h2" color={ink} style={{ textAlign: 'center' }}>
            {upper(t({ id: 'vote.reveal.wins', message: `Wins ${pollScore(poll)}` }), i18n.locale)}
          </Text>
        </Animated.View>
        <Animated.View style={hop}>
          <LiveSticker kind={guide.kind} name={guide.name} size={120} drawOn={false} />
        </Animated.View>
      </Stack>
      <View
        style={[
          styles.body,
          { flex: 0, paddingBottom: insets.bottom + theme.space['16'], gap: theme.space['12'] },
        ]}
      >
        <View style={styles.card}>
          <ResultTally headline={winnerName} rows={rows} testID="reveal-tally" />
          {loserGuide === null ? null : (
            <Text variant="bodySm" testID="reveal-consolation">
              {t({
                id: 'vote.reveal.consolation',
                message: `${loserGuide.name} took it well. Already pitching the next trip.`,
              })}
            </Text>
          )}
          {tie === null ? null : (
            <Text variant="bodySm" testID="reveal-tie">
              {t({
                id: 'vote.reveal.tie',
                message: `It was a tie. ${winnerName} won it: ${money(i18n.locale, tie.cheaperByMinor, tie.currency)} cheaper for the ${tie.memberCount} flying from ${originCity(tie.origin)}.`,
              })}
            </Text>
          )}
          {missed ? (
            <Text variant="bodySm" testID="reveal-missed">
              {t({
                id: 'vote.reveal.missed',
                message: `You missed this vote. The crew picked ${winnerName}.`,
              })}
            </Text>
          ) : null}
          {lost ? (
            <Text variant="bodySm" testID="reveal-lost">
              {t({
                id: 'vote.reveal.lost',
                message: `Your pick lost this time. ${winnerName} it is.`,
              })}
            </Text>
          ) : null}
        </View>
        {organiser ? (
          <PillButton
            label={upper(
              t({ id: 'vote.reveal.setUp', message: `Set up ${winnerName}` }),
              i18n.locale,
            )}
            onPress={setUp}
            testID="reveal-set-up"
          />
        ) : (
          <Text
            variant="body"
            color={ink}
            style={{ textAlign: 'center' }}
            testID="reveal-setup-with"
          >
            {organiserName === null
              ? t({
                  id: 'vote.reveal.setupWithOrganiser',
                  message: 'The organiser sets it up next.',
                })
              : t({ id: 'vote.reveal.setupWith', message: `Setup is with ${organiserName}.` })}
          </Text>
        )}
        {loserName === null ? null : (
          <Text variant="bodySm" color={ink} style={{ textAlign: 'center' }}>
            {t({
              id: 'vote.reveal.backInDeck',
              message: `${loserName} goes back in the deck for next time`,
            })}
          </Text>
        )}
      </View>
    </View>
  );
}

function triggerConfettiOnce(): void {
  patterns.triggerConfetti(CONFETTI_ORIGIN.x, CONFETTI_ORIGIN.y, 'large', deviceTier);
}

/**
 * The reveal plays once: a reveal this user has already seen (a cold start restoring this screen,
 * or another device having shown it) leaves for where the user came from instead of replaying.
 */
export function WinnerRevealScreen({ pollId }: { readonly pollId: string }) {
  const me = useMyUid();
  const { poll } = usePoll(pollId, me);
  const seenBefore = useRevealSeenOnOpen(pollId, me);
  useEffect(() => {
    if (seenBefore !== true) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [seenBefore]);
  if (poll === null || me === null || poll.status !== 'closed' || seenBefore !== false) {
    return null;
  }
  return <WinnerRevealView poll={poll} me={me} />;
}
