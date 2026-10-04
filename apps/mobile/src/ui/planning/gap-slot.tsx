/**
 * Free time in a day, drawn as a dashed slot (7a-2 "FOUR OF YOU ARE FREE", 7f-1 "Gunung Kawi is
 * 10 min on. Add it too?"): an optional time, what could go there, and a + when there is a
 * one-tap way to fill it.
 */
import { View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { AddButton } from './add-button';

export interface GapSlotProps {
  readonly text: string;
  readonly time?: string | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly onAdd?: (() => void) | undefined;
  /** The + button's screen-reader words. */
  readonly addLabel?: string | undefined;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    minHeight: 56,
    paddingStart: t.space['14'],
    paddingEnd: t.space['4'],
    paddingVertical: t.space['6'],
    borderRadius: t.radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.semantic.border.decorative,
  },
  text: { flex: 1, minWidth: 0 },
}));

export function GapSlot({ text, time, onPress, onAdd, addLabel, testID }: GapSlotProps) {
  const styles = useStyles();
  const theme = useTheme();
  const body = (
    <View style={styles.slot}>
      {time === undefined ? null : <Text variant="monoData">{time}</Text>}
      <View style={styles.text}>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {text}
        </Text>
      </View>
      {onAdd === undefined ? null : (
        <AddButton accessibilityLabel={addLabel ?? text} onPress={onAdd} size={30} />
      )}
    </View>
  );
  if (onPress === undefined) return <View testID={testID}>{body}</View>;
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[time, text].filter((part) => part !== undefined).join(', ')}
      testID={testID}
    >
      {body}
    </PressScale>
  );
}
