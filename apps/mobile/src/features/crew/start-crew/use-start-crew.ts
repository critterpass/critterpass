/**
 * Starting a crew, as both the current page and the premium sheet run it: the name (up to 32
 * characters), the sticker and the cover, the create command through the offline queue, and what
 * came back (the crew and its code, a refusal with the server's reason, or "not ready yet" when
 * the phone's data has not opened). A press still working after a while says so.
 */
/* eslint-disable lingui/no-unlocalized-strings -- step names and refusal reasons, never copy. */
import { useContext, useState } from 'react';

import {
  CREW_NAME_MAX,
  crewNameSchema,
  generateUuidV7,
  normaliseCrewName,
  type CreateCrewResult,
  type CrewCover,
} from '@cp/domain';

import { LocalFirstContext } from '@/data/powersync/local-first-context';

import { CREATE_CREW } from '../crews-sheet/crew-commands';
import { useCrewCode } from '../crews-sheet/crew-data';

/** After this long a press that is still working says so. */
const SLOW_MS = 6000;

export type StartStep =
  | { readonly kind: 'name' }
  | { readonly kind: 'created'; readonly crewId: string; readonly code: string | null }
  | { readonly kind: 'failed' }
  /** Pressed before the phone's data opened. */
  | { readonly kind: 'not_ready' };

function isCreated(value: unknown): value is CreateCrewResult {
  return typeof (value as Partial<CreateCrewResult> | null)?.code === 'string';
}

/** Why the server refused (`detail.reason`), when it said. */
function refusalOf(detail: unknown): string | null {
  const reason = (detail as { readonly reason?: unknown } | null | undefined)?.reason;
  return typeof reason === 'string' ? reason : null;
}

export function useStartCrew<Art extends string>(initialArt: Art) {
  const localFirst = useContext(LocalFirstContext);
  const [name, setNameRaw] = useState('');
  const [art, setArt] = useState<Art>(initialArt);
  const [cover, setCover] = useState<CrewCover | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [step, setStep] = useState<StartStep>({ kind: 'name' });
  const [refusal, setRefusal] = useState<string | null>(null);
  const valid = crewNameSchema.safeParse(name).success;
  const syncedCode = useCrewCode(
    localFirst?.db ?? null,
    step.kind === 'created' && step.code === null ? step.crewId : null,
  );

  const create = (): Promise<StartStep> => {
    if (!valid) return Promise.resolve(step);
    // A press is never swallowed: before the phone's data is open it says so.
    if (localFirst === null) {
      const next: StartStep = { kind: 'not_ready' };
      setStep(next);
      return Promise.resolve(next);
    }
    setBusy(true);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
    const crewId = generateUuidV7();
    return localFirst.commands
      .send(CREATE_CREW, {
        crew_id: crewId,
        name: normaliseCrewName(name),
        art,
        ...(cover === null ? {} : { cover }),
      })
      .then((sent) => {
        setRefusal(sent.kind === 'rejected' ? refusalOf(sent.detail) : null);
        const next: StartStep =
          sent.kind === 'applied'
            ? { kind: 'created', crewId, code: isCreated(sent.result) ? sent.result.code : null }
            : sent.kind === 'queued'
              ? { kind: 'created', crewId, code: null }
              : { kind: 'failed' };
        setStep(next);
        return next;
      })
      .finally(() => {
        clearTimeout(slowTimer);
        setBusy(false);
        setSlow(false);
      });
  };

  return {
    name,
    setName: (next: string) => setNameRaw(next.slice(0, CREW_NAME_MAX)),
    max: CREW_NAME_MAX,
    art,
    setArt,
    cover,
    setCover,
    valid,
    busy,
    slow: busy && slow,
    step,
    refusal,
    code: step.kind === 'created' ? (step.code ?? syncedCode) : null,
    create,
  };
}
