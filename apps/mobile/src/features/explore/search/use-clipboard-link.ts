/**
 * The clipboard card's state (7d-1): on Android the clipboard is read when the search opens and
 * when the app comes back; on iOS the phone is only asked whether it holds a link, and the card
 * shows the system paste control so nothing is read without a tap (no paste alert). A link found
 * gets its post title from the preview route (oEmbed only, no model).
 */
/* eslint-disable lingui/no-unlocalized-strings -- api paths and wire keys, never copy. */
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { clipboardOffer, type ClipboardLink } from './clipboard';
import { useSearchServices } from './data/search-services';

export interface LinkPreview {
  readonly title: string | null;
  readonly author: string | null;
  readonly thumbUrl: string | null;
}

export type ClipboardCardState =
  | { readonly kind: 'none' }
  | { readonly kind: 'paste' }
  | { readonly kind: 'link'; readonly link: ClipboardLink; readonly preview: LinkPreview | null };

function previewOf(body: unknown): LinkPreview | null {
  const value = body as { title?: unknown; author?: unknown; thumb_url?: unknown } | null;
  if (value === null || typeof value !== 'object') return null;
  const text = (field: unknown) => (typeof field === 'string' && field !== '' ? field : null);
  return { title: text(value.title), author: text(value.author), thumbUrl: text(value.thumb_url) };
}

export function useClipboardLink(enabled: boolean): {
  readonly state: ClipboardCardState;
  readonly onPasted: (text: string) => void;
  readonly dismiss: () => void;
} {
  const services = useSearchServices();
  const [state, setState] = useState<ClipboardCardState>({ kind: 'none' });

  const offer = useCallback(
    (text: string | null) => {
      const link = clipboardOffer(text);
      if (link === null) {
        setState({ kind: 'none' });
        return;
      }
      setState({ kind: 'link', link, preview: null });
      const params = new URLSearchParams({ url: link.url });
      void services.getJson(`/v1/imports/preview?${params.toString()}`).then((read) => {
        if (read.kind !== 'ok') return;
        const preview = previewOf(read.body);
        setState((current) =>
          current.kind === 'link' && current.link.url === link.url
            ? { ...current, preview }
            : current,
        );
      });
    },
    [services],
  );

  const check = useCallback(async () => {
    const text = await services.readClipboard();
    if (text !== null) {
      offer(text);
      return;
    }
    if (await services.clipboardHasUrl()) {
      setState((current) => (current.kind === 'link' ? current : { kind: 'paste' }));
    }
  }, [services, offer]);

  useEffect(() => {
    if (!enabled) return undefined;
    void Promise.resolve().then(check);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void check();
    });
    return () => subscription.remove();
  }, [enabled, check]);

  return { state, onPasted: offer, dismiss: () => setState({ kind: 'none' }) };
}
