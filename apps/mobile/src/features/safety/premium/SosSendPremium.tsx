/**
 * Sending an SOS (built from the 6.17 pieces): the pink band with the SOS chip, "SOS to your crew"
 * and what happens, the presets as pills and a few words, then the pink hold-to-send pill. Once
 * held, five seconds count down with Cancel before anything leaves the phone. The ✕ top left is
 * always there; past three SOS in a day the system alert asks once more.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text, TextField, usePremiumTheme } from '@/ui/premium';
import {
  confirmAlert,
  FullScreen,
  HoldToConfirm,
  KeyboardAwareScroll,
  KeyboardStickyFooter,
} from '@/ui/premium/shell';

import { useSosSend } from '../sos/use-sos-send';

export function SosSendPremium() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const sos = useSosSend();
  const { general, left } = sos;
  const sendLabel = t({ id: 'safety.send.action', message: 'Send SOS' });
  // The footer clears the home indicator while the keyboard is down; up, it sits a gap above the
  // keyboard with no band under it, and the focused words stay above the whole footer.
  const footerPad = Math.max(insets.bottom, th.space.gap12);
  const [footerHeight, setFooterHeight] = useState(0);

  const hold = () => {
    if (!sos.needsAgain) {
      sos.startCountdown();
      return;
    }
    void confirmAlert({
      title: t({ id: 'safety.send.againTitle', message: 'Send another SOS today?' }),
      message: t({
        id: 'safety.send.againLine',
        message: 'Your whole crew gets another alert through Do Not Disturb.',
      }),
      confirm: sendLabel,
      cancel: t({ id: 'safety.send.cancel', message: 'Cancel' }),
    }).then((again) => {
      if (again) sos.startCountdown();
    });
  };

  return (
    <FullScreen
      closeLabel={t({ id: 'safety.sos.close', message: 'Close' })}
      overPhoto={false}
      testID="sos-send-screen"
    >
      <View style={[styles.root, { backgroundColor: th.color.ground }]}>
        <KeyboardAwareScroll
          bottomOffset={footerHeight - footerPad + th.space.gap12 + th.space.gap16}
          contentContainerStyle={{ paddingBottom: th.space.gap16 }}
        >
          <View
            style={[
              styles.band,
              {
                // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, not copy
                backgroundImage: `linear-gradient(180deg, ${th.color.status.voteOpen.bg}, ${th.color.ground})`,
                paddingTop: insets.top + th.size.glassNav + th.space.gap16,
                paddingHorizontal: th.space.titleGutter,
                gap: th.space.gap14,
              },
            ]}
          >
            <View style={[styles.chip, { backgroundColor: th.accent.pink }]}>
              <View style={[styles.dot, { backgroundColor: th.color.onAccent }]} />
              <Text variant="badge" color={th.color.onAccent}>
                {t({ id: 'safety.premium.sosChip', message: 'SOS' })}
              </Text>
            </View>
            <Text variant="display" accessibilityRole="header">
              {t({ id: 'safety.send.title', message: 'SOS to your crew' })}
            </Text>
            <Text variant="body" tone="inkSecondary">
              {t({
                id: 'safety.send.line',
                message: `Every crewmate gets an alert that comes through Do Not Disturb, with where you are. CritterPass tells your crew; for emergencies call ${general}.`,
              })}
            </Text>
          </View>
          <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap14 }}>
            <View style={[styles.presets, { gap: th.space.gap8 }]}>
              {sos.presets.map((p) => (
                <Button
                  key={p.id}
                  label={p.label}
                  size="small"
                  variant={sos.preset === p.id ? 'primary' : 'control'}
                  onPress={() => sos.togglePreset(p.id)}
                  testID={`sos-preset-${p.id}`}
                />
              ))}
            </View>
            <TextField
              accessibilityLabel={t({ id: 'safety.send.words', message: 'A few words (optional)' })}
              placeholder={t({ id: 'safety.send.words', message: 'A few words (optional)' })}
              value={sos.text}
              onChangeText={sos.setText}
              maxLength={280}
              multiline
              testID="sos-text"
            />
          </View>
        </KeyboardAwareScroll>
        <KeyboardStickyFooter openedOffset={th.space.gap12 - footerPad}>
          <View
            onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
            style={[
              styles.footer,
              {
                paddingHorizontal: th.space.gutter,
                paddingBottom: footerPad,
                gap: th.space.gap12,
                backgroundColor: th.color.ground,
              },
            ]}
          >
            {sos.failed ? (
              <Text variant="label" color={th.color.destructive.helper} testID="sos-send-failed">
                {t({
                  id: 'safety.premium.sendFailed',
                  message: `Your SOS didn't go out. Hold to try again, or call ${general}.`,
                })}
              </Text>
            ) : null}
            {sos.sending ? (
              <Text
                variant="title"
                align="center"
                accessibilityLiveRegion="assertive"
                testID="sos-sending"
              >
                {t({ id: 'safety.send.sending', message: 'Sending…' })}
              </Text>
            ) : left === null ? (
              <HoldToConfirm
                label={t({ id: 'safety.premium.holdToSend', message: 'Hold to send SOS' })}
                disabled={sos.tripId === null}
                onConfirm={hold}
                fallback={{
                  title: t({ id: 'safety.send.title', message: 'SOS to your crew' }),
                  message: t({
                    id: 'safety.premium.sendFallbackLine',
                    message: 'Every crewmate gets an alert that comes through Do Not Disturb.',
                  }),
                  confirm: sendLabel,
                  cancel: t({ id: 'safety.send.cancel', message: 'Cancel' }),
                }}
                testID="sos-hold"
              />
            ) : (
              <View style={{ gap: th.space.gap12 }} testID="sos-countdown">
                <Text variant="title" align="center" accessibilityLiveRegion="assertive">
                  {t({ id: 'safety.send.countdown', message: `Sending in ${left}…` })}
                </Text>
                <Button
                  label={t({ id: 'safety.send.cancel', message: 'Cancel' })}
                  variant="secondary"
                  onPress={sos.cancelCountdown}
                  testID="sos-cancel"
                />
              </View>
            )}
          </View>
        </KeyboardStickyFooter>
      </View>
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  band: { paddingBottom: 20 },
  chip: {
    alignSelf: 'flex-start',
    height: 32,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  presets: { flexDirection: 'row', flexWrap: 'wrap' },
  footer: { paddingTop: 12 },
});
