import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DoodleName } from '../icons/generated';
import { Icon } from '../icons/Icon';
import { PressScale } from '../press/PressScale';
import type { Theme } from '../theme';
import { makeStyles, useTheme } from '../theme';

export type IconButtonSurface = 'dark' | 'cream' | 'onPhoto';

export interface IconButtonProps {
  /** What the button does ("Share", "Close"): icon buttons always need a label. */
  readonly label: string;
  readonly onPress: () => void;
  readonly icon?: DoodleName;
  /** Any glyph when no doodle fits (✕, ⌫, a sticker). */
  readonly glyph?: ReactNode;
  /** Diameter it is drawn at; under 44 pt the touch target reaches 44 (48 dp) through slop. @default 44 */
  readonly size?: number;
  /** @default 'dark' */
  readonly surface?: IconButtonSurface;
  readonly disabled?: boolean;
  readonly testID?: string;
}

function surfaceColours(theme: Theme, surface: IconButtonSurface) {
  if (surface === 'cream') return { bg: theme.color.paper.base, fg: theme.color.paper.ink };
  if (surface === 'onPhoto') return { bg: undefined, fg: theme.semantic.text.primary };
  return { bg: theme.semantic.bg.control, fg: theme.semantic.text.primary };
}

const useStyles = makeStyles((t) => ({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: t.color.scrim.hex,
    opacity: t.color.scrim.alphaMax,
  },
}));

/** Round icon-only button on dark, cream or photo backgrounds. */
export function IconButton({
  label,
  onPress,
  icon,
  glyph,
  size = 44,
  surface = 'dark',
  disabled = false,
  testID,
}: IconButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { bg, fg } = surfaceColours(theme, surface);
  // Drawn at the size asked for; a button under the minimum target gains invisible touch slop.
  const diameter = size;
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      widthClass="narrow"
      accessibilityLabel={label}
      style={[
        styles.base,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          ...(bg ? { backgroundColor: bg } : {}),
          opacity: disabled ? theme.opacity.disabled : 1,
        },
      ]}
    >
      {surface === 'onPhoto' ? <View style={styles.scrim} /> : null}
      {icon ? <Icon name={icon} size={diameter * 0.5} color={fg} decorative /> : glyph}
    </PressScale>
  );
}
