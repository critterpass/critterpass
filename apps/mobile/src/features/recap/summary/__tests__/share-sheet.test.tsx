/**
 * The recap's share sheet: the preview is the picture that gets shared, in the format picked, and
 * Share and Save hand that same picture on. The renderer and the phone's share and photo modules
 * are the boundaries.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock('@/motion/use-loop', () => ({ useLoop: () => ({}) }));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toastQueue } from '@/motion';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import type { ShareFormat } from '@/ui/share-image/ShareImageSheet';
import type { ShareActionsDeps } from '@/ui/share-image/share-actions';
import { renderUi } from '@/ui/test-support/render';

import { ShareSheetView } from '../share-sheet';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const PICTURE: Readonly<Record<ShareFormat, Uint8Array>> = {
  story: new Uint8Array([9, 16]),
  post: new Uint8Array([4, 5]),
};

function setup() {
  const written: Uint8Array[] = [];
  const shared: string[] = [];
  const saved: string[] = [];
  const drawn: ShareFormat[] = [];
  const deps: ShareActionsDeps = {
    writeTempFile: (bytes) => {
      written.push(bytes);
      return Promise.resolve(`file:///tmp/recap-${String(written.length)}.png`);
    },
    deleteFile: () => Promise.resolve(),
    sharing: {
      isAvailableAsync: () => Promise.resolve(true),
      shareAsync: (uri) => {
        shared.push(uri);
        return Promise.resolve();
      },
    },
    mediaLibrary: {
      requestPermissionsAsync: () => Promise.resolve({ granted: true }),
      createAssetAsync: (uri) => {
        saved.push(uri);
        return Promise.resolve(null);
      },
    },
    canOpenURL: () => Promise.resolve(false),
  };
  const render = (format: ShareFormat) => {
    drawn.push(format);
    return Promise.resolve(PICTURE[format]);
  };
  const onClose = jest.fn();
  const ui = (
    <SafeAreaProvider initialMetrics={METRICS}>
      <GestureHandlerRootView>
        <ScreenJoltProvider>
          <ShareSheetView
            title="Share the recap"
            altText="Đà Nẵng, the recap"
            render={render}
            deps={deps}
            onClose={onClose}
          />
        </ScreenJoltProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
  return { ui, written, shared, saved, drawn, onClose };
}

afterEach(() => {
  toastQueue.dismiss();
});

describe('recap share sheet', () => {
  it('previews the story picture first and shares exactly that picture', async () => {
    const s = setup();
    await renderUi(s.ui);
    await waitFor(() => expect(screen.getByTestId('recap-share-image-story')).toBeTruthy());
    expect(s.drawn).toEqual(['story']);

    await fireEvent.press(screen.getByTestId('recap-share-send'));
    await waitFor(() => expect(s.shared).toHaveLength(1));
    expect(s.written).toEqual([PICTURE.story]);
  });

  it('redraws in the post shape when switched, and saves that one to Photos', async () => {
    const s = setup();
    await renderUi(s.ui);
    await waitFor(() => expect(screen.getByTestId('recap-share-image-story')).toBeTruthy());
    await fireEvent.press(screen.getByText(/^post$/iu));
    await waitFor(() => expect(screen.getByTestId('recap-share-image-post')).toBeTruthy());
    expect(s.drawn).toEqual(['story', 'post']);

    await fireEvent.press(screen.getByTestId('recap-share-save'));
    await waitFor(() => expect(s.saved).toHaveLength(1));
    expect(s.written).toEqual([PICTURE.post]);
    expect(s.shared).toHaveLength(0);
    await act(() => Promise.resolve());
  });
});
