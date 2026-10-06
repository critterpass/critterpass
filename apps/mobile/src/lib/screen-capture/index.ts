/**
 * A picture of what is on screen now, for a problem report the user chose to send. Written to a
 * temporary JPEG the caller attaches or deletes; nothing is captured without that user action.
 */
/* eslint-disable lingui/no-unlocalized-strings -- capture options, never copy. */
import { captureScreen } from 'react-native-view-shot';

/** The file URI of a JPEG of the current screen, or `null` when the capture fails. */
export async function captureScreenshot(): Promise<string | null> {
  try {
    return await captureScreen({ format: 'jpg', quality: 0.8, result: 'tmpfile' });
  } catch {
    return null;
  }
}
