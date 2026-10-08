/**
 * The policy form (undesigned; text fields and pills): provider, policy number, assistance line,
 * and SCAN THE POLICY (the platform document scanner; what it reads fills empty fields and the
 * page is kept with the policy). Saving needs signal because the values are sealed on arrival;
 * the phone keeps its own copy for airplane mode.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { BOOKINGS_ROUTES } from '@/features/bookings/routes';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
}));

export type DocState = 'none' | 'scanning' | 'attached' | 'failed';

export interface InsuranceDraft {
  readonly provider: string;
  readonly policyNo: string;
  readonly phone: string;
}

export interface InsuranceFormViewProps {
  readonly draft: InsuranceDraft;
  readonly doc: DocState;
  /** The phone has the document scanner. */
  readonly canScan: boolean;
  readonly saving: boolean;
  readonly error: 'offline' | 'failed' | null;
  readonly canDelete: boolean;
  readonly onChange: (patch: Partial<InsuranceDraft>) => void;
  readonly onScan: () => void;
  readonly onSave: () => void;
  readonly onDelete: () => void;
}

export function InsuranceFormView(props: InsuranceFormViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { draft } = props;
  const ready = draft.provider.trim() !== '' && draft.policyNo.trim() !== '';
  const docLine =
    props.doc === 'attached'
      ? t({ id: 'bookings.insurance.docAttached', message: 'Policy page kept with it.' })
      : props.doc === 'failed'
        ? t({
            id: 'bookings.insurance.docFailed',
            message: "Couldn't keep the page. Try the scan again with signal.",
          })
        : null;
  return (
    <Scaffold variant="dark" testID="bookings-insurance-form">
      <KeyboardScrollView contentContainerStyle={styles.content}>
        <BackEyebrow
          label={upper(t({ id: 'bookings.back', message: 'Bookings' }), locale)}
          fallback={BOOKINGS_ROUTES.wallet}
        />
        <Text variant="h1" accessibilityRole="header">
          {upper(t({ id: 'bookings.insurance.title', message: 'Travel insurance' }), locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'bookings.insurance.privacy',
            message:
              'Only you see this. A clinic gets it only when you say yes, one help request at a time.',
          })}
        </Text>
        {props.canScan ? (
          <Stack gap="6">
            <PillButton
              label={t({ id: 'bookings.insurance.scan', message: 'Scan the policy' })}
              onPress={props.onScan}
              variant="secondary"
              loading={props.doc === 'scanning'}
              testID="bookings-insurance-scan"
            />
            {docLine === null ? null : (
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {docLine}
              </Text>
            )}
          </Stack>
        ) : null}
        <TextField
          label={t({ id: 'bookings.insurance.provider', message: 'Insurer' })}
          value={draft.provider}
          onChangeText={(provider) => props.onChange({ provider })}
          testID="bookings-insurance-provider"
        />
        <TextField
          label={t({ id: 'bookings.insurance.policyField', message: 'Policy number' })}
          autoCapitalize="characters"
          value={draft.policyNo}
          onChangeText={(policyNo) => props.onChange({ policyNo })}
          testID="bookings-insurance-number"
        />
        <TextField
          label={t({ id: 'bookings.insurance.phoneField', message: 'Assistance phone' })}
          keyboardType="phone-pad"
          value={draft.phone}
          onChangeText={(phone) => props.onChange({ phone })}
          testID="bookings-insurance-phone-field"
        />
        {props.error === null ? null : (
          <Text
            variant="bodySm"
            color={theme.semantic.state.urgent}
            testID="bookings-insurance-error"
          >
            {props.error === 'offline'
              ? t({ id: 'bookings.insurance.offline', message: 'Saving needs signal.' })
              : t({ id: 'bookings.insurance.failed', message: "That didn't save. Try again." })}
          </Text>
        )}
        {props.canDelete ? (
          <PillButton
            label={upper(t({ id: 'bookings.insurance.delete', message: 'Delete policy' }), locale)}
            onPress={props.onDelete}
            variant="destructive"
            testID="bookings-insurance-delete"
          />
        ) : null}
      </KeyboardScrollView>
      <KeyboardFooter>
        <PillButton
          label={t({ id: 'bookings.form.save', message: 'Save' })}
          onPress={props.onSave}
          disabled={!ready}
          loading={props.saving}
          testID="bookings-insurance-save"
        />
      </KeyboardFooter>
    </Scaffold>
  );
}
