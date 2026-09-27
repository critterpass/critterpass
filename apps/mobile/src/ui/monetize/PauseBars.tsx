import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';

import { GrowBar } from '../data/LinearBar';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface PauseMonth {
  /** Narrow label ("N"). */
  readonly label: string;
  /** Full name for screen readers ("November"). */
  readonly name: string;
  readonly paused: boolean;
  /** The trip month that stays active (tall, yellow). */
  readonly trip?: boolean;
}

export interface PauseBarsProps {
  readonly months: readonly PauseMonth[];
  readonly testID?: string;
}

const PAUSED = 0.12;

const useStyles = makeStyles((th) => ({
  well: {
    height: th.space['32'] * 2,
    width: '100%',
    justifyContent: 'flex-end',
    borderRadius: th.radius.xs,
    overflow: 'hidden',
  },
}));

/** Months ahead as bars: paused months shrink to slivers, the trip month stays tall. */
export function PauseBars({ months, testID }: PauseBarsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const paused = format.list(
    locale,
    months.filter((m) => m.paused).map((m) => m.name),
  );
  const active = format.list(
    locale,
    months.filter((m) => !m.paused).map((m) => m.name),
  );
  const summary = [
    paused ? t({ id: 'common.monetize.pausedMonths', message: `Paused: ${paused}` }) : undefined,
    active ? t({ id: 'common.monetize.activeMonths', message: `Active: ${active}` }) : undefined,
  ]
    .filter(Boolean)
    .join('; ');
  return (
    <Row gap="8" testID={testID} accessible accessibilityRole="image" accessibilityLabel={summary}>
      {months.map((month, index) => (
        <Stack key={`${month.name}${index}`} gap="6" align="center" flex={1}>
          <View style={styles.well}>
            <GrowBar
              axis="y"
              index={index}
              fraction={month.paused ? PAUSED : 1}
              color={
                month.trip
                  ? theme.semantic.action.primary
                  : month.paused
                    ? theme.semantic.border.decorative
                    : theme.semantic.bg.control
              }
            />
          </View>
          <Text
            variant="label"
            color={month.trip ? theme.semantic.action.primary : theme.semantic.text.secondary}
          >
            {month.label}
          </Text>
        </Stack>
      ))}
    </Row>
  );
}
