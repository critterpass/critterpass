/**
 * A link that cannot be followed lands on Home with a `notice`: Home says why once, as a toast,
 * and drops the param so the same visit never says it twice.
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { Slot, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import { toastQueue } from '@/motion/island-toast';

import { useLinkNotice } from '../link-notice';

// Imported last: see ui/shell/__tests__/tab-bar.test.tsx for why.
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';

function Root() {
  return (
    <I18nProvider i18n={i18n}>
      <Slot />
    </I18nProvider>
  );
}

function Home() {
  const params = useLocalSearchParams<{ notice?: string; crewId?: string }>();
  useLinkNotice(typeof params.notice === 'string' ? params.notice : null);
  return <Text>{`home notice=${params.notice ?? 'none'} crew=${params.crewId ?? 'none'}`}</Text>;
}

async function open(initialUrl: string) {
  await renderRouter({ _layout: Root, index: Home }, { initialUrl });
  await waitFor(() => expect(screen.getByText(/^home notice=none/u)).toBeTruthy());
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

afterEach(() => toastQueue.resetForTests());

describe('a link notice on Home', () => {
  it.each([
    ['link_unknown', 'That link couldn’t be opened'],
    ['link_already_member', 'That link is for new travellers. You already have your pass'],
    ['link_unavailable', 'That link isn’t available any more'],
  ])('says %s once and drops the param', async (notice, title) => {
    await open(`/?notice=${notice}`);
    expect(toastQueue.getCurrent()?.title).toBe(title);
    expect(screen.getByText('home notice=none crew=none')).toBeTruthy();
  });

  it('says nothing for a notice it does not know, and still drops it', async () => {
    await open('/?notice=something_else');
    expect(toastQueue.getCurrent()).toBeNull();
    expect(screen.getByText('home notice=none crew=none')).toBeTruthy();
  });

  it('keeps the crew a link handed off to', async () => {
    await open('/?crewId=abc');
    expect(toastQueue.getCurrent()).toBeNull();
    expect(screen.getByText('home notice=none crew=abc')).toBeTruthy();
  });
});
