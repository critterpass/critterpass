/**
 * Where to book one activity, premium push: the place as the title, the line that prices and
 * titles are the supplier's word for word, why the cards are links when they are, a card per
 * supplier (live Viator products in their own words, else partner links), and the commission line
 * at the foot. Glass back; edge swipe goes back.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { LoadingCritter, Text, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { SupplierApi } from '../../supplier/data/api';
import { useOffers, type OfferParams } from '../../supplier/use-offers';
import { DisclosureLine } from '../components/DisclosureLine';
import { OfferCardPremium } from './OfferCardPremium';

export function OffersPremium({
  params,
  api,
}: {
  readonly params: OfferParams;
  readonly api?: SupplierApi;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const offers = useOffers(params, api);
  return (
    <PushScreen
      title={offers.title}
      backLabel={t({ id: 'suppliers.offers.back', message: 'Back' })}
      testID="supplier-offers"
    >
      <View style={[styles.body, { paddingHorizontal: th.space.gutter, gap: th.space.gap14 }]}>
        <Text variant="rowText" tone="muted">
          {t({
            id: 'suppliers.offers.lede',
            message:
              'Booked and paid with the supplier. Their titles and prices are theirs, word for word.',
          })}
        </Text>
        {offers.notice ? (
          <Text variant="label" tone="inkSecondary" testID="supplier-offers-notice">
            {offers.notice}
          </Text>
        ) : null}
        {offers.loading ? (
          <LoadingCritter
            label={t({ id: 'suppliers.offers.loading', message: 'Checking the suppliers' })}
            testID="supplier-offers-loading"
          />
        ) : (
          offers.cards.map(({ key, ...card }) => <OfferCardPremium key={key} {...card} />)
        )}
        <DisclosureLine guide={offers.guide} />
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({ body: { paddingTop: 8, paddingBottom: 32 } });
