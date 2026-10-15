/**
 * A chip: a filter, a choice or a fact in a row of its kind (1.05 hub tabs, the journeys' filter
 * rows, tag and perk chips). Chips are drawn flat: no drop shadow, because a shadow under a 30–36
 * pt pill reads as a smudge and a scrolling row cuts it into a band. The chosen chip is ink; the
 * rest sit on the control fill, white on the ground (with a hairline ring), a tint, or glass over a
 * map.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AccessibilityRole, ViewStyle } from 'react-native';

import { GlassSurface } from '../glass/GlassSurface';
import { Icon } from '../icons/Icon';
import type { PremiumIconName } from '../icons/Icon';
import { PressableScale, hitSlopFor } from '../motion/PressableScale';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { ring } from '../theme/theme';
import type { PremiumTheme } from '../theme/theme';

/** `regular` 36 (filter rows), `hub` 34 (the hub's tabs), `small` 30 (facts, perks, tags). */
export type ChipSize = 'regular' | 'hub' | 'small';

/** The unchosen chip's surface. */
export type ChipSurface = 'control' | 'white' | 'tint' | 'glass';

export interface ChipProps {
  readonly label: string;
  readonly selected?: boolean | undefined;
  /** Without it the chip is a fact, not a control. */
  readonly onPress?: (() => void) | undefined;
  readonly onLongPress?: (() => void) | undefined;
  /** @default 'regular' */
  readonly size?: ChipSize;
  /** @default 'control' */
  readonly surface?: ChipSurface;
  readonly icon?: PremiumIconName | undefined;
  /** A drawn mark before the label (a coloured dot, a tick disc, an avatar). */
  readonly leading?: ReactNode | undefined;
  readonly disabled?: boolean | undefined;
  /** Text struck through: a perk that pauses. */
  readonly struck?: boolean;
  /** A colour for an unchosen chip's words (a tint's own text colour). */
  readonly color?: string | undefined;
  /** @default 'button' */
  readonly accessibilityRole?: AccessibilityRole;
  readonly accessibilityLabel?: string | undefined;
  readonly testID?: string | undefined;
}

const BOX: Record<ChipSize, { height: number; padH: number }> = {
  regular: { height: 36, padH: 14 },
  hub: { height: 34, padH: 14 },
  small: { height: 30, padH: 12 },
};

/** Fill and words for a chip in its state. */
export function chipLook(
  t: PremiumTheme,
  surface: ChipSurface,
  state: { readonly selected: boolean; readonly disabled: boolean },
): { readonly box: ViewStyle; readonly text: string } {
  const c = t.color;
  if (state.selected) return { box: { backgroundColor: c.inkSurface }, text: c.onInk };
  if (state.disabled) return { box: { backgroundColor: c.controlDisabled }, text: c.placeholder };
  switch (surface) {
    case 'white':
      return { box: { backgroundColor: c.card, boxShadow: ring(0.5, c.hairline) }, text: c.ink };
    case 'tint':
      return { box: { backgroundColor: c.status.booked.bg }, text: c.banner.success.text };
    case 'glass':
      return { box: {}, text: c.ink };
    case 'control':
      return { box: { backgroundColor: c.control }, text: c.ink };
  }
}

export function Chip({
  label,
  selected = false,
  onPress,
  onLongPress,
  size = 'regular',
  surface = 'control',
  icon,
  leading,
  disabled = false,
  struck = false,
  color,
  accessibilityRole = 'button',
  accessibilityLabel,
  testID,
}: ChipProps) {
  const t = usePremiumTheme();
  const { height, padH } = BOX[size];
  const look = chipLook(t, surface, { selected, disabled });
  const words = selected || disabled ? look.text : (color ?? look.text);
  const shape: ViewStyle = {
    height,
    borderRadius: height / 2,
    paddingHorizontal: padH,
    paddingLeft: leading === undefined ? padH : padH / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.gap6,
  };
  const body = (
    <>
      {leading}
      {icon === undefined ? null : (
        <Icon name={icon} size={size === 'small' ? 14 : 16} color={words} />
      )}
      <Text
        variant={size === 'small' ? 'pillSmall' : 'chip'}
        color={words}
        numberOfLines={1}
        style={struck ? { textDecorationLine: 'line-through' } : null}
      >
        {label}
      </Text>
    </>
  );
  const face =
    surface === 'glass' && !selected ? (
      <GlassSurface kind="nav" style={shape}>
        {body}
      </GlassSurface>
    ) : (
      <View style={[shape, look.box]}>{body}</View>
    );

  if (onPress === undefined && onLongPress === undefined) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={accessibilityLabel ?? label}
        // A fact chip is text; a chosen tab without a press (the page you are on) keeps its role.
        {...(accessibilityRole === 'button' ? {} : { accessibilityRole })}
        accessibilityState={{ selected }}
      >
        {face}
      </View>
    );
  }
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={hitSlopFor(height, height)}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={
        accessibilityRole === 'checkbox' ? { checked: selected, disabled } : { selected, disabled }
      }
      testID={testID}
    >
      {face}
    </PressableScale>
  );
}
