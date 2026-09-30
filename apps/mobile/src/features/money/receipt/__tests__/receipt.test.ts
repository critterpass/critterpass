import { toCrewShares } from '@cp/cost-engine';
import type { ReceiptSuggestions } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import {
  initialAssignments,
  receiptShares,
  receiptView,
  shareGroups,
  toCommitPayload,
  type ParsedReceipt,
} from '../review-model';
import { reviewRows } from '../review-rows';
import { INITIAL_SCAN, scanReducer, uploadStatus } from '../scan-machine';
import { prefillLines, typedPayload, typedShares } from '../type-lines-model';

const crew = ['w', 'm', 'a', 'j', 'r', 'd'];
const FX = {
  snapshotId: 'fx',
  snapshots: [{ base: 'USD', quote: 'IDR', rate: '15835', asOf: '2026-10-14', source: 'ecb' }],
};

// The Ibu Oka bill as the server parses it (rupiah minor units are sen).
const ibuOka: ParsedReceipt = {
  merchant: 'Ibu Oka',
  datetime: '2026-10-14T13:12:00+08:00',
  currency: 'IDR',
  lines: [
    { line_id: 'l3', label: 'Babi guling', qty: 5, amount_minor: 85_000_000, kind: 'item' },
    { line_id: 'l4', label: 'Es kelapa', qty: 6, amount_minor: 13_000_000, kind: 'item' },
    { line_id: 'l5', label: 'Service 10%', qty: null, amount_minor: 10_000_000, kind: 'service' },
  ],
  total_minor: 108_000_000,
  total_line_id: 'l6',
  lines_total_minor: 108_000_000,
  matches_total: true,
  status: 'parsed',
};
const suggestions: ReceiptSuggestions = {
  payer_uid: 'm',
  payer_reason: 'scanned',
  adjustments: 'by_share',
  lines: [
    {
      line_id: 'l3',
      exclude: ['j'],
      reasons: [{ user_id: 'j', kind: 'dietary', flag: 'halal', food: 'pork' }],
    },
  ],
};

describe('itemised receipt review', () => {
  it('reproduces the design: Jordan pays $1.50, everyone else $13.34', () => {
    const assignments = initialAssignments(ibuOka, suggestions, crew);
    expect(assignments).toEqual({ l3: ['w', 'm', 'a', 'r', 'd'], l4: null });
    const result = receiptShares(ibuOka, assignments, crew, 'm', false);
    expect(result.totalMinor).toBe(108_000_000n);
    const total = { amountMinor: result.totalMinor, currency: 'IDR' };
    const crewShares = toCrewShares(total, result.shares, 'USD', FX, 'm');
    const groups = shareGroups(crewShares.shares);
    expect(groups).toEqual([
      { userIds: ['j'], amountMinor: 150n },
      { userIds: ['w', 'm', 'a', 'r', 'd'], amountMinor: 1334n },
    ]);
  });

  it('keeps the printed total by sharing the gap by share', () => {
    const short = {
      ...ibuOka,
      lines_total_minor: 98_000_000,
      matches_total: false,
      lines: ibuOka.lines.slice(0, 2),
    };
    expect(receiptShares(short, {}, crew, 'm', false).totalMinor).toBe(98_000_000n);
    expect(receiptShares(short, {}, crew, 'm', true).totalMinor).toBe(108_000_000n);
  });

  it('commits assignments only, never amounts', () => {
    const payload = toCommitPayload({
      receiptId: 'r',
      expenseId: 'e',
      payerId: 'm',
      parsed: ibuOka,
      assignments: initialAssignments(ibuOka, suggestions, crew),
      keepTotal: false,
    });
    expect(payload.lines).toEqual([
      { line_id: 'l3', assignment: ['w', 'm', 'a', 'r', 'd'] },
      { line_id: 'l4', assignment: [] },
    ]);
    expect(JSON.stringify(payload)).not.toContain('amount');
  });

  it('picks review, the three-way sheet or manual entry from the server answer', () => {
    const row = (status: string, parsed: ParsedReceipt | null) => ({
      status,
      parsed: parsed === null ? null : JSON.stringify(parsed),
    });
    expect(receiptView(row('queued', null)).kind).toBe('waiting');
    expect(receiptView(row('parsed', ibuOka)).kind).toBe('review');
    const totalOnly = { ...ibuOka, status: 'partial' as const, lines: [] };
    expect(receiptView(row('partial', totalOnly)).kind).toBe('total_only');
    expect(receiptView(row('failed', null))).toEqual({ kind: 'unreadable', merchant: null });
    expect(receiptView(row('partial', { ...totalOnly, total_minor: null }))).toEqual({
      kind: 'unreadable',
      merchant: 'Ibu Oka',
    });
  });
});

