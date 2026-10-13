/**
 * GO from props, on the premium kit: the map with you, the place and the route, the glass back over
 * it, and a card at the foot with the place, the walk / drive control with their minutes, one line
 * about what is missing (signal, location off, no fix yet with a way to try again, no road route),
 * Grab's fare or the estimate from its published rates when Grab runs there, and Start (directions
 * in the maps app). The lab scenes render it with fixed states.
 */
import { useLingui } from '@lingui/react/macro';
import type { Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { goBackOr } from '@/lib/navigation/back';
import {
  Button,
  GlassIconButton,
  SegmentedControl,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { GoMode, GoPoint, MapsApp } from '../maps-handoff';
import type { PreviewState } from '../preview-model';
import { GoGrabRow, useMinutesLabel, useStatusNote } from './go-card-parts';
import { GoRouteMap } from './go-route-map';

/** Enough lines for the longest place name we hold, so it is never cut. */
const NAME_LINES = 6;

export interface GoPremiumViewProps {
  readonly place: GoPoint & { readonly name: string };
  readonly destinationSlug: string | null;
  readonly state: PreviewState;
  readonly mode: GoMode;
  readonly onMode: (mode: GoMode) => void;
  readonly mapsApp: MapsApp;
  readonly onStart: () => void;
  /** Where back lands when GO was opened cold (a push, a link): the trip's day; Home without one. */
  readonly backFallback?: Href | undefined;
  readonly onRide: () => void;
  /** Looks for the phone's position again (offered when location is on and no fix came). */
  readonly onRetry?: (() => void) | undefined;
}

export function GoPremiumView(props: GoPremiumViewProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const minutesLabel = useMinutesLabel();
  const line = useStatusNote(props.state.status);
  const [cardHeight, setCardHeight] = useState(0);
  const { state } = props;
  const walk = t({ id: 'go.preview.walk', message: 'Walk' });
  const drive = t({ id: 'go.preview.drive', message: 'Drive' });
  const back = t({ id: 'go.preview.back', message: 'Back' });
  return (
    <PushScreen
      title={props.place.name}
      backLabel={back}
      headerless
      leading="none"
      scroll={false}
      testID={`go-preview-${state.status}`}
    >
      <View style={[styles.fill, { backgroundColor: th.color.ground }]}>
        <GoRouteMap
          place={{ lat: props.place.lat, lng: props.place.lng, label: props.place.name }}
          you={state.you}
          line={state.line}
          lineStraight={state.lineStraight}
          destinationSlug={props.destinationSlug}
          bottomInset={cardHeight}
        />
      </View>
      <View
        pointerEvents="box-none"
        style={[styles.top, { top: insets.top + th.space.gap6, left: th.space.gutter }]}
      >
        <GlassIconButton
          icon="back"
          label={back}
          kind="clear"
          onPress={() => goBackOr(props.backFallback)}
          testID="go-back"
        />
      </View>
      <View
        onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
        style={[
          styles.foot,
          { padding: th.space.gutter, paddingBottom: insets.bottom + th.space.gap16 },
        ]}
      >
        <View
          testID="go-card"
          style={[
            styles.card,
            {
              borderRadius: th.radius.cardRow,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.float,
              gap: th.space.gap14,
            },
          ]}
        >
          {/* The whole name, however long: it is where she is going. */}
          <Text
            variant="title"
            numberOfLines={NAME_LINES}
            singleLine={false}
            testID="go-place-name"
          >
            {props.place.name}
          </Text>
          <SegmentedControl
            options={[
              {
                value: 'walk',
                label:
                  state.minutes === null ? walk : `${walk} · ${minutesLabel(state.minutes.walk)}`,
              },
              {
                value: 'drive',
                label:
                  state.minutes === null
                    ? drive
                    : `${drive} · ${minutesLabel(state.minutes.drive)}`,
              },
            ]}
            value={props.mode}
            onChange={props.onMode}
            accessibilityLabel={t({ id: 'go.preview.modeLabel', message: 'How you go' })}
            testID="go-mode"
          />
          {line === null ? null : (
            <Text variant="note" tone="muted" singleLine={false} testID="go-note">
              {line}
            </Text>
          )}
          {state.status === 'no_fix' && props.onRetry !== undefined ? (
            <TextButton
              label={t({ id: 'go.preview.retryLocate', message: 'Try again' })}
              onPress={props.onRetry}
              testID="go-retry"
            />
          ) : null}
          {state.grab === null ? null : <GoGrabRow grab={state.grab} onRide={props.onRide} />}
          <Button
            label={
              props.mapsApp === 'apple'
                ? t({ id: 'go.preview.startApple', message: 'Start in Apple Maps' })
                : t({ id: 'go.preview.startGoogle', message: 'Start in Google Maps' })
            }
            icon="pin"
            onPress={props.onStart}
            testID="go-start"
          />
        </View>
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: 'absolute' },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  card: { padding: 16 },
});
