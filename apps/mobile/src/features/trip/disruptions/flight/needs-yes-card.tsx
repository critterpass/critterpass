/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
/**
 * A question to the crew on 3k-5 ("DINNER: 19:30 → 21:00", APPROVE / KEEP 19:30, who it affects).
 * Only a member it affects can answer; anyone else sees who it waits on. Once answered it says who
 * decided ("Maya approved"). The outline glows while it waits (2 s pulse; still with reduced
 * motion), and an answer pops the card before the row moves on.
 */
import { format, upper } from '@cp/i18n';
import { tokens } from '@cp/design-tokens';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import {
  actionLabels,
  affectedCount,
  answerBy,
  decidedLine,
  questionHeading,
  rowLine,
  sectionTitles,
  waitingOn,
} from './copy';
import type { Question } from './model';

export interface NeedsYesCardProps {
  readonly question: Question;
  readonly tz: string;
  readonly joinIndex: (uid: string) => number;
  readonly onAnswer: (actionId: string, decision: 'approve' | 'keep') => void;
}

const useStyles = makeStyles((th) => ({
  glow: {
    ...{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 },
    borderRadius: th.radius.lg,
    borderWidth: 2,
    borderColor: th.semantic.state.warning,
  },
}));

export function NeedsYesCard({ question, tz, joinIndex, onAnswer }: NeedsYesCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const [answered, setAnswered] = useState<'approve' | 'keep' | null>(null);
  const waiting = question.decidedBy === null && answered === null;
  const glow = useLoop('pulse', { active: waiting });
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(1);
  // The card pops once when it is answered here.
  useEffect(() => {
    if (answered === null || reduced) return;
    scale.value = withSequence(
      withTiming(1.04, { duration: tokens.motion.duration.instant }),
      withTiming(1, { duration: tokens.motion.duration.fast }),
    );
  }, [answered, reduced, scale]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const { action } = question;
  const from = String(action.facts['from'] ?? '');
  const labels = actionLabels(from);
  const answer = (decision: 'approve' | 'keep') => {
    setAnswered(decision);
    onAnswer(action.id, decision);
  };
  // A retime says it all in its heading; a message to a vendor reads out the question itself.
  const detail = action.kind === 'contact_vendor' ? rowLine(action, locale) : null;
  const decided =
    question.decidedBy !== null
      ? decidedLine(question.decidedBy.name, action.state !== 'kept', from)
      : null;
  const closes =
    question.closesAt === null
      ? null
      : format.date(locale, new Date(question.closesAt), {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
        });
  return (
    <Animated.View style={pop}>
      <Card tone="raised" testID={`disruption-question-${action.id}`}>
        {waiting ? <Animated.View pointerEvents="none" style={[styles.glow, glow]} /> : null}
        <Stack gap="10">
          <Text variant="eyebrow" color={theme.semantic.state.warning}>
            {upper(sectionTitles().question, locale)}
          </Text>
          <Text variant="h3" singleLine={false}>
            {questionHeading(action, locale)}
          </Text>
          {detail === null ? null : (
            <Text variant="bodySm" color={theme.semantic.text.secondary} singleLine={false}>
              {detail}
            </Text>
          )}
          {decided !== null ? (
            <Text variant="label" color={theme.semantic.state.success} testID="disruption-decided">
              {decided}
            </Text>
          ) : question.canAnswer && answered === null ? (
            <Row gap="8" wrap>
              <PillButton
                label={labels.approve}
                tone="green"
                size="sm"
                onPress={() => answer('approve')}
                testID="disruption-approve"
              />
              <PillButton
                label={labels.keep}
                variant="secondary"
                size="sm"
                onPress={() => answer('keep')}
                testID="disruption-keep"
              />
            </Row>
          ) : answered === null ? (
            <Text
              variant="bodySm"
              color={theme.semantic.text.secondary}
              testID="disruption-waiting-on"
            >
              {waitingOn(
                question.affected.map((p) => p.name).filter((n) => n !== ''),
                locale,
              )}
            </Text>
          ) : null}
          <Row gap="8" align="center">
            <AvatarStack
              size="sm"
              members={question.affected.map((p) => ({
                key: p.id,
                name: p.name,
                joinIndex: joinIndex(p.id),
              }))}
            />
            <Text variant="eyebrow" color={theme.semantic.text.secondary}>
              {upper(affectedCount(question.affected.length), locale)}
            </Text>
            {waiting && closes !== null ? (
              <View style={{ marginStart: 'auto' }}>
                <Text variant="caption" color={theme.semantic.text.tertiary}>
                  {answerBy(closes)}
                </Text>
              </View>
            ) : null}
          </Row>
        </Stack>
      </Card>
    </Animated.View>
  );
}
