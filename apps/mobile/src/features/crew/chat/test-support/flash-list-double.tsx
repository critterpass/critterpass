/**
 * FlashList double for Jest: FlashList recycles real native scroll views and ships untranspiled
 * ESM, neither of which Node can run (a native-runtime boundary, docs/code-standards.md §17). It
 * renders every row and the footer as plain views, in order; RNTL has no viewport anyway.
 */
import { forwardRef, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';

interface ListProps<Item> {
  readonly data: readonly Item[] | null | undefined;
  readonly renderItem: (info: { item: Item; index: number }) => ReactElement | null;
  readonly keyExtractor?: (item: Item, index: number) => string;
  readonly ListFooterComponent?: ReactNode;
  readonly testID?: string;
}

export const FlashList = forwardRef<{ scrollToEnd: () => void }, ListProps<unknown>>(
  function FlashList({ data, renderItem, keyExtractor, ListFooterComponent, testID }, _ref) {
    return (
      <View testID={testID}>
        {(data ?? []).map((item, index) => (
          <View key={keyExtractor ? keyExtractor(item, index) : index}>
            {renderItem({ item, index })}
          </View>
        ))}
        {ListFooterComponent}
      </View>
    );
  },
);
