import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBackAffordance } from '@/ui/qa/back-affordance';

import { Text, usePremiumTheme } from '../..';
import { leadingControlFor, useScreenPlacement } from '../navigation/use-screen-placement';
import {
  capActions,
  DrawnHeaderActions,
  DrawnLeadingControl,
  NativeHeaderActions,
  NativeLeadingControl,
} from './header-actions';
import type { ShellAction } from './header-actions';

export interface PushScreenProps {
  /** The centred inline title (19/700). */
  readonly title: string;
  /** The muted line under it (12/400). */
  readonly subtitle?: string;
  /** The one right action (share, ⋯, Edit, a labelled glass pill). */
  readonly action?: ShellAction;
  /**
   * No bar: the page starts with a photo or map, and the glass back (and the action) float over
   * it on clear glass. The zoom target of a card uses this (zoom glitches under a header).
   */
  readonly headerless?: boolean;
  /** The label the back button speaks. */
  readonly backLabel: string;
  /** The label the ✕ speaks when the page is the first screen of a sheet or modal ("Close"). */
  readonly closeLabel?: string;
  /**
   * The leading control. `auto` (the default) follows where the page sits: pushed → glass back
   * `<`, the first screen of a sheet or modal → ✕, a tab's first screen → none.
   */
  readonly leading?: 'auto' | 'back' | 'close' | 'none';
  /** Content scrolls under the bar. Off when the page brings its own list. @default true */
  readonly scroll?: boolean;
  readonly children: ReactNode;
  readonly testID?: string;
}

const goBack = () => router.back();
const goHome = () => router.replace('/');

function InlineTitle({ title, subtitle }: { readonly title: string; readonly subtitle?: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text variant="navTitle" numberOfLines={1} align="center" accessibilityRole="header">
        {title}
      </Text>
      {subtitle === undefined ? null : (
        <Text variant="navSubtitle" tone="muted" numberOfLines={1} align="center">
          {subtitle}
        </Text>
      )}
    </View>
  );
}

/**
 * The push screen type (foundations-spec §1): glass back left, centred title and subtitle, one
 * right action; edge swipe goes back and the tab bar is gone (pushed on the root stack). iOS uses
 * the native bar (the system glass back and toolbar); Android the Material bar with the action at
 * its end. A headerless page draws the glass circles itself over its hero.
 *
 * The leading control follows where the page sits (`useScreenPlacement`): pushed on its own stack
 * it is the bar's native back; the first page of a pushed group gets the shell's glass back (the
 * native bar has none there); the first page of a sheet or modal gets ✕ (`closeLabel`); a pushed
 * page inside a sheet or modal gets `<` again.
 */
export function PushScreen({
  title,
  subtitle,
  action,
  headerless = false,
  backLabel,
  closeLabel,
  leading = 'auto',
  scroll = true,
  children,
  testID,
}: PushScreenProps) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const actions = capActions(action === undefined ? [] : [action], 1);
  const ios = Platform.OS === 'ios';
  const placement = useScreenPlacement();
  const control = leading === 'auto' ? leadingControlFor(placement) : leading;
  // The native bar has its own back only for a page pushed on its own stack; the first screen of
  // a pushed group, or of a sheet or modal, gets the shell's control instead.
  const nativeBack =
    control === 'back' &&
    (placement === undefined || (placement.kind === 'pushed' && placement.ownStack));
  const drawnControl =
    control === 'none' || nativeBack ? null : control === 'home' ? 'back' : control;
  const leadingLabel = control === 'close' ? (closeLabel ?? backLabel) : backLabel;
  const leave = control === 'home' ? goHome : goBack;
  // The bar's native back (iOS) or Material back arrow (Android) is the way back; a drawn back or
  // ✕ registers itself.
  useBackAffordance(!headerless && nativeBack);

  const body = scroll ? (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: t.space.gap16 }}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  if (headerless) {
    return (
      <View testID={testID} style={styles.root}>
        <Stack.Screen options={{ headerShown: false, title }} />
        {body}
        <View
          pointerEvents="box-none"
          style={[
            styles.floating,
            { top: insets.top + t.space.gap6, paddingHorizontal: t.space.gutter },
          ]}
        >
          {control === 'none' ? (
            <View />
          ) : (
            <DrawnLeadingControl
              kind={control === 'close' ? 'close' : 'back'}
              label={leadingLabel}
              overPhoto
              onPress={leave}
            />
          )}
          {actions.length > 0 ? <DrawnHeaderActions actions={actions} /> : null}
        </View>
      </View>
    );
  }

  return (
    <View testID={testID} style={styles.root}>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerTitle: () => (
            <InlineTitle title={title} {...(subtitle === undefined ? {} : { subtitle })} />
          ),
          headerTitleAlign: 'center',
          headerTransparent: ios,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerBackVisible: nativeBack,
          headerTintColor: t.color.ink,
          ...(ios
            ? {}
            : {
                headerStyle: { backgroundColor: t.color.ground },
                ...(drawnControl === null
                  ? {}
                  : {
                      headerLeft: () => (
                        <DrawnLeadingControl
                          kind={drawnControl}
                          label={leadingLabel}
                          onPress={leave}
                        />
                      ),
                    }),
                ...(actions.length > 0
                  ? { headerRight: () => <DrawnHeaderActions actions={actions} /> }
                  : {}),
              }),
        }}
      />
      {ios && drawnControl !== null ? (
        <NativeLeadingControl kind={drawnControl} label={leadingLabel} onPress={leave} />
      ) : null}
      {ios ? <NativeHeaderActions actions={actions} /> : null}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  titleBlock: { alignItems: 'center', maxWidth: 240 },
  floating: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
