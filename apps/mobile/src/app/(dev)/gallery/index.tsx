import { Link } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView } from 'react-native';

import { setLocale } from '@/lib/i18n/set-locale';
import { useLocale } from '@/lib/i18n/use-locale';
import type { MotionMode } from '@/motion/motion-mode';
import { useMotionMode } from '@/motion/motion-mode';
import { setMotionFreeze } from '@/motion/slowmo';
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
const SHELL_DEMOS = [
  {
    href: '/(dev)/gallery/states',
    testID: 'gallery-states',
    label: 'State groups: one screen, every state',
  },
  {
    href: '/(dev)/gallery/shell-demo',
    testID: 'gallery-shell-demo',
    label: 'Shell: every transition',
  },
  {
    href: '/(dev)/gallery/tabs',
    testID: 'gallery-shell-tabs',
    label: 'Shell: tab bar + guide FAB',
  },
  { href: '/(dev)/gallery/sheet-demo', testID: 'gallery-shell-sheet', label: 'Shell: sheet' },
  { href: '/(dev)/gallery/rise-demo', testID: 'gallery-shell-rise', label: 'Shell: rise modal' },
  {
    href: '/(dev)/gallery/showdown-long',
    testID: 'gallery-showdown-long',
    label: 'Vote: showdown with long names',
  },
  {
    href: '/(dev)/gallery/reveal-moments',
    testID: 'gallery-reveal-moments',
    label: 'Vote: winner reveal, moment by moment',
  },
  {
    href: '/(dev)/gallery/zoom-demo',
    testID: 'gallery-shell-zoom',
    label: 'Shell: zoom (shared grow)',
  },
  {
    href: '/(dev)/gallery/account-sheets-demo',
    testID: 'gallery-account-sheets',
    label: 'Onboarding: save and merge sheets',
  },
] as const;

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
  // Screenshot sweeps freeze every loop at its resting frame.
  const [frozen, setFrozen] = useState(false);

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
        <Switcher title="Loops">
          {[false, true].map((freeze) => (
            <Choice
              key={String(freeze)}
              testID={`gallery-freeze-${freeze ? 'on' : 'off'}`}
              label={freeze ? 'frozen' : 'running'}
              selected={frozen === freeze}
              onPress={() => {
                setMotionFreeze(freeze);
                setFrozen(freeze);
              }}
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
          {SHELL_DEMOS.map((demo) => (
            <Link key={demo.href} href={demo.href} asChild>
              <Pressable testID={demo.testID} accessibilityRole="button" style={styles.row}>
                <Text variant="rowTitle">{demo.label}</Text>
              </Pressable>
            </Link>
          ))}
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
                <Text variant="rowTitle">{component}</Text>
              </Pressable>
            </Link>
          ))}
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
