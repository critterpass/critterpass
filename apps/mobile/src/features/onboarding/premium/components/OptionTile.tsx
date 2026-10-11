/**
 * The 40 tinted tile that leads an option row (2.08, 2.10, 2.17): a glyph or a short mono code on
 * a status tint, r12.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { usePremiumTheme } from '@/ui/premium';

export function OptionTile({
  bg,
  children,
}: {
  readonly bg: string;
  readonly children: ReactNode;
}) {
  const theme = usePremiumTheme();
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: theme.radius.dayBadge,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}
