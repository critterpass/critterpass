import { Stack } from 'expo-router';
import type { ComponentProps, ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  GlassIconButton,
  GlassPill,
  IconButton,
  usePremiumTheme,
  type PremiumIconName,
} from '../..';

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
  /**
   * Shows the label as a text pill ("Edit", "Save", "Mark all read") instead of the glyph: a glass
   * pill, or the ink pill when `primary`.
   */
  readonly text?: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
  /**
   * Replaces the button with this element: a chip the design draws in the header ("3 votes left",
   * the plan chip). On iOS it is a `Stack.Toolbar.View` on a push screen; iOS 26 hides a toolbar
   * view's content from VoiceOver and UI tests, so root screens always use the system button.
   */
  readonly element?: ReactElement;
  /**
   * The ink `+` opens a sheet: on a native root screen it grows into the sheet (1.06) before
   * `onPress` presents the sheet route.
   */
  readonly morph?: boolean;
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
            {...(action.text === true ? {} : { icon: action.sfSymbol })}
            accessibilityLabel={action.label}
            onPress={action.onPress}
            {...(action.primary === true
              ? { variant: 'prominent' as const, tintColor: color.ink, separateBackground: true }
              : {})}
          >
            {action.text === true ? action.label : undefined}
          </Stack.Toolbar.Button>
        ),
      )}
    </Stack.Toolbar>
  );
}

/** The drawn header actions: 44 glass circles or text pills, the ink one last. */
export function DrawnHeaderActions({ actions }: { readonly actions: readonly ShellAction[] }) {
  const { size } = usePremiumTheme();
  return (
    <View style={styles.row}>
      {actions.map((action) => {
        const testID = action.testID === undefined ? {} : { testID: action.testID };
        if (action.element !== undefined) {
          return (
            <View key={action.key} {...testID}>
              {action.element}
            </View>
          );
        }
        if (action.text === true) {
          return action.primary === true ? (
            <Button
              key={action.key}
              label={action.label}
              size="medium"
              onPress={action.onPress}
              {...testID}
            />
          ) : (
            <GlassPill key={action.key} label={action.label} onPress={action.onPress} {...testID} />
          );
        }
        return action.primary === true ? (
          <IconButton
            key={action.key}
            icon={action.glyph}
            label={action.label}
            tone="ink"
            size={size.glassNav}
            onPress={action.onPress}
            {...testID}
          />
        ) : (
          <GlassIconButton
            key={action.key}
            icon={action.glyph}
            label={action.label}
            onPress={action.onPress}
            {...testID}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 } });
