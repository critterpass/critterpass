import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton, Text, usePremiumTheme } from '../..';
import {
  capActions,
  DrawnHeaderActions,
  NativeHeaderActions,
  type ShellAction,
} from './header-actions';

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
  /** Content scrolls under the bar. Off when the page brings its own list. @default true */
  readonly scroll?: boolean;
  readonly children: ReactNode;
  readonly testID?: string;
}

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
 */
export function PushScreen({
  title,
  subtitle,
  action,
  headerless = false,
  backLabel,
  scroll = true,
  children,
  testID,
}: PushScreenProps) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const actions = capActions(action === undefined ? [] : [action], 1);
  const ios = Platform.OS === 'ios';

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
          <GlassIconButton
            icon="back"
            label={backLabel}
            kind="clear"
            testID="push-back"
            onPress={() => router.back()}
          />
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
          headerTintColor: t.color.ink,
          ...(ios
            ? {}
            : {
                headerStyle: { backgroundColor: t.color.ground },
                ...(actions.length > 0
                  ? { headerRight: () => <DrawnHeaderActions actions={actions} /> }
                  : {}),
              }),
        }}
      />
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
