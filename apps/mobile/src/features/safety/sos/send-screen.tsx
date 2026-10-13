/**
 * Sending an SOS (designed in code): an optional preset ("I fell", "I'm lost", "Need a ride") and a
 * few words, SLIDE TO SEND, then five seconds to cancel before anything leaves the phone. It goes
 * through the offline queue (replayed when signal returns, never twice); with no data the phone's
 * own message composer opens prefilled to the crew. More than three in a day asks once more.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Icon } from '@/ui/icons/Icon';
import { SlideToConfirm } from '@/ui/inputs/SlideToConfirm';
import { TextField } from '@/ui/inputs/TextField';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { safetyRoutes } from '../routes';
import { useSosSend } from './use-sos-send';

export function SosSendScreen() {
  const { t } = useLingui();
  const theme = useTheme();
  const sos = useSosSend();
  const { tripId, general, left } = sos;
  return (
    <Scaffold variant="dark" edges={['top']} testID="sos-send-screen">
      <KeyboardScrollView
        contentContainerStyle={{
          padding: theme.size.gutter,
          gap: theme.space['20'],
        }}
      >
        <BackEyebrow
          label={t({ id: 'safety.back.help', message: 'Help' })}
          fallback={safetyRoutes.help(tripId ?? undefined)}
        />
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'safety.send.title', message: 'SOS to your crew' })}
        </Text>
        <SecondaryText>
          {t({
            id: 'safety.send.line',
            message: `Every crewmate gets an alert that comes through Do Not Disturb, with where you are. CritterPass tells your crew; for emergencies call ${general}.`,
          })}
        </SecondaryText>
        <Row gap="8" wrap>
          {sos.presets.map((p) => (
            <ChoiceChip
              key={p.id}
              label={p.label}
              selected={sos.preset === p.id}
              onPress={() => sos.togglePreset(p.id)}
              testID={`sos-preset-${p.id}`}
            />
          ))}
        </Row>
        <TextField
          label={t({ id: 'safety.send.words', message: 'A few words (optional)' })}
          value={sos.text}
          onChangeText={sos.setText}
          maxLength={280}
          maxLines={3}
          testID="sos-text"
        />
      </KeyboardScrollView>
      <KeyboardFooter>
        {sos.failed ? (
          <Text variant="body" color={theme.semantic.state.warning} testID="sos-send-failed">
            {t({
              id: 'safety.send.failed',
              message: `Your SOS didn't go out. Slide to try again, or call ${general}.`,
            })}
          </Text>
        ) : null}
        {sos.sending ? (
          <Text variant="h2" accessibilityLiveRegion="assertive" testID="sos-sending">
            {t({ id: 'safety.send.sending', message: 'Sending…' })}
          </Text>
        ) : left === null ? (
          <SlideToConfirm
            label={t({ id: 'safety.send.slide', message: 'Slide to send SOS' })}
            actionLabel={t({ id: 'safety.send.action', message: 'Send SOS' })}
            disabled={tripId === null}
            knob={
              <View testID="sos-knob" style={styles.knob}>
                <Icon name="bell" size={28} color={theme.color.ink['950']} decorative />
              </View>
            }
            onConfirm={sos.confirm}
            testID="sos-slide"
          />
        ) : (
          <Stack gap="12" testID="sos-countdown">
            <Text variant="h2" accessibilityLiveRegion="assertive">
              {t({ id: 'safety.send.countdown', message: `Sending in ${left}…` })}
            </Text>
            <PillButton
              label={t({ id: 'safety.send.cancel', message: 'Cancel' })}
              variant="secondary"
              block
              onPress={sos.cancelCountdown}
              testID="sos-cancel"
            />
          </Stack>
        )}
      </KeyboardFooter>
      {sos.confirming ? (
        <ConfirmSheet
          title={t({ id: 'safety.send.againTitle', message: 'Send another SOS today?' })}
          consequences={[
            t({
              id: 'safety.send.againLine',
              message: 'Your whole crew gets another alert through Do Not Disturb.',
            }),
          ]}
          confirmLabel={t({ id: 'safety.send.action', message: 'Send SOS' })}
          mode="button"
          onCancel={() => sos.answerAgain(false)}
          onConfirm={() => sos.answerAgain(true)}
          testID="sos-again-confirm"
        />
      ) : null}
    </Scaffold>
  );
}

const styles = StyleSheet.create({
  knob: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
