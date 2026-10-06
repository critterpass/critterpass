/**
 * The device side of album uploads: the system photo picker (no library permission; photos only,
 * so a video never reaches the album), file bytes, SHA-256, and the media api over fetch and
 * XMLHttpRequest (for upload progress). One queue for the app, so uploads keep going while the
 * traveller moves between screens.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and module names, never copy. */
import { requireOptionalNativeModule } from 'expo';
import { randomUUID, CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { File } from 'expo-file-system';
import type * as ImagePickerModule from 'expo-image-picker';
import * as Sentry from '@sentry/react-native';

import type { CommandClient } from '@/data/commands/client';
import { sessionHeaders } from '@/data/app-session/auth-client';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { uploadAttachment, type MediaHttp } from '@/features/crew';

import { registerPhotoCommand } from '../commands';
import { deviceBackgroundQueue } from './device-background';
import {
  AlbumUploadQueue,
  exifTakenAt,
  joinUploads,
  type AlbumUploads,
  type PickedAlbumPhoto,
} from './upload-queue';

/** The picker's JPEG quality: re-encoding also leaves the camera's metadata behind. */
const PHOTO_QUALITY = 0.85;

export const albumHttp: MediaHttp = {
  async postJson(path, body) {
    const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json().catch(() => null)) as unknown };
  },
  put(url, headers, bytes, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
      };
      xhr.onload = () =>
        resolve({ status: xhr.status, body: null, etag: xhr.getResponseHeader('ETag') });
      xhr.onerror = () => reject(new Error('upload failed'));
      xhr.ontimeout = () => reject(new Error('upload timed out'));
      xhr.send(bytes);
    });
  },
};

export type AlbumPick =
  | { readonly kind: 'picked'; readonly photos: readonly PickedAlbumPhoto[] }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed' };

function imagePicker(): typeof ImagePickerModule | null {
  if (requireOptionalNativeModule('ExponentImagePicker') === null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native-module load
  return require('expo-image-picker') as typeof ImagePickerModule;
}

export async function pickAlbumPhotos(): Promise<AlbumPick> {
  const ImagePicker = imagePicker();
  if (ImagePicker === null) return { kind: 'cancelled' };
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
      exif: true,
      allowsMultipleSelection: true,
      selectionLimit: 50,
    });
    if (result.canceled) return { kind: 'cancelled' };
    return {
      kind: 'picked',
      photos: result.assets.map((asset) => {
        const takenAt = exifTakenAt(
          asset.exif?.['DateTimeOriginal'],
          asset.exif?.['OffsetTimeOriginal'],
        );
        return {
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          ...(takenAt === undefined ? {} : { takenAt }),
        };
      }),
    };
  } catch (error) {
    Sentry.captureException(error, { tags: { 'album.media': 'photo_picker' } });
    return { kind: 'failed' };
  }
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

let shared: AlbumUploads | null = null;

/**
 * The app's one album upload queue, bound to the command client on first use: the system's
 * background transfer where the app has it (uploads carry on with the app closed), with the
 * foreground path for anything the system will not take and for binaries without the module.
 */
export function albumUploadQueue(commands: CommandClient): AlbumUploads {
  if (shared !== null) return shared;
  const foreground = new AlbumUploadQueue({
    readBytes: (uri) => new File(uri).bytes(),
    sha256: async (bytes) => hex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes))),
    upload: (input, onProgress) => uploadAttachment(albumHttp, input, onProgress),
    register: (payload) => commands.send(registerPhotoCommand, payload),
    newId: () => randomUUID(),
  });
  const background = deviceBackgroundQueue({
    commands,
    http: albumHttp,
    foreground: (tripId, photo, known) => foreground.add(tripId, [photo], known),
  });
  shared = background === null ? foreground : joinUploads(background, foreground);
  return shared;
}
