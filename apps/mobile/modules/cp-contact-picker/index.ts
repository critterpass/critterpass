/**
 * The system contact picker for one person, with no Contacts permission on either platform: the
 * OS shows the address book out of process and hands back only what the user taps. The app gets
 * the picked name and the chosen phone number, never the address book.
 */
import { nativeCpContactPickerModule } from './src/CpContactPickerModule';

export interface PickedContact {
  readonly name: string;
  /** As stored on the card (E.164 when the OS knows it), or null when none was chosen. */
  readonly phone: string | null;
}

/** False in a binary built without the module: callers hide the picker. */
export function isContactPickerAvailable(): boolean {
  return nativeCpContactPickerModule !== null;
}

/** The picked person, or null when the user cancels (or the build has no picker). */
export async function pickContact(): Promise<PickedContact | null> {
  if (nativeCpContactPickerModule === null) return null;
  const picked = await nativeCpContactPickerModule.pick();
  if (picked === null) return null;
  const name = picked.name.trim();
  const phone = picked.phone?.trim() ?? '';
  return { name, phone: phone === '' ? null : phone };
}
