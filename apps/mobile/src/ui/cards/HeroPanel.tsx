import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { SurfaceToneProvider } from '../surface/Scaffold';
import { Halftone } from '../textures/halftone';
import { makeStyles, useTheme } from '../theme';
import type { CardTone } from './tone';
import { cardBackground, surfaceToneOf } from './tone';

export interface HeroPanelProps {
  /** @default 'yellow' */
  readonly tone?: Exclude<CardTone, 'raised' | 'sunken'>;
  /** @default true */
  readonly halftone?: boolean;
  /** Sticker that sits over the panel's bottom edge at the end side. */
  readonly sticker?: ReactNode;
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  panel: {
    borderBottomLeftRadius: t.radius.heroBottom,
    borderBottomRightRadius: t.radius.heroBottom,
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['24'],
    paddingBottom: t.space['32'],
    overflow: 'hidden',
  },
  wrap: { overflow: 'visible' },
  sticker: { position: 'absolute', end: t.size.gutter, bottom: -t.space['32'] },
}));

/** Colour hero at the top of a screen: accent flood, halftone, r40 bottom, sticker over the edge. */
export function HeroPanel({
  tone = 'yellow',
  halftone = true,
  sticker,
  children,
  style,
  testID,
}: HeroPanelProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={[styles.panel, { backgroundColor: cardBackground(theme, tone) }, style]}>
        <SurfaceToneProvider value={surfaceToneOf(tone)}>
          {halftone ? <Halftone /> : null}
          {children}
        </SurfaceToneProvider>
      </View>
      {sticker ? <View style={styles.sticker}>{sticker}</View> : null}
    </View>
  );
}
