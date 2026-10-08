/**
 * 3a-6 "Your pass is ready": everything answered comes together on one page. The pass drops in,
 * ISSUED slams down with a thud and confetti, then the first stamp, HOME, lands beside it and
 * Tokek hops in. Issued on the device first: offline it shows the placeholder number and SYNCING
 * until the server's number arrives. 3a-7's sheet rises over this same page.
 */
import { t } from '@lingui/core/macro';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';
import { homeBaseFor } from '@cp/domain';
import { format, upper } from '@cp/i18n';

import { useAnalytics } from '@/lib/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { deviceTier } from '@/motion/device-tier';
import { useMotionMode } from '@/motion/motion-mode';
import { triggerConfetti } from '@/motion/patterns/confetti';
import { useLoop } from '@/motion/use-loop';
import { PillButton } from '@/ui/buttons/PillButton';
import { Stamp } from '@/ui/documents/Stamp';
import { guideSticker } from '@/ui/avatar/guides';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

import { airportDataset } from '../content';
import { ensureDraft, usePassDraft, usePassSync } from '../flow-controller/draft-store';
import { ONBOARDING_ROUTES } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { OnboardingPassCard, PASS_DATE } from '../pass-view';

const ISSUED_AT_MS = 900;
const HOME_AT_MS = 1500;
const DROP_MS = 630;

const useStyles = makeStyles((th) => ({
  content: {
    flex: 1,
    paddingHorizontal: th.space['20'],
    justifyContent: 'center',
    gap: th.space['16'],
  },
  stamps: { flexDirection: 'row', gap: th.space['16'], alignItems: 'center' },
  tokek: { alignItems: 'center', marginTop: -th.space['24'] },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['8'],
    gap: th.space['8'],
    alignItems: 'center',
  },
}));

/** A stamp that waits its turn, then slams (or fades in under reduced motion, via `Stamp`). */
function LateStamp({
  delayMs,
  children,
}: {
  readonly delayMs: number;
  readonly children: ReactNode;
}) {
  const [shown, setShown] = useState(delayMs === 0);
  useEffect(() => {
    if (delayMs === 0) return undefined;
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return shown ? <>{children}</> : null;
}

export interface IssuedPageProps {
  /** Play the arrival (first visit); a resumed or sheet-covered page is shown settled. */
  readonly choreography: boolean;
  /** The pass got its SAVED tick (3a-7/3a-8 success). */
  readonly saved?: boolean;
  readonly footer?: ReactNode;
}

export function IssuedPage({ choreography, saved = false, footer }: IssuedPageProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const [mode] = useMotionMode();
  const full = mode === 'full';
  const draft = usePassDraft() ?? ensureDraft();
  const sync = usePassSync();
  const play = choreography && full;
  const drop = useSharedValue(play ? 0 : 1);
  const hop = useLoop('hop', { active: choreography });

  useEffect(() => {
    if (!play) return undefined;
    drop.value = withTiming(1, { duration: DROP_MS, easing: Easing.out(Easing.back(1.4)) });
    const timer = setTimeout(() => triggerConfetti(200, 260, 'large', deviceTier), ISSUED_AT_MS);
    return () => clearTimeout(timer);
    // Arrival plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passStyle = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [{ translateY: (1 - drop.value) * -40 }, { rotate: `${-8 + drop.value * 6}deg` }],
  }));

  const home = draft.home_iata === null ? null : homeBaseFor(airportDataset(), draft.home_iata);
  const issuedDate =
    draft.issued_at === null
      ? ''
      : upper(format.date(locale, new Date(draft.issued_at), PASS_DATE), locale);
  const stamps = (
    <View style={styles.stamps}>
      <LateStamp delayMs={choreography ? ISSUED_AT_MS : 0}>
        <Stamp
          title={upper(t({ id: 'onboarding.issued.stamp', message: 'Issued' }), locale)}
          top={t({ id: 'onboarding.splash.coverTitle', message: 'CRITTERPASS' })}
          bottom={issuedDate}
          ink={theme.color.pink}
          size={92}
          tilt={-10}
          slam={choreography}
          testID="issued-stamp"
        />
      </LateStamp>
      {home !== null ? (
        <LateStamp delayMs={choreography ? HOME_AT_MS : 0}>
          <Stamp
            title={home.iata}
            top={upper(t({ id: 'onboarding.home.stampHome', message: 'Home' }), locale)}
            ink={theme.color.orange}
            size={92}
            tilt={8}
            slam={choreography}
            testID="home-stamp-issued"
          />
        </LateStamp>
      ) : null}
    </View>
  );
  const tokek = guideSticker('tokek');
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="onboarding-issued">
      <View style={styles.content}>
        <Animated.View style={passStyle}>
          <OnboardingPassCard
            draft={draft}
            stamps={stamps}
            stampCount={home === null ? 0 : 1}
            syncing={draft.number === null && (sync.issueQueued || draft.issued_at !== null)}
            {...(saved ? { corner: <SavedTick /> } : {})}
          />
        </Animated.View>
        <Animated.View style={[styles.tokek, hop]}>
          <Sticker kind={tokek.kind} name={tokek.name} size={72} />
        </Animated.View>
        <Text variant="h1" designSize={48} accessibilityRole="header">
          {t({ id: 'onboarding.issued.title', message: 'Your pass\nis ready' })}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'onboarding.issued.body',
            message: 'One stamp so far. The guides will help with the rest.',
          })}
        </Text>
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Scaffold>
  );
}

