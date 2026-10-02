/**
 * The storm screen (3k-8) from props: the blue hero (what is coming, the numbers, the guide's
 * line), PICK ONE with the planner's options and the guide's pick, who has voted, and one button
 * that names the selected option. After the vote: what the crew chose and, for a booked seat, the
 * truthful state of the move (the booker's Confirm & pay, waiting on the booker, not confirmed).
 * The lab scenes render it with fixed data.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS, type GuideStickerId } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { RadioCard } from '@/ui/inputs/RadioCard';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import {
  chips,
  closesLine,
  ctaLabel,
  dayEyebrow,
  decidedLine,
  longDate,
  optionDetail,
  optionTitle,
  pickTag,
  seatLine,
  stormLines,
  tallyLine,
  votedLabel,
} from './copy';
import type { StormModel, StormOptionId } from './model';

export interface StormViewProps {
  readonly state: 'loading' | 'missing' | 'ready';
  readonly model: StormModel | null;
  /** The storm's title and the guide's line, in the reader's language. */
  readonly title: string;
  readonly line: string;
  readonly tz: string;
  readonly guide: GuideStickerId;
  readonly guideName: string;
  readonly offline: boolean;
  readonly people: readonly { readonly id: string; readonly name: string }[];
  /** The original booker of the booked seat, when there is one. */
  readonly booker: { readonly id: string; readonly name: string; readonly me: boolean } | null;
  readonly sending: boolean;
  readonly onBack: () => void;
  readonly onVote: (option: StormOptionId) => void;
  readonly onConfirmPay: () => void;
}

const GUIDE_SIZE = 96;
const EMPTY_STICKER = 120;

const useStyles = makeStyles((th) => ({
  hero: {
    borderTopStartRadius: 0,
    borderTopEndRadius: 0,
    borderBottomStartRadius: th.radius.heroBottom,
    borderBottomEndRadius: th.radius.heroBottom,
  },
  guide: { position: 'absolute', end: th.space['16'], bottom: th.space['20'], opacity: 0.5 },
  body: { paddingHorizontal: th.size.gutter, paddingTop: th.space['20'], gap: th.space['12'] },
  flex: { flex: 1 },
}));

