/**
 * The final on Home (3b-6): once two places are left the board folds into a split card that rises
 * in (translateY 70 → 0, 560 ms after a 160 ms beat). Two halves in the places' colours split on
 * a diagonal (62/38), each guide wiggling, the VS disc pulsing between them; under it the tally
 * strip (one segment per voter, pending ones dashed), who is still to vote with their faces
 * bobbing, and "You voted Kyoto. A tie goes to Kyoto." Tapping opens the showdown.
 */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { bezierEasing, useLoop } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { LiveSticker } from '@/ui/people/LiveSticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, sizeToken, useTheme } from '@/ui/theme';

import { usePlaces, type BoardPlace } from '../data/use-board';
import { stackOf, usePeople } from '../data/use-people';
import type { PollOptionView, PollView } from '../data/poll-view';
import { deadlineParts, upper } from '../format';
import { voteRoutes } from '../routes';
import { pendingByName, useFinalLines } from './tie-line';

const CARD_HEIGHT = 262;
const RISE = 70;
const ENTER = bezierEasing(tokens.motion.easing.enter);
/** The diagonal between the halves (3b-6's 62/38 split). */
// eslint-disable-next-line lingui/no-unlocalized-strings -- style values, never copy.
const DIAGONAL = { left: '56%', transform: [{ rotate: '12deg' }] } as const;

const useStyles = makeStyles((th) => ({
  card: {
    height: CARD_HEIGHT,
    borderRadius: th.radius.cardBig,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  half: { justifyContent: 'space-between', padding: th.space['16'] },
  divider: {
    position: 'absolute',
    top: -CARD_HEIGHT / 2,
    bottom: -CARD_HEIGHT / 2,
    width: CARD_HEIGHT,
  },
  vsWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  strip: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
    gap: th.space['8'],
  },
  segment: { flex: 1, height: 10, borderRadius: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: th.color.pink },
}));

