import { createContext, useContext } from 'react';
import type { ComponentProps, ComponentRef, Ref } from 'react';
import { ScrollView } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { Gesture } from 'react-native-gesture-handler';
import { GestureDetector } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';

type NativeGesture = ReturnType<typeof Gesture.Native>;
type ScrollViewProps = ComponentProps<typeof ScrollView> & {
  readonly ref?: Ref<ComponentRef<typeof ScrollView>>;
};

interface SheetScrollContextValue {
  readonly scroll: NativeGesture;
  readonly scrollY: SharedValue<number>;
}

export const SheetScrollContext = createContext<SheetScrollContextValue | null>(null);

/**
 * Scroll view for sheet content: scrolls normally, and once scrolled to the top a downward drag
 * hands off to the sheet (snap to a lower detent or dismiss). Outside a sheet it is a plain
 * scroll view.
 */
export function SheetScrollView({ onScroll, ...props }: ScrollViewProps) {
  const context = useContext(SheetScrollContext);
  if (!context) return <ScrollView {...props} onScroll={onScroll} />;
  const { scroll, scrollY } = context;
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // eslint-disable-next-line react-hooks/immutability -- a Reanimated shared value's `.value` setter in a scroll handler, not React state.
    scrollY.value = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  };
  return (
    <GestureDetector gesture={scroll}>
      <ScrollView {...props} bounces={false} scrollEventThrottle={16} onScroll={handleScroll} />
    </GestureDetector>
  );
}
