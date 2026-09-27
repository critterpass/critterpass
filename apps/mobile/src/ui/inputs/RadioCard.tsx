import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface RadioCardProps {
  readonly title: string;
  readonly description?: string;
  /** Guide pick tag ("Pon's pick") pinned to the top edge. */
  readonly pickTag?: string;
  /** Trailing price / value. */
  readonly trailing?: ReactNode;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  card: {
    borderRadius: t.radius.lg,
    borderWidth: 2,
    padding: t.size.cardInner.max,
    backgroundColor: t.semantic.bg.raised,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotFill: { width: 10, height: 10, borderRadius: 5 },
  tag: {
    position: 'absolute',
    top: -t.space['10'],
    end: t.space['14'],
    backgroundColor: t.semantic.action.primary,
    borderRadius: t.radius.xs,
    paddingHorizontal: t.space['6'],
    paddingVertical: t.space['2'],
  },
}));

/** A selectable option card with outline, radio dot and an optional guide pick tag. */
export function RadioCard({
  title,
  description,
  pickTag,
  trailing,
  selected,
  onSelect,
  disabled = false,
  testID,
}: RadioCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const accent = selected ? theme.semantic.action.primary : theme.semantic.border.control;
  const label = [title, description, pickTag].filter(Boolean).join(', ');
  return (
    <PressScale
      testID={testID}
      onPress={onSelect}
      disabled={disabled}
      widthClass="wide"
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={[styles.card, { borderColor: accent }]}
    >
      <Row gap="12" align="center">
        <View style={[styles.dot, { borderColor: accent }]}>
          {selected ? <View style={[styles.dotFill, { backgroundColor: accent }]} /> : null}
        </View>
        <Stack gap="2" flex={1}>
          <Text variant="title">{title}</Text>
          {description ? <SecondaryText>{description}</SecondaryText> : null}
        </Stack>
        {trailing}
      </Row>
      {pickTag ? (
        <View style={styles.tag}>
          <Text variant="label" color={theme.semantic.text.onAccent}>
            {pickTag}
          </Text>
        </View>
      ) : null}
    </PressScale>
  );
}
