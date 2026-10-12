/**
 * All days (4.28) in the premium look: every day as a card in two columns (its date in the day's
 * colour with its pace, its stops as numbered pins in that colour, its title and what it holds),
 * the plan check's line with See, and the saved ideas still waiting. A card opens its day; holding
 * a card offers "Move a stop" to another day, which the shared screen previews before moving.
 */
/* eslint-disable lingui/no-unlocalized-strings -- screen ids and SF Symbol names, never copy. */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { GuideNote, PressableScale, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { AllDaysViewProps } from '../../all-days/all-days-view';
import { clock } from '../../day/format';
import { dateLine } from '../../trip-map/format';
import { checkingLine, daySummary, tripCheckLine } from '../../trip-map/sheet-copy';
import { useWayOut } from '../../trip-map/use-ways-out';
import { dayColours } from '../map';

const PINS = 6;
const PACE = 5;

export function PremiumAllDaysView(props: AllDaysViewProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
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
          {model.days.map((day) => {
            const colours = dayColours(day.dayNo);
            const pace = Math.max(0, Math.min(PACE, Math.round(day.pace)));
            return (
              <PressableScale
                key={day.dayNo}
                onPress={() => props.onOpenDay(day.dayNo)}
                onLongPress={model.readOnly ? undefined : () => props.onMoveMenu(day.dayNo)}
                accessibilityRole="button"
                accessibilityLabel={`${day.date === null ? '' : dateLine(locale, day.date)} ${day.theme ?? ''}`}
                testID={`all-days-card-${String(day.dayNo)}`}
                style={{
                  width: '48.5%',
                  minHeight: 150,
                  borderRadius: theme.radius.banner,
                  backgroundColor: theme.color.card,
                  boxShadow: theme.shadow.card,
                  paddingVertical: theme.space.gap10,
                  paddingHorizontal: theme.space.gap12,
                  gap: theme.space.gap6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text variant="badge" color={colours.ink} style={{ flex: 1 }} numberOfLines={1}>
                    {day.date === null ? String(day.dayNo) : dateLine(locale, day.date)}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {Array.from({ length: PACE }, (_, at) => (
                      <View
                        key={at}
                        style={{
                          width: 5,
                          height: 10,
                          borderRadius: 2,
                          backgroundColor: at < pace ? colours.fill : theme.color.fieldBorder,
                        }}
                      />
                    ))}
                  </View>
                </View>
                <View
                  style={{
                    height: 52,
                    borderRadius: theme.radius.dayBadge,
                    backgroundColor: theme.color.ground,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: theme.space.gap8,
                  }}
                >
                  {day.stops.slice(0, PINS).map((stop, index) => (
                    <View
                      key={stop.stableId}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 1.5,
                        borderColor: theme.accent.stickerEdge,
                        backgroundColor: colours.route,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text variant="badge" tone="onInk">
                        {String(index + 1)}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text variant="rowTextStrong" numberOfLines={1}>
                  {day.theme ?? t({ id: 'plan.premium.allDays.dayN', message: `Day ${day.dayNo}` })}
                </Text>
                <Text variant="captionMuted" tone="muted" numberOfLines={2}>
                  {daySummary(day, (minutes) => clock(locale, minutes))}
                </Text>
              </PressableScale>
            );
          })}
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
            {t({ id: 'plan.premium.allDays.hint', message: 'Hold a day to move one of its stops' })}
          </Text>
        )}
      </ScrollView>
    </PushScreen>
  );
}
