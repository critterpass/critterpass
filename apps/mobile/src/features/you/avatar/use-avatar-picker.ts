/**
 * The avatar picker over the person's current face: pick initials, a guide, or a real photo (the
 * onboarding photo flow: pick or take, cut out on the phone, upload through the avatar presign),
 * then DONE records it with `set_avatar` (queued offline). A photo stays the person's own until it
 * is checked; crewmates see initials meanwhile.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a command name, never copy. */
import { generateUuidV7, guideFormId, type AvatarChoice, type SetAvatarPayload } from '@cp/domain';
import { useState } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { useRealPhoto } from '@/features/onboarding';
import { goBackOr } from '@/lib/navigation/back';
import { requestWithPrimer } from '@/lib/permissions';
import { useCommandFeedback } from '@/motion/island-toast';
import type { GuideAvatarId } from '@/ui/avatar/guides';

import { useOwnerUid } from '../data/live-rows';
import { dropPendingEdits, putPendingEdits } from '../data/pending-edits';
import { PENDING_ME, type PendingMe } from '../profile/pending-me';
import type { ProfileAvatar } from '../profile/profile-model';

import { useProfile } from '../profile/use-profile';
import { YOU_ROUTES } from '../routes';
import { useMemberFaces } from './member-faces';
import type { AvatarRing, MemberFace } from './member-face';
import { useOwnedForms } from './owned-forms';
import type { AvatarTab } from './tab-choice';
import { choiceOnTab } from './tab-choice';

export const setAvatarCommand = defineClientCommand<SetAvatarPayload>({
  name: 'set_avatar',
  offline: true,
});

export type PhotoServices = Parameters<typeof useRealPhoto>[0]['photos'];

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

/**
 * The picker's state over the person's current face and what each control does; DONE records the
 * choice (shown at once, queued offline). Both the current and premium pickers draw it.
 */
export function useAvatarPicker(photos: PhotoServices) {
  const uid = useOwnerUid();
  const { model } = useProfile();
  const faces = useMemberFaces();
  const current = uid === null ? ({ kind: 'initials' } as const) : faces.faceOf(uid);
  const currentUri = uid === null ? null : (faces.faceProps(uid, 'xl').photo?.uri ?? null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [tab, setTab] = useState<AvatarTab | null>(null);
  const { send } = useCommand(setAvatarCommand);
  const { report } = useCommandFeedback();
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
  const avatar: ProfileAvatar =
    shown.kind === 'guide'
      ? { kind: 'guide', guide: shown.guide }
      : shown.kind === 'form'
        ? { kind: 'form', formId: shown.formId }
        : { kind: 'initials' };
  const ring =
    choice === null
      ? (model?.ring ?? null)
      : shown.kind === 'form' || shown.kind === 'guide'
        ? shown.ring
        : null;

  return {
    name: model?.name ?? '',
    shown,
    avatar,
    ring,
    photoUri: shown.kind === 'photo' ? shownUri : null,
    tab: tab ?? tabOf(current),
    onTab: (next: AvatarTab) => {
      setTab(next);
      setChoice((picked) => choiceOnTab(next, current.kind, picked));
    },
    guide: shown.kind === 'guide' ? shown.guide : null,
    onGuide: (guide: GuideAvatarId) => setChoice({ kind: 'guide', guide }),
    forms,
    form: shown.kind === 'form' ? shown.formId : null,
    onForm: (key: string) =>
      setChoice({
        kind: 'form',
        formId: key,
        ring: forms.find((form) => form.key === key)?.ring ?? null,
      }),
    real,
    photoPending: choice?.kind === 'photo',
    canDone: choice !== null,
    onDone: () => {
      if (choice === null) return;
      const wire = wireChoice(choice);
      putPendingEdits<PendingMe>(PENDING_ME, {
        avatar: {
          kind: wire.kind,
          form_id: wire.kind === 'critter' ? wire.form_id : null,
          ring: choice.kind === 'form' ? choice.ring : null,
          media_key: wire.kind === 'photo' ? wire.media_key : null,
        },
      });
      const undo = () => dropPendingEdits<PendingMe>(PENDING_ME, ['avatar']);
      void send({ avatar_id: generateUuidV7(), choice: wire }).then(
        (result) => report(result, { offlineCapable: true }) === 'refused' && undo(),
        undo,
      );
      goBackOr(YOU_ROUTES.profile);
    },
    onBack: () => goBackOr(YOU_ROUTES.profile),
  };
}

