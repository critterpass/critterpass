/**
 * Every developer scene (the screenshot source for 3c-3…3c-10 and their states) renders the real
 * view without throwing, in English and Vietnamese catalog order alike.
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
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';

import { SETUP_SCENES } from '../scenes';
import { renderSetup } from '../test-support/setup-harness';

jest.setTimeout(60_000);

describe('setup scenes', () => {
  it.each(SETUP_SCENES.map((scene) => [scene.name, scene] as const))(
    '%s renders',
    async (_name, scene) => {
      await renderSetup(<>{scene.render()}</>);
      expect(screen.toJSON()).not.toBeNull();
    },
  );
});
