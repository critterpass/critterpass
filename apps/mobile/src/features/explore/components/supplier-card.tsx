/**
 * Tickets and tours for a place. Partner offers are never fetched or kept by this page: the card
 * opens the offers screen, which shows each partner's own words for this view only. The card says
 * that a booking may earn us a commission, and offline it says offers need a connection.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface SupplierCardProps {
  readonly placeName: string;
  readonly offline: boolean;
  readonly onOpen: () => void;
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
    gap: t.space['10'],
  },
}));

export function SupplierCard({ placeName, offline, onOpen }: SupplierCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  return (
    <View style={styles.card} testID="explore-offers">
      <Text variant="eyebrow">
        {upper(t({ id: 'explore.offers.title', message: 'Tickets and tours' }), i18n.locale)}
      </Text>
      {offline ? (
        <Text variant="bodySm" testID="explore-offers-offline">
          {t({ id: 'explore.offers.offline', message: 'Offers need a connection.' })}
        </Text>
      ) : (
        <>
          <Text variant="bodySm">
            {t({
              id: 'explore.offers.body',
              message: `See what our booking partners have for ${placeName}, in their own words.`,
            })}
          </Text>
          <PillButton
            label={t({ id: 'explore.offers.open', message: 'See offers' })}
            size="sm"
            block={false}
            variant="secondary"
            onPress={onOpen}
            testID="explore-offers-open"
          />
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {t({
              id: 'explore.offers.disclosure',
              message: 'We may earn a commission if you book. It never changes what we rank first.',
            })}
          </Text>
        </>
      )}
    </View>
  );
}
