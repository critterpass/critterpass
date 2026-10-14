/**
 * A horizontal row that scrolls (chips, avatars, cards) without cutting what its children draw
 * past their boxes. A horizontal scroll view clips to its own bounds, so a chip's shadow ended in a
 * flat band and a selected avatar's ring lost its top and bottom. The row keeps room inside its
 * content for them and takes the same room back with negative margins, so it lays out as tall as
 * its children. Shadows fall downwards: the room under the row is the larger one.
 */
import type { ReactNode } from 'react';
import { ScrollView, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';

/** Room above the children: an outset ring (4.5) and the top of a soft shadow. */
export const ROW_ROOM_ABOVE = 10;
/** Room under the children: the deepest card or float shadow (offset + blur − spread). */
export const ROW_ROOM_BELOW = 28;

export interface ScrollRowProps extends Omit<
  ScrollViewProps,
  'horizontal' | 'contentContainerStyle' | 'style'
> {
  readonly children: ReactNode;
  /** Space between the children. */
  readonly gap?: number;
  /**
   * The parent's side padding the row reaches through, so it scrolls edge to edge and side
   * shadows aren't cut at the gutter; the first child still starts at the gutter.
   */
  readonly bleed?: number;
  readonly above?: number;
  readonly below?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
}

export function ScrollRow({
  children,
  gap,
  bleed = 0,
  above = ROW_ROOM_ABOVE,
  below = ROW_ROOM_BELOW,
  style,
  contentContainerStyle,
  ...rest
}: ScrollRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      alwaysBounceHorizontal={false}
      {...rest}
      style={[
        { flexGrow: 0, marginTop: -above, marginBottom: -below, marginHorizontal: -bleed },
        style,
      ]}
      contentContainerStyle={[
        {
          alignItems: 'center',
          paddingTop: above,
          paddingBottom: below,
          paddingHorizontal: bleed,
          ...(gap === undefined ? {} : { gap }),
        },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}
