/**
 * Change a day over the draft, in the premium look (undesigned; a native sheet built from the
 * kit): Cancel and "Redraft" in the header, the draft's place and guide, the days as the plan's
 * day chips with the picked day's summary under them, the reason chips, "Anything else?", and the
 * quota line. "Redraft" waits for a reason or a few words; with no free redraft left the boost
 * offer takes the footer.
 */
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { CritterSticker, Text, TextField, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { weekday } from '../../draft/data/format';
import type { ChangeDayViewProps } from '../../draft/redraft/change-day-props';
import { DayChips } from '../plan-map/day-chips';
import { PremiumDaySummary, PremiumReasonChips } from './change-day-parts';

export function PremiumChangeDayView(props: ChangeDayViewProps) {
  const { days, day, locale } = props;
  const theme = usePremiumTheme();
  const guide = guideSticker(props.guide);
  const destination = props.destination;
  const guideName = guide.name;
  const picked = days.find((d) => d.dayNo === day);
  const ready = props.reasons.size > 0 || props.note.trim() !== '';
  const chips = days.map((d) => {
    const n = d.dayNo;
    const wd = weekday(locale, d.date);
    return {
      dayNo: d.dayNo,
      weekday: wd,
      dateLabel: String(Number(d.date.slice(8, 10))),
      accessibilityLabel: t({ id: 'planDraft.change.dayChip', message: `Day ${n}, ${wd}` }),
    };
  });
  const footer =
    props.spent !== null ? (
      <View style={[styles.footer, { paddingHorizontal: theme.space.gutter }]}>{props.spent}</View>
    ) : props.counter === null && ready ? undefined : (
      <View style={[styles.footer, { paddingHorizontal: theme.space.gutter }]}>
        {ready ? null : (
          <Text variant="caption" tone="muted" align="center" testID="change-day-hint">
            {t({ id: 'planDraft.change.hint', message: 'Pick a reason or write a few words.' })}
          </Text>
        )}
        {props.counter === null ? null : (
          <Text variant="caption" tone="muted" align="center">
            {props.counter}
          </Text>
        )}
      </View>
    );
  return (
    <SheetScreen
      title={t({ id: 'planDraft.change.title', message: 'Change a day' })}
      cancelLabel={t({ id: 'plan.premium.draft.cancel', message: 'Cancel' })}
      {...(props.spent === null
        ? {
            verb: {
              label: t({ id: 'plan.premium.draft.redraft', message: 'Redraft' }),
              onPress: () => {
                props.onSubmit();
                return false;
              },
              disabled: !ready || picked === undefined || props.sending,
              testID: 'change-day-submit',
            },
          }
        : {})}
      {...(footer === undefined ? {} : { footer })}
      testID="change-day"
    >
      <View style={[styles.body, { paddingHorizontal: theme.space.gutter }]}>
        <View style={styles.head}>
          <CritterSticker kind={guide.kind} name={guide.name} pose="think" size={56} />
          <Text variant="captionMuted" style={styles.grow}>
            {t({
              id: 'planDraft.change.eyebrow',
              message: `${destination} · ${guideName}’s draft`,
            })}
          </Text>
        </View>
        <Text variant="label" tone="muted">
          {t({ id: 'planDraft.change.which', message: 'Which day?' })}
        </Text>
        <DayChips chips={chips} chosen={day} size="small" onChoose={props.onDay} />
        {picked === undefined ? null : (
          <PremiumDaySummary key={picked.dayNo} day={picked} locale={locale} />
        )}
        <Text variant="label" tone="muted">
          {t({ id: 'planDraft.change.what', message: 'What should change?' })}
        </Text>
        <PremiumReasonChips selected={props.reasons} onToggle={props.onReason} />
        <TextField
          value={props.note}
          onChangeText={props.onNote}
          placeholder={t({ id: 'planDraft.change.note', message: 'Anything else?' })}
          accessibilityLabel={t({ id: 'planDraft.change.note', message: 'Anything else?' })}
          multiline
          maxLength={280}
          testID="change-day-note"
        />
        {props.problem === null ? null : (
          <Text variant="rowText" color={theme.color.destructive.text} testID="change-day-problem">
            {props.problem}
          </Text>
        )}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, paddingTop: 8, paddingBottom: 24 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  footer: { gap: 6, paddingTop: 8 },
});
