import { useLingui } from '@lingui/react/macro';
import * as Haptics from 'expo-haptics';
import { router, useGlobalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useScreenHref } from '@/lib/navigation/screen-registry';

import { PressableScale } from '../..';
import { SHELL_SIZE, useShellExtras } from '../shell-theme';
import { GUIDE_FAB_IMAGE } from './tab-icons';

/** The guide chat sheet and the Help hub, by their design screen ids (data keys, never shown). */
// eslint-disable-next-line lingui/no-unlocalized-strings -- design screen id (data key), never rendered
const GUIDE_SHEET_SCREEN = '3j-1';
// eslint-disable-next-line lingui/no-unlocalized-strings -- design screen id (data key), never rendered
const HELP_HUB_SCREEN = '3k-6';
/** The guide the circle draws (the bundled Tokek image). */
const GUIDE_NAME = 'Tokek';

export interface GuideActions {
  /** Opens the guide sheet about the trip on screen; undefined until the guide's route exists. */
  readonly ask: (() => void) | undefined;
  /** Opens Help; undefined until its route exists. */
  readonly help: (() => void) | undefined;
}

/**
 * What the guide circle does: ask the guide about the trip on screen (its hub, day or plan), or
 * open Help. Each action exists only once its route is registered, never pointing at a placeholder.
 */
export function useGuideActions(): GuideActions {
  const { tripId } = useGlobalSearchParams<{ tripId?: string }>();
  const askHref = useScreenHref(
    GUIDE_SHEET_SCREEN,
    typeof tripId === 'string' && tripId !== '' ? { tripId } : undefined,
  );
  const helpHref = useScreenHref(HELP_HUB_SCREEN);
  const ask = useCallback(() => {
    if (askHref === undefined) return;
    void Haptics.selectionAsync();
    router.push(askHref);
  }, [askHref]);
  const help = useCallback(() => {
    if (helpHref === undefined) return;
    void Haptics.selectionAsync();
    router.push(helpHref);
  }, [helpHref]);
  return {
    ask: askHref === undefined ? undefined : ask,
    help: helpHref === undefined ? undefined : help,
  };
}

/**
 * Android's guide button: Tokek in the yellow circle (Tabs.dc.html) floating above the Material
 * bottom bar at the trailing edge. Tap asks the guide, long-press opens Help. iOS draws the guide
 * as the tab bar's own search-role circle instead.
 */
export function GuideFab({ actions }: { readonly actions: GuideActions }) {
  const { t } = useLingui();
  const extras = useShellExtras();
  const insets = useSafeAreaInsets();
  if (actions.ask === undefined) return null;
  const guide = GUIDE_NAME;
  const helpLabel = t({ id: 'common.shell.fabHelp', message: 'Get help' });
  const { guideCircle: size, androidTabBar, androidFabMargin } = SHELL_SIZE;
  return (
    <PressableScale
      testID="guide-fab"
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'common.shell.fabAsk', message: `Ask ${guide}` })}
      onPress={actions.ask}
      onLongPress={actions.help}
      accessibilityHint={actions.help === undefined ? undefined : helpLabel}
      style={[
        styles.fab,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: extras.guideRing,
          bottom: androidTabBar + insets.bottom + androidFabMargin,
          right: androidFabMargin,
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, not copy
          experimental_backgroundImage: `radial-gradient(circle at 35% 28%, ${extras.guide.from} 0%, ${extras.guide.mid} 42%, ${extras.guide.to} 100%)`,
        },
      ]}
    >
      <Image source={GUIDE_FAB_IMAGE} style={styles.image} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: SHELL_SIZE.guideCircleBorder,
    elevation: 6,
    overflow: 'hidden',
  },
  image: { width: SHELL_SIZE.guideCritter, height: SHELL_SIZE.guideCritter },
});
