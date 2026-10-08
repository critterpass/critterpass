/**
 * The avatar picker over the person's current face: pick initials, a guide, or a real photo (the
 * onboarding photo flow: pick or take, cut out on the phone, upload through the avatar presign),
 * then DONE records it with `set_avatar` (queued offline). A photo stays the person's own until it
 * is checked; crewmates see initials meanwhile.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a command name, never copy. */
import { generateUuidV7, guideFormId, type AvatarChoice, type SetAvatarPayload } from '@cp/domain';
import { router } from 'expo-router';
import { useState } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { RealPhotoSheet, useRealPhoto } from '@/features/onboarding';
import { requestWithPrimer } from '@/lib/permissions';
import type { GuideAvatarId } from '@/ui/avatar/guides';
import { sizeToken, useTheme } from '@/ui/theme';

import { useOwnerUid } from '../data/live-rows';
import { ProfileFace } from '../profile/profile-parts';
import { useProfile } from '../profile/use-profile';
import { facePropsOf, useMemberFaces } from './member-faces';
import type { AvatarRing, MemberFace } from './member-face';
import { useOwnedForms } from './owned-forms';
import { AvatarView, type AvatarTab } from './avatar-view';
import { choiceOnTab } from './tab-choice';

export const setAvatarCommand = defineClientCommand<SetAvatarPayload>({
  name: 'set_avatar',
  offline: true,
});

/** The picker's preview, as large as the render draws it. */
const PREVIEW = 112;

type PhotoServices = Parameters<typeof useRealPhoto>[0]['photos'];

type Choice =
  | { readonly kind: 'initials' }
  | { readonly kind: 'guide'; readonly guide: GuideAvatarId }
  | { readonly kind: 'form'; readonly formId: string; readonly ring: AvatarRing | null }
  | { readonly kind: 'photo'; readonly mediaKey: string; readonly uri: string };

function wireChoice(choice: Choice): AvatarChoice {
  switch (choice.kind) {
    case 'initials':
      return { kind: 'initials' };
    case 'guide':
      return { kind: 'critter', form_id: guideFormId(choice.guide) };
    case 'form':
      return { kind: 'critter', form_id: choice.formId };
    case 'photo':
      return { kind: 'photo', media_key: choice.mediaKey };
  }
}

function tabOf(face: MemberFace): AvatarTab {
  if (face.kind === 'photo') return 'photo';
  return face.kind === 'initials' ? 'initials' : 'critter';
}

export function AvatarScreen({ photos }: { readonly photos: PhotoServices }) {
  const theme = useTheme();
  const uid = useOwnerUid();
  const { model } = useProfile();
  const faces = useMemberFaces();
  const current = uid === null ? ({ kind: 'initials' } as const) : faces.faceOf(uid);
  const currentUri = uid === null ? null : (faces.faceProps(uid, 'xl').photo?.uri ?? null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [tab, setTab] = useState<AvatarTab | null>(null);
  const { send } = useCommand(setAvatarCommand);
  const forms = useOwnedForms();
  const real = useRealPhoto({
    photos,
    requestCamera: () => requestWithPrimer('camera', 'real_photo'),
    onUploaded: ({ mediaKey, uri }) => setChoice({ kind: 'photo', mediaKey, uri }),
  });

  const shown: MemberFace =
    choice === null
      ? current
      : choice.kind === 'guide'
        ? { kind: 'guide', guide: choice.guide, ring: null }
        : choice.kind === 'form'
          ? { kind: 'form', formId: choice.formId, ring: choice.ring }
          : choice.kind === 'photo'
            ? { kind: 'photo', mediaKey: choice.mediaKey }
            : { kind: 'initials' };
  const shownUri = choice?.kind === 'photo' ? choice.uri : choice === null ? currentUri : null;
  const name = model?.name ?? '';
  const diameter = sizeToken(theme.size.avatar, 'sm');

  return (
    <>
      <AvatarView
        name={name}
        preview={
          <ProfileFace
            avatar={
              shown.kind === 'guide'
                ? { kind: 'guide', guide: shown.guide }
                : shown.kind === 'form'
                  ? { kind: 'form', formId: shown.formId }
                  : { kind: 'initials' }
            }
            name={name}
            ring={
              choice === null
                ? (model?.ring ?? null)
                : shown.kind === 'form' || shown.kind === 'guide'
                  ? shown.ring
                  : null
            }
            photoUri={shown.kind === 'photo' ? shownUri : null}
            size={PREVIEW}
          />
        }
        face={facePropsOf(shown, shown.kind === 'photo' ? shownUri : null, diameter)}
        tab={tab ?? tabOf(current)}
        onTab={(next) => {
          setTab(next);
          setChoice((picked) => choiceOnTab(next, current.kind, picked));
        }}
        guide={shown.kind === 'guide' ? shown.guide : null}
        onGuide={(guide) => setChoice({ kind: 'guide', guide })}
        forms={forms}
        form={shown.kind === 'form' ? shown.formId : null}
        onForm={(key) =>
          setChoice({
            kind: 'form',
            formId: key,
            ring: forms.find((form) => form.key === key)?.ring ?? null,
          })
        }
        onPhoto={photos === null ? null : real.open}
        photoPending={choice?.kind === 'photo'}
        canDone={choice !== null}
        onDone={() => {
          if (choice === null) return;
          void send({ avatar_id: generateUuidV7(), choice: wireChoice(choice) });
          router.back();
        }}
        onBack={() => router.back()}
      />
      {photos === null ? null : (
        <RealPhotoSheet
          state={real.state}
          onLibrary={() => void real.fromLibrary()}
          onCamera={() => void real.fromCamera()}
          onZoom={real.setZoom}
          onConfirm={real.confirm}
          onRetry={real.retry}
          onClose={real.close}
        />
      )}
    </>
  );
}
