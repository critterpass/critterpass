import { makeStyles, sizeToken, useTheme } from '../theme';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';

export interface DashedAddCardProps {
  /** "Pitch a place", "Add a booking". */
  readonly label: string;
  readonly onPress: () => void;
  /** `circle` for the pitch slot on vote boards, `card` for list ends. @default 'card' */
  readonly shape?: 'card' | 'circle';
  readonly size?: number;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  base: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.semantic.border.decorative,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space['4'],
    padding: t.space['12'],
  },
  card: { borderRadius: t.radius.lg, minHeight: sizeToken(t.size.primaryCta, 'height') * 1.5 },
  plus: { color: t.semantic.text.primary },
  // A label that wraps ("PITCH A / PLACE" in the circle) stays centred under the plus.
  label: { textAlign: 'center' },
}));

/** Dashed placeholder that adds something (pitch a place, add a booking, invite). */
export function DashedAddCard({
  label,
  onPress,
  shape = 'card',
  size = 96,
  testID,
}: DashedAddCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const circle = shape === 'circle' ? { width: size, height: size, borderRadius: size / 2 } : null;
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      accessibilityLabel={label}
      widthClass={shape === 'circle' ? 'narrow' : 'wide'}
      style={[styles.base, shape === 'card' ? styles.card : circle]}
    >
      <Text variant="h3" style={styles.plus} accessibilityElementsHidden>
        +
      </Text>
      <Text variant="label" color={theme.semantic.text.secondary} style={styles.label}>
        {label}
      </Text>
    </PressScale>
  );
}
