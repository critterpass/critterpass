/**
 * Private tours (6f-1): a car with a driver from Klook or Viator, fixed price, booked and paid with
 * the supplier. Titles and prices are theirs, word for word, fetched for this view only and never
 * kept; ADD TO COMPARE keeps only the product id and the price shown. Where a partner's API is off
 * (or has nothing for the trip) its row is a plain link to its own search: no prices or ratings of
 * ours. The commission disclosure stays at the bottom.
 */
import { generateUuidV7 } from '@cp/domain';
import { currencyExponent, isKnownCurrency } from '@cp/cost-engine';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { Disclosure } from '@/features/bookings/supplier/Disclosure';
import { usePartnerLink } from '@/features/bookings/supplier/data/use-partner-link';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { deviceDriversApi, type Outcome, type PrivateTours } from '../shared/api';
import { shortlistCommand } from '../shared/commands';
import { splitDays } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  card: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, padding: t.space['16'] },
}));

export function PrivateToursScreen({ tripId, days }: { tripId: string; days?: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const plan = useDriverDays(tripId);
  const openLink = usePartnerLink();
  const shortlist = useCommand(shortlistCommand);
  const [tours, setTours] = useState<Outcome<PrivateTours> | null>(null);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const picked = splitDays(days);
  useEffect(() => {
    let live = true;
    void deviceDriversApi.privateTours(tripId, picked).then((outcome) => {
      if (live) setTours(outcome);
    });
    return () => {
      live = false;
    };
    // `picked` is derived from the `days` string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, days]);
  const value = tours?.kind === 'ok' ? tours.value : null;
  const partnerName = (partner: 'klook' | 'viator') => (partner === 'klook' ? 'Klook' : 'Viator');
  return (
    <Scaffold variant="dark" testID="drivers-tours">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: theme.space['32'] }]}>
        <BackEyebrow
          label={upper(t({ id: 'drivers.back.find', message: 'Find a driver' }), locale)}
          onPress={() => router.back()}
        />
        <Text variant="h1" designSize={52} accessibilityRole="header">
          {upper(t({ id: 'drivers.tours.title', message: 'Private tours' }), locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'drivers.tours.intro',
            message: 'Fixed price, booked and paid with the supplier. Titles, photos and ratings are theirs, word for word.',
          })}
        </Text>
        {tours === null ? (
          <Skeleton preset="photo" label={t({ id: 'drivers.tours.loading', message: 'Looking for private cars' })} />
        ) : null}
        {(value?.cards ?? []).map((card) => {
          const done = added.has(card.product_id);
          return (
            <View key={card.product_id} style={styles.card} testID={`drivers-tour-${card.product_id}`}>
              <Stack gap="8">
                <InfoPill variant="solid">
                  {upper(t({ id: 'drivers.tours.from', message: 'From Viator' }), locale)}
                </InfoPill>
                <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                  {upper(t({ id: 'drivers.tours.theirWords', message: 'Their words' }), locale)}
                </Text>
                <Text variant="title">{card.title}</Text>
                {card.price_from === null || card.currency === null ? null : (
                  <Text variant="bodySm">
                    {t({
                      id: 'drivers.tours.price',
                      message: `From ${card.currency} ${card.price_from}`,
                    })}
                  </Text>
                )}
                <Row gap="8">
                  <View style={{ flex: 1 }}>
                    <PillButton
                      label={
                        done
                          ? t({ id: 'drivers.tours.added', message: 'In the comparison' })
                          : t({ id: 'drivers.tours.add', message: 'Add to compare' })
                      }
                      variant="secondary"
                      size="sm"
                      block
                      disabled={done || card.price_from === null || card.currency === null}
                      onPress={() => {
                        const currency = card.currency ?? 'USD';
                        const exp = isKnownCurrency(currency) ? currencyExponent(currency) : 2;
                        void shortlist
                          .send({
                            provider_id: generateUuidV7(),
                            trip_id: tripId,
                            supplier: 'viator',
                            product_id: card.product_id,
                            price_minor: Math.round((card.price_from ?? 0) * 10 ** exp),
                            currency,
                            price_unit: 'group',
                            included_hours: null,
                            seats: null,
                          })
                          .then((result) => {
                            if (result.kind === 'applied')
                              setAdded((prev) => new Set([...prev, card.product_id]));
                          });
                      }}
                      testID={`drivers-tour-add-${card.product_id}`}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PillButton
                      label={t({ id: 'drivers.tours.openViator', message: 'Open Viator' })}
                      tone="cream"
                      size="sm"
                      block
                      onPress={() =>
                        void openLink({
                          partner: 'viator',
                          tripId,
                          target: { kind: 'activity', query: card.title, ...(card.product_url ? { pageUrl: card.product_url } : {}) },
                        })
                      }
                    />
                  </View>
                </Row>
              </Stack>
            </View>
          );
        })}
        {(value?.links ?? [])
          .filter((link) => !(link.partner === 'viator' && (value?.cards.length ?? 0) > 0))
          .map((link) => (
            <View key={link.partner} style={styles.card} testID={`drivers-tours-link-${link.partner}`}>
              <TextLink
                label={
                  link.partner === 'klook'
                    ? t({ id: 'drivers.tours.klookLink', message: 'Private car charters on Klook ↗' })
                    : t({ id: 'drivers.tours.viatorLink', message: 'Private drivers on Viator ↗' })
                }
                onPress={() =>
                  void openLink({ partner: link.partner, tripId, target: link.target })
                }
                accessibilityHint={partnerName(link.partner)}
              />
            </View>
          ))}
        {tours !== null && tours.kind !== 'ok' ? (
          <Text variant="bodySm" color={theme.semantic.text.secondary} testID="drivers-tours-down">
            {t({
              id: 'drivers.tours.down',
              message: 'The suppliers aren’t answering right now. Try again in a bit.',
            })}
          </Text>
        ) : null}
        <Disclosure guide={plan.guide.id} />
      </ScrollView>
    </Scaffold>
  );
}
