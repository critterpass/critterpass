/**
 * Phrase practice on the device: the trip language's phrase cards and the person's progress from
 * the synced tables, the speech module listening in the phrase's language when the pronunciation
 * check is on (behind the voice consent), the feedback route grading what was heard, and every
 * practice recorded for the trip's quests.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, api paths and wire values, never copy. */
import { msg } from '@lingui/core/macro';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/device-session';
import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { openPermissionSettings, requestWithPrimer } from '@/lib/permissions';

import { useLiveQuery } from '../chat/data/live-rows';
import { useGuideContext } from '../chat/data/use-guide-context';
import { PhraseCard } from '../phrases/phrase-card';
import { useVoiceConsent } from '../voice/voice-consent';
import { sttToken, type VoiceSpeech } from '../voice/voice-screen';
import {
  createPracticeController,
  type PracticeController,
  type PracticeGrade,
  type PracticePorts,
  type PracticeRecord,
} from './practice-controller';
import {
  currentPhrase,
  PRACTICE_READY,
  practiceLists,
  type PracticePhrase,
  type PracticeState,
} from './practice-model';
import { PracticeView } from './practice-view';

export const recordPhrasePracticeCommand = defineClientCommand<
  PracticeRecord & { readonly trip_id: string | null }
>({
  name: 'record_phrase_practice',
  offline: true,
  summarize: () => msg({ id: 'guide.practice.queued', message: 'A phrase you practised' }),
});

interface CardRow {
  readonly id: string;
  readonly text: string;
  readonly romanisation: string | null;
  readonly gloss: string;
  readonly language: string;
  readonly audio_key: string | null;
}

/** The cards of one language (any region of it), or of the first language there is. */
const CARDS_SQL = `SELECT id, text, romanisation, gloss, language, audio_key FROM phrase_cards
  WHERE CASE WHEN ?1 IS NULL
    THEN language = (SELECT min(language) FROM phrase_cards)
    ELSE language = ?1 OR language LIKE ?1 || '-%' END
  ORDER BY context, key`;
const PROGRESS_SQL = 'SELECT phrase_id FROM phrase_progress WHERE practised_at IS NOT NULL';

async function gradeOnServer(phrase: PracticePhrase, heard: string): Promise<PracticeGrade> {
  const response = await fetch(`${resolveApiBaseUrl()}/v1/guide/phrase-feedback`, {
    method: 'POST',
    headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
    body: JSON.stringify({
      phrase_id: phrase.id,
      language: phrase.language,
      recognised: heard.slice(0, 300),
    }),
  });
  if (!response.ok) throw new Error(`phrase feedback answered ${response.status}`);
  const body = (await response.json()) as Partial<PracticeGrade>;
  if (body.outcome !== 'ok' && body.outcome !== 'retry') throw new Error('phrase feedback shape');
  return {
    outcome: body.outcome,
    score: typeof body.score === 'number' ? body.score : 0,
    tip: typeof body.tip === 'string' && body.tip !== '' ? body.tip : null,
  };
}

export interface PracticeScreenProps {
  readonly tripId: string | null;
  /** BCP 47 language to practise; null practises the first language with cards. */
  readonly language: string | null;
  /** The phrase to start on (the card the person came from), by its text. */
  readonly startText: string | null;
  /** Null in a build without the speech module: practice counts by "I said it" only. */
  readonly speech: Pick<VoiceSpeech, 'listen' | 'endSession'> | null;
}

export function PracticeScreen(props: PracticeScreenProps) {
  const localFirst = useContext(LocalFirstContext);
  return localFirst === null ? null : <OpenPracticeScreen {...props} />;
}

