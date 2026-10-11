/**
 * Is this right?'s state: the card read from what was shared (or typed in when nothing could be
 * read), which lines are confirmed, the line being fixed, the words a line came from, the question
 * for what the price does not say, and saving the confirmed card to the shortlist.
 */
import { EMPTY_DRIVER_CARD, generateUuidV7, type DriverCard, type DriverField } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { confirmFieldsCommand } from '../../shared/commands';
import { askWords, usePriceWords } from '../../shared/price-text';
import { driversRoute } from '../../shared/routes';
import { useDriverDays } from '../../shared/use-driver-days';
import { useDrivers } from '../../shared/use-drivers';
import { askMessage, whatsappAsk } from '../../shared/whatsapp-copy';
import { recalledIntake } from '../intake-store';
import { useCardCopy } from './card-copy';
import { applyEdit, filledLines, unsaidIncludes } from './card-lines';

export interface CheckCardInput {
  readonly tripId: string;
  readonly intakeId?: string | undefined;
  readonly unread?: boolean | undefined;
  readonly days?: string | undefined;
}

export function useCheckCard(props: CheckCardInput) {
  const { t } = useLingui();
  const plan = useDriverDays(props.tripId);
  const { state } = useDrivers(props.tripId);
  const confirm = useCommand(confirmFieldsCommand);
  const listed =
    state.kind === 'ready' || state.kind === 'offline'
      ? (state.data?.intake ?? []).find((item) => item.id === props.intakeId)
      : undefined;
  const recalled = props.intakeId === undefined ? null : recalledIntake(props.intakeId);
  const parsed = recalled?.parsed ?? listed?.parsed ?? null;
  const source = recalled?.text ?? listed?.text ?? '';
  const [typing, setTyping] = useState(false);
  const [card, setCard] = useState<DriverCard | null>(parsed?.card ?? null);
  const [checked, setChecked] = useState<ReadonlySet<DriverField>>(new Set());
  const [focus, setFocus] = useState<DriverField | null>(null);
  const [editing, setEditing] = useState<DriverField | null>(null);
  const [error, setError] = useState(false);
  const current: DriverCard = card ?? parsed?.card ?? EMPTY_DRIVER_CARD;
  const copy = useCardCopy(current);
  const priceWords = usePriceWords();
  const readNothing =
    props.unread === true ||
    parsed === null ||
    (parsed.card.name === null && filledLines(parsed.card).length === 0);
  const required: DriverField[] = ['name', ...filledLines(current)];
  const left = required.filter((field) => !checked.has(field));
  const unsaid = unsaidIncludes(current);
  const name = current.name ?? '';
  const toggle = (field: DriverField) => {
    setFocus(field);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };
  const startTyping = () => {
    setTyping(true);
    setEditing(current.name === null ? 'name' : 'phone');
  };
  const edit = (field: DriverField, text: string) =>
    setCard(applyEdit(current, field, text, field === 'name' ? 'USD' : (plan.currency ?? 'USD')));
  const save = async () => {
    const result = await confirm.send({
      provider_id: generateUuidV7(),
      trip_id: props.tripId,
      ...(props.intakeId === undefined ? {} : { intake_id: props.intakeId }),
      card: { ...current, name },
      confirmed: required,
    });
    if (result.kind === 'applied') {
      router.dismissTo(driversRoute(props.tripId, 'index', props.days ? { days: props.days } : {}));
    } else {
      setError(true);
    }
  };
  // No one price could be read for this crew: the line says to ask, and the question asks it.
  const priceAsk = askWords(current);
  const askText =
    askMessage(
      t,
      name,
      unsaid.map((key) => copy.includeLabel[key]),
      current.overtime_minor === null,
    ) + (priceAsk === null ? '' : priceWords.question(priceAsk, plan.people));
  return {
    plan,
    parsed,
    source,
    readNothing: readNothing && !typing,
    typing,
    startTyping,
    current,
    setCard,
    edit,
    checked,
    toggle,
    editing,
    setEditing,
    span: focus === null ? undefined : parsed?.spans[focus],
    required,
    left,
    name,
    priceAsk,
    asked: unsaid.length + (priceAsk === null ? 0 : 1),
    askUrl: whatsappAsk(current.phone, askText),
    error,
    pending: confirm.pending,
    save,
    ...copy,
  };
}
