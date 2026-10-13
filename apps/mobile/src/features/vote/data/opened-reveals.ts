/** Reveals already opened in this app session, so a slow `mark_reveal_seen` never shows one twice. */
export const openedReveals = new Set<string>();
