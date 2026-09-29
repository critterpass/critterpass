import { useRef } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { FOOTER_FADE_PT } from './KeyboardFooter';

export interface KeyboardScrollViewProps extends Omit<ScrollViewProps, 'contentContainerStyle'> {
  readonly children: ReactNode;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * The scrolling body above a `KeyboardFooter`: whenever its height changes (the footer riding the
 * keyboard up, frame by frame) it keeps the focused text field inside it in view, just above the
 * footer, so typing never happens behind the button. Its content ends `FOOTER_FADE_PT` further
 * down, so the last item scrolls clear of the footer's fade.
 */
export function KeyboardScrollView({
  children,
  contentContainerStyle,
  onLayout,
  onScroll,
  ...rest
}: KeyboardScrollViewProps) {
  const theme = useTheme();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const content = useRef<ComponentRef<typeof View>>(null);
  const offset = useRef(0);
  const height = useRef(0);
  const margin = theme.space['16'];
  // The footer's fade covers the last FOOTER_FADE_PT of the view: pad past it so the end scrolls clear.
  const flat = StyleSheet.flatten(contentContainerStyle) ?? {};
  const ownEnd = flat.paddingBottom ?? flat.paddingVertical ?? flat.padding;
  const endInset = { paddingBottom: (typeof ownEnd === 'number' ? ownEnd : 0) + FOOTER_FADE_PT };

  const revealFocused = () => {
    const input = TextInput.State.currentlyFocusedInput();
    const container = content.current;
    if (input == null || container === null) return;
    // Fails (and is ignored) when the focused field lives outside this scroll view.
    input.measureLayout(
      container,
      (_x, y, _width, fieldHeight) => {
        const bottom = y + fieldHeight + margin;
        if (bottom > offset.current + height.current) {
          scroll.current?.scrollTo({ y: bottom - height.current, animated: false });
        } else if (y - margin < offset.current) {
          scroll.current?.scrollTo({ y: Math.max(0, y - margin), animated: false });
        }
      },
      () => undefined,
    );
  };

  return (
    <ScrollView
      ref={scroll}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      {...rest}
      onScroll={(event) => {
        offset.current = event.nativeEvent.contentOffset.y;
        onScroll?.(event);
      }}
      onLayout={(event) => {
        height.current = event.nativeEvent.layout.height;
        revealFocused();
        onLayout?.(event);
      }}
    >
      <View ref={content} collapsable={false} style={[contentContainerStyle, endInset]}>
        {children}
      </View>
    </ScrollView>
  );
}
