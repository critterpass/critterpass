/**
 * The rooms setup step in the premium look (undesigned: the design moves rooms to after booking,
 * and the wallet's rooms pages carry that; this page keeps the setup step usable in the same kit):
 * the checklist pill, "Who sleeps where?" with the guide's line, then by phase the stay options as
 * option cards, the plan with tap-to-move, or the guide saying rooms come with a stay; the price
 * per person in the guide's note, a member's room wishes, and Looks good / Skip rooms, or Ask to
 * swap. The shared `RoomsStep` holds the plan, the queued moves and every command.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import {
  Button,
  GuideNote,
  Icon,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import { money } from '../../budget/model';
import { chipName, stayName } from '../../rooms/copy';
import { ROOM_CHIP_KEYS } from '../../rooms/member-tools';
import { fractionDigits } from '../../rooms/price-line';
import type { RoomsViewProps } from '../../rooms/rooms-view';
import { roomsWords } from '../../rooms/rooms-words';
import { PremiumRoomsPlan } from './rooms-plan-cards';
import { ChecklistPill, StepHeadline, StepPage } from './step-parts';

export function PremiumRoomsView({ trip, model, actions }: RoomsViewProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const words = roomsWords(trip, model);
  const sticker = guideSticker(trip.guide);
  const guide = sticker.name;
  const organiser = words.organiserName;
  const plan = model.plan;
  const whole = (amount: number, currency: string) =>
    money(locale, amount * 10 ** fractionDigits(currency), currency);
  const price =
    words.phase !== 'plan' || model.price === null || model.currency === null
      ? null
      : (() => {
          const { low, high, mine } = model.price;
          const currency = model.currency;
          if (!words.editable && mine !== null)
            return t({
              id: 'setup.premium.rooms.priceMine',
              message: `Your share of the rooms: ${whole(mine, currency)}`,
            });
          if (words.solo)
            return t({
              id: 'setup.premium.rooms.priceSolo',
              message: `Your stay comes to ${whole(low, currency)}`,
            });
          return low === high
            ? t({
                id: 'setup.premium.rooms.priceEach',
                message: `Every room splits the same way: ${whole(low, currency)} each.`,
              })
            : t({
                id: 'setup.premium.rooms.priceRange',
                message: `Bigger rooms cost their people a bit more: ${whole(low, currency)} to ${whole(high, currency)} each.`,
              });
        })();

  const footer = words.editable ? (
    <>
      <View style={{ alignSelf: 'stretch' }}>
        <Button
          label={t({ id: 'setup.rooms.lock', message: 'Looks good' })}
          onPress={words.acceptsEvenSplit ? actions.onSkip : actions.onLock}
          disabled={!words.acceptsEvenSplit && (plan === null || model.stayUnavailable)}
          loading={model.locking}
          testID="setup-rooms-lock"
        />
      </View>
      {model.skippable && !words.acceptsEvenSplit ? (
        <TextButton
          label={t({ id: 'setup.rooms.skip', message: 'Skip rooms' })}
          onPress={actions.onSkip}
          testID="setup-rooms-skip"
        />
      ) : null}
    </>
  ) : words.phase === 'plan' ? (
    model.swapAsked ? (
      <Text variant="caption" color={theme.color.status.booked.text} testID="setup-rooms-swap-sent">
        {t({
          id: 'setup.rooms.swapSent',
          message: `Asked ${organiser} for a swap.`,
        })}
      </Text>
    ) : (
      <View style={{ alignSelf: 'stretch' }}>
        <Button
          variant="secondary"
          label={t({ id: 'setup.rooms.askSwap', message: 'Ask to swap' })}
          onPress={actions.onAskSwap}
          testID="setup-rooms-ask-swap"
        />
      </View>
    )
  ) : undefined;

  return (
    <StepPage
      title={t({ id: 'setup.premium.title', message: `${trip.destinationName} setup` })}
      footer={footer}
      testID="setup-rooms"
    >
      <ChecklistPill
        row="rooms"
        done={plan?.locked === true}
        trailing={t({ id: 'setup.premium.rooms.anyOrder', message: 'Any order' })}
      />
      <StepHeadline title={words.title} line={words.line} />
      {words.notice === null ? null : (
        <Text
          variant="caption"
          color={theme.color.status.voteOpen.text}
          testID="setup-rooms-notice"
        >
          {words.notice}
        </Text>
      )}
      {words.phase === 'pick_stay' ? (
        <View style={{ gap: theme.space.gap8 }} testID="setup-rooms-stays">
          {model.stays.map((stay) => {
            const estimate = stay.text;
            const code = stay.quotedIn ?? null;
            return (
              <PressableScale
                key={stay.type}
                onPress={() => actions.onPickStay(stay.type)}
                accessibilityRole="button"
                testID={`setup-rooms-stay-option-${stay.type}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.gap12,
                  borderRadius: theme.radius.card,
                  backgroundColor: theme.color.card,
                  boxShadow: theme.shadow.card,
                  paddingVertical: theme.space.gap12,
                  paddingHorizontal: theme.space.rowPadH,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="rowTitle">{stayName(stay.type)}</Text>
                  <Text variant="captionMuted" tone="muted">
                    {code === null
                      ? t({
                          id: 'setup.rooms.estimate',
                          message: `About ${estimate} a room a night, estimate`,
                        })
                      : t({
                          id: 'setup.rooms.estimateQuoted',
                          message: `About ${estimate} a room a night, estimate in ${code}`,
                        })}
                  </Text>
                </View>
                <Icon name="forward" size={16} color={theme.color.placeholder} />
              </PressableScale>
            );
          })}
        </View>
      ) : null}
      {words.phase === 'no_stays' ? (
        <GuideNote
          name={guide}
          critter={sticker.kind}
          text={t({
            id: 'setup.rooms.noStaysLine',
            message: `Once a stay is booked, ${guide} splits the rooms. Until then everyone shares evenly.`,
          })}
          testID="setup-rooms-even"
        />
      ) : null}
      {words.phase === 'plan' && plan !== null ? (
        <PremiumRoomsPlan
          plan={plan}
          members={trip.members}
          me={trip.me}
          tripStart={trip.startDate}
          editable={words.editable}
          actions={actions}
        />
      ) : null}
      {model.skippable && words.editable && words.phase !== 'no_stays' ? (
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: theme.space.gap8 }}>
          {words.solo
            ? t({ id: 'setup.rooms.soloSkip', message: 'You can also go on without picking one.' })
            : t({
                id: 'setup.rooms.evenSplit',
                message:
                  'One room for everyone, so the stay splits evenly. You can skip this step.',
              })}
        </Text>
      ) : null}
      {price === null ? null : (
        <GuideNote name={guide} critter={sticker.kind} text={price} testID="setup-rooms-price" />
      )}
      {!words.editable && trip.startDate !== null ? (
        <View style={{ gap: theme.space.gap8 }} testID="setup-rooms-member-tools">
          <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap8 }}>
            {t({ id: 'setup.rooms.wishes', message: 'Your room wishes' })}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap8 }}>
            {ROOM_CHIP_KEYS.map((chip) => {
              const on = model.myChips.includes(chip);
              return (
                <Button
                  key={chip}
                  size="small"
                  variant={on ? 'primary' : 'control'}
                  label={chipName(chip)}
                  onPress={() => actions.onToggleChip(chip)}
                  testID={`setup-rooms-chip-${chip}`}
                />
              );
            })}
          </View>
          {model.myChips.length === 0 ? (
            <Text variant="caption" tone="muted" testID="setup-rooms-no-wishes">
              {t({
                id: 'setup.rooms.wishesMissing',
                message: 'Pick any that fit you. Nobody sees them; they only shape the rooms.',
              })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </StepPage>
  );
}
