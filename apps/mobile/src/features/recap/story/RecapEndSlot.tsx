/**
 * The host the recap story's end hands over to: mounted on the recap page once the story has
 * finished (or been skipped past). It shows nothing itself; whatever asks for a moment at the end
 * of a recap renders here. One moment at most: the arbiter picks it.
 */
import { RecapEndArbiter } from '@/features/help';

export function RecapEndSlot({ recapId }: { readonly recapId: string }) {
  return <RecapEndArbiter recapId={recapId} />;
}
