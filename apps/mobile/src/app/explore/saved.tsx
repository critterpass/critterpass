import { LocalFirstGate, SavedScreen } from '@/features/explore';

/** Saved places and lists (the saved hub under Explore). */
export default function ExploreSavedRoute() {
  return (
    <LocalFirstGate>
      <SavedScreen />
    </LocalFirstGate>
  );
}
