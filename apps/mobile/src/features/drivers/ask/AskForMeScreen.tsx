/**
 * Tokek's post (6b-1): written from the trip (party, the picked legs with their hours, seats,
 * language), in English or Indonesian for the group it goes to. Each highlight is an editable slot
 * and the post rewrites around it; a budget appears only when the traveller adds one (the private
 * budget is never shared unasked). COPY POST puts it on the clipboard: CritterPass never posts in
 * groups and never reads them.
 */
import {
  ASK_POST_WORDING,
  askPostText,
  buildAskPost,
  type AskPostLanguage,
  type AskSlot,
} from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Segmented } from '@/ui/inputs/Segmented';
import { TextField } from '@/ui/inputs/TextField';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dayMonthLabel } from '../shared/format';
import { driversRoute, splitDays } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  paper: { backgroundColor: t.color.paper.base, borderRadius: t.radius.lg, padding: t.space['16'] },
  slot: { backgroundColor: t.color.yellow },
}));

export function AskForMeScreen({ tripId, days }: { tripId: string; days?: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const plan = useDriverDays(tripId);
  const [lang, setLang] = useState<AskPostLanguage>('en');
  const [edits, setEdits] = useState<Partial<Record<AskSlot, string>>>({});
  const [editing, setEditing] = useState<AskSlot | null>(null);
  const [copied, setCopied] = useState(false);
  const wording = ASK_POST_WORDING[lang];
  const picked = new Set(splitDays(days));
  const legs = plan.days
    .filter((day) => (picked.size === 0 ? day.gap !== null : picked.has(day.date)))
    .map((day) => ({
      date: dayMonthLabel(day.date, lang),
      route: [plan.area, day.gap?.place ?? day.stops.at(-1)?.name ?? '', plan.area]
        .filter((part) => part !== '')
        .join(' → '),
      start: day.window?.start ?? null,
      end: day.window?.end ?? null,
    }));
  const values = {
    area: plan.area,
    party: edits.party ?? wording.party(plan.people),
    seats: edits.seats ?? wording.seats(plan.people + 1),
    language: edits.language ?? wording.language,
    budget: edits.budget === undefined || edits.budget === '' ? null : edits.budget,
    legs,
  };
  const segments = buildAskPost(wording, values);
  const sticker = guideSticker(plan.guide.id);
  const ink = theme.color.paper.ink;
  return (
    <Scaffold variant="dark" testID="drivers-ask">
      <KeyboardScrollView
        contentContainerStyle={[styles.content, { paddingBottom: theme.space['32'] }]}
        keyboardShouldPersistTaps="handled"
      >
        <BackEyebrow
          label={upper(t({ id: 'drivers.back.find', message: 'Find a driver' }), locale)}
          fallback={driversRoute(tripId)}
        />
        <Row gap="12" align="center">
          <Sticker kind={sticker.kind} name={sticker.name} pose="point" size={64} />
          <Text variant="h1" designSize={48} accessibilityRole="header" style={{ flex: 1 }}>
            {upper(t({ id: 'drivers.ask.title', message: `${plan.guide.name}'s post` }), locale)}
          </Text>
        </Row>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'drivers.ask.intro',
            message:
              'Copy it and post it in the groups yourself. CritterPass never posts there and never reads them.',
          })}
        </Text>
        <View style={styles.paper}>
          <Stack gap="12">
            <Row align="center" style={{ justifyContent: 'space-between' }}>
              <Text variant="eyebrow" color={ink}>
                {upper(
                  t({ id: 'drivers.ask.tapSlot', message: 'Tap a highlight to change it' }),
                  locale,
                )}
              </Text>
              <Segmented<AskPostLanguage>
                segments={[
                  { value: 'en', label: 'EN' },
                  { value: 'id', label: 'ID' },
                ]}
                value={lang}
                onChange={(next) => {
                  setCopied(false);
                  setLang(next);
                }}
                label={t({ id: 'drivers.ask.language', message: 'Language of the post' })}
                testID="drivers-ask-lang"
              />
            </Row>
            <Text variant="body" color={ink} testID="drivers-ask-post">
              {segments.map((segment, index) =>
                segment.kind === 'text' ? (
                  segment.text
                ) : (
                  <Text
                    key={index}
                    variant="body"
                    color={ink}
                    style={styles.slot}
                    onPress={segment.kind === 'slot' ? () => setEditing(segment.slot) : undefined}
                    accessibilityRole={segment.kind === 'slot' ? 'button' : undefined}
                  >
                    {` ${segment.text} `}
                  </Text>
                ),
              )}
            </Text>
            {editing === null ? null : (
              <TextField
                label={t({ id: 'drivers.ask.edit', message: 'Change this part' })}
                value={edits[editing] ?? (editing === 'budget' ? '' : values[editing])}
                onChangeText={(text) => {
                  // The post changed: what was copied is no longer what is shown.
                  setCopied(false);
                  setEdits((prev) => ({ ...prev, [editing]: text }));
                }}
                onSubmitEditing={() => setEditing(null)}
                autoFocus
                testID="drivers-ask-edit"
              />
            )}
            {values.budget === null && editing !== 'budget' ? (
              <TextLink
                label={t({ id: 'drivers.ask.addBudget', message: 'Add a budget' })}
                onPress={() => setEditing('budget')}
                testID="drivers-ask-budget"
              />
            ) : null}
          </Stack>
        </View>
        <GuideLine
          guide={plan.guide.id}
          name={plan.guide.name}
          line={t({
            id: 'drivers.ask.after',
            message: "When someone replies, share their message to me. I'll pull out the details.",
          })}
          sticker={<Sticker kind={sticker.kind} name={sticker.name} pose="wave" size={44} />}
        />
      </KeyboardScrollView>
      <KeyboardFooter>
        <PillButton
          label={
            copied
              ? t({ id: 'drivers.ask.copied', message: 'Copied' })
              : t({ id: 'drivers.ask.copy', message: 'Copy post' })
          }
          onPress={() => {
            setEditing(null);
            void Clipboard.setStringAsync(askPostText(segments)).then(() => setCopied(true));
          }}
          testID="drivers-ask-copy"
        />
      </KeyboardFooter>
    </Scaffold>
  );
}
