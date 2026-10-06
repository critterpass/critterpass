import type { AccountDeletionState, AdminUserDeletion } from '@cp/domain';

export const STATE_LABEL: Readonly<Record<AccountDeletionState, string>> = {
  requested: 'In grace window',
  restored: 'Restored',
  purged: 'Purged',
};

/** The panel's four steps, as the support design draws them. */
export const DELETION_STEPS = [
  { id: 'none', label: 'None', tone: 'success' },
  { id: 'requested', label: 'Requested', tone: 'warning' },
  { id: 'restore', label: 'Restore 30 d', tone: 'warning' },
  { id: 'purged', label: 'Purged', tone: 'urgent' },
] as const;

/** A closed account sits in its restore window; one that came back has no deletion again. */
export const STEP_OF: Readonly<
  Record<AdminUserDeletion['state'], (typeof DELETION_STEPS)[number]['id']>
> = {
  none: 'none',
  requested: 'restore',
  restored: 'none',
  purged: 'purged',
};

export const day = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
