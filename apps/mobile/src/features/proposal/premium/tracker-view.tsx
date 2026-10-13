/**
 * Who's in (4.51): the deadline or "Rooms held" chip, "Who's in?", the counts as stat tiles (in,
 * maybe, no reply, out), every member with their status tag, the guide's nudges, whoever waits
 * for a seat, the locked-in card once confirmed, and Lock it in for the organiser. Reads and
 * commands are the shared `TrackerScreen`'s.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { crewColour } from '@/features/vote';
import {
  Button,
  CrewStack,
  ListCard,
  PressableScale,
  StatusTag,
  Text,
  usePremiumTheme,
  type StatusTone,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { PublicStatus } from '../tracker/model';
import type { TrackerViewProps } from '../tracker/tracker-screen';

export function PremiumTrackerView(props: TrackerViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const { tally } = props;
  const tag = (status: PublicStatus): { tone: StatusTone; label: string } => {
    switch (status) {
      case 'organiser':
        return {
          tone: 'unopened',
          label: t({ id: 'proposal.tracker.organiser', message: 'Organiser' }),
        };
      case 'in':
        return { tone: 'booked', label: t({ id: 'proposal.premium.in', message: 'In' }) };
      case 'maybe':
        return { tone: 'maybe', label: t({ id: 'proposal.premium.maybe', message: 'Maybe' }) };
      case 'out':
        return { tone: 'unopened', label: t({ id: 'proposal.tracker.outChip', message: 'Out' }) };
      case 'waitlisted':
        return { tone: 'rain', label: t({ id: 'proposal.tracker.waitChip', message: 'Waitlist' }) };
      case 'no_reply':
        return {
          tone: 'unopened',
          label: t({ id: 'proposal.tracker.noReplyChip', message: 'No reply yet' }),
        };
    }
  };
  const tiles = [
    { key: 'in', value: tally.in, label: t({ id: 'proposal.premium.tileIn', message: 'in' }) },
    {
      key: 'maybe',
      value: tally.maybe,
      label: t({ id: 'proposal.premium.tileMaybe', message: 'maybe' }),
    },
    {
      key: 'noReply',
      value: tally.noReply,
      label: t({ id: 'proposal.premium.tileNoReply', message: 'no reply' }),
    },
  ];
  return (
    <PushScreen
      title={t({ id: 'proposal.tracker.title', message: 'Who’s in?' })}
      {...(props.chip === null ? {} : { subtitle: props.chip })}
      backLabel={props.back}
      scroll={false}
      testID="proposal-tracker"
    >
      <ScrollView contentContainerStyle={{ padding: theme.space.gap16, gap: theme.space.gap12 }}>
        <View style={{ flexDirection: 'row', gap: theme.space.gap8 }}>
          {tiles.map((tile) => (
            <View
              key={tile.key}
              style={{
                flex: 1,
                borderRadius: theme.radius.statTile,
                backgroundColor: theme.color.card,
                paddingVertical: theme.space.gap10,
                paddingHorizontal: theme.space.gap12,
              }}
            >
              <Text variant="stat" tone={tile.value === 0 ? 'placeholder' : 'ink'}>
                {String(tile.value)}
              </Text>
              <Text variant="captionMuted" tone="muted">
                {tile.label}
              </Text>
            </View>
          ))}
        </View>
        <ListCard>
          {props.rows.map((row) => {
            const look = tag(row.status);
            return (
              <PressableScale
                key={row.uid}
                onPress={row.onPress}
                disabled={row.onPress === undefined}
                accessibilityRole={row.onPress === undefined ? 'text' : 'button'}
                testID={`tracker-row-${row.uid}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.gap12,
                  paddingVertical: 9,
                  paddingHorizontal: theme.space.rowPadH,
                }}
              >
                <CrewStack
                  members={[{ id: row.uid, name: row.name, color: crewColour(row.joinIndex) }]}
                  size={32}
                  accessibilityLabel={row.name}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="rowTextStrong">{row.name}</Text>
                  <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                    {row.line}
                  </Text>
                </View>
                <StatusTag tone={look.tone} label={look.label} />
              </PressableScale>
            );
          })}
        </ListCard>
        {props.suggestions}
        {props.waiting ?? null}
        {props.confirmed ?? null}
      </ScrollView>
      {props.lockLabel === null && props.lockNote === null ? null : (
        <View
          style={{
            paddingHorizontal: theme.space.titleGutter,
            paddingBottom: insets.bottom + theme.space.gap12,
            gap: theme.space.gap4,
          }}
        >
          {props.lockNote === null ? null : (
            <Text variant="caption" tone="muted" align="center">
              {props.lockNote}
            </Text>
          )}
          {props.lockLabel === null ? null : (
            <Button
              label={props.lockLabel}
              onPress={props.onLock}
              loading={props.locking}
              testID="tracker-lock"
            />
          )}
        </View>
      )}
    </PushScreen>
  );
}
