/**
 * Under the price line of a driver card: his own words when no one price could be read for this
 * crew, and every price he gave when there are several.
 */
import type { DriverCard } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { askWords, usePriceWords } from '../../shared/price-text';

export function PriceNotes({ card }: { readonly card: DriverCard }) {
  const theme = useTheme();
  const words = usePriceWords();
  const { t } = useLingui();
  const ask = askWords(card);
  const tiers = card.price_tiers ?? [];
  if (ask === null && tiers.length === 0) return null;
  return (
    <Stack gap="2" testID="drivers-check-price-notes">
      {ask === null ? null : (
        <Text variant="bodySm" color={theme.color.orange}>
          {t({ id: 'drivers.check.priceAskWords', message: `He wrote: “${ask}”` })}
        </Text>
      )}
      {tiers.map((tier) => (
        <Text key={tier.label} variant="bodySm" color={theme.semantic.text.secondary}>
          {words.tier(tier)}
        </Text>
      ))}
    </Stack>
  );
}
