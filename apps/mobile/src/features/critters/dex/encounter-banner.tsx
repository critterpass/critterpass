/**
 * On the PASS tab while an encounter is under way: where it is and how full the ring is, opening
 * the encounter. Built from the card and progress parts the Critterdex already uses.
 */
import { upper } from '@cp/i18n';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { modeLabel, rustled } from '../encounter/encounter-copy';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a width reference, never shown.
const WIDEST = '100%';

const styles = StyleSheet.create({
  figure: { flexShrink: 0, justifyContent: 'center' },
  widest: { opacity: 0 },
  shown: { position: 'absolute', left: 0, right: 0, textAlign: 'right' },
});

export interface EncounterBannerModel {
  readonly place: string;
  readonly progress: number;
  readonly onOpen: () => void;
}

export function EncounterBanner({ banner }: { readonly banner: EncounterBannerModel }) {
  const theme = useTheme();
  const locale = useLocale();
  const title = rustled(banner.place);
  return (
    <Card
      tone="green"
      onPress={banner.onOpen}
      accessibilityLabel={title}
      testID="critters-encounter-banner"
    >
      <Row gap="12" align="center">
        <Stack gap="2" flex={1}>
          <Text variant="eyebrow" color={theme.semantic.text.onAccent}>
            {upper(modeLabel(false), locale)}
          </Text>
          <Text variant="title" color={theme.semantic.text.onAccent}>
            {title}
          </Text>
        </Stack>
        {/* The box is as wide as the widest figure (100%), so 1% to 100% always fit uncut. */}
        <View style={styles.figure}>
          <Text
            variant="h2"
            autoFit={false}
            numberOfLines={1}
            color={theme.semantic.text.onAccent}
            style={styles.widest}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {WIDEST}
          </Text>
          <Text
            variant="h2"
            autoFit={false}
            numberOfLines={1}
            color={theme.semantic.text.onAccent}
            style={styles.shown}
          >
            {`${Math.round(banner.progress * 100)}%`}
          </Text>
        </View>
      </Row>
    </Card>
  );
}
