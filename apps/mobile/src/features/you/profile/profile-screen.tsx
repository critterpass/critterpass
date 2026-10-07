/**
 * The profile over the signed-in user's synced rows. EDIT, the crews sheet, GET PASS+ and the
 * Pass+ chip's way to Your plan appear once their screens are registered; Settings, the stamps list and RETAKE are this area's own.
 */
import { router } from 'expo-router';
import { useState } from 'react';

import { useScreenHref } from '@/lib/navigation/screen-registry';

import { useMemberFaces } from '../avatar/member-faces';
import { useOwnerUid } from '../data/live-rows';
import { YOU_ROUTES } from '../routes';
import { ProfileView } from './profile-view';
import { RetakeSheet } from './retake-sheet';
import { useProfile } from './use-profile';

/* eslint-disable lingui/no-unlocalized-strings -- design screen ids, never copy. */
const EDIT_SCREEN = '3n-3';
const CREWS_SCREEN = '3g-3';
const PAYWALL_SCREEN = '4e-1';
const PLAN_SCREEN = '4d-1';
const FROM_CHIP = { entry: 'pass_chip' } as const;
/* eslint-enable lingui/no-unlocalized-strings */

export function ProfileScreen({
  now,
  from = 'home',
}: {
  readonly now?: () => Date;
  /** Where the person came from, which the back control names. */
  readonly from?: 'home' | 'pass';
}) {
  const { model } = useProfile(now);
  const edit = useScreenHref(EDIT_SCREEN);
  const crews = useScreenHref(CREWS_SCREEN);
  const paywall = useScreenHref(PAYWALL_SCREEN, FROM_CHIP);
  const plan = useScreenHref(PLAN_SCREEN);
  const [retaking, setRetaking] = useState(false);
  const uid = useOwnerUid();
  const faces = useMemberFaces();
  const photoUri = uid === null ? null : (faces.faceProps(uid, 'xl').photo?.uri ?? null);
  return (
    <>
      <ProfileView
        model={model}
        from={from}
        photoUri={photoUri}
        faceFor={(member) => faces.faceProps(member, 'sm')}
        onSettings={() => router.push(YOU_ROUTES.settings)}
        onAllStamps={() => router.push(YOU_ROUTES.stamps)}
        onRetake={() => setRetaking(true)}
        {...(edit === undefined ? {} : { onEdit: () => router.push(edit) })}
        {...(paywall === undefined ? {} : { onGetPassPlus: () => router.push(paywall) })}
        {...(plan === undefined ? {} : { onPlan: () => router.push(plan) })}
        {...(crews === undefined
          ? {}
          : { onOpenCrew: () => router.push(crews), onStartCrew: () => router.push(crews) })}
      />
      {retaking ? <RetakeSheet onClose={() => setRetaking(false)} /> : null}
    </>
  );
}
