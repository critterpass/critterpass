import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { votesLabel } from '../data/PollBars';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface VoteOption {
  readonly id: string;
  readonly name: string;
  /** Guide or place sticker. */
  readonly sticker: ReactNode;
  /** Avatars of who voted for it. */
  readonly voters?: ReactNode;
  readonly votes: number;
  readonly mine?: boolean;
  /** Name label colour (the place colour). @default action.primary */
  readonly color?: string;
}

export interface VoteBoardProps {
  /** "Where next?". */
  readonly title: string;
  /** "Vote open · 4 of 6 in". */
  readonly status?: string;
  readonly options: readonly VoteOption[];
  readonly onVote?: (id: string) => void;
  /** Trailing slot, e.g. the dashed "Pitch a place" card. */
  readonly trailing?: ReactNode;
  readonly testID?: string;
}

/** Tilted sticker-label angle for place names on the board. */
const NAME_TILT_DEG = -3;

const useStyles = makeStyles((th) => ({
  tile: { width: '31%', alignItems: 'center', gap: th.space['6'], paddingVertical: th.space['8'] },
  name: {
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['2'],
    transform: [{ rotate: `${NAME_TILT_DEG}deg` }],
  },
  mine: { borderWidth: th.ring.selected.outer.widthPt, borderColor: th.semantic.text.primary },
}));

export function voteOptionLabel(name: string, votes: number, mine: boolean | undefined): string {
  const yours = mine ? t({ id: 'common.data.yourVote', message: 'your vote' }) : undefined;
  return [name, votesLabel(votes), yours].filter(Boolean).join(', ');
}

/** Home's open vote: place stickers with tilted name labels and the voters under each. */
export function VoteBoard({ title, status, options, onVote, trailing, testID }: VoteBoardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack gap="10" testID={testID}>
      <Row justify="space-between" align="baseline" accessible accessibilityRole="header">
        <Text variant="h3">{title}</Text>
        {status ? (
          <Text variant="label" color={theme.semantic.text.secondary}>
            {status}
          </Text>
        ) : null}
      </Row>
      <Row wrap gap="8">
        {options.map((option) => (
          <PressScale
            key={option.id}
            accessibilityLabel={voteOptionLabel(option.name, option.votes, option.mine)}
            accessibilityHint={t({ id: 'common.vote.tapToVote', message: 'Votes for this place' })}
            accessibilityState={{ selected: option.mine === true }}
            {...(onVote ? { onPress: () => onVote(option.id) } : {})}
            style={styles.tile}
          >
            {option.sticker}
            <View
              style={[
                styles.name,
                { backgroundColor: option.color ?? theme.semantic.action.primary },
                option.mine ? styles.mine : null,
              ]}
            >
              <Text variant="label" color={theme.semantic.text.onAccent}>
                {option.name}
              </Text>
            </View>
            {option.voters}
          </PressScale>
        ))}
        {trailing}
      </Row>
    </Stack>
  );
}
