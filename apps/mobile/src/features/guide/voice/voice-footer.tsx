/**
 * Voice mode's footer (3j-2): SEND TO THE GROUP when the guide has offered changes the crew can
 * vote on, and the round microphone, the one talk control: tap to talk, tap again when done, tap
 * over the guide's reply to cut in.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Row, Text, makeStyles, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { PressScale } from '@/ui/press/PressScale';

export interface VoiceGroupSend {
  /** `open` offers the button; `sent` says the crew has it. */
  readonly status: 'open' | 'sent';
  readonly busy: boolean;
  readonly onSend: () => void;
}

export interface VoiceMic {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
  readonly testID: string;
}

const useStyles = makeStyles((t) => ({
  footer: {
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['12'],
    paddingBottom: t.space['16'],
  },
  grow: { flex: 1 },
  mic: {
    width: t.space['32'] * 2,
    height: t.space['32'] * 2,
    borderRadius: t.space['32'],
    borderWidth: t.space['4'],
    borderColor: t.semantic.bg.control,
    backgroundColor: t.color.paper.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { alignItems: 'center' },
  capsule: { width: t.space['10'], height: t.space['16'], borderRadius: t.space['6'] },
  cradle: {
    width: t.space['16'],
    height: t.space['8'],
    marginTop: -t.space['4'],
    borderWidth: t.space['2'],
    borderTopWidth: 0,
    borderBottomStartRadius: t.space['8'],
    borderBottomEndRadius: t.space['8'],
  },
  stand: { width: t.space['2'], height: t.space['4'] },
}));

/** Microphone drawn from token strokes (capsule, cradle and stand). */
function MicGlyph({ color }: { readonly color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.glyph} importantForAccessibility="no-hide-descendants">
      <View style={[styles.capsule, { backgroundColor: color }]} />
      <View style={[styles.cradle, { borderColor: color }]} />
      <View style={[styles.stand, { backgroundColor: color }]} />
    </View>
  );
}

export function VoiceFooter({
  group,
  mic,
}: {
  readonly group: VoiceGroupSend | null;
  /** Null where talking is not possible (no microphone, no speech module). */
  readonly mic: VoiceMic | null;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <Row gap="12" align="center" style={styles.footer}>
      <View style={styles.grow}>
        {group === null ? null : group.status === 'open' ? (
          <PillButton
            block
            tone="pink"
            label={t({ id: 'guide.voice.sendToGroup', message: 'Send to the group' })}
            onPress={group.onSend}
            disabled={group.busy}
            testID="guide-voice-send-group"
          />
        ) : (
          <Text variant="label" testID="guide-voice-sent-group">
            {t({ id: 'guide.voice.sentToGroup', message: 'Sent to the crew chat as a vote' })}
          </Text>
        )}
      </View>
      {mic === null ? null : (
        <PressScale
          onPress={mic.onPress}
          disabled={mic.disabled}
          widthClass="narrow"
          accessibilityLabel={mic.label}
          style={[styles.mic, mic.disabled ? { opacity: 0.4 } : null]}
          testID={mic.testID}
        >
          <MicGlyph color={theme.color.paper.ink} />
        </PressScale>
      )}
    </Row>
  );
}
