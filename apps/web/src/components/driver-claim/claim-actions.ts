/* eslint-disable lingui/no-unlocalized-strings -- form actions and wire values, not UI copy. */
/**
 * One form post on the claim page, carried out against the api. A change that rotates the key
 * answers with the new key (the page redirects there, so the old one is never bookmarked again);
 * anything else answers with what the next render needs: the code step, an error, the remove
 * question or a final state.
 */
import type { DriverClaimDetails } from '@cp/domain';

import { callClaimApi, detailsFromForm, text, type ClaimApi, type ClaimResult } from './claim-api';

export type ClaimError = 'wrongCode' | 'codeExpired' | 'tooMany' | 'failed';

export interface ClaimOutcome {
  readonly nextKey?: string;
  readonly finalState?: 'removed' | 'declined';
  readonly codeSentTo?: string;
  readonly askRemove?: boolean;
  readonly error?: ClaimError;
  /** What the driver typed, kept across the code step. */
  readonly draft?: DriverClaimDetails;
  readonly showRatings?: boolean;
}

function errorOf(result: Extract<ClaimResult, { ok: false }>): ClaimError {
  if (result.code === 'CODE_INVALID') return 'wrongCode';
  if (result.code === 'CODE_EXPIRED') return 'codeExpired';
  if (result.code === 'RATE_LIMITED') return 'tooMany';
  return 'failed';
}

function rotated(result: ClaimResult, fallback: ClaimOutcome = {}): ClaimOutcome {
  if (!result.ok) return { ...fallback, error: errorOf(result) };
  const next = result.body['next_key'];
  return typeof next === 'string' ? { nextKey: next } : fallback;
}

export async function runClaimAction(
  api: ClaimApi,
  form: FormData,
  lang: 'en' | 'id',
): Promise<ClaimOutcome> {
  const action = text(form.get('action'));
  const showRatings = form.get('show_ratings') === 'on';
  switch (action) {
    case 'otp': {
      const draft = detailsFromForm(form);
      const sent = await callClaimApi(api, 'POST', '/otp');
      if (!sent.ok) return { draft, showRatings, error: errorOf(sent) };
      return { draft, showRatings, codeSentTo: text(sent.body['masked_phone']) };
    }
    case 'confirm': {
      const draft = detailsFromForm(form);
      const result = await callClaimApi(api, 'POST', '/confirm', {
        code: text(form.get('code')).trim(),
        details: draft,
        show_ratings: showRatings,
        lang,
      });
      return rotated(result, { draft, showRatings, codeSentTo: text(form.get('masked')) });
    }
    case 'decline': {
      const result = await callClaimApi(api, 'POST', '/decline');
      return result.ok ? { finalState: 'declined' } : { error: errorOf(result) };
    }
    case 'pause':
    case 'resume':
      return rotated(await callClaimApi(api, 'POST', '/pause', { paused: action === 'pause' }));
    case 'ratings':
      return rotated(
        await callClaimApi(api, 'PATCH', '/listing', { show_ratings: form.get('value') === 'on' }),
      );
    case 'details':
      return rotated(
        await callClaimApi(api, 'PATCH', '/listing', { details: detailsFromForm(form) }),
      );
    case 'remove-ask':
      return { askRemove: true };
    case 'remove': {
      const result = await callClaimApi(api, 'DELETE', '/listing');
      return result.ok ? { finalState: 'removed' } : { error: errorOf(result) };
    }
    case 'recover-otp': {
      const sent = await callClaimApi(api, 'POST', '/otp');
      return sent.ok ? { codeSentTo: text(sent.body['masked_phone']) } : { error: errorOf(sent) };
    }
    case 'recover':
      return rotated(
        await callClaimApi(api, 'POST', '/recover', {
          code: text(form.get('code')).trim(),
        }),
        { codeSentTo: text(form.get('masked')) },
      );
    default:
      return { error: 'failed' };
  }
}
