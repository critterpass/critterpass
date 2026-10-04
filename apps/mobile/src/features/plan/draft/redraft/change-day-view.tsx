/**
 * Change a day (3c-11) as a pure view: "{PLACE} · {GUIDE}'S DRAFT" and ONLY YOU SEE THIS, the
 * guide beside CHANGE A DAY, the day chips (number and weekday; the picked one's summary flips in
 * underneath, with what stays put), the reason chips, "Anything else?" and REDRAFT DAY {n}, which
 * waits for a chip or a note. With no free redrafts left the button gives way to the boost offer.
 */
import type { RedraftReasonKey } from '@cp/domain';
import { upper } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Icon } from '@/ui/icons/Icon';
import { TextField } from '@/ui/inputs/TextField';
import type { GuideId } from '@/ui/people/GuideLine';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { clock, weekday } from '../data/format';
import type { ReviewDay } from '../data/version';
import { ReasonChips } from './reason-chips';

const FLIP_MS = 260;
const TILE_GAP = 6;
/** Below this the day tiles stop sharing the width and the row scrolls instead. */
const MIN_TILE = 36;
const STICKER = 72;

const useStyles = makeStyles((th) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: th.space['8'],
  },
  content: {
    paddingHorizontal: th.size.gutter,
    gap: th.space['14'],
    paddingBottom: th.space['16'],
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: th.space['12'] },
  grow: { flex: 1 },
  chips: { flexDirection: 'row', gap: TILE_GAP },
  dayChip: {
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: th.space['8'],
    paddingHorizontal: th.space['2'],
    borderRadius: th.radius.md,
    alignItems: 'center',
    backgroundColor: th.semantic.bg.control,
  },
  summary: {
    backgroundColor: th.semantic.bg.control,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['6'],
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: th.space['8'] },
  tag: {
    borderWidth: 1,
    borderColor: th.semantic.border.control,
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
  },
  locked: { flexDirection: 'row', alignItems: 'center', gap: th.space['6'] },
  footer: {
    paddingHorizontal: th.size.gutter,
    paddingTop: th.space['8'],
    gap: th.space['8'],
    alignItems: 'center',
  },
}));

