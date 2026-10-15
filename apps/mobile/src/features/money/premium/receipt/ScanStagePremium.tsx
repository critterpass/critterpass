/**
 * The dark camera stage in the premium look (7.19): the dark ground in both modes, the clear-glass
 * ✕ top left, the auto-split glass pill top right, the receipt photo under the sweep (mint on the
 * lines it read), and a quality problem as a pink sticker that drops onto the paper on Lively. The
 * light sheet for whatever comes next sits at the foot. The platform scanner does the live capture;
 * the photo it took is scaled down when the sheet is tall so the whole receipt stays in view.
 */
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  GlassPill,
  PREMIUM_THEMES,
  PremiumThemeProvider,
  Tag,
  reducedFadeIn,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { ScanSweep, type SweepLine } from '../../receipt/ScanSweep';

export interface ScanStagePremiumProps {
  /** The auto-split pill; tapping it turns auto-split on or off while aiming. */
  readonly chip: string | null;
  readonly onChip?: (() => void) | undefined;
  /** What was wrong with the photo ("Too crumpled"), stuck on the paper. */
  readonly issue: string | null;
  readonly onClose: () => void;
  readonly photo: ReactNode | null;
  readonly lines: readonly SweepLine[];
  readonly sweeping: boolean;
  readonly stutter: boolean;
  /** Shown in the stage while there is no photo yet. */
  readonly empty: ReactNode;
  readonly panel: ReactNode;
  readonly testID: string;
}

function IssueSticker({ label }: { readonly label: string }) {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const { stiffness, damping, mass } = th.spring.lively;
  return (
    <Animated.View
      entering={
        reduced
          ? reducedFadeIn()
          : ZoomIn.springify().stiffness(stiffness).damping(damping).mass(mass)
      }
      style={styles.issue}
      testID="money-scan-chip"
    >
      <Tag label={label} color={th.accent.pink} rotate={-8} />
    </Animated.View>
  );
}

export function ScanStagePremium(props: ScanStagePremiumProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  // The room the stage has for the receipt, and the height the receipt takes at full width.
  const [room, setRoom] = useState(0);
  const [paper, setPaper] = useState(0);
  const stageTop = insets.top + th.size.glassNav + th.space.gap16;
  const scale = room > 0 && paper > room ? room / paper : 1;
  return (
    <View
      style={[styles.root, { backgroundColor: PREMIUM_THEMES.dark.color.ground }]}
      testID={props.testID}
    >
      <PremiumThemeProvider scheme="dark">
        <View style={[styles.top, { top: insets.top + th.space.gap6, start: th.space.gutter }]}>
          <GlassIconButton
            icon="close"
            kind="clear"
            label={t({ id: 'money.scan.close', message: 'Close the scan' })}
            onPress={props.onClose}
            testID="money-scan-close"
          />
        </View>
        {props.chip === null ? null : (
          <View style={[styles.top, { top: insets.top + th.space.gap6, end: th.space.gutter }]}>
            <GlassPill
              kind="clear"
              label={props.chip}
              {...(props.onChip === undefined ? {} : { onPress: props.onChip })}
              testID="money-scan-chip"
            />
          </View>
        )}
        <View
          style={[styles.stage, { paddingTop: stageTop }]}
          onLayout={(event) =>
            setRoom(Math.max(0, event.nativeEvent.layout.height - stageTop - th.space.gap12))
          }
        >
          {props.photo === null ? (
            props.empty
          ) : (
            <View
              style={[styles.fit, { transform: [{ scale }] }]}
              onLayout={(event) => setPaper(event.nativeEvent.layout.height)}
            >
              <ScanSweep
                lines={props.lines}
                sweeping={props.sweeping}
                stutter={props.stutter}
                tint={{ sweep: th.accent.mint, read: th.accent.mint, grey: th.color.placeholder }}
                testID="money-scan-photo"
              >
                <View style={styles.photo}>{props.photo}</View>
              </ScanSweep>
              {props.issue === null ? null : <IssueSticker label={props.issue} />}
            </View>
          )}
        </View>
      </PremiumThemeProvider>
      {/* The sheet keeps the app's own look: light, even over the dark stage. */}
      {props.panel}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', zIndex: 2 },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 12,
  },
  // The stage's own centring, so the receipt inside lays out as it would in the stage itself.
  fit: { alignSelf: 'stretch', alignItems: 'center' },
  photo: { width: '100%' },
  issue: { position: 'absolute', top: 36, end: -8 },
});
