/**
 * The profile over the signed-in user's synced rows. EDIT, the stamps list and the crews sheet
 * appear once their screens are registered; Settings is this area's own.
 */
import { router } from 'expo-router';

import { useScreenHref } from '@/lib/navigation/screen-registry';

import { YOU_ROUTES } from '../routes';
import { ProfileView } from './profile-view';
import { useProfile } from './use-profile';

/* eslint-disable lingui/no-unlocalized-strings -- design screen ids, never copy. */
const EDIT_SCREEN = '3n-3';
const CREWS_SCREEN = '3g-3';
/* eslint-enable lingui/no-unlocalized-strings */

export function ProfileScreen({ now }: { readonly now?: () => Date }) {
  const { model } = useProfile(now);
  const edit = useScreenHref(EDIT_SCREEN);
  const crews = useScreenHref(CREWS_SCREEN);
  return (
    <ProfileView
      model={model}
      onSettings={() => router.push(YOU_ROUTES.settings)}
      {...(edit === undefined ? {} : { onEdit: () => router.push(edit) })}
      {...(crews === undefined
        ? {}
        : { onOpenCrew: () => router.push(crews), onStartCrew: () => router.push(crews) })}
    />
  );
}
