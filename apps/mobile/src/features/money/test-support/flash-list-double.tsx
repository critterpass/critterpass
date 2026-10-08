/**
 * FlashList double for Jest: FlashList recycles real native scroll views and ships untranspiled
 * ESM, neither of which Node can run (a native-runtime boundary, docs/code-standards.md §17). It
 * renders the header, then every row (or the empty component) in a plain scroll view, in order.
 */
import type { ReactElement, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

interface ListProps<Item> {
  readonly data: readonly Item[] | null | undefined;
  readonly renderItem: (info: { item: Item; index: number }) => ReactElement | null;
  readonly keyExtractor?: (item: Item, index: number) => string;
  readonly ListHeaderComponent?: ReactNode;
  readonly ListEmptyComponent?: ReactNode;
  readonly testID?: string;
}

export function FlashList<Item>({
  data,
  renderItem,
  keyExtractor,
  ListHeaderComponent,
  ListEmptyComponent,
  testID,
}: ListProps<Item>) {
  const rows = data ?? [];
  return (
    <ScrollView testID={testID}>
      {ListHeaderComponent}
      {rows.length === 0
        ? ListEmptyComponent
        : rows.map((item, index) => (
            <View key={keyExtractor?.(item, index) ?? String(index)}>
              {renderItem({ item, index })}
            </View>
          ))}
    </ScrollView>
  );
}
