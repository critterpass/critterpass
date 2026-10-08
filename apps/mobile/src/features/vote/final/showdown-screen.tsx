/**
 * The showdown (3c-1): the final full screen, one place per half with its guide's line and the tool
 * chips (flight hours, price each, best months); the top side's voters sit under its chips and the
 * bottom side's in the tally card, with who is still to vote; the VS disc pulses where the halves
 * meet. Tapping a half casts or changes the vote: the half squashes from the VS edge, the
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
import { guideSticker } from '@/ui/avatar/guides';
import { Row } from '@/ui/layout/Row';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';
import { Text } from '@/ui/text/Text';
import { makeStyles, sizeToken, useTheme } from '@/ui/theme';

import { heroAt, useDestinationsMedia } from '@/data/media/use-subject-media';

import { usePlaces } from '../data/use-board';
import { useCastBallot } from '../data/use-cast-ballot';
import { usePitchSections } from '../data/use-final';
import { useMyUid } from '../data/use-my-uid';
import { stackOf, usePeople } from '../data/use-people';
import { usePoll } from '../data/use-poll';
import type { PollOptionView, PollView } from '../data/poll-view';
import { deadlineParts, guideOr, upper } from '../format';
import { voteRoutes } from '../routes';
import { ShowdownHalf } from './showdown-half';
import { useShowdownNames } from './showdown-name-fit';
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
  },
  footerLines: { flex: 1, gap: th.space['4'] },
}));

/** The tally card lists this many of the bottom side's voters before "+n". */
const FOOTER_AVATARS = 4;

export function ShowdownView({ poll }: { readonly poll: PollView }) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const places = usePlaces(poll.id);
  const media = useDestinationsMedia([...places.values()].flatMap((p) => (p.slug ? [p.slug] : [])));
  const photoOf = (slug: string | undefined) =>
    slug === undefined ? null : heroAt(media.get(slug) ?? []);
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
  const topInset = headerTop + headerHeight + theme.space['4'];
  const bottomInset = footerBottom + footerHeight + theme.space['16'];
  // Each half reports the height it needs beside its name, and its name's size; when the two halves
  // don't fit the screen, both names are set smaller at one shared size.
  const names = useShowdownNames(
    [
      ...poll.options.map((o) =>
        o.refId === null ? o.label : (places.get(o.refId)?.name ?? o.label),
      ),
      i18n.locale,
    ].join('|'),
  );
  useEffect(() => {
    if (poll.status === 'closed') router.replace(voteRoutes.reveal(poll.id));
  }, [poll.status, poll.id]);
  const [first, second] = poll.options;
  if (first === undefined || second === undefined) return <ShowdownMissing />;
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
      const guide = guideSticker(guideOr(placeOf(option)?.guide));
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
  // The tally card speaks for the bottom side, whose voters it shows (the top side's are under its
  // chips), and says who is still to vote.
  const votesLine = t({
    id: 'vote.showdown.tally',
    message: `${second.votes} votes · ${lines.toGo ?? ''}`,
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
        onLayout={(event) => names.onViewport(event.nativeEvent.layout.height)}
        testID="showdown-body"
      >
        <ShowdownHalf
          option={first}
          place={placeOf(first)}
          photo={photoOf(placeOf(first)?.slug)}
          people={people}
          sectionsOf={sectionsOf}
          alignEnd={false}
          onVote={poll.canVote ? () => void vote(first, -1)() : undefined}
          squashKey={first.mine ? 1 : 0}
          edgeInset={topInset}
          {...names.first}
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
          photo={photoOf(placeOf(second)?.slug)}
          people={people}
          sectionsOf={sectionsOf}
          alignEnd
          onVote={poll.canVote ? () => void vote(second, 1)() : undefined}
          squashKey={second.mine ? 1 : 0}
          edgeInset={bottomInset}
          {...names.second}
        />
      </ScrollView>
      <View
        style={[styles.footer, { bottom: footerBottom }]}
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        testID="showdown-footer"
      >
        {second.voterIds.length > 0 ? (
          <View testID="showdown-votes-1">
            <AvatarStack
              members={stackOf(people, second.voterIds)}
              size="md"
              max={FOOTER_AVATARS}
            />
          </View>
        ) : null}
        <View style={styles.footerLines}>
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
    </View>
  );
}

/** A final that is not on this phone, or has fewer than two places left to choose between. */
function ShowdownMissing() {
  const { t } = useLingui();
  return (
    <ScreenMissing
      backLabel={t({ id: 'vote.showdown.back', message: 'Next trip · final' })}
      title={t({ id: 'vote.showdown.missingTitle', message: 'This vote isn’t here' })}
      line={t({
        id: 'vote.showdown.missingLine',
        message: 'It may be over, or this phone hasn’t got it yet.',
      })}
      testID="showdown-missing"
    />
  );
}

export function ShowdownScreen({ pollId }: { readonly pollId: string }) {
  const { t } = useLingui();
  const me = useMyUid();
  const { poll, loaded } = usePoll(pollId, me);
  if (poll !== null) return <ShowdownView poll={poll} />;
  if (!loaded || me === null) {
    return (
      <ScreenLoading
        backLabel={t({ id: 'vote.showdown.back', message: 'Next trip · final' })}
        label={t({ id: 'vote.showdown.loading', message: 'Loading the vote' })}
        testID="showdown-loading"
      />
    );
  }
  return <ShowdownMissing />;
}
