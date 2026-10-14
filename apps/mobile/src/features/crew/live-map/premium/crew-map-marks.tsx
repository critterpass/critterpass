/**
 * What the crew map draws over its map (6.10–6.13): each sharing crewmate as their avatar (a bunch
 * as a stack), the meet-up as the ink flag and you as a sky dot; and before trip days the sleeping
 * card the map rests under.
 */
import { Marker } from '@maplibre/maplibre-react-native';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { StayFlag } from '@/features/plan';
import { crewAccent, guideCritterKind } from '@/features/trip';
import { Avatar, CritterSticker, CrewStack, ring, Text, usePremiumTheme } from '@/ui/premium';

import type { LiveMapModel } from '../model';

export function Pins({ m }: { readonly m: LiveMapModel }) {
  const th = usePremiumTheme();
  const pins = m.view?.pins ?? [];
  return (
    <>
      {pins.map((pin) => {
        if (pin.kind === 'bunch') {
          return (
            <Marker
              key={pin.people.map((p) => p.uid).join('-')}
              lngLat={[pin.lng, pin.lat]}
              anchor="bottom"
            >
              <CrewStack
                members={pin.people.map((p) => ({
                  id: p.uid,
                  name: p.name,
                  color: crewAccent(p.joinIndex),
                }))}
                size={30}
                accessibilityLabel={pin.people.map((p) => p.name).join(', ')}
              />
            </Marker>
          );
        }
        const { person } = pin;
        if (person.position === null || person.isMe) return null;
        return (
          <Marker
            key={person.uid}
            lngLat={[person.position.lng, person.position.lat]}
            anchor="bottom"
          >
            <View
              style={[
                styles.pin,
                person.stale ? styles.stale : null,
                { boxShadow: th.shadow.sticker },
              ]}
            >
              <Avatar
                name={person.name}
                color={crewAccent(person.joinIndex)}
                uid={person.uid}
                size={34}
                ringed
              />
            </View>
          </Marker>
        );
      })}
      {m.meetup === null ? null : (
        <StayFlag
          lngLat={[m.meetup.lng, m.meetup.lat]}
          label={m.meetupTime}
          accessibilityLabel={m.meetup.place_name}
        />
      )}
      {m.ownFix === null || (m.view?.me?.sharing ?? 'off') === 'off' ? null : (
        <Marker lngLat={[m.ownFix.lng, m.ownFix.lat]} anchor="center">
          <View
            style={[
              styles.you,
              { backgroundColor: th.accent.sky, boxShadow: ring(3, th.accent.paper) },
            ]}
          />
        </Marker>
      )}
    </>
  );
}

export function Sleeping({ m }: { readonly m: LiveMapModel }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const title = m.windowEnded
    ? t({ id: 'liveMap.gate.endedTitle', message: 'Trip days are over' })
    : m.windowStartsAt === null
      ? t({ id: 'liveMap.gate.notStartedTitle', message: 'Not a trip day yet' })
      : t({ id: 'liveMap.premium.wakesUp', message: 'The map wakes up on your first trip day' });
  return (
    <View
      style={[
        styles.sleep,
        { borderRadius: 30, backgroundColor: th.color.card, boxShadow: th.shadow.card },
      ]}
      testID="live-map-gate"
    >
      <CritterSticker
        kind={guideCritterKind(null)}
        name={t({ id: 'liveMap.premium.guideName', message: 'Tokek' })}
        size={96}
        pose="sleep"
      />
      <Text variant="title" align="center">
        {title}
      </Text>
      <Text variant="rowText" tone="inkSecondary" align="center">
        {m.windowEnded
          ? t({ id: 'liveMap.gate.endedLine', message: 'Sharing switched itself off at midnight.' })
          : t({
              id: 'liveMap.gate.notStartedLine',
              message: 'Sharing opens on your first trip day.',
            })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: { borderRadius: 17 },
  stale: { opacity: 0.55 },
  you: { width: 16, height: 16, borderRadius: 8 },
  sleep: { alignItems: 'center', gap: 10, padding: 20 },
});
