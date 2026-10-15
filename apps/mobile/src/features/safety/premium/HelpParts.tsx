/** Help's pieces (6.16): the one-time share question, the phrase card, and the share control. */
import type { HelpPhrase as Phrase } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Button, PressableScale, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import type { ShareControlsProps } from '../help/view-types';

export function HelpConsent({
  crewName,
  onAnswer,
}: {
  readonly crewName: string;
  readonly onAnswer: (granted: boolean) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const question =
    crewName === ''
      ? t({
          id: 'safety.consent.askCrew',
          message: 'When you open Help, show your crew where you are for an hour?',
        })
      : t({
          id: 'safety.consent.ask',
          message: `When you open Help, show ${crewName} where you are for an hour?`,
        });
  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: th.radius.cardRow,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
      testID="help-consent-sheet"
    >
      <Text variant="headline">
        {t({ id: 'safety.consent.title', message: 'Let the crew find you' })}
      </Text>
      <Text variant="rowText">{question}</Text>
      <Text variant="captionMuted" tone="muted">
        {t({
          id: 'safety.consent.control',
          message:
            'The share stops by itself after an hour. Off, Help still has every number and phrase, and you can share with one tap. Change it any time in Settings.',
        })}
      </Text>
      <View style={styles.rowCenter}>
        <View style={styles.flex}>
          <Button
            label={t({ id: 'safety.consent.share', message: 'Yes, share' })}
            size="medium"
            alignSelf="stretch"
            onPress={() => onAnswer(true)}
            testID="help-consent-share"
          />
        </View>
        <Button
          label={t({ id: 'safety.consent.notNow', message: 'Not now' })}
          variant="secondary"
          size="medium"
          onPress={() => onAnswer(false)}
          testID="help-consent-not-now"
        />
      </View>
    </View>
  );
}

export function HelpPhrase(props: {
  readonly phrase: Phrase;
  readonly playing: boolean;
  readonly onPlay: (() => void) | null;
  readonly onShow: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  return (
    <PressableScale onPress={props.onShow} accessibilityRole="button" testID="help-phrase">
      <View
        style={[
          styles.phrase,
          { borderRadius: th.radius.cardRow, backgroundColor: th.color.inkSurface },
        ]}
      >
        <Text variant="badge" color={th.color.onInkSurface} style={styles.soft}>
          {t({ id: 'safety.premium.showThis', message: 'SHOW THIS' })}
        </Text>
        <Text variant="title" color={th.color.onInkSurface}>
          {props.phrase.text}
        </Text>
        <Text variant="caption" color={th.color.onInkSurface} style={styles.soft}>
          {props.phrase.gloss}
        </Text>
        {props.onPlay === null ? null : (
          <View style={styles.playRow}>
            <Button
              label={
                props.playing
                  ? t({ id: 'safety.premium.playing', message: 'Playing…' })
                  : t({ id: 'safety.premium.play', message: 'Play it' })
              }
              size="small"
              variant="floating"
              onPress={props.onPlay}
              testID="help-phrase-play"
            />
          </View>
        )}
      </View>
    </PressableScale>
  );
}

export function HelpShare({ share }: { readonly share: ShareControlsProps }) {
  const th = usePremiumTheme();
  const { crewName } = share;
  const { t } = useLingui();
  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: th.radius.card,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
      testID="help-share"
    >
      {share.locationDenied ? (
        <>
          <Text variant="rowTitle">
            {t({ id: 'safety.share.denied', message: 'Share needs location' })}
          </Text>
          <Text variant="captionMuted" tone="muted">
            {t({
              id: 'safety.share.deniedLine',
              message: 'Calling and texting still work without it.',
            })}
          </Text>
          <TextButton
            label={t({ id: 'safety.share.settings', message: 'Settings' })}
            onPress={share.onSettings}
            testID="help-share-settings"
          />
        </>
      ) : share.share === null ? (
        <Button
          label={t({ id: 'safety.share.start', message: 'Share my location · 1 h' })}
          variant="secondary"
          loading={share.busy}
          onPress={share.onStart}
          testID="help-share-start"
        />
      ) : (
        <View style={styles.rowCenter}>
          <Text variant="rowTextStrong" style={styles.flex}>
            {share.crewName === ''
              ? t({ id: 'safety.share.activeCrew', message: 'Your crew can see where you are' })
              : t({
                  id: 'safety.share.active',
                  message: `${crewName} can see where you are`,
                })}
          </Text>
          {share.extendCapped ? null : (
            <Button
              alignSelf="auto"
              label={t({ id: 'safety.share.extend', message: '+1 h' })}
              size="small"
              variant="floating"
              onPress={share.onExtend}
              testID="help-share-extend"
            />
          )}
          <Button
            alignSelf="auto"
            label={t({ id: 'safety.share.stop', message: 'Stop' })}
            size="small"
            variant="control"
            onPress={share.onStop}
            testID="help-share-stop"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 10 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  phrase: { padding: 16, gap: 6 },
  soft: { opacity: 0.7 },
  playRow: { flexDirection: 'row', marginTop: 4 },
});
