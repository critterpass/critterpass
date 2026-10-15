/** The GO card's smaller pieces: the minutes labels, the line about what is missing, Grab's row. */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button, Text, usePremiumTheme } from '@/ui/premium';

import { compactFareRange, durationParts } from '../go-format';
import type { GrabRow, ModeMinutes, PreviewState } from '../preview-model';

export function useMinutesLabel(): (minutes: ModeMinutes) => string {
  const { t } = useLingui();
  return ({ minutes, approx }) => {
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

/** One line about what the preview lacks, or null when the road route is on the map. */
export function useStatusNote(status: PreviewState['status']): string | null {
  const { t } = useLingui();
  switch (status) {
    case 'locating':
      return t({ id: 'go.preview.locating', message: 'Finding where you are…' });
    case 'routing':
      return t({ id: 'go.preview.routing', message: 'Getting the route…' });
    case 'routed':
      return null;
    case 'straight':
      return t({
        id: 'go.preview.straight',
        message: 'No road route right now. Times are straight-line estimates.',
      });
    case 'no_location':
      return t({
        id: 'go.preview.noLocation',
        message: 'Location is off, so there’s no line from you. Start still gives directions.',
      });
    case 'no_fix':
      return t({
        id: 'go.preview.noFix',
        message: 'Can’t find where you are yet. The route shows up as soon as your phone does.',
      });
    case 'offline':
      return t({
        id: 'go.preview.offline',
        message: 'No signal, so no route line. Start still gives directions.',
      });
  }
}

export function GoGrabRow({
  grab,
  onRide,
}: {
  readonly grab: GrabRow;
  readonly onRide: () => void;
}) {
  const th = usePremiumTheme();
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
    <View style={[styles.row, { gap: th.space.gap12 }]} testID={`go-grab-${grab.kind}`}>
      <View style={[styles.text, { gap: th.space.gap4 }]}>
        <Text variant="rowTitle">{title}</Text>
        <Text variant="caption" tone="muted" singleLine={false}>
          {detail}
        </Text>
      </View>
      <Button
        alignSelf="auto"
        label={t({ id: 'go.preview.ride', message: 'Ride' })}
        size="medium"
        variant="secondary"
        onPress={onRide}
        testID="go-ride"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1 },
});
