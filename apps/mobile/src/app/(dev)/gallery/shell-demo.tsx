import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';

import type { ScreenRoute } from '@/lib/navigation/screen-registry';
import { isScreenRegistered, registerScreens } from '@/lib/navigation/screen-registry';
import { openWithBackStack, parentChain } from '@/lib/navigation/synthesize-stack';
import { makeStyles, MIN_TOUCH_TARGET, Scaffold, Stack, Text } from '@/ui';
import { fixturesFor, loadAllFixtures, useFixtureRegistry } from '@/ui/gallery/registry';

export const __CP_DEV_ROUTE__ = true;

/** A deep-link target three levels into trip setup: Pon's draft (3c-9) → … → Home. */
const COLD_ENTRY_SCREEN = '3c-9';

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
const IN_PLACE_TRANSITIONS = ['Burst', 'Fold'] as const;

/**
 * Opens `COLD_ENTRY_SCREEN` the way a deep link does. Screens no area has registered yet stand in as
 * the shell-target screen, labelled with their design id, so back visibly walks the parents.
 */
function openColdEntry(): void {
  const demo: Record<string, ScreenRoute> = {};
  for (const id of parentChain(COLD_ENTRY_SCREEN)) {
    if (!isScreenRegistered(id)) {
      demo[id] = { pathname: '/(dev)/gallery/shell-target', params: { target: id } };
    }
  }
  // Kept for the rest of the dev session: the pushed stack keeps resolving these ids.
  registerScreens(demo);
  openWithBackStack(COLD_ENTRY_SCREEN);
}

/** Shell demo: every navigation transition plus deep-link back-stack synthesis. */
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
        <Pressable
          testID="shell-demo-cold-entry"
          accessibilityRole="button"
          style={styles.row}
          onPress={openColdEntry}
        >
          <Text variant="rowTitle">{`cold entry: ${COLD_ENTRY_SCREEN}, back walks to Home`}</Text>
        </Pressable>
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
