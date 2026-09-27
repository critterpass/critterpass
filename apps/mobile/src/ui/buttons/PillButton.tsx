import type { ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';
import Animated from 'react-native-reanimated';

import { useFlap } from '@/motion/patterns/flap';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { Sheen } from '../textures/sheen';
import type { Theme } from '../theme';
import { makeStyles, sizeToken, useTheme } from '../theme';

export type PillTone = 'yellow' | 'green' | 'pink' | 'orange' | 'ink' | 'cream';
export type PillVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

export interface PillButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  /** @default 'primary' */
  readonly variant?: PillVariant;
  /** Fill of a primary pill. @default 'yellow' */
  readonly tone?: PillTone;
  /** `lg` is the 58 pt primary CTA; `sm` the 40 pt header/inline pill. @default 'lg' */
  readonly size?: 'lg' | 'sm';
  /** The light sweep across primary CTAs. */
  readonly sheen?: boolean;
  /** Flip the label when it changes (every label state change, design-system §3.4). */
  readonly flap?: boolean;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  /** Stretch to the parent's width (bottom CTAs). @default true for `lg` */
  readonly block?: boolean;
  readonly leading?: ReactNode;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

function fillFor(theme: Theme, variant: PillVariant, tone: PillTone): string | undefined {
  if (variant === 'secondary' || variant === 'tertiary') return undefined;
  if (variant === 'destructive') return theme.semantic.state.urgent;
  switch (tone) {
    case 'yellow':
      return theme.semantic.action.primary;
    case 'green':
      return theme.color.green.base;
    case 'pink':
      return theme.color.pink;
    case 'orange':
      return theme.color.orange;
    case 'ink':
      return theme.semantic.bg.control;
    case 'cream':
      return theme.color.paper.base;
  }
}

const useStyles = makeStyles((t) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space['8'],
    overflow: 'hidden',
  },
  lg: {
    minHeight: sizeToken(t.size.primaryCta, 'height'),
    borderRadius: sizeToken(t.size.primaryCta, 'radius'),
    paddingHorizontal: t.space['24'],
  },
  sm: {
    minHeight: sizeToken(t.size.headerPill, 'height'),
    borderRadius: sizeToken(t.size.headerPill, 'height') / 2,
    paddingHorizontal: t.space['16'],
  },
  outline: { borderWidth: 2, borderColor: t.semantic.border.control },
  disabled: { opacity: 0.4 },
  label: { textAlign: 'center', flexShrink: 1 },
}));

/**
 * The pill CTA family: primary (six fills), secondary outline, tertiary link and destructive, with
 * sheen, label flap, loading and disabled states. Labels wrap to two lines rather than truncate.
 */
export function PillButton({
  label,
  onPress,
  variant = 'primary',
  tone = 'yellow',
  size = 'lg',
  sheen = false,
  flap = false,
  loading = false,
  disabled = false,
  block,
  leading,
  accessibilityHint,
  testID,
}: PillButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  const flapped = useFlap({ value: label });
  const shown = flap ? flapped.displayValue : label;
  const fill = fillFor(theme, variant, tone);
  const onFill =
    tone === 'ink' && variant === 'primary'
      ? theme.semantic.text.primary
      : theme.semantic.text.onAccent;
  const textColor =
    variant === 'tertiary'
      ? theme.semantic.action.primary
      : variant === 'secondary'
        ? theme.semantic.text.primary
        : onFill;
  const inactive = disabled || loading;
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      widthClass={size === 'lg' ? 'wide' : 'narrow'}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: loading }}
      style={[
        styles.base,
        styles[size],
        fill ? { backgroundColor: fill } : null,
        variant === 'secondary' ? styles.outline : null,
        (block ?? size === 'lg') ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' },
        disabled ? styles.disabled : null,
      ]}
    >
      {sheen && variant === 'primary' && !inactive ? <Sheen /> : null}
      {leading}
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Animated.View style={flap ? flapped.style : undefined}>
          <Text
            variant={size === 'lg' ? 'buttonLg' : 'buttonSm'}
            color={textColor}
            numberOfLines={2}
            style={styles.label}
          >
            {shown}
          </Text>
        </Animated.View>
      )}
    </PressScale>
  );
}
