import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { TextButtonAlignProvider } from '../../buttons/TextButton';

export interface FooterStackProps {
  readonly children: ReactNode;
  /** Space between the actions; the text button's own 44 pt target spaces it by default. */
  readonly gap?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A screen's or sheet's foot of actions: full-width buttons, and under them the text buttons
 * centred beneath them ("Not now", "Cancel the draft"). A text button that the design keeps at the
 * start says so with `align="start"`. The shell's footer slots use it; a screen that pins its own
 * footer wraps its actions in it.
 */
export function FooterStack({ children, gap, style }: FooterStackProps) {
  return (
    <TextButtonAlignProvider value="center">
      <View style={[gap === undefined ? null : { gap }, style]}>{children}</View>
    </TextButtonAlignProvider>
  );
}
