/**
 * One side of the Home final card (3b-6): the place's name, its guide wiggling and who voted for
 * it, kept to its own side of the diagonal. Both names are set at one size, the render's unless a
 * name needs less to fit its side.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLoop } from '@/motion';
import { guideSticker } from '@/ui/avatar/guides';
import { Row } from '@/ui/layout/Row';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { LiveSticker } from '@/ui/people/LiveSticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { BoardPlace } from '../data/use-board';
import { stackOf, type usePeople } from '../data/use-people';
import type { PollOptionView } from '../data/poll-view';
import { upper } from '../format';
import { Wordmark, type WordmarkMeasure } from './wordmark';

/** The size the render sets a finalist's name at on the card. */
const NAME_SIZE = 60;
/** The room a name has above or below its guide and voters: two lines of it. */
const NAME_ROOM = 104;

const useStyles = makeStyles((th) => ({
  // Each half's content keeps to its own side of the diagonal.
  half: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: th.space['16'],
  },
  // The diagonal leaves the first half the card's top and the second its bottom, where the names sit.
  firstHalf: { start: 0, width: '58%' },
  secondHalf: { end: 0, width: '56%' },
}));

export function FinalSplitHalf({
  option,
  place,
  alignEnd,
  people,
  wiggleOffset,
  nameScale,
  onNameMeasure,
}: {
  readonly option: PollOptionView;
  readonly place: BoardPlace | undefined;
  readonly alignEnd: boolean;
  readonly people: ReturnType<typeof usePeople>;
  readonly wiggleOffset: number;
  /** How much smaller than its own best fit the name is set, so both names share one size. */
  readonly nameScale: number;
  readonly onNameMeasure: (measure: WordmarkMeasure) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  const wiggle = useLoop('wiggle', { offset: wiggleOffset });
  const guide = guideSticker(place?.guide ?? 'tokek');
  const ink = theme.semantic.text.onAccent;
  const name = (
    <Wordmark
      name={upper(place?.name ?? option.label, i18n.locale)}
      variant="displayXl"
      designSize={NAME_SIZE}
      maxHeight={NAME_ROOM}
      color={ink}
      align={alignEnd ? 'end' : 'start'}
      scale={nameScale}
      testID={`final-name-${alignEnd ? 1 : 0}`}
      onMeasure={onNameMeasure}
    />
  );
  const sticker = (
    <Animated.View style={wiggle}>
      <LiveSticker kind={guide.kind} name={guide.name} size={96} drawOn={false} />
    </Animated.View>
  );
  const votes = (
    <Row gap="6" align="center">
      {option.voterIds.length > 0 ? (
        <AvatarStack members={stackOf(people, option.voterIds)} size="sm" max={4} />
      ) : null}
      <Text variant="title" color={ink}>
        {String(option.votes)}
      </Text>
    </Row>
  );
  return (
    <View
      pointerEvents="none"
      style={[
        styles.half,
        alignEnd ? styles.secondHalf : styles.firstHalf,
        { alignItems: alignEnd ? 'flex-end' : 'flex-start' },
      ]}
    >
      {alignEnd ? sticker : name}
      {alignEnd ? votes : sticker}
      {alignEnd ? name : votes}
    </View>
  );
}
