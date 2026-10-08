/**
 * The album's decisions that are easy to get wrong: the segment it opens on, the upload banner's
 * counts for one trip, "download all" from the synced export row, what "Done" saves on the
 * postcard, the list the grid recycles, and the address form's per-field problems.
 */
import { describe, expect, it } from '@jest/globals';

import { albumExportState, type AlbumExportRow } from '../data/album-export';
import { gridItems, openingSegment, rowPhotos, type AlbumPhoto } from '../data/album-model';
import { addressFields, addressProblems, EMPTY_ADDRESS } from '../mailing/address-form';
import { closeStep, type PostcardDraft, type SavedPostcard } from '../postcard/postcard-draft';
import type { UploadItem } from '../upload/upload-queue';
import { NO_UPLOADS, onlyDoneLeft, uploadCounts } from '../upload/upload-summary';

const TRIP = '00000000-0000-4000-8000-0000000000aa';
const OTHER = '00000000-0000-4000-8000-0000000000bb';
const NOW = Date.parse('2026-10-08T10:00:00Z');

const photo = (n: number, isPick = false): AlbumPhoto => ({
  id: `p${String(n).padStart(3, '0')}`,
  uploaderId: 'u1',
  thumbKey: null,
  displayKey: null,
  mediaKey: `m${n}`,
  localDate: '2026-10-04',
  takenAt: null,
  createdAt: `2026-10-04T10:00:${String(n).padStart(2, '0')}Z`,
  isPick,
  uploadState: 'processed',
  width: null,
  height: null,
});

describe('the segment the album opens on', () => {
  it('waits for the photos, then opens on the picks when there are any', () => {
    expect(openingSegment(false, 0)).toBeNull();
    expect(openingSegment(false, 3)).toBeNull();
    expect(openingSegment(true, 3)).toBe('best');
    expect(openingSegment(true, 0)).toBe('all');
  });
});

describe('the grid list', () => {
  it('gives each section a title and rows that hold every photo once, with running positions', () => {
    const a = Array.from({ length: 7 }, (_, n) => photo(n));
    const b = [photo(20), photo(21)];
    const items = gridItems([
      { key: 'd1', title: 'Day 1', photos: a },
      { key: 'd2', title: 'Day 2', photos: b },
    ]);
    expect(items.map((item) => item.kind)).toEqual([
      'header',
      'feature',
      'wide',
      'even',
      'header',
      'even',
    ]);
    const rows = items.flatMap((item) => (item.kind === 'header' ? [] : [item]));
    expect(rows.map((row) => row.start)).toEqual([0, 3, 5, 0]);
    expect(rows.flatMap((row) => rowPhotos(row.row).map((p) => p.id))).toEqual(
      [...a, ...b].map((p) => p.id),
    );
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });
});

describe('upload counts for a trip', () => {
  const item = (
    id: string,
    tripId: string,
    state: UploadItem['state'],
    progress = 0,
  ): UploadItem => ({
    id,
    tripId,
    uri: `file:///${id}.jpg`,
    state,
    progress,
  });

  it("leaves another trip's uploads out", () => {
    const items = [item('a', OTHER, 'uploading'), item('b', OTHER, 'failed')];
    expect(uploadCounts(items, TRIP)).toBe(NO_UPLOADS);
  });

  it('says which photo is going up and how far the batch is', () => {
    const items = [
      item('a', TRIP, 'done', 1),
      item('b', TRIP, 'duplicate', 1),
      item('c', TRIP, 'uploading', 0.5),
      item('d', TRIP, 'uploading'),
      item('x', OTHER, 'uploading'),
    ];
    const counts = uploadCounts(items, TRIP);
    expect(counts).toMatchObject({ uploading: 2, done: 1, skipped: 1, total: 4, position: 3 });
    expect(counts.fraction).toBeCloseTo(2.5 / 4);
  });

  it('lets the queue forget a batch only when every photo of it is done', () => {
    expect(onlyDoneLeft(uploadCounts([item('a', TRIP, 'done')], TRIP))).toBe(true);
    expect(
      onlyDoneLeft(uploadCounts([item('a', TRIP, 'done'), item('b', TRIP, 'duplicate')], TRIP)),
    ).toBe(false);
    expect(
      onlyDoneLeft(uploadCounts([item('a', TRIP, 'done'), item('b', TRIP, 'failed')], TRIP)),
    ).toBe(false);
    expect(onlyDoneLeft(NO_UPLOADS)).toBe(false);
  });
});

