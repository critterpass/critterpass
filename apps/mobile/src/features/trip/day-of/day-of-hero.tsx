/**
 * The day's hero (3k-2): the leave-by with its draining ring and who is up, or, with no leave-by,
 * the day's first or next stop, a free day, or a day that is done. The destination's photo sits
 * behind it.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import { cardBackground } from '@/ui/cards/tone';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { MediaLayer } from '@/ui/media/MediaLayer';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import { LeaveByHero } from '@/ui/trip/LeaveByHero';

import { heroCopy } from './day-of-copy';
import type { DayOfViewProps } from './day-of-view';
import { ReadinessFaces } from './readiness-row';

const useStyles = makeStyles((th) => ({
  quiet: {
    borderTopStartRadius: 0,
    borderTopEndRadius: 0,
    borderBottomStartRadius: th.radius.heroBottom,
    borderBottomEndRadius: th.radius.heroBottom,
  },
}));

export function DayHero(props: DayOfViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const view = props.leaveBy;
  const lead = props.firstUp;
  const backdrop = (
    <MediaLayer
      media={props.heroMedia}
      surface="accent"
      accent={cardBackground(theme, 'pink')}
      lowData={props.mediaLowData ?? false}
      creditAt="top"
      testID="trip-day-hero-media"
    />
  );
  if (view === null) {
    return (
      <Card
        tone="pink"
        halftone={!props.heroMedia}
        style={styles.quiet}
        testID="trip-day-hero-quiet"
        backdrop={backdrop}
      >
        <Stack gap="10">
          <Row justify="space-between">
            <Text variant="eyebrow">{upper(props.eyebrow, locale)}</Text>
            {props.forecast === null ? null : (
              <Text variant="eyebrow">{upper(props.forecast, locale)}</Text>
            )}
          </Row>
          {lead === null ? (
            <Text variant="displayHero" autoFit>
              {upper(t({ id: 'trip.dayOf.freeDayTitle', message: 'Free day' }), locale)}
            </Text>
          ) : lead.kind === 'done' ? (
            <Text variant="displayHero" autoFit>
              {upper(t({ id: 'trip.dayOf.doneTitle', message: 'Day done' }), locale)}
            </Text>
          ) : (
            <>
              <Text variant="eyebrow">
                {upper(
                  lead.kind === 'next'
                    ? t({ id: 'trip.dayOf.nextUp', message: 'Next up' })
                    : t({ id: 'trip.dayOf.firstUp', message: 'First up' }),
                  locale,
                )}
              </Text>
              <Text variant="displayHero" autoFit>
                {lead.time}
              </Text>
            </>
          )}
          <Text variant="bodyLg" color={theme.semantic.text.onAccent}>
            {lead === null
              ? t({ id: 'trip.dayOf.freeDay', message: 'Nothing planned today. A free day.' })
              : lead.kind === 'done'
                ? t({ id: 'trip.dayOf.done', message: "That's everything on today's plan." })
                : lead.title}
          </Text>
        </Stack>
      </Card>
    );
  }
  const copy = heroCopy(view, props.now, props.guideName, locale);
  return (
    <LeaveByHero
      testID={`trip-day-hero-${view.phase}`}
      backdrop={backdrop}
      halftone={!props.heroMedia}
      eyebrow={upper(props.eyebrow, locale)}
      {...(props.forecast === null ? {} : { trailing: upper(props.forecast, locale) })}
      label={upper(copy.label, locale)}
      time={copy.time}
      spokenTime={copy.spokenTime}
      {...(copy.instructions === null ? {} : { instructions: copy.instructions })}
      {...(copy.ring === null
        ? {}
        : {
            ring: {
              progress: view.ringFraction,
              value: copy.ring.value,
              caption: upper(copy.ring.caption, locale),
              spoken: copy.ring.spoken,
            },
          })}
      crew={<ReadinessFaces crew={view.crew} />}
      crewLabel={upper(copy.readinessLabel, locale)}
      {...(copy.readinessDetail === null ? {} : { crewDetail: copy.readinessDetail })}
    />
  );
}
