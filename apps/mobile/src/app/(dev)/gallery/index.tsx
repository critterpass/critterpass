import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView } from 'react-native';

import { setLocale } from '@/lib/i18n/set-locale';
import { useLocale } from '@/lib/i18n/use-locale';
import type { MotionMode } from '@/motion/motion-mode';
import { useMotionMode } from '@/motion/motion-mode';
import { makeStyles, MIN_TOUCH_TARGET, Row, Scaffold, Stack, Text, useTheme } from '@/ui';
import {
  listComponents,
  loadAllFixtures,
  setGallerySettings,
  useFixtureRegistry,
  useGallerySettings,
} from '@/ui/gallery/registry';
import { GALLERY_FONT_SCALES } from '@/ui/gallery/types';

export const __CP_DEV_ROUTE__ = true;

const GALLERY_LOCALES = ['en', 'en-XA', 'vi', 'ja', 'th'] as const;
const MOTION_MODES: readonly MotionMode[] = ['full', 'reduced', 'off'];

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, gap: t.space['16'] },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: t.space['12'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.control,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: t.semantic.action.primary },
  row: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: t.space['14'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    justifyContent: 'center',
  },
}));

function Choice({
  label,
  selected,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null]}
    >
      <Text variant="label" color={selected ? theme.semantic.text.onAccent : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

function Switcher({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Stack gap="6">
      <Text variant="eyebrow">{title}</Text>
      <Row gap="8" wrap>
        {children}
      </Row>
    </Stack>
  );
}

/** Dev gallery: every registered component, with locale / font-scale / motion / contrast switchers. */
export default function GalleryIndexScreen() {
  loadAllFixtures();
  useFixtureRegistry();
  const styles = useStyles();
  const locale = useLocale();
  const [motionMode, setMotionMode] = useMotionMode();
  const settings = useGallerySettings();

  return (
    <Scaffold testID="gallery-index">
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="h2" accessibilityRole="header">
          Gallery
        </Text>
        <Switcher title="Locale">
          {GALLERY_LOCALES.map((code) => (
            <Choice
              key={code}
              testID={`gallery-locale-${code}`}
              label={code}
              selected={locale === code}
              onPress={() => void setLocale(code, { persist: false })}
            />
          ))}
        </Switcher>
        <Switcher title="Font scale">
          {GALLERY_FONT_SCALES.map((scale) => (
            <Choice
              key={scale}
              testID={`gallery-font-scale-${scale}`}
              label={`${scale}x`}
              selected={settings.fontScale === scale}
              onPress={() => setGallerySettings({ fontScale: scale })}
            />
          ))}
        </Switcher>
        <Switcher title="Motion">
          {MOTION_MODES.map((mode) => (
            <Choice
              key={mode}
              testID={`gallery-motion-${mode}`}
              label={mode}
              selected={motionMode === mode}
              onPress={() => setMotionMode(mode)}
            />
          ))}
        </Switcher>
        <Switcher title="Contrast">
          {(['standard', 'high'] as const).map((contrast) => (
            <Choice
              key={contrast}
              testID={`gallery-contrast-${contrast}`}
              label={contrast}
              selected={settings.contrast === contrast}
              onPress={() => setGallerySettings({ contrast })}
            />
          ))}
        </Switcher>
        <Stack gap="8">
          {listComponents().map((component) => (
            <Link
              key={component}
              href={{ pathname: '/(dev)/gallery/[component]', params: { component } }}
              asChild
            >
              <Pressable
                testID={`gallery-component-${component}`}
                accessibilityRole="button"
                style={styles.row}
              >
                <Text variant="row.title">{component}</Text>
              </Pressable>
            </Link>
          ))}
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
