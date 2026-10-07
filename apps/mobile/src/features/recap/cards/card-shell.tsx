/**
 * The frame every recap story card shares: its full-bleed ground (a guide colour, ink, or paper),
 * room at the top for the story's bars and header and at the bottom for the narration line and
 * the card's action, and the card's eyebrow and headline.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SurfaceToneProvider, type SurfaceTone } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Halftone } from '@/ui/textures/halftone';
import { makeStyles, useTheme } from '@/ui/theme';

/** The story's bars and header over the card. */
export const CHROME_PT = 100;
/** The narration line and a card action under it. */
export const FOOTER_PT = 150;

const useStyles = makeStyles((th) => ({
  ground: { flex: 1, overflow: 'hidden' },
  body: {
    flex: 1,
    paddingTop: CHROME_PT,
    paddingHorizontal: th.size.gutter,
    gap: th.space['12'],
  },
}));

export interface CardShellProps {
  readonly ground: string;
  readonly tone: SurfaceTone;
  readonly halftone?: boolean;
  readonly eyebrow?: string | null;
  readonly eyebrowColor?: string;
  readonly headline?: string | null;
  /** Room kept under the card's content. @default FOOTER_PT */
  readonly footerPt?: number;
  readonly children?: ReactNode;
  readonly testID: string;
}

export function CardShell({
  ground,
  tone,
  halftone = false,
  eyebrow = null,
  eyebrowColor,
  headline = null,
  footerPt = FOOTER_PT,
  children,
  testID,
}: CardShellProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={[styles.ground, { backgroundColor: ground }]} testID={testID}>
      <SurfaceToneProvider value={tone}>
        {halftone ? <Halftone /> : null}
        <View style={[styles.body, { paddingBottom: footerPt }]}>
          {eyebrow === null ? null : (
            <Text variant="eyebrow" color={eyebrowColor ?? theme.semantic.action.primary}>
              {eyebrow}
            </Text>
          )}
          {headline === null ? null : (
            <Text variant="h1" accessibilityRole="header">
              {headline}
            </Text>
          )}
          {children}
        </View>
      </SurfaceToneProvider>
    </View>
  );
}
