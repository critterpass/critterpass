/**
 * "Only you see this" with a lock, the pill the organiser's private pages carry (the guide's draft,
 * whose picks made it): the ink pill on the draft, the clear pill on the balance page.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Icon, Text, usePremiumTheme } from '@/ui/premium';

export function onlyYouText(): string {
  return t({ id: 'planDraft.onlyYou', message: 'Only you see this' });
}

export function OnlyYouPill({ ink = false }: { readonly ink?: boolean }) {
  const theme = usePremiumTheme();
  const color = ink ? theme.color.onInkSurface : theme.color.ink;
  return (
    <View
      accessible
      accessibilityLabel={onlyYouText()}
      testID="only-you-pill"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap6,
        height: 32,
        paddingHorizontal: theme.space.gap12,
        borderRadius: theme.radius.pill,
        backgroundColor: ink ? theme.color.inkSurface : theme.color.card,
        ...(ink ? {} : { borderWidth: 1, borderColor: theme.color.hairline }),
      }}
    >
      <Icon name="lock" size={13} color={color} />
      <Text variant="pillSmall" color={color} numberOfLines={1}>
        {onlyYouText()}
      </Text>
    </View>
  );
}
