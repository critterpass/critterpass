import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  makePremiumStyles,
  PremiumThemeProvider,
  SegmentedControl,
  Text,
  ToastHost,
  usePremiumTheme,
} from '@/ui/premium';
import { ControlSamples } from '@/ui/premium/gallery/control-samples';
import { CardSamples, StickerSamples } from '@/ui/premium/gallery/content-samples';
import { FeedbackSamples, StateSamples } from '@/ui/premium/gallery/feedback-samples';
import { ButtonSamples, GlassSamples, TypeSamples } from '@/ui/premium/gallery/foundation-samples';
import { MotionSamples } from '@/ui/premium/gallery/motion-samples';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

type Scheme = 'light' | 'dark';

/**
 * Every premium kit component with its states, in light or dark (the segmented control pins the
 * scheme for the whole page), so a device capture shows the kit against the Foundations renders.
 */
export default function PremiumKitScreen() {
  const [scheme, setScheme] = useState<Scheme>('light');
  return (
    <PremiumThemeProvider scheme={scheme}>
      <ToastHost bottomOffset={0}>
        <Gallery scheme={scheme} onScheme={setScheme} />
      </ToastHost>
    </PremiumThemeProvider>
  );
}

function Gallery({
  scheme,
  onScheme,
}: {
  readonly scheme: Scheme;
  readonly onScheme: (scheme: Scheme) => void;
}) {
  const t = usePremiumTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: t.color.ground }]} testID="premium-kit">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + t.space.gap16, paddingBottom: insets.bottom + 120 },
        ]}
      >
        <Text variant="largeTitle" accessibilityRole="header">
          Premium kit
        </Text>
        <SegmentedControl<Scheme>
          accessibilityLabel="Appearance"
          value={scheme}
          onChange={onScheme}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          testID="premium-kit-scheme"
        />
        <ButtonSamples />
        <GlassSamples />
        <ControlSamples />
        <StickerSamples />
        <CardSamples />
        <FeedbackSamples />
        <StateSamples />
        <MotionSamples />
        <TypeSamples />
      </ScrollView>
    </View>
  );
}

const useStyles = makePremiumStyles((t) => ({
  screen: { flex: 1 },
  content: { paddingHorizontal: t.space.gutter, gap: t.space.gap16 * 2 },
}));
