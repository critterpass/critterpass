import { t } from '@lingui/core/macro';
import { TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { GestureType } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { resolveTypeVariant } from '@cp/design-tokens';

import { LONG_PRESS_DURATION_MS } from '@/motion/gestures/long-press';
import { fontFor } from '@/lib/fonts';
import { useLocale } from '@/lib/i18n/use-locale';
import { useThemeSettings } from '@/lib/theme';

import { StraightArrow } from '../icons/StraightArrow';
import { Row } from '../layout/Row';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { TEXT_VARIANTS } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

export interface ComposerProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onSend: () => void;
  /** "Message, or @tokek". */
  readonly placeholder: string;
  readonly onAttach?: () => void;
  /** Tap the mic: start or stop a voice message (the screen-reader path). */
  readonly onMicTap?: () => void;
  /** Hold the mic to talk; release to send. */
  readonly onHoldStart?: () => void;
  readonly onHoldEnd?: () => void;
  /** A voice message is recording (mic shows active). */
  readonly recording?: boolean;
  /**
   * An answer is being written (the guide): the button at the end stops it instead of sending or
   * recording. The field stays open for the next question.
   */
  readonly stop?: { readonly label: string; readonly onPress: () => void };
  /**
   * The bar sits on a raised surface (a sheet): the "+" and the field take the control colour, as
   * the raised colour they wear on a page is the sheet's own.
   */
  readonly onRaised?: boolean;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  bar: { alignItems: 'center', gap: th.space['8'] },
  circle: {
    width: MIN_TOUCH_TARGET + th.space['4'],
    height: MIN_TOUCH_TARGET + th.space['4'],
    borderRadius: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micTapArea: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  mic: { alignItems: 'center' },
  capsule: { width: th.space['10'], height: th.space['14'], borderRadius: th.space['6'] },
  cradle: {
    width: th.space['16'],
    height: th.space['8'],
    marginTop: -th.space['4'],
    borderWidth: th.space['2'],
    borderTopWidth: 0,
    borderBottomStartRadius: th.space['8'],
    borderBottomEndRadius: th.space['8'],
  },
  stand: { width: th.space['2'], height: th.space['4'] },
  stop: { width: th.space['14'], height: th.space['14'], borderRadius: th.space['2'] },
  field: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET + th.space['4'],
    borderRadius: MIN_TOUCH_TARGET,
    paddingHorizontal: th.space['16'],
    justifyContent: 'center',
  },
}));

/** Microphone drawn from token strokes (capsule, cradle and stand). */
function MicGlyph({ color }: { readonly color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.mic} importantForAccessibility="no-hide-descendants">
      <View style={[styles.capsule, { backgroundColor: color }]} />
      <View style={[styles.cradle, { borderColor: color }]} />
      <View style={[styles.stand, { backgroundColor: color }]} />
    </View>
  );
}

/**
 * One gesture per native view: on iOS every handler on one view spends a shared attach-retry
 * budget, so a composer mounted during a screen push could lose the second gesture of a composed
 * pair. The mic button carries the hold, the full-size tap area inside it carries the tap, and the
 * tap waits for the hold to fail, as `Gesture.Exclusive(hold, tap)` would on a single view.
 */
export function composerMicGestures(
  hold: GestureType,
  tap: GestureType,
): { readonly button: GestureType; readonly tapArea: GestureType } {
  return {
    button: hold.withTestId('composer-mic-hold'),
    tapArea: tap.requireExternalGestureToFail(hold).withTestId('composer-mic-tap'),
  };
}

/**
 * Chat input bar: + attach, text field, and a mic (tap, or hold to talk) that becomes send, or a
 * stop control while `stop` is given.
 */
