/**
 * The meet-up's guide is a plain image rendered from the sticker PNG, so it draws inside a native
 * map annotation every time: for each of the six guides the image mounts with the PNG it was given.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { GUIDE_AVATAR_IDS, GUIDE_STICKERS } from '@/ui/avatar/guides';

import { GuideImage, toBase64 } from '../map/guide-image';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('GuideImage', () => {
  it.each(GUIDE_AVATAR_IDS)('mounts the %s sticker image', async (id) => {
    const guide = GUIDE_STICKERS[id];
    const rendered: string[] = [];
    await render(
      <GuideImage
        guide={guide}
        size={44}
        render={(kind) => {
          rendered.push(kind);
          return Promise.resolve(PNG);
        }}
      />,
    );
    const image = await screen.findByTestId(`live-guide-${id}-image`);
    expect(image.props.source).toEqual({ uri: `data:image/png;base64,${toBase64(PNG)}` });
    expect(rendered).toEqual([guide.kind]);
    expect(screen.getByLabelText(guide.name)).toBeTruthy();
  });
});
