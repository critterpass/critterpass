/**
 * The crew map's panel (6.10–6.12): the meet-up card (where, when, a lane with everyone's avatar
 * at their ETA and the flag at the end), one row per person with their status and time (paused or
 * stale ones fade), then "Ping all" and "I'm on my way". Before you share, it asks (6.11); offline
 * the rows say "last seen" and the buttons wait (6.12).
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import {
  Button,
  CrewStack,
  PressableScale,
  StatusTag,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import type { LiveMapModel } from '../model';
import { MemberRows } from './crew-panel-rows';

function MeetupCard({ m }: { readonly m: LiveMapModel }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const meetup = m.meetup;
  const move = () =>
    m.setOverlay({ kind: 'editor', mode: meetup === null ? 'create' : 'move', dropped: null });
  if (meetup === null) {
    return (
      <View
        style={[
          styles.card,
          {
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <Text variant="label" tone="muted">
          {t({ id: 'liveMap.panel.noMeetupEyebrow', message: 'Meet-up' })}
        </Text>
        <Text variant="rowText">
          {t({
            id: 'liveMap.panel.noMeetupLine',
            message: 'Pick a place and the crew sees who is close.',
          })}
        </Text>
        <Button
          label={t({ id: 'liveMap.panel.setMeetup', message: 'Set a meet-up' })}
          size="medium"
          onPress={move}
          testID="live-map-set-meetup"
        />
      </View>
    );
  }
  const arrivals = (m.view?.people ?? []).filter((person) => person.eta !== null);
  return (
    <PressableScale
      onPress={move}
      pressedScale={0.99}
      accessibilityRole="button"
      testID="live-map-meetup"
    >
      <View
        style={[
          styles.card,
          {
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {t({ id: 'liveMap.premium.meetupAt', message: `Meet-up at ${meetup.place_name}` })}
            </Text>
            {m.endsOn === null ? null : (
              <Text variant="captionMuted" tone="placeholder">
                {t({
                  id: 'liveMap.premium.endsOn',
                  message: `Sharing ends ${m.endsOn} at midnight`,
                })}
              </Text>
            )}
          </View>
          <Text variant="stat" style={styles.tabular}>
            {m.meetupTime ?? ''}
          </Text>
        </View>
        {m.meetupPending ? (
          <StatusTag
            label={t({ id: 'liveMap.panel.pending', message: 'Sends when you’re back online' })}
            tone="maybe"
          />
        ) : null}
        {arrivals.length === 0 ? null : (
          <View style={styles.lane}>
            <View style={[styles.track, { backgroundColor: th.color.fieldBorder }]} />
            <CrewStack
              members={arrivals.map((person) => ({
                id: person.uid,
                name: person.name,
                color: crewAccent(person.joinIndex),
              }))}
              size={26}
              accessibilityLabel={t({ id: 'liveMap.premium.onTheWay', message: 'On the way' })}
            />
          </View>
        )}
      </View>
    </PressableScale>
  );
}

export function CrewPanel({
  m,
  bottomInset,
}: {
  readonly m: LiveMapModel;
  /** The home bar's height: the panel's ground runs under it, its buttons sit above it. */
  readonly bottomInset: number;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const meSharing = m.view?.me?.sharing ?? 'off';
  const actionSize = m.offline ? ({ size: 'medium', alignSelf: 'stretch' } as const) : {};
  const footer =
    m.endsOn === null
      ? ''
      : t({
          id: 'liveMap.panel.footer',
          message: `Sharing switches itself off on ${m.endsOn} at midnight.`,
        });
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: th.color.ground, gap: th.space.gap10, paddingBottom: 12 + bottomInset },
      ]}
      testID="live-map-panel"
    >
      <View style={[styles.grabber, { backgroundColor: th.color.outlineEmpty }]} />
      {meSharing === 'off' && m.gate === 'open' ? (
        <View
          style={[
            styles.card,
            {
              borderRadius: th.radius.cardRow,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
            },
          ]}
          testID="live-map-primer"
        >
          <Text variant="headline">
            {t({ id: 'liveMap.primer.title', message: 'Share where you are with the crew?' })}
          </Text>
          <Text variant="rowText" tone="inkSecondary">
            {footer === ''
              ? t({
                  id: 'liveMap.primer.line',
                  message: 'Only on trip days, only with this crew. Pause any time.',
                })
              : footer}
          </Text>
          <Button
            label={t({ id: 'liveMap.primer.action', message: 'Share my location' })}
            size="medium"
            onPress={m.turnOn}
            testID="live-map-share"
          />
        </View>
      ) : (
        <MeetupCard m={m} />
      )}
      <MemberRows m={m} meSharing={meSharing} />
      {m.locationOff ? (
        <TextButton
          label={t({ id: 'liveMap.premium.turnOnLocation', message: 'Turn on location' })}
          onPress={m.openSettings}
          testID="live-map-settings"
        />
      ) : null}
      <View style={styles.actions}>
        {/* Offline both wait (6.12): the two drop to the smaller pill and share the row, so
            "Ping all · queued" stays on one line. */}
        <View style={m.offline ? styles.wide : styles.flex}>
          <Button
            label={
              m.offline
                ? t({ id: 'liveMap.premium.pingQueued', message: 'Ping all · queued' })
                : t({ id: 'liveMap.actions.pingAll', message: 'Ping all' })
            }
            variant="secondary"
            {...actionSize}
            disabled={m.offline || m.pinging}
            onPress={() => m.ping('ping')}
            testID="live-map-ping"
          />
        </View>
        <View style={styles.wide}>
          <Button
            label={t({ id: 'liveMap.actions.onMyWay', message: "I'm on my way" })}
            {...actionSize}
            disabled={m.offline || m.pinging}
            // eslint-disable-next-line lingui/no-unlocalized-strings -- a ping kind, not copy
            onPress={() => m.ping('on_my_way')}
            testID="live-map-on-my-way"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3 },
  card: { padding: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  wide: { flex: 1.6 },
  tabular: { fontVariant: ['tabular-nums'] },
  lane: { height: 34, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 2 },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 4 },
});
