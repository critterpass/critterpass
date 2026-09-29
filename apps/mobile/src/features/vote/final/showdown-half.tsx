/**
 * One side of the showdown: the place's name over its colour, the guide's line from the pitch, the
 * tool chips (flight hours, price each, best months) and who voted for it. The viewer's side wears
 * a ring; choosing it squashes the half from the VS edge.
 */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { bezierEasing, useMotionMode } from '@/motion';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { GuideLine } from '@/ui/people/GuideLine';
import { LiveSticker } from '@/ui/people/LiveSticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, sizeToken, useTheme } from '@/ui/theme';

import type { BoardPlace } from '../data/use-board';
import type { usePitchSections } from '../data/use-final';
import { stackOf, type Person } from '../data/use-people';
import type { PollOptionView } from '../data/poll-view';
import { flightHours, guideOr, money, monthShort, upper } from '../format';

/** Showdown stacks show this many voters before "+n" (boosted crews reach sixteen). */
const MAX_AVATARS = 16;

const SQUASH_EASING = bezierEasing(tokens.motion.easing.standard);
/** Two segments of the 460 ms squash. */
const SQUASH_SEGMENT_MS = 230;

/**
 * The squash a half does when it becomes the viewer's pick: sx1.14/sy.86 → .94/1.06 → rest, from
 * the edge that meets the VS disc. Only the scale moves; a half is always fully visible, whether
 * or not it has ever been chosen. Reduced motion keeps it still.
 */
function useChosenSquash(chosen: boolean) {
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const [mode] = useMotionMode();
  useEffect(() => {
    if (!chosen || mode !== 'full') return;
    scaleX.value = 1.14;
    scaleY.value = 0.86;
    scaleX.value = withSequence(
      withTiming(0.94, { duration: SQUASH_SEGMENT_MS, easing: SQUASH_EASING }),
      withTiming(1, { duration: SQUASH_SEGMENT_MS, easing: SQUASH_EASING }),
    );
    scaleY.value = withSequence(
      withTiming(1.06, { duration: SQUASH_SEGMENT_MS, easing: SQUASH_EASING }),
      withTiming(1, { duration: SQUASH_SEGMENT_MS, easing: SQUASH_EASING }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [chosen, mode]);
  return useAnimatedStyle(() => ({
    transform: [{ scaleX: scaleX.value }, { scaleY: scaleY.value }],
  }));
}

const useStyles = makeStyles((th) => ({
  half: {
    flex: 1,
    padding: th.space['20'],
    overflow: 'hidden',
    gap: th.space['10'],
  },
  // Each half's content gathers at the VS disc, clear of it, so the screen header above and the
  // tally card below never cover a name or its voters.
  top: {
    justifyContent: 'flex-end',
    paddingBottom: sizeToken(th.size.fab, 'size') / 2 + th.space['16'],
  },
  bottom: {
    justifyContent: 'flex-start',
    paddingTop: sizeToken(th.size.fab, 'size') / 2 + th.space['16'],
  },
  ghost: { position: 'absolute', opacity: 0.35 },
  mine: {
    borderWidth: sizeToken(th.size.fab, 'ringWidth'),
    borderColor: th.semantic.text.onAccent,
  },
}));

function Facts({
  option,
  sectionsOf,
}: {
  readonly option: PollOptionView;
  readonly sectionsOf: ReturnType<typeof usePitchSections>;
}) {
  const { t, i18n } = useLingui();
  const sections = option.pitchId === null ? undefined : sectionsOf.get(option.pitchId);
  const locale = i18n.locale;
  const chips = (sections?.chips ?? []).flatMap((chip) => {
    switch (chip.kind) {
      case 'flight':
        return [
          upper(
            t({ id: 'vote.showdown.flight', message: `${flightHours(chip.minutes)}h flight` }),
            locale,
          ),
        ];
      case 'price':
        return [
          upper(
            t({
              id: 'vote.showdown.each',
              message: `${money(locale, chip.amount_minor, chip.currency)} each`,
            }),
            locale,
          ),
        ];
      case 'best_months':
        return [
          upper(
            t({
              id: 'vote.showdown.best',
              message: `Best ${chip.months.map((m) => monthShort(locale, m)).join(' · ')}`,
            }),
            locale,
          ),
        ];
      case 'event':
      case 'prices_pending':
        return [];
    }
  });
  if (chips.length === 0) return null;
  return (
    <Row gap="6" wrap>
      {chips.map((chip) => (
        <InfoPill key={chip} variant="outline">
          {chip}
        </InfoPill>
      ))}
    </Row>
  );
}

export function ShowdownHalf({
  option,
  place,
  people,
  sectionsOf,
  alignEnd,
  onVote,
  squashKey,
}: {
  readonly option: PollOptionView;
  readonly place: BoardPlace | undefined;
  readonly people: ReadonlyMap<string, Person>;
  readonly sectionsOf: ReturnType<typeof usePitchSections>;
  readonly alignEnd: boolean;
  readonly onVote: (() => void) | undefined;
  readonly squashKey: number;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const squash = useChosenSquash(squashKey > 0);
  const guideId = guideOr(place?.guide);
  const guide = GUIDE_STICKERS[guideId];
  const ink = theme.semantic.text.onAccent;
  const quote = option.pitchId === null ? null : (sectionsOf.get(option.pitchId)?.quote ?? null);
  const name = place?.name ?? option.label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        name,
        t({ id: 'vote.showdown.votes', message: `${option.votes} votes` }),
        option.mine ? t({ id: 'vote.showdown.yours', message: 'your vote' }) : null,
      ]
        .filter((part) => part !== null)
        .join(', ')}
      accessibilityState={{ selected: option.mine, disabled: onVote === undefined }}
      onPress={onVote}
      style={{ flex: 1 }}
      testID={`showdown-half-${alignEnd ? 1 : 0}`}
    >
      <Animated.View
        style={[
          styles.half,
          alignEnd ? styles.bottom : styles.top,
          {
            backgroundColor: place?.colour ?? theme.color.yellow,
            alignItems: alignEnd ? 'flex-end' : 'flex-start',
            // The squash grows from the edge that meets the VS disc.
            transformOrigin: alignEnd ? 'top' : 'bottom',
          },
          option.mine ? styles.mine : null,
          squash,
        ]}
      >
        <View
          style={[
            styles.ghost,
            alignEnd ? { left: -theme.space['16'] } : { right: -theme.space['16'] },
          ]}
          pointerEvents="none"
        >
          <LiveSticker kind={guide.kind} name={guide.name} size={180} drawOn={false} />
        </View>
        <Text variant="displayMega" color={ink} autoFit>
          {upper(name, i18n.locale)}
        </Text>
        {quote === null ? null : (
          <GuideLine guide={guideId} name={guide.name} line={quote} bubble />
        )}
        <Facts option={option} sectionsOf={sectionsOf} />
        <Row gap="8" align="center">
          {option.voterIds.length > 0 ? (
            <AvatarStack members={stackOf(people, option.voterIds)} size="md" max={MAX_AVATARS} />
          ) : null}
          <Text variant="title" color={ink}>
            {upper(t({ id: 'vote.showdown.count', message: `${option.votes} votes` }), i18n.locale)}
          </Text>
        </Row>
      </Animated.View>
    </Pressable>
  );
}
