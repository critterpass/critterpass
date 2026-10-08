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
