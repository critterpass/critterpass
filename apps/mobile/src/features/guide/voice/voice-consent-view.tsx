/**
 * The step before the guide first listens: what talking sends where, with a yes that turns voice
 * on and a way back to typing. Nothing behind it mounts (no microphone, no speech session) until
 * the consent stands.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import { Scaffold, Stack, Text, makeStyles } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';

import type { VoiceConsentStatus } from './voice-consent';

export interface VoiceConsentViewProps {
  readonly guideName: string;
  readonly sticker: ReactNode;
  readonly onAgree: () => void;
  /** The yes is on its way to the server, or waiting for a connection to go. */
  readonly pending?: 'sending' | 'needs_connection' | null;
  /** Back to the guide sheet, to type instead. */
  readonly onType: () => void;
}

const useStyles = makeStyles((t) => ({
  body: {
    flex: 1,
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['12'],
    paddingBottom: t.space['24'],
    justifyContent: 'space-between',
  },
  sticker: { alignItems: 'center', paddingVertical: t.space['32'] },
}));

export function VoiceConsentView({
  guideName,
  sticker,
  onAgree,
  onType,
  pending = null,
}: VoiceConsentViewProps) {
  const styles = useStyles();
  const { t, i18n } = useLingui();
  return (
    <Scaffold edges={['top', 'bottom']} testID="guide-voice-consent">
      <View style={styles.body}>
        <Stack gap="16">
          <Text variant="eyebrow">
            {upper(
              t({ id: 'guide.voice.consentEyebrow', message: `${guideName} · Voice` }),
              i18n.locale,
            )}
          </Text>
          <View style={styles.sticker}>{sticker}</View>
          <Text variant="h2" singleLine={false}>
            {t({ id: 'guide.voice.consentTitle', message: `Talk with ${guideName} out loud?` })}
          </Text>
          <Text variant="bodyLg">
            {t({
              id: 'guide.voice.consentBody',
              message: `When you talk, what you say can be sent to a speech service to be written down, and ${guideName}'s replies are read out by a voice service. The words land in your chat like anything you type.`,
            })}
          </Text>
        </Stack>
        <Stack gap="12">
          {pending !== 'needs_connection' ? null : (
            <Text variant="bodySm" testID="guide-voice-consent-offline">
              {t({
                id: 'guide.voice.consentNeedsConnection',
                message: 'Voice needs a connection. It turns on as soon as you are back online.',
              })}
            </Text>
          )}
          <PillButton
            label={t({ id: 'guide.voice.consentYes', message: 'Turn on voice' })}
            onPress={onAgree}
            loading={pending !== null}
            testID="guide-voice-consent-yes"
          />
          <TextLink
            label={t({ id: 'guide.voice.typeInstead', message: 'Type instead' })}
            onPress={onType}
            testID="guide-voice-consent-no"
          />
        </Stack>
      </View>
    </Scaffold>
  );
}

export interface VoiceGateProps extends VoiceConsentViewProps {
  readonly status: VoiceConsentStatus;
  /** Voice mode itself; mounted only once the consent stands. */
  readonly children: ReactNode;
}

/**
 * Voice mode behind its consent: the question while it is needed (its button busy while the yes
 * goes to the server, with a line when there is no connection to send it), nothing while it loads.
 */
export function VoiceGate({ status, children, ...consent }: VoiceGateProps) {
  if (status === 'loading') return null;
  if (status === 'granted') return <>{children}</>;
  return <VoiceConsentView {...consent} pending={status === 'needed' ? null : status} />;
}
