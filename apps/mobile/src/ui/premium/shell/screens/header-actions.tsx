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
   * The ink `+` opens a sheet. On a drawn root screen (`PlusSheetMorph`) it grows into the sheet
   * (1.06); on the native iOS bar the form sheet's own rise plays instead.
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

/**
 * The native iOS 26 toolbar: glass items in the premium ink, the ink `+` as the prominent one.
 * Every item carries the ink tint itself (a toolbar item otherwise takes the system blue), and
 * none is ever `selected` (UIKit draws a selected bar item on a tinted rounded rectangle).
 */
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
            selected={false}
            tintColor={color.ink}
            {...(action.primary === true
              ? { variant: 'prominent' as const, separateBackground: true }
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
              alignSelf="center"
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

/** The leading control: the glass back `<` or the ✕ that closes a sheet or modal. */
export type LeadingKind = 'back' | 'close';

export interface LeadingControlProps {
  readonly kind: LeadingKind;
  /** The spoken label ("Back", "Close"). */
  readonly label: string;
  readonly onPress: () => void;
}

/**
 * The leading control in the native iOS bar, where the bar has no back of its own (the first
 * screen of a group, a modal's first screen): a system glass item in the premium ink.
 */
export function NativeLeadingControl({ kind, label, onPress }: LeadingControlProps) {
  const { color } = usePremiumTheme();
  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button
        // eslint-disable-next-line lingui/no-unlocalized-strings -- SF Symbol names, never copy.
        icon={kind === 'back' ? 'chevron.left' : 'xmark'}
        accessibilityLabel={label}
        onPress={onPress}
        selected={false}
        tintColor={color.ink}
      />
    </Stack.Toolbar>
  );
}

/** The drawn leading control (Android's bar, headerless pages): a 44 glass circle. */
export function DrawnLeadingControl({
  kind,
  label,
  onPress,
  overPhoto = false,
}: LeadingControlProps & { readonly overPhoto?: boolean }) {
  return (
    <GlassIconButton
      icon={kind}
      label={label}
      kind={overPhoto ? 'clear' : 'nav'}
      testID={kind === 'back' ? 'push-back' : 'push-close'}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 } });
