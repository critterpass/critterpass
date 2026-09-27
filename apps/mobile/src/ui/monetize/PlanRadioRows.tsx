import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface PlanOption {
  readonly id: string;
  /** "This trip". */
  readonly title: string;
  /** "On until a week after you land, Apr 16". */
  readonly detail?: string;
  /** Store-localised price string ("$12"). */
  readonly price: string;
  /** Sticker stamped on when chosen (Pass+ badge). */
  readonly badge?: ReactNode;
}

export interface PlanRadioRowsProps {
  readonly options: readonly PlanOption[];
  readonly value: string;
  readonly onChange: (id: string) => void;
  /** Group label ("Boost Kyoto"). */
  readonly label: string;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  row: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    borderWidth: th.space['2'],
  },
  dot: {
    width: th.space['20'],
    height: th.space['20'],
    borderRadius: th.space['10'],
    borderWidth: th.space['2'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: { width: th.space['10'], height: th.space['10'], borderRadius: th.space['6'] },
}));

/** Plan choices as radio rows with a price each; the chosen row gets the yellow outline. */
export function PlanRadioRows({ options, value, onChange, label, testID }: PlanRadioRowsProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack gap="10" testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const checked = option.id === value;
        const accent = checked ? theme.semantic.action.primary : theme.semantic.border.control;
        return (
          <PressScale
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={[option.title, option.price, option.detail]
              .filter(Boolean)
              .join(', ')}
            accessibilityState={{ checked }}
            onPress={() => onChange(option.id)}
            widthClass="wide"
            style={[styles.row, { borderColor: checked ? accent : theme.semantic.bg.raised }]}
          >
            <Row gap="12" align="center">
              <View style={[styles.dot, { borderColor: accent }]}>
                {checked ? <View style={[styles.inner, { backgroundColor: accent }]} /> : null}
              </View>
              <Stack gap="2" flex={1}>
                <Text variant="title">{option.title}</Text>
                {option.detail ? <SecondaryText>{option.detail}</SecondaryText> : null}
              </Stack>
              {checked ? option.badge : null}
              <Text variant="h2">{option.price}</Text>
            </Row>
          </PressScale>
        );
      })}
    </Stack>
  );
}
