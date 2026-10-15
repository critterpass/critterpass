/**
 * A page's foot of actions (Save, Pitch to the crew, That's home): it stands on the page's ground
 * under the scroll view instead of floating over it, so the last row always clears it, and the
 * content fades into that ground above it rather than being cut. It rides the keyboard like a
 * sheet's footer. `PushScreen` takes one as `footer`; a screen that lays out its own body puts its
 * scroll view and this footer in one column.
 */
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePremiumTheme } from '../..';
import { KeyboardStickyFooter } from '../keyboard/keyboard';
import { FooterStack } from './footer-stack';

export interface PageFooterProps {
  readonly children: ReactNode;
  /** The ground it stands on. @default the theme's ground */
  readonly ground?: string;
  /** Keeps the home indicator's room under the actions. @default true */
  readonly bottomInset?: boolean;
}

export function PageFooter({ children, ground, bottomInset = true }: PageFooterProps) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const color = ground ?? t.color.ground;
  return (
    <KeyboardStickyFooter
      openedOffset={t.space.gap8}
      ground={color}
      style={{
        backgroundColor: color,
        paddingHorizontal: t.space.gutter,
        paddingTop: t.space.gap8,
        paddingBottom: (bottomInset ? insets.bottom : 0) + t.space.gap12,
      }}
    >
      <FooterStack>{children}</FooterStack>
    </KeyboardStickyFooter>
  );
}
