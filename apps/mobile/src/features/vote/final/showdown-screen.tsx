/**
 * The showdown (3c-1): the final full screen, one place per half with its guide's line, the tool
 * chips (flight hours, price each, best months) and who voted for it; the VS disc pulses where the
 * halves meet. Tapping a half casts or changes the vote: the half squashes from the VS edge, the
 * disc punches toward it, a medium haptic lands, and a crewmate changing their mind slides their
 * avatar across. The viewer's side is marked; until they vote a hint says so; voting against the
 * way the crew leans gets a word from the guide. Once the poll closes the reveal takes over.
 */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { impact, toast, useLoop } from '@/motion';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Row } from '@/ui/layout/Row';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, sizeToken, useTheme } from '@/ui/theme';

import { usePlaces } from '../data/use-board';
import { useCastBallot } from '../data/use-cast-ballot';
import { usePitchSections } from '../data/use-final';
import { useMyUid } from '../data/use-my-uid';
import { usePeople } from '../data/use-people';
import { usePoll } from '../data/use-poll';
import type { PollOptionView, PollView } from '../data/poll-view';
import { deadlineParts, guideOr, upper } from '../format';
import { voteRoutes } from '../routes';
import { ShowdownHalf } from './showdown-half';
import { useFinalLines } from './tie-line';

/** How far the VS disc punches toward the chosen half. */
const PUNCH = 34;

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.semantic.bg.base },
  vsWrap: { height: 0, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  vs: {
    width: sizeToken(th.size.fab, 'size'),
    height: sizeToken(th.size.fab, 'size'),
    borderRadius: sizeToken(th.size.fab, 'size') / 2,
    borderWidth: sizeToken(th.size.fab, 'ringWidth'),
    borderColor: th.color.paper.base,
    backgroundColor: th.semantic.bg.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { position: 'absolute', left: 0, right: 0, paddingHorizontal: th.space['20'], zIndex: 3 },
  footer: {
    position: 'absolute',
    left: th.space['16'],
    right: th.space['16'],
    backgroundColor: th.semantic.bg.base,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['4'],
  },
}));

export function ShowdownView({ poll }: { readonly poll: PollView }) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const places = usePlaces(poll.id);
  const people = usePeople(poll.crewId);
  const sectionsOf = usePitchSections(poll.id);
  const lines = useFinalLines(poll, places, people);
  const { cast } = useCastBallot(poll);
  const pulse = useLoop('pulse');
  const punch = useSharedValue(0);
  const punchStyle = useAnimatedStyle(() => ({ transform: [{ translateY: punch.value }] }));
  useEffect(() => {
    if (poll.status === 'closed') router.replace(voteRoutes.reveal(poll.id));
  }, [poll.status, poll.id]);
  const [first, second] = poll.options;
  if (first === undefined || second === undefined) return null;
  const placeOf = (option: PollOptionView) =>
    option.refId === null ? undefined : places.get(option.refId);
  const vote = (option: PollOptionView, direction: 1 | -1) => async () => {
    impact('vote');
    punch.value = withSequence(
      withTiming(direction * PUNCH, { duration: tokens.motion.duration.fast }),
      withTiming(0, { duration: tokens.motion.duration.base }),
    );
    const cast_ = await cast(option.id);
    const other = option.id === first.id ? second : first;
    if (cast_ && other.votes > option.votes) {
      const guide = GUIDE_STICKERS[guideOr(placeOf(option)?.guide)];
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        id: `showdown-underdog-${option.id}`,
        title: t({
          id: 'vote.showdown.underdog',
          message: `${guide.name} likes an underdog. Bold pick.`,
        }),
      });
    }
  };
  const deadline =
    poll.closesAt === null ? null : deadlineParts(i18n.locale, poll.closesAt, new Date());
  const votesLine = t({
    id: 'vote.showdown.tally',
    message: `${poll.votedCount} votes · ${lines.toGo ?? ''}`,
  });
  return (
    <View style={styles.screen} testID="showdown">
      <View style={[styles.header, { top: insets.top + theme.space['8'] }]}>
        <Row justify="space-between" align="center">
          <BackEyebrow
            label={t({ id: 'vote.showdown.back', message: 'Next trip · final' })}
            color={theme.semantic.text.onAccent}
            testID="showdown-back"
          />
          {deadline === null || deadline.kind === 'past' ? null : (
            <Text variant="label" color={theme.semantic.text.onAccent}>
              {upper(
                deadline.kind === 'hours'
                  ? t({ id: 'vote.showdown.closesHours', message: `Closes in ${deadline.hours}h` })
                  : t({ id: 'vote.showdown.closesDay', message: `Closes ${deadline.day}` }),
                i18n.locale,
              )}
            </Text>
          )}
        </Row>
      </View>
      <Stack style={{ flex: 1 }}>
        <ShowdownHalf
          option={first}
          place={placeOf(first)}
          people={people}
          sectionsOf={sectionsOf}
          alignEnd={false}
          onVote={poll.canVote ? () => void vote(first, -1)() : undefined}
          squashKey={first.mine ? 1 : 0}
        />
        <View style={styles.vsWrap} importantForAccessibility="no-hide-descendants">
          <Animated.View style={punchStyle}>
            <Animated.View style={[styles.vs, pulse]}>
              <Text variant="h3" color={theme.semantic.action.primary}>
                {upper(t({ id: 'vote.final.vs', message: 'vs' }), i18n.locale)}
              </Text>
            </Animated.View>
          </Animated.View>
        </View>
        <ShowdownHalf
          option={second}
          place={placeOf(second)}
          people={people}
          sectionsOf={sectionsOf}
          alignEnd
          onVote={poll.canVote ? () => void vote(second, 1)() : undefined}
          squashKey={second.mine ? 1 : 0}
        />
      </Stack>
      <View
        style={[styles.footer, { bottom: insets.bottom + theme.space['8'] }]}
        testID="showdown-footer"
      >
        <Text variant="label" color={theme.semantic.action.primary}>
          {upper(votesLine, i18n.locale)}
        </Text>
        {poll.myOptionId === null ? (
          <Text variant="bodySm" testID="showdown-hint">
            {t({ id: 'vote.showdown.hint', message: "You haven't voted yet. Tap a side." })}
          </Text>
        ) : null}
        {lines.tieFull === null ? null : (
          <Text variant="bodySm" testID="showdown-tie">
            {lines.tieFull}
          </Text>
        )}
      </View>
    </View>
  );
}

export function ShowdownScreen({ pollId }: { readonly pollId: string }) {
  const me = useMyUid();
  const { poll } = usePoll(pollId, me);
  if (poll === null) return null;
  return <ShowdownView poll={poll} />;
}
