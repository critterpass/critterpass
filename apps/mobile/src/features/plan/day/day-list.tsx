/**
 * The day outside planning mode (3e-2 list, rows as 3k-2 draws them): time, title, a one-line
 * meta and the item's state — booked, queued offline, waiting on the crew's yes, or a clash the
 * fit check found. Tapping a row opens the item sheet.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { InfoPill } from '@/ui/chips/InfoPill';
import { StatusChip } from '@/ui/chips/StatusChip';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { blockColor } from './category-color';
import { clock } from './format';
import type { DayItem } from './plan-model';

export interface DayRowState {
  readonly queued: boolean;
  readonly proposed: boolean;
  readonly warning: string | null;
}

const useStyles = makeStyles((th) => ({
  row: {
    paddingVertical: th.space['14'],
    borderBottomWidth: th.space['2'] / 2,
    borderBottomColor: th.color.divider,
  },
  time: { width: th.space['32'] * 2 },
  swatch: { width: th.space['4'], alignSelf: 'stretch', borderRadius: th.radius.xs },
}));

export function DayList({
  items,
  meta,
  states,
  onOpen,
}: {
  readonly items: readonly DayItem[];
  /** The line under a title ("Guide: Ketut · 2h climb"). */
  readonly meta: (item: DayItem) => string;
  readonly states: ReadonlyMap<string, DayRowState>;
  readonly onOpen: (item: DayItem) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  return (
    <View testID="plan-day-list">
      {items.map((item) => {
        const state = states.get(item.stableId);
        const time =
          item.start === null
            ? t({ id: 'plan.day.anyTime', message: 'Any time' })
            : clock(locale, item.start);
        const line = meta(item);
        const flags = [
          item.lock === 'booking' ? t({ id: 'plan.day.booked', message: 'Booked' }) : null,
          state?.queued ? t({ id: 'plan.day.queued', message: 'Sends when you’re back' }) : null,
          state?.proposed ? t({ id: 'plan.day.waiting', message: 'Waiting for the crew' }) : null,
          state?.warning ?? null,
        ].filter((flag): flag is string => flag !== null);
        return (
          <PressScale
            key={item.stableId}
            widthClass="wide"
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            accessibilityLabel={[time, item.title, line, ...flags].filter(Boolean).join(', ')}
            testID={`plan-day-row-${item.stableId}`}
          >
            <Row gap="12" align="flex-start" style={styles.row}>
              <View style={[styles.swatch, { backgroundColor: blockColor(theme, item) }]} />
              <Text variant="monoData" color={theme.semantic.text.secondary} style={styles.time}>
                {time}
              </Text>
              <Stack gap="4" style={{ flex: 1 }}>
                <Text variant="title">{upper(item.title, locale)}</Text>
                {line === '' ? null : (
                  <Text variant="bodySm" color={theme.semantic.text.secondary}>
                    {line}
                  </Text>
                )}
                {state?.queued || state?.proposed || state?.warning ? (
                  <Row gap="6" wrap>
                    {state?.queued ? (
                      <InfoPill variant="outline">
                        {t({ id: 'plan.day.queuedShort', message: 'Queued' })}
                      </InfoPill>
                    ) : null}
                    {state?.proposed ? (
                      <InfoPill variant="outline">
                        {t({ id: 'plan.day.waitingShort', message: 'Needs a yes' })}
                      </InfoPill>
                    ) : null}
                    {state?.warning ? <InfoPill icon="flame">{state.warning}</InfoPill> : null}
                  </Row>
                ) : null}
              </Stack>
              {item.lock === 'booking' ? <StatusChip status="booked" /> : null}
            </Row>
          </PressScale>
        );
      })}
    </View>
  );
}
