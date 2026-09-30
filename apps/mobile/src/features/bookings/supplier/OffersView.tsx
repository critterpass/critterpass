/**
 * Where to book one activity (6f-1's layout): the place in our words, a card per supplier and the
 * commission line pinned under the list. Live Viator products show in their own words; while the
 * in-app booking is off or the supplier is down, the cards are plain partner links.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { Disclosure } from './Disclosure';
import { OfferCard, type OfferCardProps } from './OfferCard';

export interface OffersViewProps {
  readonly title: string;
  readonly guide: string;
  readonly loading: boolean;
  readonly cards: readonly (OfferCardProps & { readonly key: string })[];
  /** Why the cards are links, or that nothing can be opened right now. */
  readonly notice?: string | null;
  readonly onBack?: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  footer: { paddingHorizontal: t.size.gutter, paddingTop: t.space['8'] },
}));

export function OffersView({ title, guide, loading, cards, notice, onBack }: OffersViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { t } = useLingui();
  return (
    <Scaffold variant="dark" testID="supplier-offers">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: theme.space['24'] }]}>
        <BackEyebrow
          label={upper(t({ id: 'suppliers.offers.back', message: 'Back' }), locale)}
          {...(onBack ? { onPress: onBack } : {})}
        />
        <Text variant="h1" accessibilityRole="header">
          {upper(title, locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'suppliers.offers.lede',
            message:
              'Booked and paid with the supplier. Their titles and prices are theirs, word for word.',
          })}
        </Text>
        {notice ? (
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            testID="supplier-offers-notice"
          >
            {notice}
          </Text>
        ) : null}
        {loading ? (
          <Skeleton
            preset="card"
            repeat={2}
            label={t({ id: 'suppliers.offers.loading', message: 'Checking the suppliers' })}
            testID="supplier-offers-loading"
          />
        ) : (
          cards.map(({ key, ...card }) => <OfferCard key={key} {...card} />)
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.space['8'] }]}>
        <Disclosure guide={guide} />
      </View>
    </Scaffold>
  );
}
