import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

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
  /** An action or a state of the quest itself, under the reward line ("I'm in", "You're in"). */
  readonly footer?: ReactNode;
  readonly testID?: string;
}

/** The title's size in the design (19 pt, the small end of the card-hero range). */
const TITLE_SIZE = 20;

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.cardBig,
    paddingVertical: th.space['14'],
    paddingHorizontal: th.space['16'],
  },
  pips: { flexDirection: 'row', gap: th.space['4'] },
  pip: { width: th.space['16'] + th.space['2'], height: th.space['8'], borderRadius: th.radius.xs },
  footer: { alignItems: 'flex-start' },
}));

function Pips({
  done,
  total,
  color,
  label,
}: {
  readonly done: number;
  readonly total: number;
  readonly color: string;
  readonly label: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const filled = Math.min(total, Math.max(0, done));
  const count = t({ id: 'common.data.nOfTotalDone', message: `${filled} of ${total} done` });
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}, ${count}`}
      accessibilityValue={{ min: 0, max: total, now: filled }}
      style={styles.pips}
    >
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[
            styles.pip,
            { backgroundColor: index < filled ? color : theme.semantic.border.decorative },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * A crew quest: the accent title, what to do, progress (short pips, or faces for an all-hands
 * quest), then the reward line, with the reward's art at the end of the card.
 */
export function QuestCard({
  title,
  description,
  color,
  progress,
  people,
  reward,
  rewardSticker,
  footer,
  testID,
}: QuestCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Row gap="12" align="center" style={styles.card} testID={testID}>
      <Stack gap="6" flex={1}>
        <Stack
          gap="6"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${title}. ${description}. ${reward}`}
        >
          <Text variant="h3" designSize={TITLE_SIZE} color={color}>
            {title}
          </Text>
          <Text variant="bodySm">{description}</Text>
        </Stack>
        {progress ? (
          <Pips total={progress.total} done={progress.done} color={color} label={title} />
        ) : null}
        {people}
        {/* Spoken with the title above. */}
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text variant="label" color={theme.semantic.text.secondary}>
            {reward}
          </Text>
        </View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </Stack>
      {rewardSticker ? (
        <View importantForAccessibility="no-hide-descendants">{rewardSticker}</View>
      ) : null}
    </Row>
  );
}
