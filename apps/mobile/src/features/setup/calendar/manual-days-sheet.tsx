/**
 * Mark days by hand (undesigned; the dates step's own month grid in a sheet): one month at a
 * time from today to the six-month horizon, each tap cycling a day free → busy → maybe → unmarked,
 * a legend so no state is colour alone, and Save, which queues `set_availability` (works offline).
 */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { IconButton } from '@/ui/buttons/IconButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { PressScale } from '@/ui/press/PressScale';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme, type Theme } from '@/ui/theme';

import { setAvailabilityCommand } from '../data/commands';
import { useSetupServices } from '../data/services';
import {
  loadMarks,
  manualPayload,
  monthCount,
  monthGrid,
  saveMarks,
  toggled,
  type ManualMark,
  type ManualMarks,
} from './manual-days';
import { syncRange } from './sync-plan';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['12'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, padding: th.space['2'] },
  box: {
    borderRadius: th.radius.sm,
    minHeight: th.space['32'] + th.space['12'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: { gap: th.space['12'], flexWrap: 'wrap' },
  swatch: { width: th.space['12'], height: th.space['12'], borderRadius: th.radius.xs },
}));

function markColour(theme: Theme, mark: ManualMark | undefined): string {
  switch (mark) {
    case 'free':
      return theme.semantic.state.success;
    case 'busy':
      return theme.semantic.state.urgent;
    case 'maybe':
      return theme.semantic.state.warning;
    case undefined:
      return theme.semantic.bg.control;
  }
}

const GLYPH: Readonly<Record<ManualMark, string>> = { free: '✓', busy: '✕', maybe: '?' };

function markWord(mark: ManualMark | undefined): string {
  switch (mark) {
    case 'free':
      return t({ id: 'setup.manual.free', message: 'Free' });
    case 'busy':
      return t({ id: 'setup.manual.busy', message: 'Busy' });
    case 'maybe':
      return t({ id: 'setup.manual.maybe', message: 'Maybe' });
    case undefined:
      return t({ id: 'setup.manual.unmarked', message: 'Not marked' });
  }
}

export interface ManualDaysViewProps {
  /** First and last dates that can be marked (today to the horizon). */
  readonly from: string;
  readonly to: string;
  readonly marks: ManualMarks;
  readonly page: number;
  readonly saving: boolean;
  readonly onPage: (page: number) => void;
  readonly onToggle: (date: string) => void;
  readonly onSave: () => void;
  readonly onDismiss: () => void;
}

