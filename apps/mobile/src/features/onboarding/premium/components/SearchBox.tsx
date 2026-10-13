/**
 * The premium search field of "Where's home?" (2.09) as a piece: a white raised box with the
 * search glyph and one line of text. Used where the onboarding pages search a list (countries,
 * home airports).
 */
import { TextInput, View } from 'react-native';

import { Icon, usePremiumTheme } from '@/ui/premium';

export interface SearchBoxProps {
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  readonly label: string;
  readonly autoFocus?: boolean;
  readonly testID?: string;
}

export function SearchBox({
  value,
  onChangeText,
  label,
  autoFocus = false,
  testID,
}: SearchBoxProps) {
  const theme = usePremiumTheme();
  return (
    <View
      style={{
        height: 50,
        borderRadius: theme.radius.field,
        backgroundColor: theme.color.card,
        boxShadow: theme.shadow.raised,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap10,
        paddingHorizontal: theme.space.fieldPadH,
      }}
    >
      <Icon name="search" size={18} color={theme.color.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={theme.color.placeholder}
        selectionColor={theme.color.caret}
        cursorColor={theme.color.caret}
        accessibilityLabel={label}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="search"
        style={{
          flex: 1,
          fontSize: theme.type.field.size,
          fontWeight: theme.type.field.weight,
          color: theme.color.ink,
        }}
        {...(testID === undefined ? {} : { testID })}
      />
    </View>
  );
}
