import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { Spinner } from '../feedback/Spinner';
import { Icon } from '../icons/Icon';
import type { PremiumIconName } from '../icons/Icon';
import { PressableScale, hitSlopFor } from '../motion/PressableScale';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import type { PremiumTypeName } from '../theme/kit-type';
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
  /** A ⌄ after the label: the pill opens a picker (the currency chip). */
  readonly chevron?: boolean;
  readonly accessibilityHint?: string;
  /**
   * Where the pill sits across its parent. A large button stretches; a medium or small pill starts
   * its column (`flex-start`), which in a row puts it at the row's top: a pill beside text in a row
   * passes `auto` to follow the row's `alignItems`. Layout can't tell a row parent from a column one.
   */
  readonly alignSelf?: NonNullable<ViewStyle['alignSelf']>;
  readonly testID?: string;
}

interface Look {
  readonly box: ViewStyle;
  readonly text: string;
}

function sizeBox(t: PremiumTheme, size: ButtonSize): ViewStyle {
  if (size === 'large') {
    // A floor, not a height: a long label wraps onto a second line inside the pill.
    return {
      minHeight: t.size.button,
      borderRadius: t.radius.button,
      paddingHorizontal: t.space.gutter,
      paddingVertical: t.space.gap6,
      alignSelf: 'stretch',
    };
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
  state: { readonly pressed: boolean; readonly disabled: boolean; readonly loading?: boolean },
): Look {
  const c = t.color;
  if (state.disabled) return { box: { backgroundColor: c.controlDisabled }, text: c.placeholder };
  switch (variant) {
    case 'primary':
      // Pressed, the pill sits down onto the page: the lighter ink and no drop (1.B).
      if (state.pressed) return { box: { backgroundColor: c.inkPressed }, text: c.onInk };
      if (size === 'large') {
        return {
          box: {
            // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, never rendered copy.
            backgroundImage: `linear-gradient(180deg, ${c.inkFillTop}, ${c.inkFillBottom})`,
            boxShadow: state.loading === true ? t.shadow.inkLoading : t.shadow.ink,
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

/** A picker's "⌄" typed at the end of a label: drawn as the chevron glyph instead. */
const TYPED_CHEVRON = /\s*\u2304\s*$/u;

/**
 * The label and whether it ends in the picker chevron. A typed "⌄" comes from a fallback font
 * with a taller line box, which pushed the label down in its pill and cut its top ("Today ⌄").
 */
export function pillLabel(label: string, chevron: boolean): { text: string; chevron: boolean } {
  return TYPED_CHEVRON.test(label)
    ? { text: label.replace(TYPED_CHEVRON, ''), chevron: true }
    : { text: label, chevron };
}

export function Button({
  label: givenLabel,
  onPress,
  variant = 'primary',
  size = 'large',
  disabled = false,
  loading = false,
  loadingLabel,
  icon,
  chevron: givenChevron = false,
  accessibilityHint,
  alignSelf,
  testID,
}: ButtonProps) {
  const t = usePremiumTheme();
  const { text: label, chevron } = pillLabel(givenLabel, givenChevron);
  const box = sizeBox(t, size);
  const shown = loading ? (loadingLabel ?? label) : label;
  const height = Number(box.height ?? box.minHeight);
  const large = size === 'large';

  return (
    <PressableScale
      testID={testID}
      onPress={loading ? undefined : onPress}
      disabled={disabled}
      hitSlop={hitSlopFor(height, height)}
      accessibilityLabel={shown}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      accessibilityState={{ busy: loading }}
      style={{ alignSelf: alignSelf ?? box.alignSelf ?? 'flex-start' }}
    >
      {({ pressed }) => {
        // Loading keeps the variant's own fill; only the spinner says it is busy.
        const look = buttonLook(t, variant, size, {
          pressed: pressed && !loading,
          disabled,
          loading,
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
            <Text
              variant={TYPE_FOR_SIZE[size]}
              color={look.text}
              numberOfLines={large ? 2 : 1}
              singleLine={!large}
              align="center"
              style={large ? styles.wrap : null}
            >
              {shown}
            </Text>
            {chevron && !loading ? (
              <Icon name="down" size={t.size.glyph} color={look.text} />
            ) : null}
          </View>
        );
      }}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Shrinks beside the spinner or icon so a second line wraps inside the pill.
  wrap: { flexShrink: 1 },
});
