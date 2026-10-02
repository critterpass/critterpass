/** Lab scenes for Edit profile (3n-3) and the avatar picker (3n-4): pure views, fixed props. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture names and values, never shipped copy. */
import type { ReactNode } from 'react';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';

import { AvatarView, type AvatarTab } from '../avatar/avatar-view';
import { EditProfileView } from '../edit-profile/edit-profile-view';
import { ProfileFace } from '../profile/profile-parts';

const noop = () => undefined;
const TOKEK = GUIDE_STICKERS.tokek;

function Edit({ note = null }: { readonly note?: string | null }) {
  return (
    <EditProfileView
      face={<ProfileFace avatar={{ kind: 'guide', guide: 'tokek' }} name="Winston" ring="rare" />}
      avatarTitle={TOKEK.name}
      avatarLine={null}
      onChangeAvatar={noop}
      fields={[
        { key: 'name', label: 'Name', value: 'Winston', onPress: noop },
        { key: 'username', label: 'Username', value: '@winston', note, onPress: noop },
        {
          key: 'home-airport',
          label: 'Home airport',
          value: 'SIN · Singapore Changi',
          onPress: noop,
        },
      ]}
      canSave={note === null}
      saving={false}
      problem={null}
      onSave={noop}
      onBack={noop}
    />
  );
}

function Avatar({ tab }: { readonly tab: AvatarTab }) {
  const guide = tab === 'critter';
  return (
    <AvatarView
      name="Winston"
      preview={
        <ProfileFace
          avatar={guide ? { kind: 'guide', guide: 'tokek' } : { kind: 'initials' }}
          name="Winston"
          ring={guide ? 'rare' : null}
        />
      }
      face={guide ? { critter: <Sticker kind={TOKEK.kind} name={TOKEK.name} size={24} /> } : {}}
      tab={tab}
      onTab={noop}
      guide={guide ? 'tokek' : null}
      onGuide={noop}
      onPhoto={noop}
      photoPending={false}
      canDone
      onDone={noop}
      onBack={noop}
    />
  );
}

export const EDIT_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3n-3-edit': () => <Edit />,
  '3n-3-username-taken': () => <Edit note="Someone already has that one." />,
  '3n-4-avatar': () => <Avatar tab="critter" />,
  '3n-4-initials': () => <Avatar tab="initials" />,
  '3n-4-photo': () => <Avatar tab="photo" />,
};
