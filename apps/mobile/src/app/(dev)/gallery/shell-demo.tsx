import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';

import { makeStyles, MIN_TOUCH_TARGET, Scaffold, Stack, Text } from '@/ui';
import { fixturesFor, loadAllFixtures, useFixtureRegistry } from '@/ui/gallery/registry';

export const __CP_DEV_ROUTE__ = true;

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, gap: t.space['16'] },
  row: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: t.space['14'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    justifyContent: 'center',
  },
}));

/** Screen transitions reached by navigating: each row opens a route that plays it. */
const ROUTE_TRANSITIONS: readonly {
  readonly id: string;
  readonly label: string;
  readonly href: Href;
}[] = [
  // The root stack pushes every screen with the designed `push`; an unknown path lands on the
  // in-app 404, which is a root-stack screen in every build.
  { id: 'push', label: 'push: the in-app 404', href: '/shell-demo-missing-page' },
  { id: 'sheet', label: 'sheet: detents and drag-dismiss', href: '/(dev)/gallery/sheet-demo' },
  { id: 'rise', label: 'rise: full-screen modal', href: '/(dev)/gallery/rise-demo' },
  { id: 'zoom', label: 'zoom: shared grow, then fade back', href: '/(dev)/gallery/zoom-demo' },
  { id: 'tab', label: 'tab: tab bar and guide FAB', href: '/(dev)/gallery/tabs' },
];

/** In-place transitions, previewed from their gallery fixtures (tap each to replay). */
const IN_PLACE_TRANSITIONS = ['Burst', 'Fold', 'Flip'] as const;

/**
 * Shell demo: every navigation transition. A screen opened cold (a link, a notification) has
 * nothing under it; its back control falls back to Home (`goBackOr`), so there is no cold-entry
 * stack to demo here.
 */
export default function ShellDemoScreen() {
  loadAllFixtures();
  useFixtureRegistry();
  const styles = useStyles();
  return (
    <Scaffold testID="shell-demo">
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="h2" accessibilityRole="header">
          Shell demo
        </Text>
        {ROUTE_TRANSITIONS.map((item) => (
          <Pressable
            key={item.id}
            testID={`shell-demo-${item.id}`}
            accessibilityRole="button"
            style={styles.row}
            onPress={() => router.push(item.href)}
          >
            <Text variant="rowTitle">{item.label}</Text>
          </Pressable>
        ))}
        {IN_PLACE_TRANSITIONS.map((component) => (
          <Stack key={component} gap="8" testID={`shell-demo-${component.toLowerCase()}`}>
            <Text variant="eyebrow">{component}</Text>
            {fixturesFor(component).map((fixture) => (
              <Stack key={fixture.state}>{fixture.render()}</Stack>
            ))}
          </Stack>
        ))}
      </ScrollView>
    </Scaffold>
  );
}
