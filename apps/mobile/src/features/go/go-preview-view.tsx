/**
 * The GO preview from props: the map with you, the place and the route, and a card at the foot
 * with the walk / drive toggle and their minutes, one line about what is missing (signal,
 * location switched off, no fix yet with a way to try again, a road route), Grab's fare or the
 * estimate from its published rates when Grab runs there, and Start (directions in the maps
 * app) and Ride (Grab). Built from the map kit, the card and the buttons; the lab scenes render
 * it with fixed states.
 */
import { useLingui } from '@lingui/react/macro';
import type { Href } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { IconButton } from '@/ui/buttons/IconButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { StraightArrow } from '@/ui/icons/StraightArrow';
import { Card } from '@/ui/cards/Card';
import { Segmented } from '@/ui/inputs/Segmented';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { useBackAffordance } from '@/ui/qa/back-affordance';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { compactFareRange, durationParts } from './go-format';
import { GoMap } from './go-map';
import type { GoMode, GoPoint, MapsApp } from './maps-handoff';
import type { GrabRow, ModeMinutes, PreviewState } from './preview-model';

/** About the card's height, so the map frames the route above it. */
const CARD_INSET = 380;
/** Enough lines for the longest place name we hold, so it is never cut. */
const NAME_LINES = 6;

export interface GoPreviewViewProps {
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

const useStyles = makeStyles((t) => ({
  top: { position: 'absolute', top: 0, start: t.space['16'] },
  foot: { position: 'absolute', bottom: 0, start: 0, end: 0, paddingHorizontal: t.space['12'] },
}));

function useMinutesLabel() {
  const { t } = useLingui();
  return ({ minutes, approx }: ModeMinutes) => {
    const parts = durationParts(minutes);
    if (parts.kind === 'minutes') {
      const count = parts.minutes;
      return approx
        ? t({ id: 'go.preview.aboutMinutes', message: `about ${count} min` })
        : t({ id: 'go.preview.minutes', message: `${count} min` });
    }
    const { hours, rest } = parts;
    return approx
      ? t({ id: 'go.preview.aboutHours', message: `about ${hours}H${rest}` })
      : t({ id: 'go.preview.hours', message: `${hours}H${rest}` });
  };
}

function GrabLine({ grab, onRide }: { readonly grab: GrabRow; readonly onRide: () => void }) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  let title = t({ id: 'go.preview.grabHere', message: 'Grab runs here' });
  let detail = t({ id: 'go.preview.grabLink', message: 'Opens Grab with the drop-off filled in' });
  if (grab.kind !== 'link') {
    const fare = compactFareRange(grab, locale, {
      thousand: t({ id: 'go.preview.money.thousand', message: 'K' }),
      million: t({ id: 'go.preview.money.million', message: 'M' }),
      billion: t({ id: 'go.preview.money.billion', message: 'B' }),
    });
    if (grab.kind === 'fare') {
      const eta = grab.etaMin;
      title = t({ id: 'go.preview.grabFare', message: `Grab ${fare}` });
      detail = t({ id: 'go.preview.grabEta', message: `A car about ${eta} min away` });
    } else {
      title = t({ id: 'go.preview.grabEstimate', message: `Grab about ${fare}` });
      detail = t({
        id: 'go.preview.grabEstimateLine',
        message: 'An estimate from Grab’s published rates. Grab shows the real fare.',
      });
    }
  }
  return (
    <Row gap="12" align="center" testID={`go-grab-${grab.kind}`}>
      <Stack gap="2" style={{ flex: 1 }}>
        <Text variant="title">{title}</Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {detail}
        </Text>
      </Stack>
      <PillButton
        label={t({ id: 'go.preview.ride', message: 'Ride' })}
        size="sm"
        variant="secondary"
        onPress={onRide}
        testID="go-ride"
      />
    </Row>
  );
}

