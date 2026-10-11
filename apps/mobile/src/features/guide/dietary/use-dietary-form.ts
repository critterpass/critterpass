/**
 * The dietary form's state for any view of it: the phone's copy first (refreshed from the server
 * when online), a draft edited in place, and `save`, which goes through the offline queue (turning
 * sharing off withdraws the consent, which deletes the crew's flags; `grantConsent` grants it with
 * the save).
 */
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import {
  EMPTY_PROFILE,
  refreshDietary,
  useDietary,
  useSaveDietary,
  type DietaryProfile,
  type DietaryServices,
} from './dietary-data';

export function useDietaryForm(services: DietaryServices) {
  const { db } = useLocalFirst();
  const stored = useDietary();
  const actions = useSaveDietary();
  const [draft, setDraft] = useState<DietaryProfile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void refreshDietary(db, services, new Date());
  }, [db, services]);

  const profile = draft ?? stored.profile ?? EMPTY_PROFILE;
  const wasSharing = stored.profile?.visibility === 'crew_flags';
  const edit = (next: DietaryProfile) => {
    setDraft(next);
    setSaved(false);
  };
  const save = async (next: DietaryProfile, grantConsent = false) => {
    if (wasSharing && next.visibility === 'self') await actions.stopSharing(next);
    else await actions.save(next, { grantConsent });
    setDraft(null);
    setSaved(true);
  };

  return {
    profile,
    dirty: draft !== null,
    consented: stored.consented,
    wasSharing,
    edit,
    save,
    saving: actions.pending,
    saved,
  };
}
