import { SavedScreen } from '@/features/explore';
import { PremiumSavedView } from '@/features/explore/premium/saved/saved-page';
import { confirmDeleteList } from '@/features/explore/premium/saved/confirm-delete-list';
import { usePremiumUi } from '@/lib/premium-ui';

/** Saved places and lists (the saved hub under Explore). */
export default function ExploreSavedRoute() {
  const premium = usePremiumUi();
  return (
    <SavedScreen
      {...(premium ? { View: PremiumSavedView, confirmDelete: confirmDeleteList } : {})}
    />
  );
}
