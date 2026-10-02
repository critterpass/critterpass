/**
 * FlashList double for Jest: FlashList recycles real native scroll views and ships untranspiled
 * ESM, neither of which Node can run (a native-runtime boundary, docs/code-standards.md §17). It
 * renders every row and the footer in a plain scroll view, in order (RNTL has no viewport anyway),
 * passes the scroll view's events through, and records each `scrollToEnd` asked of it.
 */
import { forwardRef, useImperativeHandle, type ReactElement, type ReactNode } from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';

interface ListProps<Item> {
  readonly data: readonly Item[] | null | undefined;
  readonly renderItem: (info: { item: Item; index: number }) => ReactElement | null;
  readonly keyExtractor?: (item: Item, index: number) => string;
  readonly ListFooterComponent?: ReactNode;
  readonly testID?: string;
  readonly onScroll?: ScrollViewProps['onScroll'];
  readonly onScrollBeginDrag?: ScrollViewProps['onScrollBeginDrag'];
  readonly onContentSizeChange?: ScrollViewProps['onContentSizeChange'];
}

/** Every `scrollToEnd` call on any list, in order; clear it between tests. */
export const scrollToEndCalls: { readonly animated?: boolean }[] = [];

export const FlashList = forwardRef<
  { scrollToEnd: (options?: { animated?: boolean }) => void },
  ListProps<unknown>
>(function FlashList(
  {
    data,
    renderItem,
    keyExtractor,
    ListFooterComponent,
    testID,
    onScroll,
    onScrollBeginDrag,
    onContentSizeChange,
  },
  ref,
) {
  useImperativeHandle(ref, () => ({
    scrollToEnd: (options) => {
      scrollToEndCalls.push(options ?? {});
    },
  }));
  return (
    <ScrollView
      testID={testID}
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      onContentSizeChange={onContentSizeChange}
    >
      {(data ?? []).map((item, index) => (
        <View key={keyExtractor ? keyExtractor(item, index) : index}>
          {renderItem({ item, index })}
        </View>
      ))}
      {ListFooterComponent}
    </ScrollView>
  );
});
