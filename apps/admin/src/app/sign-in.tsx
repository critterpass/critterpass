/**
 * Sign-in: Google through the console's own Better Auth instance (the host sits behind Cloudflare
 * Access as a second factor). Local development builds also offer the dev door for seeded operators.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { postAuth } from '../lib/api';
import { ME_QUERY_KEY } from '../lib/session';

const DEV_SIGN_IN = import.meta.env.VITE_ADMIN_DEV_SIGN_IN === 'true';
const socialResponse = z.object({ url: z.url() });

export function SignInPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const google = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = socialResponse.parse(
        await postAuth('/sign-in/social', {
          provider: 'google',
          callbackURL: `${window.location.origin}/`,
        }),
      );
      window.location.assign(response.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed');
      setBusy(false);
    }
  };

  const devSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await postAuth('/dev/sign-in', { email });
      await client.invalidateQueries({ queryKey: ME_QUERY_KEY });
      await navigate({ to: '/' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="sign-in">
      <div className="card sign-in-card">
        <div className="brand">
          <span className="brand-dot" aria-hidden="true" />
          CritterPass Ops
        </div>
        <p className="muted">Sign in with your allow-listed work account.</p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void google()}
        >
          Continue with Google
        </button>
        {DEV_SIGN_IN && (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void devSignIn();
            }}
          >
            <label className="field">
              <span className="field-label">Local operator e-mail</span>
              <input
                className="input"
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <button type="submit" className="btn" disabled={busy}>
              Sign in locally
            </button>
          </form>
        )}
        {error !== null && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
