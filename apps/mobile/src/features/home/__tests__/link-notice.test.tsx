/**
 * A link that cannot be followed lands on Home with a `notice` and the moment it was routed. Home
 * says why once per link, as a toast: not again for the same address, again for a later link with
 * the same notice, and never for an address left over from an earlier visit.
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { act, render } from '@testing-library/react-native';

import { toastQueue } from '@/motion/island-toast';

import { NOTICE_FRESH_MS, resetLinkNoticesForTests, useLinkNotice } from '../link-notice';

const NOW = 1_000_000;

function Home(props: { notice: string | null; at: string | null; visible?: boolean }) {
  useLinkNotice({ notice: props.notice, at: props.at }, props.visible ?? true, () => NOW);
  return null;
}

const show = (props: Parameters<typeof Home>[0]) => (
  <I18nProvider i18n={i18n}>
    <Home {...props} />
  </I18nProvider>
);

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

afterEach(() => {
  toastQueue.resetForTests();
  resetLinkNoticesForTests();
});

describe('a link notice on Home', () => {
  it.each([
    ['link_unknown', 'That link couldn’t be opened'],
    ['link_already_member', 'That link is for new travellers. You already have your pass'],
    ['link_unavailable', 'That link isn’t available any more'],
  ])('says %s', async (notice, title) => {
    await render(show({ notice, at: String(NOW - 500) }));
    expect(toastQueue.getCurrent()?.title).toBe(title);
  });

  it('says it once for one link, and again for a later link with the same notice', async () => {
    const first = { notice: 'link_unknown', at: String(NOW - 500) };
    const view = await render(show(first));
    expect(toastQueue.getCurrent()).not.toBeNull();
    await act(() => toastQueue.dismiss());

    // Home drawn again on the same address (back from another tab, a new render): silence.
    await view.rerender(show({ ...first }));
    await view.unmount();
    await render(show(first));
    expect(toastQueue.getCurrent()).toBeNull();

    await render(show({ notice: 'link_unknown', at: String(NOW - 100) }));
    expect(toastQueue.getCurrent()?.title).toBe('That link couldn’t be opened');
  });

  it('waits while Home is not visible yet, then says it', async () => {
    const link = { notice: 'link_unknown', at: String(NOW - 500) };
    const view = await render(show({ ...link, visible: false }));
    expect(toastQueue.getCurrent()).toBeNull();
    await view.rerender(show({ ...link, visible: true }));
    expect(toastQueue.getCurrent()?.title).toBe('That link couldn’t be opened');
  });

  it.each([
    ['an address from an earlier visit', 'link_unknown', String(NOW - NOTICE_FRESH_MS)],
    ['a notice with no time', 'link_unknown', null],
    ['a time that is not a number', 'link_unknown', 'soon'],
    ['a notice it does not know', 'something_else', String(NOW - 500)],
  ])('says nothing for %s', async (_label, notice, at) => {
    await render(show({ notice, at }));
    expect(toastQueue.getCurrent()).toBeNull();
  });
});
