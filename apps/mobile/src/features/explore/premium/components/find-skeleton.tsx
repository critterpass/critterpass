/**
 * Rows still on their way in a premium results card: two rows drawn as their skeletons (thumb,
 * title bar, meta bar), never an empty page.
 */
import { View } from 'react-native';

import { ListCard, Skeleton, usePremiumTheme } from '@/ui/premium';

export function FindSkeleton({ rows = 2 }: { readonly rows?: number }) {
  const t = usePremiumTheme();
  return (
    <ListCard>
      {Array.from({ length: rows }, (_, index) => (
        <View
          key={index}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space.gap12,
            paddingVertical: t.space.gap8 + 1,
            paddingHorizontal: t.space.gap12,
          }}
        >
          <Skeleton width={48} height={48} radius={t.radius.dayBadge} tone="block" />
          <View style={{ flex: 1, gap: t.space.gap6 }}>
            <Skeleton width="60%" height={12} />
            <Skeleton width="40%" height={10} tone="soft" />
          </View>
        </View>
      ))}
    </ListCard>
  );
}
