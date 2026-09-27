import type { TextStyle } from 'react-native';

import { resolveTypeVariant } from '@cp/design-tokens';

import { fontFor } from '@/lib/fonts';
import { useLocale } from '@/lib/i18n/use-locale';
import { useThemeSettings } from '@/lib/theme';

import { TEXT_VARIANTS } from '../text/Text';

/**
 * Font style for a native `TextInput` from the `input` / `inputOtp` type tokens: the same locale
 * script fallback and Dynamic Type scaling `<Text>` applies (inputs pass `allowFontScaling={false}`
 * because the size is already scaled here).
 */
export function useInputFont(variant: 'input' | 'inputOtp' = 'input'): TextStyle {
  const locale = useLocale();
  const { fontScale } = useThemeSettings();
  const token = TEXT_VARIANTS[variant];
  const resolved = resolveTypeVariant(token, { fontScale });
  const font = fontFor(
    {
      fontFamily: token.fontFamily,
      fontWeight: token.fontWeight,
      lineHeightMultiplier: resolved.lineHeightMultiplier,
      condensed: token.condensed,
    },
    locale,
  );
  const fontSize = resolved.fontSize * font.sizeMultiplier;
  return {
    fontSize,
    ...(font.fontFamily === 'system'
      ? { fontWeight: String(token.fontWeight) as TextStyle['fontWeight'] }
      : { fontFamily: font.fontFamily }),
    ...(token.tabularNumerals ? { fontVariant: ['tabular-nums'] } : {}),
  };
}
