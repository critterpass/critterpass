/**
 * FlashList double for Jest: FlashList recycles real native scroll views and ships untranspiled
 * ESM, neither of which Node can run (a native-runtime boundary, docs/code-standards.md §17). It
 * renders the header, every row (or the empty component) and the footer as plain views, in order.
 */
import type { ComponentType, ReactElement, ReactNode } from 'react';
import { View } from 'react-native';

interface ListProps<Item> {
  readonly data: readonly Item[] | null | undefined;
  readonly renderItem: (info: { item: Item; index: number }) => ReactElement | null;
  readonly keyExtractor?: (item: Item, index: number) => string;
  readonly ListHeaderComponent?: ReactNode;
  readonly ListEmptyComponent?: ReactNode;
  readonly ListFooterComponent?: ReactNode;
  readonly ItemSeparatorComponent?: ComponentType;
  readonly testID?: string;
}

export function FlashList<Item>(props: ListProps<Item>) {
  const data = props.data ?? [];
  return (
    <View testID={props.testID}>
      {props.ListHeaderComponent}
      {data.length === 0 ? props.ListEmptyComponent : null}
      {data.map((item, index) => (
        <View key={props.keyExtractor ? props.keyExtractor(item, index) : index}>
          {props.renderItem({ item, index })}
        </View>
      ))}
      {props.ListFooterComponent}
    </View>
  );
}
