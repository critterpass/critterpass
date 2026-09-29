/**
 * The guest guide's brief for a place no live guide covers (`POST /v1/places/{id}/guest-brief`):
 * the place facts arrive at once from code (country, currency and rate, stops, best months, the
 * locals as silhouettes with a hint each), then three to five facts the guest guide found on
 * allow-listed pages, each citing its source. A switched-off brief (`hidden`) shows the place
 * without the facts; a dropped stream keeps what arrived and offers a retry.
 */
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useState } from 'react';

import { Stack } from '@/ui/layout/Stack';
import { TextLink } from '@/ui/buttons/TextLink';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { SseFrame } from '../data/sse-client';
import { useVoteServices } from '../data/vote-services';
import { upper } from '../format';

export interface GuestPlace {
  readonly placeId: string;
  readonly name: string;
  readonly country: string | null;
  readonly currency: string | null;
  readonly bestMonths: readonly number[];
  readonly fx: { readonly base: string; readonly quote: string; readonly rate: number } | null;
  readonly stops: number | null;
  readonly locals: readonly { readonly id: string; readonly hint: string }[];
}

export interface BriefFact {
  readonly text: string;
  readonly url: string;
  readonly domain: string;
}

export interface BriefState {
  readonly phase: 'loading' | 'streaming' | 'done' | 'error';
  readonly place: GuestPlace | null;
  readonly facts: readonly BriefFact[];
  readonly hidden: boolean;
}

const EMPTY: BriefState = { phase: 'loading', place: null, facts: [], hidden: false };

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function placeOf(d: Record<string, unknown>): GuestPlace {
  const fx = d['fx'];
  const fxRecord = typeof fx === 'object' && fx !== null ? (fx as Record<string, unknown>) : null;
  const locals = Array.isArray(d['locals']) ? (d['locals'] as unknown[]) : [];
  return {
    placeId: str(d['place_id']) ?? '',
    name: str(d['name']) ?? '',
    country: str(d['country']),
    currency: str(d['currency']),
    bestMonths: Array.isArray(d['best_months'])
      ? d['best_months'].filter((m): m is number => typeof m === 'number')
      : [],
    fx:
      fxRecord === null
        ? null
        : {
            base: str(fxRecord['base']) ?? '',
            quote: str(fxRecord['quote']) ?? '',
            rate: Number(fxRecord['rate'] ?? 0),
          },
    stops: typeof d['stops'] === 'number' ? d['stops'] : null,
    locals: locals.flatMap((local) => {
      if (typeof local !== 'object' || local === null) return [];
      const record = local as Record<string, unknown>;
      const id = str(record['id']);
      return id === null ? [] : [{ id, hint: str(record['hint']) ?? '' }];
    }),
  };
}

export function applyBriefFrame(state: BriefState, frame: SseFrame): BriefState {
  const d = frame.data;
  switch (frame.type) {
    case 'place':
      return { ...state, phase: 'streaming', place: placeOf(d) };
    case 'fact': {
      const text = str(d['text']);
      if (text === null) return state;
      const fact = { text, url: str(d['url']) ?? '', domain: str(d['domain']) ?? '' };
      return { ...state, facts: [...state.facts, fact] };
    }
    case 'done':
      return { ...state, phase: 'done', hidden: d['hidden'] === true };
    case 'error':
      return { ...state, phase: 'error' };
    default:
      return state;
  }
}

export function useGuestBrief(placeId: string, crewId: string | undefined) {
  const services = useVoteServices();
  const [attempt, setAttempt] = useState(0);
  const key = `${placeId}:${crewId ?? ''}:${attempt}`;
  const [brief, setBrief] = useState<{ key: string; state: BriefState } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const update = (next: (current: BriefState) => BriefState) =>
      setBrief((current) => ({ key, state: next(current?.key === key ? current.state : EMPTY) }));
    const fail = () =>
      update((current) => (current.phase === 'done' ? current : { ...current, phase: 'error' }));
    services
      .streamGuestBrief(
        placeId,
        crewId === undefined ? {} : { crew_id: crewId },
        (frame) => update((current) => applyBriefFrame(current, frame)),
        controller.signal,
      )
      .then(fail, () => {
        if (!controller.signal.aborted) fail();
      });
    return () => controller.abort();
    // `placeId`, `crewId` and the retry count are folded into `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, services]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state: brief?.key === key ? brief.state : EMPTY, retry };
}

export function BriefFacts({
  state,
  guideName,
  onRetry,
}: {
  readonly state: BriefState;
  readonly guideName: string;
  readonly onRetry: () => void;
}) {
  const { t, i18n } = useLingui();
  const theme = useTheme();
  if (state.hidden) return null;
  return (
    <Stack gap="8" testID="guest-brief">
      <Text variant="eyebrow" color={theme.semantic.action.primary}>
        {upper(
          t({ id: 'vote.guest.knows', message: `What ${guideName} knows so far` }),
          i18n.locale,
        )}
      </Text>
      {state.facts.map((fact) => (
        <Stack key={fact.url + fact.text} gap="2">
          <Text variant="body">{fact.text}</Text>
          {fact.domain === '' ? null : (
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {fact.domain}
            </Text>
          )}
        </Stack>
      ))}
      {state.phase === 'streaming' || state.phase === 'loading' ? (
        <Text variant="bodySm" color={theme.semantic.text.secondary} testID="guest-brief-loading">
          {t({ id: 'vote.guest.reading', message: `${guideName} is reading up…` })}
        </Text>
      ) : null}
      {state.phase === 'error' ? (
        <Stack gap="4" testID="guest-brief-error">
          <Text variant="bodySm">
            {t({ id: 'vote.guest.briefError', message: "Couldn't finish reading up just now." })}
          </Text>
          <TextLink
            label={t({ id: 'vote.guest.retry', message: 'Try again' })}
            onPress={onRetry}
            testID="guest-brief-retry"
          />
        </Stack>
      ) : null}
    </Stack>
  );
}
