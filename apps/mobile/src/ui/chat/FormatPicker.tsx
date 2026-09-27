import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface FormatOption<Value extends string> {
  readonly value: Value;
  /** "Trailer", "Poster", "Postcard". */
  readonly label: string;
  /** Thumbnail preview of the format. */
  readonly preview: ReactNode;
}

export interface FormatPickerProps<Value extends string> {
  readonly options: readonly FormatOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  /** Group label ("Pick how it arrives"). */
  readonly label: string;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  tile: { flex: 1, gap: th.space['8'], alignItems: 'center' },
  thumb: {
    width: '100%',
    aspectRatio: 0.7,
    borderRadius: th.radius.md,
    overflow: 'hidden',
    backgroundColor: th.semantic.bg.raised,
  },
}));

/** Proposal format thumbnails as a radio group; the picked one gets the selected ring. */
export function FormatPicker<Value extends string>({
  options,
  value,
  onChange,
  label,
  testID,
}: FormatPickerProps<Value>) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Row gap="10" testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <PressScale
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked }}
            onPress={() => onChange(option.value)}
            style={styles.tile}
          >
            <View
              style={[
                styles.thumb,
                checked
                  ? {
                      borderWidth:
                        theme.ring.selected.outer.widthPt + theme.ring.selected.inner.widthPt,
                      borderColor: theme.semantic.action.primary,
                    }
                  : null,
              ]}
            >
              {option.preview}
            </View>
            <Text
              variant="label"
              color={checked ? theme.semantic.action.primary : theme.semantic.text.secondary}
            >
              {option.label}
            </Text>
          </PressScale>
        );
      })}
    </Row>
  );
}
