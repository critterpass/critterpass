// Skia's native renderer and the device file system do not exist under Jest; see the doubles.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/media/test-support/media-skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('expo-file-system', () => require('@/ui/media/test-support/memory-file-system'));

import type { MediaAsset } from '@cp/domain';
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { renderUi } from '@/ui/test-support/render';

import { heroCaptionInset, PlacePhoto } from '../components/place-hero-photo';
import { SwipeCardUnder, type SwipeCardFace } from '../components/swipe-card';
import { guideFor } from '../format';
import { isGenericPhoto, photosByPlace } from '../place-photo';

const PLACE = '01a0f303-4a14-7992-8b18-b6debcf1c27f';
const OTHER = '01a0f303-3863-7748-9877-e78691fe2576';

function asset(id: string, subjects: string[], source: MediaAsset['source']): MediaAsset {
  const base = `https://media.staging.critterpass.app/c/media/${id}`;
  return {
    id,
    kind: 'photo',
    subjects,
    rank: 0,
    width: 1920,
    height: 1280,
    duration_ms: null,
    colour: null,
    blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
    images: [480, 828, 1242].map((w) => ({ url: `${base}/${w}.webp`, w, h: (w * 2) / 3 })),
    videos: [],
    credit:
      source === 'wikimedia'
        ? 'Ray in Manila · CC BY 2.0 · Wikimedia Commons'
        : 'Photo: Someone · Pexels',
    attribution_required: source === 'wikimedia',
    author: 'Someone',
    source,
    source_url: 'https://commons.wikimedia.org/wiki/File:My_Khe_Beach.jpg',
    licence: source === 'wikimedia' ? 'cc-by-2.0' : 'pexels',
    licence_url: 'https://creativecommons.org/licenses/by/2.0/',
  };
}

const own = asset('01a0f4a2-0000-7000-8000-000000000001', [`poi:${PLACE}`], 'wikimedia');
const generic = asset('01a0f4a2-0000-7000-8000-000000000002', [`poi:${PLACE}`], 'pexels');
const destination = asset(
  '01a0f4a2-0000-7000-8000-000000000003',
  ['destination:da-nang'],
  'pexels',
);

describe('a place card photo', () => {
  it("takes the place's own asset, first in rank order", () => {
    const photos = photosByPlace([destination, own, generic], [PLACE, OTHER]);
    expect(photos.get(PLACE)?.id).toBe(own.id);
  });

  it("never stands in the destination's photo for a place without one", () => {
    expect(photosByPlace([destination], [PLACE, OTHER]).size).toBe(0);
  });

  it('treats a stock photo filed under a place as generic', () => {
    expect(isGenericPhoto(generic)).toBe(true);
    expect(isGenericPhoto(own)).toBe(false);
    expect(isGenericPhoto(null)).toBe(false);
  });
});

const face = (photo: MediaAsset | null): SwipeCardFace => ({
  poiId: PLACE,
  name: 'My Khe Beach',
  category: 'beach',
  meta: 'Beach · 10 min from the stay',
  note: null,
  social: null,
  photo,
});

async function renderCard(photo: MediaAsset | null) {
  await renderUi(<SwipeCardUnder face={face(photo)} guide={guideFor('chava')} />);
  const layer = screen.queryByTestId('explore-swipe-photo', { includeHiddenElements: true });
  if (layer !== null) {
    await fireEvent(layer, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 340, height: 360 } },
    });
  }
  return layer;
}

describe('the swipe card', () => {
  it("draws the category's doodle when the place has no photo", async () => {
    expect(await renderCard(null)).toBeNull();
    expect(
      screen.queryByTestId('explore-photo-generic', { includeHiddenElements: true }),
    ).toBeNull();
  });

  it("shows the place's own photo with the credit its licence asks for", async () => {
    expect(await renderCard(own)).not.toBeNull();
    expect(
      screen.getByTestId('explore-swipe-photo-credit', { includeHiddenElements: true }),
    ).toHaveTextContent(own.credit);
    expect(
      screen.queryByTestId('explore-photo-generic', { includeHiddenElements: true }),
    ).toBeNull();
  });

  it('says a generic photo is not this place', async () => {
    expect(await renderCard(generic)).not.toBeNull();
    expect(
      screen.getByTestId('explore-photo-generic', { includeHiddenElements: true }),
    ).toHaveTextContent('Not this place');
  });
});

describe("a place page's hero caption", () => {
  const ACCENT = guideFor('chava').colour;
  type Positioned = { bottom?: number; top?: number; flexDirection?: string };
  const styleOf = (node: { props: { style?: unknown } }): Positioned =>
    StyleSheet.flatten(node.props.style as object) ?? {};
  /** The label carries its own position; the credit's is on its line (the nearest row above it). */
  const bottomOf = (testID: string): unknown => {
    let node = screen.getByTestId(testID, { includeHiddenElements: true });
    if (styleOf(node).bottom !== undefined) return styleOf(node).bottom;
    while (node.parent !== null && styleOf(node).flexDirection !== 'row') node = node.parent;
    expect(styleOf(node).top).toBeUndefined();
    return styleOf(node).bottom;
  };

  it('sits above the sheet, and above the chips a page draws on the photo', () => {
    expect(heroCaptionInset()).toBe(38);
    expect(heroCaptionInset(36)).toBe(74);
  });

  it('puts the credit at the bottom inset, never at the top of the photo', async () => {
    await renderUi(<PlacePhoto photo={own} category="beach" accent={ACCENT} captionInset={74} />);
    expect(bottomOf('explore-place-hero-credit')).toBe(74);
  });

  it('gives the generic label the line above a credit, so the two never overlap', async () => {
    const both = { ...generic, attribution_required: true };
    await renderUi(<PlacePhoto photo={both} category="beach" accent={ACCENT} captionInset={74} />);
    expect(bottomOf('explore-place-hero-credit')).toBe(74);
    expect(bottomOf('explore-photo-generic')).toBe(96);
  });

  it('keeps a generic label without a credit on the caption line itself', async () => {
    await renderUi(
      <PlacePhoto photo={generic} category="beach" accent={ACCENT} captionInset={38} />,
    );
    expect(bottomOf('explore-photo-generic')).toBe(38);
  });
});
