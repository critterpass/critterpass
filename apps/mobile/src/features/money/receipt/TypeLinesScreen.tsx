/**
 * TYPE THE LINES, wired up: the typed lines, which one the keypad types into, who had each, and
 * the add (an expense with exact per-member amounts, queued offline like any other).
 */
import { generateUuidV7 } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { feedback } from '@/motion';
import { toast } from '@/motion/island-toast';

import { pressKey } from '../add-expense/draft';
import { addExpenseCommand } from '../data/commands';
import type { MoneyContext } from '../data/use-money-context';
import { MemberPicker } from './MemberPicker';
import type { ParsedReceipt } from './review-model';
import { TypeLinesEditor } from './TypeLinesEditor';
import { prefillLines, typedPayload, typedShares, type TypedLine } from './type-lines-model';

export function TypeLinesScreen({
  ctx,
  parsed,
}: {
  readonly ctx: MoneyContext;
  readonly parsed: ParsedReceipt | null;
  readonly receiptId: string | null;
}) {
  const { t } = useLingui();
  const add = useCommand(addExpenseCommand);
  const [lines, setLines] = useState<readonly TypedLine[]>(() => prefillLines(parsed));
  const [focus, setFocus] = useState<string | null>(lines[lines.length - 1]?.id ?? null);
  const [picker, setPicker] = useState<string | null>(null);
  const members = ctx.splitMembers;
  const ids = members.map((member) => member.userId);
  const currency =
    parsed?.currency ?? ctx.trip?.localCurrency ?? ctx.crew?.settlementCurrency ?? 'USD';
  const totalMinor = parsed?.total_minor == null ? null : BigInt(parsed.total_minor);
  const payerId = ctx.uid ?? '';
  const payerName = members.find((member) => member.userId === payerId)?.name ?? '';
  const update = (id: string, change: Partial<TypedLine>) =>
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...change } : line)));
  const canCommit = typedShares({ lines, currency, members: ids, payerId, totalMinor }) !== null;

  async function commit() {
    if (ctx.trip === null) return;
    const payload = typedPayload({
      lines,
      currency,
      members: ids,
      payerId,
      totalMinor,
      expenseId: generateUuidV7(),
      tripId: ctx.trip.id,
      fxSnapshotId: null,
      merchant: parsed?.merchant ?? null,
    });
    if (payload === null) return;
    const result = await add.send(payload);
    if (result.kind === 'rejected' || result.kind === 'unavailable') {
      feedback.emit('error');
      return;
    }
    feedback.emit('success');
    toast.show({
      id: 'money-typed',
      title: t({ id: 'money.typeLines.added', message: 'Split. Balances re-count.' }),
    });
    router.back();
  }

  const pickerLine = lines.find((line) => line.id === picker) ?? null;
  return (
    <>
      <TypeLinesEditor
        lines={lines}
        currency={currency}
        totalMinor={totalMinor}
        focus={focus}
        whoLabel={(line) =>
          line.assignees === null
            ? t({ id: 'money.typeLines.everyone', message: 'Everyone had it' })
            : members
                .filter((member) => line.assignees?.includes(member.userId))
                .map((member) => member.name)
                .join(', ')
        }
        payerName={payerName}
        canCommit={canCommit}
        committing={add.pending}
        onFocus={setFocus}
        onLabel={(id, label) => update(id, { label })}
        onKey={(key) => {
          if (focus === null) return;
          const line = lines.find((candidate) => candidate.id === focus);
          if (line !== undefined) update(focus, { digits: pressKey(line.digits, key) });
        }}
        onWho={setPicker}
        onAddLine={() => {
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a local row id, not copy
          const id = `typed-${String(lines.length)}-${String(Date.now())}`;
          setLines((current) => [...current, { id, label: '', digits: '', assignees: null }]);
          setFocus(id);
        }}
        onCommit={() => void commit()}
      />
      {pickerLine === null ? null : (
        <MemberPicker
          title={
            pickerLine.label === ''
              ? t({ id: 'money.typeLines.who', message: 'Who had it?' })
              : pickerLine.label
          }
          members={members}
          selected={pickerLine.assignees}
          onDone={(next) => {
            update(pickerLine.id, { assignees: next });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
