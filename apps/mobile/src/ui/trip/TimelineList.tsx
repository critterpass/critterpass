import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface TimelineItem {
  readonly id: string;
  /** Pre-formatted clock time ("06:10"). */
  readonly time: string;
  readonly title: string;
  readonly detail?: string;
}

export interface TimelineListProps {
  readonly items: readonly TimelineItem[];
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  row: {
    gap: th.space['16'],
    paddingVertical: th.space['12'],
    borderTopWidth: th.space['2'] / 2,
    borderTopColor: th.color.divider,
  },
  time: { width: th.space['32'] + th.space['16'], paddingTop: th.space['2'] },
}));

/** The rest of the day: mono time, title and detail per stop. */
export function TimelineList({ items, testID }: TimelineListProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack testID={testID}>
      {items.map((item) => (
        <Row
          key={item.id}
          style={styles.row}
          accessible
          accessibilityRole="text"
          accessibilityLabel={[item.time, item.title, item.detail].filter(Boolean).join(', ')}
        >
          <Text variant="monoData" color={theme.semantic.text.secondary} style={styles.time}>
            {item.time}
          </Text>
          <Stack gap="2" flex={1}>
            <Text variant="title">{item.title}</Text>
            {item.detail ? <SecondaryText>{item.detail}</SecondaryText> : null}
          </Stack>
        </Row>
      ))}
    </Stack>
  );
}
