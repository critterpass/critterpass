import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { ThemeProvider } from '@/lib/theme';
import { makeStyles, Scaffold, Stack, Text } from '@/ui';
import {
  fixturesFor,
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
}));

/** Every registered state of one component, previewed under the gallery's current settings. */
export default function GalleryComponentScreen() {
  loadAllFixtures();
  useFixtureRegistry();
  const styles = useStyles();
  const { component } = useLocalSearchParams<{ component: string }>();
  const settings = useGallerySettings();
  const states = fixturesFor(component);

  return (
    <Scaffold testID={`gallery-detail-${component}`}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="h2" accessibilityRole="header">
          {component}
        </Text>
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
