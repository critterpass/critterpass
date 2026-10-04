/** The person's own face at the end of the Critterdex title line, opening their profile. */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { guideSticker, type GuideAvatarId } from '@/ui/avatar/guides';
import { Avatar } from '@/ui/people/Avatar';
import { Sticker } from '@/ui/sticker/Sticker';
import { touchSlop } from '@/ui/theme';

export interface DexProfileEntry {
  readonly name: string;
  /** The guide sticker worn as an avatar, when one was picked. */
  readonly guide: GuideAvatarId | null;
  /** The face the person wears (a photo, a guide), drawn in place of the guide or the initial. */
  readonly face?: { readonly photo?: { readonly uri: string }; readonly critter?: ReactNode };
  readonly onOpen: () => void;
}

const PROFILE_FACE = 32;

/** A 32 pt face with a full-size touch target around it, so the title line keeps its height. */
export function ProfileEntry({ entry }: { readonly entry: DexProfileEntry }) {
  const guide = entry.guide === null ? null : guideSticker(entry.guide);
  return (
    <Pressable
      onPress={entry.onOpen}
      hitSlop={touchSlop(PROFILE_FACE, PROFILE_FACE)}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'critters.dex.openProfile', message: 'Your profile' })}
      testID="critters-dex-profile"
    >
      <Avatar
        name={entry.name}
        size="lg"
        decorative
        {...(entry.face !== undefined && (entry.face.photo ?? entry.face.critter) !== undefined
          ? entry.face
          : guide === null
            ? {}
            : { critter: <Sticker kind={guide.kind} name={guide.name} size={PROFILE_FACE - 6} /> })}
      />
    </Pressable>
  );
}
