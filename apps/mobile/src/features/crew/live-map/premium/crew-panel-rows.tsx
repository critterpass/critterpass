/**
 * The crew map panel's people (6.10–6.12): one card per person with their status and arrival time
 * while live (paused or stale ones fade); offline, "Last seen" with when it updates and the people
 * on one grouped card, as the last places the phone heard of. A row with no time shows none.
 */
import { useLingui } from '@lingui/react/macro';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import { Avatar, Button, Text, usePremiumTheme } from '@/ui/premium';

import type { LiveMapModel } from '../model';
import type { RowModel } from '../panel/view-types';

import type { Sharing } from '../data/view-model';

function MemberRow({
  m,
  row,
  meSharing,
  grouped,
}: {
  readonly m: LiveMapModel;
  readonly row: RowModel;
  readonly meSharing: Sharing;
  readonly grouped: boolean;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const person = row.people[0];
  const mine = person?.isMe === true;
  const faded = person !== undefined && (person.sharing === 'paused' || person.stale);
  return (
    <View
      accessible
      accessibilityLabel={row.spoken}
      style={[
        styles.member,
        grouped
          ? null
          : {
              borderRadius: th.radius.field,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.float,
            },
        faded ? styles.faded : null,
      ]}
      testID={`live-map-row-${row.key}`}
    >
      <View style={styles.faces}>
        {row.people.slice(0, 2).map((p, index) => (
          <View key={p.uid} style={index === 0 ? null : styles.overlap}>
            <Avatar name={p.name} color={crewAccent(p.joinIndex)} uid={p.uid} size={30} ringed />
          </View>
        ))}
      </View>
      <View style={styles.flex}>
        <Text variant="rowTitle" numberOfLines={1}>
          {row.title}
        </Text>
        <Text variant="captionMuted" tone="muted" numberOfLines={1}>
          {row.status}
        </Text>
      </View>
      {mine && m.gate === 'open' && meSharing !== 'off' ? (
        <Button
          alignSelf="auto"
          label={
            meSharing === 'paused'
              ? t({ id: 'liveMap.premium.resume', message: 'Resume' })
              : t({ id: 'liveMap.premium.pause', message: 'Pause' })
          }
          size="small"
          variant={meSharing === 'paused' ? 'primary' : 'control'}
          onPress={m.togglePause}
          testID="live-map-pause"
        />
      ) : row.clock === null ? null : (
        <Text variant="rowTextStrong" style={styles.tabular}>
          {row.clock}
        </Text>
      )}
    </View>
  );
}

export function MemberRows({
  m,
  meSharing,
}: {
  readonly m: LiveMapModel;
  readonly meSharing: Sharing;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  if (!m.offline) {
    return (
      <View style={{ gap: th.space.gap8 }}>
        {m.rows.map((row) => (
          <MemberRow key={row.key} m={m} row={row} meSharing={meSharing} grouped={false} />
        ))}
      </View>
    );
  }
  return (
    <View style={{ gap: th.space.gap8 }}>
      <View style={styles.head}>
        <Text variant="headline" testID="live-map-last-seen">
          {t({ id: 'liveMap.premium.lastSeen', message: 'Last seen' })}
        </Text>
        <Text variant="captionMuted" tone="muted" numberOfLines={1} style={styles.shrink}>
          {t({ id: 'liveMap.premium.updatesBack', message: 'Updates when you’re back' })}
        </Text>
      </View>
      <View
        style={{
          borderRadius: th.radius.card,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
          overflow: 'hidden',
        }}
      >
        {m.rows.map((row, index) => (
          <Fragment key={row.key}>
            {index === 0 ? null : (
              <View
                style={[
                  styles.hairline,
                  { height: th.size.hairline, backgroundColor: th.color.hairline },
                ]}
              />
            )}
            <MemberRow m={m} row={row} meSharing={meSharing} grouped />
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingLeft: 10,
    paddingRight: 14,
  },
  faces: { flexDirection: 'row', width: 44 },
  overlap: { marginLeft: -16 },
  faded: { opacity: 0.55 },
  flex: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  shrink: { flexShrink: 1 },
  hairline: { marginLeft: 64 },
});
