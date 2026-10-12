/** Getting around's cards (5.24): the ride and its fares, the driver's phrase card, later legs. */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Button, Skeleton, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import type { GettingAroundViewProps } from '../../getting-around/GettingAroundView';

type Ride = NonNullable<GettingAroundViewProps['ride']>;

export function PhraseCard(props: {
  readonly phrase: string;
  readonly gloss: string;
  readonly eyebrow: string;
}) {
  const th = usePremiumTheme();
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
      testID="getting-around-phrase"
    >
      <Text variant="label" tone="muted">
        {props.eyebrow}
      </Text>
      <Text variant="title">{props.phrase}</Text>
      <Text variant="rowText" tone="muted" style={styles.italic}>
        {props.gloss}
      </Text>
    </View>
  );
}

export function RideCard({ ride }: { readonly ride: Ride }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
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
      testID="getting-around-ride"
    >
      <Text variant="headline">{ride.title}</Text>
      {ride.detail == null ? null : (
        <Text variant="caption" tone="muted">
          {ride.detail}
        </Text>
      )}
      {ride.state === 'loading' ? <Skeleton height={44} radius={th.radius.field} /> : null}
      {(ride.fares ?? []).map((fare) => (
        <View key={fare.key} style={styles.fare}>
          <View style={styles.flex}>
            <Text variant="rowTextStrong">{fare.label}</Text>
            <Text variant="captionMuted" tone="muted">
              {[fare.line, fare.crew, ...fare.extras].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <TextButton
            label={t({ id: 'suppliers.rides.whyEstimate', message: 'Why this estimate' })}
            onPress={fare.onWhy}
            testID={`getting-around-why-${fare.key}`}
          />
        </View>
      ))}
      <View style={styles.apps}>
        {ride.apps.map((app) => (
          <Button
            key={app.key}
            label={app.label}
            size="medium"
            variant={app === ride.apps[0] ? 'primary' : 'control'}
            onPress={app.onPress}
            testID={`getting-around-app-${app.key}`}
          />
        ))}
      </View>
    </View>
  );
}

export function LaterLegs({ later }: { readonly later: GettingAroundViewProps['later'] }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  if (later.length === 0) return null;
  return (
    <View style={{ gap: th.space.gap8 }}>
      <Text variant="label" tone="muted">
        {t({ id: 'suppliers.later.title', message: 'Later today' })}
      </Text>
      {later.map((leg) => (
        <View
          key={leg.key}
          style={[
            styles.row,
            styles.card,
            {
              borderRadius: th.radius.banner,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
            },
          ]}
          testID={leg.testID}
        >
          <View style={styles.flex}>
            <Text variant="rowTitle">{`${leg.from} → ${leg.to}`}</Text>
            {leg.detail === null ? null : (
              <Text variant="captionMuted" tone="muted">
                {leg.detail}
              </Text>
            )}
          </View>
          {leg.openLabel === null ? null : (
            <Button
              label={leg.openLabel}
              size="small"
              loading={leg.opening === true}
              onPress={leg.onOpen}
            />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  fare: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  apps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  italic: { fontStyle: 'italic' },
});
