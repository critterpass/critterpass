/** Lab scenes for Edit profile (3n-3) and the avatar picker (3n-4): pure views, fixed props. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture names and values, never shipped copy. */
import { critters } from '@cp/critter-art';
import type { ReactNode } from 'react';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';

import { AvatarView, type AvatarTab } from '../avatar/avatar-view';
import { EditProfileView } from '../edit-profile/edit-profile-view';
import { ProfileFace } from '../profile/profile-parts';

const noop = () => undefined;
const TOKEK = GUIDE_STICKERS.tokek;

/** Ten found forms, two of them rare, one epic and one legendary, as the render lists them. */
const DEX = critters.slice(0, 10).map((critter, index) => ({
  key: critter.id,
  ring:
    index === 1 || index === 4
      ? ('rare' as const)
      : index === 8
        ? ('epic' as const)
        : index === 9
          ? ('legendary' as const)
          : null,
}));
const drawForm = (key: string, size: number) => {
  const critter = critters.find((item) => item.id === key);
  return critter === undefined ? null : (
    <Sticker kind={critter.kind} name={critter.name} size={size} />
  );
};

function Edit({ note = null }: { readonly note?: string | null }) {
  return (
    <EditProfileView
      face={
        <ProfileFace
          avatar={{ kind: 'guide', guide: 'tokek' }}
          name="Winston"
          ring="rare"
          size={112}
        />
      }
      avatarTitle="Temple Tokek"
      avatarLine="Rare form · found Oct 14"
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
        { key: 'languages', label: 'Languages', value: 'English, Mandarin', onPress: noop },
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
          size={112}
        />
      }
      face={guide ? { critter: <Sticker kind={TOKEK.kind} name={TOKEK.name} size={24} /> } : {}}
      tab={tab}
      onTab={noop}
      guide={null}
      onGuide={noop}
      forms={guide ? DEX : []}
      form={guide ? (DEX[1]?.key ?? null) : null}
      onForm={noop}
      drawForm={drawForm}
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
