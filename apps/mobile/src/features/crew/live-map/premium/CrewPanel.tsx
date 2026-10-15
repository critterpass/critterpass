/**
 * The crew map's panel (6.10–6.12): the meet-up card (where, when, a lane with everyone's avatar
 * at their ETA and the flag at the end), one row per person with their status and time (paused or
 * stale ones fade), then "Ping all" and "I'm on my way". Before you share, it asks (6.11); offline
 * the rows say "last seen" and the buttons wait (6.12).
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import {
  Avatar,
  Button,
  CrewStack,
  Icon,
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
  const me = m.view?.me ?? null;
  const crewName = m.crewName;
  const meSharing = me?.sharing ?? 'off';
  // "Not now" puts the question away until the map opens again.
  const [primerHidden, setPrimerHidden] = useState(false);
  const asking = meSharing === 'off' && m.gate === 'open' && !primerHidden;
  const actionSize = m.offline ? ({ size: 'medium', alignSelf: 'stretch' } as const) : {};
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: th.color.ground, gap: th.space.gap10, paddingBottom: 12 + bottomInset },
      ]}
      testID="live-map-panel"
    >
      <View style={[styles.grabber, { backgroundColor: th.color.outlineEmpty }]} />
      {asking ? (
        <View
          style={[
            styles.card,
            {
              borderRadius: th.radius.cardRow,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
              gap: th.space.gap12,
            },
          ]}
          testID="live-map-primer"
        >
          <View style={styles.primerTop}>
            {me === null ? null : (
              <View>
                <Avatar name={me.name} color={crewAccent(me.joinIndex)} uid={me.uid} size={44} />
                <View style={[styles.eye, { backgroundColor: th.color.card }]}>
                  <Icon name="lock" size={11} color={th.color.inkSecondary} />
                </View>
              </View>
            )}
            <View style={[styles.flex, { gap: th.space.gap4 }]}>
              <Text variant="headline">
                {t({ id: 'liveMap.primer.title', message: 'Share where you are with the crew?' })}
              </Text>
              <Text variant="rowText" tone="inkSecondary">
                {t({
                  id: 'liveMap.premium.primerLine',
                  message: `Only during trip days, only ${crewName}. Pause any time from your row.`,
                })}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <View style={styles.wide}>
              <Button
                label={t({ id: 'liveMap.premium.shareTripDays', message: 'Share on trip days' })}
                size="medium"
                alignSelf="stretch"
                onPress={m.turnOn}
                testID="live-map-share"
              />
            </View>
            <Button
              label={t({ id: 'liveMap.primer.notNow', message: 'Not now' })}
              variant="secondary"
              size="medium"
              onPress={() => setPrimerHidden(true)}
              testID="live-map-not-now"
            />
          </View>
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
      {/* While it asks you to share, the card's own two choices are the panel's only actions. */}
      {asking ? null : (
        <View style={styles.actions}>
          {/* Offline both wait (6.12): the two drop to the smaller pill and share the row in
            halves, the queued ping with its clock, so "Ping all · queued" stays on one line. */}
          <View style={m.offline ? styles.half : styles.flex}>
            <Button
              label={
                m.offline
                  ? t({ id: 'liveMap.premium.pingQueued', message: 'Ping all · queued' })
                  : t({ id: 'liveMap.actions.pingAll', message: 'Ping all' })
              }
              variant="secondary"
              {...actionSize}
              {...(m.offline ? { icon: 'clock' as const } : {})}
              disabled={m.offline || m.pinging}
              onPress={() => m.ping('ping')}
              testID="live-map-ping"
            />
          </View>
          <View style={m.offline ? styles.half : styles.wide}>
            <Button
              label={t({ id: 'liveMap.actions.onMyWay', message: 'I’m on my way' })}
              {...actionSize}
              disabled={m.offline || m.pinging}
              // eslint-disable-next-line lingui/no-unlocalized-strings -- a ping kind, not copy
              onPress={() => m.ping('on_my_way')}
              testID="live-map-on-my-way"
            />
          </View>
        </View>
      )}
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
  half: { flex: 1, minWidth: 0 },
  primerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eye: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: { fontVariant: ['tabular-nums'] },
  lane: { height: 34, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 2 },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 4 },
});
