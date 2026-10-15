/**
 * The premium search field of "Where's home?" (2.09) as a piece: the kit search field, white on
 * the page, with the search glyph and a clear disc once it holds words. Used where the onboarding pages search a list (countries,
 * home airports).
 */
import { SearchField } from '@/ui/premium';

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
  return (
    <SearchField
      surface="white"
      value={value}
      onChangeText={onChangeText}
      accessibilityLabel={label}
      autoFocus={autoFocus}
      autoCorrect={false}
      autoCapitalize="words"
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
