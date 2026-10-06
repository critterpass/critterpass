/**
 * Google OAuth access token for a service account (JWT bearer grant, RS256), for the Play
 * Developer API and FCM. Credentials stay in a git-ignored file named by an environment variable.
 */
import { createSign } from 'node:crypto';

export interface ServiceAccount {
  readonly client_email: string;
  readonly private_key: string;
  readonly token_uri: string;
  readonly project_id?: string;
}

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

export async function googleAccessToken(account: ServiceAccount, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope,
      aud: account.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(account.private_key);
  const response = await fetch(account.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }),
  });
  if (!response.ok) throw new Error(`google token request failed: ${response.status}`);
  return ((await response.json()) as { access_token: string }).access_token;
}
