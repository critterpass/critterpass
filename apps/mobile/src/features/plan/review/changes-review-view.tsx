/**
 * Review changes in the section 7 layout (7h-7), from props only: back to where it came from and
 * ONLY YOU SEE THIS while the set is my unsent draft; Tokek with the headline and summary; the
 * rows (the day's tag in its colour, "+ PLACE", the time and why, a tick that strikes the row
 * through when unticked); NEEDS YOU with SEE; the totals as chips that recount; and SEND TO CREW ·
 * NEEDS {k} YESES with "Apply to my plan only" (yes / no once it is a vote).
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Icon } from '@/ui/icons/Icon';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { NeedsYouList, type NeedsYouRow } from './needs-you-list';

const TICK = 26;

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['32'],
    gap: th.space['12'],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  only: {
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
    backgroundColor: th.semantic.bg.control,
  },
  hero: { flexDirection: 'row', alignItems: 'center', gap: th.space['12'] },
  heroText: { flex: 1, minWidth: 0 },
  card: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
  },
  tag: {
    minWidth: 44,
    alignItems: 'center',
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['6'],
    paddingVertical: th.space['2'],
  },
  rowBody: { flex: 1, minWidth: 0 },
  tick: {
    width: TICK,
    height: TICK,
    borderRadius: TICK / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  footer: { gap: th.space['12'], alignItems: 'center', paddingTop: th.space['8'] },
  voteRow: { flexDirection: 'row', gap: th.space['12'], alignSelf: 'stretch' },
  notice: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
  },
}));

export interface ChangeRow {
  readonly key: string;
  readonly dayTag: string;
  readonly dayColor: string;
  readonly title: string;
  readonly detail: string;
  readonly accepted: boolean;
}

export type { NeedsYouRow } from './needs-you-list';

export interface ChangesReviewViewProps {
  readonly state: 'loading' | 'missing' | 'ready';
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly onlyYou: string | null;
  readonly title: string;
  readonly summary: string;
  readonly rows: readonly ChangeRow[];
  readonly onToggle: ((key: string, accepted: boolean) => void) | null;
  readonly needsYou: readonly NeedsYouRow[];
  readonly totals: ReactNode;
  readonly send: {
    readonly label: string;
    readonly disabled: boolean;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  readonly personal: { readonly busy: boolean; readonly onPress: () => void } | null;
  readonly vote: {
    readonly line: string;
    readonly canVote: boolean;
    readonly onYes: () => void;
    readonly onNo: () => void;
  } | null;
  readonly notice: string | null;
}

function Tick({ accepted }: { readonly accepted: boolean }) {
  const styles = useStyles();
  const theme = useTheme();
  const fill = accepted ? theme.semantic.state.success : 'transparent';
  return (
    <View
      style={[
        styles.tick,
        { backgroundColor: fill, borderColor: accepted ? fill : theme.semantic.border.decorative },
      ]}
    >
      {accepted ? <Icon name="check" size={14} color={theme.color.paper.ink} decorative /> : null}
    </View>
  );
}

export function ChangesReviewView(props: ChangesReviewViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (props.state !== 'ready') {
    return (
      <Scaffold variant="dark" edges={['top', 'bottom']} testID="plan-review">
        <View style={styles.content}>
          <BackEyebrow label={props.backLabel} onPress={props.onBack} />
          {props.state === 'loading' ? (
            <Skeleton preset="list" repeat={4} testID="plan-review-loading" />
          ) : (
            <Text variant="body" testID="plan-review-missing">
              {t({
                id: 'plan.review.missing',
                message: 'This change isn’t on your phone yet. It shows up once it syncs.',
              })}
            </Text>
          )}
        </View>
      </Scaffold>
    );
  }
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="plan-review">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <BackEyebrow label={props.backLabel} onPress={props.onBack} />
          {props.onlyYou === null ? null : (
            <View style={styles.only} testID="plan-review-only-you">
              <Text variant="label" color={theme.semantic.text.secondary}>
                {props.onlyYou}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.hero}>
          <Sticker kind="gecko" name="Tokek" size={64} />
          <View style={styles.heroText}>
            <Text variant="h1" singleLine={false} testID="plan-review-title">
              {props.title}
            </Text>
          </View>
        </View>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {props.summary}
        </Text>
        <View style={styles.card} testID="plan-review-rows">
          {props.rows.map((row) => {
            const strike = row.accepted ? null : ({ textDecorationLine: 'line-through' } as const);
            const content = (
              <View style={styles.row}>
                <View style={[styles.tag, { backgroundColor: row.dayColor }]}>
                  <Text variant="label" color={theme.color.paper.ink}>
                    {row.dayTag}
                  </Text>
                </View>
                <View style={styles.rowBody}>
                  <Text variant="title" numberOfLines={1} style={strike}>
                    {row.title}
                  </Text>
                  <Text
                    variant="bodySm"
                    color={theme.semantic.text.secondary}
                    numberOfLines={1}
                    style={strike}
                  >
                    {row.detail}
                  </Text>
                </View>
                <Tick accepted={row.accepted} />
              </View>
            );
            const onToggle = props.onToggle;
            return onToggle === null ? (
              <View key={row.key} testID={`plan-review-row-${row.key}`}>
                {content}
              </View>
            ) : (
              <PressScale
                key={row.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: row.accepted }}
                accessibilityLabel={`${row.title}, ${row.detail}`}
                onPress={() => onToggle(row.key, !row.accepted)}
                testID={`plan-review-row-${row.key}`}
              >
                {content}
              </PressScale>
            );
          })}
        </View>
        <NeedsYouList rows={props.needsYou} />
        {props.totals}
        {props.notice === null ? null : (
          <View style={styles.notice} testID="plan-review-notice">
            <Text variant="bodySm">{props.notice}</Text>
          </View>
        )}
        <View style={styles.footer}>
          {props.send === null ? null : (
            <PillButton
              label={props.send.label}
              onPress={props.send.onPress}
              disabled={props.send.disabled}
              loading={props.send.busy}
              block
              testID="plan-review-send"
            />
          )}
          {props.vote === null ? null : (
            <>
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {props.vote.line}
              </Text>
              {props.vote.canVote ? (
                <View style={styles.voteRow}>
                  <PillButton
                    label={t({ id: 'plan.review.yes', message: 'Yes' })}
                    onPress={props.vote.onYes}
                    block
                    testID="plan-review-yes"
                  />
                  <PillButton
                    label={t({ id: 'plan.review.no', message: 'Not this' })}
                    onPress={props.vote.onNo}
                    variant="secondary"
                    block
                    testID="plan-review-no"
                  />
                </View>
              ) : null}
            </>
          )}
          {props.personal === null ? null : (
            <TextLink
              label={t({ id: 'plan.review.personal', message: 'Apply to my plan only' })}
              onPress={props.personal.onPress}
              disabled={props.personal.busy}
              testID="plan-review-personal"
            />
          )}
        </View>
      </ScrollView>
    </Scaffold>
  );
}
