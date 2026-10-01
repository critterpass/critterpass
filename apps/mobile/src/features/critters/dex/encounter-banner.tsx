/**
 * On the PASS tab while an encounter is under way: where it is and how full the ring is, opening
 * the encounter. Built from the card and progress parts the Critterdex already uses.
 */
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { modeLabel, rustled } from '../encounter/encounter-copy';

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
        {/* At its own size: a number fitted to a row with no width of its own gets cut. */}
        <Text
          variant="h2"
          autoFit={false}
          color={theme.semantic.text.onAccent}
          style={{ flexShrink: 0 }}
        >
          {`${Math.round(banner.progress * 100)}%`}
        </Text>
      </Row>
    </Card>
  );
}
