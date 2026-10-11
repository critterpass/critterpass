/**
 * Adding or changing the member's policy (the form; its logic is `useInsuranceForm`).
 */
import { InsuranceFormView } from './InsuranceFormView';
import { useInsuranceForm } from './use-insurance-form';

export function InsuranceFormScreen() {
  const form = useInsuranceForm();
  return (
    <InsuranceFormView
      draft={form.draft}
      doc={form.doc}
      canScan={form.canScan}
      saving={form.saving}
      error={form.error}
      canDelete={form.canDelete}
      onChange={form.onChange}
      onScan={() => void form.scan()}
      onSave={() => void form.submit()}
      onDelete={() => void form.remove()}
    />
  );
}
