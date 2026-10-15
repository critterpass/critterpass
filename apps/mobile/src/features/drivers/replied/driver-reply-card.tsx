/**
 * A driver's reply on review changes (6k-1): who sent it, the quote (price a day, the total and
 * each person's share, overtime, the car) and the tips pinned to the days without a vote. The
 * suggested times are the change set's own rows, voted one by one or all at once, and the totals
 * below them (each person's change, must-dos touched) come from the cost engine as for any change.
 */
import { formatMoney, isKnownCurrency } from '@cp/cost-engine';
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Card, makePremiumStyles, Text } from '@/ui/premium';

import type { DriverReply } from '../share/data';

export interface DriverReplyCardProps {
  readonly driverName: string;
  readonly reply: DriverReply;
  readonly dayCount: number;
  readonly crewSize: number;
  readonly locale: string;
}

const useStyles = makePremiumStyles((th) => ({
  card: { gap: th.space.gap6 },
  tips: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: th.color.hairline,
    borderRadius: th.radius.card,
    padding: th.space.gap12,
    gap: th.space.gap6,
  },
  wrap: { gap: th.space.gap12 },
}));

export function DriverReplyCard(props: DriverReplyCardProps) {
  const styles = useStyles();
  const { reply, locale } = props;
  const currency = reply.currency ?? 'IDR';
  const money = (minor: number) => {
    const code = currency;
    return isKnownCurrency(code)
      ? formatMoney({ amountMinor: BigInt(minor), currency: code }, { locale, mode: 'local' })
      : `${currency} ${String(minor / 100)}`;
  };
  const total =
    reply.price_per_day_minor === null ? null : reply.price_per_day_minor * props.dayCount;
  const each = total === null ? null : Math.ceil(total / Math.max(props.crewSize, 1));
  const tips = reply.tips;
  return (
    <View style={styles.wrap} testID="driver-reply">
      {total !== null && reply.price_per_day_minor !== null && each !== null && (
        <Card padded style={styles.card} testID="driver-reply-quote">
          <Text variant="label" tone="muted">
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
          <Text variant="rowText" tone="muted">
            {t({
              id: 'drivers.replied.perDay',
              message: `${money(reply.price_per_day_minor)} a day · ${money(each)} each`,
            })}
          </Text>
          {reply.overtime_per_hour_minor !== null && reply.included_hours !== null && (
            <Text variant="rowText" tone="muted">
              {t({
                id: 'drivers.replied.overtime',
                message: `Overtime ${money(reply.overtime_per_hour_minor)} an hour after ${reply.included_hours} hours`,
              })}
            </Text>
          )}
          {reply.car !== null && (
            <Text variant="rowText" tone="muted">
              {reply.car}
            </Text>
          )}
        </Card>
      )}
      {tips.length > 0 && (
        <View style={styles.tips} testID="driver-reply-tips">
          <Text variant="label" tone="muted">
            {t({
              id: 'drivers.replied.tips',
              message: plural(tips.length, {
                one: '# tip, pinned to the days · no vote',
                other: '# tips, pinned to the days · no vote',
              }),
            })}
          </Text>
          {tips.map((tip, i) => (
            <Text key={i} variant="rowText">
              {tip.text}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
