import { Stack } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { GlassIconButton, IconButton, usePremiumTheme, type PremiumIconName } from '../..';

/** An SF Symbol name (or an image) for the iOS toolbar. */
export type ToolbarIcon = NonNullable<ComponentProps<typeof Stack.Toolbar.Button>['icon']>;

/** One header action: a glass circle, or the screen's one ink `+`. */
export interface ShellAction {
  readonly key: string;
  /** The spoken label (and the tooltip on long-press). */
  readonly label: string;
  /** The iOS toolbar's SF Symbol. */
  readonly sfSymbol: ToolbarIcon;
  /** The glyph where the shell draws the header itself (Android, headerless pages). */
  readonly glyph: PremiumIconName;
  /** The ink action (`+`): at most one per screen, always the trailing one. */
  readonly primary?: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
  /**
   * Replaces the button with this element on iOS (a `Stack.Toolbar.View`), for an action that is
   * the source of a zoom or morph and so has to be a React Native view.
   */
  readonly element?: ReactNode;
}

/** foundations-spec §1: a root screen carries at most two actions, a push screen one. */
export function capActions(actions: readonly ShellAction[], max: number): readonly ShellAction[] {
  if (actions.length > max) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing error.
    throw new Error(`a screen header carries at most ${max} actions, got ${actions.length}`);
  }
  const primary = actions.filter((action) => action.primary === true);
  if (primary.length > 1) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing error.
    throw new Error('a screen header carries one ink action at most');
  }
  return [...actions.filter((action) => action.primary !== true), ...primary];
}

/** The native iOS 26 toolbar: glass items, the ink `+` as the prominent tinted one. */
export function NativeHeaderActions({ actions }: { readonly actions: readonly ShellAction[] }) {
  const { color } = usePremiumTheme();
  if (actions.length === 0) return null;
  return (
    <Stack.Toolbar placement="right">
      {actions.map((action) =>
        action.element !== undefined ? (
          <Stack.Toolbar.View key={action.key} hidesSharedBackground>
            {action.element}
          </Stack.Toolbar.View>
        ) : (
          <Stack.Toolbar.Button
            key={action.key}
            icon={action.sfSymbol}
            accessibilityLabel={action.label}
            onPress={action.onPress}
            {...(action.primary === true
              ? { variant: 'prominent' as const, tintColor: color.ink, separateBackground: true }
              : {})}
          />
        ),
      )}
    </Stack.Toolbar>
  );
}

/** The drawn header actions: 44 glass circles, the ink one last. */
export function DrawnHeaderActions({ actions }: { readonly actions: readonly ShellAction[] }) {
  const { size } = usePremiumTheme();
  return (
    <View style={styles.row}>
      {actions.map((action) =>
        action.primary === true ? (
          <IconButton
            key={action.key}
            icon={action.glyph}
            label={action.label}
            tone="ink"
            size={size.glassNav}
            onPress={action.onPress}
            {...(action.testID === undefined ? {} : { testID: action.testID })}
          />
        ) : (
          <GlassIconButton
            key={action.key}
            icon={action.glyph}
            label={action.label}
            onPress={action.onPress}
            {...(action.testID === undefined ? {} : { testID: action.testID })}
          />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 } });
