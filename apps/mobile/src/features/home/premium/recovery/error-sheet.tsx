/**
 * Something broke (3.20): the error boundary's premium face. The page that failed is gone (the
 * boundary replaces it), so its place shows as a dimmed skeleton under a sheet: Pon, "On our side,
 * not yours", "That didn't load", the promise that nothing typed was lost, two tiles (go back, go
 * home), "Try again" in ink and "Send a report" (the problem form, with the screen it came from).
 * The sheet rises on the Smooth spring (a fade under Reduce Motion). Never shows the raw error.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router, usePathname } from 'expo-router';
import { View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { canGoBack, goBackOr } from '@/lib/navigation/back';
import {
  Button,
  CritterSticker,
  Icon,
  PressableScale,
  Skeleton,
  Text,
  TextButton,
  makePremiumStyles,
  reducedFadeIn,
  usePremiumReducedMotion,
  usePremiumTheme,
  type PremiumIconName,
} from '@/ui/premium';

const useStyles = makePremiumStyles((t) => ({
  root: { flex: 1, backgroundColor: t.color.ground },
  behind: { padding: t.space.gutter, gap: t.space.gap16, opacity: 0.6 },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.color.ink,
    opacity: 0.18,
  },
  sheet: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: t.radius.sheet,
    backgroundColor: t.material.sheet.tint,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: t.space.gap10,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: t.color.outlineEmpty,
    marginBottom: 6,
  },
  pon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: t.color.status.tangerine.bg,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  eyebrow: { fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  tiles: { flexDirection: 'row', gap: t.space.gap10, marginTop: 4 },
  tile: {
    flex: 1,
    height: 84,
    borderRadius: t.radius.card,
    borderWidth: 1.5,
    borderColor: t.color.fieldBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
}));

function Tile({
  icon,
  label,
  onPress,
  testID,
}: {
  readonly icon: PremiumIconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      style={styles.tile}
      testID={testID}
    >
      <Icon name={icon} size={22} />
      <Text variant="rowTitle">{label}</Text>
    </PressableScale>
  );
}

export interface ErrorSheetProps {
  /** Re-renders what failed; absent where there is nothing to retry. */
  readonly retry?: () => Promise<void> | void;
}

export function ErrorSheet({ retry }: ErrorSheetProps) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const reduced = usePremiumReducedMotion();
  const { t } = useLingui();
  const path = usePathname();
  return (
    <View style={styles.root} testID="shell-error">
      <View
        style={[styles.behind, { paddingTop: insets.top + 60 }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Skeleton width={180} height={18} radius={9} />
        <Skeleton height={200} radius={26} tone="block" />
        <Skeleton height={72} radius={22} tone="block" />
      </View>
      <View style={styles.scrim} />
      <Animated.View
        entering={reduced ? reducedFadeIn() : SlideInDown.springify().damping(28).stiffness(195)}
        style={[styles.sheet, { paddingBottom: insets.bottom + theme.space.gap16 }]}
      >
        <View style={styles.grabber} />
        <View style={styles.pon}>
          <CritterSticker kind="tanuki" name="Pon" size={52} pose="think" />
        </View>
        <Text variant="label" color={theme.color.status.tangerine.text} style={styles.eyebrow}>
          {t({ id: 'home.premium.broke.eyebrow', message: 'On our side, not yours' })}
        </Text>
        <Text variant="emptyTitle" accessibilityRole="header">
          {t({ id: 'home.premium.broke.title', message: 'That didn’t load' })}
        </Text>
        <Text variant="body" tone="muted">
          {t({
            id: 'home.premium.broke.line',
            message: 'Your plan is safe, and nothing you typed was lost.',
          })}
        </Text>
        <View style={styles.tiles}>
          {canGoBack() ? (
            <Tile
              icon="back"
              label={t({ id: 'home.premium.broke.back', message: 'Go back' })}
              onPress={() => goBackOr('/')}
              testID="shell-error-back"
            />
          ) : null}
          <Tile
            icon="home"
            label={t({ id: 'home.premium.broke.home', message: 'Go home' })}
            onPress={() => router.replace('/')}
            testID="shell-error-home"
          />
        </View>
        {retry === undefined ? null : (
          <Button
            label={t({ id: 'home.premium.broke.retry', message: 'Try again' })}
            icon="retry"
            onPress={() => void retry()}
            testID="shell-error-retry"
          />
        )}
        <TextButton
          label={t({ id: 'home.premium.broke.report', message: 'Send a report with this screen' })}
          onPress={() =>
            router.push({
              pathname: '/help-centre/feedback',
              params: { mode: 'problem', context: `error:${path}` },
            })
          }
          testID="shell-error-report"
        />
      </Animated.View>
    </View>
  );
}
