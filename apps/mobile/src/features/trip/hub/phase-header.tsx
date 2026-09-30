/**
 * The hub's header (3k-1): "OCT 12–19 · 6 GOING", the destination wordmark in the guide's colour,
 * and the phase's right-hand line: a 1 Hz countdown before the trip ("Wheels up in 17D 05:26:29")
 * or on a travel day ("Land in"), "Day 4 of 8" during it, "Home since Oct 19" after, or the
 * planning CTA while the trip is still being planned. Behind the wordmark and countdown, the
 * destination's photo as a duotone in the guide's colour under the dark halftone, fading into the
 * dark scaffold.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
import type { MediaAsset } from '@cp/domain';
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { MediaLayer } from '@/ui/media/MediaLayer';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { Halftone } from '@/ui/textures/halftone';
import { makeStyles } from '@/ui/theme';

import { tripDates } from './hub-copy';
import { countdownClock, type HubHeader } from './hub-model';

export interface PhaseHeaderProps {
  readonly header: HubHeader;
  readonly now: Date;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly going: number;
  readonly destination: string;
  readonly colour: string;
  /** The destination photo under the header band; null keeps the plain dark header. */
  readonly media?: MediaAsset | null;
  readonly mediaLowData?: boolean;
  readonly planning: { readonly label: string; readonly onPress: () => void } | null;
  /** The next item (in the trip) or the flight (travel day) under the header. */
  readonly below?: ReactNode;
}

const useStyles = makeStyles((th) => ({
  // Full-bleed behind the header: out to the screen edges and a little past the text.
  band: {
    position: 'absolute',
    top: -th.space['12'],
    bottom: -th.space['12'],
    start: -th.size.gutter,
    end: -th.size.gutter,
  },
}));

function day(locale: string, date: string, options: Intl.DateTimeFormatOptions): string {
  return format.date(locale, new Date(`${date}T12:00:00Z`), { timeZone: 'UTC', ...options });
}

export function PhaseHeader(props: PhaseHeaderProps) {
  const locale = useLocale();
  const { t } = useLingui();
  const styles = useStyles();
  const { header } = props;
  const dates = props.startDate === null ? null : tripDates(locale, props.startDate, props.endDate);
  const count = props.going;
  const going = t({ id: 'trip.hub.going', message: `${count} going` });
  const meta = [dates, going].filter(Boolean).join(' · ');
  const dayUnit = t({ id: 'trip.hub.dayUnit', message: 'D' });
  let label: string | null = null;
  let value: string | null = null;
  if (header.phase === 'pre' || header.phase === 'travel') {
    label =
      header.phase === 'pre'
        ? t({ id: 'trip.hub.wheelsUp', message: 'Wheels up in' })
        : header.target.getTime() === header.flight.departsAt.getTime()
          ? t({ id: 'trip.hub.takeOff', message: 'Take off in' })
          : t({ id: 'trip.hub.landIn', message: 'Land in' });
    value = countdownClock(header.target.getTime() - props.now.getTime(), dayUnit);
  } else if (header.phase === 'in') {
    label = t({ id: 'trip.hub.today', message: 'Today' });
    const { day: dayNo, days } = header;
    value = t({ id: 'trip.hub.dayOf', message: `Day ${dayNo} of ${days}` });
  } else if (header.phase === 'post') {
    label = t({ id: 'trip.hub.homeSince', message: 'Home since' });
    value = day(locale, header.homeSince, { month: 'short', day: 'numeric' });
  }
  return (
    <Stack gap="12" testID={`trip-hub-header-${header.phase}`}>
      <Stack gap="12">
        <View style={styles.band} pointerEvents="none">
          <MediaLayer
            media={props.media}
            surface="dark"
            accent={props.colour}
            motion="loop"
            lowData={props.mediaLowData ?? false}
            creditAt="top"
            testID="trip-hub-hero-media"
          />
          {props.media ? <Halftone variant="dark" /> : null}
        </View>
        <Text variant="eyebrow">{upper(meta, locale)}</Text>
        <Row justify="space-between" align="flex-end" gap="12">
          <View style={{ flex: 1 }}>
            <Text variant="displayHero" autoFit color={props.colour}>
              {upper(props.destination, locale)}
            </Text>
          </View>
          {label !== null && value !== null ? (
            <Stack
              align="flex-end"
              gap="2"
              accessible
              accessibilityRole="timer"
              accessibilityLabel={`${label} ${value}`}
            >
              <Text variant="eyebrow">{upper(label, locale)}</Text>
              <Text
                variant="h3"
                style={{ fontVariant: ['tabular-nums'] }}
                testID="trip-hub-countdown"
              >
                {upper(value, locale)}
              </Text>
            </Stack>
          ) : null}
        </Row>
        {header.phase === 'planning' && props.planning !== null ? (
          <PillButton
            label={props.planning.label}
            tone="yellow"
            onPress={props.planning.onPress}
            testID="trip-hub-planning-cta"
          />
        ) : null}
      </Stack>
      {props.below}
    </Stack>
  );
}
