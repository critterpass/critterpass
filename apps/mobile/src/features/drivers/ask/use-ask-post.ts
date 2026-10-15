/**
 * The guide's post for the local groups, shared by both looks: written from the trip (party, the
 * picked legs with their hours, seats, language) in English or Indonesian. Each highlight is an
 * editable slot and the post rewrites around it; a budget appears only when the traveller adds one.
 * Copying puts it on the clipboard; CritterPass never posts in groups and never reads them.
 */
import {
  ASK_POST_WORDING,
  askPostText,
  buildAskPost,
  type AskPostLanguage,
  type AskSlot,
} from '@cp/domain';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

import { dayMonthLabel } from '../shared/format';
import { splitDays } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';

export function useAskPost(tripId: string, days?: string) {
  const plan = useDriverDays(tripId);
  const [lang, setLangState] = useState<AskPostLanguage>('en');
  const [edits, setEdits] = useState<Partial<Record<AskSlot, string>>>({});
  const [editing, setEditing] = useState<AskSlot | null>(null);
  const [copied, setCopied] = useState(false);
  const wording = ASK_POST_WORDING[lang];
  const picked = new Set(splitDays(days));
  const legs = plan.days
    .filter((day) => (picked.size === 0 ? day.gap !== null : picked.has(day.date)))
    .map((day) => ({
      date: dayMonthLabel(day.date, lang),
      route: [plan.area, day.gap?.place ?? day.stops.at(-1)?.name ?? '', plan.area]
        .filter((part) => part !== '')
        .join(' → '),
      start: day.window?.start ?? null,
      end: day.window?.end ?? null,
    }));
  const values = {
    area: plan.area,
    party: edits.party ?? wording.party(plan.people),
    seats: edits.seats ?? wording.seats(plan.people + 1),
    language: edits.language ?? wording.language,
    budget: edits.budget === undefined || edits.budget === '' ? null : edits.budget,
    legs,
  };
  const segments = buildAskPost(wording, values);
  return {
    plan,
    lang,
    setLang: (next: AskPostLanguage) => {
      setCopied(false);
      setLangState(next);
    },
    segments,
    editing,
    setEditing,
    /** The slot being edited, as the field shows it. */
    editValue:
      editing === null ? '' : (edits[editing] ?? (editing === 'budget' ? '' : values[editing])),
    edit: (text: string) => {
      if (editing === null) return;
      // The post changed: what was copied is no longer what is shown.
      setCopied(false);
      setEdits((prev) => ({ ...prev, [editing]: text }));
    },
    canAddBudget: values.budget === null && editing !== 'budget',
    copied,
    copy: () => {
      setEditing(null);
      void Clipboard.setStringAsync(askPostText(segments)).then(() => setCopied(true));
    },
  };
}
