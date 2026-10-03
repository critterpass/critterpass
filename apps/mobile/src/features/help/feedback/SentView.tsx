/**
 * Feedback sent (3p-3): a paper page, "POST · COURRIER" and the ticket number, the note pinned
 * (topic · mood, the first 140 characters as written), the RECEIVED stamp slamming down once with a
 * thud and confetti, the guide, then "Pinned to the board", who reads it, BACK TO SETTINGS. Sent
 * offline, the page says it posts when the phone is back, and the number arrives with the ticket.
 */
/* eslint-disable lingui/no-unlocalized-strings -- the ticket-number prefix and style values, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { deviceTier, patterns } from '@/motion';
import { useMotionMode } from '@/motion/motion-mode';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold, SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface SentViewProps {
  /** null until the server has numbered the ticket. */
  readonly ticketNo: number | null;
  /** The note waits in the queue because the phone is offline. */
  readonly queued: boolean;
  readonly heading: string;
  readonly note: string;
  readonly name: string | null;
  readonly receivedOn: string;
  readonly onDone: () => void;
}

const STAMP = 132;

const useStyles = makeStyles((t) => ({
  paper: {
    backgroundColor: t.color.paper.base,
    borderBottomStartRadius: t.radius.sheetTop,
    borderBottomEndRadius: t.radius.sheetTop,
    paddingHorizontal: t.size.gutter,
    paddingBottom: t.space['24'],
    gap: t.space['16'],
  },
  topLine: { justifyContent: 'space-between' },
  note: {
    alignSelf: 'center',
    width: '86%',
    backgroundColor: t.color.paper.warm,
    borderRadius: t.radius.md,
    padding: t.space['14'],
    gap: t.space['6'],
    transform: [{ rotate: '-3deg' }],
  },
  pin: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: t.color.pink,
  },
  scene: { justifyContent: 'space-between', alignItems: 'flex-end' },
  stamp: {
    width: STAMP,
    height: STAMP,
    borderRadius: STAMP / 2,
    borderWidth: 4,
    borderColor: t.color.pink,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-12deg' }],
  },
  body: { padding: t.size.gutter, gap: t.space['16'] },
}));

export function SentView(props: SentViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const [motionMode] = useMotionMode();
  const stamped = props.ticketNo !== null || props.queued;
  const stamp = patterns.useStamp({ active: stamped });
  const hop = patterns.useSquash({ active: stamped });
  useEffect(() => {
    if (stamped && motionMode === 'full') {
      patterns.triggerConfetti(width * 0.7, height * 0.4, 'medium', deviceTier);
    }
  }, [stamped, motionMode, width, height]);
  const guide = GUIDE_STICKERS.tokek;
  const ink = theme.color.paper.muted;
  return (
    // The paper scaffold keeps the status bar dark over the paper card; the page behind is dark.
    <Scaffold
      variant="paper"
      edges={['bottom']}
      background={
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.semantic.bg.base }]} />
      }
      testID="help-feedback-sent"
    >
      <ScrollView>
        <Stack style={[styles.paper, { paddingTop: theme.space['32'] + theme.space['16'] }]}>
          <Row style={styles.topLine}>
            <Text variant="monoData" color={ink}>
              {t({ id: 'help.sent.post', message: 'Post · Courrier' }).toUpperCase()}
            </Text>
            <Text variant="monoData" color={ink} testID="feedback-ticket-no">
              {props.ticketNo === null ? '#CP-…' : `#CP-${String(props.ticketNo)}`}
            </Text>
          </Row>
          <View style={styles.note} testID="feedback-pinned-note">
            <View style={styles.pin} />
            <Text variant="monoData" color={ink}>
              {props.heading.toUpperCase()}
            </Text>
            {props.note === '' ? null : (
              <Text variant="voice" color={theme.color.ink['900']}>
                {props.note}
              </Text>
            )}
          </View>
          <Row style={styles.scene}>
            <Animated.View style={hop}>
              <Sticker kind={guide.kind} name={guide.name} size={88} />
            </Animated.View>
            {stamped ? (
              <Animated.View style={[styles.stamp, stamp]} testID="feedback-stamp">
                <Text variant="label" color={theme.color.pink}>
                  {t({ id: 'help.sent.hq', message: 'HQ · Post' }).toUpperCase()}
                </Text>
                <Text variant="h3" color={theme.color.pink}>
                  {props.queued && props.ticketNo === null
                    ? t({ id: 'help.sent.pinned', message: 'Pinned' }).toUpperCase()
                    : t({ id: 'help.sent.received', message: 'Received' }).toUpperCase()}
                </Text>
                <Text variant="label" color={theme.color.pink}>
                  {props.receivedOn.toUpperCase()}
                </Text>
              </Animated.View>
            ) : null}
          </Row>
        </Stack>
        <SurfaceToneProvider value="dark">
          <Stack style={styles.body}>
            <Text variant="h1" accessibilityRole="header">
              {t({ id: 'help.sent.title', message: 'Pinned to the board' }).toUpperCase()}
            </Text>
            <Text variant="body" color={theme.semantic.text.secondary}>
              {props.queued && props.ticketNo === null
                ? t({
                    id: 'help.sent.queued',
                    message: 'Pinned. It posts when you’re back online, and a human reads it then.',
                  })
                : props.name === null
                  ? t({
                      id: 'help.sent.thanksNoName',
                      message:
                        'Thanks. A human reads every one of these. If we need more we’ll ask, and Tokek will tell you when it’s fixed.',
                    })
                  : t({
                      id: 'help.sent.thanks',
                      message: `Thanks, ${props.name}. A human reads every one of these. If we need more we’ll ask, and Tokek will tell you when it’s fixed.`,
                    })}
            </Text>
            <PillButton
              variant="secondary"
              label={t({ id: 'help.sent.done', message: 'Back to settings' }).toUpperCase()}
              onPress={props.onDone}
              testID="feedback-sent-done"
            />
          </Stack>
        </SurfaceToneProvider>
      </ScrollView>
    </Scaffold>
  );
}
