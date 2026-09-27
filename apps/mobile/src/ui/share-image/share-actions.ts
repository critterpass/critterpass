// Meta's Instagram Stories API requires a registered Facebook/Meta app id ("source_application") —
// not yet provisioned for this app (see the phase's non-code dependencies table). Until a founder
// supplies one, `canShareToInstagramStories` always reports the feature unavailable, and the sheet
// falls back to the system share sheet only — exactly the fallback the phase's own risk table calls
// for, not a placeholder left to fix later.
const META_APP_ID = '';
// eslint-disable-next-line lingui/no-unlocalized-strings -- a URL scheme identifier, never shown to a user
const INSTAGRAM_STORIES_URL_SCHEME = 'instagram-stories://share';

export interface WriteTempFile {
  (bytes: Uint8Array, extension: string): Promise<string>;
}

export interface SharingModule {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(
    uri: string,
    options?: { readonly dialogTitle?: string; readonly mimeType?: string },
  ): Promise<void>;
}

export interface MediaLibraryModule {
  requestPermissionsAsync(writeOnly: boolean): Promise<{ readonly granted: boolean }>;
  createAssetAsync(uri: string): Promise<unknown>;
}

export interface ShareActionsDeps {
  readonly writeTempFile: WriteTempFile;
  readonly deleteFile: (uri: string) => Promise<void>;
  readonly sharing: SharingModule;
  readonly mediaLibrary: MediaLibraryModule;
  readonly canOpenURL: (url: string) => Promise<boolean>;
}

export interface InstagramStoriesPayload {
  readonly backgroundImage: Uint8Array;
  readonly stickerImage?: Uint8Array;
}

/** Whether Instagram Stories sharing can be offered right now — gated on both a configured app id and Instagram being installed, per the design's "hidden if app absent" rule. */
export async function canShareToInstagramStories(
  deps: Pick<ShareActionsDeps, 'canOpenURL'>,
): Promise<boolean> {
  if (!META_APP_ID) return false;
  return deps.canOpenURL(INSTAGRAM_STORIES_URL_SCHEME);
}

/** Writes `bytes` to a temp PNG and hands it to the system share sheet, cleaning up the temp file afterward regardless of outcome. */
export async function shareViaSystemSheet(
  bytes: Uint8Array,
  altText: string,
  deps: ShareActionsDeps,
): Promise<void> {
  const uri = await deps.writeTempFile(bytes, 'png');
  try {
    const available = await deps.sharing.isAvailableAsync();
    // eslint-disable-next-line lingui/no-unlocalized-strings -- programmer-error diagnostic, never shown to a user
    if (!available) throw new Error('shareViaSystemSheet: sharing is not available on this device');
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a MIME type, never shown to a user
    await deps.sharing.shareAsync(uri, { dialogTitle: altText, mimeType: 'image/png' });
  } finally {
    await deps.deleteFile(uri);
  }
}

/** Saves `bytes` to the user's photo library via a write-only ("add only") permission — never reads or deletes existing photos. */
export async function saveToPhotos(bytes: Uint8Array, deps: ShareActionsDeps): Promise<void> {
  const permission = await deps.mediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- programmer-error diagnostic, never shown to a user
    throw new Error('saveToPhotos: photo library add permission was not granted');
  }
  const uri = await deps.writeTempFile(bytes, 'png');
  try {
    await deps.mediaLibrary.createAssetAsync(uri);
  } finally {
    await deps.deleteFile(uri);
  }
}

/**
 * Hands `payload` to Instagram's Stories share sheet. The actual OS-level handoff that API
 * requires (iOS: a structured `UIPasteboard` write; Android: an `Intent` with clip data URIs) is
 * native platform code outside this package's scope — `deps.shareToStories` is the seam a later
 * integration (once a Meta app id exists) wires to a real native module. Never called unless
 * `canShareToInstagramStories` already returned `true`.
 */
export async function shareToInstagramStories(
  payload: InstagramStoriesPayload,
  deps: Pick<ShareActionsDeps, 'canOpenURL'> & {
    readonly shareToStories: (value: InstagramStoriesPayload) => Promise<void>;
  },
): Promise<void> {
  const available = await canShareToInstagramStories(deps);
  if (!available) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- programmer-error diagnostic, never shown to a user
    throw new Error('shareToInstagramStories: Instagram Stories sharing is not available');
  }
  await deps.shareToStories(payload);
}
