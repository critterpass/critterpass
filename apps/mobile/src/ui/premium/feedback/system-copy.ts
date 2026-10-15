import { Platform } from 'react-native';

/** The first Android whose system confirms every copy to the clipboard itself (13, API 33). */
const SYSTEM_COPY_CONFIRM_API = 33;

/**
 * Whether the system shows its own confirmation when the app copies text: Android 13 and later
 * do, over the app's foot, so a plain "Copied" toast from the app would only sit hidden under it.
 * iOS and older Androids show nothing, so the app's toast says it happened.
 */
export function systemConfirmsCopy(
  os: typeof Platform.OS = Platform.OS,
  version: typeof Platform.Version = Platform.Version,
): boolean {
  return os === 'android' && typeof version === 'number' && version >= SYSTEM_COPY_CONFIRM_API;
}
