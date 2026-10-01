/**
 * WHO'S IN? (3f-6) as a pure view: the segment bar (one segment per member, filled by public
 * status only) with its counts, a row per member with a public line (sent, replied, boarded) and
 * a status chip, {GUIDE} SUGGESTS cards, and the organiser's LOCK IT IN once someone is IN. No row
 * ever says who opened or watched it.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { StatusChip } from '@/ui/chips/StatusChip';
import { Avatar } from '@/ui/people/Avatar';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { FooterFade, FOOTER_FADE_PT } from '@/ui/surface/FooterFade';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { PublicStatus, Tally } from './model';

const useStyles = makeStyles((th) => ({
  header: {
    paddingHorizontal: th.space['20'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: th.space['32'] + th.space['12'],
  },
  chip: {
    backgroundColor: th.color.pink,
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['16'] + FOOTER_FADE_PT,
    gap: th.space['14'],
  },
  bar: { flexDirection: 'row', gap: th.space['4'] },
  segment: { flex: 1, height: th.space['10'], borderRadius: th.radius.pill },
  legend: { flexDirection: 'row', justifyContent: 'space-between' },
  list: { backgroundColor: th.semantic.bg.raised, borderRadius: th.radius.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
  },
  divider: { height: 1, backgroundColor: th.semantic.border.decorative },
  grow: { flex: 1 },
  footer: { paddingHorizontal: th.space['20'], paddingTop: th.space['8'], gap: th.space['6'] },
}));

export interface TrackerRow {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
  readonly status: PublicStatus;
  readonly line: string;
  /** Opens the row's follow-up (a dropout's change list). */
  readonly onPress?: () => void;
}

export interface TrackerViewProps {
  readonly back: string;
  readonly chip: string | null;
  readonly rows: readonly TrackerRow[];
  readonly tally: Tally;
  readonly suggestions: ReactNode;
  /** The crowd link when someone waits for a seat (4f-1). */
  readonly waiting?: ReactNode;
  /** The locked-in card, once the trip is confirmed. */
  readonly confirmed?: ReactNode;
  /** The lock button's label, or null when locking isn't offered. */
  readonly lockLabel: string | null;
  readonly lockNote: string | null;
  readonly locking: boolean;
  readonly onBack: () => void;
  readonly onLock: () => void;
}

export function TrackerView(props: TrackerViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const fill = (status: PublicStatus) =>
    status === 'organiser' || status === 'in'
      ? theme.semantic.state.success
      : status === 'maybe'
        ? theme.semantic.action.primary
        : status === 'out'
          ? theme.semantic.state.urgent
          : theme.semantic.bg.control;
  const { tally } = props;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="proposal-tracker">
      <View style={styles.header}>
        <BackEyebrow label={props.back} onPress={props.onBack} testID="tracker-back" />
        {props.chip === null ? null : (
          <View style={styles.chip}>
            <Text variant="label" color={theme.semantic.text.onAccent} testID="tracker-chip">
              {props.chip}
            </Text>
          </View>
        )}
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'proposal.tracker.title', message: 'Who’s in?' })}
        </Text>
        <View style={styles.bar} testID="tracker-bar">
          {props.rows.map((row) => (
            <View key={row.uid} style={[styles.segment, { backgroundColor: fill(row.status) }]} />
          ))}
        </View>
        <View style={styles.legend}>
          <Text variant="label" color={theme.semantic.state.success} testID="tracker-in-count">
            {t({ id: 'proposal.tracker.in', message: `${tally.in} in` })}
          </Text>
          <Text variant="label" color={theme.semantic.action.primary}>
            {t({ id: 'proposal.tracker.maybe', message: `${tally.maybe} maybe` })}
          </Text>
          <Text variant="label" color={theme.semantic.text.secondary}>
            {t({ id: 'proposal.tracker.noReply', message: `${tally.noReply} no reply` })}
          </Text>
          {tally.out > 0 ? (
            <Text variant="label" color={theme.semantic.state.urgent}>
              {t({ id: 'proposal.tracker.out', message: `${tally.out} out` })}
            </Text>
          ) : null}
        </View>
        <View style={styles.list}>
          {props.rows.map((row, index) => (
            <View key={row.uid}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <Pressable
                style={styles.row}
                disabled={row.onPress === undefined}
                onPress={row.onPress}
                {...(row.onPress === undefined ? {} : { accessibilityRole: 'button' as const })}
                testID={`tracker-row-${row.uid}`}
              >
                <Avatar name={row.name} joinIndex={row.joinIndex} size="md" decorative />
                <View style={styles.grow}>
                  <Text variant="rowTitle">{row.name}</Text>
                  <Text variant="caption" color={theme.semantic.text.secondary}>
                    {row.line}
                  </Text>
                </View>
                <StatusChipFor status={row.status} testID={`tracker-status-${row.uid}`} />
              </Pressable>
            </View>
          ))}
        </View>
        {props.confirmed}
        {props.waiting}
        {props.suggestions}
      </ScrollView>
      <FooterFade />
      {props.lockLabel === null && props.lockNote === null ? null : (
        <View style={styles.footer}>
          {props.lockNote === null ? null : (
            <Text
              variant="caption"
              color={theme.semantic.text.secondary}
              testID="tracker-lock-note"
            >
              {props.lockNote}
            </Text>
          )}
          {props.lockLabel === null ? null : (
            <PillButton
              label={props.lockLabel}
              onPress={props.onLock}
              loading={props.locking}
              sheen
              testID="tracker-lock"
            />
          )}
        </View>
      )}
    </Scaffold>
  );
}

function StatusChipFor({ status, testID }: { status: PublicStatus; testID: string }) {
  switch (status) {
    case 'organiser':
      return (
        <StatusChip
          status="planned"
          label={t({ id: 'proposal.tracker.organiser', message: 'Organiser' })}
          testID={testID}
        />
      );
    case 'in':
      return <StatusChip status="in" testID={testID} />;
    case 'maybe':
      return <StatusChip status="maybe" testID={testID} />;
    case 'out':
      return (
        <StatusChip
          status="ended"
          label={t({ id: 'proposal.tracker.outChip', message: 'Out' })}
          testID={testID}
        />
      );
    case 'waitlisted':
      return (
        <StatusChip
          status="planned"
          label={t({ id: 'proposal.tracker.waitChip', message: 'Waitlist' })}
          testID={testID}
        />
      );
    case 'no_reply':
      return (
        <StatusChip
          status="unopened"
          label={t({ id: 'proposal.tracker.noReplyChip', message: 'No reply yet' })}
          testID={testID}
        />
      );
  }
}
