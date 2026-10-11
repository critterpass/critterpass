/**
 * The guide thread's header (5.13, 5.14): the way out top-left (a glass back when the guide was
 * pushed from a screen, ✕ when it rose from the guide circle), the guide's disc, name and who can
 * see the thread, and on the right the Group / Me switch on a shared trip, else the meter chip.
 * Tokek is named as an AI guide for assistive tech.
 */
import type { GuideThreadMode } from '@cp/domain';
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton, SegmentedControl, Text, makePremiumStyles } from '@/ui/premium';

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
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginBottom: 6,
    backgroundColor: th.color.outlineEmpty,
  },
}));

export function GuideTopBar({
  slug,
  guideName,
  modeLine,
  mode,
  onMode,
  chip,
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
  /** Opened from the guide circle: a grabber and ✕ instead of back. */
  readonly asSheet: boolean;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const name = guideName;
  return (
    <View style={{ paddingTop: asSheet ? 8 : insets.top + 6 }} testID="guide-top-bar">
      {asSheet ? <View style={styles.grabber} /> : null}
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
            <Text variant="captionMuted" tone="muted" numberOfLines={1}>
              {modeLine}
            </Text>
          </View>
        </View>
        {onMode === undefined ? (
          chip
        ) : (
          <View style={{ width: 128 }}>
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
      {onMode === undefined ? null : (
        <View style={{ alignItems: 'flex-end', paddingHorizontal: 16, marginTop: -4 }}>{chip}</View>
      )}
    </View>
  );
}
