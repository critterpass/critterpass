/**
 * The address form's state and commands, for either look: the draft, its problems once a save was
 * tried, whether an address is already saved (and where), the country picker and the remove
 * question, and save and remove through the command queue with the island toast's outcome.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useOnline } from '@/data/places/server-name-search';
import { regionName } from '@/features/onboarding';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { useCommandFeedback } from '@/motion/island-toast';

import { saveMailingAddressCommand } from '../commands';
import {
  addressFields,
  addressProblems,
  EMPTY_ADDRESS,
  type AddressDraft,
  type AddressProblem,
} from './address-form';
import { useAddressPresence } from './use-mailing';

export function useAddressScreen() {
  const { t } = useLingui();
  const locale = useLocale();
  const online = useOnline();
  const { report } = useCommandFeedback();
  const save = useCommand(saveMailingAddressCommand);
  const [refresh, setRefresh] = useState(0);
  const presence = useAddressPresence(refresh + (online ? 1 : 0));
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_ADDRESS);
  /** Problems show once the traveller has tried to save, then follow the typing. */
  const [checked, setChecked] = useState(false);
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const problems = checked ? addressProblems(draft) : {};
  const savedCountry = presence?.country
    ? (regionName(presence.country, locale) ?? presence.country)
    : '';
  const set = (key: keyof AddressDraft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const say = (problem: AddressProblem | undefined) =>
    problem === 'needed'
      ? t({ id: 'album.address.needed', message: 'Needed for the printer' })
      : problem === 'long'
        ? t({ id: 'album.address.long', message: 'Too long for the label' })
        : undefined;

  async function onSave() {
    if (save.pending) return;
    const fields = addressFields(draft);
    if (fields === null) {
      setChecked(true);
      return;
    }
    const outcome = report(await save.send({ fields }), {
      id: 'album-address',
      done: t({ id: 'album.address.savedToast', message: 'Address saved' }),
      needsSignal: t({ id: 'album.address.offline', message: 'Needs signal to save your address' }),
      refused: t({ id: 'album.address.failed', message: "Couldn't save it. Check the fields" }),
    });
    if (outcome === 'done') goBackOr();
  }

  async function onRemove() {
    setRemoving(false);
    if (save.pending) return;
    const outcome = report(await save.send({ fields: null }), {
      id: 'album-address',
      done: t({ id: 'album.address.removed', message: 'Address removed' }),
      needsSignal: t({
        id: 'album.address.removeOffline',
        message: 'Needs signal to remove your address',
      }),
      refused: t({ id: 'album.address.removeFailed', message: "Couldn't remove it. Try again" }),
    });
    if (outcome === 'done') setRefresh((n) => n + 2);
  }

  return {
    online,
    pending: save.pending,
    saved: presence?.saved === true,
    savedCountry,
    draft,
    problems,
    say,
    set,
    countryName: draft.country === '' ? null : (regionName(draft.country, locale) ?? draft.country),
    pickCountry: (code: string) => {
      setDraft((d) => ({ ...d, country: code }));
      setPicking(false);
    },
    picking,
    setPicking,
    removing,
    setRemoving,
    onSave: () => void onSave(),
    onRemove: () => void onRemove(),
  };
}

export type AddressScreenModel = ReturnType<typeof useAddressScreen>;
