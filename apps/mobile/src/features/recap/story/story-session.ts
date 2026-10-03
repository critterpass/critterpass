/**
 * What this app session already did with each recap: the story played (the page opens straight
 * on the summary after that, until the app restarts) and its end counted (`recap_story_completed`
 * goes once per recap per session, at the story's end, never on first open).
 */
const played = new Set<string>();
const completed = new Set<string>();

export const storySession = {
  markPlayed(recapId: string): void {
    played.add(recapId);
  },
  played(recapId: string): boolean {
    return played.has(recapId);
  },
  /** True the first time a recap's story ends this session. */
  complete(recapId: string): boolean {
    if (completed.has(recapId)) return false;
    completed.add(recapId);
    return true;
  },
  /** Test-only: a fresh session. */
  reset(): void {
    played.clear();
    completed.clear();
  },
};
