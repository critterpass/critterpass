/**
 * The day-of screen (3k-2) from props: the pink leave-by hero with the draining ring and who is
 * up, the in-app I'M UP, the pack chips and the day's timeline. A day with no early start shows
 * the day's first item instead of a leave-by. The lab scenes render it with fixed data.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { LeaveByHero } from '@/ui/trip/LeaveByHero';
import { makeStyles, useTheme } from '@/ui/theme';

import type { LeaveByView } from '../leave-by/model';
import { heroCopy } from './day-of-copy';
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
  /** The first item when there is no leave-by ("First up 09:30 · Hot springs"). */
  readonly firstUp: { readonly time: string; readonly title: string } | null;
  readonly pack: readonly PackChip[];
  readonly timeline: readonly DayTimelineEntry[];
  readonly offline: boolean;
  readonly alarmNote: AlarmNote | null;
  readonly onImUp: () => void;
  readonly onTogglePack: (id: string, packed: boolean) => void;
  readonly onAddPack: (label: string) => void;
  readonly onRemovePack: (id: string) => void;
  /** Overlays the ringing in-app alarm. */
  readonly overlay?: ReactNode;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingTop: th.space['20'], gap: th.space['24'] },
  quiet: {
    borderTopStartRadius: 0,
    borderTopEndRadius: 0,
    borderBottomStartRadius: th.radius.heroBottom,
    borderBottomEndRadius: th.radius.heroBottom,
  },
}));

function Hero(props: DayOfViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const view = props.leaveBy;
  if (view === null) {
    return (
      <Card tone="pink" halftone style={styles.quiet} testID="trip-day-hero-quiet">
        <Stack gap="10">
          <Row justify="space-between">
            <Text variant="eyebrow">{upper(props.eyebrow, locale)}</Text>
            {props.forecast === null ? null : (
              <Text variant="eyebrow">{upper(props.forecast, locale)}</Text>
            )}
          </Row>
          <Text variant="eyebrow">
            {upper(t({ id: 'trip.dayOf.firstUp', message: 'First up' }), locale)}
          </Text>
          <Text variant="displayHero" autoFit>
            {props.firstUp?.time ?? '—'}
          </Text>
          <Text variant="bodyLg" color={theme.semantic.text.onAccent}>
            {props.firstUp?.title ??
              t({ id: 'trip.dayOf.freeDay', message: 'Nothing planned today. A free day.' })}
          </Text>
        </Stack>
      </Card>
    );
  }
  const copy = heroCopy(view, props.now, props.guideName, locale);
  return (
    <LeaveByHero
      testID={`trip-day-hero-${view.phase}`}
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
        <View style={{ height: insets.top, backgroundColor: theme.color.pink }} />
        <Hero {...props} />
        <View style={styles.body}>
          {props.offline ? <OfflinePill testID="trip-day-offline" /> : null}
          {view !== null && !view.viewerIn ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({ id: 'trip.dayOf.notYours', message: "You're not on this one. Sleep in." })}
            </Text>
          ) : null}
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
        </View>
      </ScrollView>
      {props.overlay}
    </Scaffold>
  );
}
