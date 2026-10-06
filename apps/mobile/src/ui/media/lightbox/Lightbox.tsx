/**
 * The full-screen viewer for the photos and videos of one set, over everything: swipe between the
 * items, pinch or double-tap to zoom, drag down (or ✕, or Android back) to put it away. The counter
 * sits at the top; an item's caption and credit sit at the bottom, and a credit is always shown.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
import { clampIndex, counterOf, linesOf, pageAt, type LightboxItem } from './lightbox-model';
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
  // One finger down an unzoomed page; sideways it fails and the pager takes the drag.
  const dismiss = Gesture.Pan()
    .enabled(!zoomed)
    .maxPointers(1)
    .activeOffsetY(DRAG_SLOP)
    .failOffsetX([-DRAG_SLOP, DRAG_SLOP])
    .withTestId('lightbox-dismiss')
    .onUpdate((event) => {
      'worklet';
      dismissY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      'worklet';
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        scheduleOnRN(onClose);
        return;
      }
      dismissY.value = withTiming(0, { duration: settleMs });
    });
  const dragged = useAnimatedStyle(() => ({ transform: [{ translateY: dismissY.value }] }));
  const backdrop = useAnimatedStyle(() => ({
    opacity: Math.max(BACKDROP_FLOOR, 1 - dismissY.value / (DISMISS_DISTANCE * 3)),
  }));

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = pageAt(event.nativeEvent.contentOffset.x, width, items.length);
    if (next === index) return;
    setIndex(next);
    setZoomed(false);
  };

  const current = items[clampIndex(index, items.length)];
  const counter = counterOf(index, items.length);
  const lines = current === undefined ? null : linesOf(current);
  const photoLabel = t({ id: 'common.lightbox.photo', message: 'Photo' });
  const videoLabel = t({ id: 'common.lightbox.video', message: 'Video' });

  const page = ({ item, index: at }: { readonly item: LightboxItem; readonly index: number }) => {
    const active = at === index;
    const label = linesOf(item).caption ?? (item.kind === 'video' ? videoLabel : photoLabel);
    if (item.uri === null) {
      return (
        <View style={[styles.waiting, { width, height }]} testID={`${testID}-waiting-${at}`}>
          <ActivityIndicator color={theme.semantic.text.secondary} />
        </View>
      );
    }
    return (
      <ZoomPage
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
          <GestureDetector gesture={dismiss}>
            <Animated.View style={[styles.root, dragged]}>
              <FlatList
                data={items}
                keyExtractor={(item) => item.key}
                renderItem={page}
                extraData={`${index}-${zoomed}-${footHeight}`}
                horizontal
                pagingEnabled
                scrollEnabled={!zoomed && items.length > 1}
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={clampIndex(initialIndex, items.length)}
                getItemLayout={(_, at) => ({ length: width, offset: width * at, index: at })}
                initialNumToRender={1}
                windowSize={3}
                onScroll={onScroll}
                scrollEventThrottle={16}
                testID={`${testID}-pager`}
              />
            </Animated.View>
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
                accessible
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
