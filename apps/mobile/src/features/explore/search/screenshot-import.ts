/**
 * A screenshot into text on the phone (7d-3): the photo picker, then on-device OCR (`cp-ocr`), so
 * the image never leaves the phone; only the lines read go to the import, as `ocr_text`. A
 * screenshot with no readable text says so (the Gemini fallback for those stays off).
 */
/* eslint-disable lingui/no-unlocalized-strings -- native module names, never copy. */
import { requireOptionalNativeModule } from 'expo';
import type * as ImagePickerModule from 'expo-image-picker';

export type ScreenshotRead =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'no_text' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'unavailable' };

/** The part of `cp-ocr` the import needs. */
export interface ScreenshotOcr {
  recognize(uri: string): Promise<{
    readonly status: string;
    readonly lines: readonly { readonly text: string }[];
  }>;
}

/** Most text a screenshot import sends (the route takes up to 8,000 characters). */
const MAX_TEXT = 8000;

/** OCR lines as the import's text: trimmed, blank lines dropped, within the route's limit. */
export function screenshotText(lines: readonly { readonly text: string }[]): string | null {
  const text = lines
    .map((line) => line.text.trim())
    .filter((line) => line !== '')
    .join('\n')
    .slice(0, MAX_TEXT);
  return text === '' ? null : text;
}

function imagePicker(): typeof ImagePickerModule | null {
  if (requireOptionalNativeModule('ExponentImagePicker') === null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native-module load
  return require('expo-image-picker') as typeof ImagePickerModule;
}

export async function readScreenshot(ocr: ScreenshotOcr | null): Promise<ScreenshotRead> {
  const picker = imagePicker();
  if (picker === null || ocr === null) return { kind: 'unavailable' };
  try {
    const picked = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], exif: false });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (asset === undefined) return { kind: 'cancelled' };
    const result = await ocr.recognize(asset.uri);
    const text = result.status === 'ok' ? screenshotText(result.lines) : null;
    return text === null ? { kind: 'no_text' } : { kind: 'text', text };
  } catch {
    return { kind: 'unavailable' };
  }
}