function Half({
  option,
  place,
  width,
  alignEnd,
  people,
  wiggleOffset,
}: {
  readonly option: PollOptionView;
  readonly place: BoardPlace | undefined;
  readonly width: `${number}%`;
  readonly alignEnd: boolean;
  readonly people: ReturnType<typeof usePeople>;
  readonly wiggleOffset: number;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  const wiggle = useLoop('wiggle', { offset: wiggleOffset });
  const guide = GUIDE_STICKERS[place?.guide ?? 'tokek'];
  const ink = theme.semantic.text.onAccent;
  return (
    <View
      style={[
        styles.half,
        {
          width,
          backgroundColor: place?.colour ?? theme.color.yellow,
          alignItems: alignEnd ? 'flex-end' : 'flex-start',
        },
      ]}
    >
      <Text variant="h1" color={ink} numberOfLines={1}>
        {upper(place?.name ?? option.label, i18n.locale)}
      </Text>
      <Animated.View style={wiggle}>
        <LiveSticker kind={guide.kind} name={guide.name} size={96} drawOn={false} />
      </Animated.View>
      <Row gap="6" align="center">
        {option.voterIds.length > 0 ? (
          <AvatarStack members={stackOf(people, option.voterIds)} size="sm" max={4} />
        ) : null}
        <Text variant="title" color={ink}>
          {String(option.votes)}
        </Text>
      </Row>
    </View>
  );
}

export function FinalSplitCard({ poll }: { readonly poll: PollView }) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const places = usePlaces(poll.id);
  const people = usePeople(poll.crewId);
  const lines = useFinalLines(poll, places, people);
  const pulse = useLoop('pulse');
  const blink = useLoop('blink');
  const reduced = useReducedImpactMotion();
  const rise = useSharedValue(reduced ? 0 : RISE);
  const fade = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    rise.value = withDelay(
      160,
      withTiming(0, { duration: tokens.motion.duration.slow, easing: ENTER }),
    );
    fade.value = withDelay(
      160,
      withTiming(1, { duration: tokens.motion.duration.slow, easing: ENTER }),
    );
  }, [rise, fade, reduced]);
  const riseStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: rise.value }],
  }));
  const [first, second] = poll.options;
  if (first === undefined || second === undefined) return null;
  const placeOf = (option: PollOptionView) =>
    option.refId === null ? undefined : places.get(option.refId);
  const deadline =
    poll.closesAt === null ? null : deadlineParts(i18n.locale, poll.closesAt, new Date());
  const status =
    deadline === null || deadline.kind === 'past'
      ? t({ id: 'vote.final.status', message: 'Final' })
      : deadline.kind === 'hours'
        ? t({ id: 'vote.final.statusHours', message: `Final · closes in ${deadline.hours}h` })
        : t({ id: 'vote.final.statusDay', message: `Final · closes ${deadline.day}` });
  const pending = stackOf(people, pendingByName(poll, people)).map((member) => ({
    ...member,
    pending: true,
  }));
  const firstColour = placeOf(first)?.colour ?? theme.color.orange;
  const secondColour = placeOf(second)?.colour ?? theme.color.blue;
  const segments = [
    ...first.voterIds.map(() => firstColour),
    ...second.voterIds.map(() => secondColour),
    ...poll.pendingIds.map(() => null),
  ];
  return (
    <Stack gap="12" testID="final-split">
      <Row justify="space-between" align="center" gap="8">
        <Text variant="h2" accessibilityRole="header">
          {upper(t({ id: 'vote.board.title', message: 'Where next?' }), i18n.locale)}
        </Text>
        <Row gap="6" align="center">
          <Animated.View style={[styles.dot, blink]} />
          <Text variant="label" color={theme.color.pink} numberOfLines={1}>
            {upper(status, i18n.locale)}
          </Text>
        </Row>
      </Row>
      <Animated.View style={riseStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t({
            id: 'vote.final.open',
            message: `Final: ${placeOf(first)?.name ?? first.label} or ${placeOf(second)?.name ?? second.label}`,
          })}
          onPress={() => router.push(voteRoutes.showdown(poll.id))}
          testID="final-split-open"
        >
          <View style={styles.card}>
            <Half
              option={first}
              place={placeOf(first)}
              width="62%"
              alignEnd={false}
              people={people}
              wiggleOffset={0}
            />
            <Half
              option={second}
              place={placeOf(second)}
              width="38%"
              alignEnd
              people={people}
              wiggleOffset={0.2}
            />
            <View
              pointerEvents="none"
              style={[styles.divider, DIAGONAL, { backgroundColor: secondColour, zIndex: -1 }]}
            />
            <View pointerEvents="none" style={styles.vsWrap}>
              <Animated.View style={[styles.vs, pulse]}>
                <Text variant="h3" color={theme.semantic.action.primary}>
                  {upper(t({ id: 'vote.final.vs', message: 'vs' }), i18n.locale)}
                </Text>
              </Animated.View>
            </View>
          </View>
        </Pressable>
      </Animated.View>
      <View style={styles.strip} testID="final-strip">
        <Row gap="4">
          {segments.map((colour, index) => (
            <View
              key={index}
              style={[
                styles.segment,
                colour === null
                  ? {
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: theme.semantic.text.secondary,
                    }
                  : { backgroundColor: colour },
              ]}
            />
          ))}
        </Row>
        <Row justify="space-between" align="center" gap="8">
          <Stack gap="2" style={{ flex: 1 }}>
            {lines.toGo === null ? null : (
              <Text variant="label" color={theme.semantic.action.primary}>
                {upper(lines.toGo, i18n.locale)}
              </Text>
            )}
            <Text variant="bodySm" testID="final-lines">
              {[
                poll.myOptionId === null
                  ? t({ id: 'vote.final.notVoted', message: "You haven't voted yet." })
                  : lines.voted,
                lines.tieShort,
              ]
                .filter((line) => line !== null)
                .join(' ')}
            </Text>
          </Stack>
          {pending.length > 0 ? <AvatarStack members={pending} size="sm" max={4} /> : null}
        </Row>
      </View>
    </Stack>
  );
}
