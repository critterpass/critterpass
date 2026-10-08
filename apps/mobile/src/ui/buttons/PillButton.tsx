import { useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useFlap } from '@/motion/patterns/flap';
import { useThemeSettings } from '@/lib/theme';

import { PressScale } from '../press/PressScale';
import { Text, TEXT_VARIANTS } from '../text/Text';
import { Sheen } from '../textures/sheen';
import type { Theme } from '../theme';
import { makeStyles, sizeToken, useTheme } from '../theme';

/** Line height of a two-line label, per em. */
const TWO_LINE_LEADING = 1.2;

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
  /**
   * `sentence` sets the label as written, in the row-title face (the 3a-7 sign-in buttons);
   * `upper` is the button face, uppercased. @default 'upper'
   */
  readonly casing?: 'upper' | 'sentence';
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
  disabled: { opacity: t.opacity.disabled },
  // A loading pill keeps its label (and leading mark) in place, unseen, under a centred spinner, so
  // the pill keeps the width of its words and its neighbours stay put.
  unseen: { opacity: 0 },
  spinner: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // Android rounds a label's measured width down for some strings ("ĐỔI GIỜ"), and a pill sized to
  // its words then has a fraction of a point too little and breaks the label in two: a point of
  // slack on each side keeps a label that fits on one line.
  label: {
    textAlign: 'center',
    flexShrink: 1,
    paddingHorizontal: Platform.OS === 'android' ? 1 : 0,
  },
  // A label on two lines gets body-like leading and room above and below, so it never meets the
  // pill's edges (a one-line label keeps the tight display leading).
  twoLines: { paddingVertical: t.space['10'] },
}));

/** A label too long for one line shrinks by this step, down to {@link LABEL_MIN_SCALE}. */
export const LABEL_SHRINK_STEP = 0.92;
/** The smallest a label shrinks to (of its size) before it wraps to a second line instead. */
export const LABEL_MIN_SCALE = 0.75;

/**
 * The pill CTA family: primary (six fills), secondary outline, tertiary link and destructive, with
 * sheen, label flap, loading and disabled states. A label too long for one line first shrinks (to
 * {@link LABEL_MIN_SCALE} of its size) and only then wraps to two lines, never truncating; a small
 * (40 pt) pill's label is designed for one line, so at the default text size its wrap is reported
 * to UI QA.
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
  casing = 'upper',
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
  const { fontScale } = useThemeSettings();
  const [wrapped, setWrapped] = useState(false);
  // How far the label has shrunk to stay on one line, for the label it was measured on.
  const [fit, setFit] = useState<{ label: string; scale: number }>({ label: shown, scale: 1 });
  const scale = fit.label === shown ? fit.scale : 1;
  const labelVariant = casing === 'sentence' ? 'rowTitle' : size === 'lg' ? 'buttonLg' : 'buttonSm';
  const labelToken = TEXT_VARIANTS[labelVariant];
  const labelSize = (labelToken.fontSize ?? labelToken.fontSizeMax ?? 14) * fontScale * scale;
  const shrunk =
    scale < 1
      ? { fontSize: labelSize, letterSpacing: (labelToken.letterSpacing ?? 0) * labelSize }
      : null;
  // A shrunk label takes its side padding down with it, so the pill gives the label the room.
  const padding = scale < 1 ? { paddingHorizontal: styles[size].paddingHorizontal * scale } : null;
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
        padding,
        fill ? { backgroundColor: fill } : null,
        variant === 'secondary' ? styles.outline : null,
        (block ?? size === 'lg') ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' },
        disabled ? styles.disabled : null,
        wrapped ? styles.twoLines : null,
      ]}
    >
      {sheen && variant === 'primary' && !inactive ? <Sheen /> : null}
      {leading && loading ? <View style={styles.unseen}>{leading}</View> : leading}
      <Animated.View style={[flap ? flapped.style : null, loading ? styles.unseen : null]}>
        <Text
          variant={labelVariant}
          color={textColor}
          numberOfLines={2}
          singleLine={size === 'sm' && scale <= LABEL_MIN_SCALE}
          style={[
            styles.label,
            shrunk,
            wrapped ? { lineHeight: labelSize * TWO_LINE_LEADING } : null,
          ]}
          onTextLayout={(event) => {
            const lines = event.nativeEvent.lines.length;
            // Shrink first; wrap only once the label is at its floor.
            if (lines > 1 && scale > LABEL_MIN_SCALE) {
              setFit({
                label: shown,
                scale: Math.max(LABEL_MIN_SCALE, scale * LABEL_SHRINK_STEP),
              });
              return;
            }
            const next = lines > 1;
            if (next !== wrapped) setWrapped(next);
          }}
        >
          {shown}
        </Text>
      </Animated.View>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={textColor} />
        </View>
      ) : null}
    </PressScale>
  );
}
