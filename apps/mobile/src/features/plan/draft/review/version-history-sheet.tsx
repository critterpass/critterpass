/**
 * Every private draft of the trip, newest first, named by what it was (the guide's first draft, a
 * day redrafted, a draft changed by hand) with when it was made, how many days and what it costs
 * each on the second line. The current one is marked; any earlier one can be restored (it becomes the draft
 * again, still private). Undesigned: built from the sheet, rows and pill buttons.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { estimateMoney } from '../data/format';
import type { DraftOrigin } from '../data/history';
import type { HistoryEntry } from '../data/use-draft-version';
import { clockOption } from '@/lib/i18n/formats';

const useStyles = makeStyles((th) => ({
  list: { paddingHorizontal: th.size.gutter, gap: th.space['10'], paddingBottom: th.space['16'] },
  row: {
    backgroundColor: th.semantic.bg.control,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
  },
  grow: { flex: 1, gap: th.space['2'] },
}));

/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
function madeAt(locale: string, iso: string): string {
  const at = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    ...clockOption(),
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}
/* eslint-enable lingui/no-unlocalized-strings */

function originLabel(origin: DraftOrigin, guideName: string): string {
  switch (origin.kind) {
    case 'first':
      return t({ id: 'planDraft.history.first', message: `${guideName}’s first draft` });
    case 'drafted':
      return t({ id: 'planDraft.history.drafted', message: `${guideName} drafted it again` });
    case 'redraft': {
      const n = origin.dayNo;
      return n === null
        ? t({ id: 'planDraft.history.redraftAny', message: 'A day redrafted' })
        : t({ id: 'planDraft.history.redraft', message: `Day ${n} redrafted` });
    }
    case 'put_back': {
      const n = origin.dayNo;
      return n === null
        ? t({ id: 'planDraft.history.putBackAny', message: 'A redraft you put back' })
        : t({ id: 'planDraft.history.putBack', message: `Day ${n} redrafted, put back` });
    }
    case 'changed':
      return t({ id: 'planDraft.history.changed', message: 'Changed by you' });
    case 'own':
      return t({ id: 'planDraft.history.own', message: 'The plan you started' });
  }
}

/** Under a redraft she put back: what restoring it does, and that it costs her nothing. */
function putBackLine(dayNo: number | null): string {
  const n = dayNo;
  return n === null
    ? t({
        id: 'planDraft.history.putBackRestoreAny',
        message: 'Restoring brings back the draft as it was redrafted. It doesn’t use a redraft.',
      })
    : t({
        id: 'planDraft.history.putBackRestore',
        message: `Restoring brings back the draft with day ${n} as redrafted. It doesn’t use a redraft.`,
      });
}

export interface VersionHistorySheetProps {
  readonly entries: readonly HistoryEntry[];
  readonly guideName: string;
  readonly locale: string;
  readonly onRestore: (entry: HistoryEntry) => void;
  readonly onClose: () => void;
}

export function VersionHistorySheet({
  entries,
  guideName,
  locale,
  onRestore,
  onClose,
}: VersionHistorySheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Sheet
      title={t({ id: 'planDraft.history.title', message: 'Earlier drafts' })}
      detents={['medium', 'large']}
      onDismiss={onClose}
      testID="draft-history"
    >
      <SheetScrollView contentContainerStyle={styles.list}>
        {entries.map((entry) => {
          const when = madeAt(locale, entry.createdAt);
          const days = entry.days;
          const cost =
            entry.costPpMinor === null || entry.costPpMinor <= 0 || entry.currency === null
              ? null
              : estimateMoney(locale, entry.costPpMinor, entry.currency);
          return (
            <View key={entry.id} style={styles.row} testID={`draft-history-${entry.id}`}>
              <View style={styles.grow}>
                <Text variant="title">{originLabel(entry.origin, guideName)}</Text>
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {cost === null
                    ? t({ id: 'planDraft.history.whenDays', message: `${when} · ${days} days` })
                    : t({
                        id: 'planDraft.history.whenDaysCost',
                        message: `${when} · ${days} days · ${cost} each`,
                      })}
                </Text>
                {entry.origin.kind !== 'put_back' || entry.current ? null : (
                  <Text
                    variant="bodySm"
                    color={theme.semantic.text.secondary}
                    testID="draft-history-put-back-line"
                  >
                    {putBackLine(entry.origin.dayNo)}
                  </Text>
                )}
              </View>
              {entry.current ? (
                <Text variant="label" color={theme.semantic.state.success}>
                  {t({ id: 'planDraft.history.current', message: 'Current' })}
                </Text>
              ) : (
                <PillButton
                  size="sm"
                  variant="secondary"
                  label={t({ id: 'planDraft.history.restore', message: 'Restore' })}
                  onPress={() => onRestore(entry)}
                  testID="draft-history-restore"
                />
              )}
            </View>
          );
        })}
      </SheetScrollView>
    </Sheet>
  );
}
