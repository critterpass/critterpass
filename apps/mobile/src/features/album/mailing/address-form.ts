/**
 * The postal address form's rules: which fields are needed, what each field says when it is not
 * right yet, and the fields as the save command takes them (optional lines left out when blank).
 */
import { mailingAddressFieldsSchema, type MailingAddressFields } from '@cp/domain';

export type AddressDraft = Record<keyof MailingAddressFields, string>;

export const EMPTY_ADDRESS: AddressDraft = {
  name: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postal_code: '',
  country: '',
};

export type AddressProblem = 'needed' | 'long';

const REQUIRED: readonly (keyof AddressDraft)[] = ['name', 'line1', 'city', 'country'];
const MAX: Readonly<Record<keyof AddressDraft, number>> = {
  name: 120,
  line1: 120,
  line2: 120,
  city: 120,
  region: 80,
  postal_code: 20,
  country: 2,
};

/** What is wrong, per field; empty when the address can be saved. */
export function addressProblems(
  draft: AddressDraft,
): Partial<Record<keyof AddressDraft, AddressProblem>> {
  const problems: Partial<Record<keyof AddressDraft, AddressProblem>> = {};
  for (const key of Object.keys(MAX) as (keyof AddressDraft)[]) {
    const value = draft[key].trim();
    if (value.length === 0) {
      if (REQUIRED.includes(key)) problems[key] = 'needed';
    } else if (value.length > MAX[key]) {
      problems[key] = 'long';
    }
  }
  return problems;
}

/** The form's fields as the command takes them; null while a field is not right. */
export function addressFields(draft: AddressDraft): MailingAddressFields | null {
  const parsed = mailingAddressFieldsSchema.safeParse({
    name: draft.name,
    line1: draft.line1,
    city: draft.city,
    country: draft.country.trim().toUpperCase(),
    ...(draft.line2.trim() ? { line2: draft.line2 } : {}),
    ...(draft.region.trim() ? { region: draft.region } : {}),
    ...(draft.postal_code.trim() ? { postal_code: draft.postal_code } : {}),
  });
  return parsed.success ? parsed.data : null;
}
