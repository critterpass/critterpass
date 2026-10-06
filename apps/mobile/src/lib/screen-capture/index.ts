/**
 * A picture of what is on screen now, for a problem report the user chose to send. Written to a
 * temporary JPEG the caller attaches or deletes; nothing is captured without that user action.
 */

/** The one call used from react-native-view-shot. */
interface ViewShot {
  readonly captureScreen: (options: {
    readonly format: 'jpg' | 'png';
    readonly quality: number;
    readonly result: 'tmpfile';
  }) => Promise<string>;
}

/** The file URI of a JPEG of the current screen, or `null` when the capture fails. */
export async function captureScreenshot(): Promise<string | null> {
  try {
    // Loaded on demand and typed here: the package ships its TypeScript source as its types, which
    // does not pass this project's strict compiler options.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    const { captureScreen } = require('react-native-view-shot') as ViewShot;
    return await captureScreen({ format: 'jpg', quality: 0.8, result: 'tmpfile' });
  } catch {
    return null;
  }
}
