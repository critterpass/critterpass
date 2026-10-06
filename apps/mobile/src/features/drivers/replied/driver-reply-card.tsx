/**
 * A driver's reply on review changes (6k-1): who sent it, the quote (price a day, the total and
 * each person's share, overtime, the car) and the tips pinned to the days without a vote. The
 * suggested times are the change set's own rows, voted one by one or all at once, and the totals
 * below them (each person's change, must-dos touched) come from the cost engine as for any change.
 */
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { formatAmount } from '@/features/money/format';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { DriverReply } from '../share/data';

export interface DriverReplyCardProps {
  readonly driverName: string;
  readonly reply: DriverReply;
  readonly dayCount: number;
  readonly crewSize: number;
  readonly locale: string;
}

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['16'],
    gap: th.space['6'],
  },
  tips: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
    gap: th.space['6'],
  },
  wrap: { gap: th.space['12'] },
}));

export function DriverReplyCard(props: DriverReplyCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { reply, locale } = props;
  const money = (minor: number) => formatAmount(BigInt(minor), reply.currency ?? 'IDR', locale);
  const total =
    reply.price_per_day_minor === null ? null : reply.price_per_day_minor * props.dayCount;
  const each = total === null ? null : Math.ceil(total / Math.max(props.crewSize, 1));
  const tips = reply.tips;
  return (
    <View style={styles.wrap} testID="driver-reply">
      {total !== null && reply.price_per_day_minor !== null && each !== null && (
        <View style={styles.card} testID="driver-reply-quote">
          <Text variant="eyebrow">
            {t({ id: 'drivers.replied.quote', message: `Quote from ${props.driverName}` })}
          </Text>
          <Text variant="rowTitle">
            {t({
              id: 'drivers.replied.total',
              message: plural(props.dayCount, {
                one: `${money(total)} for the day`,
                other: `${money(total)} for # days`,
              }),
            })}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {t({
              id: 'drivers.replied.perDay',
              message: `${money(reply.price_per_day_minor)} a day · ${money(each)} each`,
            })}
          </Text>
          {reply.overtime_per_hour_minor !== null && reply.included_hours !== null && (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({
                id: 'drivers.replied.overtime',
                message: `Overtime ${money(reply.overtime_per_hour_minor)} an hour after ${reply.included_hours} hours`,
              })}
            </Text>
          )}
          {reply.car !== null && (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {reply.car}
            </Text>
          )}
        </View>
      )}
      {tips.length > 0 && (
        <View style={styles.tips} testID="driver-reply-tips">
          <Text variant="eyebrow">
            {t({
              id: 'drivers.replied.tips',
              message: plural(tips.length, {
                one: '# tip, pinned to the days · no vote',
                other: '# tips, pinned to the days · no vote',
              }),
            })}
          </Text>
          {tips.map((tip, i) => (
            <Text key={i} variant="bodySm">
              {tip.text}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
