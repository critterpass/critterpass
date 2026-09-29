import { describe, expect, it } from '@jest/globals';

import { fromNativeModule, getOcr } from '../index';
import type {
  NativeBarcode,
  NativeCpOcrModule,
  NativeDocumentScan,
  NativeRecognition,
} from '../src/CpOcrModule';

const flat = { blur: 310, glare: 0.002, curvature: 0.4, clipped: 0 };

/** The native module is the boundary: a recording stand-in answering like the device would. */
function fakeNative(answers: {
  recognition?: NativeRecognition;
  barcodes?: readonly NativeBarcode[];
  scan?: NativeDocumentScan;
}) {
  const calls: unknown[][] = [];
  const native = {
    recognize: (uri: string, languages: readonly string[], scripts: readonly string[]) => {
      calls.push(['recognize', uri, languages, scripts]);
      return Promise.resolve(answers.recognition);
    },
    scanBarcode: (uri: string) => {
      calls.push(['scanBarcode', uri]);
      return Promise.resolve(answers.barcodes ?? []);
    },
    scanDocument: (pageLimit: number) => {
      calls.push(['scanDocument', pageLimit]);
      return Promise.resolve(answers.scan ?? { status: 'cancelled' });
    },
  } as unknown as NativeCpOcrModule;
  return { native, calls };
}

describe('cp-ocr', () => {
  it('is absent from a binary built without the module', () => {
    expect(getOcr()).toBeNull();
  });

  it('orders the recognised lines and passes the hints with their scripts', async () => {
    const { native, calls } = fakeNative({
      recognition: {
        status: 'ok',
        observations: [
          { text: '45.000', bbox: [0.75, 0.4, 0.15, 0.03], conf: 0.97 },
          { text: 'Bún chả', bbox: [0.1, 0.4, 0.3, 0.03], conf: 0.88 },
          { text: 'QUÁN ĂN', bbox: [0.3, 0.1, 0.4, 0.05], conf: 0.99 },
        ],
        signals: flat,
        width: 1200,
        height: 1600,
      },
    });
    const result = await fromNativeModule(native).recognize('file:///r.jpg', {
      languages: ['vi', 'en', 'vi'],
    });
    expect(calls).toEqual([['recognize', 'file:///r.jpg', ['vi', 'en'], ['latin', 'latin']]]);
    expect(result).toEqual({
      status: 'ok',
      lines: [
        { id: 'l0', text: 'QUÁN ĂN', bbox: [0.3, 0.1, 0.4, 0.05], conf: 0.99 },
        { id: 'l1', text: 'Bún chả', bbox: [0.1, 0.4, 0.3, 0.03], conf: 0.88 },
        { id: 'l2', text: '45.000', bbox: [0.75, 0.4, 0.15, 0.03], conf: 0.97 },
      ],
      signals: flat,
      quality: null,
      width: 1200,
      height: 1600,
    });
  });

  it('reports an unreadable script with no lines so the server transcribes the photo', async () => {
    const { native, calls } = fakeNative({
      recognition: {
        status: 'unsupported_script',
        observations: [],
        signals: { blur: 12, glare: 0, curvature: 0, clipped: 0 },
        width: 900,
        height: 1600,
      },
    });
    const result = await fromNativeModule(native).recognize('file:///th.jpg', {
      languages: ['th'],
    });
    expect(calls[0]).toEqual(['recognize', 'file:///th.jpg', ['th'], ['thai']]);
    expect(result.status).toBe('unsupported_script');
    expect(result.lines).toEqual([]);
    expect(result.quality).toBe('blurry');
  });

  it('calls a page with nothing legible no_text and keeps unmeasured signals quiet', async () => {
    const { native, calls } = fakeNative({
      recognition: {
        status: 'ok',
        observations: [{ text: '  ', bbox: [0.1, 0.1, 0.1, 0.1], conf: 0.2 }],
        signals: { blur: 250, glare: 0, curvature: Number.NaN, clipped: Number.NaN },
        width: 800,
        height: 800,
      },
    });
    const result = await fromNativeModule(native).recognize('file:///blank.jpg');
    expect(calls[0]).toEqual(['recognize', 'file:///blank.jpg', [], []]);
    expect(result.status).toBe('no_text');
    expect(result.lines).toEqual([]);
    expect(result.quality).toBeNull();
  });

  it('names the quality problem from the raw signals', async () => {
    const { native } = fakeNative({
      recognition: {
        status: 'ok',
        observations: [{ text: 'TOTAL 90.000', bbox: [0.1, 0.8, 0.5, 0.03], conf: 0.6 }],
        signals: { ...flat, curvature: 7.5 },
        width: 1200,
        height: 1600,
      },
    });
    await expect(fromNativeModule(native).recognize('file:///c.jpg')).resolves.toMatchObject({
      status: 'ok',
      quality: 'crumpled',
    });
  });

  it('keeps boarding-pass and ticket barcodes and drops other formats', async () => {
    const { native, calls } = fakeNative({
      barcodes: [
        { format: 'pdf417', value: 'M1DOE/JANE EABC123 SGNHANVJ 0123' },
        { format: 'ean13', value: '8934563138165' },
        { format: 'qr', value: '' },
        { format: 'aztec', value: 'TICKET-9' },
      ],
    });
    await expect(fromNativeModule(native).scanBarcode('file:///bp.jpg')).resolves.toEqual([
      { format: 'pdf417', value: 'M1DOE/JANE EABC123 SGNHANVJ 0123' },
      { format: 'aztec', value: 'TICKET-9' },
    ]);
    expect(calls).toEqual([['scanBarcode', 'file:///bp.jpg']]);
  });

  it('scans one page by default and hands back the captured pages', async () => {
    const { native, calls } = fakeNative({
      scan: { status: 'captured', uris: ['file:///p1.jpg', 'file:///p2.jpg'] },
    });
    const ocr = fromNativeModule(native);
    await expect(ocr.scanDocument()).resolves.toEqual({
      status: 'captured',
      uris: ['file:///p1.jpg'],
    });
    await expect(ocr.scanDocument({ pageLimit: 3.7 })).resolves.toEqual({
      status: 'captured',
      uris: ['file:///p1.jpg', 'file:///p2.jpg'],
    });
    await ocr.scanDocument({ pageLimit: 0 });
    expect(calls).toEqual([
      ['scanDocument', 1],
      ['scanDocument', 3],
      ['scanDocument', 1],
    ]);
  });

  it('reports a dismissed scanner as cancelled', async () => {
    const { native } = fakeNative({ scan: { status: 'cancelled' } });
    await expect(fromNativeModule(native).scanDocument()).resolves.toEqual({ status: 'cancelled' });
    const empty = fakeNative({ scan: { status: 'captured', uris: [] } });
    await expect(fromNativeModule(empty.native).scanDocument()).resolves.toEqual({
      status: 'cancelled',
    });
  });
});
