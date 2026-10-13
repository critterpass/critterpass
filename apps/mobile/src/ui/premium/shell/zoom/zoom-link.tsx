/**
 * Card → detail zoom (foundations-spec §7, 1.05). iOS: the system zoom push (`Link.AppleZoom`,
 * UIKit's `.zoom` transition) between screens of the native stack; the destination wraps its hero
 * in `ZoomTarget` and has no native header (the zoom glitches under one), and swiping down on it
 * zooms back into the card. Android has no system zoom: the app's grow engine
 * (`shared-grow`, mounted at the root) grows a copy of the card over a fade push. On both, the card
 * presses in on touch-down (0.97, Snappy) before the zoom takes it.
 */
import { Link, type Href } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { SharedTarget } from '@/ui/premium/shell/zoom/shared-grow';
import { useSharedSource, zoomTo } from '@/ui/premium/shell/zoom/use-shared-source';

import { SPRINGS, usePremiumReducedMotion, usePremiumTheme } from '../..';

/** The card's press: in to the kit's press scale while held, back on release (none reduced). */
function Pressed({
  pressed,
  children,
}: {
  readonly pressed: boolean;
  readonly children: ReactNode;
}) {
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.set(reduced ? 1 : withSpring(pressed ? t.motion.pressScale : 1, SPRINGS.snappy));
  }, [pressed, reduced, scale, t.motion.pressScale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export interface ZoomLinkProps {
  readonly href: Href;
  /** Pairs the card with its `ZoomTarget` (Android). */
  readonly zoomId: string;
  readonly accessibilityLabel: string;
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/**
 * The zoom source (`Link.AppleZoom`'s native view) hides what it wraps from VoiceOver and UI tests,
 * so the card's accessible element is a plain view around it: it carries the label, the button
 * role and the test id, and a VoiceOver activation taps through to the link inside.
 */
function IosZoomLink({ href, accessibilityLabel, children, style, testID }: ZoomLinkProps) {
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={style}
      {...(testID === undefined ? {} : { testID })}
    >
      <Link href={href} asChild>
        <Link.AppleZoom>
          <Pressable accessible={false}>
            {({ pressed }) => <Pressed pressed={pressed}>{children}</Pressed>}
          </Pressable>
        </Link.AppleZoom>
      </Link>
    </View>
  );
}

function AndroidZoomLink({
  href,
  zoomId,
  accessibilityLabel,
  children,
  style,
  testID,
}: ZoomLinkProps) {
  const reduced = usePremiumReducedMotion();
  const source = useSharedSource(zoomId, () => children);
  return (
    <Pressable
      ref={source}
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => void zoomTo(zoomId, href, { reduced })}
      style={style}
      {...(testID === undefined ? {} : { testID })}
    >
      {({ pressed }) => <Pressed pressed={pressed}>{children}</Pressed>}
    </Pressable>
  );
}

/** A card that zooms into the page it opens. */
export function ZoomLink(props: ZoomLinkProps) {
  return Platform.OS === 'ios' ? <IosZoomLink {...props} /> : <AndroidZoomLink {...props} />;
}

/** The destination's hero the card zooms into (one child). */
export function ZoomTarget({
  zoomId,
  children,
}: {
  readonly zoomId: string;
  readonly children: ReactNode;
}) {
  if (Platform.OS === 'ios') return <Link.AppleZoomTarget>{children}</Link.AppleZoomTarget>;
  return <SharedTarget id={zoomId}>{children}</SharedTarget>;
}

/**
 * A zoom destination route's options: no native header on either platform; Android pushes with a
 * fade under the growing copy of the card.
 */
export const ZOOM_DESTINATION_OPTIONS = {
  headerShown: false,
  ...(Platform.OS === 'android' ? { animation: 'fade' as const } : {}),
};
