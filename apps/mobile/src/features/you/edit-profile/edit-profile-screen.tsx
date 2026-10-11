/**
 * Edit profile over the synced `users` row (state and saving in `useEditProfile`). Leaving with
 * unsaved changes asks first.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { guideSticker } from '@/ui/avatar/guides';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';

import { languageChoices } from '../language/language-names';
import { ProfileFace } from '../profile/profile-parts';
import { YOU_ROUTES } from '../routes';
import { nameProblemText, usernameText, wornFormLine } from './edit-profile-copy';
import { EditProfileView } from './edit-profile-view';
import { AirportSheet, LanguagesSheet, NameSheet, UsernameSheet } from './field-sheets';
import { airportLabel, useEditProfile } from './use-edit-profile';

export {
  setHomeAirportCommand,
  updateProfileOnline,
  updateProfileQueued,
} from './use-edit-profile';

/** The Edit profile avatar, as large as the render draws it. */
const FACE = 112;

export function EditProfileScreen() {
  const { t } = useLingui();
  const {
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
    discard,
    back,
    saving,
    problem,
    canSave: saveable,
    save,
    avatar,
    worn,
    languagesText,
    nameProblem,
  } = useEditProfile();
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
        canSave={saveable}
        saving={saving}
        problem={problem}
        onSave={() => void save()}
        onBack={back}
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
          onConfirm={discard}
          onCancel={() => setLeaving(false)}
          testID="you-edit-discard"
        />
      ) : null}
    </>
  );
}
