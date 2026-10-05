/**
 * Crew can't agree (7e-3), drawn from plain values: the place's photo with back and the split
 * count; the name and one meta line; the stance bar filling from both ends; each person's own
 * words, wanters left and rather-nots right; where you stand; and the guide's two ways nobody
 * loses with the button that posts the chosen one to crew chat.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/ui/buttons/IconButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { StraightArrow } from '@/ui/icons/StraightArrow';
import { Row } from '@/ui/layout/Row';
import { Avatar } from '@/ui/people/Avatar';
import type { StackMember } from '@/ui/people/AvatarStack';
import { OptionRadioCard, StanceBar } from '@/ui/planning';
import { useBackAffordance } from '@/ui/qa/back-affordance';
import { Sticker } from '@/ui/sticker/Sticker';
import { FOOTER_FADE_PT, FooterFade } from '@/ui/surface/FooterFade';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Hatch } from '@/ui/textures/hatch';
import { makeStyles, useTheme } from '@/ui/theme';

import type { GuideFacts } from '../format';

const PHOTO_HEIGHT = 200;

export interface SplitNote {
  readonly member: StackMember;
  readonly note: string;
}

export interface SplitViewProps {
  readonly name: string;
  readonly meta: readonly string[];
  readonly splitLabel: string;
  readonly guide: GuideFacts;
  readonly want: readonly StackMember[];
  readonly ratherNot: readonly StackMember[];
  readonly silent: string | null;
  readonly wantNotes: readonly SplitNote[];
  readonly ratherNotNotes: readonly SplitNote[];
  readonly picker: ReactNode;
  readonly options: readonly {
    readonly title: string;
    readonly body: string;
    readonly tags: readonly string[];
  }[];
  /** What the guide says when it has no ways to offer (loading, offline, none). */
  readonly optionsNote: string | null;
  readonly chosen: number;
  readonly onChoose: (index: number) => void;
  readonly suggest: { readonly label: string; readonly onPress: () => void } | null;
  readonly vote: { readonly label: string; readonly onPress: () => void } | null;
  readonly posting: boolean;
  /**
   * The one live button once a way is in crew chat, or when there is no way to post: it opens the
   * chat, and SUGGEST and the vote link are not drawn, so nothing is posted twice.
   */
  readonly chat?: { readonly label: string; readonly onPress: () => void } | undefined;
  readonly onBack: () => void;
}

const useStyles = makeStyles((t) => ({
  photo: { height: PHOTO_HEIGHT, overflow: 'hidden' },
  controls: { position: 'absolute', start: t.space['16'], end: t.space['16'] },
  pill: {
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
    backgroundColor: t.semantic.state.urgent,
  },
  sheet: {
    marginTop: -t.space['32'],
    borderTopLeftRadius: t.radius.sheetTop,
    borderTopRightRadius: t.radius.sheetTop,
    backgroundColor: t.semantic.bg.base,
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['20'],
    gap: t.space['14'],
  },
  notes: { flexDirection: 'row', gap: t.space['12'] },
  column: { flex: 1, minWidth: 0, gap: t.space['10'] },
  note: { flexDirection: 'row', gap: t.space['8'], alignItems: 'flex-start' },
  footer: { paddingHorizontal: t.size.gutter, paddingTop: t.space['8'], gap: t.space['4'] },
}));

function Notes({ notes }: { readonly notes: readonly SplitNote[] }) {
  const styles = useStyles();
  return (
    <View style={styles.column}>
      {notes.map(({ member, note }) => (
        <View key={member.key} style={styles.note}>
          <Avatar name={member.name} joinIndex={member.joinIndex} size="sm" />
          <View style={{ flex: 1 }}>
            <Text variant="bodySm" singleLine={false}>
              {note}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function SplitView(props: SplitViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  useBackAffordance();
  return (
    <Scaffold edges={[]} testID="split">
      <ScrollView contentContainerStyle={{ paddingBottom: FOOTER_FADE_PT + theme.space['8'] }}>
        <View style={styles.photo}>
          <Hatch />
          <Row
            justify="space-between"
            align="center"
            style={[styles.controls, { top: insets.top + theme.space['8'] }]}
          >
            <IconButton
              label={t({ id: 'explore.split.back', message: 'Back' })}
              surface="onPhoto"
              glyph={<StraightArrow direction="back" color={theme.semantic.text.primary} />}
              onPress={props.onBack}
              testID="split-back"
            />
            <View style={styles.pill} testID="split-count">
              <Text variant="label" color={theme.semantic.text.onAccent}>
                {upper(props.splitLabel, locale)}
              </Text>
            </View>
          </Row>
        </View>
        <View style={styles.sheet}>
          <View style={{ gap: theme.space['6'] }}>
            <Text variant="h1" testID="split-name">
              {upper(props.name, locale)}
            </Text>
            {props.meta.length === 0 ? null : (
              <Text variant="body" color={theme.semantic.text.secondary}>
                {props.meta.join(' · ')}
              </Text>
            )}
          </View>
          <StanceBar
            want={props.want}
            ratherNot={props.ratherNot}
            caption={props.silent ?? undefined}
            testID="split-bar"
          />
          {props.wantNotes.length + props.ratherNotNotes.length === 0 ? null : (
            <View style={styles.notes} testID="split-notes">
              <Notes notes={props.wantNotes} />
              <Notes notes={props.ratherNotNotes} />
            </View>
          )}
          <Row gap="8" align="center">
            <Sticker kind={props.guide.kind} name={props.guide.name} size={32} />
            <Text variant="voice" color={props.guide.colour}>
              {t({ id: 'explore.split.ways', message: 'Two ways nobody loses:' })}
            </Text>
          </Row>
          {props.optionsNote === null ? null : (
            <Text
              variant="bodySm"
              color={theme.semantic.text.secondary}
              testID="split-options-note"
            >
              {props.optionsNote}
            </Text>
          )}
          {props.options.map((option, index) => (
            <OptionRadioCard
              key={option.title}
              title={upper(option.title, locale)}
              body={option.body}
              tags={option.tags.map((tag) => upper(tag, locale))}
              selected={props.chosen === index}
              onSelect={() => props.onChoose(index)}
              testID={`split-option-${String(index)}`}
            />
          ))}
          {props.picker}
        </View>
      </ScrollView>
      <FooterFade />
      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.space['8'] }]}>
        {props.chat === undefined ? null : (
          <PillButton
            label={props.chat.label}
            tone="ink"
            onPress={props.chat.onPress}
            testID="split-open-chat"
          />
        )}
        {props.chat !== undefined || props.suggest === null ? null : (
          <PillButton
            label={props.suggest.label}
            loading={props.posting}
            onPress={props.suggest.onPress}
            testID="split-suggest"
          />
        )}
        {props.chat !== undefined || props.vote === null ? null : (
          <View style={{ alignItems: 'center' }}>
            <TextLink label={props.vote.label} onPress={props.vote.onPress} testID="split-vote" />
          </View>
        )}
      </View>
    </Scaffold>
  );
}
