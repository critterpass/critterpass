/**
 * The hub's hero (1.05, 6.01): the destination's photo under a dark fade, the clear-glass back and
 * menu circles, then the dates (or "Day 4 of 8"), the destination name and, before the trip, the
 * live countdown with the crew's stack. With no photo yet it is the 6.01 header on the ground.
 */
import type { MediaAsset } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CrewStack, GlassIconButton, Text, usePremiumTheme, type CrewMember } from '@/ui/premium';
import { StatusBarOver } from '@/ui/premium/shell';

import type { HubHeader } from '../../hub/hub-model';
import { usePhaseLine } from '../../hub/phase-line';
import { heroStillUri } from '../components/hero-still';

/** The photo's height: the 1.05 hero, tall enough for the name and the switch under it. */
export const HUB_HERO_HEIGHT = 380;

/**
 * The page's rounded top edge over the photo (1.05): the content rises over the hero's foot on
 * 24 pt corners instead of meeting the photo in a straight line.
 */
const SHEET_RADIUS = 24;
/** How much of that edge the content under it overlaps, so the switch sits its gap under the edge. */
const SHEET_TUCK = 16;

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
  /** The page has scrolled the hero away from under the status bar. */
  readonly scrolledPast?: boolean;
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
      <Text
        variant="label"
        tone="muted"
        numberOfLines={1}
        {...(color === undefined ? {} : { color })}
      >
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
  const uri = heroStillUri(props.media, width);
  const onPhoto = uri !== null;
  const text = onPhoto ? th.accent.paper : th.color.ink;
  return (
    <View
      style={[
        styles.hero,
        onPhoto
          ? {
              height: HUB_HERO_HEIGHT + SHEET_RADIUS + insets.top - th.space.statusBar,
              backgroundColor: th.color.inkSurface,
              marginBottom: -SHEET_TUCK,
            }
          : { paddingTop: insets.top + th.space.gap6 + th.size.glassNav + th.space.gap16 },
      ]}
      testID="trip-hub-hero"
    >
      {/* The clock and battery read in white over the photo, in the theme's ink once it has gone. */}
      <StatusBarOver dark={onPhoto && props.scrolledPast !== true} />
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
          {
            paddingHorizontal: th.space.titleGutter,
            paddingBottom: onPhoto ? 34 + SHEET_RADIUS : th.space.gap16,
          },
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
  // The countdown block hangs from the caption's line, so its label sits level with the dates and
  // the crew stack tucks under the digits instead of floating at the title's foot.
  foot: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  name: { flex: 1, minWidth: 0 },
  right: { alignItems: 'flex-end', gap: 8 },
  phase: { alignItems: 'flex-end' },
  tabular: { fontVariant: ['tabular-nums'] },
  sheetEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
  },
});
