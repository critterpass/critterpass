import { SavedScreen } from '@/features/explore';
import { PremiumSavedView } from '@/features/explore/premium/saved/saved-page';
import { confirmDeleteList } from '@/features/explore/premium/saved/confirm-delete-list';

/** Saved places and lists (the saved hub under Explore). */
export default function ExploreSavedRoute() {
  return <SavedScreen View={PremiumSavedView} confirmDelete={confirmDeleteList} />;
}