export function Composer({
  value,
  onChangeText,
  onSend,
  placeholder,
  onAttach,
  onMicTap,
  onHoldStart,
  onHoldEnd,
  recording = false,
  stop,
  onRaised = false,
  testID,
}: ComposerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const fill = onRaised ? theme.semantic.bg.control : theme.semantic.bg.raised;
  const locale = useLocale();
  const { fontScale } = useThemeSettings();
  const token = TEXT_VARIANTS.bodyLg;
  const resolved = resolveTypeVariant(token, { fontScale });
  const font = fontFor(
    {
      fontFamily: token.fontFamily,
      fontWeight: token.fontWeight,
      lineHeightMultiplier: resolved.lineHeightMultiplier,
      condensed: token.condensed,
    },
    locale,
  );
  const canSend = value.trim().length > 0;
  const tap = () => onMicTap?.();
  const holdStart = () => onHoldStart?.();
  const holdEnd = () => onHoldEnd?.();
  const hold = Gesture.LongPress()
    .enabled(onHoldStart !== undefined)
    .minDuration(LONG_PRESS_DURATION_MS)
    .onStart(() => {
      'worklet';
      scheduleOnRN(holdStart);
    })
    .onFinalize((_event, success) => {
      'worklet';
      if (success) scheduleOnRN(holdEnd);
    });
  const micTap = Gesture.Tap().onEnd(() => {
    'worklet';
    scheduleOnRN(tap);
  });
  const micGestures = composerMicGestures(hold, micTap);
  const micLabel = recording
    ? t({ id: 'common.chat.stopRecording', message: 'Stop and send voice message' })
    : t({ id: 'common.chat.recordVoice', message: 'Record a voice message' });

  // The bar's controls are addressed under its own id (`chat-composer-field`, `-attach`, `-send`).
  return (
    <Row style={styles.bar} testID={testID}>
      {onAttach ? (
        <PressScale
          accessibilityLabel={t({ id: 'common.chat.addAttachment', message: 'Add attachment' })}
          onPress={onAttach}
          widthClass="narrow"
          style={[styles.circle, { backgroundColor: fill }]}
          testID={testID === undefined ? undefined : `${testID}-attach`}
        >
          <Text variant="h3">+</Text>
        </PressScale>
      ) : null}
      <View style={[styles.field, { backgroundColor: fill }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.semantic.text.secondary}
          accessibilityLabel={placeholder}
          multiline
          testID={testID === undefined ? undefined : `${testID}-field`}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            // A long message scrolls inside the field instead of pushing the thread off screen.
            maxHeight: MIN_TOUCH_TARGET * 3,
            paddingVertical: theme.space['12'],
            color: theme.semantic.text.primary,
            fontSize: resolved.fontSize * font.sizeMultiplier,
            ...(font.fontFamily === 'system' ? {} : { fontFamily: font.fontFamily }),
          }}
        />
      </View>
      {stop !== undefined ? (
        <PressScale
          accessibilityLabel={stop.label}
          onPress={stop.onPress}
          widthClass="narrow"
          style={[styles.circle, { backgroundColor: theme.color.paper.base }]}
          testID="composer-stop"
        >
          <View style={[styles.stop, { backgroundColor: theme.color.paper.ink }]} />
        </PressScale>
      ) : canSend ? (
        <PressScale
          accessibilityLabel={t({ id: 'common.chat.send', message: 'Send' })}
          onPress={onSend}
          widthClass="narrow"
          style={[styles.circle, { backgroundColor: theme.semantic.action.primary }]}
          testID={testID === undefined ? undefined : `${testID}-send`}
        >
          <StraightArrow
            direction="up"
            size={theme.space['20']}
            color={theme.semantic.text.onAccent}
            testID="composer-send-arrow"
          />
        </PressScale>
      ) : (
        <GestureDetector gesture={micGestures.button}>
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={micLabel}
            accessibilityState={{ selected: recording }}
            accessibilityActions={[{ name: 'activate', label: micLabel }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'activate') tap();
            }}
            style={[
              styles.circle,
              { backgroundColor: recording ? theme.semantic.state.urgent : theme.color.paper.base },
            ]}
          >
            <GestureDetector gesture={micGestures.tapArea}>
              <View style={styles.micTapArea}>
                <MicGlyph
                  color={recording ? theme.semantic.text.onAccent : theme.color.paper.ink}
                />
              </View>
            </GestureDetector>
          </View>
        </GestureDetector>
      )}
    </Row>
  );
}
