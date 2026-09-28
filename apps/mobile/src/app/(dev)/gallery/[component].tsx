import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';

import { ThemeProvider } from '@/lib/theme';
import { makeStyles, MIN_TOUCH_TARGET, Row, Scaffold, Stack, Text } from '@/ui';
import {
  fixturesFor,
  listComponents,
  loadAllFixtures,
  useFixtureRegistry,
  useGallerySettings,
} from '@/ui/gallery/registry';

export const __CP_DEV_ROUTE__ = true;

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, gap: t.space['24'] },
  frame: {
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.semantic.border.decorative,
    padding: t.space['12'],
  },
  next: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: t.space['14'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.control,
    justifyContent: 'center',
  },
}));

/** Every registered state of one component, previewed under the gallery's current settings. */
export default function GalleryComponentScreen() {
  loadAllFixtures();
  useFixtureRegistry();
  const styles = useStyles();
  const { component } = useLocalSearchParams<{ component: string }>();
  const settings = useGallerySettings();
  const states = fixturesFor(component);
  const components = listComponents();
  const next = components[components.indexOf(component) + 1];

  return (
    <Scaffold testID={`gallery-detail-${component}`}>
      <ScrollView contentContainerStyle={styles.content}>
        <Row gap="12" justify="space-between">
          <Text variant="h2" accessibilityRole="header" style={{ flexShrink: 1 }}>
            {component}
          </Text>
          {next ? (
            // Screenshot sweeps walk every component page in order without relaunching the app.
            <Pressable
              testID="gallery-next"
              accessibilityRole="button"
              accessibilityLabel={`Next: ${next}`}
              style={styles.next}
              onPress={() =>
                router.replace({
                  pathname: '/(dev)/gallery/[component]',
                  params: { component: next },
                })
              }
            >
              <Text variant="label">Next</Text>
            </Pressable>
          ) : null}
        </Row>
        <Text variant="caption">
          {`${settings.fontScale}x · ${settings.contrast} contrast · ${states.length} states`}
        </Text>
        <ThemeProvider fontScale={settings.fontScale} contrast={settings.contrast}>
          {states.map((fixture) => (
            <Stack key={fixture.state} gap="8" testID={`gallery-fixture-${fixture.state}`}>
              <Text variant="eyebrow">{fixture.state}</Text>
              <Stack style={styles.frame}>{fixture.render()}</Stack>
            </Stack>
          ))}
        </ThemeProvider>
      </ScrollView>
    </Scaffold>
  );
}
