/**
 * The share sheet: the preview is the picture that gets shared, in the format picked, and Share
 * and Save hand that same picture on; a picture that fails to draw offers another go, and a failed
 * hand-off says so. The renderer and the phone's share and photo modules are the boundaries.
 */
jest.mock('@/motion/use-loop', () => ({ useLoop: () => ({}) }));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toastQueue } from '@/motion';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import type { ShareActionsDeps } from '../share-actions';
import { ShareSheet, type ShareFormat } from '../ShareSheet';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const PICTURE: Readonly<Record<ShareFormat, Uint8Array>> = {
  story: new Uint8Array([9, 16]),
  post: new Uint8Array([4, 5]),
};

interface SetupOptions {
  readonly render?: (format: ShareFormat) => Promise<Uint8Array>;
  readonly photosGranted?: boolean;
  readonly sharingAvailable?: boolean;
  readonly formats?: readonly ShareFormat[];
}

function setup(options: SetupOptions = {}) {
  const written: Uint8Array[] = [];
  const shared: string[] = [];
  const saved: string[] = [];
  const drawn: ShareFormat[] = [];
  const deps: ShareActionsDeps = {
    writeTempFile: (bytes) => {
      written.push(bytes);
      return Promise.resolve(`file:///tmp/share-${String(written.length)}.png`);
    },
    deleteFile: () => Promise.resolve(),
    sharing: {
      isAvailableAsync: () => Promise.resolve(options.sharingAvailable ?? true),
      shareAsync: (uri) => {
        shared.push(uri);
        return Promise.resolve();
      },
    },
    mediaLibrary: {
      requestPermissionsAsync: () => Promise.resolve({ granted: options.photosGranted ?? true }),
      createAssetAsync: (uri) => {
        saved.push(uri);
        return Promise.resolve(null);
      },
    },
  };
  const render = (format: ShareFormat) => {
    drawn.push(format);
    return options.render === undefined ? Promise.resolve(PICTURE[format]) : options.render(format);
  };
  const onClose = jest.fn();
  const ui = (
    <SafeAreaProvider initialMetrics={METRICS}>
      <GestureHandlerRootView>
        <ScreenJoltProvider>
          <ShareSheet
            title="Share the recap"
            altText="Đà Nẵng, the recap"
            render={render}
            deps={deps}
            onClose={onClose}
            {...(options.formats === undefined ? {} : { formats: options.formats })}
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

describe('share sheet', () => {
  it('previews the story picture first and shares exactly that picture', async () => {
    const s = setup();
    await renderUi(s.ui);
    await waitFor(() => expect(screen.getByTestId('share-image-story')).toBeTruthy());
    expect(s.drawn).toEqual(['story']);

    await fireEvent.press(screen.getByTestId('share-send'));
    await waitFor(() => expect(s.shared).toHaveLength(1));
    expect(s.written).toEqual([PICTURE.story]);
  });

  it('redraws in the post shape when switched, saves that one to Photos and says so', async () => {
    const s = setup();
    await renderUi(s.ui);
    await waitFor(() => expect(screen.getByTestId('share-image-story')).toBeTruthy());
    await fireEvent.press(screen.getByText(/^post$/iu));
    await waitFor(() => expect(screen.getByTestId('share-image-post')).toBeTruthy());
    expect(s.drawn).toEqual(['story', 'post']);

    await fireEvent.press(screen.getByTestId('share-save'));
    await waitFor(() => expect(s.saved).toHaveLength(1));
    expect(s.written).toEqual([PICTURE.post]);
    expect(s.shared).toHaveLength(0);
    await waitFor(() => expect(toastQueue.getCurrent()?.id).toBe('share-image-saved'));
  });

  it('opens on the first shape it is given', async () => {
    const s = setup({ formats: ['post', 'story'] });
    await renderUi(s.ui);
    await waitFor(() => expect(screen.getByTestId('share-image-post')).toBeTruthy());
    expect(s.drawn).toEqual(['post']);
  });

  it('holds the actions back while the picture is being drawn', async () => {
    let finish: (bytes: Uint8Array) => void = () => undefined;
    const s = setup({ render: () => new Promise<Uint8Array>((resolve) => (finish = resolve)) });
    await renderUi(s.ui);
    expect(screen.getByTestId('share-drawing')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('share-send'));
    await fireEvent.press(screen.getByTestId('share-save'));
    expect(s.written).toHaveLength(0);

    await act(() => {
      finish(PICTURE.story);
      return Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('share-image-story')).toBeTruthy());
    expect(screen.queryByTestId('share-drawing')).toBeNull();
  });

  it('offers another go when the picture fails to draw, and draws it then', async () => {
    let calls = 0;
    const s = setup({
      render: (format) =>
        ++calls === 1 ? Promise.reject(new Error('no surface')) : Promise.resolve(PICTURE[format]),
    });
    await renderUi(s.ui);
    await waitFor(() => expect(screen.getByTestId('share-retry')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('share-send'));
    expect(s.written).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('share-retry'));
    await waitFor(() => expect(screen.getByTestId('share-image-story')).toBeTruthy());
    expect(s.drawn).toEqual(['story', 'story']);
  });

  it('says so when Photos refuses the picture', async () => {
    const s = setup({ photosGranted: false });
    await renderUi(s.ui);
    await waitFor(() => expect(screen.getByTestId('share-image-story')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('share-save'));
    await waitFor(() => expect(toastQueue.getCurrent()?.id).toBe('share-image-failed'));
    expect(toastQueue.getCurrent()?.title).toMatch(/photos access/iu);
    expect(s.saved).toHaveLength(0);
  });

  it('says so when the phone cannot share', async () => {
    const s = setup({ sharingAvailable: false });
    await renderUi(s.ui);
    await waitFor(() => expect(screen.getByTestId('share-image-story')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('share-send'));
    await waitFor(() => expect(toastQueue.getCurrent()?.id).toBe('share-image-failed'));
    expect(toastQueue.getCurrent()?.title).toMatch(/share sheet/iu);
  });
});
