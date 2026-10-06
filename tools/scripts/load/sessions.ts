/**
 * Real accounts for load runs: anonymous sign-ins on the target api (paced under its rate limit)
 * and the audience-scoped tokens PowerSync (`sync`) and Centrifugo (`rt`) accept. Load runs only
 * target staging; `assertNotProduction` refuses the production api.
 */
export interface LoadSession {
  readonly uid: string;
  readonly cookie: string;
}

/** Load runs target staging or a local stack, never production. */
export function assertNotProduction(apiBase: string): void {
  const { hostname } = new URL(apiBase);
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!local && !hostname.includes('staging')) {
    throw new Error(`refusing to load-test ${hostname}: staging or a local stack only`);
  }
}

export async function signIn(apiBase: string): Promise<LoadSession> {
  const response = await fetch(`${apiBase}/api/auth/sign-in/anonymous`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const cookie = /better-auth\.session_token=[^;]+/u.exec(
    response.headers.get('set-cookie') ?? '',
  )?.[0];
  const body = (await response.json().catch(() => ({}))) as { user?: { id: string } };
  if (!cookie || !body.user) throw new Error(`anonymous sign-in failed (${response.status})`);
  return { uid: body.user.id, cookie };
}

export async function serviceToken(
  apiBase: string,
  session: LoadSession,
  aud: 'sync' | 'rt',
): Promise<string> {
  const response = await fetch(`${apiBase}/api/auth/token?aud=${aud}`, {
    headers: { cookie: session.cookie },
  });
  if (!response.ok) throw new Error(`token ${aud} failed (${response.status})`);
  return ((await response.json()) as { token: string }).token;
}

/** Signs in `count` accounts, `perSecond` at a time, so the auth rate limit is never the result. */
export async function signInMany(
  apiBase: string,
  count: number,
  perSecond = 2,
): Promise<LoadSession[]> {
  const sessions: LoadSession[] = [];
  while (sessions.length < count) {
    const batch = Math.min(perSecond, count - sessions.length);
    sessions.push(...(await Promise.all(Array.from({ length: batch }, () => signIn(apiBase)))));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return sessions;
}

export function percentile(values: readonly number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}
