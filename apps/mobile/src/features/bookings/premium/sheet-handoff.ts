/**
 * Leaving a native form sheet for the next step (a pushed page, the document scanner): the sheet
 * goes first and the next step starts once it is down. Dismissing the sheet and pushing in the same
 * frame slides the page in under the sheet while it is still sliding down, and UIKit refuses to
 * present the scanner while another presentation is still running.
 */
import { router } from 'expo-router';
import { Platform } from 'react-native';

/** About how long the system takes to lower a form sheet. */
export const SHEET_CLOSE_MS = Platform.OS === 'ios' ? 380 : 300;

export function leaveSheetThen(next: () => void): void {
  if (router.canGoBack()) router.back();
  setTimeout(next, SHEET_CLOSE_MS);
}
