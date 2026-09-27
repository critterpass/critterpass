/**
 * The console's only way to the api: same-origin `/v1/admin/*` (the admin Worker proxies it, so the
 * `cp_admin` session cookie rides along). Every response is parsed with the shared zod contract from
 * `@cp/domain`, and every write is a command envelope with `actor.via = 'admin'`.
 */
import {
  ADMIN_CONSOLE_DEVICE,
  adminCommandResultSchema,
  generateUuidV7,
  type AdminCommandResult,
} from '@cp/domain';
import type { z } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;
  readonly requestId: string | null;
  readonly retryable: boolean;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    detail?: unknown;
    requestId: string | null;
    retryable: boolean;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    this.requestId = init.requestId;
    this.retryable = init.retryable;
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

interface ErrorBody {
  error?: { code?: string; message?: string; retryable?: boolean; detail?: unknown };
}

async function send(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError({
      status: 0,
      code: 'OFFLINE',
      message: 'The console cannot reach the api.',
      requestId: null,
      retryable: true,
    });
  }
  const requestId = response.headers.get('x-request-id');
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ErrorBody | null)?.error;
    throw new ApiError({
      status: response.status,
      code: error?.code ?? 'INTERNAL',
      message: error?.message ?? `Request failed (${response.status})`,
      detail: error?.detail,
      requestId,
      retryable: error?.retryable ?? response.status >= 500,
    });
  }
  return body;
}

export async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await send(path));
}

/** Runs one audited command. `baseVersion` carries the optimistic-concurrency token when the aggregate has one. */
export async function runCommand(
  cmd: string,
  payload: unknown,
  uid: string,
): Promise<AdminCommandResult> {
  const body = await send(`/v1/admin/cmd/${cmd}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      op_id: generateUuidV7(),
      cmd,
      v: 1,
      actor: { uid, via: 'admin' },
      device: {
        ...ADMIN_CONSOLE_DEVICE,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || ADMIN_CONSOLE_DEVICE.tz,
      },
      client_ts: new Date().toISOString(),
      payload,
    }),
  });
  return adminCommandResultSchema.parse(body);
}

export async function postAuth(path: string, body: unknown): Promise<unknown> {
  return send(`/v1/admin/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
