/**
 * The hub's hero (1.05, 6.01): the destination's photo under a dark fade, the clear-glass back and
 * menu circles, then the dates (or "Day 4 of 8"), the destination name and, before the trip, the
 * live countdown with the crew's stack. With no photo yet it is the 6.01 header on the ground.
 */
import type { MediaAsset } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Image, PixelRatio, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { savedStillUri } from '@/lib/media/media-files';
import { pickBySize } from '@/lib/media/variants';
import { CrewStack, GlassIconButton, Text, usePremiumTheme, type CrewMember } from '@/ui/premium';

import type { HubHeader } from '../../hub/hub-model';
import { usePhaseLine } from '../../hub/phase-line';

/** The photo's height: the 1.05 hero, tall enough for the name and the switch under it. */
export const HUB_HERO_HEIGHT = 380;

/** The photo's fade: dark at the top for the circles, clear in the middle, dark under the name. */
const HERO_FADE =
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, not copy
  'linear-gradient(180deg, rgba(10,10,25,0.35) 0%, rgba(10,10,25,0) 35%, rgba(10,10,25,0.6) 100%)';

export interface HubHeroProps {
  readonly destination: string;
  /** "Oct 12–19 · 6 going", or "Day 4 of 8 · Thu 15 Oct" during the trip. */
  readonly caption: string | null;
  readonly header: HubHeader;
  readonly media: MediaAsset | null;
  readonly crew: readonly CrewMember[];
  readonly onBack: () => void;
  readonly onMenu: (() => void) | null;
}

function heroUri(media: MediaAsset | null, widthPt: number): string | null {
  if (media === null) return null;
  const still = pickBySize(media.images, widthPt * PixelRatio.get());
  if (still === undefined) return null;
  return savedStillUri(media, still.url) ?? still.url;
}

/** The countdown (or day count) on the right; its digits re-read every second. */
function PhaseBlock({
  header,
  onPhoto,
}: {
  readonly header: HubHeader;
  readonly onPhoto: boolean;
}) {
  const line = usePhaseLine(header, undefined);
  const th = usePremiumTheme();
  if (line === null || header.phase === 'in') return null;
  const color = onPhoto ? th.accent.paper : undefined;
  return (
    <View style={styles.phase} testID="trip-hub-phase">
      <Text variant="caption" tone="muted" {...(color === undefined ? {} : { color })}>
        {line.label}
      </Text>
      <Text
        variant="title"
        style={styles.tabular}
        accessibilityRole="timer"
        {...(color === undefined ? {} : { color })}
      >
        {line.value}
      </Text>
    </View>
  );
}

export function HubHero(props: HubHeroProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const uri = heroUri(props.media, width);
  const onPhoto = uri !== null;
  const text = onPhoto ? th.accent.paper : th.color.ink;
  return (
    <View
      style={[
        styles.hero,
        onPhoto
          ? {
              height: HUB_HERO_HEIGHT + insets.top - th.space.statusBar,
              backgroundColor: th.color.inkSurface,
            }
          : { paddingTop: insets.top + th.space.gap6 + th.size.glassNav },
      ]}
      testID="trip-hub-hero"
    >
      {onPhoto ? (
        <>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundImage: HERO_FADE,
              },
            ]}
          />
        </>
      ) : null}
      <View
        style={[
          styles.controls,
          { top: insets.top + th.space.gap6, paddingHorizontal: th.space.gutter },
        ]}
      >
        <GlassIconButton
          icon="back"
          kind={onPhoto ? 'clear' : 'nav'}
          label={t({ id: 'trip.hub.premium.back', message: 'Back to your trips' })}
          onPress={props.onBack}
          testID="trip-hub-back"
        />
        {props.onMenu === null ? null : (
          <GlassIconButton
            icon="more"
            kind={onPhoto ? 'clear' : 'nav'}
            label={t({ id: 'trip.hub.premium.menu', message: 'Trip options' })}
            onPress={props.onMenu}
            testID="trip-hub-menu"
          />
        )}
      </View>
      <View
        style={[
          styles.foot,
          { paddingHorizontal: th.space.titleGutter, paddingBottom: onPhoto ? 34 : th.space.gap16 },
        ]}
      >
        <View style={styles.name}>
          {props.caption === null ? null : (
            <Text variant="label" color={onPhoto ? text : th.color.muted} numberOfLines={1}>
              {props.caption}
            </Text>
          )}
          <Text
            variant="hero"
            color={text}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            accessibilityRole="header"
            testID="trip-hub-destination"
          >
            {props.destination}
          </Text>
        </View>
        <View style={styles.right}>
          <PhaseBlock header={props.header} onPhoto={onPhoto} />
          {props.crew.length === 0 ? null : (
            <CrewStack
              members={props.crew}
              size={22}
              max={6}
              accessibilityLabel={t({
                id: 'trip.hub.premium.crew',
                message: `${props.crew.length} going`,
              })}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { justifyContent: 'flex-end', overflow: 'hidden' },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  foot: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  name: { flex: 1, minWidth: 0 },
  right: { alignItems: 'flex-end', gap: 8, paddingBottom: 10 },
  phase: { alignItems: 'flex-end' },
  tabular: { fontVariant: ['tabular-nums'] },
});
