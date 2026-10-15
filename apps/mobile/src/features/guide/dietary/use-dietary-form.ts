/**
 * The dietary form's state for any view of it: the phone's copy first (refreshed from the server
 * when online), a draft edited in place, and `save`, which goes through the offline queue (turning
 * sharing off withdraws the consent, which deletes the crew's flags; `grantConsent` grants it with
 * the save). The form counts as changed only when the draft differs from what it opened with.
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
  // What the form opened with when that isn't the stored copy (sharing chosen on the consent page).
  const [baseline, setBaseline] = useState<DietaryProfile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void refreshDietary(db, services, new Date());
  }, [db, services]);

  const profile = draft ?? stored.profile ?? EMPTY_PROFILE;
  const wasSharing = stored.profile?.visibility === 'crew_flags';
  const base = baseline ?? stored.profile ?? EMPTY_PROFILE;
  const edit = (next: DietaryProfile) => {
    setDraft(next);
    setSaved(false);
  };
  /** Opens the form on `next` as its starting point: an answer, not an edit to discard. */
  const start = (next: DietaryProfile) => {
    setDraft(next);
    setBaseline(next);
    setSaved(false);
  };
  const save = async (next: DietaryProfile, grantConsent = false) => {
    if (wasSharing && next.visibility === 'self') await actions.stopSharing(next);
    else await actions.save(next, { grantConsent });
    setDraft(null);
    setBaseline(null);
    setSaved(true);
  };

  return {
    profile,
    dirty: draft !== null && !sameProfile(draft, base),
    consented: stored.consented,
    wasSharing,
    edit,
    start,
    save,
    saving: actions.pending,
    saved,
  };
}

/** The same needs, whatever order the chips were tapped in and with a cleared note as no note. */
export function sameProfile(a: DietaryProfile, b: DietaryProfile): boolean {
  const set = (list: readonly string[]) => [...list].sort().join('\u0000');
  const note = (text: string | null) => (text ?? '').trim();
  return (
    a.diet === b.diet &&
    a.spice === b.spice &&
    a.visibility === b.visibility &&
    note(a.accessibility_notes) === note(b.accessibility_notes) &&
    set(a.allergies) === set(b.allergies) &&
    set(a.avoid) === set(b.avoid)
  );
}
