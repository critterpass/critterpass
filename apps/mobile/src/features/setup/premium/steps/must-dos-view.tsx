/**
 * The must-dos setup step in the premium look (undesigned as a page: the design stars must-dos in
 * Ideas, 4.40; this keeps the step from setup in the same kit): the checklist pill, "Must-dos" and
 * its line, every member's must-do as a row (owner faces, title, place or the guide's note, a check
 * for a plain fit or a fit tag; dashed while queued; your own opens Remove, a lottery opens Remind
 * me), who is typing one now, example places when the list is empty, the guide's summary, and the
 * step's actions. The shared `MustDosStep` holds the list, presence and every command.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { crewColour } from '@/features/vote';
import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  CrewStack,
  GuideNote,
  Icon,
  ListCard,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import { summaryLine } from '../../must-dos/lines';
import type { MustDosViewProps } from '../../must-dos/must-dos-props';
import { MustDoCard } from './must-do-card';
import { ChecklistPill, StepHeadline, StepPage } from './step-parts';

export function PremiumMustDosView(props: MustDosViewProps) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const { trip, model, canAdd, onAdd } = props;
  const drafting = props.drafting ?? false;
  const draft = props.draft ?? null;
  const examples = props.examples ?? [];
  const guide = guideSticker(trip.guide);
  const guideName = guide.name;
  const done = trip.step === 'done';
  const summary =
    model.items.length === 0
      ? t({ id: 'setup.mustDos.line.empty', message: 'Nobody’s added one yet. Start with yours.' })
      : summaryLine(model.items, model.waiting.length, done);
  const addLabel =
    model.mine.length > 0
      ? t({ id: 'setup.mustDos.addAnother', message: 'Add another' })
      : t({ id: 'setup.mustDos.addYours', message: 'Add your must-do' });
  const organiser = trip.members.find((member) => member.organiser)?.name ?? '';
  const doneLine =
    draft === 'planned'
      ? t({ id: 'setup.mustDos.plannedLine', message: 'Setup’s finished and the plan is made.' })
      : draft === 'ready'
        ? t({ id: 'setup.mustDos.readyLine', message: `${guideName}’s draft is ready for you.` })
        : draft === 'writing'
          ? t({
              id: 'setup.mustDos.writingLine',
              message: `${guideName} is writing the draft. It takes a few minutes; you can leave and come back.`,
            })
          : trip.isOrganiser || organiser === ''
            ? t({
                id: 'setup.mustDos.doneLine',
                message: `Setup’s done. ${guideName} starts the draft from here.`,
              })
            : t({
                id: 'setup.mustDos.doneLineMember',
                message: `Setup’s done. ${guideName} is drafting the trip with ${organiser}.`,
              });
  const primary = (label: string, onPress: () => void, testID: string, loading = false) => (
    <View style={{ alignSelf: 'stretch' }}>
      <Button label={label} onPress={onPress} loading={loading} testID={testID} />
    </View>
  );
  const footer = done ? (
    draft === null || props.onOpenDraft === undefined ? undefined : (
      primary(
        draft === 'planned'
          ? t({ id: 'setup.mustDos.seeTrip', message: 'See the trip' })
          : draft === 'ready'
            ? t({ id: 'setup.mustDos.seeDraft', message: 'See the draft' })
            : t({
                id: 'setup.mustDos.draftWriting',
                message: `${guideName} is drafting. See how far`,
              }),
        props.onOpenDraft,
        draft === 'planned'
          ? 'must-dos-see-trip'
          : draft === 'ready'
            ? 'must-dos-see-draft'
            : 'must-dos-drafting',
      )
    )
  ) : trip.isOrganiser ? (
    model.items.length === 0 && canAdd ? (
      <>
        {primary(addLabel, onAdd, 'must-dos-add')}
        {props.onDraftWithout === undefined || drafting ? null : (
          <TextButton
            label={t({ id: 'setup.mustDos.draftWithout', message: 'Draft without one' })}
            onPress={props.onDraftWithout}
            testID="must-dos-draft-without"
          />
        )}
      </>
    ) : (
      <>
        {primary(
          t({ id: 'setup.mustDos.draft', message: 'Draft my trip' }),
          props.onDraft,
          'must-dos-draft',
          drafting,
        )}
        {canAdd ? <TextButton label={addLabel} onPress={onAdd} testID="must-dos-add" /> : null}
      </>
    )
  ) : canAdd ? (
    primary(addLabel, onAdd, 'must-dos-add')
  ) : undefined;
  const onExample = props.onExample;

  return (
    <StepPage
      title={t({ id: 'setup.premium.title', message: `${trip.destinationName} setup` })}
      footer={footer}
      testID="must-dos-screen"
    >
      <ChecklistPill
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a checklist row key, never copy.
        row="must_dos"
        done={done}
        trailing={t({
          id: 'setup.premium.mustDos.count',
          message: `${model.items.length} in`,
        })}
      />
      <StepHeadline
        title={t({ id: 'setup.mustDos.title', message: 'Must-dos' })}
        line={
          done
            ? doneLine
            : t({
                id: 'setup.mustDos.line',
                message: 'What the trip isn’t complete without. Up to five each.',
              })
        }
      />
      <View style={{ gap: theme.space.gap8 }} testID="must-dos-list">
        {model.items.map((item) => (
          <MustDoCard
            key={item.id}
            item={item}
            onRemove={item.mine && !done ? () => props.onRemove(item) : undefined}
            onRemind={
              item.pill?.kind === 'lottery' && item.pill.closes !== null && !item.pending
                ? () => props.onRemind(item)
                : undefined
            }
          />
        ))}
        {model.typing.map((member) => (
          <View
            key={member.uid}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.gap10,
              borderRadius: theme.radius.banner,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: theme.color.fieldBorder,
              padding: theme.space.gap10,
            }}
          >
            <CrewStack
              members={[{ id: member.uid, name: member.name, color: crewColour(member.joinIndex) }]}
              size={26}
              accessibilityLabel={member.name}
            />
            <Text variant="caption" tone="muted">
              {t({ id: 'setup.premium.mustDos.typing', message: `${member.name} is typing…` })}
            </Text>
          </View>
        ))}
      </View>
      {model.items.length === 0 &&
      !done &&
      canAdd &&
      onExample !== undefined &&
      examples.length > 0 ? (
        <View style={{ gap: theme.space.gap8 }} testID="must-dos-examples">
          <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap8 }}>
            {t({ id: 'setup.mustDos.examples', message: 'For example' })}
          </Text>
          <ListCard>
            {examples.map((place, index) => {
              const name = place.name;
              return (
                <PressableScale
                  key={place.id}
                  onPress={() => onExample(place)}
                  accessibilityRole="button"
                  accessibilityLabel={t({
                    id: 'setup.mustDos.exampleA11y',
                    message: `Add ${name} as a must-do`,
                  })}
                  testID={`must-dos-example-${index}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space.gap12,
                    paddingVertical: theme.space.gap12,
                    paddingHorizontal: theme.space.rowPadH,
                  }}
                >
                  <Text variant="rowTitle" style={{ flex: 1 }}>
                    {name}
                  </Text>
                  <Icon name="plus" size={18} color={theme.color.ink} />
                </PressableScale>
              );
            })}
          </ListCard>
        </View>
      ) : null}
      {summary === null ? null : (
        <GuideNote
          name={guideName}
          critter={guide.kind}
          text={summary}
          testID="must-dos-guide-line"
        />
      )}
    </StepPage>
  );
}
