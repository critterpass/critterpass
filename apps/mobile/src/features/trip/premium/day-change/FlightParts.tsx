/**
 * A flight disruption's rows (6.09): what is done, on its way or needs a look, and each question
 * that needs a yes (Approve or Keep, or who already answered).
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
import { format } from '@cp/i18n';
import type { DisruptionAction } from '@cp/domain';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button, Icon, Text, usePremiumTheme } from '@/ui/premium';

import {
  actionLabels,
  decidedLine,
  questionHeading,
  rowLine,
  sectionTitles,
} from '../../disruptions/flight/copy';
import type { FlightViewProps } from '../../disruptions/flight/view-types';
import type { Question } from '../../disruptions/flight/model';

export function FlightRows(props: {
  readonly title: string;
  readonly rows: readonly DisruptionAction[];
  readonly tone: 'done' | 'working' | 'problem';
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  const locale = useLocale();
  if (props.rows.length === 0) return null;
  const tint =
    props.tone === 'done'
      ? th.color.status.booked
      : props.tone === 'problem'
        ? th.color.status.voteOpen
        : th.color.status.maybe;
  return (
    <View style={{ gap: th.space.gap8 }} testID={props.testID}>
      <Text variant="label" tone="muted">
        {props.title}
      </Text>
      <View
        style={[
          styles.card,
          {
            borderRadius: th.radius.cardRow,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        {props.rows.map((row, index) => (
          <View
            key={row.id}
            style={[
              styles.row,
              index === 0 ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
            ]}
          >
            <View style={[styles.tick, { backgroundColor: tint.bg }]}>
              <Icon
                name={
                  props.tone === 'done' ? 'check' : props.tone === 'problem' ? 'close' : 'retry'
                }
                size={12}
                color={tint.text}
              />
            </View>
            <Text variant="rowText" style={styles.flex}>
              {rowLine(row, locale)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function QuestionCard({
  question,
  tz,
  onAnswer,
}: {
  readonly question: Question;
  readonly tz: string;
  readonly onAnswer: FlightViewProps['onAnswer'];
}) {
  const th = usePremiumTheme();
  const locale = useLocale();
  const [answered, setAnswered] = useState<'approve' | 'keep' | null>(null);
  const { action } = question;
  const from = String(action.facts['from'] ?? '');
  const labels = actionLabels(from);
  const answer = (decision: 'approve' | 'keep') => {
    setAnswered(decision);
    onAnswer(action.id, decision);
  };
  const decided =
    question.decidedBy === null
      ? null
      : decidedLine(question.decidedBy.name, action.state !== 'kept', from);
  const closes =
    question.closesAt === null
      ? null
      : format.date(locale, new Date(question.closesAt), {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        });
  return (
    <View
      style={[
        styles.card,
        styles.question,
        {
          borderRadius: th.radius.cardRow,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
      testID={`disruption-question-${action.id}`}
    >
      <Text variant="label" color={th.color.status.tangerine.text}>
        {sectionTitles().question}
      </Text>
      <Text variant="headline">{questionHeading(action, locale)}</Text>
      {action.kind === 'contact_vendor' ? (
        <Text variant="caption" tone="muted">
          {rowLine(action, locale)}
        </Text>
      ) : null}
      {decided !== null ? (
        <Text variant="rowTextStrong" color={th.color.status.booked.text}>
          {decided}
        </Text>
      ) : question.canAnswer && answered === null ? (
        <View style={styles.pair}>
          <Button
            alignSelf="auto"
            label={labels.approve}
            size="medium"
            onPress={() => answer('approve')}
            testID={`disruption-approve-${action.id}`}
          />
          <Button
            alignSelf="auto"
            label={labels.keep}
            size="medium"
            variant="control"
            onPress={() => answer('keep')}
            testID={`disruption-keep-${action.id}`}
          />
        </View>
      ) : null}
      {closes === null || decided !== null ? null : (
        <Text variant="captionMuted" tone="muted">
          {closes}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  tick: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  question: { paddingVertical: 14, gap: 8 },
  pair: { flexDirection: 'row', gap: 8 },
});
