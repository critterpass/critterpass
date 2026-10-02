/**
 * The scan screen's state machine: aim → reading the photo on the device → uploading → waiting for
 * the server's parse → the review, the three-way sheet or the manual entry. Offline, the scan is
 * saved and read once the phone is back online; a camera the member refused, or a build without
 * the reader, sends them to the manual paths.
 */
/* eslint-disable lingui/no-unlocalized-strings -- state names, never copy. */
import type { ReaderResult } from '../data/services';

export type ScanState =
  | { readonly step: 'aim' }
  | { readonly step: 'denied' }
  | { readonly step: 'reading'; readonly uri: string }
  | {
      readonly step: 'uploading';
      readonly uri: string;
      readonly receiptId: string;
      readonly read: ReaderResult;
    }
  | {
      readonly step: 'waiting';
      readonly uri: string;
      readonly receiptId: string;
      readonly read: ReaderResult;
    }
  | { readonly step: 'saved_offline'; readonly uri: string; readonly receiptId: string }
  | { readonly step: 'upload_failed'; readonly uri: string; readonly code: string }
  /** The photo picker could not hand a photo back. */
  | { readonly step: 'pick_failed' }
  | { readonly step: 'typing'; readonly receiptId: string | null };

export type ScanEvent =
  | { readonly type: 'captured'; readonly uri: string }
  | { readonly type: 'cancelled' }
  | { readonly type: 'denied' }
  | { readonly type: 'pick_failed' }
  | { readonly type: 'read'; readonly result: ReaderResult; readonly receiptId: string }
  | { readonly type: 'posted' }
  | { readonly type: 'offline' }
  | { readonly type: 'upload_error'; readonly code: string }
  | { readonly type: 'retake' }
  | { readonly type: 'type_lines' };

export const INITIAL_SCAN: ScanState = { step: 'aim' };

export function scanReducer(state: ScanState, event: ScanEvent): ScanState {
  switch (event.type) {
    case 'captured':
      return state.step === 'aim' || state.step === 'denied'
        ? { step: 'reading', uri: event.uri }
        : state;
    case 'cancelled':
      return state.step === 'reading' ? { step: 'aim' } : state;
    case 'denied':
      return { step: 'denied' };
    case 'pick_failed':
      return state.step === 'aim' || state.step === 'denied' || state.step === 'pick_failed'
        ? { step: 'pick_failed' }
        : state;
    case 'read':
      return state.step === 'reading'
        ? { step: 'uploading', uri: state.uri, receiptId: event.receiptId, read: event.result }
        : state;
    case 'posted':
      return state.step === 'uploading'
        ? { step: 'waiting', uri: state.uri, receiptId: state.receiptId, read: state.read }
        : state;
    case 'offline':
      return state.step === 'uploading'
        ? { step: 'saved_offline', uri: state.uri, receiptId: state.receiptId }
        : state;
    case 'upload_error':
      return state.step === 'uploading'
        ? { step: 'upload_failed', uri: state.uri, code: event.code }
        : state;
    case 'retake':
      return { step: 'aim' };
    case 'type_lines':
      return {
        step: 'typing',
        receiptId:
          state.step === 'waiting' || state.step === 'saved_offline' ? state.receiptId : null,
      };
  }
}

/** What the device tells the server about its read: its lines, or why the server should read it. */
export function uploadStatus(read: ReaderResult): 'ok' | 'unsupported_script' | 'no_text' {
  if (read.status !== 'ok') return read.status;
  return read.lines.length === 0 ? 'no_text' : 'ok';
}
