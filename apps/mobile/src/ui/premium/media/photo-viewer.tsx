/**
 * The premium full-screen viewer for the photos and videos of one set, drawn inside the cover
 * route that shows it: black under the pictures, the ✕ top-left on clear glass, the "3 / 12"
 * counter centred on clear glass (none for one item), and the caption and credit over a dark fade
 * at the foot (a credit is always shown), or the set's own bar there. Swipe sideways between the
 * items (the counter steps them for a screen reader), pinch or double-tap to zoom, drag down to put
 * it away; the black thins as it is dragged. Reduce Motion settles at once.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test ids, never copy */
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import {
  clampIndex,
  counterOf,
  linesOf,
  type LightboxItem,
} from '@/lib/media/viewer/lightbox-model';
import { LightboxVideo } from '@/lib/media/viewer/lightbox-video';
import { ZoomPage } from '@/lib/media/viewer/zoom-page';

import { GlassIconButton } from '../glass/GlassIconButton';
import { GlassSurface } from '../glass/GlassSurface';
import { SPRINGS } from '../motion/springs';
import { usePremiumReducedMotion } from '../motion/reduced-motion';
import { Spinner } from '../feedback/Spinner';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { PHOTO_VIEWER_PAINT } from './photo-viewer-paint';

export interface PhotoViewerProps {
  readonly items: readonly LightboxItem[];
  /** The item it opens on. @default 0 */
  readonly initialIndex?: number;
  /** ✕, a drag down, and the system back. */
  readonly onClose: () => void;
  /** The label the ✕ speaks ("Close"). */
  readonly closeLabel: string;
  /**
   * A set's own bar for the item on screen (an album's actions), in place of the caption and
   * credit. It is drawn over the whole viewer and places itself; touches outside it reach the
   * pictures.
   */
  readonly footer?: (index: number) => ReactNode;
  readonly testID?: string;
}

/** A drag down this far, or a flick this fast, puts the viewer away. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
/** How far a finger travels before a drag is taken (not a tap). */
const DRAG_SLOP = 14;
/** Movement after the drag is recognised before it is read as sideways or down. */
const AXIS_SLOP = 4;
/** A sideways drag past this share of the screen, or a flick this fast, turns the page. */
const TURN_SHARE = 0.2;
const TURN_VELOCITY = 500;
/** How far the first and last page give past their edge. */
const EDGE_GIVE = 48;
/** The band above the foot a video's own scrub bar sits in. */
const SCRUB_STRIP = 96;
/** The black thins to this as the viewer is dragged away. */
const GROUND_FLOOR = 0.4;
/** How long a zoom takes to settle. */
const ZOOM_SETTLE_MS = 200;
/** The row of the ✕ and the counter under the status bar. */
const TOP_ROW = 56;

