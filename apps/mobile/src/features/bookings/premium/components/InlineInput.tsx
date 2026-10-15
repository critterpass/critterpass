/**
 * A bare text input in one of the kit's type styles, for a value that sits inside a card or a row
 * (7.04: the flight number, an airport code, a row's time or seat) instead of in its own field.
 */
import { useLingui } from '@lingui/react/macro';
import { TextInput, type TextInputProps } from 'react-native';

import { usePremiumTheme, type PremiumTypeName } from '@/ui/premium';
import { premiumFont } from '@/ui/premium/text/Text';

export function InlineInput({
  type,
  align = 'left',
  style,
  ...input
}: TextInputProps & { readonly type: PremiumTypeName; readonly align?: 'left' | 'right' }) {
  const th = usePremiumTheme();
  const { i18n } = useLingui();
  const token = th.type[type];
  return (
    <TextInput
      placeholderTextColor={th.color.placeholder}
      selectionColor={th.color.caret}
      maxFontSizeMultiplier={token.maxScale}
      {...input}
      style={[
        {
          ...premiumFont(token, i18n.locale, false),
          fontSize: token.size,
          letterSpacing: token.tracking,
          color: th.color.ink,
          textAlign: align,
          padding: 0,
        },
        style,
      ]}
    />
  );
}
