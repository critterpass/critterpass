/**
 * `user_pid`: the pseudonymous person key PostHog sees. HMAC-SHA256 of the uid under the
 * analytics salt (server env `ANALYTICS_PID_SALT`), so a PostHog export cannot be joined back to
 * user rows without the salt. Web Crypto keeps it usable from Node and Workers alike; the app
 * receives its pid from the api and never holds the salt.
 */
const encoder = new TextEncoder();

export async function userPid(uid: string, salt: string): Promise<string> {
  if (salt.length < 16) throw new Error('analytics pid salt must be at least 16 characters');
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(uid));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
