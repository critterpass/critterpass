import { requireOptionalNativeModule } from 'expo';
import type * as BrightnessModule from 'expo-brightness';
import { router } from 'expo-router';
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton, usePremiumTheme } from '../..';

/** A layout's options for a full-screen route: it covers everything, tab bar and status bar area. */
export const FULL_SCREEN_ROUTE_OPTIONS: NativeStackNavigationOptions = {
  presentation: 'fullScreenModal',
  animation: 'fade',
  gestureEnabled: false,
};

function brightnessModule(): typeof BrightnessModule | null {
  if (requireOptionalNativeModule('ExpoBrightness') === null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native-module load
  return require('expo-brightness') as typeof BrightnessModule;
}

/**
 * The window at full brightness while `active` (a pass, a phrase card), back to what it was after;
 * the system setting is never touched.
 */
function useBrightened(active: boolean): void {
  useEffect(() => {
    const module = active ? brightnessModule() : null;
    if (module === null) return undefined;
    let previous: number | null = null;
    let released = false;
    void (async () => {
      try {
        const current = await module.getBrightnessAsync();
        if (released) return;
        previous = current;
        await module.setBrightnessAsync(1);
      } catch {
        // Brightness is a courtesy; the screen still shows.
      }
    })();
    return () => {
      released = true;
      if (previous !== null) void module.setBrightnessAsync(previous).catch(() => undefined);
    };
  }, [active]);
}

export interface FullScreenProps {
  /** The label the ✕ speaks ("Close"). */
  readonly closeLabel: string;
  /** Full brightness while it shows (boarding pass, show mode, phrase card). */
  readonly brighten?: boolean;
  /** Clear glass for the ✕ over photos, camera and dark covers. @default true */
  readonly overPhoto?: boolean;
  /** Runs instead of going back (a camera that must stop first). */
  readonly onClose?: () => void;
  readonly children: ReactNode;
  readonly testID?: string;
}

/**
 * The full-screen type (foundations-spec §1): one job, ✕ top-left on glass, never a second cover
 * on top. Content is full bleed; it keeps clear of the ✕ itself.
 */
export function FullScreen({
  closeLabel,
  brighten = false,
  overPhoto = true,
  onClose,
  children,
  testID,
}: FullScreenProps) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  useBrightened(brighten);
  return (
    <View testID={testID} style={styles.root}>
      {children}
      <View style={[styles.close, { top: insets.top + t.space.gap6, left: t.space.gutter }]}>
        <GlassIconButton
          icon="close"
          label={closeLabel}
          kind={overPhoto ? 'clear' : 'nav'}
          testID="full-screen-close"
          onPress={onClose ?? (() => router.back())}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  close: { position: 'absolute' },
});
