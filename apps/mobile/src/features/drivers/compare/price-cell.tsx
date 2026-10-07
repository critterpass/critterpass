/**
 * A driver's price cell in the comparison (6d-1), as he gave it: a rate says what it is counted
 * by, several prices are listed under the one that fits the crew, and with no one price to quote
 * the cell asks him in WhatsApp, his own words under it.
 */
import type { DriverCard } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Linking } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { ShortlistDriver } from '../shared/api';
import { askWords, usePriceWords } from '../shared/price-text';
import { askMessage, whatsappAsk } from '../shared/whatsapp-copy';

export function DayPriceCell(props: {
  readonly driver: ShortlistDriver;
  readonly card: DriverCard;
  readonly people: number;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const words = usePriceWords();
  const { driver, card } = props;
  const ask = askWords(card);
  const price = words.price(card);
  const tiers = card.price_tiers ?? [];
  return (
    <Stack gap="2" testID={`drivers-compare-price-${driver.id}`}>
      {ask === null ? (
        <Text variant="bodySm">{price ?? '—'}</Text>
      ) : (
        <>
          <PressScale
            accessibilityLabel={t({
              id: 'drivers.compare.askPriceHint',
              message: 'No one price yet. Ask him on WhatsApp',
            })}
            onPress={() => {
              const text =
                askMessage(t, driver.name, [], card.overtime_minor === null) +
                words.question(ask, props.people);
              const url = whatsappAsk(driver.phone, text);
              if (url !== null) void Linking.openURL(url);
            }}
          >
            <InfoPill variant="outline">
              {upper(t({ id: 'drivers.compare.askPrice', message: 'Ask him' }), locale)}
            </InfoPill>
          </PressScale>
          {tiers.length > 0 ? null : (
            <Text variant="caption" color={theme.semantic.text.secondary} numberOfLines={3}>
              {ask}
            </Text>
          )}
        </>
      )}
      {tiers.map((tier) => (
        <Text
          key={tier.label}
          variant="caption"
          color={theme.semantic.text.secondary}
          numberOfLines={2}
        >
          {words.tier(tier)}
        </Text>
      ))}
    </Stack>
  );
}
