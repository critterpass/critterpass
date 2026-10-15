/**
 * The guide's post for the local groups, in the drivers look (6.19–6.25): the guide and the line
 * that CritterPass never posts there, then the post on a card in English or Indonesian with each
 * highlight tappable to change it (the field opens under the post), "Add a budget" when none was
 * given, and Copy post riding the keyboard. The guide's note says what to do when someone replies.
 */
import type { AskPostLanguage } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideCritterKind } from '@/features/trip';
import {
  Button,
  CritterSticker,
  GuideNote,
  SegmentedControl,
  Text,
  TextButton,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';
import { KeyboardAwareScroll, KeyboardStickyFooter, PushScreen } from '@/ui/premium/shell';

import { useAskPost } from '../ask/use-ask-post';

const LANGUAGES = [
  { value: 'en', label: 'EN' },
  { value: 'id', label: 'ID' },
] as const satisfies readonly { value: AskPostLanguage; label: string }[];

export function AskForMePremium({
  tripId,
  days,
}: {
  readonly tripId: string;
  readonly days?: string;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const ask = useAskPost(tripId, days);
  const { plan, segments } = ask;
  const guide = plan.guide.name;
  const slot = th.color.status.maybe;
  return (
    <PushScreen
      title={t({ id: 'drivers.premium.ask.title', message: `${guide}’s post` })}
      backLabel={t({ id: 'drivers.back.find', message: 'Find a driver' })}
      scroll={false}
      testID="drivers-ask"
    >
      <KeyboardAwareScroll
        contentContainerStyle={[
          styles.body,
          {
            paddingHorizontal: th.space.gutter,
            gap: th.space.gap12,
            paddingBottom: insets.bottom + 120,
          },
        ]}
      >
        <View style={styles.head}>
          <CritterSticker
            kind={guideCritterKind(plan.guide.id)}
            name={guide}
            size={56}
            pose="point"
          />
          <Text variant="rowText" tone="muted" style={styles.flex}>
            {t({
              id: 'drivers.ask.intro',
              message:
                'Copy it and post it in the groups yourself. CritterPass never posts there and never reads them.',
            })}
          </Text>
        </View>
        <View
          style={[
            styles.card,
            {
              borderRadius: th.radius.cardLarge,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
              gap: th.space.gap12,
            },
          ]}
        >
          <View style={styles.row}>
            <Text variant="captionMuted" tone="muted" style={styles.flex}>
              {t({ id: 'drivers.ask.tapSlot', message: 'Tap a highlight to change it' })}
            </Text>
            <SegmentedControl
              options={LANGUAGES}
              value={ask.lang}
              onChange={ask.setLang}
              accessibilityLabel={t({
                id: 'drivers.ask.language',
                message: 'Language of the post',
              })}
              hug
              testID="drivers-ask-lang"
            />
          </View>
          <Text variant="rowText" testID="drivers-ask-post">
            {segments.map((segment, index) =>
              segment.kind === 'text' ? (
                segment.text
              ) : (
                <Text
                  key={index}
                  variant="rowTextStrong"
                  color={slot.text}
                  style={{ backgroundColor: slot.bg }}
                  onPress={segment.kind === 'slot' ? () => ask.setEditing(segment.slot) : undefined}
                  accessibilityRole={segment.kind === 'slot' ? 'button' : undefined}
                >
                  {` ${segment.text} `}
                </Text>
              ),
            )}
          </Text>
          {ask.editing === null ? null : (
            <TextField
              accessibilityLabel={t({ id: 'drivers.ask.edit', message: 'Change this part' })}
              value={ask.editValue}
              onChangeText={ask.edit}
              onSubmitEditing={() => ask.setEditing(null)}
              returnKeyType="done"
              autoFocus
              testID="drivers-ask-edit"
            />
          )}
          {ask.canAddBudget ? (
            <View style={styles.start}>
              <TextButton
                label={t({ id: 'drivers.ask.addBudget', message: 'Add a budget' })}
                onPress={() => ask.setEditing('budget')}
                testID="drivers-ask-budget"
              />
            </View>
          ) : null}
        </View>
        <GuideNote
          name={guide}
          critter={guideCritterKind(plan.guide.id)}
          text={t({
            id: 'drivers.ask.after',
            message: 'When someone replies, share their message to me. I’ll pull out the details.',
          })}
        />
      </KeyboardAwareScroll>
      <KeyboardStickyFooter openedOffset={th.space.gap12}>
        <View
          style={{
            paddingHorizontal: th.space.titleGutter,
            paddingBottom: Math.max(insets.bottom, th.space.gap12),
          }}
        >
          <Button
            label={
              ask.copied
                ? t({ id: 'drivers.ask.copied', message: 'Copied' })
                : t({ id: 'drivers.ask.copy', message: 'Copy post' })
            }
            {...(ask.copied ? { icon: 'check' as const } : {})}
            onPress={ask.copy}
            testID="drivers-ask-copy"
          />
        </View>
      </KeyboardStickyFooter>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8 },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  start: { alignItems: 'flex-start' },
});
