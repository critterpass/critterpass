import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { impact } from '@/motion/feedback';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';

export type KeypadKey =
  '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000' | '0' | 'delete';

const ROWS: readonly (readonly KeypadKey[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['000', '0', 'delete'],
];

/** Applies one key to a digit string: no leading zeros, capped at `maxDigits`. */
export function applyKey(current: string, key: KeypadKey, maxDigits = 12): string {
  if (key === 'delete') return current.slice(0, -1);
  if (current === '' && (key === '0' || key === '000')) return current;
  const next = current + key;
  return next.length > maxDigits ? current : next;
}

export interface KeypadProps {
  readonly onKey: (key: KeypadKey) => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  grid: { gap: t.space['8'] },
  row: { flexDirection: 'row', gap: t.space['8'] },
  key: {
    flex: 1,
    minHeight: sizeToken(t.size.primaryCta, 'height') + t.space['8'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plain: { backgroundColor: undefined },
}));

function keyLabel(key: KeypadKey): string {
  if (key === 'delete') return t({ id: 'common.keypad.delete', message: 'Delete' });
  if (key === '000') return t({ id: 'common.keypad.thousand', message: 'Three zeros' });
  return key;
}

/** 3 × 4 amount keypad with 000 and delete (3i-2). Pair with `KeypadAmount` for the display. */
export function Keypad({ onKey, disabled = false, testID }: KeypadProps) {
  const styles = useStyles();
  const theme = useTheme();
  const press = (key: KeypadKey) => {
    impact('tick');
    onKey(key);
  };
  return (
    <View style={styles.grid} testID={testID}>
      {ROWS.map((row) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((key) => (
            <PressScale
              key={key}
              onPress={() => press(key)}
              disabled={disabled}
              widthClass="narrow"
              accessibilityLabel={keyLabel(key)}
              accessibilityRole="keyboardkey"
              style={[styles.key, key === 'delete' || key === '000' ? styles.plain : null]}
              // Each key by its own id ("money-add-keypad-key-0"), so a flow never matches a digit
              // of the amount above it.
              {...(testID === undefined ? {} : { testID: `${testID}-key-${key}` })}
            >
              {key === 'delete' ? (
                <Text variant="h3" color={theme.semantic.text.primary}>
                  ⌫
                </Text>
              ) : (
                <Text variant={key === '000' ? 'title' : 'h2'}>{key}</Text>
              )}
            </PressScale>
          ))}
        </View>
      ))}
    </View>
  );
}
