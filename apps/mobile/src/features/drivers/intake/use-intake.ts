/**
 * Bringing a driver in (6c-1): share the text to the trip (`share_provider_intake`, queued when
 * offline), then ask the api to read it into a card. A screenshot is read on the phone first and
 * only its text is shared; a typed contact needs no reading.
 */
import { EMPTY_DRIVER_CARD, generateUuidV7, type IntakeKind, type ParsedIntake } from '@cp/domain';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { deviceDriversApi, type DriversApi } from '../shared/api';
import { shareIntakeCommand } from '../shared/commands';
import { rememberIntake, type ReadIntake } from './intake-store';

export type IntakeState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'queued' }
  | { readonly kind: 'done'; readonly item: ReadIntake };

/** A contact typed in by hand: its name and number are the card, nothing to read. */
export function contactCard(name: string, phone: string): ParsedIntake {
  const digits = phone.replace(/[^\d+]/gu, '');
  return {
    card: {
      ...EMPTY_DRIVER_CARD,
      name: name.trim() === '' ? null : name.trim(),
      phone: /^\+[1-9]\d{6,14}$/u.test(digits) ? digits : null,
    },
    spans: {},
    unreadable: [],
    cut_off: false,
  };
}

export function useIntake(tripId: string, api: DriversApi = deviceDriversApi) {
  const share = useCommand(shareIntakeCommand);
  const [state, setState] = useState<IntakeState>({ kind: 'idle' });
  const submit = async (kind: IntakeKind, text: string, preset?: ParsedIntake) => {
    const intakeId = generateUuidV7();
    setState({ kind: 'reading' });
    const sent = await share.send({ intake_id: intakeId, trip_id: tripId, kind, text });
    if (sent.kind === 'rejected') {
      setState({ kind: 'idle' });
      return null;
    }
    if (preset !== undefined) {
      const item = { intakeId, kind, text, parsed: preset, sharedBy: null };
      rememberIntake(item);
      setState({ kind: 'done', item });
      return item;
    }
    if (sent.kind === 'queued') {
      setState({ kind: 'queued' });
      return null;
    }
    const read = await api.readIntake(intakeId);
    const item: ReadIntake = {
      intakeId,
      kind,
      text,
      parsed: read.kind === 'ok' ? read.value.parsed : null,
      sharedBy: null,
    };
    rememberIntake(item);
    setState({ kind: 'done', item });
    return item;
  };
  return { state, submit, reset: () => setState({ kind: 'idle' }) };
}
