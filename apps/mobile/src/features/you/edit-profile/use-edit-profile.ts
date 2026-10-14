/**
 * Edit profile's state over the synced `users` row, shared by the current and the premium page.
 * SAVE sends only what changed: a new username needs the server's answer (it may have been taken a
 * second ago), so it is sent online and a refusal shows; a name or home airport alone waits in the
 * offline queue. Leaving with unsaved changes asks first (`leaving`), then the page goes back.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and command names, never copy. */
import type { SetHomeAirportPayload, UpdateProfilePayload } from '@cp/domain';
import { usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';

import { goBackOr } from '@/lib/navigation/back';
import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';

import { useMemberFaces } from '../avatar/member-faces';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { putPendingEdits } from '../data/pending-edits';
import { languageChoices } from '../language/language-names';
import { PENDING_ME, type PendingMe } from '../profile/pending-me';
import { useProfile } from '../profile/use-profile';
import { YOU_ROUTES } from '../routes';
import { saveProblemText } from './edit-profile-copy';
import {
  canSave,
  changesOf,
  draftOf,
  hasChanges,
  languagesOf,
  nameProblemOf,
  type ProfileDraft,
  type SavedProfile,
} from './edit-profile-model';
import { useUsernameState } from './username-check';
import { useWornForm } from './worn-form';

export const updateProfileOnline = defineClientCommand<UpdateProfilePayload>({
  name: 'update_profile',
  offline: false,
});
export const updateProfileQueued = defineClientCommand<UpdateProfilePayload>({
  name: 'update_profile',
  offline: true,
});
export const setHomeAirportCommand = defineClientCommand<SetHomeAirportPayload>({
  name: 'set_home_airport',
  offline: true,
});

const SAVED_SQL = `SELECT display_name, username, home_airport, languages, username_changed_at
  FROM users WHERE id = ?`;
const SAVED_TABLES = ['users'];

interface SavedRow {
  readonly display_name: string | null;
  readonly username: string | null;
  readonly home_airport: string | null;
  readonly languages: string | null;
  readonly username_changed_at: string | null;
}

export { airportLabel } from './airport-label';

export type EditingField = 'name' | 'username' | 'home-airport' | 'languages' | null;

export function useEditProfile() {
  const locale = useLocale();
  const uid = useOwnerUid();
  const { model } = useProfile();
  const faces = useMemberFaces();
  const photoUri = uid === null ? null : (faces.faceProps(uid, 'xl').photo?.uri ?? null);
  const row = useLiveRows<SavedRow>(SAVED_SQL, uid === null ? null : [uid], SAVED_TABLES).rows[0];
  const saved: SavedProfile | null =
    row === undefined
      ? null
      : {
          name: row.display_name?.trim() ?? '',
          username: row.username,
          homeAirport: row.home_airport,
          languages: languagesOf(row.languages),
          usernameChangedAt: row.username_changed_at,
        };
  const [edits, setEdits] = useState<Partial<ProfileDraft>>({});
  const draft: ProfileDraft | null = saved === null ? null : { ...draftOf(saved), ...edits };
  const username = useUsernameState(saved, draft);
  const [editing, setEditing] = useState<EditingField>(null);
  const [leaving, setLeaving] = useState(false);
  // Saved or discarded: the screen may go. Until then a swipe back or the system back with unsaved
  // changes asks first, exactly as the back control does.
  const [free, setFree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const online = useCommand(updateProfileOnline);
  const queued = useCommand(updateProfileQueued);
  const airport = useCommand(setHomeAirportCommand);

  const changes = saved === null || draft === null ? null : changesOf(saved, draft);
  const dirty = changes !== null && hasChanges(changes);

  const save = async () => {
    if (changes === null || draft === null || !canSave(changes, draft, username)) return;
    setSaving(true);
    setProblem(null);
    try {
      if (changes.profile !== null) {
        const command = changes.profile.username === undefined ? queued : online;
        const result = await command.send(changes.profile);
        if (result.kind === 'rejected' || result.kind === 'unavailable') {
          const detail =
            result.kind === 'rejected'
              ? (result.detail as { reason?: string } | undefined)
              : undefined;
          setProblem(saveProblemText(result.code, detail?.reason ?? null));
          return;
        }
      }
      if (changes.homeAirport !== null) await airport.send({ iata: changes.homeAirport });
      // The profile shows the new name at once; its row follows when the change has synced.
      if (changes.profile?.name !== undefined) {
        putPendingEdits<PendingMe>(PENDING_ME, { name: changes.profile.name });
      }
      setFree(true);
    } catch {
      setProblem(saveProblemText('UNAVAILABLE', null));
    } finally {
      setSaving(false);
    }
  };

  usePreventRemove(dirty && !free, () => setLeaving(true));
  useEffect(() => {
    if (!free) return undefined;
    // After the guard above has let go of the screen.
    const timer = setTimeout(() => goBackOr(YOU_ROUTES.profile), 0);
    return () => clearTimeout(timer);
  }, [free]);

  const avatar = model?.avatar ?? { kind: 'initials' as const };
  const worn = useWornForm(avatar.kind === 'form' ? avatar.formId : null);
  const languageNames = new Map(
    languageChoices(locale).map((choice) => [choice.code, choice.localName]),
  );
  const languagesText = (codes: readonly string[]) =>
    codes.map((code) => languageNames.get(code) ?? code).join(', ');
  const nameProblem = draft === null ? null : nameProblemOf(draft.name);

  return {
    locale,
    model,
    photoUri,
    saved,
    draft,
    setEdits,
    username,
    editing,
    setEditing,
    leaving,
    setLeaving,
    discard: () => {
      setLeaving(false);
      setFree(true);
    },
    back: () => (dirty ? setLeaving(true) : goBackOr(YOU_ROUTES.profile)),
    saving,
    problem,
    dirty,
    canSave: changes !== null && draft !== null && canSave(changes, draft, username),
    save,
    avatar,
    worn,
    languagesText,
    nameProblem,
  };
}
