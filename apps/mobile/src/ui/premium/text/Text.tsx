import { Text as RNText } from 'react-native';
import type { TextProps as RNTextProps, TextStyle } from 'react-native';

import type { PremiumPalette, PremiumTypeName, PremiumTypeStyle } from '@cp/design-tokens';

import { fontFor } from '@/lib/fonts';
import { useLocale } from '@/lib/i18n/use-locale';
import { useThemeSettings } from '@/lib/theme';

import { usePremiumTheme } from '../theme/PremiumThemeProvider';

/** Palette roles a text can take by name; any other colour is passed as `color`. */
export type PremiumTextTone = Extract<
  keyof PremiumPalette,
  'ink' | 'inkSecondary' | 'muted' | 'placeholder' | 'onInk' | 'onAccent' | 'caret' | 'guideName'
>;

export interface PremiumTextProps extends Omit<RNTextProps, 'allowFontScaling'> {
  /** @default 'body' */
  readonly variant?: PremiumTypeName;
  /** @default 'ink' */
  readonly tone?: PremiumTextTone;
  /** A colour from the theme that is not a named tone (status tints, accents). */
  readonly color?: string;
  readonly align?: TextStyle['textAlign'];
}

/** Font face for a type style; the guide's Borel and the mono face fall back by script. */
export function premiumFont(
  style: PremiumTypeStyle,
  locale: string,
  plainGuideText: boolean,
): Pick<TextStyle, 'fontFamily' | 'fontWeight' | 'fontStyle'> {
  if (style.family === 'system') return { fontWeight: style.weight };
  if (style.family === 'guide' && plainGuideText) {
    return { fontWeight: style.weight, fontStyle: 'italic' };
  }
  const resolved = fontFor(
    {
      fontFamily: style.family === 'guide' ? 'voice' : 'geistMono',
      fontWeight: Number(style.weight),
      lineHeightMultiplier: 1,
      condensed: false,
    },
    locale,
  );
  return resolved.fontFamily === 'system'
    ? { fontWeight: style.weight, fontStyle: resolved.fontStyle }
    : { fontFamily: resolved.fontFamily, fontStyle: resolved.fontStyle };
}

/**
 * Premium text: one type token per use, SF Pro (system) unless the token is the guide's voice or a
 * code. Dynamic Type scales it natively up to the token's cap, so display type never outgrows its
 * hero while body copy follows the phone.
 */
export function Text({
  variant = 'body',
  tone = 'ink',
  color,
  align,
  style,
  ...rest
}: PremiumTextProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { plainGuideText } = useThemeSettings();
  const token = theme.type[variant];
  const font = premiumFont(token, locale, plainGuideText);

  return (
    <RNText
      {...rest}
      allowFontScaling
      maxFontSizeMultiplier={token.maxScale}
      style={[
        {
          ...font,
          fontSize: token.size,
          letterSpacing: token.tracking,
          color: color ?? theme.color[tone],
        },
        token.lineHeight === undefined ? null : { lineHeight: token.lineHeight },
        align === undefined ? null : { textAlign: align },
        style,
      ]}
    />
  );
}