function DaySummary({ day, locale }: { readonly day: ReviewDay; readonly locale: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const opacity = useSharedValue(0.3);
  const y = useSharedValue(reduced ? 0 : 6);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: FLIP_MS });
    y.value = withTiming(0, { duration: FLIP_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, []);
  const flip = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));
  const n = day.dayNo;
  const title = day.title;
  const stops = day.stops
    .map((stop) => `${clock(locale, stop.startsAt, stop.tz)} ${stop.name}`)
    .join(' · ');
  const locked = day.stops.filter((stop) => stop.locked).map((stop) => stop.name);
  const keeps = locked.join(', ');
  return (
    <Animated.View style={[styles.summary, flip]} testID="change-day-summary">
      <View style={styles.summaryHead}>
        <View style={styles.grow}>
          <Text variant="title">
            {t({ id: 'planDraft.change.dayTitle', message: `Day ${n} · ${title}` })}
          </Text>
        </View>
        {day.optional ? (
          <View style={styles.tag}>
            <Text variant="label" color={theme.semantic.text.secondary}>
              {t({ id: 'planDraft.change.optional', message: 'Optional' })}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {stops === ''
          ? t({ id: 'planDraft.change.empty', message: 'Nothing booked, on purpose' })
          : stops}
      </Text>
      {locked.length === 0 ? null : (
        <View style={styles.locked}>
          <Icon name="lock" size={14} decorative color={theme.semantic.text.secondary} />
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {t({ id: 'planDraft.change.keeps', message: `Stays put: ${keeps}` })}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

export interface ChangeDayViewProps {
  readonly guide: GuideId;
  readonly destination: string;
  readonly locale: string;
  readonly days: readonly ReviewDay[];
  readonly day: number;
  readonly onDay: (day: number) => void;
  readonly reasons: ReadonlySet<RedraftReasonKey>;
  readonly onReason: (reason: RedraftReasonKey) => void;
  readonly note: string;
  readonly onNote: (note: string) => void;
  /** Why the last try did not go, in words. */
  readonly problem: string | null;
  readonly counter: string | null;
  readonly sending: boolean;
  /** No free redrafts left: the boost offer replaces the button. */
  readonly spent: ReactNode | null;
  readonly onSubmit: () => void;
  readonly onClose?: () => void;
}

export function ChangeDayView(props: ChangeDayViewProps) {
  const { guide, days, day, locale } = props;
  const styles = useStyles();
  const theme = useTheme();
  const info = GUIDE_STICKERS[guide];
  const guideName = info.name;
  const destination = props.destination;
  const picked = days.find((d) => d.dayNo === day);
  const ready = props.reasons.size > 0 || props.note.trim() !== '';
  const [rowWidth, setRowWidth] = useState(0);
  const shared = (rowWidth - TILE_GAP * (days.length - 1)) / Math.max(1, days.length);
  const fits = rowWidth > 0 && shared >= MIN_TILE;
  const tileWidth = fits ? shared : MIN_TOUCH_TARGET;
  return (
    <Sheet
      header={
        <View style={styles.header}>
          <Text variant="eyebrow">
            {t({
              id: 'planDraft.change.eyebrow',
              message: `${destination} · ${guideName}’s draft`,
            })}
          </Text>
        </View>
      }
      accessibilityLabel={t({ id: 'planDraft.change.title', message: 'Change a day' })}
      {...(props.onClose === undefined ? {} : { onDismiss: props.onClose })}
      testID="change-day"
    >
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <Sticker kind={info.kind} name={info.name} pose="think" size={STICKER} />
          <View style={styles.grow}>
            <Text variant="h1" accessibilityRole="header">
              {t({ id: 'planDraft.change.title', message: 'Change a day' })}
            </Text>
          </View>
        </View>
        <Text variant="eyebrow">{t({ id: 'planDraft.change.which', message: 'Which day?' })}</Text>
        <View onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
          <ScrollView
            horizontal
            scrollEnabled={!fits}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {days.map((d) => {
              const selected = d.dayNo === day;
              const n = d.dayNo;
              const wd = upper(weekday(locale, d.date), locale);
              return (
                <Pressable
                  key={d.dayNo}
                  onPress={() => props.onDay(d.dayNo)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t({
                    id: 'planDraft.change.dayChip',
                    message: `Day ${n}, ${wd}`,
                  })}
                  style={[
                    styles.dayChip,
                    { width: tileWidth },
                    selected ? { backgroundColor: theme.semantic.action.primary } : null,
                  ]}
                  testID={`change-day-${n}`}
                >
                  <Text variant="h3" color={selected ? theme.semantic.text.onAccent : undefined}>
                    {String(n)}
                  </Text>
                  <Text
                    variant="label"
                    color={selected ? theme.semantic.text.onAccent : theme.semantic.text.secondary}
                  >
                    {wd}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        {picked === undefined ? null : (
          <DaySummary key={picked.dayNo} day={picked} locale={locale} />
        )}
        <Text variant="eyebrow">
          {t({ id: 'planDraft.change.what', message: 'What should change?' })}
        </Text>
        <ReasonChips selected={props.reasons} onToggle={props.onReason} />
        <TextField
          label={t({ id: 'planDraft.change.note', message: 'Anything else?' })}
          value={props.note}
          onChangeText={props.onNote}
          multiline
          maxLength={280}
          testID="change-day-note"
        />
        {props.problem === null ? null : (
          <Text variant="bodySm" color={theme.semantic.state.warning} testID="change-day-problem">
            {props.problem}
          </Text>
        )}
      </SheetScrollView>
      <View style={styles.footer}>
        {props.spent ?? (
          <PillButton
            label={t({ id: 'planDraft.change.cta', message: `Redraft day ${day}` })}
            onPress={props.onSubmit}
            disabled={!ready || picked === undefined}
            loading={props.sending}
            flap
            testID="change-day-submit"
          />
        )}
        {props.spent === null && !ready ? (
          <Text variant="caption" color={theme.semantic.text.secondary} testID="change-day-hint">
            {t({ id: 'planDraft.change.hint', message: 'Pick a reason or write a few words.' })}
          </Text>
        ) : null}
        {props.counter === null ? null : (
          <Text variant="caption" color={theme.semantic.text.tertiary}>
            {props.counter}
          </Text>
        )}
      </View>
    </Sheet>
  );
}