export function StormView(props: StormViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const lines = stormLines();
  const { model } = props;
  const [picked, setPicked] = useState<StormOptionId | null>(null);
  if (props.state !== 'ready' || model === null) {
    return (
      <Scaffold testID="storm-screen">
        <Stack gap="16" style={{ padding: theme.size.gutter }}>
          <BackEyebrow label={lines.back} onPress={props.onBack} testID="storm-back" />
          {props.state === 'loading' ? (
            <Skeleton preset="card" repeat={2} testID="storm-loading" />
          ) : (
            <EmptyState
              guide={props.guide}
              guideName={props.guideName}
              sticker={
                <Sticker
                  kind={GUIDE_STICKERS[props.guide].kind}
                  name={GUIDE_STICKERS[props.guide].name}
                  pose="sleep"
                  size={EMPTY_STICKER}
                />
              }
              title={lines.missingTitle}
              line={lines.missing}
              action={{ label: lines.backAction, onPress: props.onBack }}
              testID="storm-missing"
            />
          )}
        </Stack>
      </Scaffold>
    );
  }
  const ink = theme.semantic.text.onAccent;
  const selected = picked ?? model.myVote ?? model.recommended ?? model.options[0]?.id ?? null;
  const option = model.options.find((o) => o.id === selected) ?? null;
  const leading = model.options.find((o) => o.id === model.tally[0]?.id) ?? null;
  const voting = model.phase === 'voting';
  const settled = selected !== null && selected === model.myVote;
  const joinIndex = (uid: string) =>
    Math.max(
      0,
      props.people.findIndex((p) => p.id === uid),
    );
  const name = (uid: string) => props.people.find((p) => p.id === uid)?.name ?? '';
  const seatDate = longDate(model.seatDate ?? model.options[0]?.swap_day ?? null, locale);
  return (
    <Scaffold variant="dark" edges={[]} testID="storm-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: theme.space['24'] }}>
        <View
          style={{
            paddingTop: insets.top + theme.space['8'],
            paddingHorizontal: theme.size.gutter,
            backgroundColor: theme.color.blue,
          }}
        >
          <Row justify="space-between" align="center">
            <BackEyebrow
              label={lines.back}
              onPress={props.onBack}
              color={ink}
              testID="storm-back"
            />
            <Text variant="eyebrow" color={ink}>
              {dayEyebrow(model.day, locale)}
            </Text>
          </Row>
        </View>
        <Card tone="blue" halftone radius="cardBig" style={styles.hero} testID="storm-hero">
          <Stack gap="10">
            <Text variant="displayHero" color={ink} singleLine={false} accessibilityRole="header">
              {props.title.toLocaleUpperCase(locale)}
            </Text>
            <Row gap="6" wrap>
              {chips(model, locale).map((chip) => (
                <InfoPill key={chip}>{chip}</InfoPill>
              ))}
            </Row>
            {props.line === '' ? null : (
              <Text variant="voice" color={ink} singleLine={false}>
                {props.line}
              </Text>
            )}
          </Stack>
          <View style={styles.guide} pointerEvents="none">
            <Sticker
              kind={GUIDE_STICKERS[props.guide].kind}
              name={GUIDE_STICKERS[props.guide].name}
              size={GUIDE_SIZE}
            />
          </View>
        </Card>
        <Stack style={styles.body}>
          {props.offline ? <OfflinePill /> : null}
          {props.offline ? (
            <Text variant="caption" color={theme.semantic.text.secondary} testID="storm-offline">
              {lines.offline}
            </Text>
          ) : null}
          {model.phase === 'withdrawn' ? (
            <Text variant="h3" singleLine={false} testID="storm-withdrawn">
              {lines.withdrawn}
            </Text>
          ) : null}
          {model.phase === 'decided' && model.chosen !== null ? (
            <Text variant="h3" singleLine={false} testID="storm-decided">
              {decidedLine(model.chosen)}
            </Text>
          ) : null}
          {model.seat !== null ? (
            <Card tone="raised" testID={`storm-seat-${model.seat}`}>
              <Stack gap="10">
                <Text variant="body" singleLine={false}>
                  {seatLine(
                    model.seat,
                    props.booker?.name ?? '',
                    props.booker?.me ?? false,
                    seatDate,
                  )}
                </Text>
                {model.seat === 'awaiting_booker_payment' && props.booker?.me === true ? (
                  <PillButton
                    label={lines.confirmPay}
                    size="sm"
                    loading={props.sending}
                    onPress={props.onConfirmPay}
                    testID="storm-confirm-pay"
                  />
                ) : null}
              </Stack>
            </Card>
          ) : null}
          {voting ? (
            <Text variant="eyebrow" color={theme.semantic.text.secondary}>
              {lines.pickOne.toLocaleUpperCase(locale)}
            </Text>
          ) : null}
          {model.phase === 'withdrawn'
            ? null
            : model.options.map((o) => (
                <RadioCard
                  key={o.id}
                  title={optionTitle(o, locale)}
                  description={optionDetail(o, locale)}
                  {...(o.recommended ? { pickTag: pickTag(props.guideName, locale) } : {})}
                  selected={voting ? selected === o.id : model.chosen === o.id}
                  disabled={!model.canVote}
                  onSelect={() => setPicked(o.id)}
                  testID={`storm-option-${o.id}`}
                />
              ))}
          {voting ? (
            <>
              <Row gap="10" align="center">
                <AvatarStack
                  size="sm"
                  members={model.votedIds.map((uid) => ({
                    key: uid,
                    name: name(uid),
                    joinIndex: joinIndex(uid),
                  }))}
                />
                <Text
                  variant="bodySm"
                  color={theme.semantic.text.secondary}
                  singleLine={false}
                  style={styles.flex}
                  testID="storm-tally"
                >
                  {tallyLine(model, leading, locale)}
                </Text>
              </Row>
              {model.closesAt === null ? null : (
                <Text variant="caption" color={theme.semantic.text.tertiary}>
                  {closesLine(model.closesAt, props.tz, locale)}
                </Text>
              )}
            </>
          ) : null}
        </Stack>
      </ScrollView>
      {voting ? (
        <KeyboardFooter testID="storm-footer">
          {model.canVote ? (
            <PillButton
              label={
                settled && model.myVote !== null
                  ? votedLabel(model.myVote)
                  : ctaLabel(option, locale)
              }
              block
              flap
              disabled={option === null || settled}
              loading={props.sending}
              onPress={() => {
                if (option !== null && !settled) props.onVote(option.id);
              }}
              testID="storm-vote"
            />
          ) : (
            <Text variant="bodySm" color={theme.semantic.text.secondary} testID="storm-not-voting">
              {lines.notVoting}
            </Text>
          )}
        </KeyboardFooter>
      ) : null}
    </Scaffold>
  );
}
