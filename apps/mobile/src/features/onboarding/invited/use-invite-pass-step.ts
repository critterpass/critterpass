/**
 * "Your pass, three taps" working state, shared by the current and the premium page: the invite's
 * prefill applied once per visit (the edit opens by itself when the name or home is missing), the
 * face and the travel tags written to the pass draft, issuing, the save flow, and the seat taken
 * once the pass is saved and this page is back in front.
 */
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { guideFormId, guideOfForm, homeBaseFor, type TasteTag } from '@cp/domain';

import { useAnalytics } from '@/lib/analytics';
import type { GuideAvatarId } from '@/ui/avatar/guides';

import { airportDataset, onboardingQuiz } from '../content';
import { ensureDraft, updateDraft, usePassDraft } from '../flow-controller/draft-store';
import { useSaveFlow } from '../save/use-save-flow';
import { useInviteSession } from './invite-session';
import { missingPassPart } from './pass-missing';
import { answersForTags, applyPrefill, prefillOf } from './pass-prefill';
import { useSeatJoin } from './use-seat-join';

export function useInvitePassStep() {
  const analytics = useAnalytics();
  const session = useInviteSession();
  const draft = usePassDraft() ?? ensureDraft();
  const prefill = useMemo(() => prefillOf(session.preview), [session.preview]);
  const quiz = onboardingQuiz();
  const [selected, setSelected] = useState<TasteTag[]>(() => [...prefill.tags]);
  const [editing, setEditing] = useState(false);
  const [issued, setIssued] = useState(false);
  const save = useSaveFlow();
  // The phone page is pushed over this one: the sheet goes while it is up, and the seat is taken
  // once this page is back in front with the pass saved.
  const focused = useIsFocused();
  const seat = useSeatJoin();
  const inviter = session.preview?.inviter_first_name ?? '';

  useEffect(() => {
    // Only a home the bundled airports know is kept from the hint.
    const home =
      prefill.homeIata !== null && homeBaseFor(airportDataset(), prefill.homeIata) !== null
        ? prefill.homeIata
        : null;
    const arrived = updateDraft((d) => applyPrefill(d, { ...prefill, homeIata: home }, quiz));
    // Nobody has to find the pass card to be asked for what the invite did not carry.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (missingPassPart(arrived) !== null) setEditing(true);
    // eslint-disable-next-line lingui/no-unlocalized-strings -- an analytics event name.
    if (prefill.givenName !== null) analytics.capture('invite_prefill_viewed', {});
    // Prefill once per page visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guide: GuideAvatarId =
    draft.avatar?.kind === 'critter' ? (guideOfForm(draft.avatar.form_id) ?? 'tokek') : 'tokek';
  const pickFace = (next: GuideAvatarId) =>
    updateDraft((d) => ({ ...d, avatar: { kind: 'critter', form_id: guideFormId(next) } }));
  const toggle = (tag: TasteTag) => {
    const next = selected.includes(tag) ? selected.filter((x) => x !== tag) : [...selected, tag];
    setSelected(next);
    updateDraft((d) => ({
      ...d,
      answers: answersForTags(quiz, next),
      taste_done: next.length > 0,
    }));
  };

  const issue = () => {
    updateDraft((d) => ({
      ...d,
      avatar: d.avatar ?? { kind: 'critter', form_id: guideFormId('tokek') },
      taste_done: true,
      issued_at: new Date().toISOString(),
      step: 'issued',
    }));
    setIssued(true);
  };

  const saved = save.state.kind === 'saved';
  useEffect(() => {
    // Saved with Apple, Google or a number verified on the phone page: the seat is taken next.
    if (!issued || !saved || !focused) return;
    updateDraft((d) => ({ ...d, saved: true }));
    void seat.join();
    // Joins once the pass is saved and this page is the one in front.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issued, saved, focused]);

  return {
    session,
    draft,
    prefill,
    inviter,
    selected,
    toggle,
    guide,
    pickFace,
    missing: missingPassPart(draft),
    editing,
    openEdit: () => setEditing(true),
    closeEdit: () => setEditing(false),
    finishEdit: (next: { readonly name: string; readonly homeIata: string | null }) => {
      updateDraft((d) => ({ ...d, given_name: next.name, home_iata: next.homeIata }));
      setEditing(false);
    },
    issued,
    issue,
    save,
    saved,
    focused,
    seat,
  };
}
