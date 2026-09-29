import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Deep import: the `@/motion` barrel also loads the Skia overlay host, which screens don't need.
import { useScreenJoltStyle } from '@/motion/patterns/thud';

import { PresenterHostContext, usePresenterStyle } from '../sheet/presenter';
import type { Theme } from '../theme';
import { makeStyles, useTheme } from '../theme';

export type ScaffoldVariant = 'dark' | 'paper' | 'colourHero' | 'scene' | 'map';

/** What text sits on: drives `Text`'s default colour so copy stays legible per surface. */
export type SurfaceTone = 'dark' | 'paper' | 'accent';

const SurfaceToneContext = createContext<SurfaceTone>('dark');

export function useSurfaceTone(): SurfaceTone {
  return useContext(SurfaceToneContext);
}

export const SurfaceToneProvider = SurfaceToneContext.Provider;

const SurfaceBackgroundContext = createContext<string | null>(null);

/** The colour of the screen a component sits on (the nearest `Scaffold`), or null outside one. */
export function useSurfaceBackground(): string | null {
  return useContext(SurfaceBackgroundContext);
}

const TONE: Readonly<Record<ScaffoldVariant, SurfaceTone>> = {
  dark: 'dark',
  paper: 'paper',
  colourHero: 'accent',
  scene: 'dark',
  map: 'dark',
};

type Edge = 'top' | 'bottom';

export interface ScaffoldProps {
  readonly variant?: ScaffoldVariant | undefined;
  /** Hero colour for `colourHero` (guide/place colour); defaults to `action.primary`. */
  readonly accent?: string | undefined;
  /** Texture layer drawn under the content (e.g. halftone), full-bleed. */
  readonly background?: ReactNode | undefined;
  /** Safe-area edges padded; the tab bar pads its own bottom inset. */
  readonly edges?: readonly Edge[] | undefined;
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle> | undefined;
  readonly testID?: string | undefined;
}

function backgroundFor(variant: ScaffoldVariant, theme: Theme, accent: string | undefined): string {
  switch (variant) {
    case 'paper':
      return theme.color.paper.base;
    case 'colourHero':
      return accent ?? theme.semantic.action.primary;
    case 'scene':
      return theme.color.ink['930'];
    case 'map':
      return theme.color.map.base;
    case 'dark':
      return theme.semantic.bg.base;
  }
}

const useStyles = makeStyles(() => ({
  root: { flex: 1, overflow: 'hidden' },
  content: { flex: 1 },
}));

/**
 * Screen root for every designed surface: background per variant, status-bar style that stays
 * legible on it, safe-area padding (Android draws edge-to-edge at targetSdk 36) and the shared
 * screen jolt impacts trigger. Scales to .93 as a presenter while a sheet or rise is up.
 */
export function Scaffold({
  variant = 'dark',
  accent,
  background,
  edges = ['top'],
  children,
  style,
  testID,
}: ScaffoldProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const joltStyle = useScreenJoltStyle();
  const hosting = useSharedValue(0);
  const [host] = useState(() => ({ hosting }));
  const presenterStyle = usePresenterStyle(hosting);
  const tone = TONE[variant];
  const backgroundColor = backgroundFor(variant, theme, accent);

  const padding: ViewStyle = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
  };

  return (
    <PresenterHostContext.Provider value={host}>
      <SurfaceToneProvider value={tone}>
        <SurfaceBackgroundContext.Provider value={backgroundColor}>
          <Animated.View
            testID={testID}
            style={[styles.root, { backgroundColor }, style, presenterStyle]}
          >
            <StatusBar barStyle={tone === 'dark' ? 'light-content' : 'dark-content'} />
            {background ? (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                {background}
              </View>
            ) : null}
            <Animated.View style={[styles.content, padding, joltStyle]}>{children}</Animated.View>
          </Animated.View>
        </SurfaceBackgroundContext.Provider>
      </SurfaceToneProvider>
    </PresenterHostContext.Provider>
  );
}
