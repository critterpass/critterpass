/**
 * Crew can't agree (4.38): "The crew is split 2–2" over the stance bar (want it in pink from the
 * left, rather not in blue from the right, faces under each end, who hasn't said), your own side
 * while you haven't said (want it / rather not, with a line), what each side said, the guide's two
 * ways nobody loses (pick one), and the foot: suggest the picked one, or put it to a vote; once
 * posted, the way into the crew chat. Reads and commands are `useSplit`'s.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { crewColour } from '@/features/vote';
import {
  Button,
  CrewStack,
  GuideNote,
  ListCard,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useSplit } from '../../split/use-split';

type Member = { readonly key: string; readonly name: string; readonly joinIndex: number };
const faces = (people: readonly Member[]) =>
  people.map((person) => ({
    id: person.key,
    name: person.name,
    color: crewColour(person.joinIndex),
  }));

export function SplitPage({
  tripId,
  placeId,
}: {
  readonly tripId: string;
  readonly placeId: string;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const { view, picker } = useSplit({ tripId, placeId });
  const [note, setNote] = useState('');
  const total = view.want.length + view.ratherNot.length;
  const wantShare = total === 0 ? 0 : view.want.length / Math.max(total, 1);
  const notShare = total === 0 ? 0 : view.ratherNot.length / Math.max(total, 1);
  const notes = [
    ...view.wantNotes.map((entry) => ({ ...entry, side: 'want' as const })),
    ...view.ratherNotNotes.map((entry) => ({ ...entry, side: 'not' as const })),
  ];
  return (
    <PushScreen
      title={view.name}
      backLabel={t({ id: 'explore.premium.back', message: 'Back' })}
      scroll={false}
      testID="split"
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: theme.space.gap16, gap: theme.space.gap16 }}
        >
          <Text
            variant="display"
            accessibilityRole="header"
            style={{ paddingHorizontal: theme.space.gap8 }}
          >
            {view.splitLabel}
          </Text>
          <View style={{ gap: theme.space.gap6 }} testID="split-stances">
            <View style={{ flexDirection: 'row' }}>
              <Text variant="badge" color={theme.color.destructive.text} style={{ flex: 1 }}>
                {t({ id: 'explore.premium.split.want', message: 'Want it' }).toLocaleUpperCase()}
              </Text>
              <Text variant="badge" color={theme.color.status.rain.text}>
                {t({ id: 'explore.premium.split.not', message: 'Rather not' }).toLocaleUpperCase()}
              </Text>
            </View>
            <View
              style={{
                height: 14,
                borderRadius: 7,
                backgroundColor: theme.color.controlDisabled,
                overflow: 'hidden',
                flexDirection: 'row',
              }}
            >
              <View style={{ flex: wantShare, backgroundColor: theme.accent.pink }} />
              <View style={{ flex: Math.max(0, 1 - wantShare - notShare) }} />
              <View style={{ flex: notShare, backgroundColor: theme.accent.sky }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <CrewStack
                members={faces(view.want)}
                size={28}
                accessibilityLabel={view.want.map((m) => m.name).join(', ')}
              />
              <Text variant="captionMuted" tone="muted" align="center" style={{ flex: 1 }}>
                {view.silent ?? ''}
              </Text>
              <CrewStack
                members={faces(view.ratherNot)}
                size={28}
                accessibilityLabel={view.ratherNot.map((m) => m.name).join(', ')}
              />
            </View>
          </View>
          {picker.mine === null ? (
            <ListCard>
              <View
                style={{ padding: theme.space.rowPadH, gap: theme.space.gap8 }}
                testID="split-your-side"
              >
                <Text variant="label" tone="muted">
                  {t({ id: 'explore.premium.split.yourSide', message: 'Your side' })}
                </Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder={t({
                    id: 'explore.premium.split.note',
                    message: 'A line for the crew (optional)',
                  })}
                  placeholderTextColor={theme.color.placeholder}
                  selectionColor={theme.color.caret}
                  maxLength={140}
                  style={[theme.type.field, { color: theme.color.ink, minHeight: 40 }]}
                />
                <View style={{ flexDirection: 'row', gap: theme.space.gap8 }}>
                  <Button
                    alignSelf="auto"
                    size="small"
                    label={t({ id: 'explore.premium.split.wantIt', message: 'Want it' })}
                    onPress={() => picker.onSay('want', note.trim() === '' ? null : note.trim())}
                    loading={picker.busy}
                    testID="split-say-want"
                  />
                  <Button
                    alignSelf="auto"
                    size="small"
                    variant="control"
                    label={t({ id: 'explore.premium.split.ratherNot', message: 'Rather not' })}
                    onPress={() =>
                      // eslint-disable-next-line lingui/no-unlocalized-strings -- a stance key, never copy.
                      picker.onSay('rather_not', note.trim() === '' ? null : note.trim())
                    }
                    testID="split-say-not"
                  />
                </View>
              </View>
            </ListCard>
          ) : (
            <TextButton
              label={t({ id: 'explore.premium.split.change', message: 'Change my side' })}
              onPress={picker.onClear}
              testID="split-clear"
            />
          )}
          {notes.length === 0 ? null : (
            <ListCard>
              {notes.map((entry) => (
                <View
                  key={entry.member.key}
                  style={{
                    flexDirection: 'row',
                    gap: theme.space.gap10,
                    padding: theme.space.gap12,
                  }}
                >
                  <CrewStack
                    members={faces([entry.member])}
                    size={30}
                    accessibilityLabel={entry.member.name}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      variant="badge"
                      color={
                        entry.side === 'want'
                          ? theme.color.destructive.text
                          : theme.color.status.rain.text
                      }
                    >
                      {entry.member.name}
                    </Text>
                    <Text variant="rowText">{entry.note}</Text>
                  </View>
                </View>
              ))}
            </ListCard>
          )}
          <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap8 }}>
            {t({ id: 'explore.premium.split.ways', message: 'Two ways nobody loses' })}
          </Text>
          {view.optionsNote === null ? null : (
            <GuideNote name={view.guide.name} critter={view.guide.kind} text={view.optionsNote} />
          )}
          {view.options.map((option, index) => {
            const on = index === view.chosen;
            return (
              <PressableScale
                key={option.title}
                onPress={() => view.onChoose(index)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                testID={`split-option-${String(index)}`}
                style={{
                  borderRadius: theme.radius.banner,
                  backgroundColor: theme.color.card,
                  borderWidth: on ? 2.5 : 0.5,
                  borderColor: on ? theme.color.ink : theme.color.hairline,
                  paddingVertical: theme.space.gap12,
                  paddingHorizontal: theme.space.rowPadH,
                  gap: theme.space.gap4,
                }}
              >
                <Text variant="rowTitle">{option.title}</Text>
                <Text variant="caption" tone="muted">
                  {option.body}
                </Text>
                {option.tags.length === 0 ? null : (
                  <Text variant="badge" tone="inkSecondary">
                    {option.tags.join(' · ')}
                  </Text>
                )}
              </PressableScale>
            );
          })}
        </ScrollView>
        <View
          style={{
            paddingHorizontal: theme.space.titleGutter,
            paddingBottom: theme.space.gap16,
            gap: theme.space.gap4,
            alignItems: 'center',
          }}
        >
          {view.chat !== undefined ? (
            <View style={{ alignSelf: 'stretch' }}>
              <Button label={view.chat.label} onPress={view.chat.onPress} testID="split-chat" />
            </View>
          ) : (
            <>
              {view.suggest === null ? null : (
                <View style={{ alignSelf: 'stretch' }}>
                  <Button
                    label={view.suggest.label}
                    onPress={view.suggest.onPress}
                    loading={view.posting}
                    testID="split-suggest"
                  />
                </View>
              )}
              {view.vote === null ? null : (
                <TextButton
                  align="center"
                  label={view.vote.label}
                  onPress={view.vote.onPress}
                  testID="split-vote"
                />
              )}
            </>
          )}
        </View>
      </View>
    </PushScreen>
  );
}