describe('typing the lines', () => {
  it('prefills what was read and adds a line to type into', () => {
    const lines = prefillLines({ ...ibuOka, lines: ibuOka.lines.slice(1) });
    expect(lines.map((line) => [line.label, line.digits])).toEqual([
      ['Es kelapa', '130000'],
      ['', ''],
    ]);
  });

  it('shares the rest of the printed total by share and adds it as exact amounts', () => {
    const lines = [
      { id: 'a', label: 'Babi guling', digits: '850000', assignees: ['w', 'm', 'a', 'r', 'd'] },
      { id: 'b', label: 'Es kelapa', digits: '130000', assignees: null },
    ];
    const result = typedShares({
      lines,
      currency: 'IDR',
      members: crew,
      payerId: 'm',
      totalMinor: 108_000_000n,
    });
    expect(result?.totalMinor).toBe(108_000_000n);
    const payload = typedPayload({
      lines,
      currency: 'IDR',
      members: crew,
      payerId: 'm',
      totalMinor: 108_000_000n,
      expenseId: 'e',
      tripId: 't',
      fxSnapshotId: 'fx',
      merchant: 'Ibu Oka',
    });
    expect(payload?.split.mode).toBe('fixed');
    const sum = payload?.split.shares.reduce((acc, share) => acc + (share.fixed_minor ?? 0), 0);
    expect(sum).toBe(108_000_000);
  });

  it('refuses lines that add up to more than the printed total', () => {
    const lines = [{ id: 'a', label: 'x', digits: '2000000', assignees: null }];
    expect(
      typedShares({
        lines,
        currency: 'IDR',
        members: crew,
        payerId: 'm',
        totalMinor: 108_000_000n,
      }),
    ).toBeNull();
  });
});

describe('scan state machine', () => {
  const read = {
    status: 'ok' as const,
    lines: [{ id: 'l0', text: 'TOTAL 1.080.000', bbox: [0, 0, 1, 0.1] as const, conf: 0.9 }],
    quality: null,
  };

  it('walks aim → reading → uploading → waiting', () => {
    let state = scanReducer(INITIAL_SCAN, { type: 'captured', uri: 'file://r.jpg' });
    expect(state.step).toBe('reading');
    state = scanReducer(state, { type: 'read', result: read, receiptId: 'r1' });
    expect(state.step).toBe('uploading');
    state = scanReducer(state, { type: 'posted' });
    expect(state).toMatchObject({ step: 'waiting', receiptId: 'r1' });
    expect(scanReducer(state, { type: 'type_lines' })).toEqual({ step: 'typing', receiptId: 'r1' });
  });

  it('saves the scan offline, and ignores events out of order', () => {
    const uploading = scanReducer(scanReducer(INITIAL_SCAN, { type: 'captured', uri: 'u' }), {
      type: 'read',
      result: read,
      receiptId: 'r2',
    });
    expect(scanReducer(uploading, { type: 'offline' })).toEqual({
      step: 'saved_offline',
      uri: 'u',
      receiptId: 'r2',
    });
    expect(scanReducer(INITIAL_SCAN, { type: 'posted' })).toBe(INITIAL_SCAN);
    expect(scanReducer(uploading, { type: 'retake' })).toEqual(INITIAL_SCAN);
  });

  it('asks the server to read what the device could not', () => {
    expect(uploadStatus(read)).toBe('ok');
    expect(uploadStatus({ ...read, lines: [] })).toBe('no_text');
    expect(uploadStatus({ status: 'unsupported_script', lines: [], quality: null })).toBe(
      'unsupported_script',
    );
  });
});

describe('lines to check when the receipt does not add up', () => {
  const copy = {
    everyone: 'EVERYONE',
    byShare: 'BY SHARE',
    not: (names: string) => `NOT ${names}`,
    pays: (names: string) => `${names} pays`,
    everyoneElse: 'Everyone else',
    amount: (minor: bigint) => `Rp${String(minor / 100n)}`,
  };
  const members = crew.map((userId, joinIndex) => ({
    userId,
    name: userId,
    joinIndex,
    active: true,
  }));
  const missing: ParsedReceipt = {
    ...ibuOka,
    lines_total_minor: 107_000_000,
    matches_total: false,
    status: 'partial',
    review_line_ids: ['l4'],
  };

  it('marks the doubtful lines with the amount read', () => {
    const rows = reviewRows(missing, {}, members, copy);
    expect(rows.map((row) => row.check)).toEqual([null, 'Rp130000', null]);
  });

  it('marks nothing once the lines add up, or on a parse that names no lines', () => {
    expect(
      reviewRows({ ...missing, matches_total: true }, {}, members, copy).map((row) => row.check),
    ).toEqual([null, null, null]);
    const { review_line_ids: _omitted, ...older } = missing;
    expect(reviewRows(older, {}, members, copy).every((row) => row.check === null)).toBe(true);
  });
});
