/**
 * The day-of screen (3k-2) from props: the pink leave-by hero with the draining ring and who is
 * up, GO and "Running late?" for today's next stop, the in-app I'M UP, the pack chips and the
 * day's timeline. A day with no early start shows
 * the day's first item instead of a leave-by, and a link under the timeline opens the day plan.
 * The status bar keeps the hero's pink behind it while the page scrolls. The lab scenes render it
 * with fixed data.
 */
import type { MediaAsset } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { GoButton } from '@/ui/buttons/GoButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { cardBackground } from '@/ui/cards/tone';
import { Row } from '@/ui/layout/Row';
import { MediaLayer } from '@/ui/media/MediaLayer';
import { Stack } from '@/ui/layout/Stack';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Skeleton } from '@/ui/states/Skeleton';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { LeaveByHero } from '@/ui/trip/LeaveByHero';
import { makeStyles, useTheme } from '@/ui/theme';

import type { LeaveByView } from '../leave-by/model';
import { heroCopy } from './day-of-copy';
import type { DayLead } from './day-of-data';
import { PackChips } from './pack-chips';
import type { PackChip } from './packing-model';
import { ReadinessFaces } from './readiness-row';
import { DayTimeline, type DayTimelineEntry } from './timeline';

export interface AlarmNote {
  readonly text: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
}

export interface DayOfViewProps {
  readonly state: 'loading' | 'ready';
  readonly eyebrow: string;
  readonly forecast: string | null;
  readonly leaveBy: LeaveByView | null;
  readonly now: Date;
  readonly guideName: string;
  /**
   * What leads the day when there is no leave-by: its first stop ("First up 09:30 · Hot
   * springs"), today's next stop, or that today is done. Null on a free day.
   */
  readonly firstUp: DayLead | null;
  /** Another day is shown while the trip is on: the way back to today. */
  readonly onToday?: (() => void) | undefined;
  readonly pack: readonly PackChip[];
  readonly timeline: readonly DayTimelineEntry[];
  readonly offline: boolean;
  readonly alarmNote: AlarmNote | null;
  readonly onImUp: () => void;
  /** Opens the day plan for the day shown (legs, the map, adding and moving stops). */
  readonly onDayPlan?: (() => void) | undefined;
  /** GO to the next stop: the route from here, then directions in the maps app. */
  readonly onGo?: (() => void) | undefined;
  /** Where GO goes when the screen names no place for it (a flight's airport). */
  readonly goDetail?: string | null | undefined;
  /** "Running late?" with its minutes, for today's next stop (the screen's own control). */
  readonly late?: ReactNode;
  readonly onTogglePack: (id: string, packed: boolean) => void;
  readonly onAddPack: (label: string) => void;
  readonly onRemovePack: (id: string) => void;
  /** Overlays the ringing in-app alarm. */
  readonly overlay?: ReactNode;
  /** A photo of the destination under the quiet hero; null keeps the flat pink. */
  readonly heroMedia?: MediaAsset | null;
  readonly mediaLowData?: boolean;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingTop: th.space['20'], gap: th.space['24'] },
  quiet: {
    borderTopStartRadius: 0,
    borderTopEndRadius: 0,
    borderBottomStartRadius: th.radius.heroBottom,
    borderBottomEndRadius: th.radius.heroBottom,
  },
  // The page's own pink under the status bar, so the clock never sits on scrolled content.
  statusBar: { position: 'absolute', top: 0, start: 0, end: 0, backgroundColor: th.color.pink },
}));

function Hero(props: DayOfViewProps) {
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

export function DayOfView(props: DayOfViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const inset = useTabBarInset();
  const view = props.leaveBy;
  if (props.state === 'loading') {
    return (
      <Scaffold variant="dark" testID="trip-day-loading">
        <View style={{ padding: theme.size.gutter, paddingTop: insets.top + theme.space['20'] }}>
          <Skeleton preset="card" repeat={3} />
        </View>
      </Scaffold>
    );
  }
  const canWake =
    view !== null &&
    view.viewerIn &&
    !view.viewerUp &&
    (view.phase === 'before' || view.phase === 'window' || view.phase === 'overdue');
  return (
    <Scaffold variant="dark" edges={[]} testID="trip-day">
      <ScrollView contentContainerStyle={{ paddingBottom: inset + theme.space['32'] }}>
        <View
          style={{
            paddingTop: insets.top + theme.space['8'],
            paddingHorizontal: theme.size.gutter,
            backgroundColor: theme.color.pink,
          }}
        >
          <BackEyebrow
            label={t({ id: 'trip.dayOf.back', message: 'Trip' })}
            color={theme.semantic.text.onAccent}
            testID="trip-day-back"
          />
        </View>
        <Hero {...props} />
        <View style={styles.body}>
          {props.offline ? <OfflinePill testID="trip-day-offline" /> : null}
          {props.onToday === undefined ? null : (
            <TextLink
              label={t({ id: 'trip.dayOf.toToday', message: 'Back to today' })}
              onPress={props.onToday}
              testID="trip-day-to-today"
            />
          )}
          {view !== null && !view.viewerIn ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({ id: 'trip.dayOf.notYours', message: "You're not on this one. Sleep in." })}
            </Text>
          ) : null}
          {props.onGo === undefined ? null : (
            <GoButton block onPress={props.onGo} detail={props.goDetail} testID="trip-day-go" />
          )}
          {props.late}
          {canWake ? (
            <PillButton
              label={t({ id: 'trip.dayOf.imUp', message: "I'm up" })}
              tone="yellow"
              block
              onPress={props.onImUp}
              testID="trip-day-im-up"
            />
          ) : null}
          {props.alarmNote === null ? null : (
            <Stack gap="4" testID="trip-day-alarm-note">
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {props.alarmNote.text}
              </Text>
              {props.alarmNote.action === undefined ? null : (
                <TextLink
                  label={props.alarmNote.action.label}
                  onPress={props.alarmNote.action.onPress}
                  testID="trip-day-alarm-action"
                />
              )}
            </Stack>
          )}
          <PackChips
            chips={props.pack}
            onToggle={props.onTogglePack}
            onAdd={props.onAddPack}
            onRemove={props.onRemovePack}
          />
          <DayTimeline entries={props.timeline} />
          {props.onDayPlan === undefined ? null : (
            <PillButton
              label={t({ id: 'trip.dayOf.toDayPlan', message: 'See the day plan' })}
              variant="secondary"
              block
              onPress={props.onDayPlan}
              testID="trip-day-to-plan"
            />
          )}
        </View>
      </ScrollView>
      <View style={[styles.statusBar, { height: insets.top }]} pointerEvents="none" />
      {props.overlay}
    </Scaffold>
  );
}
