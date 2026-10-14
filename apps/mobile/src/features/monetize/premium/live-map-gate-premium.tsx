/**
 * Crew map, unboosted (9.19): the bottom card over a quiet preview of the map, for the crew lane's
 * live map to place. The trip isn't boosted, so the live map is off; Help and SOS share location on
 * any trip regardless. Boost (per person when split) or Maybe later (a quiet no for this trip).
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button, GlassSurface, Text, TextButton, usePremiumTheme } from '@/ui/premium';

export interface LiveMapGatePremiumProps {
  readonly place: string;
  /** The store's price, or each share when split; null while the store has none. */
  readonly price: string | null;
  readonly onBoost: () => void;
  readonly onLater: () => void;
}

export function LiveMapGatePremium({ place, price, onBoost, onLater }: LiveMapGatePremiumProps) {
  const { t } = useLingui();
  const th = usePremiumTheme();
  const locale = useLocale();
  return (
    <View
      style={[styles.card, { borderRadius: 44, boxShadow: th.materialShadow.regular }]}
      testID="live-map-gate"
    >
      <GlassSurface kind="regular" style={[StyleSheet.absoluteFill, { borderRadius: 44 }]} />
      <View style={styles.body}>
        <Text variant="badge" color={th.color.status.voteOpen.text} style={styles.eyebrow}>
          {upper(
            t({ id: 'monetize.premium.gateEyebrow', message: `${place} isn’t boosted` }),
            locale,
          )}
        </Text>
        <Text variant="emptyTitle" style={styles.title} accessibilityRole="header">
          {t({ id: 'monetize.premium.gateTitle', message: 'The live map' })}
        </Text>
        <Text variant="rowText" tone="inkSecondary">
          {t({
            id: 'monetize.premium.gateLine',
            message:
              'Boost the trip and the crew shows up live on trip days: who’s where, who’s late, who found the good noodles. Nobody’s history is kept.',
          })}
        </Text>
        <View style={[styles.safety, { backgroundColor: th.color.banner.success.bg }]}>
          <Text variant="caption" color={th.color.banner.success.text}>
            {t({
              id: 'monetize.premium.gateSafety',
              message: 'Help and SOS share your location on any trip, boosted or not.',
            })}
          </Text>
        </View>
        <Button
          label={
            price === null
              ? t({ id: 'monetize.premium.gateBoost', message: `Boost ${place}` })
              : t({ id: 'monetize.premium.gateBoostPrice', message: `Boost ${place} · ${price}` })
          }
          onPress={onBoost}
          testID="live-map-gate-boost"
        />
        <View style={{ alignItems: 'center' }}>
          <TextButton
            align="center"
            label={t({ id: 'monetize.premium.later', message: 'Maybe later' })}
            onPress={onLater}
            testID="live-map-gate-later"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 10, marginBottom: 10, overflow: 'hidden' },
  body: { padding: 22, paddingBottom: 18, gap: 10 },
  eyebrow: { fontWeight: '800', letterSpacing: 0.9 },
  title: { fontWeight: '800' },
  safety: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
});
