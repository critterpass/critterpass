/**
 * One expense in a money list (LATEST on Balances, the history): its category doodle, the title
 * in caps, "Rp 1.08M · Maya paid · Jordan left out", and the crew-currency amount on the right in
 * tabular figures, so a column of rows lines up digit under digit. A row still waiting to upload
 * carries the pending-sync treatment. Memoised: a list re-renders only the rows that changed.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { memo } from 'react';

import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Amount } from '@/ui/money/Amount';
import { PressScale } from '@/ui/press/PressScale';
import { PendingSync } from '@/ui/states/PendingSync';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import type { ExpenseItem } from '../data/expense-items';
import { homeEquivalent, useMoneyDisplay } from '@/data/money';

import { formatAmount, formatShort } from '../format';
import { CATEGORY_ICON, useCategoryLabel } from './category';

const useStyles = makeStyles((t) => ({
  row: { minHeight: MIN_TOUCH_TARGET, paddingVertical: t.space['8'], gap: t.space['12'] },
  body: { flex: 1 },
}));

export interface ExpenseListRowProps {
  readonly item: ExpenseItem;
  readonly crewCurrency: string;
  /** Opens the expense; called with its id, so a list passes one handler to every row. */
  readonly onOpen: (id: string) => void;
  readonly testID?: string;
}

export const ExpenseListRow = memo(function ExpenseListRow({
  item,
  crewCurrency,
  onOpen,
  testID,
}: ExpenseListRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  useMoneyDisplay();
  const { t } = useLingui();
  const categoryLabel = useCategoryLabel();
  const title = item.title === '' ? categoryLabel(item.category) : item.title;
  const payer = item.payerName;
  const names = item.leftOut.join(', ');
  const parts = [
    item.currency === crewCurrency ? null : formatShort(item.amountMinor, item.currency, locale),
    homeEquivalent(item.amountMinor, item.currency, locale),
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
      <PressScale
        onPress={() => onOpen(item.id)}
        accessibilityLabel={[title, parts.join(', '), amount].join(', ')}
        widthClass="wide"
        {...(testID === undefined ? {} : { testID })}
      >
        <Row align="flex-start" style={styles.row}>
          <Icon name={CATEGORY_ICON[item.category]} size={28} decorative />
          <Stack gap="2" style={styles.body}>
            <Text variant="rowTitle" numberOfLines={2}>
              {upper(title, locale)}
            </Text>
            <PrivateContent>
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {parts.join(' · ')}
              </Text>
            </PrivateContent>
          </Stack>
          <PrivateContent>
            <Amount
              variant="rowTitle"
              style={item.pending === 'delete' ? { textDecorationLine: 'line-through' } : undefined}
            >
              {amount}
            </Amount>
          </PrivateContent>
        </Row>
      </PressScale>
    </PendingSync>
  );
});
