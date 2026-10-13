/**
 * The day page's two cards (6.04): who is up for the leave-by (the not-up wear a dashed ring) with
 * "I'm up", and the day's stops (what is over fades, what is on now is green).
 */
import { useLingui } from '@lingui/react/macro';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { Avatar, Button, PressableScale, ring, Text, usePremiumTheme } from '@/ui/premium';

import { heroCopy } from '../../day-of/day-of-copy';
import { clockIn, type LeaveByView } from '../../leave-by/model';
import type { DayOfProps } from '../../day-of/use-day-of';

export interface ReadinessProps {
  readonly view: LeaveByView;
  readonly now: Date;
  readonly guideName: string;
  readonly onImUp: () => void;
}

/** Memoised: the day page re-renders on every queued row, the card only when its own rows change. */
export const Readiness = memo(function Readiness({ view, now, guideName, onImUp }: ReadinessProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const copy = heroCopy(view, now, guideName, locale);
  // With no pickup, guide note or traffic caveat to say, the card still leads with what the
  // leave-by is for, so it never opens on the faces alone.
  const what = view.title ?? view.placeName;
  const start = clockIn(view.startsAt, view.tz, locale);
  const instructions =
    copy.instructions ??
    (what === null
      ? null
      : t({ id: 'trip.dayOf.premium.startsAt', message: `${what} starts at ${start}.` }));
  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: th.radius.cardRow,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
      testID={`trip-day-hero-${view.phase}`}
    >
      {instructions === null ? null : (
        <Text variant="body" style={styles.instructions} testID="trip-day-instructions">
          {instructions}
        </Text>
      )}
      <View
        style={[
          styles.ready,
          instructions === null ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
        ]}
      >
        <View style={styles.stack}>
          {view.crew.map((person, index) => (
            <View
              key={person.id}
              style={[
                styles.face,
                index === 0 ? null : styles.overlap,
                person.up
                  ? null
                  : { borderRadius: 14, boxShadow: ring(2, th.color.outlineEmpty, true) },
              ]}
            >
              <View style={person.up ? null : styles.asleep}>
                <Avatar name={person.name} color={crewAccent(person.joinIndex)} size={28} ringed />
              </View>
            </View>
          ))}
        </View>
        <View style={styles.flex}>
          <Text variant="rowTextStrong">{copy.readinessLabel}</Text>
          {copy.readinessDetail === null ? null : (
            <Text variant="captionMuted" tone="muted">
              {copy.readinessDetail}
            </Text>
          )}
        </View>
      </View>
      {view.viewerIn && !view.viewerUp ? (
        <Button
          label={t({ id: 'trip.dayOf.imUp', message: "I'm up" })}
          size="medium"
          onPress={onImUp}
          testID="trip-day-im-up"
        />
      ) : null}
      {view.viewerIn ? null : (
        <Text variant="caption" tone="muted">
          {t({ id: 'trip.dayOf.notYours', message: "You're not on this one. Sleep in." })}
        </Text>
      )}
    </View>
  );
});

export const Stops = memo(function Stops({
  timeline,
}: {
  readonly timeline: DayOfProps['timeline'];
}) {
  const th = usePremiumTheme();
  if (timeline.length === 0) return null;
  return (
    <View
      style={[
        styles.timeline,
        {
          marginHorizontal: th.space.gutter,
          borderRadius: th.radius.cardRow,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
      testID="trip-day-timeline"
    >
      {timeline.map((entry, index) => {
        const row = (
          <View
            style={[
              styles.stop,
              index === 0 ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
              entry.dimmed || entry.moment === 'done' ? styles.dim : null,
            ]}
          >
            <Text
              variant="rowTextStrong"
              style={[
                styles.time,
                entry.moment === 'now' ? { color: th.color.status.booked.text } : null,
              ]}
            >
              {entry.time}
            </Text>
            <View style={styles.flex}>
              <Text variant="rowTitle" numberOfLines={2}>
                {entry.title}
              </Text>
              {[entry.detail, entry.length, entry.legAfter].filter(Boolean).length === 0 ? null : (
                <Text variant="captionMuted" tone="muted" numberOfLines={2}>
                  {[entry.detail, entry.length, entry.legAfter].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
          </View>
        );
        return entry.onPress === undefined ? (
          <View key={entry.id} testID={`trip-day-stop-${entry.id}`}>
            {row}
          </View>
        ) : (
          <PressableScale
            key={entry.id}
            onPress={entry.onPress}
            accessibilityRole="button"
            testID={`trip-day-stop-${entry.id}`}
          >
            {row}
          </PressableScale>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  instructions: { lineHeight: 21 },
  ready: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  stack: { flexDirection: 'row' },
  face: {},
  overlap: { marginLeft: -8 },
  asleep: { opacity: 0.5 },
  flex: { flex: 1, minWidth: 0 },
  timeline: { paddingHorizontal: 16, paddingVertical: 4 },
  stop: { flexDirection: 'row', gap: 14, paddingVertical: 10 },
  time: { width: 48, fontVariant: ['tabular-nums'] },
  dim: { opacity: 0.5 },
});
