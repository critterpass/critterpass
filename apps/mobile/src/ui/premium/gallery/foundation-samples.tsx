/* eslint-disable lingui/no-unlocalized-strings -- the dev kit gallery's sample labels, never shipped copy. */
import { View } from 'react-native';

import { Button } from '../buttons/Button';
import { IconButton } from '../buttons/IconButton';
import { TextButton } from '../buttons/TextButton';
import { GlassIconButton } from '../glass/GlassIconButton';
import { GlassPill } from '../glass/GlassPill';
import { GlassSurface } from '../glass/GlassSurface';
import { Text } from '../text/Text';
import { kitType } from '../theme/kit-type';
import type { PremiumTypeName } from '../theme/kit-type';
import { makePremiumStyles } from '../theme/PremiumThemeProvider';
import { GalleryRow, GallerySection } from './gallery-section';

const TYPE_NAMES = Object.keys(kitType) as PremiumTypeName[];

export function TypeSamples() {
  return (
    <GallerySection title="Type">
      {TYPE_NAMES.map((name) => (
        <Text key={name} variant={name} numberOfLines={1}>
          {name} · Bali with the crew
        </Text>
      ))}
    </GallerySection>
  );
}

export function ButtonSamples() {
  return (
    <GallerySection title="Buttons">
      <Button label="Book the boat" onPress={noop} />
      <Button label="Book the boat" loading loadingLabel="Booking…" />
      <Button label="Book the boat" disabled />
      <Button label="Not now" variant="secondary" onPress={noop} />
      <Button label="Leave the crew" variant="destructive" onPress={noop} />
      <GalleryRow>
        <Button label="Approve" size="medium" onPress={noop} />
        <Button label="Keep 19:30" size="medium" variant="control" onPress={noop} />
        <Button label="Nudge" size="small" variant="floating" onPress={noop} />
        <TextButton label="Skip" onPress={noop} />
      </GalleryRow>
      <GalleryRow>
        <IconButton icon="share" label="Share" onPress={noop} />
        <IconButton icon="plus" label="Add" tone="ink" onPress={noop} />
        <IconButton icon="edit" label="Edit" tone="control" onPress={noop} />
        <IconButton icon="close" label="Close" disabled />
      </GalleryRow>
    </GallerySection>
  );
}

export function GlassSamples() {
  const styles = useStyles();
  return (
    <GallerySection title="Glass">
      <View style={styles.backdrop}>
        <GalleryRow>
          <GlassIconButton icon="back" label="Back" onPress={noop} />
          <GlassPill label="Ubud day" subtitle="Day 2 of 5" onPress={noop} />
          <GlassIconButton icon="more" label="More" kind="nav" onPress={noop} />
        </GalleryRow>
        {(['clear', 'regular', 'nav', 'sheet'] as const).map((kind) => (
          <GlassSurface key={kind} style={styles.panel} kind={kind}>
            <Text variant="rowTitle">{kind} glass</Text>
          </GlassSurface>
        ))}
      </View>
    </GallerySection>
  );
}

function noop(): void {}

const useStyles = makePremiumStyles((t) => ({
  backdrop: {
    padding: t.space.gap12,
    gap: t.space.gap12,
    borderRadius: t.radius.card,
    backgroundColor: t.accent.sky,
  },
  panel: { padding: t.space.gap16, borderRadius: t.radius.card },
}));
