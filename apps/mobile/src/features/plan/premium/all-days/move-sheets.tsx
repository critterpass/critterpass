/**
 * Moving a stop to another day in the premium look (4.28's "Move a stop" and the drop's preview;
 * built from the sheet kit): pick one of the day's stops, then the day it goes to on the day chips;
 * before it moves, both days as they would be (their stops and the time in the car before → after)
 * with Move it, or Suggest it for a member. A day that can't take it says why. The shared
 * `AllDaysScreen` plans the move and sends it through the editor.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import type { DayItem } from '@/data/plan/plan-model';
import { useLocale } from '@/lib/i18n/use-locale';
import { Button, Card, Text, usePremiumTheme } from '@/ui/premium';

import type { MovePreviewProps, MoveStopSheetProps } from '../../all-days/all-days-props';
import type { DayAfter } from '../../all-days/use-cross-day-drag';
import { refusalLine } from '../../day-plan/refusal';
import { lengthLabel } from '../../trip-map/format';
import { dayChips } from '../../trip-map/sheet-copy';
import { DayChips } from '../plan-map/day-chips';
import { OverlaySheet } from '../sheets/overlay-sheet';

function DayChange({ change }: { readonly change: DayAfter }) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const n = change.day.dayNo;
  const title = change.day.theme ?? t({ id: 'plan.allDays.dayTitle', message: `Day ${n}` });
  const before = lengthLabel(change.before.roadMinutes);
  const after = lengthLabel(change.after.roadMinutes);
  return (
    <Card padded testID={`move-preview-day-${String(n)}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap8 }}>
        <View
          style={{ width: 6, height: 22, borderRadius: 3, backgroundColor: change.day.color }}
        />
        <Text variant="rowTitle" style={{ flex: 1 }} numberOfLines={1}>
          {`${String(n)} · ${title}`}
        </Text>
      </View>
      <Text variant="body" style={{ marginTop: theme.space.gap6 }}>
        {change.after.stops.length === 0
          ? t({ id: 'plan.allDays.preview.empty', message: 'Nothing left on this day' })
          : change.after.stops.map((stop) => stop.title).join(' · ')}
      </Text>
      <Text variant="captionMuted" tone="muted">
        {t({ id: 'plan.allDays.preview.road', message: `In the car: about ${before} → ${after}` })}
      </Text>
    </Card>
  );
}

export function PremiumMovePreview({ stop, plan, canApply, onConfirm, onClose }: MovePreviewProps) {
  const { t } = useLingui();
  const name = stop.title;
  return (
    <OverlaySheet
      title={t({ id: 'plan.allDays.preview.title', message: `Move ${name}?` })}
      closeLabel={t({ id: 'plan.premium.item.close', message: 'Close' })}
      onDismiss={onClose}
      footer={
        plan.ok ? (
          <Button
            label={
              canApply
                ? t({ id: 'plan.allDays.preview.move', message: 'Move it' })
                : t({ id: 'plan.allDays.preview.suggest', message: 'Suggest it to the crew' })
            }
            onPress={onConfirm}
            testID="move-preview-confirm"
          />
        ) : (
          <Button
            variant="secondary"
            label={t({ id: 'plan.allDays.preview.ok', message: 'OK' })}
            onPress={onClose}
            testID="move-preview-ok"
          />
        )
      }
      testID="move-preview"
    >
      {plan.ok ? (
        <>
          <DayChange change={plan.from} />
          <DayChange change={plan.to} />
        </>
      ) : (
        <Text variant="body">{refusalLine(plan.refusal)}</Text>
      )}
    </OverlaySheet>
  );
}

export function PremiumMoveStopSheet({ day, days, onPick, onClose }: MoveStopSheetProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const [stop, setStop] = useState<DayItem | null>(null);
  return (
    <OverlaySheet
      title={
        stop === null
          ? t({ id: 'plan.allDays.move.pickStop', message: 'Move which stop?' })
          : t({ id: 'plan.allDays.move.pickDay', message: 'Move to day…' })
      }
      {...(stop === null ? {} : { line: stop.title })}
      closeLabel={t({ id: 'plan.premium.item.close', message: 'Close' })}
      onDismiss={onClose}
      testID="move-stop-sheet"
    >
      {stop === null ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}>
          {day.stops.map((one) => (
            <Button
              key={one.stableId}
              size="small"
              variant="control"
              label={one.title}
              onPress={() => setStop(one)}
              testID={`move-stop-${one.stableId}`}
            />
          ))}
        </View>
      ) : (
        <View testID="move-stop-days">
          <DayChips
            chips={dayChips(
              days.filter((other) => other.dayNo !== day.dayNo),
              locale,
            )}
            chosen={null}
            size="large"
            onChoose={(to) => onPick(stop, to)}
          />
        </View>
      )}
    </OverlaySheet>
  );
}
