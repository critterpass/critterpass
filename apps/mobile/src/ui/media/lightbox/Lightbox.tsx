/**
 * The full-screen viewer for the photos and videos of one set, over everything: swipe between the
 * items (or step with the counter's accessibility actions), pinch or double-tap to zoom, drag down (or ✕, or Android back) to put it away. The counter
 * sits at the top; an item's caption and credit sit at the bottom, and a credit is always shown.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { CloseButton } from '../../sheet/CloseButton';
import { Text } from '../../text/Text';
import { makeStyles, useTheme } from '../../theme';
import { clampIndex, counterOf, linesOf, type LightboxItem } from './lightbox-model';
import { LightboxVideo } from './lightbox-video';
import { ZoomPage } from './zoom-page';

export interface LightboxProps {
  readonly items: readonly LightboxItem[];
  /** The item it opens on. @default 0 */
  readonly initialIndex?: number;
  readonly onClose: () => void;
  readonly testID?: string;
}

/** A drag down this far, or a flick this fast, puts the viewer away. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
/** How far a finger travels before a drag is taken as down (not a tap, not a page turn). */
const DRAG_SLOP = 14;
/** A sideways drag past this share of the screen, or a flick this fast, turns the page. */
const TURN_SHARE = 0.2;
const TURN_VELOCITY = 500;
/** How far the first and last page give past their edge. */
const EDGE_GIVE = 48;
/** The band above the caption a video's own scrub bar sits in. */
const SCRUB_STRIP = 96;
/** The backdrop thins to this as the viewer is dragged away. */
const BACKDROP_FLOOR = 0.4;
/** The row of the counter and ✕ under the status bar. */
const TOP_ROW = 56;

