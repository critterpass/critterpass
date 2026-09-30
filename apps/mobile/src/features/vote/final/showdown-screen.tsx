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
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
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
import { sharedNameSize } from './showdown-name-fit';
import { useFinalLines } from './tie-line';

/** How far the VS disc punches toward the chosen half. */
const PUNCH = 34;

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.semantic.bg.base },
  body: { flex: 1 },
  bodyContent: { flexGrow: 1 },
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

/**
 * How far one half's content runs past the height it can have without the screen scrolling: half
 * the viewport, or whatever the other half leaves when that one needs less.
 */
export function halfExcess(own: number, other: number, viewport: number): number {
  if (viewport <= 0 || own <= 0 || other <= 0) return 0;
  return Math.max(0, own - Math.max(viewport / 2, viewport - other));
}

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
  // The header and the tally card float over the halves; each half keeps their measured height
  // clear, so a name or its voters never sit under them however far the chips wrap.
  const [headerHeight, setHeaderHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const headerTop = insets.top + theme.space['8'];
  const footerBottom = insets.bottom + theme.space['8'];
  const topInset = headerTop + headerHeight + theme.space['12'];
  const bottomInset = footerBottom + footerHeight + theme.space['16'];
  // Each half reports the height its content needs; one that runs past its share shrinks its name.
  const [viewport, setViewport] = useState(0);
  const [firstHeight, setFirstHeight] = useState(0);
  const [secondHeight, setSecondHeight] = useState(0);
  // Both names set at one size: the smaller of what each half needs.
  const [firstName, setFirstName] = useState<number | null>(null);
  const [secondName, setSecondName] = useState<number | null>(null);
  const nameSize = sharedNameSize([firstName, secondName]);
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
      <View
        style={[styles.header, { top: headerTop }]}
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        testID="showdown-header"
      >
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
      {/* The halves fill the screen, and a half too tall for its share sets its name smaller first;
          what still does not fit (larger text) scrolls instead of sliding under the header or the
          tally card. */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
        testID="showdown-body"
      >
        <ShowdownHalf
          option={first}
          place={placeOf(first)}
          people={people}
          sectionsOf={sectionsOf}
          alignEnd={false}
          onVote={poll.canVote ? () => void vote(first, -1)() : undefined}
          squashKey={first.mine ? 1 : 0}
          edgeInset={topInset}
          excess={halfExcess(firstHeight, secondHeight, viewport)}
          onNaturalHeight={setFirstHeight}
          sharedNameSize={nameSize}
          onNameSize={setFirstName}
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
          edgeInset={bottomInset}
          excess={halfExcess(secondHeight, firstHeight, viewport)}
          onNaturalHeight={setSecondHeight}
          sharedNameSize={nameSize}
          onNameSize={setSecondName}
        />
      </ScrollView>
      <View
        style={[styles.footer, { bottom: footerBottom }]}
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        testID="showdown-footer"
      >
        <Text variant="label" color={theme.semantic.action.primary} numberOfLines={2}>
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
