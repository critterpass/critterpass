/**
 * The guide stream's frames and failures: `event:`/`data:` frames split from the byte stream, and
 * a refused request's wire error (`{error: {code, detail}}`), so a spent meter (`QUOTA_EXHAUSTED`)
 * reaches the 4b-1 card with its `reset_at` and the crewmates who have Pass+.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and headers, never copy. */
export interface GuideFrame {
  readonly type: string;
  readonly data: Record<string, unknown>;
}

export type GuideFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
  text: () => Promise<string>;
}>;

/** A refused request (`code` from the wire error) or a dropped connection (`status: null`). */
export class GuideStreamError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: string | null = null,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(code ?? (status === null ? 'stream failed' : `stream answered ${status}`));
  }
}

/** Splits a text buffer into complete frames, returning the frames and what is left over. */
export function parseGuideFrames(buffer: string): { frames: GuideFrame[]; rest: string } {
  const frames: GuideFrame[] = [];
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    const type = /^event: (.*)$/mu.exec(block)?.[1];
    const data = /^data: (.*)$/mu.exec(block)?.[1];
    if (type === undefined || data === undefined) continue;
    try {
      frames.push({ type, data: JSON.parse(data) as Record<string, unknown> });
    } catch {
      // A torn frame is dropped; the stream's own `done` or `error` still arrives.
    }
  }
  return { frames, rest };
}

/** The wire error of a refused request (`{error: {code, detail}}`), or a bare status. */
export function refusal(status: number, body: string): GuideStreamError {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown; detail?: unknown } };
    const code = typeof parsed.error?.code === 'string' ? parsed.error.code : null;
    const detail =
      typeof parsed.error?.detail === 'object' && parsed.error.detail !== null
        ? (parsed.error.detail as Record<string, unknown>)
        : {};
    return new GuideStreamError(status, code, detail);
  } catch {
    return new GuideStreamError(status);
  }
}