describe('download all', () => {
  const row = (over: Partial<AlbumExportRow>): AlbumExportRow => ({
    id: 'e1',
    status: 'queued',
    media_key: null,
    expires_at: null,
    ...over,
  });
  const idle = { row: null, asking: false, requestedId: null, refused: false };

  it('is idle with no export, and failed after a refusal', () => {
    expect(albumExportState(idle, NOW)).toBe('idle');
    expect(albumExportState({ ...idle, refused: true }, NOW)).toBe('failed');
  });

  it('is zipping from the request until the row has its file', () => {
    expect(albumExportState({ ...idle, asking: true }, NOW)).toBe('asking');
    expect(albumExportState({ ...idle, requestedId: 'e2' }, NOW)).toBe('zipping');
    const old = row({ id: 'e1', status: 'ready', media_key: 'k' });
    expect(albumExportState({ ...idle, row: old, requestedId: 'e2' }, NOW)).toBe('zipping');
    expect(albumExportState({ ...idle, row: row({ id: 'e2' }), requestedId: 'e2' }, NOW)).toBe(
      'zipping',
    );
    expect(albumExportState({ ...idle, row: row({ status: 'ready' }) }, NOW)).toBe('idle');
  });

  it('offers the zip while it lasts, then goes back to asking', () => {
    const ready = row({ status: 'ready', media_key: 'k', expires_at: '2026-10-15T10:00:00Z' });
    expect(albumExportState({ ...idle, row: ready }, NOW)).toBe('ready');
    expect(albumExportState({ ...idle, row: ready }, Date.parse('2026-10-15T10:00:01Z'))).toBe(
      'idle',
    );
    expect(
      albumExportState({ ...idle, row: row({ status: 'expired', media_key: 'k' }) }, NOW),
    ).toBe('idle');
  });

  it('says when the zip could not be made', () => {
    expect(albumExportState({ ...idle, row: row({ status: 'failed' }) }, NOW)).toBe('failed');
  });
});

describe('closing the postcard composer', () => {
  const start: PostcardDraft = { format: 'classic', photoId: 'p1', note: 'From the guide' };
  const saved: SavedPostcard = { ...start, id: 'card', sentAt: null };

  it('creates nothing for a postcard nobody touched', () => {
    expect(closeStep(TRIP, 'new', null, start, start)).toEqual({ kind: 'none' });
  });

  it('creates the postcard once the traveller changed it', () => {
    expect(closeStep(TRIP, 'new', null, start, { ...start, note: 'Mine' })).toEqual({
      kind: 'create',
      payload: {
        postcard_id: 'new',
        trip_id: TRIP,
        format: 'classic',
        photo_id: 'p1',
        note: 'Mine',
      },
    });
  });

  it('saves only what changed on a saved postcard, and nothing when it is the same', () => {
    expect(closeStep(TRIP, 'new', saved, start, start)).toEqual({ kind: 'none' });
    expect(
      closeStep(TRIP, 'new', saved, start, { ...start, format: 'story', photoId: null }),
    ).toEqual({
      kind: 'edit',
      payload: { postcard_id: 'card', patch: { format: 'story', photo_id: null } },
    });
  });
});

describe('the address form', () => {
  const full = {
    ...EMPTY_ADDRESS,
    name: 'Mai Tran',
    line1: '12 Tran Phu',
    city: 'Da Nang',
    country: 'VN',
  };

  it('names each field that is still needed, and leaves the optional ones alone', () => {
    expect(addressProblems(EMPTY_ADDRESS)).toEqual({
      name: 'needed',
      line1: 'needed',
      city: 'needed',
      country: 'needed',
    });
    expect(addressProblems(full)).toEqual({});
    expect(addressFields(full)).toEqual({
      name: 'Mai Tran',
      line1: '12 Tran Phu',
      city: 'Da Nang',
      country: 'VN',
    });
  });

  it('flags a line too long for the label, where the command would refuse it', () => {
    const long = { ...full, postal_code: '1'.repeat(21) };
    expect(addressProblems(long)).toEqual({ postal_code: 'long' });
    expect(addressFields(long)).toBeNull();
  });
});
