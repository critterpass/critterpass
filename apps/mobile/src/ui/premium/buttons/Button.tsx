import { View } from 'react-native';
import type { ViewStyle } from 'react-native';

import type { PremiumTypeName } from '@cp/design-tokens';

import { Spinner } from '../feedback/Spinner';
import { Icon } from '../icons/Icon';
import type { PremiumIconName } from '../icons/Icon';
import { PressableScale, hitSlopFor } from '../motion/PressableScale';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import type { PremiumTheme } from '../theme/theme';

/**
 * `primary` is the one ink pill per screen; `secondary` a white raised pill; `control` a light
 * pill for a second choice ("Keep 19:30"); `floating` a small white pill over content ("Nudge");
 * `destructive` the pink-tinted delete.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'control' | 'floating' | 'destructive';

/** `large` 56 (full-width actions), `medium` 40 (inline "Approve"), `small` 34 (floating pills). */
export type ButtonSize = 'large' | 'medium' | 'small';

export interface ButtonProps {
  readonly label: string;
  readonly onPress?: () => void;
  /** @default 'primary' */
  readonly variant?: ButtonVariant;
  /** @default 'large' */
  readonly size?: ButtonSize;
  readonly disabled?: boolean;
  /** Keeps the pill, shows the spinner and `loadingLabel` (the progressive verb, "Booking…"). */
  readonly loading?: boolean;
  readonly loadingLabel?: string;
  readonly icon?: PremiumIconName;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

interface Look {
  readonly box: ViewStyle;
  readonly text: string;
}

function sizeBox(t: PremiumTheme, size: ButtonSize): ViewStyle {
  if (size === 'large') {
    return { height: t.size.button, borderRadius: t.radius.button, alignSelf: 'stretch' };
  }
  if (size === 'medium') {
    return {
      height: t.size.pill,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.pillPadH,
      alignSelf: 'flex-start',
    };
  }
  return {
    height: t.size.pillSmall,
    borderRadius: t.radius.pillSmall,
    paddingHorizontal: t.space.pillSmallPadH,
    alignSelf: 'flex-start',
  };
}

/** Fill, shadow and label colour for a variant in its current state. */
export function buttonLook(
  t: PremiumTheme,
  variant: ButtonVariant,
  size: ButtonSize,
  state: { readonly pressed: boolean; readonly disabled: boolean },
): Look {
  const c = t.color;
  if (state.disabled) return { box: { backgroundColor: c.controlDisabled }, text: c.placeholder };
  switch (variant) {
    case 'primary':
      if (state.pressed) return { box: { backgroundColor: c.inkPressed }, text: c.onInk };
      if (size === 'large') {
        return {
          box: {
            // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, never rendered copy.
            backgroundImage: `linear-gradient(180deg, ${c.inkFillTop}, ${c.inkFillBottom})`,
            boxShadow: t.shadow.ink,
          },
          text: c.onInk,
        };
      }
      return { box: { backgroundColor: c.ink }, text: c.onInk };
    case 'secondary':
      return { box: { backgroundColor: c.card, boxShadow: t.shadow.raised }, text: c.ink };
    case 'control':
      return { box: { backgroundColor: c.control }, text: c.ink };
    case 'floating':
      return { box: { backgroundColor: c.card, boxShadow: t.shadow.float }, text: c.ink };
    case 'destructive':
      return { box: { backgroundColor: c.destructive.bg }, text: c.destructive.text };
  }
}

const TYPE_FOR_SIZE: Record<ButtonSize, PremiumTypeName> = {
  large: 'button',
  medium: 'buttonSmall',
  small: 'pillSmall',
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  disabled = false,
  loading = false,
  loadingLabel,
  icon,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const t = usePremiumTheme();
  const box = sizeBox(t, size);
  const shown = loading ? (loadingLabel ?? label) : label;
  const height = Number(box.height);

  return (
    <PressableScale
      testID={testID}
      onPress={loading ? undefined : onPress}
      disabled={disabled}
      hitSlop={hitSlopFor(height, height)}
      accessibilityLabel={shown}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      accessibilityState={{ busy: loading }}
      style={box.alignSelf === 'stretch' ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }}
    >
      {({ pressed }) => {
        const look = buttonLook(t, loading ? 'primary' : variant, size, {
          pressed: pressed && !loading,
          disabled,
        });
        return (
          <View
            style={[
              box,
              look.box,
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: t.space.gap8,
              },
            ]}
          >
            {loading ? <Spinner color={look.text} /> : null}
            {!loading && icon !== undefined ? (
              <Icon name={icon} size={t.size.glyph} color={look.text} />
            ) : null}
            <Text variant={TYPE_FOR_SIZE[size]} color={look.text} numberOfLines={1}>
              {shown}
            </Text>
          </View>
        );
      }}
    </PressableScale>
  );
}
