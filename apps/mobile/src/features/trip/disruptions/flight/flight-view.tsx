/**
 * The flight-delayed screen (3k-5) from props: the hero, ALREADY DONE, what is still on its way,
 * the questions to the crew, what needs a look, the traveller's own links, TELL THE CREW and
 * Undo everything. A landed or undone disruption keeps its rows and says so; offline, answers
 * queue and a note says they go out later. The lab scenes render it with fixed data.
 */
import type { DisruptionAction } from '@cp/domain';
import { ScrollView, View } from 'react-native';

import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
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

import { footerLabels, sectionTitles, stateLines } from './copy';
import { FlightLinks, FlightRows } from './done-list';
import { FlightHero } from './hero';
import type { FlightModel } from './model';
import { NeedsYesCard } from './needs-yes-card';

export interface FlightViewProps {
  readonly state: 'loading' | 'missing' | 'ready';
  readonly model: FlightModel | null;
  readonly eyebrow: string;
  readonly heroLines: readonly [string, string | null];
  readonly detail: string;
  readonly guide: GuideStickerId;
  readonly guideName: string;
  readonly tz: string;
  readonly offline: boolean;
  readonly joinIndex: (uid: string) => number;
  readonly onAnswer: (actionId: string, decision: 'approve' | 'keep') => void;
  readonly onTellCrew: () => void;
  readonly onUndoAll: () => void;
  readonly onOpenLink: (row: DisruptionAction) => void;
  readonly onBack: () => void;
  readonly telling?: boolean;
}

const EMPTY_STICKER = 120;

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingTop: th.space['20'], gap: th.space['16'] },
  footer: { alignItems: 'center', gap: th.space['12'] },
}));

function Closed({ model }: { readonly model: FlightModel }) {
  const theme = useTheme();
  if (model.status === 'open') return null;
  const lines = stateLines();
  return (
    <Text
      variant="bodySm"
      color={theme.semantic.text.secondary}
      testID={`disruption-${model.status}`}
    >
      {model.status === 'undone' ? lines.undone : lines.resolved}
    </Text>
  );
}

export function FlightView(props: FlightViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { model } = props;
  const lines = stateLines();
  const back = <BackEyebrow label={lines.backTo} onPress={props.onBack} testID="disruption-back" />;
  if (props.state !== 'ready' || model === null) {
    return (
      <Scaffold testID="disruption-screen">
        <Stack gap="16" style={{ padding: theme.size.gutter }}>
          {back}
          {props.state === 'loading' ? (
            <Skeleton preset="card" repeat={2} testID="disruption-loading" />
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
              action={{ label: lines.back, onPress: props.onBack }}
              testID="disruption-missing"
            />
          )}
        </Stack>
      </Scaffold>
    );
  }
  const titles = sectionTitles();
  const footer = footerLabels();
  return (
    <Scaffold variant="dark" edges={[]} testID="disruption-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: theme.space['24'] }}>
        <View
          style={{
            paddingTop: insets.top + theme.space['8'],
            paddingHorizontal: theme.size.gutter,
            backgroundColor: theme.color.pink,
          }}
        >
          <BackEyebrow
            label={lines.backTo}
            onPress={props.onBack}
            color={theme.semantic.text.onAccent}
            testID="disruption-back"
          />
        </View>
        <FlightHero
          eyebrow={props.eyebrow}
          lines={props.heroLines}
          detail={props.detail}
          guide={props.guide}
        />
        <Stack style={styles.body}>
          {props.offline ? <OfflinePill /> : null}
          {props.offline ? (
            <Text
              variant="caption"
              color={theme.semantic.text.secondary}
              testID="disruption-offline"
            >
              {lines.offline}
            </Text>
          ) : null}
          <Closed model={model} />
          <FlightRows title={titles.done} tone="done" rows={model.done} testID="disruption-done" />
          <FlightRows
            title={titles.working}
            tone="working"
            rows={model.working}
            testID="disruption-working"
          />
          {model.questions.map((question) => (
            <NeedsYesCard
              key={question.action.id}
              question={question}
              tz={props.tz}
              joinIndex={props.joinIndex}
              onAnswer={props.onAnswer}
            />
          ))}
          <FlightRows
            title={titles.problem}
            tone="problem"
            rows={model.problems}
            testID="disruption-problems"
          />
          <FlightLinks rows={model.links} onOpen={props.onOpenLink} />
        </Stack>
      </ScrollView>
      {model.canAnnounce || model.canUndo ? (
        <KeyboardFooter style={styles.footer} testID="disruption-footer">
          {model.canAnnounce ? (
            <PillButton
              label={footer.tell}
              block
              loading={props.telling ?? false}
              onPress={props.onTellCrew}
              testID="disruption-tell-crew"
            />
          ) : null}
          {model.canUndo ? (
            <TextLink label={footer.undo} onPress={props.onUndoAll} testID="disruption-undo-all" />
          ) : null}
        </KeyboardFooter>
      ) : null}
    </Scaffold>
  );
}
