/**
 * The bottom panel: the meet-up (time, place, MOVE IT) or SET A MEET-UP, a row per person or
 * bunch with the arrival clock, PING ALL and I'M ON MY WAY, the lock-screen row, and the footer
 * saying when sharing switches itself off.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { PressScale } from '@/ui/press/PressScale';
import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import { MemberRow, type RowModel } from './member-row';
import { PingActions } from './ping-actions';

const useStyles = makeStyles((th) => ({
  panel: {
    backgroundColor: th.semantic.bg.sunken,
    borderRadius: th.radius.xl,
    borderWidth: 1,
    borderColor: th.color.divider,
    padding: th.space['16'],
    gap: th.space['12'],
  },
  head: { alignItems: 'center', gap: th.space['12'] },
  headText: { flex: 1 },
  rows: { maxHeight: 280 },
  pending: {
    alignSelf: 'flex-start',
    borderRadius: th.radius.pill,
    backgroundColor: th.semantic.bg.control,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['2'],
  },
}));

export interface PanelProps {
  readonly meetup: {
    readonly place: string;
    readonly time: string;
    readonly pending: boolean;
  } | null;
  readonly rows: readonly RowModel[];
  readonly myUid: string | null;
  readonly locationOff: boolean;
  readonly offline: boolean;
  readonly pinging: boolean;
  readonly footer: string | null;
  readonly top?: ReactNode;
  readonly onMove: () => void;
  readonly onCreate: () => void;
  readonly onPause: () => void;
  readonly onOpenSettings: () => void;
  readonly onLockScreen: (() => void) | null;
  readonly onPing: (kind: 'ping' | 'on_my_way') => void;
}

export function Panel(props: PanelProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { meetup } = props;
  return (
    <View style={styles.panel} testID="live-panel">
      {props.top}
      {meetup === null ? (
        <Row style={styles.head}>
          <Stack gap="2" style={styles.headText}>
            <Text variant="eyebrow" color={tokens.color.yellow}>
              {t({ id: 'liveMap.panel.noMeetupEyebrow', message: 'Meet-up' })}
            </Text>
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({
                id: 'liveMap.panel.noMeetupLine',
                message: 'Pick a place and the crew sees who is close.',
              })}
            </Text>
          </Stack>
          <PillButton
            label={t({ id: 'liveMap.panel.setMeetup', message: 'Set a meet-up' })}
            size="sm"
            onPress={props.onCreate}
            testID="live-set-meetup"
          />
        </Row>
      ) : (
        <Row style={styles.head}>
          <Stack gap="2" style={styles.headText}>
            <Text variant="eyebrow" color={tokens.color.yellow}>
              {t({ id: 'liveMap.panel.meetupEyebrow', message: `Meet-up · ${meetup.time}` })}
            </Text>
            <Text variant="h3" numberOfLines={1} style={{ textTransform: 'uppercase' }}>
              {meetup.place}
            </Text>
            {meetup.pending ? (
              <View style={styles.pending} testID="live-meetup-pending">
                <Text variant="caption">
                  {t({ id: 'liveMap.panel.pending', message: 'Sends when you’re back online' })}
                </Text>
              </View>
            ) : null}
          </Stack>
          <PillButton
            label={t({ id: 'liveMap.panel.moveIt', message: 'Move it' })}
            variant="secondary"
            tone="ink"
            size="sm"
            onPress={props.onMove}
            testID="live-move-it"
          />
        </Row>
      )}
      <ScrollView style={styles.rows}>
        {props.rows.map((row) => {
          const mine = row.people.length === 1 && row.people[0]?.uid === props.myUid;
          return (
            <MemberRow
              key={row.key}
              row={row}
              mine={mine}
              locationOff={props.locationOff}
              onPause={mine ? props.onPause : undefined}
              onOpenSettings={props.onOpenSettings}
            />
          );
        })}
      </ScrollView>
      <PingActions offline={props.offline} pending={props.pinging} onPing={props.onPing} />
      {props.onLockScreen === null ? null : (
        <PressScale
          onPress={props.onLockScreen}
          accessibilityRole="button"
          accessibilityLabel={t({
            id: 'liveMap.panel.lockScreen',
            message: 'Put this on the lock screen',
          })}
          testID="live-lock-screen"
        >
          <Text variant="bodySm" style={{ textAlign: 'center' }}>
            {t({ id: 'liveMap.panel.lockScreen', message: 'Put this on the lock screen' })}
          </Text>
        </PressScale>
      )}
      {props.footer === null ? null : (
        <Text
          variant="caption"
          color={theme.semantic.text.secondary}
          style={{ textAlign: 'center' }}
        >
          {props.footer}
        </Text>
      )}
    </View>
  );
}
