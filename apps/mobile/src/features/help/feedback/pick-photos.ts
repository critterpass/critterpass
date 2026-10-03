/**
 * Pictures for a feedback note from the photo library (the dashed +): compressed by the picker, and
 * nothing at all on a build without the picker module.
 */
/* eslint-disable lingui/no-unlocalized-strings -- module names and content types, never copy. */
import { requireOptionalNativeModule } from 'expo';
import type * as ImagePickerModule from 'expo-image-picker';

import type { Attachment } from './draft';

const PHOTO_QUALITY = 0.7;

function imagePicker(): typeof ImagePickerModule | null {
  if (requireOptionalNativeModule('ExponentImagePicker') === null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native-module load
  return require('expo-image-picker') as typeof ImagePickerModule;
}

export async function pickFeedbackPhotos(limit: number): Promise<Attachment[]> {
  const ImagePicker = imagePicker();
  if (ImagePicker === null || limit <= 0) return [];
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
      exif: false,
      allowsMultipleSelection: limit > 1,
      selectionLimit: limit,
    });
    if (result.canceled) return [];
    return result.assets.map((asset) => ({
      uri: asset.uri,
      contentType: asset.mimeType ?? 'image/jpeg',
      bytes: asset.fileSize ?? null,
    }));
  } catch {
    return [];
  }
}
