/**
 * Mark days by hand (undesigned; the dates step's own month grid in a sheet): one month at a time
 * from today to the six-month horizon, swiped sideways. Pick a tool, Free / Maybe / Busy, then tap
 * or hold and drag to paint days; painting a day already in that state clears it. Each state has
 * a glyph and a label, and Maybe a dashed edge, so none is colour alone. Save queues
 * `set_availability` (works offline).
 */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Row } from '@/ui/layout/Row';
import { PressScale } from '@/ui/press/PressScale';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { setAvailabilityCommand } from '../data/commands';
import { useSetupServices } from '../data/services';
import { monthLabel, weekdayLetters } from '../when/copy';
import { DayGrid, weeksOfDates } from '../when/day-grid';
import { MonthTitle } from '../when/month-pager';
import {
  datesBetween,
  loadMarks,
  manualPayload,
  monthCount,
  monthGrid,
  paintMode,
  painted,
  saveMarks,
  type ManualMark,
  type ManualMarks,
  type PaintMode,
} from './manual-days';
import { DayFace, GLYPH, markWord, Swatch } from './manual-day-face';
import { syncRange } from './sync-plan';

const TOOLS: readonly ManualMark[] = ['free', 'maybe', 'busy'];
/** A tap that lands right after a drag is the drag's own release, not a second paint. */
const RELEASE_MS = 400;

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['12'] },
  row: { gap: th.space['8'], flexWrap: 'wrap' },
  legend: { gap: th.space['12'], flexWrap: 'wrap' },
}));

export interface ManualDaysViewProps {
  /** First and last dates that can be marked (today to the horizon). */
  readonly from: string;
  readonly to: string;
  readonly marks: ManualMarks;
  readonly page: number;
  readonly saving: boolean;
  readonly onPage: (page: number) => void;
  readonly onMarks: (marks: ManualMarks) => void;
  readonly onSave: () => void;
  readonly onDismiss: () => void;
  /** The tool it opens with (Free unless a lab scene says otherwise). */
  readonly initialTool?: ManualMark | undefined;
}

export function ManualDaysView(props: ManualDaysViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const [tool, setTool] = useState<ManualMark>(props.initialTool ?? 'free');
  const stroke = useRef<{ origin: string; base: ManualMarks; mode: PaintMode } | null>(null);
  const lastStroke = useRef(0);
  const pages = monthCount(props.from, props.to);
  const grid = monthGrid(props.from, props.page);
  const open = (date: string) => date >= props.from && date <= props.to;
  const paint = (date: string) => {
    if (Date.now() - lastStroke.current < RELEASE_MS) return;
    props.onMarks(painted(props.marks, [date], tool, paintMode(props.marks, date, tool)));
  };
  const step = (by: 1 | -1) => props.onPage(Math.max(0, Math.min(pages - 1, props.page + by)));
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
            id: 'setup.manual.paintLine',
            message:
              'Pick Free, Maybe or Busy, then tap or drag across days. Paint a day again to clear it.',
          })}
        </Text>
        <Row style={styles.row}>
          {TOOLS.map((option) => (
            <ChoiceChip
              key={option}
              label={`${GLYPH[option]} ${markWord(option)}`}
              selected={tool === option}
              tilt={0}
              onPress={() => setTool(option)}
              testID={`manual-tool-${option}`}
            />
          ))}
        </Row>
        <MonthTitle
          title={monthLabel(locale, grid.year, grid.month)}
          index={props.page}
          count={pages}
          onStep={step}
          todayIndex={0}
          onToday={() => props.onPage(0)}
          variant="title"
          testID="manual-days"
        />
        <DayGrid
          weekdays={weekdayLetters(locale)}
          weeks={weeksOfDates(grid.leadingBlanks, grid.days)}
          onSwipe={pages > 1 ? step : undefined}
          onDrag={{
            begin: (date) => {
              if (!open(date)) return;
              const mode = paintMode(props.marks, date, tool);
              stroke.current = { origin: date, base: props.marks, mode };
              props.onMarks(painted(props.marks, [date], tool, mode));
            },
            move: (date) => {
              const held = stroke.current;
              if (held === null) return;
              const days = datesBetween(held.origin, date).filter(open);
              props.onMarks(painted(held.base, days, tool, held.mode));
            },
            end: () => {
              stroke.current = null;
              lastStroke.current = Date.now();
            },
          }}
          renderDay={(date) => {
            const mark = props.marks[date];
            const face = <DayFace date={date} mark={mark} open={open(date)} />;
            if (!open(date)) return face;
            const dayName = format.date(locale, new Date(Date.parse(date) + 12 * 3_600_000), {
              day: 'numeric',
              month: 'long',
              timeZone: 'UTC',
            });
            const state = markWord(mark);
            return (
              <PressScale
                widthClass="narrow"
                accessibilityLabel={t({
                  id: 'setup.manual.dayA11y',
                  message: `${dayName}, ${state}`,
                })}
                onPress={() => paint(date)}
                testID={`manual-day-${date}`}
              >
                {face}
              </PressScale>
            );
          }}
          testID="manual-days-grid"
        />
        <Row style={styles.legend}>
          {TOOLS.map((mark) => (
            <Row key={mark} gap="6" align="center">
              <Swatch mark={mark} />
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
      onMarks={setMarks}
      onSave={onSave}
      onDismiss={onDismiss}
    />
  );
}
