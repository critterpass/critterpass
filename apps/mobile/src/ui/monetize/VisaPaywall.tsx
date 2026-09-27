import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { Engraving } from '../textures/engraving';
import { Guilloche } from '../textures/guilloche';
import { makeStyles, useTheme } from '../theme';

export interface VisaPaywallProps {
  /** Page chrome ("Visas · Visas · Visas"). */
  readonly chrome: string;
  /** "Page 07". */
  readonly page?: string;
  /** "Go further than free". */
  readonly headline: string;
  /** The Pass+ visa (document family `Visa`). */
  readonly visa: ReactNode;
  /** Boost entry and first-trip stamps. */
  readonly stamps?: ReactNode;
  /** Guide-hand note ("Critters are never for sale."). */
  readonly note?: string;
  /** Decorative machine-readable lines; hidden from screen readers. */
  readonly mrz?: readonly string[];
  /** Under the page: billing toggle, CTA and secondary links. */
  readonly footer?: ReactNode;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  page: {
    backgroundColor: th.color.paper.base,
    borderRadius: th.radius.xl,
    padding: th.space['16'],
    gap: th.space['12'],
    overflow: 'hidden',
  },
  mrz: {
    borderTopWidth: th.space['2'] / 2,
    borderStyle: 'dashed',
    borderColor: th.color.paper.muted,
    paddingTop: th.space['8'],
  },
}));

/**
 * The paywall as a passport visa page: chrome, headline, the visa and stamps laid on paper, a note
 * and decorative MRZ. Prices and perk copy come in through the slots, store-localised.
 */
export function VisaPaywall({
  chrome,
  page,
  headline,
  visa,
  stamps,
  note,
  mrz = [],
  footer,
  testID,
}: VisaPaywallProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack gap="16" testID={testID}>
      <View style={styles.page}>
        <SurfaceToneProvider value="paper">
          <Guilloche />
          <Engraving />
          <Row justify="space-between" importantForAccessibility="no-hide-descendants">
            <Text variant="monoData">{chrome}</Text>
            {page ? <Text variant="monoData">{page}</Text> : null}
          </Row>
          <Text variant="h1" accessibilityRole="header">
            {headline}
          </Text>
          {visa}
          {stamps ? (
            <Row gap="12" align="center" wrap>
              {stamps}
            </Row>
          ) : null}
          {note ? (
            <Text variant="voice" color={theme.color.rust.darkened}>
              {note}
            </Text>
          ) : null}
          {mrz.length > 0 ? (
            <View
              style={styles.mrz}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {mrz.map((line) => (
                <Text key={line} variant="monoData" numberOfLines={1}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </SurfaceToneProvider>
      </View>
      {footer}
    </Stack>
  );
}
