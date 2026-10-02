/**
 * When the trailer holds its story: while the quick-reply panel is open, so a slow reader is never
 * carried on to the next slide, or past the last one to their version, mid-reply. Closing the panel
 * or sending a reply lets it carry on.
 */
export type ReplyPanelEvent = 'toggle' | 'sent';

export function replyPanelAfter(open: boolean, event: ReplyPanelEvent): boolean {
  switch (event) {
    case 'toggle':
      return !open;
    case 'sent':
      return false;
  }
}

export function storyHeld(replyOpen: boolean): boolean {
  return replyOpen;
}
