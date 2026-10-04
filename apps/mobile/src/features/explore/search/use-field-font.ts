/**
 * The search field's font: the design sets the typed query and the placeholder in the body-large
 * type (not the form input's), with the same locale fallback and Dynamic Type scaling `<Text>`
 * applies.
 */
import { resolveTypeVariant } from '@cp/design-tokens';
import type { TextStyle } from 'react-native';

import { fontFor } from '@/lib/fonts';
import { useLocale } from '@/lib/i18n/use-locale';
import { useThemeSettings } from '@/lib/theme';
import { TEXT_VARIANTS } from '@/ui';

export function useFieldFont(): TextStyle {
  const locale = useLocale();
  const { fontScale } = useThemeSettings();
  const token = TEXT_VARIANTS.bodyLg;
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
  return {
    fontSize: resolved.fontSize * font.sizeMultiplier,
    ...(font.fontFamily === 'system'
      ? { fontWeight: String(token.fontWeight) as TextStyle['fontWeight'] }
      : { fontFamily: font.fontFamily }),
  };
}
