/**
 * The device side of chat media: the system photo picker and camera (compressed on the way in),
 * file bytes and SHA-256 for the upload checksum, the media api (fetch for JSON, XMLHttpRequest for
 * the signed PUTs so they report progress), the microphone (mono AAC with metering, for the live
 * level), voice notes saved to the cache and played from there, and the Settings page. Mounted by the chat route.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, module names and HTTP verbs, never copy. */
import { requireOptionalNativeModule } from 'expo';
import {
  requestRecordingPermissionsAsync,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { File } from 'expo-file-system';
import type * as ImagePickerModule from 'expo-image-picker';
import { useMemo, type ReactNode } from 'react';
import * as Sentry from '@sentry/react-native';
import { Linking, Platform } from 'react-native';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { currentAudioSessionCategory } from '@/motion/feedback';

import {
  ChatMediaProvider,
  type ChatMediaServices,
  type MediaHttp,
  type PickOutcome,
  type VoiceRecorderPort,
} from './media-services';
import { deviceVoiceFile, deviceVoicePlayer } from './voice-player';

const VOICE: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
  isMeteringEnabled: true,
};
/**
 * Picker JPEG quality: phone originals shrink several times over with no visible loss in chat. On
 * Android the picker's re-encode fails in builds whose shrinker stripped its native classes
 * (ExceptionInInitializerError after the pick), so there the photo is sent as picked and the media
 * worker makes the chat's thumbnail.
 */
const PHOTO_QUALITY = Platform.OS === 'android' ? 1 : 0.7;
const SILENCE_DB = -60;

/**
 * The session to return to once a recording stops: the one the app holds (`ambient`, or `playback`
 * while something plays through the silent switch), never the library's defaults.
 */
function afterRecording() {
  return {
    allowsRecording: false,
    playsInSilentMode: currentAudioSessionCategory() === 'playback',
  };
}

const http: MediaHttp = {
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

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function imagePicker(): typeof ImagePickerModule | null {
  if (requireOptionalNativeModule('ExponentImagePicker') === null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native-module load
  return require('expo-image-picker') as typeof ImagePickerModule;
}

async function pickPhotos(source: 'library' | 'camera'): Promise<PickOutcome> {
  const ImagePicker = imagePicker();
  if (ImagePicker === null) return { kind: 'cancelled' };
  const options: ImagePickerModule.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: PHOTO_QUALITY,
    exif: false,
    allowsMultipleSelection: source === 'library',
    selectionLimit: 10,
  };
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return { kind: 'denied' };
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return { kind: 'cancelled' };
    return {
      kind: 'picked',
      photos: result.assets.map((asset) => ({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        ...(asset.fileSize === undefined ? {} : { bytes: asset.fileSize }),
      })),
    };
  } catch (error) {
    // The picker failing is not a refusal: say so honestly and let the person try again.
    Sentry.captureException(error, { tags: { 'chat.media': 'photo_picker', source } });
    return { kind: 'failed' };
  }
}

export function DeviceChatMediaProvider({ children }: { readonly children: ReactNode }) {
  const audio = useAudioRecorder(VOICE);
  const services = useMemo<ChatMediaServices>(() => {
    const recorder: VoiceRecorderPort = {
      async start() {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) return 'denied';
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await audio.prepareToRecordAsync();
        audio.record();
        return 'recording';
      },
      async stop() {
        const durationMs = audio.getStatus().durationMillis;
        await audio.stop();
        await setAudioModeAsync(afterRecording());
        return audio.uri === null ? null : { uri: audio.uri, durationMs };
      },
      async cancel() {
        await audio.stop();
        await setAudioModeAsync(afterRecording());
      },
      level() {
        const db = audio.getStatus().metering ?? SILENCE_DB;
        return Math.min(1, Math.max(0, (db - SILENCE_DB) / -SILENCE_DB));
      },
    };
    return {
      pickPhotos,
      readBytes: (uri) => new File(uri).bytes(),
      sha256: async (bytes) =>
        hex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes))),
      http,
      recorder,
      audioFile: deviceVoiceFile,
      createPlayer: deviceVoicePlayer,
      openSettings: () => void Linking.openSettings(),
    };
  }, [audio]);
  return <ChatMediaProvider services={services}>{children}</ChatMediaProvider>;
}
