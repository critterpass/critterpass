/**
 * An expense's changes (7.21): each edit and the delete with who made it and when on the trip's
 * clock, then who added it, on a thin rail.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Text, usePremiumTheme } from '@/ui/premium';

import { changeStampText, useFieldLabel } from '../../expense-detail/detail-copy';
import type { ExpenseDetail } from '../../expense-detail/use-expense-detail';

type Ready = Extract<ExpenseDetail, { kind: 'ready' }>;

export function ExpenseChanges({ detail }: { readonly detail: Ready }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const fieldLabel = useFieldLabel();
  const added = detail.added;
  if (detail.history.length === 0 && added === null) return null;
  const adder = added?.name ?? '';
  const addedOn = added === null ? '' : changeStampText(locale, added.at, detail.tz);
  return (
    <View style={{ gap: th.space.gap8, paddingHorizontal: th.space.titleGutter }}>
      <Text variant="label" tone="muted">
        {t({ id: 'money.detail.history', message: 'Changes' })}
      </Text>
      <View style={[styles.timeline, { borderLeftColor: th.color.fieldBorder }]}>
        {detail.history.map((edit) => {
          const on = changeStampText(locale, edit.at, detail.tz);
          const editor = edit.editorName;
          const what = format.list(locale, edit.fields.map(fieldLabel));
          const line =
            edit.kind === 'deleted'
              ? t({ id: 'money.detail.deletedBy', message: `${editor} deleted it · ${on}` })
              : what === ''
                ? t({ id: 'money.detail.editedBy', message: `${editor} edited it · ${on}` })
                : t({ id: 'money.detail.changedBy', message: `${editor} changed ${what} · ${on}` });
          return (
            <Text key={edit.id} variant="caption" testID={`money-detail-edit-${edit.id}`}>
              {line}
            </Text>
          );
        })}
        {added === null ? null : (
          <Text variant="caption" testID="money-detail-added">
            {t({ id: 'money.premium.detail.addedBy', message: `${adder} added it · ${addedOn}` })}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: { borderLeftWidth: 2, paddingLeft: 14, gap: 10 },
});
