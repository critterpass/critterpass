/**
 * The draft's must-dos (4.22, 4.23): all made it on a green strip with the owners' faces, or how
 * many did and, for each one that didn't fit, why and its fix (pick the place, or change a day).
 */
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Button, CrewStack, Text, usePremiumTheme } from '@/ui/premium';
import { crewColour } from '@/features/vote';

import { missAction, why, type MissedMustDo } from '../../draft/review/review-words';
import type { ReviewModel } from '../../draft/data/version';

type Person = ReviewModel['mustDos']['owners'][number];

export const faces = (people: readonly Person[]) =>
  people.map((person) => ({
    id: person.uid,
    name: person.name,
    color: crewColour(person.joinIndex),
  }));

export function DraftCoverage(props: {
  readonly model: ReviewModel['mustDos'];
  readonly onFixMiss?: ((miss: MissedMustDo) => void) | undefined;
}) {
  const theme = usePremiumTheme();
  const { total, made, missing } = props.model;
  const all = missing.length === 0;
  const model = { mustDos: props.model };
  if (total === 0) return null;
  return (
    <View
      testID="draft-coverage"
      style={{
        borderRadius: all ? 14 : theme.radius.cardLarge,
        backgroundColor: all ? theme.color.status.booked.bg : theme.color.card,
        ...(all ? {} : { boxShadow: theme.shadow.card }),
        padding: all ? theme.space.gap10 : theme.space.gap16,
        gap: theme.space.gap10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap10 }}>
        <Text
          variant={all ? 'label' : 'title'}
          color={all ? theme.color.status.booked.text : theme.color.ink}
          style={{ flex: 1 }}
        >
          {all
            ? t({
                id: 'planDraft.coverage.all',
                message: plural(total, {
                  one: 'Your must-do made it',
                  other: 'All # must-dos made it',
                }),
              })
            : t({
                id: 'planDraft.coverage.some',
                message: plural(total, {
                  one: `${made} of # must-do made it`,
                  other: `${made} of # must-dos made it`,
                }),
              })}
        </Text>
        <CrewStack
          members={faces(model.mustDos.owners)}
          size={22}
          accessibilityLabel={model.mustDos.owners.map((p) => p.name).join(', ')}
        />
      </View>
      {missing.map((miss, index) => {
        const action = props.onFixMiss === undefined ? null : missAction(miss.reason);
        const title = miss.title;
        const owner = miss.owner?.name ?? '';
        const reason = why(miss.reason);
        return (
          <View
            key={`${title}-${String(index)}`}
            style={{
              borderRadius: theme.radius.card,
              backgroundColor: theme.color.destructive.bg,
              padding: theme.space.gap12,
              gap: theme.space.gap8,
            }}
          >
            <Text variant="badge" color={theme.color.destructive.text}>
              {t({
                id: 'plan.premium.draft.missed',
                message: 'Didn’t fit',
              }).toLocaleUpperCase()}
            </Text>
            <Text variant="rowTextStrong">
              {t({
                id: 'planDraft.coverage.missing',
                message: `${title} (${owner}): ${reason}`,
              })}
            </Text>
            {action === null ? null : (
              <View style={{ flexDirection: 'row' }}>
                <Button
                  alignSelf="auto"
                  size="small"
                  label={
                    action === 'pick_place'
                      ? t({ id: 'planDraft.coverage.pickPlace', message: 'Pick the place' })
                      : t({
                          id: 'planDraft.coverage.fitIn',
                          message: 'Change a day to fit it',
                        })
                  }
                  onPress={() => props.onFixMiss?.(miss)}
                  testID={`draft-miss-fix-${String(index)}`}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
