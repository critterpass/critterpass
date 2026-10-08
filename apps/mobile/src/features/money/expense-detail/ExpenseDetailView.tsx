/**
 * Expense detail (undesigned, built from the Balances type scale and settings rows): the amount as
 * entered, what it came to in the crew currency with the rate and its date, who paid, each share
 * (or who was left out), whether it came from a receipt scan, the edit history, and EDIT / DELETE
 * for whoever may change it.
 */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { InfoPill } from '@/ui/chips/InfoPill';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Amount } from '@/ui/money/Amount';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useCategoryLabel } from '../components/category';
import type { ExpenseItem } from '../data/expense-items';
import { useMoneyDisplay } from '@/data/money';

import { calendarDate, formatAmount, formatAmountShown } from '../format';
import type { EditField, FxLine } from './model';
import { MONEY_ROUTES } from '../routes';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
}));

export interface DetailShare {
  readonly userId: string;
  readonly name: string;
  /** Crew-currency share; 0 = left out. */
  readonly crewMinor: bigint;
}

export interface DetailEdit {
  readonly id: string;
  readonly editorName: string;
  readonly kind: 'edited' | 'deleted';
  readonly fields: readonly EditField[];
  readonly at: string;
}

export interface ExpenseDetailViewProps {
  readonly item: ExpenseItem;
  readonly crewCurrency: string;
  readonly fx: FxLine | null;
  readonly shares: readonly DetailShare[];
  readonly edits: readonly DetailEdit[];
  readonly canChange: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

function useFieldLabel() {
  const { t } = useLingui();
  return (field: EditField) => {
    switch (field) {
      case 'amount':
        return t({ id: 'money.detail.field.amount', message: 'the amount' });
      case 'payer':
        return t({ id: 'money.detail.field.payer', message: 'who paid' });
      case 'split':
        return t({ id: 'money.detail.field.split', message: 'the split' });
      case 'what':
        return t({ id: 'money.detail.field.what', message: 'the name' });
      case 'category':
        return t({ id: 'money.detail.field.category', message: 'the category' });
      case 'when':
        return t({ id: 'money.detail.field.when', message: 'the date' });
    }
  };
}

export function ExpenseDetailView(props: ExpenseDetailViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  useMoneyDisplay();
  const { t } = useLingui();
  const categoryLabel = useCategoryLabel();
  const fieldLabel = useFieldLabel();
  const { item } = props;
  const title = item.title === '' ? categoryLabel(item.category) : item.title;
  const when =
    item.spentAt === ''
      ? ''
      : format.date(locale, new Date(item.spentAt), { dateStyle: 'medium', timeStyle: 'short' });
  const payer = item.payerName;
  const converted =
    item.crewAmountMinor !== null && item.currency !== props.crewCurrency
      ? formatAmount(item.crewAmountMinor, props.crewCurrency, locale)
      : null;
  const fx = props.fx;
  const rateLine =
    fx === null
      ? null
      : (() => {
          const rate = format.number(locale, fx.rate, { maximumSignificantDigits: 6 });
          const from = fx.from;
          const to = fx.to;
          const on =
            fx.asOf === null
              ? ''
              : format.date(locale, calendarDate(fx.asOf), {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                });
          return on === ''
            ? t({ id: 'money.detail.rateNoDate', message: `Rate 1 ${from} = ${rate} ${to}` })
            : t({
                id: 'money.detail.rate',
                message: `Rate 1 ${from} = ${rate} ${to} on ${on}`,
              });
        })();
  return (
    <Scaffold variant="dark" testID="money-expense-detail">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + theme.space['32'] },
        ]}
      >
        <BackEyebrow
          label={upper(t({ id: 'money.back', message: 'Money' }), locale)}
          fallback={MONEY_ROUTES.balances}
        />
        <Row gap="8" align="center">
          <InfoPill variant="outline">{upper(categoryLabel(item.category), locale)}</InfoPill>
          {item.pending !== null ? (
            <InfoPill variant="outline" testID="money-detail-pending">
              {upper(t({ id: 'money.detail.pending', message: 'Waiting to sync' }), locale)}
            </InfoPill>
          ) : null}
        </Row>
        <Text variant="h1" accessibilityRole="header">
          {upper(title, locale)}
        </Text>
        <PrivateContent>
          <Stack gap="4">
            <Text variant="displayXl" testID="money-detail-amount">
              {formatAmountShown(item.amountMinor, item.currency, locale)}
            </Text>
            {converted === null ? null : (
              <Text variant="body" color={theme.semantic.text.secondary}>
                {`≈ ${converted}`}
              </Text>
            )}
            {rateLine === null ? null : (
              <Text
                variant="bodySm"
                color={theme.semantic.text.secondary}
                testID="money-detail-rate"
              >
                {rateLine}
              </Text>
            )}
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {[payer === '' ? null : t({ id: 'money.row.paid', message: `${payer} paid` }), when]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {item.fromReceipt ? (
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {t({ id: 'money.detail.receipt', message: 'Split from a receipt scan' })}
              </Text>
            ) : null}
          </Stack>
        </PrivateContent>
        <SettingsGroup
          title={upper(t({ id: 'money.detail.shares', message: 'Who owes what' }), locale)}
          testID="money-detail-shares"
          rows={props.shares.map((share) => ({
            key: share.userId,
            kind: 'custom' as const,
            title: share.name,
            trailing: (
              <PrivateContent>
                <Amount
                  variant="rowTitle"
                  color={share.crewMinor === 0n ? theme.semantic.text.secondary : undefined}
                >
                  {share.crewMinor === 0n
                    ? t({ id: 'money.detail.leftOut', message: 'Left out' })
                    : formatAmount(share.crewMinor, props.crewCurrency, locale)}
                </Amount>
              </PrivateContent>
            ),
          }))}
        />
        {props.edits.length === 0 ? null : (
          <Stack gap="8" testID="money-detail-history">
            <Text variant="eyebrow">
              {upper(t({ id: 'money.detail.history', message: 'Changes' }), locale)}
            </Text>
            {props.edits.map((edit) => {
              const editor = edit.editorName;
              const what = edit.fields.map(fieldLabel).join(', ');
              const on = format.date(locale, new Date(edit.at), { day: 'numeric', month: 'short' });
              return (
                <Text key={edit.id} variant="bodySm" color={theme.semantic.text.secondary}>
                  {edit.kind === 'deleted'
                    ? t({ id: 'money.detail.deletedBy', message: `${editor} deleted it · ${on}` })
                    : what === ''
                      ? t({ id: 'money.detail.editedBy', message: `${editor} edited it · ${on}` })
                      : t({
                          id: 'money.detail.changedBy',
                          message: `${editor} changed ${what} · ${on}`,
                        })}
                </Text>
              );
            })}
          </Stack>
        )}
        {props.canChange && item.pending !== 'delete' ? (
          <Stack gap="8">
            <PillButton
              label={upper(t({ id: 'money.detail.edit', message: 'Edit' }), locale)}
              onPress={props.onEdit}
              variant="secondary"
              block
              testID="money-detail-edit"
            />
            <PillButton
              label={upper(t({ id: 'money.detail.delete', message: 'Delete' }), locale)}
              onPress={props.onDelete}
              variant="destructive"
              block
              testID="money-detail-delete"
            />
          </Stack>
        ) : null}
      </ScrollView>
    </Scaffold>
  );
}
