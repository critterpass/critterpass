/**
 * Crew quests (3l-7) as a view over its model: the crew's level and XP bar, and today's quests in
 * their colours with pips or faces. Undesigned states (docs/undesigned-states.md): the guide still
 * writing today's quests, the trip not started or already over, offline (progress from the last
 * sync; rewards reveal on reconnect), and a missed quest.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS, type GuideStickerId } from '@/ui/avatar/guides';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { QuestCardView } from './quest-card-view';
import type { BefriendPlace } from './use-befriend-spot';
import { QuestsHeader } from './quests-header';
import type { QuestsModel, QuestsScreenState } from './quests-model';
import type { RevealMode } from './server-clock';

const useStyles = makeStyles((th) => ({
  content: { paddingHorizontal: th.size.gutter, gap: th.space['16'], paddingTop: th.space['8'] },
}));

export function guideOfSlug(slug: string | null): GuideStickerId {
  return slug !== null && Object.hasOwn(GUIDE_STICKERS, slug) ? (slug as GuideStickerId) : 'tokek';
}

function QuestsEmpty({
  state,
  guide,
}: {
  readonly state: Exclude<QuestsScreenState, 'ready' | 'loading'>;
  readonly guide: GuideStickerId;
}) {
  const { t } = useLingui();
  const art = GUIDE_STICKERS[guide];
  const name = art.name;
  const copy = {
    writing: {
      title: t({ id: 'quests.empty.writingTitle', message: "Writing today's quests" }),
      line: t({
        id: 'quests.empty.writingLine',
        message: `${name} writes them from your plan every morning. They'll be here soon.`,
      }),
    },
    before: {
      title: t({ id: 'quests.empty.beforeTitle', message: 'Quests start on day one' }),
      line: t({
        id: 'quests.empty.beforeLine',
        message: `${name} writes the crew's first quests the morning your trip starts.`,
      }),
    },
    over: {
      title: t({ id: 'quests.empty.overTitle', message: "That's a wrap" }),
      line: t({
        id: 'quests.empty.overLine',
        message: 'No more quests on this trip. Your crew level and stickers stay on your pass.',
      }),
    },
  }[state];
  return (
    <EmptyState
      guide={guide}
      guideName={name}
      sticker={<Sticker kind={art.kind} name={name} size={96} pose="think" />}
      title={copy.title}
      line={copy.line}
      testID={`quests-empty-${state}`}
    />
  );
}

export interface QuestsViewProps {
  readonly crewName: string;
  readonly guide: GuideStickerId;
  readonly model: QuestsModel;
  readonly offline: boolean;
  /** Quest id → how its reward shows once revealed. */
  readonly reveals: ReadonlyMap<string, RevealMode>;
  /** Where today's "befriend" quest can be done. */
  readonly befriendPlace?: BefriendPlace | undefined;
  readonly onSignUp: (questId: string) => void;
}

export function QuestsView({
  crewName,
  guide,
  model,
  offline,
  reveals,
  befriendPlace,
  onSignUp,
}: QuestsViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { t } = useLingui();
  const art = GUIDE_STICKERS[guide];
  return (
    <Scaffold variant="dark" testID="quests-screen">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + theme.space['24'] },
        ]}
      >
        <BackEyebrow label={upper(t({ id: 'quests.back', message: 'Trip' }), locale)} />
        <QuestsHeader crewName={crewName} level={model.level} guide={art} />
        {offline ? (
          <Stack gap="6" testID="quests-offline">
            <OfflinePill />
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({
                id: 'quests.offline',
                message: "Progress and rewards land when you're back online.",
              })}
            </Text>
          </Stack>
        ) : null}
        {model.state === 'loading' ? (
          <Skeleton testID="quests-loading" />
        ) : model.state === 'ready' ? (
          <Stack gap="12" testID="quests-list">
            {model.cards.map((card) => {
              const reveal = reveals.get(card.id);
              return (
                <QuestCardView
                  key={card.id}
                  card={card}
                  guide={art}
                  {...(reveal === undefined ? {} : { reveal })}
                  befriendPlace={befriendPlace}
                  onSignUp={onSignUp}
                />
              );
            })}
          </Stack>
        ) : (
          <QuestsEmpty state={model.state} guide={guide} />
        )}
      </ScrollView>
    </Scaffold>
  );
}
