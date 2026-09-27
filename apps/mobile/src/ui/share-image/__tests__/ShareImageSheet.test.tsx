import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { renderWithI18n as render } from '../../../lib/i18n/testing';
import type { ShareActionsDeps } from '../share-actions';
import { ShareImageSheet } from '../ShareImageSheet';

function createDeps(overrides: Partial<ShareActionsDeps> = {}): ShareActionsDeps {
  return {
    writeTempFile: jest.fn(() => Promise.resolve('file:///tmp/share.png')),
    deleteFile: jest.fn(() => Promise.resolve()),
    sharing: {
      isAvailableAsync: jest.fn(() => Promise.resolve(true)),
      shareAsync: jest.fn(() => Promise.resolve()),
    },
    mediaLibrary: {
      requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
      createAssetAsync: jest.fn(() => Promise.resolve(undefined)),
    },
    canOpenURL: jest.fn(() => Promise.resolve(false)),
    ...overrides,
  };
}

const PNG_BYTES = new Uint8Array([1, 2, 3]);

describe('<ShareImageSheet>', () => {
  it('shows a rendering state, then the preview image once render resolves', async () => {
    const deps = createDeps();
    // A manually-resolved promise, so the test can observe the "rendering" state before letting
    // the render settle — an instantly-resolving mock would settle before any assertion could see it.
    let resolveRender: (bytes: Uint8Array) => void = () => {};
    const render_ = jest.fn(() => new Promise<Uint8Array>((resolve) => (resolveRender = resolve)));
    const { getByLabelText, findByLabelText } = await render(
      <ShareImageSheet
        visible
        onClose={() => {}}
        altText="A share card"
        render={render_}
        deps={deps}
      />,
    );

    expect(getByLabelText('Rendering share image')).toBeTruthy();
    await act(async () => {
      resolveRender(PNG_BYTES);
      await Promise.resolve();
    });
    expect(await findByLabelText('A share card')).toBeTruthy();
    expect(render_).toHaveBeenCalledWith('post');
  });

  it('shows a failure state with a working retry', async () => {
    const deps = createDeps();
    let attempt = 0;
    const render_ = jest.fn(() => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(PNG_BYTES);
    });
    const { findByText, getByLabelText } = await render(
      <ShareImageSheet
        visible
        onClose={() => {}}
        altText="A share card"
        render={render_}
        deps={deps}
      />,
    );

    expect(await findByText('Could not render this image.')).toBeTruthy();
    await fireEvent.press(await findByText('Retry'));
    await waitFor(() => expect(getByLabelText('A share card')).toBeTruthy());
    expect(render_).toHaveBeenCalledTimes(2);
  });

  it('toggles between post and story formats and re-renders for each', async () => {
    const deps = createDeps();
    const render_ = jest.fn(() => Promise.resolve(PNG_BYTES));
    const { findByText } = await render(
      <ShareImageSheet
        visible
        onClose={() => {}}
        altText="A share card"
        formats={['post', 'story']}
        render={render_}
        deps={deps}
      />,
    );

    await waitFor(() => expect(render_).toHaveBeenCalledWith('post'));
    await fireEvent.press(await findByText('Story'));
    await waitFor(() => expect(render_).toHaveBeenCalledWith('story'));
  });

  it('calls the system share sheet when Share is pressed once ready', async () => {
    const deps = createDeps();
    const render_ = jest.fn(() => Promise.resolve(PNG_BYTES));
    const { findByText } = await render(
      <ShareImageSheet
        visible
        onClose={() => {}}
        altText="A share card"
        render={render_}
        deps={deps}
      />,
    );

    await fireEvent.press(await findByText('Share'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock function, never called with `this`
    const shareAsync = deps.sharing.shareAsync;
    await waitFor(() => expect(shareAsync).toHaveBeenCalled());
  });

  it('saves to Photos when Save is pressed once ready', async () => {
    const deps = createDeps();
    const render_ = jest.fn(() => Promise.resolve(PNG_BYTES));
    const { findByText } = await render(
      <ShareImageSheet
        visible
        onClose={() => {}}
        altText="A share card"
        render={render_}
        deps={deps}
      />,
    );

    await fireEvent.press(await findByText('Save to Photos'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock function, never called with `this`
    const createAssetAsync = deps.mediaLibrary.createAssetAsync;
    await waitFor(() => expect(createAssetAsync).toHaveBeenCalled());
  });

  it('hides the Instagram Stories action when the app is not installed', async () => {
    // Even if "installed" per canOpenURL, no Meta app id is configured yet, so the feature stays hidden.
    const deps = createDeps({ canOpenURL: jest.fn(() => Promise.resolve(true)) });
    const render_ = jest.fn(() => Promise.resolve(PNG_BYTES));
    const { queryByTestId, findByLabelText } = await render(
      <ShareImageSheet
        visible
        onClose={() => {}}
        altText="A share card"
        render={render_}
        deps={deps}
      />,
    );
    await findByLabelText('A share card');
    expect(queryByTestId('share-instagram-stories')).toBeNull();
  });

  it('renders nothing when not visible', async () => {
    const deps = createDeps();
    const render_ = jest.fn(() => Promise.resolve(PNG_BYTES));
    const { toJSON } = await render(
      <ShareImageSheet
        visible={false}
        onClose={() => {}}
        altText="A share card"
        render={render_}
        deps={deps}
      />,
    );
    expect(toJSON()).toBeNull();
  });
});
