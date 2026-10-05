import { describe, expect, it } from '@jest/globals';

import { currentDraftId, draftOrigins } from '../data/history';

const job = (id: string, kind: string, result: object) => ({
  id,
  kind,
  result_ref: JSON.stringify(result),
});
const v = (id: string, parentId: string | null = null) => ({ id, parentId });

describe('what each earlier draft was', () => {
  // Newest first: a hand change, a redraft kept in part (a copy of v4), the guide's v4, a redraft
  // put back, a second draft, a redraft kept whole, the first draft.
  const versions = [v('v7'), v('v5', 'v4'), v('v4'), v('v6'), v('v3'), v('v2'), v('v1')];
  const origins = draftOrigins(
    versions,
    [
      job('j4', 'redraft', { candidate_version_id: 'v4', day_no: 1 }),
      job('j6', 'redraft', { candidate_version_id: 'v6', day_no: 3 }),
      job('j2', 'redraft', { candidate_version_id: 'v2', day_no: 2 }),
      job('j1', 'draft', { version_id: 'v1' }),
      job('j3', 'draft', { version_id: 'v3' }),
      job('j9', 'redraft', { candidate_version_id: null, day_no: 3 }),
    ],
    new Set(['j6']),
  );

  it('names the first draft, a later draft and a redrafted day', () => {
    expect(origins.get('v1')).toEqual({ kind: 'first' });
    expect(origins.get('v2')).toEqual({ kind: 'redraft', dayNo: 2 });
    expect(origins.get('v3')).toEqual({ kind: 'drafted' });
  });

  it('says when a redraft was put back', () => {
    expect(origins.get('v6')).toEqual({ kind: 'put_back', dayNo: 3 });
  });

  it('lists a redraft kept in part once, as the copy she kept', () => {
    expect(origins.get('v5')).toEqual({ kind: 'redraft', dayNo: 1 });
    expect(origins.has('v4')).toBe(false);
  });

  it('calls a draft no job accounts for changed', () => {
    expect(origins.get('v7')).toEqual({ kind: 'changed' });
  });

  it('marks the trip’s draft as current, else the newest', () => {
    expect(currentDraftId(versions, 'v2')).toBe('v2');
    expect(currentDraftId(versions, 'gone')).toBe('v7');
    expect(currentDraftId([], null)).toBeNull();
  });
});

describe('a plan she started herself', () => {
  // Newest first: her edit of the guide's draft, the guide's draft, the plan she built by hand on
  // the trip's empty days.
  const versions = [
    { id: 'edit', parentId: 'guide', origin: 'hand' },
    { id: 'guide', parentId: 'mine', origin: 'guide' },
    { id: 'mine', parentId: null, origin: 'hand' },
  ];
  const origins = draftOrigins(versions, [job('j1', 'draft', { version_id: 'guide' })]);

  it('is hers, and the guide’s first draft is still the first', () => {
    expect(origins.get('mine')).toEqual({ kind: 'own' });
    expect(origins.get('guide')).toEqual({ kind: 'first' });
    expect(origins.get('edit')).toEqual({ kind: 'changed' });
  });

  it('never lists the trip’s empty days as a draft', () => {
    const empty = draftOrigins([{ id: 'days', parentId: null, origin: 'dates' }], []);
    expect(empty.size).toBe(0);
  });
});
