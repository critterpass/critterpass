/**
 * The small labels premium Explore screens share: the 13/600 muted section label over a card, and
 * the uppercase eyebrow over a card's title ("TIKTOK YOU COPIED", "WHEN IT FITS").
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react';

import { Text, usePremiumTheme } from '@/ui/premium';

export function SectionLabel({ children }: { readonly children: string }) {
  const theme = usePremiumTheme();
  return (
    <Text
      variant="label"
      tone="muted"
      accessibilityRole="header"
      style={{ paddingHorizontal: theme.space.gap8, marginTop: theme.space.gap6 }}
    >
      {children}
    </Text>
  );
}

export function Eyebrow({ text, color }: { readonly text: string; readonly color?: string }) {
  const { i18n } = useLingui();
  return (
    <Text variant="tier" tone="muted" {...(color === undefined ? {} : { color })} numberOfLines={1}>
      {upper(text, i18n.locale)}
    </Text>
  );
}
