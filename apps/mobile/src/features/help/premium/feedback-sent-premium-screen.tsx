/**
 * Feedback sent in the premium look: a paper card with "POST · COURRIER" and the ticket number,
 * the note pinned (topic · mood, the first 140 characters as written) and Tokek, then the RECEIVED
 * stamp lands on it once (the shell's stamp moment: fall, squash, ripple, confetti). "Pinned to the
 * board", who reads it, and the way back. Sent offline, the stamp says Pinned and the page says it
 * posts when the phone is back; the number arrives with the ticket.
 */
/* eslint-disable lingui/no-unlocalized-strings -- the ticket-number prefix, never copy. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  Card,
  CritterSticker,
  RoundStamp,
  StampMoment,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useFeedbackSent } from '../feedback/use-feedback-sent';

const PIN = 16;

export function FeedbackSentPremiumScreen() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const sent = useFeedbackSent();
  const stamped = sent.ticketNo !== null || sent.queued;
  // The stamp falls after the page is up, so it lands in view rather than already sitting there.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const pinnedOnly = sent.queued && sent.ticketNo === null;
  const ink = th.color.muted;

  return (
    <PushScreen
      title={t({ id: 'help.premium.sentTitle', message: 'Sent' })}
      backLabel={t({ id: 'help.feedback.back', message: 'Help' })}
      testID="help-feedback-sent"
    >
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap16 }}>
        <StampMoment
          landed={stamped && shown}
          style={{ flex: 0 }}
          stamp={
            <RoundStamp
              word={
                pinnedOnly
                  ? t({ id: 'help.sent.pinned', message: 'Pinned' })
                  : t({ id: 'help.sent.received', message: 'Received' })
              }
              top={upper(t({ id: 'help.sent.hq', message: 'HQ · Post' }), locale)}
              bottom={upper(sent.receivedOn, locale)}
              size={132}
              rotate={0}
              paper
              testID="feedback-stamp"
            />
          }
        >
          <Card padded radius={th.radius.cardLarge} style={{ gap: th.space.gap16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="mono" color={ink}>
                {upper(t({ id: 'help.sent.post', message: 'Post · Courrier' }), locale)}
              </Text>
              <Text variant="mono" color={ink} testID="feedback-ticket-no">
                {sent.ticketNo === null ? '#CP-…' : `#CP-${String(sent.ticketNo)}`}
              </Text>
            </View>
            <View
              testID="feedback-pinned-note"
              style={{
                alignSelf: 'center',
                width: '86%',
                marginTop: th.space.gap6,
                borderRadius: th.radius.tag,
                padding: th.space.gap14,
                gap: th.space.gap6,
                backgroundColor: th.color.banner.guide.bg,
                transform: [{ rotate: '-3deg' }],
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: -PIN / 2,
                  alignSelf: 'center',
                  width: PIN,
                  height: PIN,
                  borderRadius: PIN / 2,
                  backgroundColor: th.accent.pink,
                }}
              />
              <Text variant="mono" color={th.color.banner.guide.text}>
                {upper(sent.heading, locale)}
              </Text>
              {sent.note === '' ? null : (
                <Text variant="guide" color={th.color.banner.guide.text}>
                  {sent.note}
                </Text>
              )}
            </View>
            <CritterSticker kind="gecko" name="Tokek" pose="cheer" size={88} />
          </Card>
        </StampMoment>
        <Text variant="largeTitle" accessibilityRole="header">
          {t({ id: 'help.sent.title', message: 'Pinned to the board' })}
        </Text>
        <Text variant="body" tone="muted">
          {pinnedOnly
            ? t({
                id: 'help.sent.queued',
                message: 'Pinned. It posts when you’re back online, and a human reads it then.',
              })
            : sent.name === null
              ? t({
                  id: 'help.sent.thanksNoName',
                  message:
                    'Thanks. A human reads every one of these. If we need more we’ll ask, and Tokek will tell you when it’s fixed.',
                })
              : t({
                  id: 'help.sent.thanks',
                  message: `Thanks, ${sent.name}. A human reads every one of these. If we need more we’ll ask, and Tokek will tell you when it’s fixed.`,
                })}
        </Text>
        <Button
          variant="secondary"
          label={t({ id: 'help.premium.sentDone', message: 'Done' })}
          onPress={sent.onDone}
          testID="feedback-sent-done"
        />
      </View>
    </PushScreen>
  );
}
