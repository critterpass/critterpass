/**
 * Edit profile over the synced `users` row. SAVE sends only what changed: a new username needs the
 * server's answer (it may have been taken a second ago), so it is sent online and a refusal shows
 * here; a name or home airport alone waits in the offline queue. Leaving with unsaved changes asks
 * first.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and command names, never copy. */
import { airportDataset } from '@cp/content/airports';
import type { SetHomeAirportPayload, UpdateProfilePayload } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';

import { goBackOr } from '@/lib/navigation/back';
import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';

import { useMemberFaces } from '../avatar/member-faces';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { putPendingEdits } from '../data/pending-edits';
import { PENDING_ME, type PendingMe } from '../profile/pending-me';
import { ProfileFace } from '../profile/profile-parts';
import { useProfile } from '../profile/use-profile';
import { YOU_ROUTES } from '../routes';
import { nameProblemText, saveProblemText, usernameText, wornFormLine } from './edit-profile-copy';
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
import { EditProfileView } from './edit-profile-view';
import { languageChoices } from '../language/language-names';
import { AirportSheet, LanguagesSheet, NameSheet, UsernameSheet } from './field-sheets';
import { useWornForm } from './worn-form';
import { useUsernameState } from './username-check';

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

function airportLabel(iata: string | null): string {
  if (iata === null) return '';
  const airport = airportDataset().airports.find((row) => row.iata === iata);
  return airport === undefined ? iata : `${iata} · ${airport.name}`;
}

type Editing = 'name' | 'username' | 'home-airport' | 'languages' | null;

/** The Edit profile avatar, as large as the render draws it. */
const FACE = 112;

export function EditProfileScreen() {
  const { t } = useLingui();
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
  const [editing, setEditing] = useState<Editing>(null);
  const [leaving, setLeaving] = useState(false);
  // Saved or discarded: the screen may go. Until then a swipe back or the system back with unsaved
  // changes asks first, exactly as the eyebrow does.
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
  return (
    <>
      <EditProfileView
        face={
          <ProfileFace
            avatar={avatar}
            name={draft?.name ?? ''}
            ring={model?.ring ?? null}
            photoUri={photoUri}
            size={FACE}
          />
        }
        avatarTitle={
          photoUri !== null
            ? t({ id: 'you.edit.avatarPhoto', message: 'Photo' })
            : avatar.kind === 'guide'
              ? guideSticker(avatar.guide).name
              : avatar.kind === 'form'
                ? (worn?.form_name ??
                  worn?.critter_name ??
                  t({ id: 'you.edit.avatarCritter', message: 'From your Critterdex' }))
                : t({ id: 'you.edit.avatarInitials', message: 'Initials' })
        }
        avatarLine={
          photoUri === null && avatar.kind === 'form' && worn !== null
            ? wornFormLine(worn.rarity, worn.found_at, locale)
            : null
        }
        onChangeAvatar={() => router.push(YOU_ROUTES.avatar)}
        fields={[
          {
            key: 'name',
            label: t({ id: 'you.edit.name', message: 'Name' }),
            value: draft?.name ?? '',
            note: nameProblem === null ? null : nameProblemText(nameProblem),
            onPress: () => setEditing('name'),
          },
          {
            key: 'username',
            label: t({ id: 'you.edit.username', message: 'Username' }),
            value:
              draft === null || draft.username === ''
                ? t({ id: 'you.edit.username.none', message: 'Pick a username' })
                : `@${draft.username}`,
            note: usernameText(username, locale),
            onPress: () => setEditing('username'),
          },
          {
            key: 'home-airport',
            label: t({ id: 'you.edit.homeAirport', message: 'Home airport' }),
            value: airportLabel(draft?.homeAirport ?? null),
            onPress: () => setEditing('home-airport'),
          },
          {
            key: 'languages',
            label: t({ id: 'you.edit.languages', message: 'Languages' }),
            value:
              draft === null || draft.languages.length === 0
                ? t({ id: 'you.edit.languages.none', message: 'Add the languages you speak' })
                : languagesText(draft.languages),
            onPress: () => setEditing('languages'),
          },
        ]}
        canSave={changes !== null && draft !== null && canSave(changes, draft, username)}
        saving={saving}
        problem={problem}
        onSave={() => void save()}
        onBack={() => (dirty ? setLeaving(true) : goBackOr(YOU_ROUTES.profile))}
      />
      {editing === 'name' && draft !== null ? (
        <NameSheet
          value={draft.name}
          onDone={(name) => {
            setEdits((e) => ({ ...e, name }));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing === 'username' && saved !== null && draft !== null ? (
        <UsernameSheet
          saved={saved}
          draft={draft}
          onDone={(next) => {
            setEdits((e) => ({ ...e, username: next }));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing === 'home-airport' ? (
        <AirportSheet
          onDone={(iata) => {
            setEdits((e) => ({ ...e, homeAirport: iata }));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing === 'languages' && draft !== null ? (
        <LanguagesSheet
          value={draft.languages}
          choices={languageChoices(locale).map((choice) => ({
            code: choice.code,
            name: choice.nativeName,
            line: choice.localName,
          }))}
          onDone={(languages) => {
            setEdits((e) => ({ ...e, languages }));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {leaving ? (
        <ConfirmSheet
          title={t({ id: 'you.edit.discardTitle', message: 'Leave without saving?' })}
          consequences={[
            t({ id: 'you.edit.discardLine', message: 'Your changes to the profile are dropped.' }),
          ]}
          confirmLabel={t({ id: 'you.edit.discard', message: 'Leave' })}
          mode="button"
          onConfirm={() => {
            setLeaving(false);
            setFree(true);
          }}
          onCancel={() => setLeaving(false)}
          testID="you-edit-discard"
        />
      ) : null}
    </>
  );
}
