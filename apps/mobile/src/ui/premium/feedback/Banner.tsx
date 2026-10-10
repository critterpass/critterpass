import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressableScale } from '../motion/PressableScale';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export type BannerTone = 'guide' | 'info' | 'success' | 'error';

export interface BannerProps {
  readonly tone: BannerTone;
  readonly text: string;
  /** A 30 pt doodle or critter at the start. */
  readonly doodle?: ReactNode;
  /** The bold action word at the end ("Review", "Turn on"). */
  readonly action?: { readonly label: string; readonly onPress: () => void };
  readonly testID?: string;
}

/** An inline banner: r20, 12×14 padding, a doodle, a 13/1.35 line and a bold 13/700 action word. */
export function Banner({ tone, text, doodle, action, testID }: BannerProps) {
  const theme = usePremiumTheme();
  const tint = theme.color.banner[tone];
  // The guide's banner keeps its action in ink; the others take their own text colour.
  const actionColour = tone === 'guide' ? theme.color.ink : tint.text;
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={{
        borderRadius: theme.radius.banner,
        backgroundColor: tint.bg,
        paddingVertical: theme.space.bannerPadV,
        paddingHorizontal: theme.space.bannerPadH,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap10,
      }}
    >
      {doodle === undefined ? null : (
        <View
          style={{ width: theme.size.bannerDoodle, height: theme.size.bannerDoodle }}
          accessible={false}
        >
          {doodle}
        </View>
      )}
      <Text variant="note" color={tint.text} style={{ flex: 1 }}>
        {text}
      </Text>
      {action === undefined ? null : (
        <PressableScale
          onPress={action.onPress}
          accessibilityLabel={action.label}
          style={{ minHeight: theme.size.hit, justifyContent: 'center' }}
        >
          <Text variant="bannerAction" color={actionColour}>
            {action.label}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

export interface OfflinePillProps {
  /** Overrides the default line ("Offline · changes send when you're back"). */
  readonly label?: string;
  /** Pin it at the top of the screen (y 56, inset 12), over the content. */
  readonly pinned?: boolean;
  readonly testID?: string;
}

/** The offline pill: the ink bar with a tangerine dot. Reading still works; changes wait in a queue. */
export function OfflinePill({ label, pinned = false, testID }: OfflinePillProps) {
  const theme = usePremiumTheme();
  const text =
    label ?? t({ id: 'common.offline.queued', message: 'Offline · changes send when you’re back' });
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={text}
      style={{
        minHeight: theme.size.offlinePill,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.color.inkSurface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space.gap8,
        paddingHorizontal: theme.space.pillPadH,
        ...(pinned
          ? {
              position: 'absolute',
              top: theme.space.offlinePillY,
              left: theme.space.offlinePillInset,
              right: theme.space.offlinePillInset,
            }
          : {}),
      }}
    >
      <View
        style={{
          width: theme.size.offlineDot,
          height: theme.size.offlineDot,
          borderRadius: theme.size.offlineDot / 2,
          backgroundColor: theme.signal.offlineDot,
        }}
      />
      <Text variant="pillSmall" color={theme.color.onInkSurface} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}