export function PhotoViewer({
  items,
  initialIndex = 0,
  onClose,
  closeLabel,
  footer,
  testID = 'photo-viewer',
}: PhotoViewerProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduced = usePremiumReducedMotion();
  const count = items.length;
  const [index, setIndex] = useState(() => clampIndex(initialIndex, count));
  const [zoomed, setZoomed] = useState(false);
  const [footHeight, setFootHeight] = useState(0);
  const rowX = useSharedValue(-clampIndex(initialIndex, count) * width);
  const startRowX = useSharedValue(0);
  const dismissY = useSharedValue(0);
  /** 0 until the drag picks its way: 1 sideways (turning the page), 2 down (putting it away). */
  const axis = useSharedValue(0);

  const settle = (to: number) => (reduced ? to : withSpring(to, SPRINGS.snappy));
  const goTo = (next: number) => {
    const to = clampIndex(next, count);
    rowX.set(settle(-to * width));
    if (to !== index) setIndex(to);
  };

  // One drag for the whole viewer: sideways turns the page, down puts it away. One finger, only on
  // an unzoomed page (a second finger is the page's pinch); over a video the strip with the
  // player's scrub bar is left to the player.
  const overVideo = items[index]?.kind === 'video';
  const pan = Gesture.Pan()
    .enabled(!zoomed)
    .maxPointers(1)
    .activeOffsetX([-DRAG_SLOP, DRAG_SLOP])
    .activeOffsetY(DRAG_SLOP)
    .failOffsetY(-DRAG_SLOP)
    .hitSlop(overVideo ? { bottom: -(Math.max(footHeight, insets.bottom) + SCRUB_STRIP) } : 0)
    .withTestId(`${testID}-pan`)
    .onStart(() => {
      'worklet';
      startRowX.set(rowX.get());
      axis.set(0);
    })
    .onUpdate((event) => {
      'worklet';
      if (axis.get() === 0) {
        const across = Math.abs(event.translationX);
        const down = Math.abs(event.translationY);
        if (Math.max(across, down) < AXIS_SLOP) return;
        axis.set(across >= down ? 1 : 2);
      }
      if (axis.get() === 1) {
        const least = -(count - 1) * width - EDGE_GIVE;
        rowX.set(Math.min(Math.max(startRowX.get() + event.translationX, least), EDGE_GIVE));
      } else {
        dismissY.set(Math.max(0, event.translationY));
      }
    })
    .onEnd((event) => {
      'worklet';
      if (axis.get() === 1) {
        const far = Math.abs(event.translationX) > width * TURN_SHARE;
        const fast = Math.abs(event.velocityX) > TURN_VELOCITY;
        const step = far || fast ? (event.translationX < 0 ? 1 : -1) : 0;
        scheduleOnRN(goTo, index + step);
        return;
      }
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        scheduleOnRN(onClose);
        return;
      }
      dismissY.set(reduced ? 0 : withSpring(0, SPRINGS.snappy));
    });
  const dragged = useAnimatedStyle(() => ({
    transform: [{ translateX: rowX.get() }, { translateY: dismissY.get() }],
  }));
  const ground = useAnimatedStyle(() => ({
    opacity: Math.max(GROUND_FLOOR, 1 - dismissY.get() / (DISMISS_DISTANCE * 3)),
  }));

  const current = items[clampIndex(index, count)];
  const counter = counterOf(index, count);
  const lines = current === undefined ? null : linesOf(current);
  const photoLabel = t({ id: 'common.premium.viewer.photo', message: 'Photo' });
  const videoLabel = t({ id: 'common.premium.viewer.video', message: 'Video' });
  const clear = th.material.clear.foreground;

  const page = (item: LightboxItem, at: number) => {
    // Only the page on screen and its neighbours are drawn; the rest keep their place in the row.
    if (Math.abs(at - index) > 1) return <View key={item.key} style={{ width, height }} />;
    const label = linesOf(item).caption ?? (item.kind === 'video' ? videoLabel : photoLabel);
    if (item.uri === null) {
      return (
        <View
          key={item.key}
          style={[styles.waiting, { width, height }]}
          testID={`${testID}-waiting-${at}`}
        >
          <Spinner
            color={PHOTO_VIEWER_PAINT.onPhoto}
            trackColor={PHOTO_VIEWER_PAINT.onPhotoMuted}
          />
        </View>
      );
    }
    const active = at === index;
    return (
      <ZoomPage
        key={item.key}
        width={width}
        height={height}
        zoomable={item.kind === 'image'}
        settleMs={reduced ? 0 : ZOOM_SETTLE_MS}
        zoomed={active && zoomed}
        onZoomChange={setZoomed}
        testID={`${testID}-page-${at}`}
      >
        {item.kind === 'video' ? (
          // Clear of the top row and the foot, so the player's own controls stay reachable.
          <View
            style={[
              styles.video,
              { top: insets.top + TOP_ROW, bottom: Math.max(footHeight, insets.bottom) },
            ]}
          >
            <LightboxVideo uri={item.uri} poster={item.poster} active={active} label={label} />
          </View>
        ) : (
          <Image
            source={{ uri: item.uri }}
            resizeMode="contain"
            style={StyleSheet.absoluteFill}
            accessible
            accessibilityRole="image"
            accessibilityLabel={label}
            accessibilityIgnoresInvertColors
            testID={`${testID}-image-${at}`}
          />
        )}
      </ZoomPage>
    );
  };

  return (
    <View style={styles.root} accessibilityViewIsModal testID={testID}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.ground, ground]} />
      <GestureDetector gesture={pan}>
        <View style={[styles.root, styles.clip]} testID={`${testID}-pager`}>
          <Animated.View style={[styles.row, { width: width * count }, dragged]}>
            {items.map(page)}
          </Animated.View>
        </View>
      </GestureDetector>
      <View
        style={[
          styles.top,
          { top: insets.top + th.space.gap6, paddingHorizontal: th.space.gutter },
        ]}
        pointerEvents="box-none"
      >
        <GlassIconButton
          icon="close"
          kind="clear"
          label={closeLabel}
          onPress={onClose}
          testID={`${testID}-close`}
        />
        <View style={styles.middle} pointerEvents="box-none">
          {counter === null ? null : (
            <View
              testID={`${testID}-position`}
              accessible
              accessibilityRole="adjustable"
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) =>
                goTo(index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))
              }
              accessibilityLabel={t({
                id: 'common.premium.viewer.counterLabel',
                message: `${counter.position} of ${counter.total}`,
              })}
            >
              <GlassSurface
                kind="clear"
                style={{
                  height: th.size.glassPill,
                  borderRadius: th.radius.glassNav,
                  paddingHorizontal: th.space.pillPadH,
                  justifyContent: 'center',
                }}
              >
                <Text variant="glassTitle" color={clear} testID={`${testID}-counter`}>
                  {t({
                    id: 'common.premium.viewer.counter',
                    message: `${counter.position} / ${counter.total}`,
                  })}
                </Text>
              </GlassSurface>
            </View>
          )}
        </View>
        <View style={{ width: th.size.glassNav }} />
      </View>
      {footer !== undefined ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {footer(clampIndex(index, count))}
        </View>
      ) : lines === null || (lines.caption === null && lines.credit === null) ? null : (
        <View
          style={[
            styles.foot,
            {
              paddingHorizontal: th.space.gutter,
              paddingBottom: insets.bottom + th.space.gap12,
              gap: th.space.gap4,
            },
          ]}
          onLayout={(event) => setFootHeight(event.nativeEvent.layout.height)}
          pointerEvents="none"
        >
          {lines.caption === null ? null : (
            <Text
              variant="rowText"
              color={PHOTO_VIEWER_PAINT.onPhoto}
              singleLine={false}
              numberOfLines={3}
              testID={`${testID}-caption`}
            >
              {lines.caption}
            </Text>
          )}
          {lines.credit === null ? null : (
            <Text
              variant="caption"
              color={PHOTO_VIEWER_PAINT.onPhotoMuted}
              singleLine={false}
              numberOfLines={2}
              testID={`${testID}-credit`}
            >
              {lines.credit}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  ground: { backgroundColor: PHOTO_VIEWER_PAINT.ground },
  clip: { overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  waiting: { alignItems: 'center', justifyContent: 'center' },
  video: { position: 'absolute', left: 0, right: 0 },
  top: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  middle: { flex: 1, alignItems: 'center' },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 40,
    experimental_backgroundImage: PHOTO_VIEWER_PAINT.footFade,
  },
});
