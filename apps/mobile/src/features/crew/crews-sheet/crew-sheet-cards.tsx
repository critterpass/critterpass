/**
 * The crews sheet's cards (3g-3): a crew card with its members and "N NEW" on top, the name, the
 * trip line, then a divider and the last message; and the START A CREW card with its + circle.
 * The active crew is ringed in the selection yellow and its NEW pill is pink; the others keep a
 * decorative ring and a muted pill, so both read clearly on the raised sheet. A quiet "Crew
 * settings" link closes each crew card.
 */
import { t } from '@lingui/core/macro';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { upper } from '@cp/i18n';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { watchRows } from '@/data/status/watch-rows';
import { useHomeVote } from '@/features/home';
import { useMemberFaces } from '@/features/you';
import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import { Icon } from '@/ui/icons/Icon';
import { TextLink } from '@/ui/buttons/TextLink';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { crewCardChat, type CrewLastMessage } from './badge-slot';

const CARD_RING = 2;
const PREVIEW_ICON = 16;
const MAX_UNREAD = 99;
/** 3g-3 sets START A CREW at the small end of h3. */
const START_TITLE_SIZE = 20;

const useStyles = makeStyles((th) => ({
  card: {
    borderWidth: CARD_RING,
    borderColor: th.semantic.border.decorative,
    backgroundColor: th.semantic.bg.sunken,
    gap: th.space['6'],
  },
  active: { borderColor: th.semantic.action.primary },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: {
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['2'],
    borderRadius: th.radius.sm,
  },
  divider: { height: 1, backgroundColor: th.color.divider, marginVertical: th.space['6'] },
  preview: { flexDirection: 'row', alignItems: 'center', gap: th.space['8'] },
  previewText: { flex: 1 },
  start: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    padding: th.space['16'],
    borderWidth: 1.5,
    borderColor: th.semantic.border.control,
    borderRadius: th.radius.lg,
  },
  plus: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: th.semantic.bg.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBody: { flex: 1, gap: th.space['2'] },
  settings: { alignItems: 'flex-end', marginEnd: -th.space['12'] },
}));

function NewPill({ count, active }: { readonly count: number; readonly active: boolean }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  if (count === 0) return null;
  const shown = count > MAX_UNREAD ? `${MAX_UNREAD}+` : String(count);
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: active ? theme.semantic.state.urgent : theme.semantic.bg.control },
      ]}
    >
      <Text
        variant="label"
        color={active ? theme.semantic.text.onAccent : theme.semantic.text.secondary}
      >
        {upper(t({ id: 'crew.sheet.new', message: `${shown} new` }), locale)}
      </Text>
    </View>
  );
}

function previewLine(last: CrewLastMessage): string {
  if (last.kind === 'photo') return t({ id: 'crew.sheet.lastPhoto', message: 'sent a photo' });
  if (last.kind === 'voice') return t({ id: 'crew.sheet.lastVoice', message: 'sent a voice note' });
  return last.body;
}

function Preview({ last }: { readonly last: CrewLastMessage }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <>
      <View style={styles.divider} />
      <View style={styles.preview}>
        <Icon name="chat" size={PREVIEW_ICON} color={theme.semantic.text.secondary} decorative />
        <Text
          variant="bodySm"
          color={theme.semantic.text.secondary}
          numberOfLines={1}
          style={styles.previewText}
        >
          <Text variant="bodySm" color={theme.semantic.text.primary}>
            {last.sender}
          </Text>{' '}
          {previewLine(last)}
        </Text>
      </View>
    </>
  );
}

/** The chat half of a card, from the hooks crew chat registered (nothing until it does). */
function useChat(crewId: string): { unread: number; last: CrewLastMessage | null } {
  const chat = crewCardChat();
  const unread = chat?.useUnread(crewId) ?? 0;
  const last = chat?.useLastMessage(crewId) ?? null;
  return { unread, last };
}

/**
 * "Kyoto vote in the final" or "vote open": the crew's destination poll, read through Home's vote
 * slot (the vote feature registers it); nothing when the crew has no open poll.
 */
