/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { registerFixture } from '../gallery/registry';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { Barcode } from './barcode';
import { Engraving } from './engraving';
import { Guilloche } from './guilloche';
import { Halftone } from './halftone';
import { Hatch } from './hatch';
import { Holo } from './holo';
import { Rays } from './rays';
import { Sheen } from './sheen';

const useStyles = makeStyles((t) => ({
  box: {
    height: 140,
    borderRadius: t.radius.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: t.space['12'],
  },
  accent: { backgroundColor: t.color.yellow },
  paper: { backgroundColor: t.color.paper.base },
  dark: { backgroundColor: t.semantic.bg.raised },
  cta: { backgroundColor: t.semantic.action.primary, height: 58, borderRadius: 29 },
  barcode: { height: 48, backgroundColor: t.color.paper.bright },
}));

type Surface = 'accent' | 'paper' | 'dark' | 'cta' | 'barcode';

function Swatch({
  surface,
  label,
  children,
}: {
  surface: Surface;
  label: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={[styles.box, styles[surface]]}>
      {children}
      <Text variant="label" color={surface === 'dark' ? undefined : theme.semantic.text.onAccent}>
        {label}
      </Text>
    </View>
  );
}

registerFixture('Texture', 'halftone', () => (
  <Swatch surface="accent" label="tex.halftone">
    <Halftone />
  </Swatch>
));
registerFixture('Texture', 'halftone dark', () => (
  <Swatch surface="dark" label="tex.halftone.dark">
    <Halftone variant="dark" />
  </Swatch>
));
registerFixture('Texture', 'guilloche', () => (
  <Swatch surface="paper" label="tex.guilloche">
    <Guilloche />
  </Swatch>
));
registerFixture('Texture', 'hatch', () => (
  <Swatch surface="dark" label="tex.hatch">
    <Hatch />
  </Swatch>
));
registerFixture('Texture', 'engraving', () => (
  <Swatch surface="paper" label="tex.engraving">
    <Engraving />
  </Swatch>
));
registerFixture('Texture', 'barcode', () => (
  <Swatch surface="barcode" label="">
    <Barcode />
  </Swatch>
));
registerFixture('Texture', 'rays', () => (
  <Swatch surface="accent" label="tex.rays">
    <Rays />
  </Swatch>
));
registerFixture('Texture', 'holo', () => (
  <Swatch surface="dark" label="tex.holo">
    <Holo />
  </Swatch>
));
registerFixture('Texture', 'sheen', () => (
  <Swatch surface="cta" label="tex.sheen">
    <Sheen />
  </Swatch>
));