const useStyles = makeStyles((t) => ({
  root: { flex: 1 },
  backdrop: { backgroundColor: t.semantic.bg.base },
  top: {
    position: 'absolute',
    start: t.size.gutter,
    end: t.size.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plate: {
    backgroundColor: t.semantic.bg.control,
    borderRadius: t.radius.pill,
    paddingHorizontal: t.space['12'],
    paddingVertical: t.space['6'],
  },
  foot: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['12'],
    gap: t.space['4'],
    backgroundColor: t.semantic.bg.base,
  },
  clip: { overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  waiting: { alignItems: 'center', justifyContent: 'center' },
}));

export function Lightbox({ items, initialIndex = 0, onClose, testID = 'lightbox' }: LightboxProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedImpactMotion();
  const [index, setIndex] = useState(() => clampIndex(initialIndex, items.length));
  const [zoomed, setZoomed] = useState(false);
  const [footHeight, setFootHeight] = useState(0);
  const dismissY = useSharedValue(0);

  const settleMs = reduced ? 0 : tokens.motion.duration.fast;
  const count = items.length;
  const rowX = useSharedValue(-clampIndex(initialIndex, count) * width);
  const startRowX = useSharedValue(0);
  /** 0 until the drag picks its way: 1 sideways (turning the page), 2 down (putting it away). */
  const axis = useSharedValue(0);

  const goTo = (next: number) => {
    const to = clampIndex(next, count);
    rowX.value = withTiming(-to * width, { duration: settleMs });
    if (to !== index) setIndex(to);
  };

  // One drag for the whole viewer, so paging never depends on a native scroll view sharing touches
  // with the pages' own gestures: sideways turns the page, down puts the viewer away. It is one
  // finger and only on an unzoomed page; a second finger hands over to the page's pinch. Over a
  // video the strip with the player's scrub bar is left to the player.
  const overVideo = items[index]?.kind === 'video';
  const pan = Gesture.Pan()
    .enabled(!zoomed)
    .maxPointers(1)
    .activeOffsetX([-DRAG_SLOP, DRAG_SLOP])
    .activeOffsetY(DRAG_SLOP)
    .failOffsetY(-DRAG_SLOP)
    .hitSlop(overVideo ? { bottom: -(Math.max(footHeight, insets.bottom) + SCRUB_STRIP) } : 0)
    .withTestId('lightbox-pan')
    .onStart((event) => {
      'worklet';
      startRowX.value = rowX.value;
      axis.value = Math.abs(event.translationX) >= Math.abs(event.translationY) ? 1 : 2;
    })
    .onUpdate((event) => {
      'worklet';
      if (axis.value === 1) {
        const least = -(count - 1) * width - EDGE_GIVE;
        rowX.value = Math.min(Math.max(startRowX.value + event.translationX, least), EDGE_GIVE);
      } else {
        dismissY.value = Math.max(0, event.translationY);
      }
    })
    .onEnd((event) => {
      'worklet';
      if (axis.value === 1) {
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
      dismissY.value = withTiming(0, { duration: settleMs });
    });
  const dragged = useAnimatedStyle(() => ({
    transform: [{ translateX: rowX.value }, { translateY: dismissY.value }],
  }));
  const backdrop = useAnimatedStyle(() => ({
    opacity: Math.max(BACKDROP_FLOOR, 1 - dismissY.value / (DISMISS_DISTANCE * 3)),
  }));

  const current = items[clampIndex(index, items.length)];
  const counter = counterOf(index, items.length);
  const lines = current === undefined ? null : linesOf(current);
  const photoLabel = t({ id: 'common.lightbox.photo', message: 'Photo' });
  const videoLabel = t({ id: 'common.lightbox.video', message: 'Video' });

  const page = (item: LightboxItem, at: number) => {
    const active = at === index;
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
          <ActivityIndicator color={theme.semantic.text.secondary} />
        </View>
      );
    }
    return (
      <ZoomPage
        key={item.key}
        width={width}
        height={height}
        zoomable={item.kind === 'image'}
        reduced={reduced}
        zoomed={active && zoomed}
        onZoomChange={setZoomed}
        testID={`${testID}-page-${at}`}
      >
        {item.kind === 'video' ? (
          // Clear of the counter row and the caption, so the player's own controls stay reachable.
          <View
            style={{
              position: 'absolute',
              start: 0,
              end: 0,
              top: insets.top + TOP_ROW,
              bottom: Math.max(footHeight, insets.bottom),
            }}
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
    <Modal
      visible
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root} accessibilityViewIsModal testID={testID}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
          <GestureDetector gesture={pan}>
            <View style={[styles.root, styles.clip]} testID={`${testID}-pager`}>
              <Animated.View style={[styles.row, { width: width * count }, dragged]}>
                {items.map(page)}
              </Animated.View>
            </View>
          </GestureDetector>
          <View
            style={[styles.top, { top: insets.top + theme.space['8'] }]}
            pointerEvents="box-none"
          >
            {counter === null ? (
              <View />
            ) : (
              <View
                style={styles.plate}
                testID={`${testID}-position`}
                accessible
                accessibilityRole="adjustable"
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(event) =>
                  goTo(index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))
                }
                accessibilityLabel={t({
                  id: 'common.lightbox.counterLabel',
                  message: `${counter.position} of ${counter.total}`,
                })}
              >
                <Text variant="label" testID={`${testID}-counter`}>
                  {t({
                    id: 'common.lightbox.counter',
                    message: `${counter.position} / ${counter.total}`,
                  })}
                </Text>
              </View>
            )}
            <CloseButton onPress={onClose} testID={`${testID}-close`} />
          </View>
          {lines === null || (lines.caption === null && lines.credit === null) ? null : (
            <View
              style={[styles.foot, { paddingBottom: insets.bottom + theme.space['12'] }]}
              onLayout={(event) => setFootHeight(event.nativeEvent.layout.height)}
              pointerEvents="none"
            >
              {lines.caption === null ? null : (
                <Text
                  variant="body"
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
                  color={theme.semantic.text.secondary}
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
      </GestureHandlerRootView>
    </Modal>
  );
}
