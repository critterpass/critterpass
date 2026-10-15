/**
 * Before the guide first listens (5.15's first step, undesigned): the guide in its white disc,
 * what talking sends where, centred above Turn on voice and Type instead. Nothing listens until the yes lands.
 */
import { t } from '@lingui/core/macro';
import { Stack } from 'expo-router';
import { View } from 'react-native';

import { Button, CritterSticker, Text, usePremiumTheme } from '@/ui/premium';
import { FullScreen, useScreenInsets } from '@/ui/premium/shell';

import type { VoiceConsentViewProps } from '../../voice/voice-gate';

export function PremiumVoiceConsent({
  guideName,
  guideKind,
  onAgree,
  onType,
  pending = null,
}: VoiceConsentViewProps) {
  const th = usePremiumTheme();
  const insets = useScreenInsets();
  return (
    <FullScreen
      closeLabel={t({ id: 'guide.voice.typeInstead', message: 'Type instead' })}
      overPhoto={false}
      onClose={onType}
      testID="guide-voice-consent"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          flex: 1,
          backgroundColor: th.color.ground,
          paddingTop: insets.top + 64,
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 16,
        }}
      >
        {/* Centred in the room above the actions, as the voice scene it opens is. */}
        <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
          <View
            style={{
              alignSelf: 'center',
              width: 180,
              height: 180,
              borderRadius: 90,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: th.color.card,
              boxShadow: th.shadow.float,
            }}
          >
            <CritterSticker kind={guideKind ?? 'gecko'} name={guideName} size={132} pose="wave" />
          </View>
          <Text variant="largeTitle" align="center">
            {t({ id: 'guide.voice.consentTitle', message: `Talk with ${guideName} out loud?` })}
          </Text>
          <Text variant="body" tone="inkSecondary" align="center">
            {t({
              id: 'guide.voice.consentBody',
              message: `When you talk, what you say can be sent to a speech service to be written down, and ${guideName}'s replies are read out by a voice service. The words land in your chat like anything you type.`,
            })}
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          {pending !== 'needs_connection' ? null : (
            <Text variant="captionMuted" tone="muted" testID="guide-voice-consent-offline">
              {t({
                id: 'guide.voice.consentNeedsConnection',
                message: 'Voice needs a connection. It turns on as soon as you are back online.',
              })}
            </Text>
          )}
          <Button
            label={t({ id: 'guide.voice.consentYes', message: 'Turn on voice' })}
            onPress={onAgree}
            loading={pending !== null}
            testID="guide-voice-consent-yes"
          />
          <Button
            variant="secondary"
            label={t({ id: 'guide.voice.typeInstead', message: 'Type instead' })}
            onPress={onType}
            testID="guide-voice-consent-no"
          />
        </View>
      </View>
    </FullScreen>
  );
}
