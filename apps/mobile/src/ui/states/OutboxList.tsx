import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { SecondaryText } from '../cards/SecondaryText';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface OutboxItem {
  readonly key: string;
  /** What was written offline ("Expense · Smoothie bowls"). */
  readonly label: string;
  readonly detail?: string;
  /** `queued` waits for signal; `sent` ticks once synced. */
  readonly state: 'queued' | 'sent';
}

export interface OutboxListProps {
  readonly items: readonly OutboxItem[];
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  list: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.size.cardInner.min,
  },
  clock: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: t.semantic.text.secondary,
    alignItems: 'center',
  },
  hourHand: {
    position: 'absolute',
    top: 3,
    width: 2,
    height: 6,
    backgroundColor: t.semantic.text.secondary,
  },
  minuteHand: {
    position: 'absolute',
    top: 7,
    start: 8,
    width: 5,
    height: 2,
    backgroundColor: t.semantic.text.secondary,
  },
  tick: { width: 20, alignItems: 'center' },
}));

function Clock() {
  const styles = useStyles();
  return (
    <View style={styles.clock}>
      <View style={styles.hourHand} />
      <View style={styles.minuteHand} />
    </View>
  );
}

/** Writes made offline: a clock while queued, a tick once sent ("Sends when you're back"). */
export function OutboxList({ items, testID }: OutboxListProps) {
  const styles = useStyles();
  const theme = useTheme();
  const queued = t({ id: 'common.outbox.queued', message: 'Waiting for signal' });
  const sent = t({ id: 'common.outbox.sent', message: 'Sent' });
  return (
    <Stack gap="8" testID={testID}>
      <Text variant="eyebrow" accessibilityRole="header">
        {t({ id: 'common.outbox.title', message: "Sends when you're back" })}
      </Text>
      <Stack gap="10" style={styles.list}>
        {items.map((item) => (
          <Row
            key={item.key}
            gap="10"
            align="center"
            accessible
            accessibilityLabel={[item.label, item.detail, item.state === 'sent' ? sent : queued]
              .filter(Boolean)
              .join(', ')}
          >
            {item.state === 'sent' ? (
              <View style={styles.tick}>
                <Icon name="check" size={18} color={theme.semantic.state.success} decorative />
              </View>
            ) : (
              <Clock />
            )}
            <Stack gap="2" flex={1}>
              <Text variant="rowTitle">{item.label}</Text>
              {item.detail ? <SecondaryText>{item.detail}</SecondaryText> : null}
            </Stack>
          </Row>
        ))}
      </Stack>
    </Stack>
  );
}
