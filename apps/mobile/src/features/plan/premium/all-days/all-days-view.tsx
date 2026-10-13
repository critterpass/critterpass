/**
 * All days (4.28): every day as a card in two columns (its date in the day's
 * colour with its pace, its stops as numbered pins in that colour, its title and what it holds),
 * the plan check's line with See, and the saved ideas still waiting. A card opens its day; holding
 * a card offers "Move a stop" to another day, and a stop's pin drags onto another day's card. The
 * shared screen previews either move before making it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- screen ids and SF Symbol names, never copy. */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { GuideNote, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { AllDaysViewProps } from '../../all-days/all-days-props';
import { checkingLine, tripCheckLine } from '../../trip-map/sheet-copy';
import { useWayOut } from '../../trip-map/use-ways-out';
import { DayTile } from './day-tile';

export function PremiumAllDaysView(props: AllDaysViewProps) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const { model } = props;
  const see = useWayOut('7h-1', { tripId: model.tripId });
  const openIdeas = useWayOut('7f-2', { tripId: model.tripId });
  const checking = checkingLine(model.check);
  const line = tripCheckLine(model.check) ?? checking;
  const ideas = model.ideas.length;
  return (
    <PushScreen
      title={t({ id: 'plan.premium.allDays.title', message: 'All days' })}
      backLabel={t({ id: 'plan.allDays.back', message: 'Back' })}
      scroll={false}
      {...(model.draft
        ? {}
        : {
            action: {
              key: 'share',
              label: t({ id: 'plan.allDays.share', message: 'Share' }),
              sfSymbol: 'square.and.arrow.up',
              glyph: 'share' as const,
              onPress: props.onShare,
              testID: 'all-days-share',
            },
          })}
      testID="all-days"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: theme.space.gap16, gap: theme.space.gap12 }}
      >
        {line === null ? null : (
          <GuideNote
            name={model.guide.name}
            critter={guideSticker(model.guide.id).kind}
            text={line}
            {...(see === null
              ? {}
              : { action: { label: t({ id: 'plan.allDays.see', message: 'See' }), onPress: see } })}
            testID="all-days-check"
          />
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap10 }}>
          {model.days.map((day) => (
            <DayTile
              key={day.dayNo}
              day={day}
              over={props.over === day.dayNo}
              canMove={!model.readOnly}
              measureKey={props.measureKey}
              onOpen={() => props.onOpenDay(day.dayNo)}
              onMoveMenu={() => props.onMoveMenu(day.dayNo)}
              onRect={props.onRect}
              onHold={(stop) => props.onHold(stop, day.dayNo)}
              onDrag={props.onDrag}
              onDrop={props.onDrop}
            />
          ))}
        </View>
        {ideas === 0 ? null : (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: theme.space.gap8,
            }}
          >
            <Text variant="caption" tone="muted" style={{ flex: 1 }}>
              {t({
                id: 'plan.premium.allDays.ideas',
                message: plural(ideas, {
                  one: 'One saved place isn’t in a day yet',
                  other: '# saved places aren’t in a day yet',
                }),
              })}
            </Text>
            {openIdeas === null ? null : (
              <TextButton
                label={t({ id: 'plan.premium.allDays.ideasGo', message: 'Ideas ›' })}
                onPress={openIdeas}
                testID="all-days-ideas"
              />
            )}
          </View>
        )}
        {model.readOnly ? null : (
          <Text variant="captionMuted" tone="placeholder" align="center">
            {t({
              id: 'plan.premium.allDays.dragHint',
              message: 'Hold a stop and drag it onto another day, or hold a day to move one',
            })}
          </Text>
        )}
      </ScrollView>
    </PushScreen>
  );
}
