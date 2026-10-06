import { describe, expect, it } from '@jest/globals';
import {
  daySections,
  masonryRows,
  personSections,
  segmentPhotos,
  type AlbumPhoto,
} from '../data/album-model';

function photo(id: string, over: Partial<AlbumPhoto> = {}): AlbumPhoto {
  return {
    id,
    uploaderId: 'u1',
    thumbKey: `t/${id}`,
    displayKey: null,
    mediaKey: `m/${id}`,
    localDate: '2026-10-04',
    takenAt: `2026-10-04T0${id.length}:00:00+07:00`,
    createdAt: '2026-10-04T12:00:00Z',
    isPick: false,
    uploadState: 'processed',
    width: 4032,
    height: 3024,
    ...over,
  };
}

describe('album model', () => {
  it('best shows only picks', () => {
    const photos = [photo('a', { isPick: true }), photo('b')];
    expect(segmentPhotos(photos, 'best').map((p) => p.id)).toEqual(['a']);
    expect(segmentPhotos(photos, 'all')).toHaveLength(2);
  });

  it('sections photos by day with the plan day name, undated last', () => {
    const sections = daySections(
      [
        photo('x', { localDate: '2026-10-05' }),
        photo('y', { localDate: null }),
        photo('z', { localDate: '2026-10-04' }),
      ],
      [{ date: '2026-10-04', dayNo: 4, theme: 'Batur sunrise' }],
    );
    expect(sections.map((s) => [s.key, s.dayNo, s.theme])).toEqual([
      ['2026-10-04', 4, 'Batur sunrise'],
      ['2026-10-05', null, null],
      ['undated', null, null],
    ]);
  });

  it('lays out feature, wide and even rows, with a pick on the big tile', () => {
    const photos = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => photo(id, { isPick: id === 'b' }));
    const rows = masonryRows(photos);
    expect(rows.map((row) => row.kind)).toEqual(['feature', 'wide', 'even']);
    const first = rows[0];
    expect(first?.kind === 'feature' && first.large.id).toBe('b');
    expect(rows[2]?.kind === 'even' && rows[2].photos.map((p) => p.id)).toEqual(['f']);
    expect(rows.flatMap((row) => idsOf(row))).toHaveLength(6);
  });

  it('by person lists only travellers who are in a photo', () => {
    const sections = personSections(
      [photo('a'), photo('b')],
      [
        { id: 'u1', name: 'Mai', colour: null },
        { id: 'u2', name: 'Jon', colour: null },
      ],
      [
        { photoId: 'b', userId: 'u2' },
        { photoId: 'gone', userId: 'u2' },
      ],
    );
    expect(sections.map((s) => [s.person.name, s.photos.map((p) => p.id)])).toEqual([
      ['Jon', ['b']],
    ]);
  });
});

function idsOf(row: ReturnType<typeof masonryRows>[number]): string[] {
  if (row.kind === 'feature') return [row.large.id, ...row.small.map((p) => p.id)];
  if (row.kind === 'wide') return [row.wide.id, row.small.id];
  return row.photos.map((p) => p.id);
}
