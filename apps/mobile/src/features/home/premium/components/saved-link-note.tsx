/**
 * The link pasted on first launch (2.04), offered once there is a trip: Tokek says it kept it, and
 * "Add to ideas" opens the trip's add-from-a-link page with it (where it is read and saved). The
 * kept link is dropped as it is handed over; "Not now" drops it too.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { searchRoutes } from '@/features/explore/search/routes';
import { clearFirstTripLink, useSavedFirstTripLink } from '@/features/onboarding/saved-link';
import { GuideNote, TextButton } from '@/ui/premium';

export function SavedLinkNote({ tripId }: { readonly tripId: string }) {
  const { t } = useLingui();
  const link = useSavedFirstTripLink();
  if (link === null) return null;
  return (
    <>
      <GuideNote
        name="Tokek"
        text={t({
          id: 'home.premium.savedLink.line',
          message: 'You pasted a link before your first trip. Want it in this trip’s ideas?',
        })}
        action={{
          label: t({ id: 'home.premium.savedLink.add', message: 'Add to ideas' }),
          onPress: () => {
            clearFirstTripLink();
            router.push(searchRoutes.link(tripId, { url: link.url }));
          },
        }}
        testID="home-saved-link"
      />
      <TextButton
        label={t({ id: 'home.premium.savedLink.notNow', message: 'Not now' })}
        onPress={clearFirstTripLink}
        testID="home-saved-link-dismiss"
      />
    </>
  );
}
