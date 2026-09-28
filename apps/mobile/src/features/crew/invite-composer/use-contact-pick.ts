/**
 * "Pick from contacts": the system picker (no Contacts permission; the route hands it in from
 * modules/cp-contact-picker) fills the friend's name and number. Only that one person is read; the
 * number stays in the draft until the invite goes out or the composer closes, and leaves the device
 * only as the E.164 the server hashes plus its home hint. Undefined when the binary has no picker,
 * so the option is hidden.
 */
import { t } from '@lingui/core/macro';
import { getLocales } from 'expo-localization';
import { useCallback } from 'react';

import { DIAL_CODES } from '@cp/content/onboarding';

import { toast } from '@/motion/island-toast';

import type { ContactDraft } from './ContactFields';
import { pickedToE164 } from './home-hint';

/** The one person the system picker returned, or null when the inviter cancelled. */
export type ContactPicker = () => Promise<{ name: string; phone: string | null } | null>;

export interface InviteComposerProps {
  /** Null in a binary without the system contact picker. */
  readonly pickContact?: ContactPicker | null;
}

export function useContactPick(
  picker: ContactPicker | null,
  value: ContactDraft,
  onChange: (next: ContactDraft) => void,
): (() => void) | undefined {
  const pick = useCallback(async () => {
    if (picker === null) return;
    let picked: Awaited<ReturnType<ContactPicker>>;
    try {
      picked = await picker();
    } catch {
      toast.show({
        id: 'composer-contacts-failed',
        title: t({
          id: 'crew.composer.pickFailed',
          message: 'Your contacts didn’t open. Type their name instead.',
        }),
      });
      return;
    }
    if (picked === null) return;
    const region = getLocales()[0]?.regionCode ?? null;
    const phone =
      picked.phone === null ? '' : (pickedToE164(picked.phone, region, DIAL_CODES) ?? picked.phone);
    onChange({
      ...value,
      name: picked.name === '' ? value.name : picked.name,
      phone,
      picked: true,
    });
  }, [picker, value, onChange]);
  return picker === null ? undefined : () => void pick();
}
