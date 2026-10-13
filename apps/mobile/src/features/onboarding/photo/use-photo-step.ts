/**
 * Page two's working state, shared by the current and the premium photo page: which guide face is
 * on the pass (or the real photo), picking another, the real-photo flow, and Next (a page left
 * untouched keeps Tokek).
 */
import { router } from 'expo-router';
import { useCallback, useState } from 'react';

import { advanceDraft, guideFormId, guideOfForm, type PassDraft } from '@cp/domain';

import { requestWithPrimer } from '@/lib/permissions';
import { feedback } from '@/motion/feedback';
import { GUIDE_AVATAR_IDS, guideSticker, type GuideAvatarId } from '@/ui/premium/stickers/guides';

import { ensureDraft, updateDraft, usePassDraft } from '../flow-controller/draft-store';
import { routeForStep } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { useOnboardingServices } from '../services';
import { useRealPhoto } from './use-real-photo';

export interface GuideFace {
  readonly id: GuideAvatarId;
  readonly name: string;
  /** The sticker kind to draw. */
  readonly kind: string;
  readonly seed: number;
}

export function guideFace(id: GuideAvatarId): GuideFace {
  const info = guideSticker(id);
  return { id, name: info.name, kind: info.kind, seed: info.seed };
}

export function usePhotoStep() {
  useTrackStep('photo');
  const services = useOnboardingServices();
  const draft: PassDraft = usePassDraft() ?? ensureDraft();
  const current = draft.avatar?.kind === 'critter' ? guideOfForm(draft.avatar.form_id) : null;
  const selected: GuideAvatarId | null =
    draft.avatar === null ? 'tokek' : draft.avatar.kind === 'photo' ? null : current;
  /** How many picks this visit: the frame tilts and the face waves after each one. */
  const [picks, setPicks] = useState(0);

  const pick = (guide: GuideAvatarId) => {
    feedback.emit('shutter');
    updateDraft((d) => ({
      ...d,
      avatar: { kind: 'critter', form_id: guideFormId(guide) },
      photo_uri: null,
    }));
    setPicks((n) => n + 1);
  };

  const onUploaded = useCallback((result: { mediaKey: string; uri: string }) => {
    updateDraft((d) => ({
      ...d,
      avatar: { kind: 'photo', media_key: result.mediaKey },
      photo_uri: result.uri,
    }));
    setPicks((n) => n + 1);
  }, []);

  const real = useRealPhoto({
    photos: services.photos,
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a permission trigger id.
    requestCamera: () => requestWithPrimer('camera', 'real_photo'),
    onUploaded,
  });

  const next = () => {
    const moved = updateDraft((d) =>
      advanceDraft(
        d.avatar === null
          ? { ...d, avatar: { kind: 'critter', form_id: guideFormId('tokek') } }
          : d,
        'photo',
      ),
    );
    if (moved.step !== 'photo') router.push(routeForStep(moved.step));
  };

  return {
    draft,
    selected,
    face: selected === null ? null : guideFace(selected),
    faces: GUIDE_AVATAR_IDS.map(guideFace),
    picks,
    pick,
    real,
    /** This build can pick or take a real photo. */
    realPhotos: services.photos !== null,
    next,
  };
}
