/**
 * Where the sweet spot goes (4.15): one stacked bar of flights, stays, food and fun, then a row for
 * each with its amount.
 */
import { View } from 'react-native';

import { Card, Text, usePremiumTheme } from '@/ui/premium';

import { money } from '../../budget/model';

export interface BreakdownPart {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly colour: string;
}

export function BudgetBreakdown(props: {
  readonly parts: readonly BreakdownPart[];
  readonly locale: string;
  readonly currency: string;
}) {
  const theme = usePremiumTheme();
  if (props.parts.length === 0) return null;
  return (
    <Card padded testID="budget-breakdown">
      <View
        style={{ flexDirection: 'row', height: 10, gap: 2, borderRadius: 5, overflow: 'hidden' }}
      >
        {props.parts.map((part) => (
          <View key={part.key} style={{ flex: part.value, backgroundColor: part.colour }} />
        ))}
      </View>
      {props.parts.map((part) => (
        <View
          key={part.key}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.gap10,
            paddingVertical: theme.space.gap4,
            marginTop: theme.space.gap4,
          }}
        >
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: part.colour }} />
          <Text variant="rowTitle" style={{ flex: 1 }}>
            {part.label}
          </Text>
          <Text variant="headline">{money(props.locale, part.value, props.currency)}</Text>
        </View>
      ))}
    </Card>
  );
}
