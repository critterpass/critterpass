/**
 * One expense in a money list (LATEST on Balances, the history): its category doodle, the title
 * in caps, "Rp 1.08M · Maya paid · Jordan left out", and the crew-currency amount on the right.
 * A row still waiting to upload carries the pending-sync treatment.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PendingSync } from '@/ui/states/PendingSync';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import type { ExpenseItem } from '../data/expense-items';
import { formatAmount, formatShort } from '../format';
import { CATEGORY_ICON, useCategoryLabel } from './category';

const useStyles = makeStyles((t) => ({
  row: { minHeight: MIN_TOUCH_TARGET, paddingVertical: t.space['8'], gap: t.space['12'] },
  body: { flex: 1 },
}));

export interface ExpenseListRowProps {
  readonly item: ExpenseItem;
  readonly crewCurrency: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

export function ExpenseListRow({ item, crewCurrency, onPress, testID }: ExpenseListRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const categoryLabel = useCategoryLabel();
  const title = item.title === '' ? categoryLabel(item.category) : item.title;
  const payer = item.payerName;
  const names = item.leftOut.join(', ');
  const parts = [
    item.currency === crewCurrency ? null : formatShort(item.amountMinor, item.currency, locale),
    payer === '' ? null : t({ id: 'money.row.paid', message: `${payer} paid` }),
    item.leftOut.length === 0
      ? null
      : t({
          id: 'money.row.leftOut',
          message: `${names} left out`,
        }),
  ].filter((part): part is string => part !== null);
  const amount =
    item.crewAmountMinor === null
      ? formatAmount(item.amountMinor, item.currency, locale)
      : formatAmount(item.crewAmountMinor, crewCurrency, locale);
  const pendingLabel =
    item.pending === 'delete'
      ? t({ id: 'money.row.pendingDelete', message: 'Deleting when you are back online' })
      : t({ id: 'money.row.pending', message: 'Waiting to sync' });
  return (
    <PendingSync pending={item.pending !== null} accessibilityLabel={pendingLabel}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[title, parts.join(', '), amount].join(', ')}
        testID={testID}
      >
        <Row align="flex-start" style={styles.row}>
          <Icon name={CATEGORY_ICON[item.category]} size={28} decorative />
          <Stack gap="2" style={styles.body}>
            <Text variant="rowTitle" numberOfLines={2}>
              {upper(title, locale)}
            </Text>
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {parts.join(' · ')}
            </Text>
          </Stack>
          <View>
            <Text
              variant="rowTitle"
              style={item.pending === 'delete' ? { textDecorationLine: 'line-through' } : undefined}
            >
              {amount}
            </Text>
          </View>
        </Row>
      </Pressable>
    </PendingSync>
  );
}
