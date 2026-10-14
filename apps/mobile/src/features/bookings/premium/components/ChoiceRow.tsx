/**
 * A row of chips that opens in place under the control that asked for it (the booking's kind and
 * day on 7.04): the kit's chips, the picked one in ink, the rest on white; picking closes it.
 */
import { StyleSheet } from 'react-native';

import { Chip, ROW_ROOM_ABOVE, ROW_ROOM_BELOW, ScrollRow, usePremiumTheme } from '@/ui/premium';

export interface Choice<Value extends string | number> {
  readonly value: Value;
  readonly label: string;
}

export function ChoiceRow<Value extends string | number>(props: {
  readonly choices: readonly Choice<Value>[];
  readonly value: Value;
  readonly onPick: (value: Value) => void;
  readonly testID: string;
  /** The row's side margin: it bleeds out of the page's 16 pt padding by default. */
  readonly inset?: number;
}) {
  const th = usePremiumTheme();
  return (
    <ScrollRow
      keyboardShouldPersistTaps="handled"
      gap={th.space.gap6}
      contentContainerStyle={{ paddingHorizontal: th.space.gap16 }}
      // Edge to edge: the first chip lines up with the labels and fields at 16 (7.04).
      style={[styles.row, { marginHorizontal: props.inset ?? -th.space.gap16 }]}
      testID={props.testID}
    >
      {props.choices.map((choice) => (
        <Chip
          key={String(choice.value)}
          label={choice.label}
          size="hub"
          surface="white"
          selected={choice.value === props.value}
          onPress={() => props.onPick(choice.value)}
          testID={`${props.testID}-${String(choice.value)}`}
        />
      ))}
    </ScrollRow>
  );
}

const styles = StyleSheet.create({
  // 4 pt above and below the chips, as the row kept; its own room for shadows sits inside it.
  row: { marginTop: 4 - ROW_ROOM_ABOVE, marginBottom: 4 - ROW_ROOM_BELOW },
});
