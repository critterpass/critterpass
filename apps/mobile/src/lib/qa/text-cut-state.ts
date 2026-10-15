/**
 * What the latest layout of each text said about its cut, for the truncation report to wait on.
 * Android lays an auto-fitted or flex-sized label out at its first size and width before the
 * settled ones, so its first layout event can show lost characters the screen never draws: a
 * truncation report there waits until the text has had time to settle, and is dropped when a later
 * layout of the same text fits whole.
 */
const cutNow = new Map<string, boolean>();
let lastText: string | null = null;

/** Records one layout of `text` (called inside the text's layout event, before any report). */
export function noteTextCut(text: string, cut: boolean): void {
  lastText = text;
  cutNow.set(text, cut);
}

/** The text whose layout event is being handled right now (its reports follow synchronously). */
export function textBeingLaidOut(): string | null {
  return lastText;
}

/** True while the latest layout of `text` still lost characters. */
export function textStillCut(text: string): boolean {
  return cutNow.get(text) === true;
}

export function resetTextCutState(): void {
  cutNow.clear();
  lastText = null;
}
