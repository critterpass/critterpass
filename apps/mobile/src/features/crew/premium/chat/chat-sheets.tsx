/** The chat's bottom glass sheets: the "+" sheet and the microphone-off sheet (5.05). */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  GlassIconButton,
  GlassSurface,
  Icon,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
  type PremiumIconName,
} from '@/ui/premium';
import { CHAT_PAINT } from '../premium-paint';

const useStyles = makePremiumStyles((th) => ({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: CHAT_PAINT.sheetScrim },
  sheet: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: th.radius.sheet,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: CHAT_PAINT.grabber,
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: -4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap12,
    height: 52,
    paddingHorizontal: th.space.gap14,
    borderRadius: th.radius.card,
    backgroundColor: th.color.card,
  },
}));

/** A bottom glass sheet drawn over the chat, with a scrim; tapping the scrim closes it. */
export function ChatSheet({
  onClose,
  children,
  testID,
}: {
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  const insets = useSafeAreaInsets();
  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(150)}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'chat.premium.sheet.close', message: 'Close' })}
        />
      </Animated.View>
      <Animated.View
        entering={reduced ? FadeIn.duration(150) : SlideInDown.springify()}
        exiting={reduced ? FadeOut.duration(150) : SlideOutDown}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <GlassSurface kind="sheet" style={StyleSheet.absoluteFill} />
        <View style={styles.grabber} />
        {children}
      </Animated.View>
    </View>
  );
}

export interface AttachOption {
  readonly key: string;
  readonly label: string;
  readonly icon: PremiumIconName;
  readonly onPress: () => void;
}

export function AttachSheet({
  options,
  problem,
  onOpenSettings,
  onClose,
}: {
  readonly options: readonly AttachOption[];
  readonly problem: 'denied' | 'failed' | null;
  readonly onOpenSettings: () => void;
  readonly onClose: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  return (
    <ChatSheet onClose={onClose} testID="chat-attach-sheet">
      <View style={{ gap: th.space.gap8, paddingTop: th.space.gap14 }}>
        {problem === null ? null : (
          <View style={{ gap: th.space.gap8, paddingBottom: th.space.gap8 }}>
            <Text variant="rowTextStrong">
              {problem === 'denied'
                ? t({
                    id: 'chat.premium.attach.denied',
                    message: 'CritterPass can’t see your photos',
                  })
                : t({ id: 'chat.premium.attach.failed', message: 'That didn’t open. Try again?' })}
            </Text>
            {problem === 'denied' ? (
              <Button
                variant="secondary"
                size="small"
                label={t({ id: 'chat.premium.openSettings', message: 'Open Settings' })}
                onPress={onOpenSettings}
              />
            ) : null}
          </View>
        )}
        {options.map((option) => (
          <PressableScale
            key={option.key}
            style={styles.option}
            onPress={option.onPress}
            accessibilityRole="button"
            testID={`chat-attach-${option.key}`}
          >
            <Icon name={option.icon} size={18} color={th.color.ink} />
            <Text variant="rowTitle">{option.label}</Text>
          </PressableScale>
        ))}
      </View>
    </ChatSheet>
  );
}

export function MicOffSheet({
  onOpenSettings,
  onTypeInstead,
  onClose,
}: {
  readonly onOpenSettings: () => void;
  readonly onTypeInstead: () => void;
  readonly onClose: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  return (
    <ChatSheet onClose={onClose} testID="chat-mic-off">
      <View style={styles.sheetHead}>
        <GlassIconButton
          icon="close"
          label={t({ id: 'chat.premium.sheet.close', message: 'Close' })}
          onPress={onClose}
        />
      </View>
      <View style={{ alignItems: 'center', gap: th.space.gap10, paddingTop: th.space.gap4 }}>
        <View
          style={{
            width: 86,
            height: 86,
            borderRadius: 43,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: th.color.status.voteOpen.bg,
          }}
        >
          <Icon name="mic" size={36} color={th.color.status.voteOpen.text} />
          <View
            style={{
              position: 'absolute',
              width: 56,
              height: 3,
              borderRadius: 2,
              backgroundColor: th.color.status.voteOpen.text,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
        <Text variant="title" align="center">
          {t({ id: 'chat.premium.micOff.title', message: 'The microphone is off' })}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {t({
            id: 'chat.premium.micOff.body',
            message: 'Turn on the microphone for CritterPass in Settings to send voice notes.',
          })}
        </Text>
      </View>
      <View style={{ gap: th.space.gap8, paddingTop: th.space.gap16 }}>
        <Button
          label={t({ id: 'chat.premium.openSettings', message: 'Open Settings' })}
          onPress={onOpenSettings}
          testID="chat-mic-settings"
        />
        <Button
          variant="secondary"
          label={t({ id: 'chat.premium.micOff.type', message: 'Type it instead' })}
          onPress={onTypeInstead}
          testID="chat-mic-type"
        />
      </View>
    </ChatSheet>
  );
}
