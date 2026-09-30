/**
 * The day (3e-2 header; list rows as 3k-2): "← DAY 3 / 8", who's here, the day's name, the
 * PLANNING MODE switch and the date with its rain window, then either the list or the timeline
 * editor. An empty day is a free day with an add action; a day with no plan yet waits for sync.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { DashedAddCard } from '@/ui/cards/DashedAddCard';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack, type StackMember } from '@/ui/people/AvatarStack';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

import { DayList, type DayRowState } from './day-list';
import { clockRange, dayDate } from './format';
import type { DayItem } from './plan-model';

export interface DayViewProps {
  readonly dayNo: number;
  readonly dayCount: number;
  readonly date: string | null;
  readonly theme: string | null;
  readonly here: readonly StackMember[];
  readonly rain: { readonly start: number; readonly end: number } | null;
  readonly planning: boolean;
  readonly onTogglePlanning: () => void;
  readonly items: readonly DayItem[];
  readonly states: ReadonlyMap<string, DayRowState>;
  readonly meta: (item: DayItem) => string;
  readonly loading: boolean;
  readonly offline: boolean;
  /** False when the plan can't change (a finished or cancelled trip). */
  readonly editable: boolean;
  readonly onOpen: (item: DayItem) => void;
  readonly onAdd: () => void;
  /** The timeline editor, shown in planning mode. */
  readonly timeline?: ReactNode;
  /** Pinned under the content (the guide's suggestion banner). */
  readonly footer?: ReactNode;
  readonly onBack?: () => void;
}

const useStyles = makeStyles((th) => ({
  content: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['32'] * 3 },
  header: { paddingTop: th.space['8'], gap: th.space['12'] },
  titleRow: { alignItems: 'flex-end', justifyContent: 'space-between' },
  pill: {
    borderRadius: th.radius.pill,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['6'],
    borderWidth: th.space['2'],
    borderColor: th.color.yellow,
  },
  footer: {
    position: 'absolute',
    start: th.size.gutter,
    end: th.size.gutter,
    bottom: th.space['24'],
  },
}));

function PlanningPill({ on, onPress }: { readonly on: boolean; readonly onPress: () => void }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const label = t({ id: 'plan.day.planningMode', message: 'Planning mode' });
  return (
    <PressScale
      widthClass="narrow"
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      style={[
        styles.pill,
        { transform: [{ rotate: degrees(-4) }] },
        on ? { backgroundColor: theme.color.yellow } : null,
      ]}
      testID="plan-day-planning"
    >
      <Text variant="label" color={on ? theme.semantic.text.onAccent : theme.color.yellow}>
        {upper(label, locale)}
      </Text>
    </PressScale>
  );
}

export function DayView(props: DayViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { dayNo, dayCount, date, rain } = props;
  const title = props.theme ?? t({ id: 'plan.day.untitled', message: `Day ${dayNo}` });
  const when = [
    date === null ? null : dayDate(locale, date),
    rain === null
      ? null
      : t({
          id: 'plan.day.rainWindow',
          message: `rain ${clockRange(locale, rain.start, rain.end)}`,
        }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Scaffold variant="dark" testID="plan-day">
      <ScrollView contentContainerStyle={styles.content}>
        <Stack style={styles.header}>
          <Row justify="space-between" align="center">
            <BackEyebrow
              label={upper(
                t({ id: 'plan.day.eyebrow', message: `Day ${dayNo} / ${dayCount}` }),
                locale,
              )}
              {...(props.onBack === undefined ? {} : { onPress: props.onBack })}
            />
            <Row gap="8" align="center">
              {props.offline ? <OfflinePill /> : null}
              {props.here.length > 0 ? (
                <AvatarStack
                  members={props.here}
                  size="sm"
                  accessibilityLabel={t({
                    id: 'plan.day.hereA11y',
                    message: `${props.here.map((member) => member.name).join(', ')} here`,
                  })}
                  testID="plan-day-here"
                />
              ) : null}
            </Row>
          </Row>
          <Row style={styles.titleRow} gap="12">
            <Text variant="h1" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={3}>
              {upper(title, locale)}
            </Text>
            <Stack align="flex-end" gap="6">
              {props.editable ? (
                <PlanningPill on={props.planning} onPress={props.onTogglePlanning} />
              ) : null}
              {when === '' ? null : (
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {when}
                </Text>
              )}
            </Stack>
          </Row>
        </Stack>
        <View style={{ height: theme.space['16'] }} />
        {props.loading ? (
          <Skeleton
            preset="list"
            repeat={4}
            label={t({ id: 'plan.day.loading', message: 'Loading the day' })}
          />
        ) : props.items.length === 0 ? (
          <EmptyState
            guide="tokek"
            guideName={GUIDE_STICKERS.tokek.name}
            title={t({ id: 'plan.day.freeTitle', message: 'Free day' })}
            line={t({
              id: 'plan.day.freeLine',
              message: 'Nothing planned. Sleep in, or add something.',
            })}
            {...(props.editable
              ? {
                  action: {
                    label: t({ id: 'plan.day.addAction', message: 'Add something' }),
                    onPress: props.onAdd,
                  },
                }
              : {})}
            testID="plan-day-free"
          />
        ) : props.planning && props.timeline !== undefined ? (
          props.timeline
        ) : (
          <Stack gap="12">
            <DayList
              items={props.items}
              meta={props.meta}
              states={props.states}
              onOpen={props.onOpen}
            />
            {props.editable ? (
              <DashedAddCard
                label={t({ id: 'plan.day.addCard', message: 'Add to the day' })}
                onPress={props.onAdd}
                testID="plan-day-add"
              />
            ) : null}
          </Stack>
        )}
      </ScrollView>
      {props.footer === undefined ? null : <View style={styles.footer}>{props.footer}</View>}
    </Scaffold>
  );
}
