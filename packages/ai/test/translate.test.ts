/**
 * Translating the guide's lines: the request the model is sent, and what a returned line must
 * keep before it is stored (replayed against a live DeepSeek recording, then against slips a
 * model can make).
 */
import { describe, expect, it } from 'vitest';

import {
  buildTranslateRequest,
  createGateway,
  REPO_PACKS,
  translateGuideLines,
  validateTranslateReply,
  type TranslateLine,
} from '../src';
import { fixtureTransport } from './fixture-transport';

const LINES: readonly TranslateLine[] = [
  { id: 't1', text: 'Beach day, slow start', max: 80, title: true },
  { id: 't2', text: 'Dragon Bridge breathes fire at 21:00, so be there by 20:45.', max: 240 },
  { id: 't3', text: 'Tickets are 900,000 VND each.', max: 240 },
];

describe('the translation request', () => {
  it("carries the guide's persona, the reader language and the lines as data", () => {
    const request = buildTranslateRequest({ pack: REPO_PACKS.chava, locale: 'vi', lines: LINES });
    const system = JSON.stringify(request.system);
    expect(system).toContain('Chà Vá');
    expect(system).toContain('into Vietnamese (vi)');
    const turn = JSON.stringify(request.messages);
    expect(turn).toContain('[Reply language: Vietnamese (vi).]');
    expect(turn).toContain('Dragon Bridge breathes fire at 21:00');
    // A heading is marked as one, with the length it may run to.
    expect(turn).toContain('\\"max\\":80,\\"title\\":true');
  });
});

describe('what a translated line must keep', () => {
  const reply = (items: { id: string; text: string }[]) => validateTranslateReply({ items }, LINES);

  it('accepts lines with the same numbers, within length', () => {
    const verdict = reply([
      { id: 't1', text: 'Ngày biển, khởi động chậm' },
      { id: 't2', text: 'Dragon Bridge phun lửa lúc 21:00, nên có mặt trước 20:45.' },
      { id: 't3', text: 'Vé 900,000 VND mỗi người.' },
    ]);
    expect(verdict.rejected).toEqual([]);
    expect(verdict.accepted.get('t3')).toBe('Vé 900,000 VND mỗi người.');
  });

  it('rejects a changed, reformatted, dropped or added number, and keeps the other lines', () => {
    const verdict = reply([
      { id: 't1', text: 'Ngày biển, 2 chặng' },
      { id: 't2', text: 'Dragon Bridge phun lửa lúc 21h, nên có mặt trước 20:45.' },
      { id: 't3', text: 'Vé 900.000 VND mỗi người.' },
    ]);
    expect(verdict.accepted.size).toBe(0);
    expect(verdict.rejected).toEqual([
      { id: 't1', reason: 'numbers_changed' },
      { id: 't2', reason: 'numbers_changed' },
      { id: 't3', reason: 'numbers_changed' },
    ]);
  });

  it('rejects an empty line, one past its length, an added aside and a line it never sent', () => {
    const verdict = reply([
      { id: 't1', text: `${'Một ngày ở biển thật là chậm rãi '.repeat(3)}` },
      { id: 't2', text: '   ' },
      { id: 't3', text: 'Vé (tickets) 900,000 VND mỗi người.' },
      { id: 't9', text: 'Xin chào' },
    ]);
    expect(verdict.accepted.size).toBe(0);
    expect(verdict.rejected).toEqual([
      { id: 't1', reason: 'too_long' },
      { id: 't2', reason: 'empty' },
      { id: 't3', reason: 'added_aside' },
      { id: 't9', reason: 'unknown_id' },
    ]);
  });

  it('reports a line the model skipped, and drops one it answered twice', () => {
    const verdict = reply([
      { id: 't1', text: 'Ngày biển' },
      { id: 't1', text: 'Ngày ở biển' },
    ]);
    expect(verdict.accepted.size).toBe(0);
    expect(verdict.rejected.map((r) => `${r.id}:${r.reason}`)).toEqual([
      't1:duplicate',
      't2:missing',
      't3:missing',
    ]);
  });
});

describe('translateGuideLines', () => {
  it('keeps every line of a recorded Vietnamese answer, names and numbers as written', async () => {
    const transport = fixtureTransport(['guide-text-translate-vi-danang']);
    const gateway = createGateway({
      apiKey: 'fixture-key',
      fetch: transport.fetch,
      maxAttempts: 1,
    });
    const lines: TranslateLine[] = [
      { id: 't1', text: 'Beach day, slow start', max: 80, title: true },
      { id: 't2', text: 'Up Ba Na Hills, early', max: 80, title: true },
      { id: 't3', text: 'Ease in with a swim at My Khe before the sun gets sharp.', max: 240 },
      { id: 't4', text: 'Mì Quảng at Ba Mua: order the one with shrimp and pork.', max: 240 },
      {
        id: 't5',
        text: 'Dragon Bridge breathes fire at 21:00 on weekends, so be on the east bank by 20:45.',
        max: 240,
      },
      {
        id: 't6',
        text: 'Cable car up Ba Na Hills. Tickets are 900,000 VND each, so bring your booking code.',
        max: 240,
      },
      { id: 't7', text: 'Leave by 7:10 for the Ba Na Hills cable car.', max: 140 },
      { id: 't8', text: 'Bridge watchers', max: 24, title: true },
      { id: 't9', text: 'Get everyone to Dragon Bridge before the 21:00 fire show.', max: 110 },
    ];
    const result = await translateGuideLines(gateway, {
      pack: REPO_PACKS.chava,
      locale: 'vi',
      lines,
    });
    expect(result.calls).toBe(1);
    expect(result.rejected).toEqual([]);
    expect(result.accepted.get('t5')).toBe(
      'Dragon Bridge phun lửa lúc 21:00 cuối tuần, nên có mặt ở bờ đông trước 20:45.',
    );
    expect(result.accepted.get('t6')).toContain('900,000 VND');
    expect(result.accepted.get('t8')).toBe('Ngắm cầu');
    expect(transport.requests[0]?.['model']).toBe('deepseek-flash');
  });
});