function useVoteLine(crewId: string): string | null {
  const vote = useHomeVote(crewId);
  const db = useContext(LocalFirstContext)?.db ?? null;
  const leader =
    vote?.stage === 'final'
      ? ([...vote.candidates].sort((a, b) => b.votes - a.votes)[0]?.placeId ?? null)
      : null;
  const [found, setFound] = useState<{ readonly id: string; readonly name: string } | null>(null);
  useEffect(() => {
    if (db === null || leader === null) return undefined;
    return watchRows<{ name: string }>(
      db,
      // eslint-disable-next-line lingui/no-unlocalized-strings -- SQL, never copy.
      `SELECT name FROM destinations WHERE id = '${leader.replaceAll("'", "''")}'`,
      ['destinations'],
      (rows) => setFound(rows[0] === undefined ? null : { id: leader, name: rows[0].name }),
    );
  }, [db, leader]);
  const place = found !== null && found.id === leader ? found.name : null;
  if (vote === null) return null;
  if (vote.stage === 'board') return t({ id: 'crew.sheet.voteOpen', message: 'vote open' });
  // The leader's name arrives a moment later; the line waits for it rather than changing twice.
  if (place === null) return null;
  return t({ id: 'crew.sheet.voteFinalLeader', message: `${place} vote in the final` });
}

export interface CrewSheetCardProps {
  readonly crewId: string;
  readonly name: string;
  readonly detail: string;
  readonly members: readonly { readonly userId?: string; readonly name: string }[];
  readonly active: boolean;
  readonly onPress: () => void;
  /** Opens this crew's settings: a quiet link at the card's foot, apart from the card's tap. */
  readonly onSettings: () => void;
}

export function CrewSheetCard({
  crewId,
  name,
  detail,
  members,
  active,
  onPress,
  onSettings,
}: CrewSheetCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { unread, last } = useChat(crewId);
  const faces = useMemberFaces();
  const vote = useVoteLine(crewId);
  const line = vote === null ? detail : `${detail} · ${vote}`;
  const membersLabel = t({ id: 'crew.sheet.members', message: `${members.length} members` });
  const unreadLabel =
    unread > 0 ? t({ id: 'crew.sheet.unreadSpoken', message: `${unread} new messages` }) : null;
  const label = [name, line, membersLabel, unreadLabel].filter(Boolean).join(', ');
  return (
    <Card
      tone="sunken"
      style={[styles.card, active ? styles.active : null]}
      onPress={onPress}
      accessibilityLabel={label}
      testID={`crew-card-${crewId}`}
    >
      <View style={styles.top}>
        <AvatarStack
          members={members.map((m, index) => ({
            key: `${index}`,
            name: m.name,
            joinIndex: index,
            ...(m.userId === undefined ? {} : faces.faceProps(m.userId, 'sm')),
          }))}
          max={6}
          size="sm"
        />
        <NewPill count={unread} active={active} />
      </View>
      <Text variant="h3">{name}</Text>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {line}
      </Text>
      {last === null ? null : <Preview last={last} />}
      <View style={styles.settings}>
        <TextLink
          label={t({ id: 'crew.sheet.settings', message: 'Crew settings' })}
          onPress={onSettings}
          testID={`crew-card-settings-${crewId}`}
        />
      </View>
    </Card>
  );
}

export function StartCrewCard({ onPress }: { readonly onPress: () => void }): ReactNode {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const title = t({ id: 'crew.sheet.start', message: 'Start a crew' });
  const body = t({
    id: 'crew.sheet.startBody',
    message: 'Name it and share the code. The guide comes with the first trip.',
  });
  return (
    <Pressable
      testID="crews-start"
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      style={styles.start}
    >
      <View style={styles.plus}>
        <Text variant="title" color={theme.semantic.text.primary} accessibilityElementsHidden>
          +
        </Text>
      </View>
      <View style={styles.startBody}>
        <Text variant="h3" designSize={START_TITLE_SIZE}>
          {upper(title, locale)}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {body}
        </Text>
      </View>
    </Pressable>
  );
}
