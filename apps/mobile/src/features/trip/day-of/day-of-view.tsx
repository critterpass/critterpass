/**
 * The day-of screen (3k-2) from props: the pink leave-by hero with the draining ring and who is
 * up, GO and "Running late?" for today's next stop, the in-app I'M UP, the pack chips and the
 * day's timeline. A day with no early start shows
 * the day's first item instead of a leave-by, and a link under the timeline opens the day plan.
 * The status bar keeps the hero's pink behind it while the page scrolls. The lab scenes render it
 * with fixed data.
 */
import type { MediaAsset } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoButton } from '@/ui/buttons/GoButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Stack } from '@/ui/layout/Stack';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { LeaveByView } from '../leave-by/model';
import type { DayLead } from './day-of-data';
import { DayHero } from './day-of-hero';
import { PackChips } from './pack-chips';
import type { PackChip } from './packing-model';
import { DayTimeline, type DayTimelineEntry } from './timeline';

export interface AlarmNote {
  readonly text: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
}

export interface DayOfViewProps {
  readonly state: 'loading' | 'ready';
  /** Where back lands when the day was opened cold (a link, a restored launch): the trip's hub. */
  readonly backFallback?: Href | undefined;
  readonly eyebrow: string;
  readonly forecast: string | null;
  /** Opens the trip's forecast and watch list from the forecast line. */
  readonly onForecast?: (() => void) | undefined;
  /** Opens the trip's offline page: what is saved on this phone and what is waiting to send. */
  readonly onOffline?: (() => void) | undefined;
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
  /** Today is shown and the trip has a tomorrow: its page (its leave-by, its alarm). */
  readonly onTomorrow?: (() => void) | undefined;
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
  // The page's own pink under the status bar, so the clock never sits on scrolled content.
  statusBar: { position: 'absolute', top: 0, start: 0, end: 0, backgroundColor: th.color.pink },
}));

export function DayOfView(props: DayOfViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const inset = useTabBarInset();
  const view = props.leaveBy;
  const back = t({ id: 'trip.dayOf.back', message: 'Trip' });
  if (props.state === 'loading') {
    return (
      <ScreenLoading backLabel={back} fallback={props.backFallback} testID="trip-day-loading" />
    );
  }
  const canWake =
    view !== null &&
    view.viewerIn &&
    !view.viewerUp &&
    (view.phase === 'before' || view.phase === 'window' || view.phase === 'overdue');
  return (
    <Scaffold variant="dark" edges={[]} testID="trip-day">
      <ScrollView
        contentContainerStyle={{ paddingBottom: inset + theme.space['32'] }}
        // The pack list's add field sits mid-page: the keyboard must not cover it.
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            paddingTop: insets.top + theme.space['8'],
            paddingHorizontal: theme.size.gutter,
            backgroundColor: theme.color.pink,
          }}
        >
          <BackEyebrow
            label={back}
            fallback={props.backFallback}
            color={theme.semantic.text.onAccent}
            testID="trip-day-back"
          />
        </View>
        <DayHero {...props} />
        <View style={styles.body}>
          {props.offline ? <OfflinePill testID="trip-day-offline" /> : null}
          {props.onToday === undefined ? null : (
            <TextLink
              label={t({ id: 'trip.dayOf.toToday', message: 'Back to today' })}
              onPress={props.onToday}
              testID="trip-day-to-today"
            />
          )}
          {props.onForecast === undefined ? null : (
            <TextLink
              label={t({
                id: 'trip.dayOf.forecastLink',
                message: 'Forecast and what we’re watching',
              })}
              onPress={props.onForecast}
              testID="trip-day-forecast"
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
          {props.onOffline === undefined ? null : (
            <TextLink
              label={t({ id: 'trip.dayOf.toOffline', message: 'What works with no signal' })}
              onPress={props.onOffline}
              testID="trip-day-to-offline"
            />
          )}
          {props.onTomorrow === undefined ? null : (
            <TextLink
              label={t({ id: 'trip.dayOf.toTomorrow', message: 'See tomorrow' })}
              onPress={props.onTomorrow}
              testID="trip-day-to-tomorrow"
            />
          )}
        </View>
      </ScrollView>
      <View style={[styles.statusBar, { height: insets.top }]} pointerEvents="none" />
      {props.overlay}
    </Scaffold>
  );
}
