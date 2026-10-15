/**
 * A presented screen's states before it has its content, so a sheet or modal never opens on a
 * blank card: the wait (1.02: the layout shimmering, the thinking critter and its line at the
 * foot) and the nothing-here state (the empty disc with a line and a way out). A screen
 * that already draws its own frame puts `ScreenWaiting` or `ScreenMissing` in its body; one that
 * has no frame yet (it returns before reading its data) returns `PresentedState`, which brings the
 * ✕ that closes it.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, GlassIconButton, usePremiumTheme, WaitingLayout } from '../..';

export interface ScreenWaitingProps {
  /** The progressive line ("Opening the dates…"); a general one when the screen has none. */
  readonly label?: string;
  readonly testID?: string;
}

/** The wait inside a screen's body: the page's shape shimmering, the critter and its line below. */
export function ScreenWaiting({ label, testID }: ScreenWaitingProps) {
  const theme = usePremiumTheme();
  return (
    <View style={[styles.fill, { paddingBottom: theme.space.gap16 * 2 }]}>
      <WaitingLayout
        label={label ?? t({ id: 'common.premium.screen.waiting', message: 'Getting it ready…' })}
        {...(testID === undefined ? {} : { testID })}
      />
    </View>
  );
}

export interface ScreenMissingProps {
  readonly title?: string;
  readonly line?: string;
  /** The way forward under the line; without one the screen's own ✕ or back is the way out. */
  readonly action?: ReactNode;
  readonly testID?: string;
}

/** Nothing to show: the empty disc, centred in the screen's body. */
export function ScreenMissing({ title, line, action, testID }: ScreenMissingProps) {
  return (
    <View style={[styles.fill, styles.centre]}>
      <EmptyState
        title={title ?? t({ id: 'common.premium.screen.missingTitle', message: 'Nothing here' })}
        line={
          line ??
          t({
            id: 'common.premium.screen.missingLine',
            message: 'It may have moved or been removed. Close this and open it again.',
          })
        }
        check={false}
        {...(action === undefined ? {} : { action })}
        {...(testID === undefined ? {} : { testID })}
      />
    </View>
  );
}

export type PresentedStateKind =
  | ({ readonly kind: 'waiting' } & ScreenWaitingProps)
  | ({ readonly kind: 'missing' } & ScreenMissingProps);

export interface PresentedStateProps {
  readonly state: PresentedStateKind;
  /** What the ✕ says ("Close"). */
  readonly closeLabel?: string;
  readonly testID?: string;
}

/** A whole presented screen in one of those states, with the glass ✕ that closes it. */
export function PresentedState({ state, closeLabel, testID }: PresentedStateProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.fill, { backgroundColor: theme.material.sheet.fill }]}
      {...(testID === undefined ? {} : { testID })}
    >
      <View
        style={{
          paddingTop: insets.top + theme.space.gap6,
          paddingHorizontal: theme.space.gutter,
          flexDirection: 'row',
        }}
      >
        <GlassIconButton
          icon="close"
          label={closeLabel ?? t({ id: 'common.premium.screen.close', message: 'Close' })}
          onPress={() => router.back()}
          testID="presented-state-close"
        />
      </View>
      <View style={[styles.fill, { paddingBottom: insets.bottom }]}>
        {state.kind === 'waiting' ? <ScreenWaiting {...state} /> : <ScreenMissing {...state} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { justifyContent: 'center' },
});
