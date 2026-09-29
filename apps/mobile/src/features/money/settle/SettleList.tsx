/**
 * Settle up (3i-5): ← MONEY, SETTLE UP, "Tokek netted 23 expenses down to three payments.", the
 * payment rows, HOW PEOPLE PAY YOU with its chips and the privacy line, the Settled Tokek progress
 * and REMIND EVERYONE. Undesigned: nothing to settle, and the square trip with the sticker.
 */
import type { PayoutKind } from '@cp/domain';
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Stack } from '@/ui/layout/Stack';
import { PayMethodChips } from '@/ui/money/PayMethodChips';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { MoneyMember } from '../data/context';
import type { SettleRowModel } from './model';
import { PaymentRow } from './PaymentRow';
import { usePayoutKindLabel } from './payout-labels';
import { SettledTokekReveal } from './SettledTokekReveal';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  bottom: { paddingHorizontal: t.size.gutter, paddingTop: t.space['8'] },
}));

export interface SettleListProps {
  readonly rows: readonly SettleRowModel[];
  readonly members: readonly MoneyMember[];
  readonly expenses: number;
  readonly open: number;
  readonly people: number;
  readonly settled: boolean;
  readonly offline: boolean;
  readonly kinds: readonly PayoutKind[];
  readonly myKinds: readonly PayoutKind[];
  readonly canRemind: boolean;
  readonly reminding: boolean;
  readonly onKind: (kind: PayoutKind) => void;
  readonly onNudge: (row: SettleRowModel) => void;
  readonly onRow: (row: SettleRowModel) => void;
  readonly onRemind: () => void;
}

export function SettleList(props: SettleListProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { t } = useLingui();
  const kindLabel = usePayoutKindLabel();
  const expenses = props.expenses;
  const payments = props.rows.filter((row) => row.status !== 'confirmed').length;
  const line =
    props.rows.length === 0
      ? t({ id: 'money.settle.nothing', message: 'Nothing to settle. Everyone is square.' })
      : t({
          id: 'money.settle.netted',
          message: plural(payments, {
            one: `Tokek netted ${expenses} expenses down to one payment.`,
            other: `Tokek netted ${expenses} expenses down to # payments.`,
          }),
        });
  return (
    <Scaffold variant="dark" testID="money-settle">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <BackEyebrow label={upper(t({ id: 'money.back', message: 'Money' }), locale)} />
        <Text variant="h1" accessibilityRole="header">
          {upper(t({ id: 'money.settle.title', message: 'Settle up' }), locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary} testID="money-settle-line">
          {line}
        </Text>
        {props.offline ? <OfflinePill testID="money-settle-offline" /> : null}
        <Stack gap="8">
          {props.rows.map((row) => (
            <PaymentRow
              key={row.key}
              row={row}
              members={props.members}
              onNudge={() => props.onNudge(row)}
              onPress={() => props.onRow(row)}
            />
          ))}
        </Stack>
        <Card testID="money-pay-you">
          <Stack gap="12">
            <Text variant="eyebrow">
              {upper(t({ id: 'money.settle.payYou', message: 'How people pay you' }), locale)}
            </Text>
            <PayMethodChips
              methods={props.kinds.map((kind) => ({
                id: kind,
                label: upper(kindLabel(kind), locale),
              }))}
              selected={props.myKinds}
              onToggle={(id) => props.onKind(id as PayoutKind)}
              testID="money-pay-methods"
            />
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({
                id: 'money.settle.private',
                message: 'Your details are shared only with the person paying.',
              })}
            </Text>
          </Stack>
        </Card>
        {props.rows.length === 0 && !props.settled ? null : (
          <SettledTokekReveal open={props.open} people={props.people} settled={props.settled} />
        )}
      </ScrollView>
      {props.canRemind ? (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + theme.space['8'] }]}>
          <PillButton
            label={upper(t({ id: 'money.settle.remind', message: 'Remind everyone' }), locale)}
            onPress={props.onRemind}
            loading={props.reminding}
            block
            testID="money-settle-remind"
          />
        </View>
      ) : null}
    </Scaffold>
  );
}
