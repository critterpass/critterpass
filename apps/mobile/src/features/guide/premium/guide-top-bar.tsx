/**
 * The guide thread's header (5.13, 5.14, 5.17): the way out top-left (a glass back when the guide
 * was pushed from a screen, ✕ when it rose from the guide circle), the guide's disc, name and one
 * short line under it (who can see the thread, or whose guide it is), and on the right the
 * Group / Me switch on a shared trip, else the meter chip, or NO SIGNAL with no connection.
 * Tokek is named as an AI guide for assistive tech.
 */
import type { GuideThreadMode } from '@cp/domain';
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  SegmentedControl,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { GuideDisc } from './guide-bubbles';

const useStyles = makePremiumStyles((th) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap10,
    paddingHorizontal: th.space.gap16,
    paddingBottom: th.space.gap10,
  },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: th.space.gap8 },
  noSignal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap6,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: th.color.status.tangerine.bg,
  },
  noSignalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: th.accent.tangerine },
}));

/** The line under the guide's name: who sees a shared trip's thread, else whose guide it is. */
export function guideSubtitle(input: {
  readonly shared: boolean;
  readonly mode: GuideThreadMode;
  readonly crewSize: number;
  readonly destination: string | null;
  readonly fallback: string;
}): string {
  if (input.shared) {
    const count = input.crewSize;
    return input.mode === 'group'
      ? t({ id: 'guide.premium.seesGroup', message: `All ${count} can see this` })
      : t({ id: 'guide.premium.seesMe', message: 'Only you can see this' });
  }
  const place = input.destination;
  if (place === null) return input.fallback;
  return t({ id: 'guide.premium.placeGuide', message: `${place} guide` });
}

function NoSignalChip() {
  const th = usePremiumTheme();
  const styles = useStyles();
  return (
    <View style={styles.noSignal} testID="guide-no-signal">
      <View style={styles.noSignalDot} />
      <Text variant="badge" color={th.color.status.tangerine.text}>
        {t({ id: 'guide.premium.noSignal', message: 'NO SIGNAL' })}
      </Text>
    </View>
  );
}

export function GuideTopBar({
  slug,
  guideName,
  modeLine,
  mode,
  onMode,
  chip,
  offline,
  asSheet,
  onClose,
}: {
  readonly slug: string;
  readonly guideName: string;
  readonly modeLine: string;
  readonly mode: GuideThreadMode;
  /** Present on a shared trip: the Group / Me switch. */
  readonly onMode?: (mode: GuideThreadMode) => void;
  readonly chip: ReactNode;
  /** No connection: NO SIGNAL takes the meter chip's place. */
  readonly offline: boolean;
  /**
   * Opened from the guide circle: ✕ instead of back. The guide still fills the screen (its modal
   * group is a full-screen card), so the bar always clears the status bar, keyboard up or down.
   */
  readonly asSheet: boolean;
  readonly onClose: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const name = guideName;
  return (
    <View style={{ paddingTop: insets.top + 6 }} testID="guide-top-bar">
      <View style={styles.bar}>
        <GlassIconButton
          icon={asSheet ? 'close' : 'back'}
          label={
            asSheet
              ? t({ id: 'guide.premium.close', message: 'Close' })
              : t({ id: 'guide.premium.back', message: 'Back' })
          }
          onPress={onClose}
          testID="guide-close"
        />
        <View
          style={styles.identity}
          accessible
          accessibilityRole="header"
          accessibilityLabel={t({
            id: 'guide.premium.identity',
            message: `${name}, your AI guide. ${modeLine}`,
          })}
        >
          <GuideDisc slug={slug} name={guideName} size={36} />
          <View style={{ flexShrink: 1 }}>
            <Text variant="navTitle" numberOfLines={1}>
              {guideName}
            </Text>
            {offline && onMode !== undefined ? (
              <Text variant="captionMuted" color={th.color.status.tangerine.text} numberOfLines={1}>
                {t({ id: 'guide.premium.noSignalLine', message: 'No signal · questions wait' })}
              </Text>
            ) : (
              <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                {modeLine}
              </Text>
            )}
          </View>
        </View>
        {onMode === undefined ? (
          offline ? (
            <NoSignalChip />
          ) : (
            chip
          )
        ) : (
          <View style={{ width: 112 }}>
            <SegmentedControl
              options={[
                { value: 'group', label: t({ id: 'guide.premium.group', message: 'Group' }) },
                { value: 'private', label: t({ id: 'guide.premium.me', message: 'Me' }) },
              ]}
              value={mode}
              onChange={onMode}
              accessibilityLabel={t({ id: 'guide.premium.whoSees', message: 'Who sees this' })}
              testID="guide-mode"
            />
          </View>
        )}
      </View>
    </View>
  );
}
