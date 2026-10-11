/* eslint-disable lingui/no-unlocalized-strings -- the dev kit gallery's sample labels, never shipped copy. */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '../text/Text';
import { makePremiumStyles } from '../theme/PremiumThemeProvider';

/** One titled block of the premium kit gallery (`app/(dev)/premium-kit.tsx`), dev builds only. */
export function GallerySection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text variant="mono" tone="muted" accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

/** Samples laid side by side, wrapping. */
export function GalleryRow({ children }: { readonly children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.row}>{children}</View>;
}

const useStyles = makePremiumStyles((t) => ({
  section: { gap: t.space.gap12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.gap10 },
}));
