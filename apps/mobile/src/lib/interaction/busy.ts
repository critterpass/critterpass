/**
 * Whether the person is in the middle of something that an interruption would cost them: a sheet
 * or rise is up, the keyboard is showing, or a text field has focus. Anything that may take the
 * screen away on its own (a prompt, a restart) asks this first.
 *
 * The sheet presenter lives in the UI layer, which this layer cannot import: it registers its own
 * count here.
 */
import { Keyboard, TextInput } from 'react-native';

let sheetsOpen: () => boolean = () => false;

/** Called once by the sheet presenter with its "a sheet or rise is up" reading. */
export function provideSheetsOpen(probe: () => boolean): void {
  sheetsOpen = probe;
}

export function isBusy(): boolean {
  return sheetsOpen() || Keyboard.isVisible() || TextInput.State.currentlyFocusedInput() !== null;
}
