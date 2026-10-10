/**
 * Card → detail zoom (foundations-spec §7, 1.05). iOS: the system zoom push (`Link.AppleZoom`,
 * UIKit's `.zoom` transition) between screens of the native stack; the destination wraps its hero
 * in `ZoomTarget` and has no native header (the zoom glitches under one), and swiping down on it
 * zooms back into the card. Android has no system zoom: the app's grow engine
 * (`ui/transitions/SharedGrow`, mounted at the root) grows a copy of the card over a fade push.
 */
import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, type StyleProp, type ViewStyle } from 'react-native';

// The grow engine is shared infrastructure that both UIs mount at the root; only its source and
// target hooks are used here.
import { SharedTarget } from '@/ui/transitions/SharedGrow';
import { useSharedSource, zoomTo } from '@/ui/transitions/use-shared-source';

import { usePremiumReducedMotion } from '../..';

export interface ZoomLinkProps {
  readonly href: Href;
  /** Pairs the card with its `ZoomTarget` (Android). */
  readonly zoomId: string;
  readonly accessibilityLabel: string;
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

function IosZoomLink({ href, accessibilityLabel, children, style, testID }: ZoomLinkProps) {
  return (
    <Link href={href} asChild>
      <Link.AppleZoom>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={accessibilityLabel}
          style={style}
          {...(testID === undefined ? {} : { testID })}
        >
          {children}
        </Pressable>
      </Link.AppleZoom>
    </Link>
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
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onPress={() => void zoomTo(zoomId, href, { reduced })}
      style={style}
      {...(testID === undefined ? {} : { testID })}
    >
      {children}
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
