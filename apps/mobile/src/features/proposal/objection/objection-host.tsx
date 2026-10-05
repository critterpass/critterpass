/**
 * NOT SURE YET wired to the phone: the private reason goes to the server and comes back as the
 * options the cost engine decided; "ask me later" schedules the guide's nudge for a time before
 * the answer is due and says when.
 */
import type { PrivateReason } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { toast } from '@/motion';

import {
  choosePrivateOptionCommand,
  scheduleFollowupCommand,
  submitPrivateReasonCommand,
} from '../data/commands';
import {
  ObjectionSheetView,
  type ObjectionAnswer,
  type ObjectionSheetProps,
} from './objection-sheet';
import { followUpAt, parseOptions, type FollowUp } from './options';

function laterDone(later: FollowUp): string {
  switch (later.when) {
    case 'tonight':
      return t({ id: 'proposal.objection.laterDoneTonight', message: 'I’ll ask you tonight' });
    case 'tomorrow':
      return t({
        id: 'proposal.objection.laterDoneTomorrow',
        message: 'I’ll ask you tomorrow morning',
      });
    case 'sunday':
      return t({ id: 'proposal.objection.laterDone', message: 'I’ll ask you on Sunday' });
  }
}

export function ObjectionSheet(props: ObjectionSheetProps) {
  const submit = useCommand(submitPrivateReasonCommand);
  const choose = useCommand(choosePrivateOptionCommand);
  const followup = useCommand(scheduleFollowupCommand);
  const [reason, setReason] = useState<PrivateReason | null>(null);
  const [answer, setAnswer] = useState<ObjectionAnswer | null>(null);
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [failed, setFailed] = useState(false);
  const [later] = useState(() => followUpAt(new Date(), props.replyBy));

  const pick = async (next: PrivateReason) => {
    setReason(next);
    setAnswer(null);
    setChosen([]);
    setFailed(false);
    const result = await submit.send({ proposal_id: props.proposalId, reason: next });
    if (result.kind === 'applied') setAnswer(parseOptions(result.result));
    else setFailed(true);
  };

  return (
    <ObjectionSheetView
      {...props}
      reason={reason}
      answer={answer}
      chosen={chosen}
      pending={submit.pending}
      failed={failed}
      later={later}
      onReason={(next) => void pick(next)}
      onToggle={(id, on) => setChosen(on ? [...chosen, id] : chosen.filter((c) => c !== id))}
      onAskCrew={(threadId, optionId) => {
        void choose.send({ thread_id: threadId, option_id: optionId });
        toast.show({
          id: 'proposal-asked-crew',
          title: t({ id: 'proposal.objection.asked', message: 'Asked without your name' }),
        });
      }}
      onLater={() => {
        if (later === null) return;
        void followup.send({
          proposal_id: props.proposalId,
          at_local: later.atLocal,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        toast.show({ id: 'proposal-followup', title: laterDone(later) });
        props.onClose();
      }}
    />
  );
}
