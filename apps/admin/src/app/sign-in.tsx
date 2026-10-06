/**
 * Sign-in: Google through the console's own Better Auth instance (the host sits behind Cloudflare
 * Access as a second factor). Local development builds also offer the dev door for seeded operators.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';

import gecko from '../assets/stickers/gecko.webp';
import { postAuth } from '../lib/api';
import { ME_QUERY_KEY } from '../lib/session';
import { BrandMark } from './nav';

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
    <StaffPass>
      <p className="pass-copy">
        Sign in with your allow-listed work account. Cloudflare Access checks you first, and a
        session lasts 12 hours.
      </p>
      <button type="button" className="btn btn-pass" disabled={busy} onClick={() => void google()}>
        <span className="pass-g" aria-hidden="true">
          G
        </span>
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
    </StaffPass>
  );
}

/** The staff-pass card every signed-out state sits on (sign in, refused, no role yet). */
export function StaffPass({ children }: { children: ReactNode }) {
  return (
    <main className="sign-in">
      <div className="sign-in-brand">
        <BrandMark />
      </div>
      <div className="pass-stack">
        <div className="pass-card">
          <img className="pass-sticker" src={gecko} alt="" width={116} height={116} />
          <div className="pass-eyebrow">Staff pass · ops console</div>
          <h1 className="pass-title">
            CritterPass
            <br />
            Ops
          </h1>
          {children}
          <div className="pass-mrz mono" aria-hidden="true">
            P&lt;CPOPS&lt;&lt;STAFF&lt;&lt;ADMIN&lt;CRITTERPASS&lt;APP&lt;&lt;&lt;&lt;
            <br />
            0001&lt;SGT&lt;&lt;OWNER&lt;OPS&lt;CONTENT&lt;SUPPORT&lt;&lt;&lt;&lt;
          </div>
        </div>
        <span className="pass-scribble" aria-hidden="true">
          staff only
        </span>
      </div>
      <p className="sign-in-foot mono">admin.critterpass.app · every action is audited</p>
    </main>
  );
}

/**
 * Signed in with Google but refused by the guard: not on the allow-list, or on it with no role yet.
 */
export function RefusedPass({
  kind,
  email,
  onSignOut,
}: {
  kind: 'not_listed' | 'no_role';
  email: string | null;
  onSignOut: () => void;
}) {
  return (
    <StaffPass>
      <div className="pass-stamp" role="alert">
        {kind === 'not_listed' ? 'Not on the list' : 'No role yet'}
      </div>
      {email !== null && <p className="mono">{email}</p>}
      <p className="pass-copy">
        {kind === 'not_listed'
          ? 'This account is not on the console allow-list. Ask an owner to add it, then sign in again.'
          : 'You are on the list, but an owner has not given you a role yet. Ask them on Operators.'}
      </p>
      <button type="button" className="btn btn-pass" onClick={onSignOut}>
        Sign out
      </button>
    </StaffPass>
  );
}
