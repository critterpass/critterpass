import type { ReactNode } from 'react';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';

export interface MoodOption<Value extends string | number> {
  readonly value: Value;
  /** "Grr", "Meh", "Okay", "Good", "Love it". */
  readonly label: string;
  readonly sticker: ReactNode;
}

export interface MoodPickerProps<Value extends string | number> {
  readonly options: readonly MoodOption<Value>[];
  readonly value: Value | null;
  readonly onChange: (value: Value) => void;
  /** Group label ("How's it going?"). */
  readonly label: string;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  disc: {
    width: sizeToken(th.size.fab, 'size') - th.space['10'],
    height: sizeToken(th.size.fab, 'size') - th.space['10'],
    borderRadius: sizeToken(th.size.fab, 'size'),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
}));

/** A row of critter moods (radio group): the picked one fills yellow, the rest go grey. */
export function MoodPicker<Value extends string | number>({
  options,
  value,
  onChange,
  label,
  testID,
}: MoodPickerProps<Value>) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Row
      testID={testID}
      justify="space-between"
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {options.map((option) => {
        const checked = option.value === value;
        const dimmed = value !== null && !checked;
        return (
          <PressScale
            key={String(option.value)}
            widthClass="narrow"
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked }}
            onPress={() => onChange(option.value)}
          >
            <Stack gap="6" align="center" style={dimmed ? { opacity: 0.45 } : null}>
              <Stack
                style={[
                  styles.disc,
                  {
                    backgroundColor: checked
                      ? theme.semantic.action.primary
                      : theme.semantic.bg.raised,
                    borderWidth: checked ? theme.ring.selected.outer.widthPt : 0,
                    borderColor: theme.semantic.text.primary,
                  },
                ]}
              >
                {option.sticker}
              </Stack>
              <Text variant="label" color={checked ? theme.semantic.action.primary : undefined}>
                {option.label}
              </Text>
            </Stack>
          </PressScale>
        );
      })}
    </Row>
  );
}
