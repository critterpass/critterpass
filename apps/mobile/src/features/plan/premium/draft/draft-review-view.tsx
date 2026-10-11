/**
 * The guide's draft (4.22, 4.23) in the premium look, seen only by the organiser: "Pon's draft" with
 * the dates and the cost each, the must-dos (all made it, or how many and what each missed with its
 * fix), what changed in setup since, each day as a coloured tile with its stops, the stays, and the
 * foot: "Build the proposal" and asking the guide to change a day (with the redrafts left).
 */
import { plural, t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { format } from '@cp/i18n';

import { displayWithHome, useMoneyDisplay } from '@/data/money';
import { guideSticker } from '@/ui/avatar/guides';
import {
  Button,
  CritterSticker,
  CrewStack,
  GuideNote,
  Icon,
  ListCard,
  OfflinePill,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';
import { crewColour } from '@/features/vote';

import { estimateMinor, estimateMoney, overBudgetMinor, wholeMoney } from '../../draft/data/format';
import { counterLine } from '../../draft/data/quota-copy';
import { missAction, why } from '../../draft/review/coverage-strip';
import { dayDetail } from '../../draft/review/draft-day-row';
import type { DraftReviewViewProps } from '../../draft/review/draft-review-view';
import { changeWord } from '../../draft/review/stale-banner';
import { dayColours } from '../map';

type Person = DraftReviewViewProps['model']['mustDos']['owners'][number];
const faces = (people: readonly Person[]) =>
  people.map((person) => ({
    id: person.uid,
    name: person.name,
    color: crewColour(person.joinIndex),
  }));

export function PremiumDraftReviewView(props: DraftReviewViewProps) {
  const { model, locale, quota, openRedraft } = props;
  useMoneyDisplay();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const info = guideSticker(props.guide);
  const guideName = info.name;
  const dates = props.dates;
  const cost = displayWithHome(
    estimateMoney(locale, model.costPpMinor, model.currency),
    estimateMinor(model.costPpMinor, model.currency),
    model.currency,
    locale,
  );
  const overBy = overBudgetMinor(model.costPpMinor, model.overByMinor, model.currency);
  const counter = counterLine(quota);
  const { total, made, missing } = model.mustDos;
  const all = missing.length === 0;
  return (
    <PushScreen
      title={t({ id: 'planDraft.review.title', message: `${guideName}’s draft` })}
      subtitle={t({ id: 'planDraft.onlyYou', message: 'Only you see this' })}
      backLabel={t({ id: 'plan.premium.draft.back', message: 'Back' })}
      scroll={false}
      testID="draft-review"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: theme.space.gap16,
          paddingTop: theme.space.gap8,
          paddingBottom: theme.space.gap16,
          gap: theme.space.gap12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap12 }}>
          <Text variant="body" tone="muted" style={{ flex: 1 }} testID="draft-sub">
            {model.costPpMinor > 0
              ? t({
                  id: 'planDraft.review.sub',
                  message: `${dates}, ${cost} each. Fix anything before the crew sees it.`,
                })
              : t({
                  id: 'planDraft.review.subNoCost',
                  message: `${dates}. No cost estimate yet. Fix anything before the crew sees it.`,
                })}
          </Text>
          <CritterSticker kind={info.kind} name={guideName} size={70} />
        </View>
        {props.offline ? <OfflinePill /> : null}
        {openRedraft === null ? null : (
          <GuideNote
            name={guideName}
            critter={info.kind}
            showName={false}
            text={
              openRedraft.ready
                ? openRedraft.dayNo === null
                  ? t({ id: 'planDraft.review.redraftReady', message: 'Your redraft is ready.' })
                  : t({
                      id: 'planDraft.review.redraftReadyDay',
                      message: `Day ${openRedraft.dayNo}, redrafted, is ready.`,
                    })
                : t({
                    id: 'planDraft.review.redrafting',
                    message: `${guideName} is redrafting a day.`,
                  })
            }
            action={{
              label: t({ id: 'planDraft.review.redraftOpen', message: 'Open' }),
              onPress: props.onOpenRedraft,
            }}
            testID="draft-open-redraft"
          />
        )}
        {model.stale.length === 0 ? null : (
          <GuideNote
            name={guideName}
            critter={info.kind}
            showName={false}
            text={t({
              id: 'plan.premium.draft.stale',
              message: `Setup changed since this draft: ${format.list(locale, model.stale.map(changeWord))}.`,
            })}
            action={{
              label: t({ id: 'planDraft.stale.cta', message: 'Redraft affected days' }),
              onPress: () => props.onChangeDay(model.lateMustDo),
            }}
            testID="draft-stale"
          />
        )}
        {total === 0 ? null : (
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
        )}
        {overBy > 0 ? (
          <Text variant="label" color={theme.color.destructive.text} testID="draft-over-budget">
            {t({
              id: 'plan.premium.draft.over',
              message: `${wholeMoney(locale, overBy, model.currency)} over the sweet spot each`,
            })}
          </Text>
        ) : null}
        <ListCard>
          {model.days.map((day) => (
            <PressableScale
              key={day.dayNo}
              onPress={
                props.onOpenDay === undefined ? undefined : () => props.onOpenDay?.(day.dayNo)
              }
              disabled={props.onOpenDay === undefined}
              accessibilityRole="button"
              accessibilityLabel={`${day.title}. ${dayDetail(locale, day)}`}
              testID={`draft-day-${String(day.dayNo)}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap12,
                paddingVertical: 7,
                paddingStart: theme.space.gap10,
                paddingEnd: theme.space.rowPadH,
              }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  backgroundColor:
                    day.stops.length === 0 ? theme.color.control : dayColours(day.dayNo).fill,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="rowTextStrong" color={theme.color.onAccent}>
                  {String(day.dayNo)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="rowTextStrong" numberOfLines={1}>
                  {day.title}
                </Text>
                <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                  {dayDetail(locale, day)}
                </Text>
              </View>
              {day.owners.length === 0 ? null : (
                <CrewStack
                  members={faces(day.owners)}
                  size={22}
                  max={2}
                  accessibilityLabel={day.owners.map((p) => p.name).join(', ')}
                />
              )}
              {day.closed ? (
                <Icon name="lock" size={14} color={theme.color.destructive.text} />
              ) : null}
            </PressableScale>
          ))}
        </ListCard>
        {props.hasHistory ? (
          <TextButton
            label={t({ id: 'planDraft.review.history', message: 'Earlier drafts' })}
            onPress={props.onHistory}
            testID="draft-history-open"
          />
        ) : null}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: theme.space.titleGutter,
          paddingTop: theme.space.gap8,
          paddingBottom: insets.bottom + theme.space.gap12,
          gap: theme.space.gap4,
          alignItems: 'center',
        }}
      >
        <View style={{ alignSelf: 'stretch' }}>
          <Button
            label={t({ id: 'planDraft.review.propose', message: 'Build the proposal' })}
            onPress={() => props.onPropose?.()}
            disabled={props.onPropose === undefined}
            testID="draft-propose"
          />
        </View>
        <TextButton
          label={t({
            id: 'planDraft.review.changeDay',
            message: `Ask ${guideName} to change a day`,
          })}
          onPress={() => props.onChangeDay(false)}
          disabled={openRedraft !== null}
          testID="draft-change-day"
        />
        {counter === null ? null : (
          <Text variant="caption" tone="placeholder" testID="draft-counter">
            {counter}
          </Text>
        )}
      </View>
    </PushScreen>
  );
}
