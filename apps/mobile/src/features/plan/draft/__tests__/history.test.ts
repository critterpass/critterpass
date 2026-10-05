import { describe, expect, it } from '@jest/globals';

import { currentDraftId, draftOrigins } from '../data/history';

const job = (kind: string, result: object) => ({ kind, result_ref: JSON.stringify(result) });

describe('what each earlier draft was', () => {
  const versions = ['v4', 'v3', 'v2', 'v1'];
  const origins = draftOrigins(versions, [
    job('redraft', { candidate_version_id: 'v2', day_no: 2 }),
    job('draft', { version_id: 'v1' }),
    job('draft', { version_id: 'v3' }),
    job('redraft', { candidate_version_id: null, day_no: 3 }),
  ]);

  it('names the first draft, a later draft and a redrafted day', () => {
    expect(origins.get('v1')).toEqual({ kind: 'first' });
    expect(origins.get('v2')).toEqual({ kind: 'redraft', dayNo: 2 });
    expect(origins.get('v3')).toEqual({ kind: 'drafted' });
  });

  it('calls a draft no job accounts for changed', () => {
    expect(origins.get('v4')).toEqual({ kind: 'changed' });
  });

  it('marks the trip’s draft as current, else the newest', () => {
    expect(currentDraftId(versions, 'v2')).toBe('v2');
    expect(currentDraftId(versions, 'gone')).toBe('v4');
    expect(currentDraftId([], null)).toBeNull();
  });
});
