/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { registerFixture } from '../gallery/registry';
import { Stack } from '../layout/Stack';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { makeStyles } from '../theme';
import type { TextVariant } from './Text';
import { Text, TEXT_VARIANTS } from './Text';

const SAMPLE: Partial<Record<TextVariant, string>> = {
  displayMega: 'Kyoto',
  displayHero: '17d 05:26',
  displayXl: 'Befriended!',
  h1: 'Where next?',
  monoData: 'P<IDNWINSTON<<CRITTER<<<<<<',
  voice: 'Blossoms peak around April 3.',
};

registerFixture('Text', 'all variants', () => (
  <Stack gap="8">
    {(Object.keys(TEXT_VARIANTS) as TextVariant[]).map((variant) => (
      <Text key={variant} variant={variant}>
        {SAMPLE[variant] ?? variant}
      </Text>
    ))}
  </Stack>
));

/** Every display-class variant, whose tight leading must still fit cap tops and stacked marks. */
const DISPLAY_VARIANTS = (Object.keys(TEXT_VARIANTS) as TextVariant[]).filter(
  (variant) => TEXT_VARIANTS[variant].condensed,
);

registerFixture('Text', 'stacked marks at every display size', () => (
  <Stack gap="8">
    {DISPLAY_VARIANTS.map((variant) => (
      <Text key={variant} variant={variant} autoFit={false}>
        VIỆT NAM · ĐẶT CHỖ · CHUYẾN ĐI
      </Text>
    ))}
  </Stack>
));

registerFixture('Text', 'h1 auto-fit long title', () => (
  <Text variant="h1">Your whole crew is going to Kyoto in cherry blossom season</Text>
));

registerFixture('Text', 'uppercase casing per locale', () => (
  <Stack gap="4">
    <Text variant="label">istanbul · straße</Text>
    <Text variant="eyebrow">section label</Text>
  </Stack>
));

const usePaperStyles = makeStyles((t) => ({
  paper: { backgroundColor: t.color.paper.base, borderRadius: t.radius.md },
}));

function OnPaper() {
  const styles = usePaperStyles();
  return (
    <SurfaceToneProvider value="paper">
      <Stack gap="4" padding="12" style={styles.paper}>
        <Text variant="eyebrow">Passport · page 2</Text>
        <Text variant="title">Entry stamp</Text>
        <Text variant="voice">Welcome to Bali!</Text>
      </Stack>
    </SurfaceToneProvider>
  );
}

registerFixture('Text', 'on paper', () => <OnPaper />);
