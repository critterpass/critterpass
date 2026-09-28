/**
 * The device's photo avatar services: the system photo picker (PHPicker / Android Photo Picker, no
 * permission) and the camera through expo-image-picker, the on-device subject lift and avatar PNG
 * (cp-subject-lift, handed in by the route), and the upload through the avatar presign. Null in a
 * binary built without either native module, so the real-photo option is only offered where it
 * works.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, module names and HTTP verbs, never copy. */
import { requireOptionalNativeModule } from 'expo';
import { File } from 'expo-file-system';
import type * as ImagePickerModule from 'expo-image-picker';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import {
  photoServicesFrom,
  type AvatarLifter,
  type PhotoPicker,
  type PhotoServices,
  type PresignHttp,
  type TakePhotoOutcome,
} from './photo-pipeline';

function imagePicker(ImagePicker: typeof ImagePickerModule): PhotoPicker {
  const options: ImagePickerModule.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: false,
    exif: false,
  };
  return {
    async pickFromLibrary() {
      const result = await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? undefined : result.assets[0];
      return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
    },
    async takePhoto(): Promise<TakePhotoOutcome> {
      try {
        const result = await ImagePicker.launchCameraAsync({
          ...options,
          cameraType: ImagePicker.CameraType.front,
        });
        const asset = result.canceled ? undefined : result.assets[0];
        return asset
          ? { kind: 'taken', photo: { uri: asset.uri, width: asset.width, height: asset.height } }
          : { kind: 'cancelled' };
      } catch {
        // The picker rejects when the camera permission is missing (revoked in Settings).
        return { kind: 'denied' };
      }
    },
  };
}

/** `fetch` for the presign call, XMLHttpRequest for the signed PUT (it reports upload progress). */
const presignHttp: PresignHttp = {
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
      xhr.onload = () => resolve(xhr.status);
      xhr.onerror = () => reject(new Error('upload failed'));
      xhr.ontimeout = () => reject(new Error('upload timed out'));
      xhr.send(bytes);
    });
  },
};

let services: PhotoServices | null | undefined;

/** `lifter` is null in a binary without cp-subject-lift. */
export function devicePhotoServices(lifter: AvatarLifter | null): PhotoServices | null {
  if (services !== undefined) return services;
  if (lifter === null || requireOptionalNativeModule('ExponentImagePicker') === null) {
    services = null;
    return services;
  }
  // Required only once its native module is known to exist: the import itself needs it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native-module load
  const ImagePicker = require('expo-image-picker') as typeof ImagePickerModule;
  services = photoServicesFrom(lifter, imagePicker(ImagePicker), presignHttp, (uri) =>
    new File(uri).bytes(),
  );
  return services;
}
