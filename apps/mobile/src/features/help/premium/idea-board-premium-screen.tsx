/**
 * The idea board (9.07): votes left as the header chip, Top / New / Shipped, idea cards with the
 * vote block (ink once voted; the count steps on Snappy) and the status tag, and "Suggest an
 * idea" pinned at the bottom (the current suggest sheet, with its similar ideas).
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';

import {
  Button,
  Icon,
  SegmentedControl,
  StatusTag,
  Text,
  ToastHost,
  usePremiumTheme,
  useToast,
  type StatusTone,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { BoardStatus } from '../ideas/board';
import { useIdeaBoard } from '../ideas/board-screen';
import type { BoardRow } from '../ideas/BoardView';
import { SuggestSheet } from '../ideas/SuggestSheet';

function useStatusWords(): (status: BoardStatus) => { tone: StatusTone; label: string } {
  const { t } = useLingui();
  return (status) => {
    switch (status) {
      case 'planned':
        return { tone: 'booked', label: t({ id: 'help.ideas.planned', message: 'Planned' }) };
      case 'building':
        return { tone: 'rain', label: t({ id: 'help.ideas.building', message: 'Building' }) };
      case 'shipped':
        return { tone: 'booked', label: t({ id: 'help.ideas.shipped', message: 'Shipped' }) };
      case 'pending_review':
        return {
          tone: 'unopened',
          label: t({ id: 'help.ideas.underReview', message: 'Under review' }),
        };
      case 'declined':
        return { tone: 'unopened', label: t({ id: 'help.ideas.declined', message: 'Declined' }) };
      case 'merged':
        return { tone: 'unopened', label: t({ id: 'help.ideas.merged', message: 'Merged' }) };
      case 'open':
        return { tone: 'maybe', label: t({ id: 'help.ideas.open', message: 'Looking at it' }) };
    }
  };
}

function IdeaCard({ row, onVote }: { readonly row: BoardRow; readonly onVote: () => void }) {
  const th = usePremiumTheme();
  const words = useStatusWords()(row.status);
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: th.space.gap12,
        alignItems: 'center',
        backgroundColor: th.color.card,
        borderRadius: th.radius.banner,
        paddingVertical: 10,
        paddingStart: 10,
        paddingEnd: 14,
        boxShadow: th.shadow.card,
      }}
      testID={`help-idea-${row.id}`}
    >
      <Pressable
        onPress={onVote}
        disabled={!row.votable}
        accessibilityRole="button"
        accessibilityState={{ selected: row.voted, disabled: !row.votable }}
        accessibilityLabel={`${row.title}, ${String(row.count)}`}
        style={{
          width: 52,
          height: 56,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: row.voted ? th.color.ink : th.color.control,
        }}
        testID={`help-idea-vote-${row.id}`}
      >
        <Icon name="expand" size={14} color={row.voted ? th.color.onInk : th.color.ink} />
        <Text variant="stepperValue" color={row.voted ? th.color.onInk : th.color.ink}>
          {String(row.count)}
        </Text>
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="rowTitle">{row.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <StatusTag label={words.label} tone={words.tone} />
          {row.teamNote === null ? null : (
            <Text variant="captionMuted" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
              {row.teamNote}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function Board() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const params = useLocalSearchParams<{ suggest?: string }>();
  const toast = useToast();
  const b = useIdeaBoard(params.suggest === '1', (line) =>
    toast.show({ kind: 'done', message: line.title }),
  );
  const left = t({
    id: 'help.ideas.votesLeft',
    message: plural(b.left, { one: '# vote left', other: '# votes left' }),
  });
  return (
    <>
      <PushScreen
        title={t({ id: 'help.ideas.title', message: 'What’s next?' })}
        subtitle={left}
        backLabel={t({ id: 'help.ideas.back', message: 'Help' })}
        scroll={false}
        testID="help-ideas"
      >
        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          data={b.board.loaded ? b.rows : []}
          keyExtractor={(row) => row.id}
          contentContainerStyle={{
            padding: th.space.gutter,
            gap: th.space.gap8,
            paddingBottom: 120,
          }}
          ListHeaderComponent={
            <View style={{ marginBottom: th.space.gap8 }}>
              <SegmentedControl
                options={[
                  { value: 'top', label: t({ id: 'help.ideas.top', message: 'Top' }) },
                  { value: 'new', label: t({ id: 'help.ideas.new', message: 'New' }) },
                  {
                    value: 'shipped',
                    label: t({ id: 'help.ideas.shippedTab', message: 'Shipped' }),
                  },
                ]}
                value={b.tab}
                onChange={b.setTab}
                accessibilityLabel={t({ id: 'help.ideas.tabs', message: 'Which ideas' })}
                testID="help-ideas-tabs"
              />
            </View>
          }
          ListEmptyComponent={
            <Text variant="body" tone="muted" align="center" testID="help-ideas-empty">
              {b.board.unavailable
                ? t({
                    id: 'help.ideas.offline',
                    message: 'The board opens once you’re back online.',
                  })
                : b.tab === 'shipped'
                  ? t({ id: 'help.ideas.noneShipped', message: 'Nothing shipped from here yet.' })
                  : t({
                      id: 'help.ideas.none',
                      message: 'No ideas yet. Yours could be the first.',
                    })}
            </Text>
          }
          renderItem={({ item }) => <IdeaCard row={item} onVote={() => void b.onVote(item.id)} />}
        />
        <View
          style={{ position: 'absolute', left: 24, right: 24, bottom: 40 }}
          pointerEvents="box-none"
        >
          <Button
            label={t({ id: 'help.premium.suggest', message: 'Suggest an idea' })}
            onPress={() => b.setSuggesting(true)}
            testID="help-ideas-suggest"
          />
        </View>
      </PushScreen>
      {b.suggesting ? (
        <SuggestSheet
          title={b.title}
          onTitle={b.setTitle}
          description={b.description}
          onDescription={b.setDescription}
          matches={b.matches}
          posting={b.posting}
          onVote={b.voteForMatch}
          onPost={() => void b.post()}
          onClose={b.closeSuggest}
        />
      ) : null}
    </>
  );
}

export function IdeaBoardPremiumScreen() {
  return (
    <ToastHost bottomOffset={0}>
      <Board />
    </ToastHost>
  );
}
