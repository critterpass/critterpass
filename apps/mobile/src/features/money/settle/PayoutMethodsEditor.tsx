/**
 * HOW PEOPLE PAY YOU, the editor (undesigned; chips, text fields and a pill): pick a kind from your
 * country's catalogue, fill its fields (checked against the same schema the server uses), SAVE or
 * REMOVE. Details go to the server encrypted and are shown only to the person paying you.
 */
import type { PayoutKind, RevealedPayoutMethod } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { PAYOUT_FIELDS, validDetails } from './payout-details';
import { usePayoutKindLabel } from './payout-labels';
import { MONEY_ROUTES } from '../routes';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  chips: { gap: t.space['8'], flexWrap: 'wrap' },
}));

export interface PayoutMethodsEditorProps {
  readonly kinds: readonly PayoutKind[];
  readonly saved: readonly RevealedPayoutMethod[];
  readonly kind: PayoutKind;
  readonly values: Readonly<Record<string, string>>;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly onKind: (kind: PayoutKind) => void;
  readonly onValue: (field: string, value: string) => void;
  readonly onSave: () => void;
  readonly onRemove: () => void;
}

export function PayoutMethodsEditor(props: PayoutMethodsEditorProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { t } = useLingui();
  const kindLabel = usePayoutKindLabel();
  const fieldLabel = (field: string): string => {
    switch (field) {
      case 'bank_name':
        return t({ id: 'money.payout.field.bank', message: 'Bank' });
      case 'account_name':
        return t({ id: 'money.payout.field.accountName', message: 'Name on the account' });
      case 'account_number':
        return t({ id: 'money.payout.field.account', message: 'Account number' });
      case 'swift':
        return t({ id: 'money.payout.field.swift', message: 'SWIFT code (optional)' });
      case 'proxy':
        return t({ id: 'money.payout.field.mobile', message: 'Mobile number' });
      case 'name':
        return t({ id: 'money.payout.field.name', message: 'Name the payer sees' });
      case 'bank_bin':
        return t({ id: 'money.payout.field.bin', message: 'Bank code (6 digits)' });
      case 'acquirer_id':
        return t({ id: 'money.payout.field.acquirer', message: 'Bank id' });
      default:
        return t({ id: 'money.payout.field.link', message: 'Wise link' });
    }
  };
  const isSaved = props.saved.some((method) => method.kind === props.kind);
  const valid = validDetails(props.kind, props.values) !== null;
  return (
    <Scaffold variant="dark" testID="money-payout-methods">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + theme.space['32'] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <BackEyebrow
          label={upper(t({ id: 'money.pay.back', message: 'Settle up' }), locale)}
          fallback={MONEY_ROUTES.settle}
        />
        <Text variant="h1" accessibilityRole="header">
          {upper(t({ id: 'money.settle.payYou', message: 'How people pay you' }), locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'money.settle.private',
            message: 'Your details are shared only with the person paying.',
          })}
        </Text>
        <Row style={styles.chips}>
          {props.kinds.map((kind) => (
            <ChoiceChip
              key={kind}
              label={upper(kindLabel(kind), locale)}
              selected={kind === props.kind}
              onPress={() => props.onKind(kind)}
              testID={`money-payout-kind-${kind}`}
            />
          ))}
        </Row>
        {props.loading ? (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {t({ id: 'money.payout.loading', message: 'Getting your saved details…' })}
          </Text>
        ) : null}
        <Stack gap="12">
          {PAYOUT_FIELDS[props.kind].map((field) => (
            <TextField
              key={field}
              label={fieldLabel(field)}
              value={props.values[field] ?? ''}
              onChangeText={(value) => props.onValue(field, value)}
              autoCapitalize="none"
              testID={`money-payout-${field}`}
            />
          ))}
          {props.kind === 'cash' ? (
            <Text variant="body">
              {t({ id: 'money.payout.cashLine', message: 'People can hand it to you in person.' })}
            </Text>
          ) : null}
        </Stack>
        <PillButton
          label={upper(t({ id: 'money.payout.save', message: 'Save' }), locale)}
          onPress={props.onSave}
          disabled={!valid}
          loading={props.busy}
          block
          testID="money-payout-save"
        />
        {isSaved ? (
          <PillButton
            label={upper(t({ id: 'money.payout.remove', message: 'Remove' }), locale)}
            onPress={props.onRemove}
            variant="destructive"
            block
            testID="money-payout-remove"
          />
        ) : null}
      </ScrollView>
    </Scaffold>
  );
}