/** The SAVED tick that pops onto the pass's corner once it is saved to an account. */
export function SavedTick() {
  const theme = useTheme();
  const locale = useLocale();
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withDelay(
      300,
      withTiming(1, { duration: tokens.motion.duration.fast, easing: Easing.out(Easing.back(2)) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }], opacity: pop.value }));
  return (
    <Animated.View
      style={[tickStyles.tick, { backgroundColor: theme.color.green.base }, style]}
      testID="pass-saved-tick"
    >
      <Text variant="label" color={theme.color.ink['950']}>
        {upper(t({ id: 'onboarding.saved', message: 'Saved ✓' }), locale)}
      </Text>
    </Animated.View>
  );
}

const tickStyles = StyleSheet.create({
  tick: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    transform: [{ rotate: degrees(6) }],
  },
});

/** A UUIDv7's leading 48 bits are its creation time: when this draft was started. */
function uuidV7Ms(id: string): number {
  return Number.parseInt(id.replace(/-/gu, '').slice(0, 12), 16);
}

/** The page itself (first arrival plays the choreography; a relaunch shows it settled). */
export function IssuedScreen() {
  useTrackStep('issued');
  useNoBackByDesign();
  // An issued pass is no longer a draft: Android's back button stays on this page while it is in
  // front (the swipe is off in the stack's options), so nothing after it is skipped on the way
  // forward again.
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return undefined;
    const held = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => held.remove();
  }, [focused]);
  const analytics = useAnalytics();
  const first = useRef(true);
  const draft = usePassDraft();
  const [choreography] = useState(() => {
    const issuedAt = draft?.issued_at;
    return issuedAt != null && Date.now() - new Date(issuedAt).getTime() < 10_000;
  });
  useEffect(() => {
    if (!first.current || !choreography || draft == null || draft.issued_at === null) return;
    first.current = false;
    // eslint-disable-next-line lingui/no-unlocalized-strings -- an analytics event name.
    analytics.capture('pass_issued', {
      path: 'new',
      duration_ms: Math.max(0, new Date(draft.issued_at).getTime() - uuidV7Ms(draft.pass_id)),
    });
  }, [analytics, choreography, draft]);
  return (
    <IssuedPage
      choreography={choreography}
      footer={
        <>
          <PillButton
            label={t({ id: 'onboarding.issued.save', message: 'Save my pass' })}
            onPress={() => router.push(ONBOARDING_ROUTES.save)}
            sheen
            testID="onboarding-issued-save"
          />
          <Text variant="bodySm" color={undefined}>
            {t({ id: 'onboarding.issued.saveNote', message: 'Takes ten seconds. No password.' })}
          </Text>
        </>
      }
    />
  );
}
