/**
 * Another area draws one of the viewer's forms by id: the form's critter art, named as the viewer
 * knows it, read from the real local database.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react-native';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { FormSticker } from '../form-sticker';
import { CHEP_COMMON, seedCritters } from '../test-support/seed-critters';

const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
});

async function show(form: string) {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  await seedCritters(stack.db, stack.uid);
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <LocalFirstProvider value={stack.value}>
        <FormSticker form={form} size={64} />
      </LocalFirstProvider>
    </I18nProvider>,
  );
}

describe('FormSticker', () => {
  it('draws an owned form by id, named as the viewer knows it', async () => {
    await show(CHEP_COMMON);
    expect(await screen.findByLabelText('Chép')).toBeTruthy();
  });

  it('draws nothing for a form not on this phone', async () => {
    await show('0192f000-0000-7000-8000-0000000fffff');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.toJSON()).toBeNull();
  });
});
