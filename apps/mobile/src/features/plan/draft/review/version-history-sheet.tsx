/**
 * Every private draft of the trip, newest first: when it was made, how many days and what it
 * costs each. The current one is marked; any earlier one can be restored (it becomes the draft
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

export interface VersionHistorySheetProps {
  readonly entries: readonly HistoryEntry[];
  readonly locale: string;
  readonly onRestore: (entry: HistoryEntry) => void;
  readonly onClose: () => void;
}

export function VersionHistorySheet({
  entries,
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
            entry.costPpMinor === null || entry.currency === null
              ? null
              : estimateMoney(locale, entry.costPpMinor, entry.currency);
          return (
            <View key={entry.id} style={styles.row} testID={`draft-history-${entry.id}`}>
              <View style={styles.grow}>
                <Text variant="title">
                  {t({ id: 'planDraft.history.made', message: `Draft of ${when}` })}
                </Text>
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {cost === null
                    ? t({ id: 'planDraft.history.days', message: `${days} days` })
                    : t({
                        id: 'planDraft.history.daysCost',
                        message: `${days} days · ${cost} each`,
                      })}
                </Text>
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