export function GoPreviewView(props: GoPreviewViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const minutesLabel = useMinutesLabel();
  const { state } = props;
  const walk = t({ id: 'go.preview.walk', message: 'Walk' });
  const drive = t({ id: 'go.preview.drive', message: 'Drive' });
  const segments = [
    {
      value: 'walk' as const,
      label: state.minutes === null ? walk : `${walk} · ${minutesLabel(state.minutes.walk)}`,
    },
    {
      value: 'drive' as const,
      label: state.minutes === null ? drive : `${drive} · ${minutesLabel(state.minutes.drive)}`,
    },
  ];
  const note: Readonly<Record<PreviewState['status'], string | null>> = {
    locating: t({ id: 'go.preview.locating', message: 'Finding where you are…' }),
    routing: t({ id: 'go.preview.routing', message: 'Getting the route…' }),
    routed: null,
    straight: t({
      id: 'go.preview.straight',
      message: 'No road route right now. Times are straight-line estimates.',
    }),
    no_location: t({
      id: 'go.preview.noLocation',
      message: 'Location is off, so there’s no line from you. Start still gives directions.',
    }),
    no_fix: t({
      id: 'go.preview.noFix',
      message: 'Can’t find where you are yet. The route shows up as soon as your phone does.',
    }),
    offline: t({
      id: 'go.preview.offline',
      message: 'No signal, so no route line. Start still gives directions.',
    }),
  };
  const line = note[state.status];
  // The round arrow over the map is this screen's way back.
  useBackAffordance();
  return (
    <Scaffold variant="dark" edges={[]} testID={`go-preview-${state.status}`}>
      <GoMap
        place={{ lat: props.place.lat, lng: props.place.lng, label: props.place.name }}
        you={state.you}
        line={state.line}
        lineStraight={state.lineStraight}
        destinationSlug={props.destinationSlug}
        bottomInset={CARD_INSET}
      />
      <View style={[styles.top, { paddingTop: insets.top + theme.space['8'] }]}>
        <IconButton
          label={t({ id: 'go.preview.back', message: 'Back' })}
          surface="onPhoto"
          glyph={<StraightArrow direction="back" color={theme.semantic.text.primary} />}
          onPress={() => goBackOr(props.backFallback)}
          testID="go-back"
        />
      </View>
      <View style={[styles.foot, { paddingBottom: insets.bottom + theme.space['12'] }]}>
        <Card testID="go-card">
          <Stack gap="16">
            <Stack gap="4">
              <Text variant="eyebrow">{t({ id: 'go.preview.eyebrow', message: 'GO' })}</Text>
              {/* The whole name, however long: it is where she is going. */}
              <Text
                variant="h2"
                numberOfLines={NAME_LINES}
                singleLine={false}
                testID="go-place-name"
              >
                {props.place.name}
              </Text>
            </Stack>
            <Segmented
              segments={segments}
              value={props.mode}
              onChange={props.onMode}
              label={t({ id: 'go.preview.modeLabel', message: 'How you go' })}
              testID="go-mode"
            />
            {line === null ? null : (
              <Text variant="bodySm" color={theme.semantic.text.secondary} testID="go-note">
                {line}
              </Text>
            )}
            {state.status === 'no_fix' && props.onRetry !== undefined ? (
              <TextLink
                label={t({ id: 'go.preview.retryLocate', message: 'Try again' })}
                onPress={props.onRetry}
                testID="go-retry"
              />
            ) : null}
            {state.grab === null ? null : <GrabLine grab={state.grab} onRide={props.onRide} />}
            <PillButton
              label={
                props.mapsApp === 'apple'
                  ? t({ id: 'go.preview.startApple', message: 'Start in Apple Maps' })
                  : t({ id: 'go.preview.startGoogle', message: 'Start in Google Maps' })
              }
              onPress={props.onStart}
              testID="go-start"
            />
          </Stack>
        </Card>
      </View>
    </Scaffold>
  );
}