function OpenPracticeScreen({ tripId, language, startText, speech }: PracticeScreenProps) {
  const context = useGuideContext(tripId);
  const consent = useVoiceConsent();
  const sync = useSyncStatus();
  const record = useCommand(recordPhrasePracticeCommand);
  const base = language === null ? null : (language.split('-')[0] ?? language).toLowerCase();
  const cards = useLiveQuery<CardRow>(CARDS_SQL, [base], ['phrase_cards']);
  const progress = useLiveQuery<{ phrase_id: string }>(PROGRESS_SQL, [], ['phrase_progress']);
  const [state, setState] = useState<PracticeState>(PRACTICE_READY);
  const [checking, setChecking] = useState(false);
  // Undefined until the person picks or practises: the phrase they came from goes first.
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  // Practised well on this phone, before the progress row syncs back.
  const [justLearned, setJustLearned] = useState<readonly string[]>([]);
  const controller = useRef<PracticeController | null>(null);
  const live = useRef({ online: true, tripId: context.trip?.tripId ?? null, send: record.send });
  const online = sync.phase !== 'offline';
  const liveTripId = context.trip?.tripId ?? null;
  const send = record.send;
  useEffect(() => {
    live.current = { online, tripId: liveTripId, send };
  }, [online, liveTripId, send]);

  useEffect(() => {
    const ports: PracticePorts = {
      allowMicrophone: async () => {
        const outcome = await requestWithPrimer('microphone', 'voice').catch(() => null);
        return outcome?.result === 'granted' || outcome?.result === 'partial';
      },
      listen:
        speech === null ? null : (lang, onPartial) => speech.listen(lang, sttToken, onPartial),
      online: () => live.current.online,
      grade: gradeOnServer,
      record: (entry) => {
        if (entry.outcome === 'ok') {
          setJustLearned((ids) =>
            ids.includes(entry.phrase_id) ? ids : [...ids, entry.phrase_id],
          );
        }
        void live.current.send({ ...entry, trip_id: live.current.tripId }).catch(() => undefined);
      },
    };
    const practice = createPracticeController(ports, setState);
    controller.current = practice;
    return () => {
      practice.dispose();
      controller.current = null;
      speech?.endSession();
    };
  }, [speech]);

  const phrases = useMemo<PracticePhrase[]>(
    () =>
      (cards ?? []).map((row) => ({
        id: row.id,
        text: row.text,
        romanisation: row.romanisation,
        gloss: row.gloss,
        language: row.language,
        audioKey: row.audio_key,
      })),
    [cards],
  );
  const lists = useMemo(
    () =>
      practiceLists(
        phrases,
        new Set([...(progress ?? []).map((row) => row.phrase_id), ...justLearned]),
      ),
    [phrases, progress, justLearned],
  );
  const start = startText === null ? null : (phrases.find((p) => p.text === startText)?.id ?? null);
  const phrase = currentPhrase(phrases, lists, chosen === undefined ? start : chosen);

  const pick = (id: string | null) => {
    controller.current?.reset();
    setChosen(id);
  };
  // An attempt pins its phrase: the verdict stays on it after it moves to "learned".
  const attempt = (run: (practice: PracticeController, target: PracticePhrase) => void) => {
    if (phrase === null || controller.current === null) return;
    setChosen(phrase.id);
    run(controller.current, phrase);
  };
  if (cards === null) return null;
  return (
    <PracticeView
      guideName={context.guideName}
      lists={lists}
      current={phrase}
      card={
        phrase === null ? null : (
          <PhraseCard
            key={phrase.id}
            phrase={phrase.text}
            lang={phrase.language}
            gloss={phrase.gloss}
            audioKey={phrase.audioKey}
            testID="guide-practice-card"
          />
        )
      }
      state={state}
      checking={checking}
      consent={
        checking && consent.status === 'needed'
          ? { onAgree: consent.agree, onNotNow: () => setChecking(false) }
          : null
      }
      onChecking={setChecking}
      onPick={pick}
      onListen={() => attempt((practice, target) => void practice.listen(target))}
      onCheck={() => attempt((practice, target) => void practice.check(target))}
      onSaid={() => attempt((practice, target) => practice.said(target))}
      onNext={() => pick(null)}
      onOpenSettings={() => void openPermissionSettings('microphone')}
    />
  );
}
