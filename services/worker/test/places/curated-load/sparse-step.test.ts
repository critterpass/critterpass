import { describe, expect, it } from 'vitest';

import {
  needsIngestCheck,
  sparseStep,
  type IngestState,
  type PlacesState,
} from '../../../src/places/curated-load/sparse';

const box = { minLng: 105.88, minLat: 20.19, maxLng: 105.99, maxLat: 20.31 };
const boxRun = 'on-demand-ingest:vn-ninh-binh:105.880,20.190,105.990,20.310';
const places = (over: Partial<PlacesState>): PlacesState => ({
  active: 500,
  lines: 30,
  box,
  boxRedrawn: false,
  ...over,
});
const none: IngestState = { running: false, last: null };
const ran = (activeCount: number): IngestState => ({
  running: false,
  last: { runId: 'run-1', activeCount },
});
const step = (p: Partial<PlacesState>, state: IngestState) =>
  sparseStep('vn-ninh-binh', places(p), state);

describe('the ingest a curated load queues first', () => {
  it('waits for an ingest that is queued or running', () => {
    expect(step({ boxRedrawn: true }, { running: true, last: null })).toEqual({ kind: 'wait' });
  });

  it('ingests a redrawn box under a key of that box, whatever the places', () => {
    expect(step({ boxRedrawn: true }, ran(500))).toEqual({
      kind: 'queue',
      keys: [boxRun],
      redoKey: null,
    });
    // Sparse with no run on record: the box key first, then the api's own key.
    expect(step({ boxRedrawn: true, active: 3 }, none)).toEqual({
      kind: 'queue',
      keys: [boxRun, 'on-demand-ingest:vn-ninh-binh'],
      redoKey: null,
    });
  });

  it('ingests a thin box with no run on record once per box, and loads one that ran', () => {
    expect(needsIngestCheck(places({ active: 128 }))).toBe(true);
    expect(step({ active: 128 }, none)).toEqual({ kind: 'queue', keys: [boxRun], redoKey: null });
    expect(step({ active: 128 }, ran(128))).toEqual({ kind: 'load', redoKey: null });
  });

  it('never reads the queue for a destination with places enough for its lines', () => {
    expect(needsIngestCheck(places({ active: 300 }))).toBe(false);
    expect(needsIngestCheck(places({ active: 300, boxRedrawn: true }))).toBe(true);
  });

  it('keeps the sparse rules: the api key first, then a lost run redone under its id', () => {
    expect(step({ active: 3 }, none)).toEqual({
      kind: 'queue',
      keys: ['on-demand-ingest:vn-ninh-binh'],
      redoKey: null,
    });
    expect(step({ active: 3 }, ran(900))).toEqual({
      kind: 'load',
      redoKey: 'on-demand-ingest:vn-ninh-binh:run-1',
    });
    expect(step({ active: 3 }, ran(3))).toEqual({ kind: 'load', redoKey: null });
  });
});
