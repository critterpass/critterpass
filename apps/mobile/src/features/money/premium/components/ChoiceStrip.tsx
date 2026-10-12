/**
 * A row of chips that opens in place under the control that asked for it (the currency, the
 * category, the day on 7.18): the picked one in ink, the rest on white; picking closes it.
 */
import { ScrollView, StyleSheet } from 'react-native';

import { Button, usePremiumTheme } from '@/ui/premium';

export interface Choice<Value extends string | number> {
  readonly value: Value;
  readonly label: string;
}

export function ChoiceStrip<Value extends string | number>(props: {
  readonly choices: readonly Choice<Value>[];
  readonly value: Value;
  readonly onPick: (value: Value) => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.row,
        { paddingHorizontal: th.space.gutter, gap: th.space.gap6 },
      ]}
      testID={props.testID}
    >
      {props.choices.map((choice) => (
        <Button
          key={String(choice.value)}
          label={choice.label}
          size="small"
          variant={choice.value === props.value ? 'primary' : 'floating'}
          onPress={() => props.onPick(choice.value)}
          testID={`${props.testID}-${String(choice.value)}`}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', paddingVertical: 4 },
});
