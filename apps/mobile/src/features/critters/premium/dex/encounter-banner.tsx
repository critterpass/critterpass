/**
 * The live encounter on the Critterdex (undesigned in the premium set): a mint card with where the
 * critter rustled and how full the ring is, opening the encounter. Its once-a-second progress
 * redraws only this card.
 */
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PressableScale, Text, makePremiumStyles } from '@/ui/premium';

import type { EncounterBannerModel } from '../../dex/encounter-banner';
import { modeLabel, rustled } from '../../encounter/encounter-copy';

const useStyles = makePremiumStyles((th) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 24,
    backgroundColor: th.accent.mint,
    boxShadow: th.shadow.raised,
  },
}));

export function PremiumEncounterBanner({ banner }: { readonly banner: EncounterBannerModel }) {
  const styles = useStyles();
  const locale = useLocale();
  const title = rustled(banner.place);
  return (
    <PressableScale
      style={styles.card}
      onPress={banner.onOpen}
      accessibilityRole="button"
      accessibilityLabel={title}
      testID="critters-encounter-banner"
    >
      <View style={{ flex: 1 }}>
        <Text variant="tier" tone="onAccent">
          {modeLabel(false).toLocaleUpperCase(locale)}
        </Text>
        <Text variant="rowTitle" tone="onAccent">
          {title}
        </Text>
      </View>
      <Text variant="stat" tone="onAccent" style={{ fontVariant: ['tabular-nums'] }}>
        {`${String(Math.round(banner.progress * 100))}%`}
      </Text>
    </PressableScale>
  );
}
