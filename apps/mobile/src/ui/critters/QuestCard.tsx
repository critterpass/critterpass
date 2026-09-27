import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SecondaryText } from '../cards/SecondaryText';
import { SegmentedProgress } from '../data/SegmentedProgress';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface QuestCardProps {
  readonly title: string;
  readonly description: string;
  /** Title and pip colour. */
  readonly color: string;
  /** Pip progress; or pass `people` for all-hands quests. */
  readonly progress?: { readonly done: number; readonly total: number };
  /** Avatars of who has done it. */
  readonly people?: ReactNode;
  /** "Reward · legendary critter". */
  readonly reward: string;
  readonly rewardSticker?: ReactNode;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['10'],
  },
}));

/** A crew quest: accent title, what to do, progress (pips or faces) and the reward. */
export function QuestCard({
  title,
  description,
  color,
  progress,
  people,
  reward,
  rewardSticker,
  testID,
}: QuestCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Row gap="12" align="center" style={styles.card} testID={testID}>
      <Stack gap="8" flex={1}>
        <Stack
          gap="2"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${title}. ${description}. ${reward}`}
        >
          <Text variant="h3" color={color}>
            {title}
          </Text>
          <SecondaryText>{description}</SecondaryText>
          <Text variant="label" color={theme.semantic.text.secondary}>
            {reward}
          </Text>
        </Stack>
        {progress ? (
          <SegmentedProgress
            total={progress.total}
            done={progress.done}
            color={color}
            label={title}
          />
        ) : null}
        {people}
      </Stack>
      {rewardSticker ? (
        <View importantForAccessibility="no-hide-descendants">{rewardSticker}</View>
      ) : null}
    </Row>
  );
}
