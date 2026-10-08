/**
 * One place on the destination board (3b-2): the place's guide sticker, floating on its own loop
 * (4–5 s, staggered by the board layout), with its name on a rotated label in the place colour and
 * the avatars of who voted for it. A new vote drops onto the label with a bounce. Tapping votes for
 * the place; a long press offers to take it off the board (its proposer or the organiser).
 */
import { tokens } from '@cp/design-tokens';
import type { BoardItemLayout } from '@cp/domain';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { bezierEasing, useLoop } from '@/motion';
import { guideSticker } from '@/ui/avatar/guides';
import { Row } from '@/ui/layout/Row';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { LiveSticker } from '@/ui/people/LiveSticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { BoardPlace } from '../data/use-board';
import type { Person } from '../data/use-people';
import { stackOf } from '../data/use-people';
import type { PollOptionView } from '../data/poll-view';
import { upper } from '../format';

const BACK = bezierEasing(tokens.motion.easing.back);

const useStyles = makeStyles((th) => ({
  item: { position: 'absolute', alignItems: 'center' },
  label: {
    marginTop: -th.space['12'],
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
    borderRadius: th.radius.md,
    borderWidth: th.ring.cutout.widthPt,
    borderColor: th.semantic.bg.base,
  },
}));

export interface BoardStickerProps {
  readonly option: PollOptionView;
  readonly place: BoardPlace | undefined;
  readonly layout: BoardItemLayout;
  /** Board width in points (layout coordinates are in board widths). */
  readonly width: number;
  readonly people: ReadonlyMap<string, Person>;
  readonly onVote: (() => void) | undefined;
  readonly onLongPress: (() => void) | undefined;
  readonly index: number;
}

export function BoardSticker({
  option,
  place,
  layout,
  width,
  people,
  onVote,
  onLongPress,
  index,
}: BoardStickerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const size = layout.size * width;
  const float = useLoop('float', { offset: layout.floatDelayMs / layout.floatMs });
  const drop = useSharedValue(1);
  const votes = useRef(option.votes);
  useEffect(() => {
    if (option.votes > votes.current) {
      drop.value = withSequence(
        withTiming(0.82, { duration: tokens.motion.duration.instant }),
        withTiming(1, { duration: tokens.motion.duration.fast, easing: BACK }),
      );
    }
    votes.current = option.votes;
  }, [option.votes, drop]);
  const dropStyle = useAnimatedStyle(() => ({ transform: [{ scale: drop.value }] }));
  const guide = guideSticker(place?.guide ?? 'tokek');
  const name = place?.name ?? option.label;
  const colour = place?.colour ?? theme.color.yellow;
  const count = option.votes;
  const label = [
    name,
    t({ id: 'vote.board.votes', message: plural(count, { one: '# vote', other: '# votes' }) }),
    option.mine ? t({ id: 'vote.board.yours', message: 'your vote' }) : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
  return (
    <View
      style={[
        styles.item,
        {
          left: layout.cx * width - size / 2,
          top: layout.cy * width - size / 2,
          width: size,
          transform: [{ rotate: `${layout.rotationDeg}deg` }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: option.mine, disabled: onVote === undefined }}
        onPress={onVote}
        onLongPress={onLongPress}
        testID={`board-sticker-${index}`}
      >
        <Animated.View style={float}>
          <LiveSticker kind={guide.kind} name={guide.name} size={size * 0.78} drawOn={false} />
        </Animated.View>
        <Animated.View style={[styles.label, { backgroundColor: colour }, dropStyle]}>
          <Row gap="6" align="center">
            <Text variant="label" color={theme.semantic.text.onAccent} numberOfLines={1}>
              {upper(name, i18n.locale)}
            </Text>
            {option.voterIds.length > 0 ? (
              <AvatarStack members={stackOf(people, option.voterIds)} size="sm" max={3} />
            ) : null}
          </Row>
        </Animated.View>
      </Pressable>
    </View>
  );
}
