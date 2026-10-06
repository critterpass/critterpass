/**
 * The help centre's articles come over the api and stay readable from the last good copy: the
 * app's language when it has articles, English (flagged) when it has none, and an answered but
 * empty list when the phone is offline and never opened the help centre.
 */
import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { TravelDataReaderProvider, type TravelDataReader } from '@/data/travel-data/client';
import { recordedReader } from '@/data/travel-data/test-support/recorded-reader';

import { useHelpArticles } from '../data/use-help-articles';

function withReader(reader: TravelDataReader) {
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={i18n}>
      <TravelDataReaderProvider value={reader}>{children}</TravelDataReaderProvider>
    </I18nProvider>
  );
}

describe('help articles', () => {
  it('shows the language’s articles, and the same ones from the last good copy offline', async () => {
    i18n.loadAndActivate({ locale: 'vi', messages: {} });
    const reader = recordedReader({ '/v1/help/library': [200, 'help-library-vi'] });
    const first = await renderHook(() => useHelpArticles(), { wrapper: withReader(reader) });
    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    expect(reader.paths).toEqual(['/v1/help/library?locale=vi']);
    expect(first.result.current.fallback).toBe(false);
    expect(first.result.current.articles.map((a) => a.title)).toEqual(['Hoàn tiền']);
    await first.unmount();

    reader.online = false;
    const second = await renderHook(() => useHelpArticles(), { wrapper: withReader(reader) });
    await waitFor(() => expect(second.result.current.loaded).toBe(true));
    expect(second.result.current.articles.map((a) => a.body_md)).toEqual([
      '# Hoàn tiền\n\nMở **Tiền** rồi chọn khoản cần hoàn.',
    ]);
  });

  it('falls back to English, and says so, when the language has no articles', async () => {
    i18n.loadAndActivate({ locale: 'ja', messages: {} });
    const reader = recordedReader({ '/v1/help/library': [200, 'help-library-en'] });
    const { result } = await renderHook(() => useHelpArticles(), { wrapper: withReader(reader) });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.fallback).toBe(true);
    expect(result.current.articles.map((a) => a.slug)).toEqual(['offline-maps', 'refunds']);
  });

  it('answers with no articles when offline before the help centre was ever read', async () => {
    i18n.loadAndActivate({ locale: 'ko', messages: {} });
    const reader = recordedReader({});
    reader.online = false;
    const { result } = await renderHook(() => useHelpArticles(), { wrapper: withReader(reader) });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current).toMatchObject({ articles: [], fallback: false });
  });
});
