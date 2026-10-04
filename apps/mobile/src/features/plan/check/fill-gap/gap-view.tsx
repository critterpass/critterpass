/**
 * Fill a gap (7h-2), from props only: a sheet over the trip map with the window and ✕, "FOUR OF
 * YOU ARE FREE" with their faces and where the others are, Tokek's ideas as radio cards with their
 * chips (minutes, cost each, whose save in that member's colour), and the button that follows the pick with "Something
 * else" under it. Undesigned: loading, and no ideas.
 */
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { AvatarStack, type StackMember } from '@/ui/people/AvatarStack';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { IdeaCard, type IdeaTag } from './idea-card';

export interface GapIdeaView {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly tags: readonly IdeaTag[];
}

export interface GapViewProps {
  readonly window: string;
  readonly title: string;
  readonly free: readonly StackMember[];
  readonly context: string;
  readonly eyebrow: string;
  readonly state: 'loading' | 'none' | 'ready';
  readonly empty: string;
  readonly ideas: readonly GapIdeaView[];
  readonly picked: string | null;
  readonly onPick: (key: string) => void;
  readonly add: { readonly label: string; readonly busy: boolean; readonly onPress: () => void };
  readonly elseLabel: string;
  readonly onElse: () => void;
  readonly onDismiss?: () => void;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['12'], gap: th.space['12'] },
  who: { flexDirection: 'row', alignItems: 'center', gap: th.space['10'] },
  context: { flex: 1, minWidth: 0 },
  footer: {
    gap: th.space['12'],
    alignItems: 'center',
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['8'],
    paddingBottom: th.space['12'],
  },
  notice: {
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
}));

export function GapView(props: GapViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Sheet
      header={
        <Text variant="eyebrow" color={theme.semantic.text.secondary} testID="plan-gap-window">
          {props.window}
        </Text>
      }
      detents={['large']}
      accessibilityLabel={props.window}
      {...(props.onDismiss === undefined ? {} : { onDismiss: props.onDismiss })}
      testID="plan-gap"
    >
      <SheetScrollView contentContainerStyle={styles.body} testID="plan-gap-scroll">
        <Text variant="h1" singleLine={false} testID="plan-gap-title">
          {props.title}
        </Text>
        <View style={styles.who}>
          <AvatarStack members={props.free} size="sm" max={6} />
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            style={styles.context}
            singleLine={false}
          >
            {props.context}
          </Text>
        </View>
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {props.eyebrow}
        </Text>
        {props.state === 'loading' ? <Skeleton preset="list" repeat={3} /> : null}
        {props.state === 'none' ? (
          <View style={styles.notice} testID="plan-gap-none">
            <Text variant="body" singleLine={false}>
              {props.empty}
            </Text>
          </View>
        ) : null}
        {props.ideas.map((idea) => (
          <IdeaCard
            key={idea.key}
            title={idea.title}
            body={idea.body}
            tags={idea.tags}
            selected={props.picked === idea.key}
            onSelect={() => props.onPick(idea.key)}
            testID={`plan-gap-idea-${idea.key}`}
          />
        ))}
      </SheetScrollView>
      <View style={styles.footer}>
        <PillButton
          label={props.add.label}
          onPress={props.add.onPress}
          loading={props.add.busy}
          disabled={props.state !== 'ready'}
          block
          testID="plan-gap-add"
        />
        <TextLink label={props.elseLabel} onPress={props.onElse} testID="plan-gap-else" />
      </View>
    </Sheet>
  );
}