export function ManualDaysView(props: ManualDaysViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const pages = monthCount(props.from, props.to);
  const grid = monthGrid(props.from, props.page);
  const monthTitle = format.date(locale, new Date(Date.UTC(grid.year, grid.month - 1, 15)), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  // 2024-01-01 was a Monday: seven narrow weekday names in Monday-first order.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    format.date(locale, new Date(Date.UTC(2024, 0, 1 + i)), { weekday: 'narrow', timeZone: 'UTC' }),
  );
  const heading = t({ id: 'setup.manual.title', message: 'Mark your days' });
  return (
    <Sheet
      detents={['fit']}
      onDismiss={props.onDismiss}
      accessibilityLabel={heading}
      testID="manual-days"
    >
      <View style={styles.body}>
        <Text variant="h3" accessibilityRole="header">
          {heading}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'setup.manual.line',
            message: 'Tap a day to mark it free, tap again for busy, then maybe.',
          })}
        </Text>
        <Row justify="space-between" align="center">
          <IconButton
            label={t({ id: 'setup.manual.previous', message: 'Previous month' })}
            glyph={<Text variant="title">‹</Text>}
            size={40}
            disabled={props.page === 0}
            onPress={() => props.onPage(props.page - 1)}
            testID="manual-days-previous"
          />
          <Text variant="title" accessibilityRole="header" testID="manual-days-month">
            {monthTitle}
          </Text>
          <IconButton
            label={t({ id: 'setup.manual.next', message: 'Next month' })}
            glyph={<Text variant="title">›</Text>}
            size={40}
            disabled={props.page >= pages - 1}
            onPress={() => props.onPage(props.page + 1)}
            testID="manual-days-next"
          />
        </Row>
        <View style={styles.grid} importantForAccessibility="no-hide-descendants">
          {weekdays.map((weekday, index) => (
            <View key={`w${index}`} style={styles.cell}>
              <Text
                variant="label"
                color={theme.semantic.text.secondary}
                style={{ textAlign: 'center' }}
              >
                {weekday}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.grid}>
          {Array.from({ length: grid.leadingBlanks }, (_, index) => (
            <View key={`b${index}`} style={styles.cell} />
          ))}
          {grid.days.map((date) => {
            const mark = props.marks[date];
            const open = date >= props.from && date <= props.to;
            const day = Number(date.slice(8));
            const dayName = format.date(locale, new Date(Date.parse(date) + 12 * 3_600_000), {
              day: 'numeric',
              month: 'long',
              timeZone: 'UTC',
            });
            const state = markWord(mark);
            const ink =
              mark === undefined ? theme.semantic.text.primary : theme.semantic.text.onAccent;
            const face = (
              <View
                style={[
                  styles.box,
                  { backgroundColor: markColour(theme, mark), opacity: open ? 1 : 0.35 },
                ]}
              >
                <Text variant="label" color={ink}>
                  {String(day)}
                </Text>
                {mark === undefined ? null : (
                  <Text variant="caption" color={ink}>
                    {GLYPH[mark]}
                  </Text>
                )}
              </View>
            );
            return (
              <View key={date} style={styles.cell}>
                {open ? (
                  <PressScale
                    widthClass="narrow"
                    accessibilityLabel={t({
                      id: 'setup.manual.dayA11y',
                      message: `${dayName}, ${state}`,
                    })}
                    onPress={() => props.onToggle(date)}
                    testID={`manual-day-${date}`}
                  >
                    {face}
                  </PressScale>
                ) : (
                  face
                )}
              </View>
            );
          })}
        </View>
        <Row style={styles.legend}>
          {(['free', 'busy', 'maybe'] as const).map((mark) => (
            <Row key={mark} gap="6" align="center">
              <View style={[styles.swatch, { backgroundColor: markColour(theme, mark) }]} />
              <Text variant="caption">{`${GLYPH[mark]} ${markWord(mark)}`}</Text>
            </Row>
          ))}
        </Row>
        <PillButton
          label={t({ id: 'setup.manual.save', message: 'Save my days' })}
          onPress={props.onSave}
          loading={props.saving}
          testID="manual-days-save"
        />
      </View>
    </Sheet>
  );
}

export interface ManualDaysSheetProps {
  readonly tripId: string;
  readonly onDismiss: () => void;
  /** The member's zone (the device's by default). */
  readonly tz?: string;
}

export function ManualDaysSheet({ tripId, onDismiss, tz }: ManualDaysSheetProps) {
  const { db } = useLocalFirst();
  const services = useSetupServices();
  const { send } = useCommand(setAvailabilityCommand);
  const range = syncRange(
    new Date(services.now()),
    tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [saved, setSaved] = useState<ManualMarks>({});
  const [marks, setMarks] = useState<ManualMarks>({});
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void loadMarks(db).then((stored) => {
      if (!live) return;
      setSaved(stored);
      setMarks(stored);
    });
    return () => {
      live = false;
    };
  }, [db]);

  const onSave = () => {
    setSaving(true);
    void send(manualPayload(tripId, marks, saved))
      .then(async (sent) => {
        if (sent.kind === 'rejected') return;
        await saveMarks(db, marks, new Date(services.now()));
        onDismiss();
      })
      .finally(() => setSaving(false));
  };

  return (
    <ManualDaysView
      from={range.from}
      to={range.to}
      marks={marks}
      page={page}
      saving={saving}
      onPage={setPage}
      onToggle={(date) => setMarks((current) => toggled(current, date))}
      onSave={onSave}
      onDismiss={onDismiss}
    />
  );
}
