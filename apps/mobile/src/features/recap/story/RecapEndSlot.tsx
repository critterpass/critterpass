/**
 * The host the recap story's end hands over to: mounted on the recap page once the story has
 * finished (or been skipped past). It shows nothing itself; whatever asks for a moment at the end
 * of a recap renders here.
 */
export function RecapEndSlot({ recapId: _recapId }: { readonly recapId: string }) {
  return null;
}
