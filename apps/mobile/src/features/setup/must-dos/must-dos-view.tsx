/**
 * The must-dos step (3c-7), as a pure view: every member's must-do with its fit, who is typing one
 * now, the guide's summary under the list, and the step's actions. The organiser drafts the trip
 * once at least one is in; everyone adds their own (the add sheet). Once setup is done the chips
 * all show a check and the organiser keeps one button: the way to the drafting wait while the
 * draft is being written, and to the draft once it is ready.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { GuideLine } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';
import { makeStyles } from '@/ui/theme';

import type { SetupTrip } from '../data/setup-trip';
import type { ShellFrame } from '../shell/frame';
import { DoneTag } from '../shell/header-tag';
import { SetupShell } from '../shell/setup-shell';
import { stepTitle } from '../shell/stepper';
import { summaryLine } from './lines';
import type { MustDoItem, MustDosModel } from './model';
import { MustDoRow } from './must-do-row';
import { TypingRow } from './typing-row';

export interface MustDosViewProps {
  readonly trip: SetupTrip;
  readonly shell: ShellFrame;
  readonly model: MustDosModel;
  /** The member may add another (under the per-member cap). */
  readonly canAdd: boolean;
  readonly drafting?: boolean;
  /**
   * Where the organiser's draft stands once setup is done: still being written, or ready to read.
   * Null when there is nothing to open (a member, or a trip already past its draft).
   */
  readonly draft?: 'writing' | 'ready' | null;
  readonly onOpenDraft?: () => void;
  readonly onAdd: () => void;
  readonly onDraft: () => void;
  readonly onRemove: (item: MustDoItem) => void;
  readonly onRemind: (item: MustDoItem) => void;
}

const useStyles = makeStyles((th) => ({
  list: { gap: th.space['10'] },
  guide: { paddingTop: th.space['8'] },
}));

export function MustDosView({
  trip,
  shell,
  model,
  canAdd,
  drafting = false,
  draft = null,
  onOpenDraft,
  onAdd,
  onDraft,
  onRemove,
  onRemind,
}: MustDosViewProps) {
  const styles = useStyles();
  // Rows already listed when the step opened don't pop; rows that arrive later do.
  const [firstIds] = useState(() => new Set(model.items.map((item) => item.id)));
  const guide = GUIDE_STICKERS[trip.guide];
  const done = trip.step === 'done';
  const guideName = guide.name;
  const hasMine = model.mine.length > 0;
  const summary =
    model.items.length === 0
      ? t({
          id: 'setup.mustDos.line.empty',
          message: 'Nobody’s added one yet. Start with yours.',
        })
      : summaryLine(model.items, model.waiting.length, done);
  const addLabel = hasMine
    ? t({ id: 'setup.mustDos.addAnother', message: 'Add another' })
    : t({ id: 'setup.mustDos.addYours', message: 'Add your must-do' });
  const footer = done ? (
    draft === null || onOpenDraft === undefined ? undefined : (
      <PillButton
        label={
          draft === 'ready'
            ? t({ id: 'setup.mustDos.seeDraft', message: 'See the draft' })
            : t({
                id: 'setup.mustDos.draftWriting',
                message: `${guideName} is drafting. See how far`,
              })
        }
        onPress={onOpenDraft}
        testID={draft === 'ready' ? 'must-dos-see-draft' : 'must-dos-drafting'}
      />
    )
  ) : trip.isOrganiser ? (
    model.items.length === 0 && canAdd ? (
      // Nothing to draft from yet: adding one is the next thing to do, so it is the button.
      <PillButton label={addLabel} onPress={onAdd} testID="must-dos-add" />
    ) : (
      <>
        <PillButton
          label={t({ id: 'setup.mustDos.draft', message: 'Draft my trip' })}
          onPress={onDraft}
          disabled={model.items.length === 0}
          loading={drafting}
          testID="must-dos-draft"
        />
        {canAdd ? <TextLink label={addLabel} onPress={onAdd} testID="must-dos-add" /> : null}
      </>
    )
  ) : canAdd ? (
    <PillButton label={addLabel} onPress={onAdd} testID="must-dos-add" />
  ) : undefined;
  const doneLine =
    draft === 'ready'
      ? t({ id: 'setup.mustDos.readyLine', message: `${guideName}’s draft is ready for you.` })
      : draft === 'writing'
        ? t({
            id: 'setup.mustDos.writingLine',
            message: `${guideName} is writing the draft. It takes a few minutes; you can leave and come back.`,
          })
        : t({
            id: 'setup.mustDos.doneLine',
            message: `Setup’s done. ${guideName} starts the draft from here.`,
          });
  return (
    <SetupShell
      {...shell}
      testID="must-dos-screen"
      tag={<DoneTag label={stepTitle('rooms')} />}
      title={t({ id: 'setup.mustDos.title', message: 'Must-dos' })}
      line={
        done
          ? doneLine
          : t({
              id: 'setup.mustDos.line',
              message: 'What the trip isn’t complete without. Up to five each.',
            })
      }
      footer={footer}
    >
      <View style={styles.list} testID="must-dos-list">
        {model.items.map((item) => (
          <MustDoRow
            key={item.id}
            item={item}
            arriving={!firstIds.has(item.id)}
            onRemove={item.mine && !done ? () => onRemove(item) : undefined}
            onRemind={
              item.pill?.kind === 'lottery' && item.pill.closes !== null && !item.pending
                ? () => onRemind(item)
                : undefined
            }
          />
        ))}
        {model.typing.map((member) => (
          <TypingRow key={member.uid} member={member} />
        ))}
      </View>
      {summary === null ? null : (
        <View style={styles.guide}>
          <GuideLine
            guide={trip.guide}
            name={guide.name}
            line={summary}
            sticker={<Sticker kind={guide.kind} name={guide.name} size={44} />}
            testID="must-dos-guide-line"
          />
        </View>
      )}
    </SetupShell>
  );
}
