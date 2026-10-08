/**
 * "It didn't arrive", asked before it is sent (undesigned; a confirm sheet with one field): the
 * payer is told their payment is disputed, so the payee confirms first and can say what they see
 * ("Nothing in my account yet"). The note is optional and shows on the payment for both of them.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

/** The server keeps a dispute note this long at most. */
export const DISPUTE_NOTE_MAX = 280;

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.space['16'], paddingBottom: t.space['16'], gap: t.space['16'] },
}));

export function DisputeSheet({
  payerName,
  onConfirm,
  onCancel,
}: {
  readonly payerName: string;
  /** The trimmed note, empty when none was written. */
  readonly onConfirm: (note: string) => void;
  readonly onCancel: () => void;
}) {
  const styles = useStyles();
  const locale = useLocale();
  const { t } = useLingui();
  const [note, setNote] = useState('');
  const title = t({ id: 'money.pay.disputeTitle', message: 'Tell them it didn’t arrive?' });
  return (
    <Sheet
      detents={['fit']}
      title={title}
      onDismiss={onCancel}
      accessibilityLabel={title}
      testID="money-pay-dispute-sheet"
    >
      <View style={styles.body}>
        <Text variant="body">
          {t({
            id: 'money.pay.disputeLine',
            message: `${payerName} sees the payment as disputed and can mark it paid again.`,
          })}
        </Text>
        <TextField
          label={t({ id: 'money.pay.disputeNote', message: 'Add a note (optional)' })}
          value={note}
          onChangeText={setNote}
          maxLength={DISPUTE_NOTE_MAX}
          maxLines={3}
          testID="money-pay-dispute-note"
        />
        <PillButton
          label={upper(t({ id: 'money.pay.dispute', message: "It didn't arrive" }), locale)}
          onPress={() => onConfirm(note.trim())}
          variant="destructive"
          block
          testID="money-pay-dispute-confirm"
        />
        <PillButton
          label={upper(t({ id: 'money.pay.disputeCancel', message: 'Not yet' }), locale)}
          onPress={onCancel}
          variant="tertiary"
          block
          testID="money-pay-dispute-cancel"
        />
      </View>
    </Sheet>
  );
}
