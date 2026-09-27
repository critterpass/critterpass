import { forwardRef } from 'react';
import type { ReactElement } from 'react';
import { View } from 'react-native';

// FlashList/LegendList ship untranspiled ESM and recycle real native scroll views — neither of
// which Jest/Node can run. This renders every item as a plain View (RNTL has no real viewport, so
// virtualization isn't observable there anyway), enough to smoke-test the surrounding screen
// (code-standards.md §17: native-runtime boundary, same class as mock-skia.tsx).
interface MockListProps<Item> {
  readonly data: readonly Item[] | null | undefined;
  readonly renderItem: (info: { item: Item; index: number }) => ReactElement | null;
  readonly keyExtractor?: (item: Item, index: number) => string;
}

function createMockList<Item>() {
  return forwardRef<{ scrollToEnd: () => void }, MockListProps<Item>>(function MockList(
    { data, renderItem, keyExtractor },
    _ref,
  ) {
    return (
      <View>
        {(data ?? []).map((item, index) => (
          <View key={keyExtractor ? keyExtractor(item, index) : index}>
            {renderItem({ item, index })}
          </View>
        ))}
      </View>
    );
  });
}

export const FlashList = createMockList();
export const LegendList = createMockList();
