/** The part of the clipboard a paste reads. */
export interface PasteClipboard {
  /** Whether there is text, without reading it (iOS asks nothing for this). */
  readonly hasStringAsync: () => Promise<boolean>;
  /** The text; on iOS this is what asks "Allow Paste". */
  readonly getStringAsync: () => Promise<string>;
}

/**
 * What one tap on a drawn paste control got: the text, nothing to paste, or (iOS) text the person
 * would not let the app read (they tapped "Don't Allow").
 */
export type PasteRead =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'empty' }
  | { readonly kind: 'refused' };

export async function readPaste(clipboard: PasteClipboard, ios: boolean): Promise<PasteRead> {
  // iOS only: an empty read means "Don't Allow" when the clipboard does hold text.
  const holdsText = ios ? await clipboard.hasStringAsync().catch(() => false) : false;
  if (ios && !holdsText) return { kind: 'empty' };
  const text = (await clipboard.getStringAsync().catch(() => '')).trim();
  if (text !== '') return { kind: 'text', text };
  return holdsText ? { kind: 'refused' } : { kind: 'empty' };
}

/**
 * Whether the tap should point to the Settings switch: always after a refusal, and once per install
 * after an iOS paste (the prompt keeps coming until the switch is on).
 */
export function showsPasteHint(read: PasteRead, ios: boolean, hintShown: boolean): boolean {
  if (!ios) return false;
  if (read.kind === 'refused') return true;
  return read.kind === 'text' && !hintShown;
}
