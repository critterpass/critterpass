/**
 * The add-by-hand form's grouped rows (7.04): Day, Departs, Seat, Confirmation on one white card,
 * the label on the left and the value typed or picked on the right.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';

/** A row with its label and the input or value on the right. */
export function FormRow(props: {
  readonly label: string;
  readonly children: ReactNode;
  readonly error?: string | undefined;
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  return (
    <View style={[styles.row, { paddingHorizontal: th.space.rowPadH }]} testID={props.testID}>
      <View style={styles.line}>
        <Text variant="rowText" tone="inkSecondary" style={styles.label}>
          {props.label}
        </Text>
        <View style={styles.value}>{props.children}</View>
      </View>
      {props.error === undefined ? null : (
        <Text variant="helper" color={th.color.destructive.helper} align="right">
          {props.error}
        </Text>
      )}
    </View>
  );
}

/** A row whose value is picked (the day): pressing it opens the choices under it. */
export function PickRow(props: {
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly onPress: () => void;
  readonly error?: string | undefined;
  readonly testID: string;
}) {
  const filled = props.value !== '';
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={[props.label, filled ? props.value : props.placeholder].join(', ')}
      testID={props.testID}
    >
      <FormRow label={props.label} error={props.error}>
        <Text variant="field" tone={filled ? 'ink' : 'placeholder'} align="right" numberOfLines={1}>
          {filled ? props.value : props.placeholder}
        </Text>
      </FormRow>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, justifyContent: 'center', paddingVertical: 12, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { flexShrink: 0 },
  value: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
});
