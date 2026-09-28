/**
 * The real-photo flow's state machine (3a-3 "USE A REAL PHOTO"), over the photo ports: choose a
 * source, lift the subject (or fall back to a circle crop), zoom, upload, then hand the media key
 * to the draft. Every undesigned state the flow can reach is a named state here.
 */
/* eslint-disable lingui/no-unlocalized-strings -- state discriminants and provider ids, never copy. */
import { useCallback, useState } from 'react';

import type { RequestOutcome } from '@/lib/permissions';

import type { PhotoServices, PreparedAvatar } from './photo-pipeline';

export type RealPhotoState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'choosing' }
  | { readonly kind: 'lifting' }
  | {
      readonly kind: 'preview';
      readonly uri: string;
      readonly lifted: boolean;
      readonly zoom: number;
    }
  | { readonly kind: 'uploading'; readonly progress: number; readonly preview: string }
  | {
      readonly kind: 'done';
      readonly mediaKey: string;
      readonly uri: string;
      readonly cutout: boolean;
    }
  | { readonly kind: 'camera_denied' }
  | { readonly kind: 'rate_limited'; readonly retryAfterS: number | null }
  | { readonly kind: 'failed'; readonly offline: boolean };

export interface RealPhotoDeps {
  /** Null when this build has no photo picker; the flow then stays idle. */
  readonly photos: PhotoServices | null;
  /** The camera's just-in-time primer then OS prompt (permission orchestrator). */
  readonly requestCamera: () => Promise<RequestOutcome>;
  readonly onUploaded: (result: { mediaKey: string; uri: string; cutout: boolean }) => void;
}

export function useRealPhoto({ photos, requestCamera, onUploaded }: RealPhotoDeps) {
  const [state, setState] = useState<RealPhotoState>({ kind: 'idle' });
  const [source, setSource] = useState<string | null>(null);

  const lift = useCallback(
    async (uri: string) => {
      setSource(uri);
      setState({ kind: 'lifting' });
      const lifter = photos?.lift ?? null;
      const lifted = lifter === null ? null : await lifter.lift(uri).catch(() => null);
      setState({ kind: 'preview', uri: lifted?.uri ?? uri, lifted: lifted !== null, zoom: 1 });
    },
    [photos],
  );

  const fromLibrary = useCallback(async () => {
    if (photos === null) return;
    const picked = await photos.picker.pickFromLibrary();
    if (picked === null) setState({ kind: 'choosing' });
    else await lift(picked.uri);
  }, [photos, lift]);

  const fromCamera = useCallback(async () => {
    if (photos === null) return;
    const outcome = await requestCamera();
    if (outcome.result !== 'granted' && outcome.result !== 'partial') {
      setState(outcome.result === 'declined' ? { kind: 'choosing' } : { kind: 'camera_denied' });
      return;
    }
    const taken = await photos.picker.takePhoto();
    if (taken.kind === 'taken') await lift(taken.photo.uri);
    else if (taken.kind === 'denied') setState({ kind: 'camera_denied' });
    else setState({ kind: 'choosing' });
  }, [photos, lift, requestCamera]);

  const upload = useCallback(
    async (preview: { uri: string; lifted: boolean; zoom: number }) => {
      if (photos === null) return;
      setState({ kind: 'uploading', progress: 0, preview: preview.uri });
      let prepared: PreparedAvatar;
      try {
        prepared = await photos.prepare(preview.uri, preview.lifted, preview.zoom);
      } catch {
        setState({ kind: 'failed', offline: false });
        return;
      }
      const outcome = await photos.upload(prepared, (progress) =>
        setState({ kind: 'uploading', progress, preview: preview.uri }),
      );
      if (outcome.kind === 'uploaded') {
        const result = { mediaKey: outcome.mediaKey, uri: prepared.uri, cutout: prepared.cutout };
        setState({ kind: 'done', ...result });
        onUploaded(result);
      } else if (outcome.kind === 'rate_limited') {
        setState({ kind: 'rate_limited', retryAfterS: outcome.retryAfterS });
      } else {
        setState({ kind: 'failed', offline: outcome.kind === 'offline' });
      }
    },
    [photos, onUploaded],
  );

  return {
    state,
    open: () => setState({ kind: 'choosing' }),
    close: () => setState({ kind: 'idle' }),
    fromLibrary,
    fromCamera,
    setZoom: (zoom: number) => setState((s) => (s.kind === 'preview' ? { ...s, zoom } : s)),
    confirm: () => {
      if (state.kind === 'preview') void upload(state);
    },
    retry: () => {
      if (source !== null) void lift(source);
      else setState({ kind: 'choosing' });
    },
  };
}
