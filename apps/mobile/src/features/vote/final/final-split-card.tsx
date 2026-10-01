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
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { bezierEasing, useLoop } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { heroAt, useDestinationsMedia } from '@/data/media/use-subject-media';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { MediaLayer } from '@/ui/media/MediaLayer';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Text } from '@/ui/text/Text';
import { makeStyles, sizeToken, useTheme } from '@/ui/theme';

import { usePlaces } from '../data/use-board';
import { stackOf, usePeople } from '../data/use-people';
import type { PollOptionView, PollView } from '../data/poll-view';
import { deadlineParts, upper } from '../format';
import { voteRoutes } from '../routes';
import { CARD_HEIGHT } from './diagonal';
import { DiagonalBand } from './diagonal-band';
import { FinalSplitHalf } from './final-split-half';
import { pendingByName, useFinalLines } from './tie-line';
import type { WordmarkMeasure } from './wordmark';

const RISE = 70;
const ENTER = bezierEasing(tokens.motion.easing.enter);

const useStyles = makeStyles((th) => ({
  card: {
    height: CARD_HEIGHT,
    borderRadius: th.radius.cardBig,
    overflow: 'hidden',
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

function sameLine(
  now: readonly [number, number],
  index: 0 | 1,
  line: number,
): readonly [number, number] {
  if (now[index] === line) return now;
  return index === 0 ? [line, now[1]] : [now[0], line];
}

export function FinalSplitCard({ poll }: { readonly poll: PollView }) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const places = usePlaces(poll.id);
  const media = useDestinationsMedia([...places.values()].flatMap((p) => (p.slug ? [p.slug] : [])));
  const people = usePeople(poll.crewId);
  const lines = useFinalLines(poll, places, people);
  const pulse = useLoop('pulse');
  const blink = useLoop('blink');
  const [width, setWidth] = useState(0);
  // Each name's line height at its own best fit; both are then set at the smaller of the two.
  const [nameLines, setNameLines] = useState<readonly [number, number]>([0, 0]);
  const onFirstName = useCallback(
    (m: WordmarkMeasure) => setNameLines((now) => sameLine(now, 0, m.designLine)),
    [],
  );
  const onSecondName = useCallback(
    (m: WordmarkMeasure) => setNameLines((now) => sameLine(now, 1, m.designLine)),
    [],
  );
  const sharedLine = Math.min(...nameLines);
  const nameScale = (index: 0 | 1) => (sharedLine > 0 ? sharedLine / nameLines[index] : 1);
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
  const photoOf = (option: PollOptionView) => {
    const slug = placeOf(option)?.slug;
    return slug === undefined ? null : heroAt(media.get(slug) ?? []);
  };
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
        <Row gap="6" align="center" style={{ flexShrink: 1 }}>
          <Animated.View style={[styles.dot, blink]} />
          <Text
            variant="label"
            color={theme.color.pink}
            numberOfLines={2}
            style={{ flexShrink: 1 }}
          >
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
          <View
            style={[styles.card, { backgroundColor: secondColour }]}
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          >
            <MediaLayer
              media={photoOf(second)}
              surface="accent"
              accent={secondColour}
              dots={false}
              testID="final-split-photo-1"
            />
            {width > 0 ? (
              <DiagonalBand width={width} colour={firstColour} photo={photoOf(first)} />
            ) : null}
            <FinalSplitHalf
              option={first}
              place={placeOf(first)}
              alignEnd={false}
              people={people}
              wiggleOffset={0}
              nameScale={nameScale(0)}
              onNameMeasure={onFirstName}
            />
            <FinalSplitHalf
              option={second}
              place={placeOf(second)}
              alignEnd
              people={people}
              wiggleOffset={0.2}
              nameScale={nameScale(1)}
              onNameMeasure={onSecondName}
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
              <Text
                variant="label"
                color={theme.semantic.action.primary}
                numberOfLines={2}
                testID="final-to-go"
              >
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
