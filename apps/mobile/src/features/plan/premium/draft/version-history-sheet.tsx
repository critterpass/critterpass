/**
 * Every private draft of the trip, newest first (undesigned; built from the overlay sheet, the
 * list card and the buttons): named by what it was (the guide's first draft, a day redrafted, a
 * draft changed by hand) with when it was made, how many days and what it costs each. The current
 * one is marked; any earlier one can be restored (it becomes the draft again, still private).
 */
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Button, ListCard, Text, usePremiumTheme } from '@/ui/premium';

import { estimateMoney } from '../../draft/data/format';
import {
  madeAt,
  originLabel,
  putBackLine,
  type VersionHistorySheetProps,
} from '../../draft/review/history-words';
import { OverlaySheet } from '../sheets/overlay-sheet';

export function PremiumVersionHistorySheet({
  entries,
  guideName,
  locale,
  onRestore,
  onClose,
}: VersionHistorySheetProps) {
  const theme = usePremiumTheme();
  return (
    <OverlaySheet
      title={t({ id: 'planDraft.history.title', message: 'Earlier drafts' })}
      closeLabel={t({ id: 'plan.premium.share.close', message: 'Close' })}
      onDismiss={onClose}
      tall
      testID="draft-history"
    >
      <ListCard>
        {entries.map((entry) => {
          const when = madeAt(locale, entry.createdAt);
          const days = entry.days;
          const cost =
            entry.costPpMinor === null || entry.costPpMinor <= 0 || entry.currency === null
              ? null
              : estimateMoney(locale, entry.costPpMinor, entry.currency);
          return (
            <View
              key={entry.id}
              testID={`draft-history-${entry.id}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap12,
                paddingVertical: theme.space.gap12,
                paddingHorizontal: theme.space.rowPadH,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="rowTextStrong">{originLabel(entry.origin, guideName)}</Text>
                <Text variant="captionMuted" tone="muted">
                  {cost === null
                    ? t({
                        id: 'planDraft.history.whenDays',
                        message: `${when} · ${plural(days, { one: '# day', other: '# days' })}`,
                      })
                    : t({
                        id: 'planDraft.history.whenDaysCost',
                        message: `${when} · ${plural(days, { one: '# day', other: '# days' })} · ${cost} each`,
                      })}
                </Text>
                {entry.origin.kind !== 'put_back' || entry.current ? null : (
                  <Text variant="captionMuted" tone="muted" testID="draft-history-put-back-line">
                    {putBackLine(entry.origin.dayNo)}
                  </Text>
                )}
              </View>
              {entry.current ? (
                <Text variant="label" tone="muted">
                  {t({ id: 'planDraft.history.current', message: 'Current' })}
                </Text>
              ) : (
                <Button
                  alignSelf="auto"
                  size="small"
                  variant="control"
                  label={t({ id: 'planDraft.history.restore', message: 'Restore' })}
                  onPress={() => onRestore(entry)}
                  testID="draft-history-restore"
                />
              )}
            </View>
          );
        })}
      </ListCard>
    </OverlaySheet>
  );
}
